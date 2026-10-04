// Terminal tabs backed by server-side PTYs (lib/terms.js) over WebSocket.
// Used by the dashboard drawer and by the standalone /term.html page.
import { Terminal } from "/vendor/xterm.mjs";
import { FitAddon } from "/vendor/addon-fit.mjs";
import { WebLinksAddon } from "/vendor/addon-web-links.mjs";

const THEME = {
  background: "rgba(0,0,0,0)",
  foreground: "#dcd7ee",
  cursor: "#c4b5fd",
  cursorAccent: "#07060d",
  selectionBackground: "rgba(167,139,250,0.3)",
  black: "#1a1730", red: "#ff6b7a", green: "#5eead4", yellow: "#ffb547",
  blue: "#7aa2f7", magenta: "#c4b5fd", cyan: "#7dcfff", white: "#dcd7ee",
  brightBlack: "#5a5474", brightRed: "#ff8c97", brightGreen: "#8bf3e0", brightYellow: "#ffcb7a",
  brightBlue: "#9ab8ff", brightMagenta: "#ddd2ff", brightCyan: "#a6e0ff", brightWhite: "#ffffff",
};

export function createTerminals({ api, host, tabsEl, emptyEl, onCount }) {
  const sessions = new Map(); // id → { info, term, fit, ws, el }
  let active = null;

  function render() {
    tabsEl.innerHTML = "";
    for (const [id, s] of sessions) {
      const tab = document.createElement("div");
      tab.className = `term-tab ${s.info.kind}${id === active ? " on" : ""}${s.exited ? " exited" : ""}`;
      tab.innerHTML = `<i></i><span></span><button class="x" title="Close (ends the process)">×</button>`;
      tab.querySelector("span").textContent = s.info.title;
      tab.addEventListener("click", (e) => (e.target.closest(".x") ? close(id) : show(id)));
      tabsEl.appendChild(tab);
    }
    if (emptyEl) emptyEl.hidden = sessions.size > 0;
    onCount?.(sessions.size);
  }

  function mount(info) {
    const el = document.createElement("div");
    el.className = "term-pane";
    el.hidden = true;
    host.appendChild(el);
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 8000,
      allowTransparency: true,
      macOptionIsMeta: true,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, "_blank", "noopener")));
    term.open(el);
    const s = { info, term, fit, el, ws: null, exited: false };
    const ws = new WebSocket(`ws://${location.host}/ws/term/${info.id}`);
    s.ws = ws;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === "out") term.write(m.d);
      if (m.t === "exit" && !s.exited) {
        s.exited = true;
        term.write("\r\n\x1b[2m[process exited — close this tab or open a new one]\x1b[0m\r\n");
        render();
      }
    };
    ws.onopen = () => {
      if (!el.hidden) refit();
    };
    ws.onclose = (e) => {
      if (e.code === 4404) {
        sessions.delete(info.id);
        el.remove();
        render();
      }
    };
    term.onData((d) => ws.readyState === 1 && ws.send(JSON.stringify({ t: "in", d })));
    term.onResize(({ cols, rows }) => ws.readyState === 1 && ws.send(JSON.stringify({ t: "resize", cols, rows })));
    sessions.set(info.id, s);
  }

  function refit() {
    const s = sessions.get(active);
    if (!s || s.el.hidden || !s.el.offsetWidth) return;
    try {
      s.fit.fit();
    } catch {
      /* not visible yet */
    }
  }

  function show(id) {
    active = id;
    for (const [sid, s] of sessions) s.el.hidden = sid !== id;
    render();
    requestAnimationFrame(() => {
      refit();
      sessions.get(id)?.term.focus();
    });
  }

  async function sync() {
    const list = await api.get("/api/terms");
    for (const info of list) if (!sessions.has(info.id)) mount(info);
    for (const id of [...sessions.keys()]) {
      if (!list.find((t) => t.id === id)) {
        sessions.get(id).el.remove();
        sessions.delete(id);
      }
    }
    if (!sessions.has(active)) active = [...sessions.keys()].pop() || null;
    if (active) show(active);
    else render();
  }

  async function create(kind) {
    const { id } = await api.post("/api/terms", { kind, cols: 120, rows: 30 });
    await sync();
    show(id);
  }

  async function close(id) {
    const s = sessions.get(id);
    if (s && !s.exited && s.info.kind === "claude" && !confirm(`Close ${s.info.title}? The Claude Code session will end.`)) return;
    await api.post(`/api/terms/${id}/kill`, {});
    s?.el.remove();
    sessions.delete(id);
    if (active === id) active = [...sessions.keys()].pop() || null;
    if (active) show(active);
    else render();
  }

  new ResizeObserver(() => refit()).observe(host);
  window.addEventListener("drawer-resize", refit);

  return { sync, create, refit, show, get count() {
    return sessions.size;
  } };
}
