// Agentic OS — local HUD server.
//   GET  /api/config    display settings from agentic-os.config.json (name, title, timezone, skills)
//   GET  /api/snapshot  vault data (deadlines, goals, daily, brief, videos, vitals)
//   GET  /api/status    live Claude state aggregated from hook status files
//   GET  /api/runs      skill runs started from the dashboard
//   POST /api/run       start a skill run: { skill, args?, text?, resume?, model? }
//   POST /api/approvals (from lib/mcp-approve.js, long-poll) · POST /api/approvals/<id> {decision}
//   GET  /api/usage     Claude Code limits (5h / weekly %) + local token totals
//   GET|POST /api/layout  dashboard widget layout (shared by browser + Obsidian)
//   GET|POST /api/terms, POST /api/terms/<id>/kill, WS /ws/term/<id>  terminal drawer
// Binds to 127.0.0.1 only. POSTs need the X-Agentic-OS header and a same-origin
// Origin, so other websites can't drive Claude through it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { config, publicConfig } from "./lib/config.js";
import { VAULT, snapshot } from "./lib/vault.js";
import { usage } from "./lib/usage.js";
import { listTerms, createTerm, killTerm, attach, killAll } from "./lib/terms.js";

const PORT = config.port;
const HOST = "127.0.0.1";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = process.env.AOS_STATE || path.join(process.env.HOME, ".agentic-os");
const STATUS_DIR = path.join(process.env.HOME, ".agentic-os", "status"); // written by hooks/claude-status.py
const RUNS_FILE = path.join(STATE_DIR, "runs.json");
const LAYOUT_FILE = path.join(STATE_DIR, "layout.json");
const CLAUDE = process.env.CLAUDE_BIN || config.claudeBin;

// Tools a dashboard run may use without an approval card. Gmail and Calendar are read-only on purpose;
// anything else (creating events, sending mail, running code) goes through an approval card.
const TOOLS = [
  "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Skill",
  "Bash(python3 .claude/skills/yt/fetch_transcript.py:*)",
  "Bash(date:*)", "Bash(ls:*)", "Bash(find:*)", "Bash(mkdir:*)",
  "mcp__claude_ai_Google_Calendar__list_events", "mcp__claude_ai_Google_Calendar__get_event",
  "mcp__claude_ai_Google_Calendar__list_calendars", "mcp__claude_ai_Google_Calendar__search_events",
  "mcp__claude_ai_Gmail__search_threads", "mcp__claude_ai_Gmail__get_thread",
  "mcp__claude_ai_Gmail__get_message", "mcp__claude_ai_Gmail__list_labels",
  ...config.extraAllowedTools,
];

// Configured skill buttons + two built-ins: YouTube (/yt) and free-form Ask.
const SKILLS = {
  ...Object.fromEntries(config.skills.map((sk) => [sk.id, { label: sk.label, prompt: () => sk.prompt }])),
  yt: {
    label: "YouTube",
    prompt: ({ args = "" }) => {
      const url = (args.match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/) || [])[0];
      if (!url) throw new Error("Paste a YouTube URL");
      return `/yt ${url} ${args.replace(url, "").trim()}`.trim();
    },
  },
  ask: {
    label: "Ask",
    prompt: ({ text = "" }) => {
      if (!text.trim()) throw new Error("Empty prompt");
      return text.trim();
    },
  },
};

fs.mkdirSync(STATUS_DIR, { recursive: true });

// ---------- runs ----------
let runs = [];
try {
  runs = JSON.parse(fs.readFileSync(RUNS_FILE, "utf8")).map((r) =>
    r.status === "running" ? { ...r, status: "error", result: "Server restarted during run" } : r,
  );
} catch {
  /* first start */
}
let saveTimer;
const saveRuns = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(RUNS_FILE, JSON.stringify(runs.slice(0, 30)), () => {}), 500);
};

function toolLine(name, input = {}) {
  const short = name.startsWith("mcp__") ? name.split("__").slice(1).join(" · ").replace("claude_ai_", "") : name;
  const detail =
    input.description || input.command || input.file_path?.split("/").pop() || input.query || input.url ||
    input.skill || input.pattern || "";
  return `${short}${detail ? ` — ${String(detail).slice(0, 90)}` : ""}`;
}

// ---------- approvals ----------
// Tools outside TOOLS don't fail silently: lib/mcp-approve.js (the run's --permission-prompt-tool)
// asks here, the HUD shows a card, and the request is held until the user allows or denies it.
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const approvals = new Map(); // id → { id, run, tool, input, created, resolve, timer }
const runAllow = new Map(); // runId → Set(tool names allowed for the rest of that run)

