@echo off
set "PATH=C:\Users\yoshi\.bun\bin;%PATH%"
set "CLAUDE_PEERS_FORCE_POLL=1"
"C:\Users\yoshi\.bun\bin\bun.exe" "%~dp0server.ts"
