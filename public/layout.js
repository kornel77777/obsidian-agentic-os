// Movable / resizable widgets, column gutters, dock + drawer sizes.
// Layout is saved to the server (shared by browser and Obsidian) with localStorage as fallback.
const DEFAULT = {
  cols: { left: ["deadlines", "vitals", "goals"], right: ["skills", "youtube", "activity"] },
  heights: {},
  collapsed: [],
  widths: { left: 300, right: 310 },
  dock: 200,
  drawer: { open: false, height: 320 },
};
const KEY = "aos-layout";
const root = document.documentElement;

export async function initLayout(api) {
  let state = structuredClone(DEFAULT);
  let saved = null;
  try {
    saved = await api.get("/api/layout");
  } catch {
    /* offline */
  }
  if (!saved) {
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      /* storage unavailable */
    }
  }
  if (saved) state = { ...state, ...saved, drawer: { ...state.drawer, ...(saved.drawer || {}) } };

  // Make sure every widget appears exactly once, even after new widgets are added to the page.
  const all = [...document.querySelectorAll(".widget")].map((w) => w.dataset.widget);
  const placed = new Set([...state.cols.left, ...state.cols.right]);
  for (const id of all) {
    if (placed.has(id)) continue;
    (DEFAULT.cols.left.includes(id) ? state.cols.left : state.cols.right).push(id);
  }
  for (const side of ["left", "right"]) state.cols[side] = state.cols[side].filter((id) => all.includes(id));

  let timer;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* storage unavailable */
      }
      api.post("/api/layout", state).catch(() => {});
    }, 300);
  };

  const widget = (id) => document.querySelector(`.widget[data-widget="${id}"]`);
  const col = (side) => document.querySelector(`.col[data-col="${side}"]`);

  function apply() {
    for (const side of ["left", "right"]) for (const id of state.cols[side]) col(side).appendChild(widget(id));
    for (const w of document.querySelectorAll(".widget")) {
      const id = w.dataset.widget;
      const h = state.heights[id];
      w.style.height = h ? `${h}px` : "";
      w.classList.toggle("sized", !!h);
      w.classList.toggle("collapsed", state.collapsed.includes(id));
    }
    root.style.setProperty("--left-w", `${state.widths.left}px`);
    root.style.setProperty("--right-w", `${state.widths.right}px`);
    root.style.setProperty("--dock-h", `${state.dock}px`);
    root.style.setProperty("--drawer-h", `${state.drawer.height}px`);
  }

  function readOrder() {
    for (const side of ["left", "right"]) state.cols[side] = [...col(side).querySelectorAll(".widget")].map((w) => w.dataset.widget);
  }

  // ---- drag & drop between / within columns ----
  let dragged = null;
  const ghost = document.createElement("div");
  ghost.className = "drop-ghost";
  for (const w of document.querySelectorAll(".widget")) {
    const head = w.querySelector(".w-head");
    head.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".w-tools") && !w.classList.contains("maxed")) w.draggable = true;
    });
    w.addEventListener("dragstart", (e) => {
      dragged = w;
      w.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", w.dataset.widget);
    });
    w.addEventListener("dragend", () => {
      w.classList.remove("dragging");
      w.draggable = false;
      ghost.remove();
      document.querySelectorAll(".drop-target").forEach((c) => c.classList.remove("drop-target"));
      dragged = null;
    });
    document.addEventListener("mouseup", () => (w.draggable = false));
  }
  for (const side of ["left", "right"]) {
    const c = col(side);
    c.addEventListener("dragover", (e) => {
      if (!dragged) return;
      e.preventDefault();
      document.querySelectorAll(".drop-target").forEach((x) => x !== c && x.classList.remove("drop-target"));
      c.classList.add("drop-target");
      const others = [...c.querySelectorAll(".widget:not(.dragging)")];
      const after = others.find((o) => e.clientY < o.getBoundingClientRect().top + o.offsetHeight / 2);
      if (after) c.insertBefore(ghost, after);
      else c.appendChild(ghost);
    });
    c.addEventListener("drop", (e) => {
      if (!dragged) return;
      e.preventDefault();
      c.insertBefore(dragged, ghost);
      ghost.remove();
      readOrder();
      save();
    });
  }

  // ---- pointer-drag helper ----
  function dragY(handle, onMove, onEnd) {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const start = e.clientY;
      const move = (ev) => onMove(ev.clientY - start, ev);
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        onEnd();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  // ---- widget height ----
  for (const w of document.querySelectorAll(".widget")) {
    const id = w.dataset.widget;
    const handle = w.querySelector(".w-resize");
    let startH = 0;
    handle.addEventListener("pointerdown", () => (startH = w.getBoundingClientRect().height));
    dragY(handle, (dy) => {
      const h = Math.max(70, Math.round(startH + dy));
      w.style.height = `${h}px`;
      w.classList.add("sized");
      state.heights[id] = h;
    }, save);
    handle.addEventListener("dblclick", () => {
      delete state.heights[id];
      apply();
      save();
    });
  }

  // ---- collapse / maximize ----
  let backdrop = null;
  const unmax = () => {
    document.querySelector(".widget.maxed")?.classList.remove("maxed");
    backdrop?.remove();
    backdrop = null;
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".w-tools button");
    if (!b) return;
    const w = b.closest(".widget");
    const id = w.dataset.widget;
    if (b.dataset.act === "collapse") {
      const on = !state.collapsed.includes(id);
      state.collapsed = on ? [...state.collapsed, id] : state.collapsed.filter((x) => x !== id);
      w.classList.toggle("collapsed", on);
      b.textContent = on ? "+" : "–";
      save();
    }
    if (b.dataset.act === "max") {
      if (w.classList.contains("maxed")) return unmax();
      unmax();
      backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.addEventListener("click", unmax);
      document.body.appendChild(backdrop);
      w.classList.add("maxed");
    }
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && unmax());

  // ---- column gutters ----
  for (const g of document.querySelectorAll(".gutter")) {
    const side = g.dataset.gutter;
    g.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      g.classList.add("active");
      const startX = e.clientX;
      const startW = state.widths[side];
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const w = Math.min(620, Math.max(200, Math.round(side === "left" ? startW + dx : startW - dx)));
        state.widths[side] = w;
        root.style.setProperty(`--${side}-w`, `${w}px`);
        window.dispatchEvent(new Event("resize"));
      };
      const up = () => {
        g.classList.remove("active");
        g.removeEventListener("pointermove", move);
        g.removeEventListener("pointerup", up);
        save();
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up);
    });
  }

  // ---- dock height (drag its top edge) ----
  const dockHandle = document.getElementById("dock-resize");
  let dockStart = 0;
  dockHandle.addEventListener("pointerdown", () => (dockStart = state.dock));
  dragY(dockHandle, (dy) => {
    state.dock = Math.min(560, Math.max(110, dockStart - dy));
    root.style.setProperty("--dock-h", `${state.dock}px`);
  }, save);
  dockHandle.addEventListener("dblclick", () => {
    state.dock = DEFAULT.dock;
    apply();
    save();
  });

  // ---- drawer height ----
  const drawerHandle = document.getElementById("drawer-resize");
  let drawerStart = 0;
  drawerHandle.addEventListener("pointerdown", () => (drawerStart = state.drawer.height));
  dragY(drawerHandle, (dy) => {
    state.drawer.height = Math.min(window.innerHeight - 160, Math.max(140, drawerStart - dy));
    root.style.setProperty("--drawer-h", `${state.drawer.height}px`);
    window.dispatchEvent(new Event("drawer-resize"));
  }, save);

  document.getElementById("reset-layout").addEventListener("click", () => {
    state = structuredClone(DEFAULT);
    for (const b of document.querySelectorAll('.w-tools [data-act="collapse"]')) b.textContent = "–";
    apply();
    save();
  });

  apply();
  for (const id of state.collapsed) {
    const b = widget(id)?.querySelector('[data-act="collapse"]');
    if (b) b.textContent = "+";
  }

  return {
    get drawer() {
      return state.drawer;
    },
    setDrawerOpen(open) {
      state.drawer.open = open;
      save();
    },
  };
}
