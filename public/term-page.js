import { createTerminals } from "/terminal.js";

const api = {
  get: (p) => fetch(p, { cache: "no-store" }).then((r) => r.json()),
  post: (p, body) =>
    fetch(p, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agentic-OS": "1" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
};

const terms = createTerminals({
  api,
  host: document.getElementById("term-host"),
  tabsEl: document.getElementById("term-tabs"),
  emptyEl: document.getElementById("term-empty"),
  onCount: (n) => (document.getElementById("term-count").textContent = `${n} open`),
});
document.querySelector(".drawer-actions").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-new]");
  if (b) terms.create(b.dataset.new);
});
terms.sync();
// Pick up terminals opened from the dashboard (and vice versa).
setInterval(() => terms.sync().catch(() => {}), 4000);

import("/code-watch.js").then(({ watchCode }) => watchCode(() => !document.activeElement?.closest(".xterm")));
