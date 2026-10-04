---
name: close-day
description: End-of-day wrap-up — records what got done, carries open loops to tomorrow, and writes the Claude session log. Use when the user says close the day, wrap up, end of day, or done for today.
argument-hint: "[lang=<code>]"
---

# /close-day

## Gather
1. `date`.
2. Today's `05_Daily/YYYY-MM-DD.md` — the Top 3 and checkboxes.
3. Notes changed today:
   `find . -name "*.md" -newermt "$(date +%Y-%m-%d)" -not -path "./.obsidian/*" -not -path "./.claude/*" -not -path "*/_transcripts/*"`
4. Today's `06_Claude_Sessions/` logs and this conversation.

## Write (append to today's daily note; never rewrite what's above)

```markdown
## Done
- What actually happened, linked: [[…]], 📺 [[…]]

## Open loops
- [ ] unfinished Top-3 items and new follow-ups (carried by /plan-today)

## One line
How the day went, in one sentence — ask the user; leave it out if they skip.
```

If `## Open loops` already exists, merge into it.

## Session log
If this conversation did substantive work and no log covers it, write `06_Claude_Sessions/YYYY-MM-DD_<Topic>.md` from `_Templates/Claude_Session_Template.md`.

## Also flag (one line each, only if true)
- A note whose `due:` passed but `status:` is still `active`.
- Notes written today with no links into `07_Concepts/` → suggest `/mine`.

Reply: tomorrow's first deadline and the open-loop count.
