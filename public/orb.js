// Neural-network orb: nodes on/inside a sphere, nearest-neighbour edges,
// sparks that travel along edges while Claude works. States blend smoothly.
import * as THREE from "/vendor/three/three.module.js";

const STATES = {
  idle:    { rot: 0.05, energy: 0.0, amp: 0.010, wave: 0.5, breathe: 0.018, breatheHz: 0.22, lines: 0.30, points: 0.75, glow: 0.30, sparks: 0,   color: "#8b6cff", core: "#e8e2ff" },
  working: { rot: 0.32, energy: 1.0, amp: 0.055, wave: 2.4, breathe: 0.010, breatheHz: 0.6,  lines: 0.62, points: 1.00, glow: 0.80, sparks: 1,   color: "#ff9d2e", core: "#fff1d0" },
  waiting: { rot: 0.10, energy: 0.35, amp: 0.022, wave: 0.9, breathe: 0.045, breatheHz: 0.75, lines: 0.45, points: 0.95, glow: 0.65, sparks: 0.15, color: "#3fd8e0", core: "#e3fdff" },
  error:   { rot: 0.08, energy: 0.2, amp: 0.020, wave: 0.8, breathe: 0.030, breatheHz: 0.5,  lines: 0.42, points: 0.90, glow: 0.55, sparks: 0,   color: "#ff5d6c", core: "#ffe1e4" },
};

const N_NODES = 1100;
const MAX_EDGES = 2600;
const N_SPARKS = 90;
const N_DUST = 500;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.18)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.04)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const pointVert = /* glsl */ `
  uniform float uTime, uEnergy, uPixelRatio, uSize;
  attribute float aPhase, aSize;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.62 + 0.38 * sin(uTime * (0.8 + uEnergy * 4.0) + aPhase * 6.2831);
    float depth = mix(0.25, 1.0, smoothstep(-4.5, -2.3, mv.z));
    vAlpha = tw * depth;
    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 + uEnergy * 0.4 * tw) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const pointFrag = /* glsl */ `
  uniform vec3 uColor, uCore;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float k = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uColor, uCore, pow(k, 3.0));
    gl_FragColor = vec4(col, pow(k, 1.6) * vAlpha * uOpacity);
  }`;
const lineVert = /* glsl */ `
  uniform float uTime, uEnergy;
  attribute float aAlpha, aPhase;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float pulse = 0.5 + 0.5 * sin(uTime * (0.5 + uEnergy * 3.5) + aPhase * 6.2831);
    float depth = mix(0.15, 1.0, smoothstep(-4.5, -2.3, mv.z));
    vA = aAlpha * mix(0.45, 1.0, pulse) * depth;
    gl_Position = projectionMatrix * mv;
  }`;
const lineFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() { gl_FragColor = vec4(uColor, vA * uOpacity); }`;