function requestApproval({ run: runId, tool_name: tool, input }) {
  if (runAllow.get(runId)?.has(tool)) return Promise.resolve({ behavior: "allow" });
  const run = runs.find((r) => r.id === runId);
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2, 10);
    const timer = setTimeout(() => decide(id, "deny", "No answer in the dashboard within 10 minutes."), APPROVAL_TIMEOUT_MS);
    approvals.set(id, { id, run: runId, tool, input: input || {}, created: Date.now(), resolve, timer });
    run?.events.push({ t: Date.now(), kind: "tool", text: `⏸ waiting for your approval — ${toolLine(tool, input || {})}` });
  });
}

function decide(id, decision, message) {
  const a = approvals.get(id);
  if (!a) return false;
  clearTimeout(a.timer);
  approvals.delete(id);
  if (decision === "allow-run") {
    if (!runAllow.has(a.run)) runAllow.set(a.run, new Set());
    runAllow.get(a.run).add(a.tool);
    // Release any other queued requests for the same tool in this run.
    for (const other of [...approvals.values()]) if (other.run === a.run && other.tool === a.tool) decide(other.id, "allow");
  }
  a.resolve(decision === "deny" ? { behavior: "deny", message: message || "The user denied this action in the dashboard." } : { behavior: "allow" });
  return true;
}

function pendingApprovals() {
  return [...approvals.values()].map(({ resolve, timer, ...a }) => {
    const run = runs.find((r) => r.id === a.run);
    return { ...a, runLabel: run?.label || "Run", runPrompt: run?.prompt?.slice(0, 120) || "" };
  });
}

function startRun({ skill, args, text, resume, model }) {
  const def = SKILLS[skill];
  if (!def) throw new Error(`Unknown skill: ${skill}`);
  const prompt = def.prompt({ args, text });
  const prev = resume ? runs.find((r) => r.id === resume) : null;
  const run = {
    id: Date.now().toString(36),
    skill,
    label: def.label,
    prompt,
    model: ["opus", "sonnet", "haiku"].includes(model) ? model : config.defaultModel,
    status: "running",
    started: Date.now(),
    events: [],
    result: "",
    sessionId: null,
  };
  runs.unshift(run);

  const argv = ["-p", prompt, "--output-format", "stream-json", "--verbose",
    "--permission-mode", "acceptEdits", "--model", run.model, "--allowedTools", ...TOOLS,
    "--mcp-config", JSON.stringify({ mcpServers: { aos: { command: process.execPath, args: [path.join(ROOT, "lib/mcp-approve.js")], env: { AOS_RUN: run.id, AOS_PORT: String(PORT) } } } }),
    "--permission-prompt-tool", "mcp__aos__approve"];
  if (prev?.sessionId) argv.push("--resume", prev.sessionId);

  const child = spawn(CLAUDE, argv, { cwd: VAULT, env: { ...process.env, AGENTIC_OS_RUN: run.id } });
  run.pid = child.pid;
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.session_id) run.sessionId = msg.session_id;
      if (msg.type === "assistant") {
        for (const c of msg.message?.content || []) {
          if (c.type === "tool_use") run.events.push({ t: Date.now(), kind: "tool", text: toolLine(c.name, c.input) });
          if (c.type === "text" && c.text.trim()) run.events.push({ t: Date.now(), kind: "text", text: c.text.trim().slice(0, 400) });
        }
        run.events = run.events.slice(-60);
      }
      if (msg.type === "result") {
        run.result = msg.result || "";
        run.status = msg.is_error ? "error" : "done";
        run.cost = msg.total_cost_usd;
      }
      saveRuns();
    }
  });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  child.on("close", (code) => {
    if (run.status === "running") {
      run.status = code === 0 ? "done" : "error";
      if (!run.result) run.result = err.split("\n").filter((l) => !l.includes("Ignoring")).join("\n").trim().slice(-1500);
    }
    run.ended = Date.now();
    for (const a of [...approvals.values()]) if (a.run === run.id) decide(a.id, "deny", "Run ended.");
    runAllow.delete(run.id);
    saveRuns();
  });
  saveRuns();
  return run;
}

