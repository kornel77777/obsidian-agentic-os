#!/usr/bin/env python3
"""Claude Code hook → per-session status file for the Agentic OS orb.

Wired in ~/.claude/settings.json for UserPromptSubmit, PreToolUse,
PostToolUse, Notification, Stop and SessionEnd. Reads the hook payload on
stdin and writes ~/.agentic-os/status/<session_id>.json. Never blocks or
fails Claude: every error is swallowed and the exit code is always 0.
"""
import json
import os
import sys
import time

STATUS_DIR = os.path.expanduser("~/.agentic-os/status")
T0 = time.time()


def detail_for(payload):
    tool = payload.get("tool_name") or ""
    ti = payload.get("tool_input") or {}
    if tool == "Bash":
        return (ti.get("description") or ti.get("command") or "")[:80]
    if tool in ("Read", "Write", "Edit"):
        return os.path.basename(ti.get("file_path") or "")
    if tool == "Skill":
        return ti.get("skill") or ""
    if tool in ("WebSearch",):
        return (ti.get("query") or "")[:80]
    if tool in ("WebFetch",):
        return (ti.get("url") or "")[:80]
    if tool in ("Grep", "Glob"):
        return (ti.get("pattern") or "")[:80]
    if tool == "Agent":
        return (ti.get("description") or "")[:80]
    return ""


def pretty_tool(name):
    if name.startswith("mcp__"):
        parts = name.split("__")
        server = parts[1].replace("claude_ai_", "").replace("_", " ")
        return f"{server} · {parts[-1].replace('_', ' ')}" if len(parts) > 2 else server
    return name


def main():
    payload = json.load(sys.stdin)
    sid = payload.get("session_id")
    event = payload.get("hook_event_name") or ""
    if not sid:
        return
    os.makedirs(STATUS_DIR, exist_ok=True)
    path = os.path.join(STATUS_DIR, f"{sid}.json")

    if event == "SessionEnd":
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        return

    try:
        with open(path, encoding="utf-8") as f:
            prev = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        prev = {}

    cwd = payload.get("cwd") or prev.get("cwd") or ""
    state = {
        "session_id": sid,
        "cwd": cwd,
        "project": os.path.basename(cwd.rstrip("/")) or "~",
        "prompt": prev.get("prompt", ""),
        "since": prev.get("since") or T0,
    }

    if event == "UserPromptSubmit":
        state.update(state="working", activity="Thinking", detail="",
                     prompt=(payload.get("prompt") or "")[:140], since=T0)
    elif event in ("PreToolUse", "PostToolUse"):
        # Async hooks can land after Stop; never resurrect a session that went idle after we started.
        if prev.get("state") == "idle" and prev.get("ts", 0) > T0:
            return
        tool = payload.get("tool_name") or ""
        if event == "PreToolUse":
            state.update(state="working", activity=pretty_tool(tool), detail=detail_for(payload))
        else:
            state.update(state="working", activity="Thinking", detail="")
    elif event == "Notification":
        msg = payload.get("message") or ""
        if "waiting for your input" in msg.lower() and prev.get("state") == "idle":
            return  # idle reminder, not a blocking question
        state.update(state="waiting", activity="Needs you", detail=msg[:120])
    elif event == "Stop":
        state.update(state="idle", activity="Idle", detail="")
    else:
        return

    state["event"] = event
    state["ts"] = time.time()
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, path)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
