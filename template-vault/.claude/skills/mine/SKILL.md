---
name: mine
description: Weekly concept mining — read the week's notes, videos, and readings and promote durable ideas into permanent concept notes. Use when the user says mine, weekly review, concept mining, or promote concepts.
argument-hint: "[days=7] [folder]"
---

# /mine — promote transient → permanent

The habit the whole vault depends on (see [[Concepts_Home]]). Quality over count.

## Steps

1. **Scope** — notes modified in the last 7 days (or `days=N`, or one folder), excluding `05_Daily/`, `06_Claude_Sessions/`, `_transcripts/`, `_Templates/`, `00_Meta/`:
   `find . -name "*.md" -mtime -7 -not -path "./.obsidian/*" -not -path "./.claude/*"`
2. **Read** each candidate fully, and list `07_Concepts/` titles to avoid duplicates.
3. **Propose** a numbered table (max ~8):

   | # | Concept (titled as the idea) | One-sentence claim | From | New or link to existing |
   |---|---|---|---|---|

   Skip definitions recoverable from the source. Prefer ideas that connect across sources.
4. **Wait** for the user to pick (e.g. "1, 3, 5"). Offer a draft they can rewrite in their own words.
5. **Write** each picked note at `07_Concepts/<Title>.md` from `_Templates/Concept_Note_Template.md`, with `origin: [[source]]` and a real **Connections** section. Add a backlink in the source note under `## Concepts`.
6. **Log** to `06_Claude_Sessions/YYYY-MM-DD_Concept-Mining.md`: scanned, created, skipped and why.

## Rules
- Never create concept notes without the user picking them.
- Only add the backlink line to source notes; never edit their content.
- Zero good candidates is a valid answer.
