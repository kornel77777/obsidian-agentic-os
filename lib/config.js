// Loads agentic-os.config.json (or the file in $AOS_CONFIG) and fills in defaults.
// Everything user-specific lives in that file; the code stays generic.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const DEFAULTS = {
  vault: "",
  name: "",
  title: "AGENTIC OS",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  port: 3217,
  claudeBin: "claude",
  defaultModel: "sonnet",
  paths: {
    daily: "05_Daily",
    dailyTemplate: "_Templates/Daily_Note_Template.md",
    goals: "00_Meta/Goals_and_Priorities.md",
    deadlines: "00_Meta/Deadlines.md",
    briefs: "03_Resources/Briefs",
    videos: "03_Resources/YouTube",
    concepts: "07_Concepts",
    sessions: "06_Claude_Sessions",
  },
  // Notes in these folders with `due: YYYY-MM-DD` frontmatter show up as deadlines.
  deadlineFolders: ["01_Projects", "02_Areas"],
  // Buttons in the Skills panel and chips under the Ask bar. `prompt` is sent to `claude -p` in the vault.
  skills: [
    { id: "plan-today", label: "Plan Today", prompt: "/plan-today" },
    { id: "news", label: "News Brief", prompt: "/news" },
    { id: "news-quick", label: "Quick News", prompt: "/news quick" },
    { id: "mine", label: "Concept Mining", prompt: "/mine" },
    { id: "close-day", label: "Close Day", prompt: "/close-day" },
  ],
  // Tools dashboard runs may use without an approval card (in addition to the built-in safe set).
  extraAllowedTools: [],
};

const expand = (p) => (p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);

function load() {
  const file = process.env.AOS_CONFIG || path.join(ROOT, "agentic-os.config.json");
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw new Error(`Could not read ${file}: ${e.message}`);
  }
  const cfg = { ...DEFAULTS, ...user, paths: { ...DEFAULTS.paths, ...(user.paths || {}) } };
  cfg.vault = expand(process.env.AOS_VAULT || cfg.vault || "");
  if (!cfg.vault) {
    throw new Error('No vault configured. Copy agentic-os.config.example.json to agentic-os.config.json and set "vault".');
  }
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  cfg.vaultName = path.basename(cfg.vault);
  cfg.root = ROOT;
  return cfg;
}

export const config = load();

// What the browser is allowed to know.
export function publicConfig() {
  const { name, title, timezone, vaultName, skills, defaultModel } = config;
  return { name, title, timezone, vaultName, skills: skills.map(({ id, label, prompt }) => ({ id, label, prompt })), defaultModel };
}
