---
name: yt
description: Summarize, explain, or analyze a YouTube video and file it in the vault. Use whenever the user shares a YouTube link (youtube.com / youtu.be) or asks about a video's content. Supports output language, depth modes, and linking to a project.
argument-hint: <url> [quick|deep] [lang=<code>] [for <note>] [question...]
---

# /yt — YouTube → vault

## Arguments (`$ARGUMENTS`, any order)

| Token | Meaning |
|---|---|
| a YouTube URL | required (several URLs → one note each) |
| `lang=<code>` or a language name (`ja`, `日本語`, `es`, `French`…) | write the note in that language (frontmatter keys and filenames stay English). Default: the user's language from Claude_Context, else English |
| `quick` | TL;DR + key points only |
| `deep` | claim-by-claim analysis, steelman + critique, fact-check key claims with WebSearch |
| `for <note>` | link the note to that project/area note and relate the content to it |
| anything else | a question to answer from the video — answer it in chat *and* add a "Q&A" section |

## Steps

1. **Fetch** — from the vault root: `python3 .claude/skills/yt/fetch_transcript.py "<url>"`. It saves `03_Resources/YouTube/_transcripts/<id>.md` and prints JSON metadata. Needs `yt-dlp`; falls back to local `whisper` when a video has no captions (slow — warn first if the video is over 30 min). Sign-in / members-only errors → tell the user and stop.
2. **Read the whole transcript.** Fix obvious auto-caption errors from context; never quote garbled text.
3. **Check for an existing note** with the same `url:` in `03_Resources/YouTube/` — update instead of duplicating.
4. **Write** `03_Resources/YouTube/YYYY-MM-DD_<Short_Title>.md` (today's date, ≤ 6-word title with underscores) using the format below.
5. **Link** it from today's daily note under `## Notes / capture`: `- 📺 [[<note>]] — one-line takeaway` (create the daily from `_Templates/Daily_Note_Template.md` if missing).
6. **Reply** with the TL;DR, the 3 most important points, the note link, and concept candidates. Short.

## Note format

```markdown
---
type: video
status: done
title: "<original title>"
channel: <channel>
url: <url>
published: YYYY-MM-DD
duration: "MM:SS"
lang: <note language>
video_lang: <video language>
watched: YYYY-MM-DD
transcript: "[[_transcripts/<id>]]"
---

# <Title>

> [!summary] TL;DR
> 2–3 sentences: what it argues, not what it "covers".

## Key points
- Claim, in plain words — [mm:ss](<url>&t=<seconds>)

## Analysis            ← omit in quick mode
- **What's new** vs. repackaged
- **Evidence quality** — data, anecdote, or vibes? Who's speaking and what's their incentive?
- **Weak spots / what's missing**
- **Hype check** — claims to verify before repeating (deep mode: verify with WebSearch and cite)

## So what for me
Connect to [[Goals_and_Priorities]] and active projects only where the link is real.

## Concept candidates
- **<Concept>** — why it deserves a permanent note (check `07_Concepts/` first; link if it exists)
```

## Rules
- Timestamps come from the transcript, never guessed.
- Don't create concept notes automatically — list candidates; `/mine` promotes them.
- Never edit `_transcripts/` files after writing them.
