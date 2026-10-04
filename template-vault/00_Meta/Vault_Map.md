---
type: meta
status: active
updated: YYYY-MM-DD
---

# Vault Map — routing table

**Claude: this file says where things go.** Don't read the whole vault — route with this table, then open only what the task touches.

| If the input is… | Write it here | `type:` |
|---|---|---|
| Something with a deadline and a finish line | `01_Projects/<Name>.md` (add `due:` if it has one) | `project` |
| An ongoing area of responsibility | `02_Areas/<Area>/` | `area` |
| Research to keep, a book or paper | `03_Resources/` | `resource` / `literature` |
| A YouTube video (`/yt`) | `03_Resources/YouTube/YYYY-MM-DD_<Short_Title>.md`; transcript in `_transcripts/<id>.md` | `video` / `transcript` |
| A news brief (`/news`) | `03_Resources/Briefs/YYYY-MM-DD_News.md` | `brief` |
| Something finished or dead | `04_Archive/` | keep type, `status: archived` |
| What happened today | `05_Daily/YYYY-MM-DD.md` | `daily` |
| A record of work with Claude | `06_Claude_Sessions/YYYY-MM-DD_Topic.md` | `session` |
| An idea that outlives its source | `07_Concepts/<Concept Name>.md` | `concept` |
| A date to track that isn't a note | a row in [[Deadlines]] | — |

## The two-layer rule

- **Transient** — dailies, session logs, captures, transcripts. Records; never rewritten.
- **Permanent** — `07_Concepts/`. One idea per note, in my own words, linked to everything it touches.

When processing anything (a video, a reading, a meeting), ask: is there an idea here that deserves a permanent note? If yes, propose it.

## Standing jobs for Claude

- Keep [[Deadlines]] accurate; when something is done, update its `status:`.
- Every substantive session gets a log in `06_Claude_Sessions/`.
- If something in `00_Meta/` has gone stale, say so and offer to fix it.
