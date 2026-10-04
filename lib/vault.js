// Reads the Obsidian vault into the JSON the dashboard renders. Read-only.
// Conventions (all paths configurable in agentic-os.config.json):
//   deadlines  — a markdown table in paths.deadlines (first column YYYY-MM-DD) and/or
//                notes in deadlineFolders with `due: YYYY-MM-DD` frontmatter
//   goals      — `## …` sections of checkboxes in paths.goals
//   daily note — `## Today` / `## Notes / capture` sections of paths.daily/YYYY-MM-DD.md
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { safeMarked } from "../public/md-safe.js";
import { config } from "./config.js";

safeMarked(marked);

export const VAULT = config.vault;
const P = config.paths;
const VAULT_NAME = encodeURIComponent(config.vaultName);
const obsidianLink = (rel) => `obsidian://open?vault=${VAULT_NAME}&file=${encodeURIComponent(rel)}`;

const read = (rel) => {
  try {
    return fs.readFileSync(path.join(VAULT, rel), "utf8");
  } catch {
    return "";
  }
};

const list = (rel, ext = ".md") => {
  try {
    return fs.readdirSync(path.join(VAULT, rel)).filter((f) => f.endsWith(ext)).sort();
  } catch {
    return [];
  }
};

export function todayISO(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(d);
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

// Obsidian markdown → plain inline text: [[a|b]] → b, **x** → x, etc.
export function plain(md) {
  return md
    .replace(/\[\[([^\]|]+)\\?\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => t.split("/").pop())
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|__|==|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function section(text, heading) {
  const re = new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "m");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

// Obsidian-flavoured markdown → HTML, with wikilinks turned into obsidian:// links.
export function renderMd(md) {
  const linked = md.replace(/\[\[([^\]|]+)(?:\\?\|([^\]]+))?\]\]/g, (_, target, label) => `[${label || target.split("/").pop()}](${obsidianLink(target)})`);
  return marked.parse(linked, { gfm: true, breaks: false });
}

function walk(dir, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

export function deadlines(today = todayISO(), limit = 8) {
  const items = [];

  // 1. Table rows in the deadlines note: | 2026-10-20 | What | Tag |   (🔴 anywhere = critical)
  for (const line of read(P.deadlines).split("\n")) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})([^|]*)\|\s*([^|]+)\|?\s*([^|]*)\|?/);
    if (!m) continue;
    items.push({
      date: m[1],
      time: m[2].trim(),
      text: plain(m[3].replace(/🔴/g, "")),
      source: plain(m[4] || "") || "deadlines",
      critical: line.includes("🔴"),
    });
  }

  // 2. Notes with `due:` frontmatter that aren't finished
  for (const folder of config.deadlineFolders) {
    for (const file of walk(path.join(VAULT, folder))) {
      const fm = frontmatter(fs.readFileSync(file, "utf8"));
      if (!/^\d{4}-\d{2}-\d{2}/.test(fm.due || "")) continue;
      if (/done|archived|submitted/i.test(fm.status || "")) continue;
      items.push({
        date: fm.due.slice(0, 10),
        text: path.basename(file, ".md"),
        source: fm.course || fm.project || folder,
        critical: /true|yes|high/i.test(fm.critical || fm.priority || ""),
        link: obsidianLink(path.relative(VAULT, file)),
      });
    }
  }

  const t0 = new Date(`${today}T00:00:00`);
  return items
    .filter((i) => i.date >= today)
    .map((i) => ({ ...i, days: Math.round((new Date(`${i.date}T00:00:00`) - t0) / 864e5) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export function goals() {
  const text = read(P.goals);
  const fm = frontmatter(text);
  const out = [];
  for (const m of text.matchAll(/^##\s+(.+)$/gm)) {
    const name = m[1];
    const body = section(text, name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const items = [...body.matchAll(/^- \[( |x)\] (.+)$/gm)].map((x) => ({ done: x[1] === "x", text: plain(x[2]) }));
    if (items.length) out.push({ name, items });
  }
  return { updated: fm.updated || null, sections: out };
}

export function daily(today = todayISO()) {
  const rel = `${P.daily}/${today}.md`;
  const text = read(rel);
  const todaySec = section(text, "Today");
  const empty = !todaySec || /^-\s*$/.test(todaySec);
  return {
    exists: !!text,
    planned: !empty,
    todayHtml: empty ? "" : renderMd(todaySec),
    captureHtml: renderMd(section(text, "Notes / capture").replace(/^-\s*$/m, "")),
    link: obsidianLink(rel),
  };
}

export function latestBrief() {
  const files = list(P.briefs);
  if (!files.length) return null;
  const file = files[files.length - 1];
  const text = read(`${P.briefs}/${file}`);
  const top = section(text, "⚡ Top 5") || section(text, "Top 5");
  const items = [...top.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => {
    const line = m[1];
    const head = line.match(/\*\*(.+?)\*\*/);
    const src = line.match(/\]\((https?:[^)]+)\)/);
    return { headline: plain(head ? head[1] : line).replace(/\.$/, ""), url: src ? src[1] : null };
  });
  return { file, date: frontmatter(text).date || file.slice(0, 10), items, link: obsidianLink(`${P.briefs}/${file}`) };
}

export function videos(limit = 4) {
  return list(P.videos)
    .reverse()
    .slice(0, limit)
    .map((file) => {
      const text = read(`${P.videos}/${file}`);
      const fm = frontmatter(text);
      const tldr = (text.match(/>\s*\[!summary\][^\n]*\n((?:>.*\n?)+)/) || [])[1] || "";
      return {
        title: (text.match(/^#\s+(.+)$/m) || [])[1] || fm.title || file,
        channel: fm.channel,
        url: fm.url,
        lang: fm.lang,
        tldr: plain(tldr.replace(/^>\s?/gm, "")).slice(0, 220),
        link: obsidianLink(`${P.videos}/${file}`),
      };
    });
}

// Counts + a 14-day "notes touched" sparkline.
export function vitals(today = todayISO()) {
  const t0 = new Date(`${today}T00:00:00`).getTime();
  const perDay = new Array(14).fill(0);
  let notes = 0;
  let week = 0;
  for (const p of walk(VAULT)) {
    if (p.includes(`${path.sep}_transcripts${path.sep}`) || p.includes(`${path.sep}_Templates${path.sep}`)) continue;
    notes++;
    const age = Math.floor((t0 + 864e5 - fs.statSync(p).mtimeMs) / 864e5);
    if (age >= 0 && age < 14) perDay[13 - age]++;
    if (age >= 0 && age < 7) week++;
  }
  const iso = (d) => new Intl.DateTimeFormat("en-CA").format(d);
  const dailies = new Set(list(P.daily).map((f) => f.slice(0, 10)));
  let streak = 0;
  for (let d = new Date(`${today}T12:00:00`); dailies.has(iso(d)); d.setDate(d.getDate() - 1)) streak++;
  return {
    notes,
    week,
    concepts: list(P.concepts).filter((f) => !/_Home\.md$|README\.md$/.test(f)).length,
    videos: list(P.videos).length,
    sessions: list(P.sessions).filter((f) => f !== "README.md").length,
    streak,
    perDay,
  };
}

export function snapshot() {
  const today = todayISO();
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch (e) {
      console.error(e);
      return fallback;
    }
  };
  return {
    today,
    deadlines: safe(() => deadlines(today), []),
    goals: safe(goals, { sections: [] }),
    daily: safe(() => daily(today), {}),
    brief: safe(latestBrief, null),
    videos: safe(videos, []),
    vitals: safe(() => vitals(today), {}),
  };
}
