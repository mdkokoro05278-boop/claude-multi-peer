# claude-multi-peer

Let your Claude Code instances find each other and talk. When you're running many sessions across different projects, any Claude can discover the others and send messages that arrive instantly. Includes persistent peer IDs across restarts, delivered-message log rotation, and a `whoami` tool so a session can report its own identity.

Fork of [`louislva/claude-peers-mcp`](https://github.com/louislva/claude-peers-mcp) with additional features described in [What's different from the upstream](#whats-different-from-the-upstream).

```
  Terminal 1 (project-a)             Terminal 2 (project-b)
  ┌───────────────────────┐          ┌──────────────────────┐
  │ Claude A              │          │ Claude B             │
  │ "send a message to    │  ──────> │                      │
  │  peer xyz: what files │          │ <channel> arrives    │
  │  are you editing?"    │  <────── │  instantly, Claude B │
  │                       │          │  responds            │
  └───────────────────────┘          └──────────────────────┘
```

## Quick start

### 1. Install

```bash
git clone https://github.com/edhiblemeer/claude-multi-peer.git ~/claude-multi-peer
cd ~/claude-multi-peer
bun install
```

### 2. Register the MCP server

This makes claude-multi-peer available in every Claude Code session, from any directory:

```bash
claude mcp add --scope user --transport stdio claude-multi-peer -- bun ~/claude-multi-peer/server.ts
```

Replace `~/claude-multi-peer` with wherever you cloned it.

### 3. Run Claude Code with the channel

```bash
claude --dangerously-load-development-channels server:claude-multi-peer
```

That's it. The broker daemon starts automatically the first time.

> **Tip:** Add it to an alias so you don't have to type it every time:
>
> ```bash
> alias claudempeer='claude --dangerously-load-development-channels server:claude-multi-peer'
> ```

### 4. Open a second session and try it

In another terminal, start Claude Code the same way. Then ask either one:

> List all peers on this machine

It'll show every running instance with their working directory, git repo, and a summary of what they're doing. Then:

> Send a message to peer [id]: "what are you working on?"

The other Claude receives it immediately and responds.

## What Claude can do

| Tool             | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `whoami`         | Report your own peer ID, cwd, git root, and summary                            |
| `list_peers`     | Find other Claude Code instances — scoped to `machine`, `directory`, or `repo` |
| `send_message`   | Send a message to another instance by ID (arrives instantly via channel push)  |
| `set_summary`    | Describe what you're working on (visible to other peers)                       |
| `check_messages` | Manually check for messages (fallback if not using channel mode)               |

For clients that do not advertise `experimental["claude/channel"]`, the server skips the background inbox poller so messages remain queued until `check_messages` consumes them.

## How it works

A **broker daemon** runs on `localhost:7899` with a SQLite database. Each Claude Code session spawns an MCP server that registers with the broker and polls for messages every second. Inbound messages are pushed into the session via the [claude/channel](https://code.claude.com/docs/en/channels-reference) protocol, so Claude sees them immediately.

```
                    ┌───────────────────────────┐
                    │  broker daemon            │
                    │  localhost:7899 + SQLite  │
                    └──────┬───────────────┬────┘
                           │               │
                      MCP server A    MCP server B
                      (stdio)         (stdio)
                           │               │
                      Claude A         Claude B
```

The broker auto-launches when the first session starts. It cleans up dead peers automatically. Everything is localhost-only.

## What's different from the upstream

`claude-multi-peer` builds on `louislva/claude-peers-mcp` with three fixes for issues that surfaced in long-running multi-session use:

- **`whoami` tool.** The upstream server never exposed the session's own peer ID as a tool, so a session that needed to tell another peer "this is who I am" had to guess or read the raw MCP handshake. `whoami` returns the current ID, working directory, git root, and last-set summary — including a subagent variant when `subagent_role` is passed.
- **Persistent peer IDs across restarts.** On the upstream, every restart mints a fresh random ID, breaking any external mapping (Discord bridges, dashboards, subagent references) that remembered the old one. This fork records `cwd + git_root` on register; on re-registration, if a recently dead peer with the same fingerprint is found within a reuse window (default 24h, override via `CLAUDE_PEERS_ID_REUSE_WINDOW_HOURS`), that ID is reused. If the previous PID is still alive the old ID is not reused. Fresh workspaces still get fresh random IDs.
- **Delivered-message log rotation.** The upstream never purges delivered messages, so the SQLite DB grows unbounded over months of use. This fork adds an hourly sweep that deletes rows where `delivered = 1 AND sent_at < now - TTL` (default 7 days, override via `CLAUDE_PEERS_MESSAGE_TTL_HOURS`). Undelivered messages are never touched by this sweep.

Planned (see [Roadmap](#roadmap)): Discord / Slack / LINE adapters that let a peer route messages via any of those chat platforms without a separate bridge process.

## Auto-summary

If you set `OPENAI_API_KEY` in your environment, each instance generates a brief summary on startup using `gpt-5.4-nano` (costs fractions of a cent). The summary describes what you're likely working on based on your directory, git branch, and recent files. Other instances see this when they call `list_peers`.

Without the API key, Claude sets its own summary via the `set_summary` tool.

## CLI

You can also inspect and interact from the command line:

```bash
cd ~/claude-multi-peer

bun cli.ts status            # broker status + all peers
bun cli.ts peers             # list peers
bun cli.ts send <id> <msg>   # send a message into a Claude session
bun cli.ts kill-broker       # stop the broker
```

## Configuration

| Environment variable                       | Default                    | Description                                                                          |
| ------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------ |
| `CLAUDE_PEERS_PORT`                        | `7899`                     | Broker port                                                                          |
| `CLAUDE_PEERS_DB`                          | `~/.claude-multi-peer.db`  | SQLite database path                                                                 |
| `CLAUDE_PEERS_MESSAGE_TTL_HOURS`           | `168` (7 days)             | Delivered-message rotation TTL                                                       |
| `CLAUDE_PEERS_ID_REUSE_WINDOW_HOURS`       | `24`                       | Reuse a dead peer's ID on re-register within this window (same cwd + git_root)       |
| `BROKER_HEALTH_TIMEOUT_MS`                 | `10000`                    | Broker `/health` probe timeout                                                       |
| `OPENAI_API_KEY`                           | —                          | Enables auto-summary via gpt-5.4-nano                                                |

## Requirements

- [Bun](https://bun.sh)
- Claude Code v2.1.80+
- claude.ai login (channels require it — API key auth won't work)

## Roadmap

- Discord / Slack / LINE adapters — pluggable transports that route a peer's messages via a chat platform, so a human can talk to a session from Discord and vice versa without a separate bridge process
- Optional npm distribution (`bunx claude-multi-peer` install path)
- Subagent (virtual peer) documentation and examples

Contributions welcome — file issues at [github.com/edhiblemeer/claude-multi-peer/issues](https://github.com/edhiblemeer/claude-multi-peer/issues).

## Attribution

Fork of [`louislva/claude-peers-mcp`](https://github.com/louislva/claude-peers-mcp) (MIT). The original design of the broker/server split, the `claude/channel` push protocol, the SQLite peer table, and the CLI shape are all from Louis Arge's project — this fork only adds the features listed above. See `LICENSE` for the dual copyright notice.

## License

MIT — see `LICENSE`.
