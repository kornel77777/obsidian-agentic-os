#!/usr/bin/env node
// npm run setup -- <vault-path> [--name "Your Name"] [--tz Area/City]
// Copies template-vault/ into the vault WITHOUT overwriting anything, enables the Obsidian
// CSS snippet, and writes agentic-os.config.json if it doesn't exist yet.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const name = flag("--name") || "";
const tz = flag("--tz") || Intl.DateTimeFormat().resolvedOptions().timeZone;
const vaultArg = args[0];
if (!vaultArg) {
  console.error('Usage: npm run setup -- <vault-path> [--name "Your Name"] [--tz Area/City]');
  process.exit(1);
}
const vault = path.resolve(vaultArg.replace(/^~/, os.homedir()));
fs.mkdirSync(vault, { recursive: true });

const copied = [];
const skipped = [];
function copyTree(src, dst) {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else if (fs.existsSync(d)) {
      skipped.push(path.relative(vault, d));
    } else {
      fs.copyFileSync(s, d);
      copied.push(path.relative(vault, d));
    }
  }
}
copyTree(path.join(ROOT, "template-vault"), vault);
fs.chmodSync(path.join(vault, ".claude/skills/yt/fetch_transcript.py"), 0o755);

// Enable the CSS snippet (merge, never replace).
const appearance = path.join(vault, ".obsidian/appearance.json");
let ap = {};
try {
  ap = JSON.parse(fs.readFileSync(appearance, "utf8"));
} catch {
  /* new vault */
}
ap.enabledCssSnippets = [...new Set([...(ap.enabledCssSnippets || []), "agentic-os"])];
fs.writeFileSync(appearance, JSON.stringify(ap, null, 2));

// Config
const cfgFile = path.join(ROOT, "agentic-os.config.json");
if (!fs.existsSync(cfgFile)) {
  const example = JSON.parse(fs.readFileSync(path.join(ROOT, "agentic-os.config.example.json"), "utf8"));
  Object.assign(example, { vault, name, timezone: tz });
  fs.writeFileSync(cfgFile, `${JSON.stringify(example, null, 2)}\n`);
  console.log(`✓ wrote ${path.relative(process.cwd(), cfgFile)}`);
} else {
  console.log(`• kept existing agentic-os.config.json (set "vault" to ${vault} if needed)`);
}

console.log(`✓ copied ${copied.length} files into ${vault}`);
if (skipped.length) console.log(`• skipped ${skipped.length} that already existed: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? ", …" : ""}`);
console.log(`✓ enabled the "agentic-os" CSS snippet

Next:
  1. npm run hooks          # wire the orb + usage meters into ~/.claude/settings.json (backs it up first)
  2. npm start              # → http://127.0.0.1:3217
  3. Open the vault in Obsidian, then the note "Agentic OS"
  4. Run \`claude\` once inside the vault and accept the folder-trust prompt
  5. Fill in 00_Meta/Claude_Context.md — it's what makes Claude useful from the first message`);
