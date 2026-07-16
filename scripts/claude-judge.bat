@echo off
REM claude-multi-peer: judge (decision-maker) session launcher.
REM CLAUDE_PEERS_TOKEN is NOT set here -- it must already exist as a user
REM environment variable and is inherited from the calling shell/session.
REM Repo path is resolved per-PC by existence check (no hardcoded usernames).
if exist "%USERPROFILE%\Desktop\code demo\CLAUDE.md" (
  cd /d "%USERPROFILE%\Desktop\code demo"
) else if exist "%USERPROFILE%\Desktop\main-pc-work\CLAUDE.md" (
  cd /d "%USERPROFILE%\Desktop\main-pc-work"
) else (
  echo [ERROR] project repo not found under %USERPROFILE%\Desktop
  pause
  exit /b 1
)
set "CLAUDE_PEERS_FORCE_POLL=1"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
claude --dangerously-load-development-channels server:claude-multi-peer
