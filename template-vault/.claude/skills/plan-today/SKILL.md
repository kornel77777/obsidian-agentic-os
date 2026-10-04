---
name: plan-today
description: Build today's plan in the daily note from calendar, deadlines, goals, inbox, and yesterday's open loops. Use when the user says plan today, plan my day, what's on today, or morning planning.
argument-hint: "[tomorrow] [lang=<code>]"
---

# /plan-today

`tomorrow` → plan the next day. `lang=<code>` → write in that language.

## Gather (in parallel where possible)

1. `date` — today's date, weekday, time (use the time zone in `00_Meta/Claude_Context.md` if given).
2. `00_Meta/Goals_and_Priorities.md` — this month's / this quarter's items.
3. `00_Meta/Deadlines.md` plus notes in `01_Projects/` and `02_Areas/` with `due:` frontmatter — everything due in the next **14 days** that isn't `done`.
4. **Calendar connector** (e.g. Google Calendar), if available — today's events. If none is connected, say so in one line.
5. **Email connector** (e.g. Gmail), if available — unread/important threads from the last 24 h that need an action or reply. Skip newsletters and notifications.
6. The most recent previous daily note — unchecked items under `## Open loops`.
7. The last two days of `06_Claude_Sessions/` — open follow-ups.

## Write

Into `05_Daily/YYYY-MM-DD.md` (create from `_Templates/Daily_Note_Template.md` if missing). Replace the `## Today` placeholder; never touch `## Notes / capture`. If `## Today` already has content, add `### Re-plan HH:MM` under it instead.

```markdown
## Today

**Schedule**
- 09:00–10:00 … (calendar events, sorted; mark conflicts ⚠️)

**Top 3** (what makes today a win — chosen from deadlines + goals, not just urgent noise)
1. [ ] …
2. [ ] …
3. [ ] …

**Deadlines — next 14 days**
| Due | What | Days left |
|---|---|---|

**Inbox — needs action**
- [ ] Reply to <person> re <subject>

**Carried over**
- [ ] open loops from yesterday
```

## Reply
The Top 3, the next deadline, anything ⚠️. Under 10 lines.

## Rules
- Calendar and email are **read-only** here: never create events, send, draft, or archive without asking.
- If Goals_and_Priorities' `updated:` is more than 14 days old, say so in one line and offer to refresh it.
