# Agentic OS vault

This folder is an Obsidian vault and Claude's long-term memory. These load automatically every session:

@00_Meta/Claude_Context.md
@00_Meta/Vault_Map.md

Read on demand: `00_Meta/Goals_and_Priorities.md` before planning or starting something new; `00_Meta/Conventions.md` before creating a new kind of note; `00_Meta/Deadlines.md` for dates.

## Skills (the OS's buttons)

| Command | Does |
|---|---|
| `/plan-today` | Daily plan → `05_Daily/` from calendar, deadlines, goals, inbox, open loops |
| `/news [topic]` | News brief → `03_Resources/Briefs/` |
| `/yt <url> [quick\|deep] [lang]` | YouTube summary + analysis → `03_Resources/YouTube/` |
| `/mine` | Weekly concept mining → `07_Concepts/` |
| `/close-day` | Wrap-up, carry open loops, session log |

Skills live in `.claude/skills/`. When a request keeps recurring and has no skill yet, suggest making one.

## Hard rules
- Obsidian syntax: `[[wikilinks]]`, YAML frontmatter on every substantive note, dates `YYYY-MM-DD`.
- Transient notes (past dailies, session logs, transcripts) are a record — append, never rewrite.
- Ask before deleting, moving more than a handful of files, or touching anything in `.obsidian/`.
- No code projects, `node_modules`, or large binaries in the vault.
- Substantive work → a log in `06_Claude_Sessions/` (or run `/close-day`).
