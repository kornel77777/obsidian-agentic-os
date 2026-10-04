#!/usr/bin/env python3
"""Fetch a YouTube video's metadata + timestamped transcript.

Usage: fetch_transcript.py <url> [--out DIR] [--whisper] [--model small]

Prefers human subtitles, then YouTube auto-captions, then local Whisper
(audio download + transcription). Writes <out>/<video_id>.md and prints a
JSON summary (title, channel, path, source, ...) to stdout.
"""
import argparse
import glob
import html
import json
import os
import re
import subprocess
import sys
import tempfile

PREFERRED = ["en"]  # tried after the video's own language
PARAGRAPH_SECONDS = 30


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def metadata(url):
    r = run(["yt-dlp", "-J", "--no-warnings", "--no-playlist", url])
    if r.returncode != 0:
        sys.exit(f"yt-dlp metadata failed:\n{r.stderr.strip()}")
    return json.loads(r.stdout)


def pick_track(meta):
    """Return (lang_key, is_auto) or None."""
    lang = (meta.get("language") or "").split("-")[0]
    order = ([lang] if lang else []) + [l for l in PREFERRED if l != lang]
    subs = meta.get("subtitles") or {}
    autos = meta.get("automatic_captions") or {}

    def find(tracks, want, auto):
        keys = list(tracks)
        if auto and f"{want}-orig" in keys:
            return f"{want}-orig"
        for k in keys:
            if k == want or k.startswith(want + "-"):
                return k
        return None

    for want in order:
        k = find(subs, want, False)
        if k:
            return k, False
    for want in order:
        k = find(autos, want, True)
        if k:
            return k, True
    return None


def ts(seconds):
    s = int(seconds)
    h, m, s = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def vtt_seconds(stamp):
    parts = stamp.replace(",", ".").split(":")
    parts = [float(p) for p in parts]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def parse_vtt(path):
    """Return [(start_seconds, text)] with auto-caption rolling duplicates removed."""
    cues, start, buf = [], None, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            m = re.match(r"([\d:.,]+)\s+-->\s+([\d:.,]+)", line)
            if m:
                start, buf = vtt_seconds(m.group(1)), []
                continue
            if start is None:
                continue
            if line.strip() == "":
                if buf:
                    cues.append((start, buf))
                start, buf = None, []
                continue
            text = html.unescape(re.sub(r"<[^>]+>", "", line)).strip()
            if text:
                buf.append(text)
        if start is not None and buf:
            cues.append((start, buf))

    out, seen_last = [], ""
    for start, lines in cues:
        for text in lines:
            if text == seen_last:
                continue
            # rolling captions repeat the previous line as a prefix
            if seen_last and text.startswith(seen_last):
                text = text[len(seen_last):].strip()
            seen_last = lines[-1]
            if text:
                out.append((start, text))
    return out


def whisper_segments(url, workdir, model):
    audio = os.path.join(workdir, "audio.%(ext)s")
    r = run(["yt-dlp", "-x", "--audio-format", "m4a", "--no-playlist", "-o", audio, url])
    if r.returncode != 0:
        sys.exit(f"audio download failed:\n{r.stderr.strip()}")
    audio_file = glob.glob(os.path.join(workdir, "audio.*"))[0]
    r = run(["whisper", audio_file, "--model", model, "--output_format", "json",
             "--output_dir", workdir, "--verbose", "False"])
    if r.returncode != 0:
        sys.exit(f"whisper failed:\n{r.stderr.strip()[-2000:]}")
    with open(glob.glob(os.path.join(workdir, "*.json"))[0], encoding="utf-8") as f:
        data = json.load(f)
    return [(s["start"], s["text"].strip()) for s in data["segments"]], data.get("language")


def paragraphs(segments, joiner):
    paras, cur, cur_start = [], [], None
    for start, text in segments:
        if cur_start is None:
            cur_start = start
        if start - cur_start >= PARAGRAPH_SECONDS and cur:
            paras.append((cur_start, joiner.join(cur)))
            cur, cur_start = [], start
        cur.append(text)
    if cur:
        paras.append((cur_start, joiner.join(cur)))
    return paras


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--out", default="03_Resources/YouTube/_transcripts")
    ap.add_argument("--whisper", action="store_true", help="skip captions, transcribe locally")
    ap.add_argument("--model", default="small", help="whisper model (tiny/base/small/medium/turbo)")
    args = ap.parse_args()

    meta = metadata(args.url)
    vid = meta["id"]
    track = None if args.whisper else pick_track(meta)

    with tempfile.TemporaryDirectory() as tmp:
        if track:
            lang, auto = track
            flag = "--write-auto-subs" if auto else "--write-subs"
            r = run(["yt-dlp", "--skip-download", flag, "--sub-langs", lang, "--sub-format", "vtt",
                     "--no-playlist", "-o", os.path.join(tmp, "%(id)s"), args.url])
            files = glob.glob(os.path.join(tmp, "*.vtt"))
            if r.returncode != 0 or not files:
                track = None
            else:
                segments = parse_vtt(files[0])
                source = f"youtube-{'auto' if auto else 'manual'}-captions ({lang})"
                lang = lang.split("-")[0]
        if not track:
            segments, lang = whisper_segments(args.url, tmp, args.model)
            source = f"whisper-{args.model}"

    joiner = "" if lang in ("ja", "zh") else " "
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"{vid}.md")
    base = f"https://www.youtube.com/watch?v={vid}"
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"---\ntype: transcript\nurl: {base}\nsource: {source}\nlang: {lang}\n---\n\n")
        f.write(f"# Transcript — {meta.get('title')}\n\n")
        for start, text in paragraphs(segments, joiner):
            f.write(f"[{ts(start)}]({base}&t={int(start)}) {text}\n\n")

    up = meta.get("upload_date") or ""
    print(json.dumps({
        "id": vid,
        "url": base,
        "title": meta.get("title"),
        "channel": meta.get("channel") or meta.get("uploader"),
        "published": f"{up[:4]}-{up[4:6]}-{up[6:]}" if len(up) == 8 else None,
        "duration": ts(meta.get("duration") or 0),
        "views": meta.get("view_count"),
        "lang": lang,
        "chapters": [{"t": ts(c["start_time"]), "title": c["title"]} for c in meta.get("chapters") or []],
        "description": (meta.get("description") or "")[:1500],
        "transcript_source": source,
        "transcript_path": path,
        "transcript_words": sum(len(t.split()) for _, t in segments) if joiner else None,
        "transcript_chars": sum(len(t) for _, t in segments),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