export function createOrb(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 3.5);
  const group = new THREE.Group();
  scene.add(group);

  // ---- nodes ----
  const base = new Float32Array(N_NODES * 3);
  const dirs = new Float32Array(N_NODES * 3);
  const phase = new Float32Array(N_NODES);
  const size = new Float32Array(N_NODES);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N_NODES; i++) {
    let x, y, z, r;
    if (i < N_NODES * 0.68) {
      // fibonacci shell with jitter
      const k = i / (N_NODES * 0.68);
      y = 1 - 2 * k;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      x = Math.cos(th) * rad;
      z = Math.sin(th) * rad;
      r = 1 + (Math.random() - 0.5) * 0.09;
      x += (Math.random() - 0.5) * 0.05;
      z += (Math.random() - 0.5) * 0.05;
    } else {
      // interior cloud, denser toward the core
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      x = s * Math.cos(th);
      y = u;
      z = s * Math.sin(th);
      r = Math.pow(Math.random(), 0.7) * 0.92;
    }
    const len = Math.hypot(x, y, z) || 1;
    dirs.set([x / len, y / len, z / len], i * 3);
    base.set([(x / len) * r, (y / len) * r, (z / len) * r], i * 3);
    phase[i] = Math.random();
    size[i] = Math.random() < 0.035 ? 2.6 + Math.random() * 1.4 : 0.7 + Math.random() * 1.0;
  }
  const pos = new Float32Array(base);
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  nodeGeo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

  const uniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uSize: { value: 15 },
    uColor: { value: new THREE.Color(STATES.idle.color) },
    uCore: { value: new THREE.Color(STATES.idle.core) },
    uOpacity: { value: STATES.idle.points },
  };
  const nodeMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: pointVert, fragmentShader: pointFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(nodeGeo, nodeMat));

  // ---- edges: up to 3 nearest neighbours within reach ----
  const edges = [];
  const adj = Array.from({ length: N_NODES }, () => []);
  for (let i = 0; i < N_NODES && edges.length < MAX_EDGES; i++) {
    const near = [];
    for (let j = i + 1; j < N_NODES; j++) {
      const dx = base[i * 3] - base[j * 3], dy = base[i * 3 + 1] - base[j * 3 + 1], dz = base[i * 3 + 2] - base[j * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < 0.05) near.push([d, j]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, j] of near.slice(0, 3)) {
      adj[i].push(edges.length);
      adj[j].push(edges.length);
      edges.push([i, j]);
      if (edges.length >= MAX_EDGES) break;
    }
  }
  const E = edges.length;
  const linePos = new Float32Array(E * 6);
  const lineAlpha = new Float32Array(E * 2);
  const linePhase = new Float32Array(E * 2);
  for (let e = 0; e < E; e++) {
    const a = 0.25 + Math.random() * 0.75;
    const p = Math.random();
    lineAlpha[e * 2] = lineAlpha[e * 2 + 1] = a;
    linePhase[e * 2] = linePhase[e * 2 + 1] = p;
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setAttribute("aAlpha", new THREE.BufferAttribute(lineAlpha, 1));
  lineGeo.setAttribute("aPhase", new THREE.BufferAttribute(linePhase, 1));
  const lineUniforms = { uTime: uniforms.uTime, uEnergy: uniforms.uEnergy, uColor: uniforms.uColor, uOpacity: { value: STATES.idle.lines } };
  const lineMat = new THREE.ShaderMaterial({
    uniforms: lineUniforms, vertexShader: lineVert, fragmentShader: lineFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  // ---- sparks travelling along edges ----
  const sparkPos = new Float32Array(N_SPARKS * 3);
  const sparkSize = new Float32Array(N_SPARKS);
  const sparkPhase = new Float32Array(N_SPARKS).map(() => Math.random());
  const sparks = Array.from({ length: N_SPARKS }, () => ({ alive: false }));
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(sparkSize, 1).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("aPhase", new THREE.BufferAttribute(sparkPhase, 1));
  const sparkUniforms = { ...uniforms, uSize: { value: 26 }, uColor: uniforms.uCore, uOpacity: { value: 1 } };
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: sparkUniforms, vertexShader: pointVert, fragmentShader: pointFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(sparkGeo, sparkMat));

  // ---- soft core glow + background dust ----
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: uniforms.uColor.value.clone(), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: STATES.idle.glow,
  }));
  glow.scale.setScalar(3.6);
  scene.add(glow);

  const dustPos = new Float32Array(N_DUST * 3);
  for (let i = 0; i < N_DUST; i++) {
    const r = 2.2 + Math.random() * 5;
    const th = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    dustPos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th) - 2], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(N_DUST).map(() => Math.random()), 1));
  dustGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(N_DUST).map(() => 0.4 + Math.random() * 0.8), 1));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uEnergy: { value: 0 }, uSize: { value: 9 }, uOpacity: { value: 0.35 } },
    vertexShader: pointVert, fragmentShader: pointFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  // ---- state blending ----
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cur = { ...STATES.idle, color: new THREE.Color(STATES.idle.color), core: new THREE.Color(STATES.idle.core) };
  let target = STATES.idle;
  let targetColor = new THREE.Color(target.color);
  let targetCore = new THREE.Color(target.core);
  let frozen = false;

  function setState(name) {
    target = STATES[name] || STATES.idle;
    targetColor = new THREE.Color(target.color);
    targetCore = new THREE.Color(target.core);
  }

  function spawnSpark() {
    const s = sparks.find((x) => !x.alive);
    if (!s || !E) return;
    s.alive = true;
    s.edge = (Math.random() * E) | 0;
    s.from = edges[s.edge][Math.random() < 0.5 ? 0 : 1];
    s.t = 0;
    s.speed = 1.6 + Math.random() * 2.4;
    s.hops = 3 + ((Math.random() * 9) | 0);
  }

  // ---- interaction + sizing ----
  const pointer = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---- frame loop ----
  const clock = new THREE.Clock();
  let t = 0;
  let spin = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05) * (reduced ? 0.35 : 1);
    if (!frozen) t += dt;
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of ["rot", "energy", "amp", "wave", "breathe", "breatheHz", "lines", "points", "glow", "sparks"]) {
      cur[key] += (target[key] - cur[key]) * k;
    }
    cur.color.lerp(targetColor, k);
    cur.core.lerp(targetCore, k);

    uniforms.uTime.value = t;
    uniforms.uEnergy.value = cur.energy;
    uniforms.uColor.value.copy(cur.color);
    uniforms.uCore.value.copy(cur.core);
    uniforms.uOpacity.value = cur.points;
    lineUniforms.uOpacity.value = cur.lines;
    glow.material.color.copy(cur.color);
    glow.material.opacity = cur.glow * (0.85 + 0.15 * Math.sin(t * cur.breatheHz * 6.28));

    if (!frozen) {
      // node displacement: global breathing + travelling surface waves
      const breathe = 1 + cur.breathe * Math.sin(t * cur.breatheHz * 6.2831);
      for (let i = 0; i < N_NODES; i++) {
        const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
        const w = Math.sin(dx * 3.1 + dy * 2.3 + t * cur.wave + phase[i] * 2.0) * Math.cos(dz * 2.7 - t * cur.wave * 0.7);
        const s = breathe * (1 + cur.amp * w);
        pos[i * 3] = base[i * 3] * s;
        pos[i * 3 + 1] = base[i * 3 + 1] * s;
        pos[i * 3 + 2] = base[i * 3 + 2] * s;
      }
      nodeGeo.attributes.position.needsUpdate = true;
      for (let e = 0; e < E; e++) {
        const a = edges[e][0] * 3, b = edges[e][1] * 3;
        linePos[e * 6] = pos[a]; linePos[e * 6 + 1] = pos[a + 1]; linePos[e * 6 + 2] = pos[a + 2];
        linePos[e * 6 + 3] = pos[b]; linePos[e * 6 + 4] = pos[b + 1]; linePos[e * 6 + 5] = pos[b + 2];
      }
      lineGeo.attributes.position.needsUpdate = true;

      // sparks
      const spawnRate = cur.sparks * 55; // per second at full energy
      let n = spawnRate * dt;
      while (n > 0) {
        if (Math.random() < n) spawnSpark();
        n -= 1;
      }
      for (let s = 0; s < N_SPARKS; s++) {
        const sp = sparks[s];
        if (!sp.alive) {
          sparkSize[s] = 0;
          continue;
        }
        sp.t += dt * sp.speed;
        if (sp.t >= 1) {
          const [a, b] = edges[sp.edge];
          const at = sp.from === a ? b : a;
          const next = adj[at].filter((e) => e !== sp.edge);
          if (--sp.hops <= 0 || !next.length) {
            sp.alive = false;
            sparkSize[s] = 0;
            continue;
          }
          sp.edge = next[(Math.random() * next.length) | 0];
          sp.from = at;
          sp.t = 0;
        }
        const [a, b] = edges[sp.edge];
        const from = sp.from === a ? a : b, to = sp.from === a ? b : a;
        for (let c = 0; c < 3; c++) sparkPos[s * 3 + c] = pos[from * 3 + c] + (pos[to * 3 + c] - pos[from * 3 + c]) * sp.t;
        sparkSize[s] = 0.9 * Math.min(1, sp.hops / 2);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.aSize.needsUpdate = true;

      spin += dt * cur.rot;
      dust.rotation.y += dt * 0.01;
    }
    group.rotation.y = spin + pointer.x * 0.12;
    group.rotation.x = 0.28 + Math.sin(t * 0.07) * 0.08 + pointer.y * 0.08;
    group.rotation.z = Math.sin(t * 0.05) * 0.05;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setState,
    setFrozen(v) {
      frozen = v;
    },
  };
}
