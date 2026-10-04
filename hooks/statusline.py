#!/usr/bin/env python3
"""Claude Code statusLine → terminal status line + ~/.agentic-os/limits.json.

Claude Code pipes session JSON (model, context_window, rate_limits, …) to this
script. We print a compact line for the terminal and persist the subscription
limits so the Agentic OS dashboard can show 5-hour / weekly usage.
"""
import json
import os
import sys
import time

STATE = os.path.expanduser("~/.agentic-os")
LIMITS = os.path.join(STATE, "limits.json")

DIM, RESET = "\033[2m", "\033[0m"
PURPLE, AMBER, RED = "\033[38;5;141m", "\033[38;5;214m", "\033[38;5;203m"


def color(pct):
    return RED if pct >= 90 else AMBER if pct >= 70 else PURPLE


def until(epoch):
    s = max(0, int(epoch - time.time()))
    d, h, m = s // 86400, s % 86400 // 3600, s % 3600 // 60
    if d:
        return f"{d}d{h}h"
    return f"{h}h{m:02d}m" if h else f"{m}m"


def main():
    data = json.load(sys.stdin)
    os.makedirs(STATE, exist_ok=True)

    try:
        with open(LIMITS, encoding="utf-8") as f:
            saved = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        saved = {}

    rl = data.get("rate_limits") or {}
    ctx = data.get("context_window") or {}
    model = (data.get("model") or {}).get("display_name") or ""
    if rl:
        saved["rate_limits"] = rl
        saved["limits_ts"] = time.time()
    saved.update(
        ts=time.time(),
        model=model,
        session_id=data.get("session_id"),
        cwd=(data.get("workspace") or {}).get("current_dir") or data.get("cwd"),
        context_pct=ctx.get("used_percentage"),
        context_size=ctx.get("context_window_size"),
    )
    tmp = f"{LIMITS}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(saved, f)
    os.replace(tmp, LIMITS)

    parts = [f"{PURPLE}◆{RESET} {model}"]
    if ctx.get("used_percentage") is not None:
        pct = ctx["used_percentage"]
        parts.append(f"ctx {color(pct)}{pct:.0f}%{RESET}")
    for key, label in (("five_hour", "5h"), ("seven_day", "wk")):
        w = rl.get(key)
        if w:
            pct = w.get("used_percentage", 0)
            parts.append(f"{label} {color(pct)}{pct:.0f}%{RESET}{DIM} ↻{until(w['resets_at'])}{RESET}")
    print(f" {DIM}·{RESET} ".join(parts))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("◆ Claude")
