# Obsidian Agentic OS

**A cool command center for [Claude Code](https://claude.com/claude-code), built on top of an Obsidian vault.**

The vault becomes Claude's long-term memory. Skills become one-click buttons. A local HUD — which you can open as a tab *inside* Obsidian — shows a neural-network orb that reacts to what Claude is doing, your deadlines and goals, usage limits, approval prompts, and real Claude Code terminals.

```
┌──────────────┬──────────────────────────────┬──────────────┐
│ Deadlines    │        ·  ·  ✦  ·  ·         │ Skills       │
│ Vault vitals │      ·   the orb   ·         │ YouTube      │
│ Goals        │        C L A U D E           │ Activity     │
│              │ [ Ask Claude…          Send ]│              │
│              │ Reply │ Today │ Brief │ Videos│              │
├──────────────┴──────────────────────────────┴──────────────┤
│ ⌘ Terminals   [Claude 1] [Shell 1]      + Claude Code  + Shell │
└────────────────────────────────────────────────────────────┘
```

## What you get

**The framework (`template-vault/`)** — a vault structure Claude can actually work with:
- `CLAUDE.md` that auto-loads your context and a routing table, so every session starts warm
- `00_Meta/` — `Claude_Context` (who you are), `Vault_Map` (where things go), `Conventions`, `Goals_and_Priorities`, `Deadlines`
- A two-layer model: transient notes (dailies, logs, captures) → permanent concept notes
- Five skills in `.claude/skills/`: `/plan-today`, `/news`, `/yt` (YouTube → note, with transcript), `/mine` (concept mining), `/close-day`
- Note templates and an Obsidian CSS snippet that turns a note into a full-bleed app tab

**The HUD (`server.js` + `public/`)** — runs locally on `127.0.0.1`:
- **Orb** — violet when idle, orange while Claude works, cyan when a session needs you. Driven by Claude Code hooks, so it reflects *every* Claude Code session on your machine.
- **Ask bar** — talk to Claude in your vault; `/` chips for skills; continue a conversation; answers in a Reply tab.
- **Approval cards** — dashboard runs have a safe allowlist (read-only calendar/mail). Anything else — creating events, running code — pauses and asks: *Allow · Allow all for this run · Deny*.
- **Usage meters** — 5-hour and weekly subscription usage with reset times, plus today's tokens.
- **Panels** — deadlines, vault vitals, goals, skills, YouTube, activity: drag between columns, resize, collapse, maximize. Layout persists.
- **Terminals** — real Claude Code / shell sessions in a drawer (node-pty + xterm.js) that survive page reloads; also as a standalone note you can dock in Obsidian's sidebar.

## Requirements

- macOS or Linux, **Node ≥ 20**, **Python 3**
- **Claude Code** CLI (`claude`) signed in
- **Obsidian**
- Optional: `yt-dlp` (and `whisper`) for `/yt`; Google Calendar / Gmail connectors for `/plan-today`

## Quick start

```bash
git clone https://github.com/<you>/obsidian-agentic-os.git
cd obsidian-agentic-os
npm install
npm run setup -- ~/Documents/MyVault --name "Your Name"   # copies the framework into the vault (never overwrites)
npm run hooks                                              # orb + usage meters (backs up ~/.claude/settings.json first)
npm start                                                  # → http://127.0.0.1:3217
```

Then:
1. Open the vault in Obsidian and open the note **Agentic OS** (or visit the URL in a browser).
2. Run `claude` once inside the vault and accept the folder-trust prompt.
3. Fill in `00_Meta/Claude_Context.md` and `Goals_and_Priorities.md`, then press **Plan Today**.
4. Optional: `npm run autostart` (macOS) starts the server at login.

Works with an existing vault too — `setup` only adds files that don't exist yet. Adjust folder names in `agentic-os.config.json` if yours differ.

## Configuration — `agentic-os.config.json`

Created by `setup` from [`agentic-os.config.example.json`](agentic-os.config.example.json):

| Key | What |
|---|---|
| `vault` | Path to the vault (or set `AOS_VAULT`) |
| `name`, `title`, `timezone` | Shown in the header; timezone drives "today" and the clock |
| `paths` | Where daily notes, goals, deadlines, briefs, videos, concepts and session logs live |
| `deadlineFolders` | Notes here with `due: YYYY-MM-DD` frontmatter appear as deadlines |
| `skills` | Buttons and `/` chips — `{ id, label, prompt }`; `prompt` is sent to `claude -p` in the vault |
| `defaultModel` | `sonnet` · `opus` · `haiku` for dashboard runs |
| `extraAllowedTools` | Tools dashboard runs may use without an approval card |

**Deadlines** come from two places: table rows in `00_Meta/Deadlines.md` whose first cell is a date (🔴 = critical), and notes in `deadlineFolders` with `due:` frontmatter that aren't `done`.

**Make it yours**: edit the skills in `<vault>/.claude/skills/` — e.g. the sections list at the top of `/news`. Add a skill folder, add it to `skills` in the config, and it gets a button.

## How it works

| Piece | File | Job |
|---|---|---|
| Server | `server.js` | Snapshot, status, runs, approvals, usage, layout, terminals (HTTP + WebSocket) |
| Vault reader | `lib/vault.js` | Deadlines, goals, daily note, briefs, videos, vitals |
| Config | `lib/config.js` | Loads `agentic-os.config.json` with defaults |
| Orb state | `hooks/claude-status.py` | Claude Code hook → `~/.agentic-os/status/<session>.json` |
| Usage | `hooks/statusline.py`, `lib/usage.js` | statusLine → `~/.agentic-os/limits.json`; token totals from `~/.claude/projects` |
| Approvals | `lib/mcp-approve.js` | stdio MCP server used as `--permission-prompt-tool` → approval cards |
| Terminals | `lib/terms.js`, `public/terminal.js` | node-pty sessions over WebSocket |
| HUD | `public/` | `app.js`, `orb.js` (Three.js), `layout.js`, `code-watch.js` (auto-reload on update) |

Runtime state lives in `~/.agentic-os/` (hook status files and usage limits always; runs and layout can move with `AOS_STATE`).

## Security model

- Binds to `127.0.0.1` only. Rejects foreign `Host` headers (DNS rebinding) and cross-site `Origin`s; POSTs require an `X-Agentic-OS` header; terminal WebSockets require a same-origin `Origin`.
- Dashboard runs use a fixed allowlist; everything else needs an explicit approval card. Unanswered approvals are denied after 10 minutes. Cards warn when an action sends invitations or acts outside the vault.
- Markdown from the vault and from Claude is rendered with raw HTML escaped and only `http(s)`/`obsidian:` links, under a strict CSP — web content Claude summarizes can't script the page.
- The terminal drawer is a real shell. Anyone who can reach `127.0.0.1:<port>` from a browser on your machine with the right Origin could use it — don't expose the port.

## Uninstall

- Remove the `hooks` / `statusLine` entries from `~/.claude/settings.json` (a backup was saved next to it).
- macOS autostart: `launchctl unload ~/Library/LaunchAgents/com.agentic-os.server.plist`
- The vault files are plain Markdown — keep or delete as you like.

## License

MIT
