---
name: news
description: On-demand news brief across the user's chosen topics, saved to the vault. Use when the user asks for news, headlines, "what's happening", or an update on a topic. Supports output language, quick mode, a 7-day window, and single-topic briefs.
argument-hint: "[quick] [week] [lang=<code>] [topic...]"
---

# /news — news brief

## ✏️ Customize: sections

Edit this list to your interests (3–8 sections work best). Each becomes a section of the brief.

1. **AI** — models, labs, policy, research, AI business
2. **Tech** — big tech, chips, products, security
3. **Business & markets** — markets, major deals, earnings that matter
4. **World** — major international events
5. **<Your country / city>** — politics, economy, local items that affect daily life

## Arguments (`$ARGUMENTS`, any order)

| Token | Meaning |
|---|---|
| (nothing) | full brief, all sections |
| `quick` | top 5 stories only |
| `week` | last 7 days instead of ~36 h |
| `lang=<code>` or a language name | write the brief in that language |
| anything else | a focused brief on that topic/region instead of the sections |

## Steps

1. `date` — today's date and time; the window is the last ~36 h (or 7 days).
2. **Search in parallel** (all searches in one turn): 1–2 `WebSearch` queries per section, `mode: "extended"` (news is time-sensitive). For non-English regions also search in the local language. Prefer primary and wire sources (Reuters, AP, Bloomberg, FT, national broadcasters, company/government sites).
3. **Filter** — drop anything outside the window (or label it `(older)`), merge duplicates, drop opinion/clickbait, flag single-source claims.
4. **Rank** by impact and relevance to the user (see `00_Meta/Claude_Context.md`). 3–5 stories per section.
5. **Write** `03_Resources/Briefs/YYYY-MM-DD_News.md` (or `YYYY-MM-DD_News_<Topic>.md`). If today's file exists, append `## Update HH:MM` instead of overwriting.
6. **Link** it from today's daily note under `## Notes / capture`: `- 🗞️ [[YYYY-MM-DD_News]]` (no duplicate links).
7. **Reply** with only the Top 5 and the note link.

## Note format

```markdown
---
type: brief
date: YYYY-MM-DD
window: 36h | 7d
lang: <code>
topics: [<sections>]
---

# News — YYYY-MM-DD

## ⚡ Top 5
1. **Headline in plain words** — one sentence on why it matters. ([Source](url))

## <Section>
- **Headline** — 1–2 sentences: what happened + why it matters. ([Source](url))

## Watch list
- Developing stories worth checking again, with dates.
```

## Rules
- Every bullet has at least one source link — no link, no bullet.
- No market predictions or investment advice; describe what happened.
- Neutral wording on politics: report positions and facts, attribute claims.
