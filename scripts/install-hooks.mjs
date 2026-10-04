#!/usr/bin/env node
// npm run hooks [-- --force-statusline]
// Merges the Agentic OS hooks (orb state) and statusLine (usage meters) into ~/.claude/settings.json.
// Backs the file up first, keeps every existing setting, and is safe to run twice.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const forceStatus = process.argv.includes("--force-statusline");
const file = path.join(os.homedir(), ".claude/settings.json");
const status = `python3 "${path.join(ROOT, "hooks/claude-status.py")}"`;
const statusline = `python3 "${path.join(ROOT, "hooks/statusline.py")}"`;

let settings = {};
if (fs.existsSync(file)) {
  const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(file, backup);
  console.log(`• backed up to ${backup}`);
  settings = JSON.parse(fs.readFileSync(file, "utf8"));
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

settings.hooks ||= {};
const events = {
  UserPromptSubmit: {},
  PreToolUse: { matcher: "*", async: true },
  PostToolUse: { matcher: "*", async: true },
  Notification: {},
  Stop: {},
  SessionEnd: {},
};
let added = 0;
for (const [event, opts] of Object.entries(events)) {
  const list = (settings.hooks[event] ||= []);
  if (list.some((g) => g.hooks?.some((h) => h.command?.includes("claude-status.py")))) continue;
  const hook = { type: "command", command: status, timeout: 5, ...(opts.async ? { async: true } : {}) };
  list.push({ ...(opts.matcher ? { matcher: opts.matcher } : {}), hooks: [hook] });
  added++;
}
console.log(added ? `✓ added ${added} hooks` : "• hooks already installed");

if (!settings.statusLine || forceStatus) {
  settings.statusLine = { type: "command", command: statusline, refreshInterval: 30 };
  console.log("✓ statusLine set (usage meters)");
} else if (!settings.statusLine.command?.includes("statusline.py")) {
  console.log("• you already have a statusLine — left it alone (re-run with --force-statusline to replace it)");
}

fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`✓ updated ${file} — new Claude Code sessions pick it up`);
