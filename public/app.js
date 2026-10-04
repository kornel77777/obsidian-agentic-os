import { createOrb } from "/orb.js";
import { marked } from "/vendor/marked.esm.js";
import { safeMarked, esc } from "/md-safe.js";
import { initLayout } from "/layout.js";
import { createTerminals } from "/terminal.js";

safeMarked(marked);
const $ = (id) => document.getElementById(id);

// ---------- api ----------
const api = {
  get: (p) => fetch(p, { cache: "no-store" }).then((r) => r.json()),
  post: (p, body) =>
    fetch(p, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agentic-OS": "1" },
      body: JSON.stringify(body),
    }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      return j;
    }),
};

// ---------- config (name, title, timezone, skills) ----------
const cfg = await api.get("/api/config");
const TZ = cfg.timezone;
const CITY = TZ.split("/").pop().replace(/_/g, " ").toUpperCase();
document.title = cfg.title.replace(/&nbsp;/g, " ");
$("brand-title").textContent = cfg.title;
$("brand-sub").textContent = cfg.name ? `${cfg.name} · command center` : "command center";
$("vault-name").textContent = cfg.vaultName;
$("ask-model").value = cfg.defaultModel;
$("skills").innerHTML = cfg.skills
  .map((sk) => `<button data-skill="${esc(sk.id)}"><span>${esc(sk.label)}</span><em>→</em></button>`)
  .join("");
