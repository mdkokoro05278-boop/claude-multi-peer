@echo off
REM claude-multi-peer: worker-1 (execution role) session launcher.
REM CLAUDE_PEERS_TOKEN is NOT set here — it must already exist as a user
REM environment variable and is inherited from the calling shell/session.
cd /d "C:\Users\mdkok\Desktop\code demo\.claude\workspaces\worker-1"
set "CLAUDE_PEERS_FORCE_POLL=1"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
claude --dangerously-load-development-channels server:claude-multi-peer