// ---------- live Claude status ----------
const STALE_WORKING_MS = 10 * 60 * 1000;
function status() {
  const now = Date.now();
  const sessions = [];
  for (const f of fs.readdirSync(STATUS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(STATUS_DIR, f);
    let s;
    try {
      s = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    const age = now - s.ts * 1000;
    if (s.state !== "idle" && age > STALE_WORKING_MS) s.state = "idle"; // crashed / killed session
    if (s.state === "idle" && age > 24 * 3600e3) {
      fs.rm(p, () => {});
      continue;
    }
    sessions.push({ ...s, age });
  }
  sessions.sort((a, b) => a.age - b.age);
  const active = sessions.filter((s) => s.state !== "idle");
  const waiting = active.find((s) => s.state === "waiting");
  const working = active.find((s) => s.state === "working");
  const pending = pendingApprovals();
  const approvalLead = pending.length
    ? { state: "waiting", activity: "Needs your approval", detail: toolLine(pending[0].tool, pending[0].input), project: "dashboard", prompt: pending[0].runPrompt, age: 0 }
    : null;
  const lead = approvalLead || waiting || working || sessions[0] || null;
  return {
    state: pending.length || waiting ? "waiting" : working ? "working" : "idle",
    approvals: pending,
    lead,
    active: active.length,
    sessions: sessions.slice(0, 8),
    runsActive: runs.filter((r) => r.status === "running").length,
  };
}

// ---------- http ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const sameOrigin = (origin) => !!origin && ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, ""));
const VENDOR = {
  "/vendor/marked.esm.js": "node_modules/marked/lib/marked.esm.js",
  "/vendor/xterm.mjs": "node_modules/@xterm/xterm/lib/xterm.mjs",
  "/vendor/xterm.css": "node_modules/@xterm/xterm/css/xterm.css",
  "/vendor/addon-fit.mjs": "node_modules/@xterm/addon-fit/lib/addon-fit.mjs",
  "/vendor/addon-web-links.mjs": "node_modules/@xterm/addon-web-links/lib/addon-web-links.mjs",
};

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: "not found" });
    const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" };
    if (file.endsWith(".html")) {
      headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        `font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:${PORT} ws://localhost:${PORT}`;
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > limit) {
        req.destroy();
        reject(new Error("too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function handlePost(req, res, url) {
  const body = await readBody(req);
  if (url.pathname === "/api/run") return send(res, 200, { id: startRun(body).id });
  if (url.pathname === "/api/approvals") return send(res, 200, await requestApproval(body)); // held until decided
  const ap = url.pathname.match(/^\/api\/approvals\/([a-z0-9]+)$/);
  if (ap) {
    const d = ["allow", "allow-run", "deny"].includes(body.decision) ? body.decision : "deny";
    return send(res, 200, { ok: decide(ap[1], d) });
  }
  if (url.pathname === "/api/layout") {
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify(body));
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/api/terms") {
    const kind = body.kind === "claude" ? "claude" : "shell";
    return send(res, 200, createTerm({ kind, cwd: VAULT, cols: body.cols, rows: body.rows }));
  }
  const kill = url.pathname.match(/^\/api\/terms\/([a-z0-9]+)\/kill$/);
  if (kill) return send(res, 200, { ok: killTerm(kill[1]) });
  send(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
  if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, { error: "bad host" });
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST") {
    if (req.headers["x-agentic-os"] !== "1" || (req.headers.origin && !sameOrigin(req.headers.origin))) {
      return send(res, 403, { error: "forbidden" });
    }
    handlePost(req, res, url).catch((e) => send(res, 400, { error: e.message }));
    return;
  }

  if (url.pathname === "/api/config") return send(res, 200, publicConfig());
  if (url.pathname === "/api/snapshot") return send(res, 200, snapshot());
  if (url.pathname === "/api/status") return send(res, 200, status());
  if (url.pathname === "/api/runs") return send(res, 200, runs.slice(0, 15).map(({ pid, ...r }) => r));
  if (url.pathname === "/api/usage") return send(res, 200, usage());
  if (url.pathname === "/api/terms") return send(res, 200, listTerms());
  if (url.pathname === "/api/layout") {
    try {
      return send(res, 200, JSON.parse(fs.readFileSync(LAYOUT_FILE, "utf8")));
    } catch {
      return send(res, 200, null);
    }
  }

  if (url.pathname.startsWith("/vendor/three/")) {
    return serveFile(res, path.join(ROOT, "node_modules/three/build", path.basename(url.pathname)));
  }
  if (VENDOR[url.pathname]) return serveFile(res, path.join(ROOT, VENDOR[url.pathname]));
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = path.normalize(path.join(ROOT, "public", rel));
  if (!file.startsWith(path.join(ROOT, "public"))) return send(res, 403, { error: "forbidden" });
  serveFile(res, file);
});

// Terminals over WebSocket. A shell is the most powerful thing this server exposes,
// so the upgrade requires our exact Host *and* a same-origin Origin header (browsers
// always send Origin on WebSocket handshakes, and other sites can't forge it).
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const m = req.url.match(/^\/ws\/term\/([a-z0-9]+)$/);
  if (!m || !ALLOWED_HOSTS.has(req.headers.host) || !sameOrigin(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => attach(m[1], ws));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    killAll();
    process.exit(0);
  });
}

server.listen(PORT, HOST, () => console.log(`Agentic OS → http://${HOST}:${PORT}  (vault: ${VAULT})`));
