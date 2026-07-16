@echo off
REM claude-multi-peer: worker-dev (development execution role) session launcher.
REM Role definition auto-loads from <repo>\.claude\workspaces\worker-dev\CLAUDE.md.
REM Runs on Sonnet (implementation phase model per cost strategy).
REM CLAUDE_PEERS_TOKEN is NOT set here -- it must already exist as a user
REM environment variable and is inherited from the calling shell/session.
if exist "%USERPROFILE%\Desktop\code demo\CLAUDE.md" (
  set "REPO=%USERPROFILE%\Desktop\code demo"
) else if exist "%USERPROFILE%\Desktop\main-pc-work\CLAUDE.md" (
  set "REPO=%USERPROFILE%\Desktop\main-pc-work"
) else (
  echo [ERROR] project repo not found under %USERPROFILE%\Desktop
  pause
  exit /b 1
)
cd /d "%REPO%\.claude\workspaces\worker-dev"
set "CLAUDE_PEERS_FORCE_POLL=1"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
claude --model sonnet --dangerously-load-development-channels server:claude-multi-peer