$("cmd-chips").innerHTML = [...cfg.skills.map((sk) => sk.prompt), "/yt "]
  .filter((p, i, a) => a.indexOf(p) === i)
  .map((p) => `<button type="button" data-insert="${esc(p.endsWith(" ") ? p : `${p}`)}">${esc(p.trim())}</button>`)
  .join("");

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = `toast${err ? " err" : ""}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

const fmtTime = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(ms);
const fmtDayTime = (ms) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
function fmtIn(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m >= 2880) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}
function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

// ---------- layout (async: widgets, gutters, sizes) ----------
const layoutReady = initLayout(api);

// ---------- orb ----------
const orb = createOrb($("orb"));
let override = "auto";
let liveState = "idle";
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  override = b.dataset.state;
  for (const x of $("chips").children) x.classList.toggle("on", x === b);
  orb.setState(override === "auto" ? liveState : override);
});
let frozen = false;
$("pause").addEventListener("click", () => {
  frozen = !frozen;
  orb.setFrozen(frozen);
  $("pause").textContent = frozen ? "Resume motion" : "Pause motion";
});

// ---------- dock tabs ----------
function showTab(name) {
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.tab === name);
  for (const el of document.querySelectorAll(".tab-body")) el.hidden = el.dataset.body !== name;
  for (const el of document.querySelectorAll(".tabs small")) el.hidden = el.dataset.for !== name;
  try {
    localStorage.setItem("aos-tab", name);
  } catch {
    /* storage unavailable */
  }
}
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) showTab(b.dataset.tab);
});
try {
  const t = localStorage.getItem("aos-tab");
  showTab(t && t !== "reply" ? t : "today");
} catch {
  showTab("today");
}

// ---------- clock ----------
function tick() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  $("hhmm").textContent = `${parts.hour}:${parts.minute}`;
  $("ss").textContent = `:${parts.second}`;
  $("date").textContent = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "2-digit" })
    .format(now).replace(",", " ·").toUpperCase() + ` · ${CITY}`;
}
tick();
setInterval(tick, 1000);

// ---------- usage meters ----------
function meter(el, pct, sub, { stale = false, title = "" } = {}) {
  el.classList.toggle("warn", pct != null && pct >= 70 && pct < 90);
  el.classList.toggle("crit", pct != null && pct >= 90);
  el.classList.toggle("stale", stale);
  el.querySelector(".pct").textContent = pct == null ? "—" : `${Math.round(pct)}%`;
  el.querySelector(".bar i").style.width = `${Math.min(100, pct || 0)}%`;
  el.querySelector(".ms").textContent = sub;
  el.title = title;
}

async function pollUsage() {
  try {
    const u = await api.get("/api/usage");
    const now = Date.now();
    const { fiveHour, sevenDay, asOf } = u.limits;
    const stale = !!asOf && now - asOf > 30 * 60e3;
    const asOfTxt = asOf ? `Reported by Claude Code at ${fmtTime(asOf)}` : "Open Claude Code (terminal below) to sync limits";
    if (fiveHour) {
      meter($("m5"), fiveHour.pct, fiveHour.expired ? "window reset · idle" : `resets ${fmtTime(fiveHour.resetsAt)} · in ${fmtIn(fiveHour.resetsAt - now)}`, { stale, title: asOfTxt });
    } else {
      meter($("m5"), null, "open Claude Code to sync", { title: asOfTxt });
    }
    if (sevenDay) {
      meter($("m7"), sevenDay.pct, sevenDay.expired ? "week reset" : `resets ${fmtDayTime(sevenDay.resetsAt)} · in ${fmtIn(sevenDay.resetsAt - now)}`, { stale, title: asOfTxt });
    } else {
      meter($("m7"), null, "—", { title: asOfTxt });
    }
    const t = u.tokens;
    const mt = $("mt");
    mt.querySelector(".pct").textContent = fmtTokens(t.today.total);
    mt.querySelector(".ms").textContent = `5h ${fmtTokens(t.window.total)} · 7d ${fmtTokens(t.week.total)} · ${t.today.messages} msgs`;
    mt.title = Object.entries(t.today.byModel).map(([m, n]) => `${m}: ${fmtTokens(n)}`).join("\n") +
      `\n(input + output today; cache reads ${fmtTokens(t.today.cacheRead)} not counted)`;
    const max = Math.max(1, ...t.hours);
    mt.querySelector(".uspark").innerHTML = t.hours
      .map((v, i) => `<rect x="${i * 5}" y="${16 - (v / max) * 15}" width="3.4" height="${Math.max(0.6, (v / max) * 15)}" rx="0.8" fill="#a78bfa" opacity="${0.35 + 0.65 * (v / max)}"/>`)
      .join("");
  } catch {
    /* server restarting */
  }
}
pollUsage();
setInterval(pollUsage, 15000);

// ---------- approval cards ----------
const prettyTool = (name) =>
  name.startsWith("mcp__") ? name.split("__").slice(1).join(" · ").replace("claude_ai_", "").replace(/_/g, " ") : name;
const RISKY = /send|reply|forward|delete|trash|remove|spam|share|respond/i;

function approvalFields(input) {
  const rows = [];
  const val = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (v.dateTime || v.date) return `${v.dateTime || v.date}${v.timeZone ? ` (${v.timeZone})` : ""}`;
    return JSON.stringify(v);
  };
  for (const [k, v] of Object.entries(input || {})) {
    if (k === "attendees") continue;
    const text = val(v);
    if (text) rows.push([k, text.length > 220 ? `${text.slice(0, 220)}…` : text]);
  }
  return rows.slice(0, 8);
}

let approvalSig = null;
function renderApprovals(list) {
  const sig = list.map((a) => a.id).join(",");
  if (sig === approvalSig) return;
  approvalSig = sig;
  const box = $("approvals");
  const shown = list.slice(0, 2);
  box.innerHTML = shown
    .map((a) => {
      const attendees = (a.input?.attendees || []).map((x) => (typeof x === "string" ? x : x.email)).filter(Boolean);
      const warn = attendees.length
        ? `⚠ Sends invitations to: ${attendees.join(", ")}`
        : RISKY.test(a.tool) ? "⚠ This acts outside your vault (sends, deletes, or shares something)." : "";
      return `<div class="approval" data-id="${a.id}">
        <div class="ah"><span>Approval needed</span><small>${esc(a.runLabel)} · ${esc(a.runPrompt)}</small></div>
        <div class="at">${esc(prettyTool(a.tool))}</div>
        <dl>${approvalFields(a.input).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        ${warn ? `<p class="warn">${esc(warn)}</p>` : ""}
        <div class="acts">
          <button class="deny" data-decision="deny">Deny</button>
          <button class="allow-run" data-decision="allow-run" title="Allow every ${esc(prettyTool(a.tool))} call for the rest of this run">Allow all for this run</button>
          <button class="allow" data-decision="allow">Allow</button>
        </div></div>`;
    })
    .join("") + (list.length > shown.length ? `<div class="approval-more">+${list.length - shown.length} more waiting</div>` : "");
}
$("approvals").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-decision]");
  if (!b) return;
  const card = b.closest(".approval");
  card.style.opacity = "0.4";
  await api.post(`/api/approvals/${card.dataset.id}`, { decision: b.dataset.decision }).catch(() => {});
  approvalSig = null;
  pollStatus();
});

// ---------- live status ----------
async function pollStatus() {
  try {
    const s = await api.get("/api/status");
    liveState = s.state;
    renderApprovals(s.approvals || []);
    if (override === "auto") orb.setState(liveState);
    const shown = override === "auto" ? liveState : override;
    document.body.classList.toggle("is-working", shown === "working");
    document.body.classList.toggle("is-waiting", shown === "waiting");
    const lead = s.lead;
    const act = $("activity");
    act.className = `activity ${s.state}`;
    if (s.state === "idle") {
      act.innerHTML = lead ? `Ready · idle <span style="color:var(--faint)">· last active ${ago(lead.age)} ago in ${esc(lead.project)}</span>` : "Ready · idle";
      $("prompt-line").textContent = "";
    } else {
      act.innerHTML = `<b>${esc(lead.activity)}</b>${lead.detail ? ` · ${esc(lead.detail)}` : ""} · ${esc(lead.project)}`;
      $("prompt-line").textContent = lead.prompt ? `“${lead.prompt}”` : "";
    }
    $("sessions").innerHTML = s.sessions
      .filter((x) => x.state !== "idle" || x.age < 30 * 60e3)
      .map((x) => `<li class="${x.state}" title="${esc(x.cwd)}"><i></i>${esc(x.project)} · ${x.state === "idle" ? `idle ${ago(x.age)}` : esc(x.activity)}</li>`)
      .join("");
  } catch {
    $("activity").textContent = "Server offline";
  }
}
pollStatus();
setInterval(pollStatus, 1000);

// ---------- vault snapshot ----------
function renderDeadlines(list) {
  const [next, ...rest] = list;
  const box = $("next-deadline");
  if (!next) {
    box.innerHTML = `<span class="empty">Nothing scheduled</span>`;
    $("deadlines").innerHTML = "";
    return;
  }
  box.className = `next${next.critical ? " critical" : ""}`;
  box.innerHTML = `<div class="big">${next.days}</div>
    <div><div class="unit">${next.days === 0 ? "today" : next.days === 1 ? "day left" : "days left"} · ${esc(next.date.slice(5))}${next.time ? ` ${esc(next.time)}` : ""}</div>
    <div class="what">${esc(next.text)}</div></div>`;
  $("deadlines").innerHTML = rest
    .map((d) => `<li class="${d.critical ? "crit" : ""}"><span class="d">${d.days}d</span><span><span class="t">${esc(d.text)}</span> <span class="src">${esc(d.source)} · ${esc(d.date.slice(5))}</span></span></li>`)
    .join("");
}

function renderVitals(v) {
  const cells = [[v.notes, "notes"], [v.week, "this week"], [v.concepts, "concepts"], [v.videos, "videos"], [v.sessions, "sessions"], [v.streak, "day streak"]];
  $("vitals").innerHTML = cells.map(([n, l]) => `<div class="vital"><div class="n">${n ?? "–"}</div><div class="l">${l}</div></div>`).join("");
  const data = v.perDay || [];
  const max = Math.max(1, ...data);
  const W = 280, H = 46, step = W / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [i * step, H - 6 - (d / max) * (H - 12)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const last = pts[pts.length - 1] || [0, H];
  $("spark").innerHTML = `
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a78bfa" stop-opacity="0.35"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${W},${H}L0,${H}Z" fill="url(#sg)"/>
    <path d="${line}" fill="none" stroke="#a78bfa" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#c4b5fd"/>`;
}

