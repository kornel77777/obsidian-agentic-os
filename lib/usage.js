// Claude Code usage for the HUD header:
//  - subscription limits (5-hour / weekly %) captured by hooks/statusline.py
//  - token totals tallied from local transcripts in ~/.claude/projects (incremental)
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const HOME = process.env.HOME;
const PROJECTS = path.join(HOME, ".claude/projects");
const LIMITS = path.join(HOME, ".agentic-os/limits.json");
const WEEK_MS = 7 * 864e5;

// file → { size, offset, partial, entries: Map<msgId, entry> }
const cache = new Map();

function listTranscripts(dir, depth = 0, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 3) listTranscripts(p, depth + 1, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

function ingest(file, stat) {
  let c = cache.get(file);
  if (!c || stat.size < c.size) c = { size: 0, offset: 0, partial: "", entries: new Map() };
  if (stat.size === c.size) return c;
  const fd = fs.openSync(file, "r");
  try {
    const len = stat.size - c.offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, c.offset);
    const text = c.partial + buf.toString("utf8");
    const lines = text.split("\n");
    c.partial = lines.pop();
    for (const line of lines) {
      if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      const m = j.message;
      const u = m?.usage;
      if (!u || !j.timestamp) continue;
      c.entries.set(m.id || j.uuid, {
        t: Date.parse(j.timestamp),
        model: m.model || "unknown",
        input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        cacheRead: u.cache_read_input_tokens || 0,
        output: u.output_tokens || 0,
      });
    }
    c.offset = stat.size;
    c.size = stat.size;
  } finally {
    fs.closeSync(fd);
  }
  cache.set(file, c);
  return c;
}

function tally(entries, from) {
  const t = { input: 0, output: 0, cacheRead: 0, messages: 0, byModel: {} };
  for (const e of entries) {
    if (e.t < from) continue;
    t.input += e.input;
    t.output += e.output;
    t.cacheRead += e.cacheRead;
    t.messages++;
    const k = e.model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
    t.byModel[k] = (t.byModel[k] || 0) + e.input + e.output;
  }
  t.total = t.input + t.output;
  return t;
}

function startOfToday(now) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(now);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, timeZoneName: "longOffset" })
    .formatToParts(now).find((p) => p.type === "timeZoneName").value.replace("GMT", "") || "+00:00";
  return Date.parse(`${d}T00:00:00${offset}`);
}

export function usage() {
  const now = Date.now();
  let limits = {};
  try {
    limits = JSON.parse(fs.readFileSync(LIMITS, "utf8"));
  } catch {
    /* no interactive session has reported yet */
  }

  const all = [];
  for (const file of listTranscripts(PROJECTS)) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (now - stat.mtimeMs > WEEK_MS + 864e5) continue;
    for (const e of ingest(file, stat).entries.values()) all.push(e);
  }

  const rl = limits.rate_limits || {};
  const win = (w, span) => {
    if (!w) return null;
    const resetsAt = w.resets_at * 1000;
    if (resetsAt < now) return { pct: 0, resetsAt: null, expired: true };
    return { pct: w.used_percentage, resetsAt, start: resetsAt - span };
  };
  const five = win(rl.five_hour, 5 * 3600e3);
  const seven = win(rl.seven_day, WEEK_MS);

  // 24 hourly buckets of tokens for a sparkline
  const hours = new Array(24).fill(0);
  for (const e of all) {
    const age = Math.floor((now - e.t) / 3600e3);
    if (age >= 0 && age < 24) hours[23 - age] += e.input + e.output;
  }

  return {
    limits: {
      fiveHour: five,
      sevenDay: seven,
      asOf: limits.limits_ts ? limits.limits_ts * 1000 : null,
      model: limits.model || null,
      contextPct: limits.context_pct ?? null,
      contextAt: limits.ts ? limits.ts * 1000 : null,
    },
    tokens: {
      window: tally(all, five?.start || now - 5 * 3600e3),
      today: tally(all, startOfToday(new Date(now))),
      week: tally(all, seven?.start || now - WEEK_MS),
      hours,
    },
  };
}
