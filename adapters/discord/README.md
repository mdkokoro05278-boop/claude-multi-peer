# Discord adapter

Bridges Discord channels to `claude-multi-peer` sessions. A person on Discord can talk
to any running Claude Code session by posting in the channel mapped to that session's
peer ID, and any session can post back to Discord by sending a message to
`adapter:discord:<channel_id>`.

## Setup

1. Create a Discord application and bot at https://discord.com/developers/applications.
   Enable **Message Content Intent** on the Bot page. Invite the bot to your server with
   at least `View Channels`, `Read Message History`, and `Send Messages` permissions.
2. Copy `.env.example` to `.env` in this directory and fill in `DISCORD_BOT_TOKEN` and
   `CLAUDE_PEERS_DISCORD_CHANNEL_MAP` (a JSON object mapping Discord channel IDs to
   claude-multi-peer peer IDs).
3. Start the broker if it isn't already running:

   ```bash
   bun broker.ts
   ```

4. Start the Discord adapter:

   ```bash
   cd adapters/discord
   bun bot.ts
   ```

## Direction: Discord → peer (inbound)

When someone posts in a mapped channel, the adapter forwards the text to the mapped
peer via the broker's `/adapter-deliver` endpoint. The peer receives it like any other
peer message; its `from_id` will be `adapter:discord:<channel_id>` so it can reply back
to the same channel.

## Direction: peer → Discord (outbound)

A peer sends a message to Discord by calling `send_message` with:

- `to_id`: `adapter:discord:<channel_id>`
- `message`: the text to post

The broker queues these under the `discord` adapter namespace. This adapter polls the
queue (`/adapter-poll`) and posts each message to the corresponding Discord channel.

## Discovering peer IDs

Run `bun cli.ts peers` from the repo root to list every running peer, or ask any
running session to call the `whoami` MCP tool. Both return peer IDs suitable for the
channel map.

## Failure modes

The adapter logs errors to stderr and keeps running:

- Broker unavailable at startup: the process retries for 15 s then exits.
- Discord channel not sendable (bot missing access): the message is dropped and logged.
- Inbound target peer not registered: `/adapter-deliver` returns an error and the
  message is dropped (the human sees no reply on Discord).
- Outbound messages are marked delivered as soon as the adapter reads them from the
  queue, so a mid-post crash may lose them. A future revision could switch to
  ack-on-post semantics.