function renderGoals(g) {
  const updated = g.updated ? Math.round((Date.now() - new Date(g.updated)) / 864e5) : null;
  const sub = $("goals-sub");
  sub.textContent = updated == null ? "goals" : `updated ${updated}d ago`;
  sub.classList.toggle("stale", updated != null && updated > 14);
  $("goals").innerHTML = g.sections
    .map((s) => `<li class="sec">${esc(s.name)}</li>` + s.items.map((i) => `<li class="${i.done ? "done" : ""}">${esc(i.text)}</li>`).join(""))
    .join("");
}

function renderToday(snap) {
  const d = snap.daily || {};
  $("today-sub").innerHTML = d.link ? `<a href="${esc(d.link)}">open daily note ↗</a>` : "";
  let html = d.planned ? d.todayHtml : "";
  if (!d.planned) html = `<p class="empty">No plan yet — type <strong>/plan-today</strong> above.</p>`;
  if (d.captureHtml && d.captureHtml.trim()) html += `<h3>Captured</h3>${d.captureHtml}`;
  $("today").innerHTML = html;
}

function renderBrief(b) {
  $("brief-sub").innerHTML = b ? `<a href="${esc(b.link)}">${esc(b.date)} ↗</a>` : "";
  $("brief").innerHTML = b?.items?.length
    ? b.items.map((i) => `<li>${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.headline)}</a>` : esc(i.headline)}</li>`).join("")
    : `<li class="empty" style="list-style:none">No brief yet — type <strong>/news</strong> above.</li>`;
}

function renderVideos(list) {
  $("videos").innerHTML = list.length
    ? list.map((v) => `<li><a class="vt" href="${esc(v.link)}">${esc(v.title)}</a><div class="vm">${esc(v.channel || "")}${v.lang ? ` · ${esc(v.lang)}` : ""}${v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">watch ↗</a>` : ""}</div><div class="vd">${esc(v.tldr)}</div></li>`).join("")
    : `<li class="empty">Paste a link into YouTube → Analyze.</li>`;
}

async function pollSnapshot() {
  try {
    const s = await api.get("/api/snapshot");
    renderDeadlines(s.deadlines);
    renderVitals(s.vitals);
    renderGoals(s.goals);
    renderToday(s);
    renderBrief(s.brief);
    renderVideos(s.videos);
  } catch {
    /* server restarting */
  }
}
pollSnapshot();
setInterval(pollSnapshot, 30000);

// ---------- runs + reply ----------
const open = new Set();
let lastRuns = [];
let replyId = null;
try {
  replyId = localStorage.getItem("aos-reply"); // keep the Reply conversation across reloads
} catch {
  /* storage unavailable */
}

function renderReply(runs) {
  const r = runs.find((x) => x.id === replyId);
  const tab = document.querySelector('.tabs [data-tab="reply"]');
  if (!r) return;
  tab.hidden = false;
  tab.classList.toggle("live", r.status === "running");
  const events = r.status === "running" || !r.result ? r.events.slice(-6) : [];
  const secs = Math.round(((r.ended || Date.now()) - r.started) / 1000);
  $("reply").innerHTML = `<div class="q">${esc(r.prompt)}</div>
    ${events.map((e) => `<p class="ev ${e.kind}">${esc(e.text)}</p>`).join("")}
    ${r.result ? `<div class="md">${marked.parse(r.result)}</div>` : ""}
    <div class="meta">${r.status === "running" ? `working… ${secs}s` : `${r.status} · ${secs}s · ${esc(r.model)}`}</div>`;
}

function renderRuns(runs) {
  $("runs").innerHTML = runs.length
    ? runs
        .map((r) => {
          const secs = Math.round(((r.ended || Date.now()) - r.started) / 1000);
          const events = r.status === "running" || !r.result ? r.events.slice(-8) : [];
          return `<li class="${r.status}"><details data-id="${r.id}"${open.has(r.id) ? " open" : ""}>
            <summary><i></i><span>${esc(r.label)}${r.skill === "ask" || r.skill === "yt" ? ` · ${esc(r.prompt.slice(0, 60))}` : ""}</span><small>${r.status === "running" ? `${secs}s` : new Date(r.started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></summary>
            <div class="run-body">
              ${events.map((e) => `<p class="ev ${e.kind}">${esc(e.text)}</p>`).join("")}
              ${r.result ? `<div class="result md">${marked.parse(r.result)}</div>` : ""}
            </div></details></li>`;
        })
        .join("")
    : `<li class="empty">Nothing yet. Ask above or press a skill.</li>`;
  for (const d of $("runs").querySelectorAll("details")) {
    d.addEventListener("toggle", () => (d.open ? open.add(d.dataset.id) : open.delete(d.dataset.id)));
  }
  const busy = new Set(runs.filter((r) => r.status === "running").map((r) => r.skill));
  for (const b of document.querySelectorAll(".skills button")) b.classList.toggle("busy", busy.has(b.dataset.skill));
}

async function pollRuns() {
  try {
    const runs = await api.get("/api/runs");
    const finished = runs.some((r) => r.status !== "running" && lastRuns.find((x) => x.id === r.id && x.status === "running"));
    const sig = (rs) => JSON.stringify(rs.map((r) => [r.id, r.status, r.events.length, r.result.length]));
    if (sig(runs) !== sig(lastRuns)) renderRuns(runs);
    renderReply(runs);
    if (finished) {
      pollSnapshot();
      toast("Run finished — vault updated");
    }
    lastRuns = runs;
    setTimeout(pollRuns, runs.some((r) => r.status === "running") ? 1000 : 5000);
  } catch {
    setTimeout(pollRuns, 5000);
  }
}
pollRuns();

async function start(body, { reply = false } = {}) {
  try {
    const { id } = await api.post("/api/run", body);
    open.add(id);
    if (reply) {
      replyId = id;
      try {
        localStorage.setItem("aos-reply", id);
      } catch {
        /* storage unavailable */
      }
      document.querySelector('.tabs [data-tab="reply"]').hidden = false;
      showTab("reply");
      $("reply").innerHTML = `<div class="q">${esc(body.text || "")}</div><div class="meta">starting…</div>`;
    } else {
      toast("Claude is on it");
    }
    setTimeout(pollRuns, 300);
  } catch (e) {
    toast(e.message, true);
  }
}

document.querySelector(".skills").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) start({ skill: b.dataset.skill });
});

