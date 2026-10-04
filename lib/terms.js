// Persistent PTY sessions for the HUD's terminal drawer.
// A terminal outlives the page: reloading the dashboard re-attaches and replays scrollback.
import pty from "node-pty";

const MAX_SCROLLBACK = 400_000; // chars kept for replay on re-attach
const SHELL = process.env.SHELL || "/bin/zsh";
const terms = new Map(); // id → { id, kind, title, pty, buf, clients:Set<ws>, exited, created }

export function listTerms() {
  return [...terms.values()].map(({ id, kind, title, exited, created }) => ({ id, kind, title, exited, created }));
}

export function createTerm({ kind = "shell", cwd, cols = 100, rows = 30 }) {
  const id = Math.random().toString(36).slice(2, 10);
  // Login shell so PATH/aliases match the user's Terminal; `claude` falls back to a shell when it exits.
  const args = kind === "claude" ? ["-l", "-c", "claude; exec $SHELL -l"] : ["-l"];
  const { AGENTIC_OS_RUN, ...env } = process.env;
  const p = pty.spawn(SHELL, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "AgenticOS" },
  });
  const n = [...terms.values()].filter((t) => t.kind === kind).length + 1;
  const t = {
    id,
    kind,
    title: kind === "claude" ? `Claude ${n}` : `Shell ${n}`,
    pty: p,
    buf: "",
    clients: new Set(),
    exited: false,
    created: Date.now(),
  };
  p.onData((d) => {
    t.buf += d;
    if (t.buf.length > MAX_SCROLLBACK) t.buf = t.buf.slice(-MAX_SCROLLBACK);
    for (const ws of t.clients) if (ws.readyState === 1) ws.send(JSON.stringify({ t: "out", d }));
  });
  p.onExit(({ exitCode }) => {
    t.exited = true;
    for (const ws of t.clients) if (ws.readyState === 1) ws.send(JSON.stringify({ t: "exit", code: exitCode }));
  });
  terms.set(id, t);
  return { id, kind, title: t.title };
}

export function killTerm(id) {
  const t = terms.get(id);
  if (!t) return false;
  try {
    if (!t.exited) t.pty.kill();
  } catch {
    /* already gone */
  }
  for (const ws of t.clients) ws.close();
  terms.delete(id);
  return true;
}

export function attach(id, ws) {
  const t = terms.get(id);
  if (!t) {
    ws.close(4404, "no such terminal");
    return;
  }
  t.clients.add(ws);
  ws.send(JSON.stringify({ t: "out", d: t.buf }));
  if (t.exited) ws.send(JSON.stringify({ t: "exit" }));
  ws.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (t.exited) return;
    if (m.t === "in" && typeof m.d === "string") t.pty.write(m.d);
    if (m.t === "resize" && m.cols > 0 && m.rows > 0) t.pty.resize(Math.min(m.cols, 500), Math.min(m.rows, 200));
  });
  ws.on("close", () => t.clients.delete(ws));
}

export function killAll() {
  for (const id of [...terms.keys()]) killTerm(id);
}
