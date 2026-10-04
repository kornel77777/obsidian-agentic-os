#!/bin/sh
# Start the Agentic OS server at login (and restart it if it crashes).
# Undo: launchctl unload ~/Library/LaunchAgents/com.agentic-os.server.plist && rm that file
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.agentic-os.server.plist"
NODE="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.agentic-os"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agentic-os.server</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/.agentic-os/server.log</string>
  <key>StandardErrorPath</key><string>$HOME/.agentic-os/server.log</string>
</dict>
</plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Agentic OS will now start at login → http://127.0.0.1:3217"