$("yt-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const args = [$("yt-url").value.trim(), $("yt-lang").value, $("yt-depth").value].filter(Boolean).join(" ");
  start({ skill: "yt", args });
  $("yt-url").value = "";
});

// ---------- command bar ----------
const ask = $("ask-text");
const autosize = () => {
  ask.style.height = "auto";
  ask.style.height = `${Math.min(ask.scrollHeight, 132)}px`;
};
ask.addEventListener("input", autosize);
ask.addEventListener("keydown", (e) => {
  // Enter sends; Shift+Enter is a newline; never send while an IME (日本語入力) is composing.
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    $("ask-form").requestSubmit();
  }
});
$("ask-continue").addEventListener("click", (e) => {
  const b = e.currentTarget;
  b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
});
$("cmd-chips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-insert]");
  if (!b) return;
  ask.value = b.dataset.insert;
  autosize();
  ask.focus();
  ask.setSelectionRange(ask.value.length, ask.value.length);
});
$("ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = ask.value.trim();
  if (!text) return;
  const cont = $("ask-continue").getAttribute("aria-pressed") === "true";
  // Continue the conversation shown in the Reply tab (fallback: the latest Ask).
  const shownRun = lastRuns.find((r) => r.id === replyId && r.sessionId);
  const resume = cont ? (shownRun || lastRuns.find((r) => r.skill === "ask" && r.sessionId))?.id : undefined;
  start({ skill: "ask", text, model: $("ask-model").value, resume }, { reply: true });
  ask.value = "";
  autosize();
});
window.addEventListener("keydown", (e) => {
  // "/" anywhere (outside inputs and terminals) jumps to the command bar
  if (e.key === "/" && !e.target.closest("input, textarea, select, .xterm")) {
    e.preventDefault();
    ask.focus();
    ask.value = "/";
  }
});

// ---------- auto-reload on new dashboard code ----------
// Fingerprints the page's own files; when they change (an update), reload — but never while
// the user is typing, has a panel maximized, or is focused in a terminal. Terminals re-attach after reload.
import("/code-watch.js").then(({ watchCode }) =>
  watchCode(() => !$("ask-text").value.trim() && !document.querySelector(".widget.maxed") && !document.activeElement?.closest(".xterm")),
);

// ---------- terminal drawer ----------
layoutReady.then((layout) => {
  const drawer = $("drawer");
  const terms = createTerminals({
    api,
    host: $("term-host"),
    tabsEl: $("term-tabs"),
    emptyEl: $("term-empty"),
    onCount: (n) => ($("term-count").textContent = `${n} open`),
  });
  const setOpen = (on) => {
    drawer.classList.toggle("open", on);
    layout.setDrawerOpen(on);
    requestAnimationFrame(() => {
      terms.refit();
      window.dispatchEvent(new Event("resize"));
    });
  };
  drawer.classList.toggle("open", layout.drawer.open);
  $("drawer-toggle").addEventListener("click", () => setOpen(!drawer.classList.contains("open")));
  drawer.querySelector(".drawer-actions").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-new]");
    if (!b) return;
    setOpen(true);
    try {
      await terms.create(b.dataset.new);
    } catch (err) {
      toast(err.message, true);
    }
  });
  terms.sync().catch(() => {});
});
