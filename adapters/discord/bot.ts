#!/usr/bin/env bun
/**
 * Discord adapter for claude-multi-peer.
 *
 * Runs as a standalone process, alongside the broker daemon. Bridges Discord channels
 * to peer sessions so a human on Discord can talk to any peer, and any peer can post
 * back to Discord by sending a message to `adapter:discord:<channel_id>`.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=xxx CLAUDE_PEERS_DISCORD_CHANNEL_MAP='{"1234":"abcd1234"}' bun adapters/discord/bot.ts
 *
 * Or drop a .env file in this directory (see .env.example) and Bun will auto-load it.
 */

import { Client, GatewayIntentBits, Events, TextChannel } from "discord.js";

const BROKER_PORT = parseInt(process.env.CLAUDE_PEERS_PORT ?? "7899", 10);
const BROKER_URL = `http://127.0.0.1:${BROKER_PORT}`;

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error(
    "[discord-adapter] DISCORD_BOT_TOKEN is required. Set it in the environment or a .env file."
  );
  process.exit(1);
}

// channel_id -> peer_id (Discord messages in this channel are forwarded to that peer)
const RAW_MAP = process.env.CLAUDE_PEERS_DISCORD_CHANNEL_MAP ?? "{}";
let CHANNEL_TO_PEER: Record<string, string>;
try {
  CHANNEL_TO_PEER = JSON.parse(RAW_MAP);
} catch (e) {
  console.error(
    `[discord-adapter] CLAUDE_PEERS_DISCORD_CHANNEL_MAP is not valid JSON: ${e instanceof Error ? e.message : e}`
  );
  process.exit(1);
}
if (Object.keys(CHANNEL_TO_PEER).length === 0) {
  console.error(
    "[discord-adapter] CLAUDE_PEERS_DISCORD_CHANNEL_MAP has no entries. The adapter will still run for outbound only."
  );
}

// How often to poll the broker for outbound queued messages (peer -> Discord).
const OUTBOUND_POLL_INTERVAL_MS = parseInt(
  process.env.DISCORD_ADAPTER_POLL_MS ?? "1500",
  10
);

async function brokerPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BROKER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Broker ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function waitForBroker(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BROKER_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) return;
    } catch {
      // fall through
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `[discord-adapter] broker at ${BROKER_URL} did not become ready. Start it first: bun broker.ts`
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.error(`[discord-adapter] logged in as ${c.user.tag}`);
  console.error(
    `[discord-adapter] channel map: ${Object.keys(CHANNEL_TO_PEER).length} entries`
  );
});

// --- Inbound: Discord -> peer ---
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return; // ignore other bots and self
  const peerId = CHANNEL_TO_PEER[msg.channelId];
  if (!peerId) return; // channel not mapped
  const fromId = `adapter:discord:${msg.channelId}`;
  const text = `[Discord] ${msg.author.username}: ${msg.content}`;
  try {
    const r = await brokerPost<{ ok: boolean; error?: string }>(
      "/adapter-deliver",
      { from_id: fromId, to_id: peerId, text }
    );
    if (!r.ok) {
      console.error(
        `[discord-adapter] inbound deliver failed (channel=${msg.channelId} peer=${peerId}): ${r.error}`
      );
    }
  } catch (e) {
    console.error(
      `[discord-adapter] inbound deliver threw: ${e instanceof Error ? e.message : e}`
    );
  }
});

// --- Outbound: peer -> Discord (drain broker queue) ---
async function drainOutbound(): Promise<void> {
  try {
    const { messages } = await brokerPost<{
      messages: Array<{
        id: number;
        from_id: string;
        to_id: string;
        text: string;
      }>;
    }>("/adapter-poll", { adapter: "discord" });
    for (const m of messages) {
      // to_id shape: "adapter:discord:<channel_id>"
      const parts = m.to_id.split(":");
      const channelId = parts[2];
      if (!channelId) {
        console.error(
          `[discord-adapter] skipping malformed to_id ${m.to_id}`
        );
        continue;
      }
      try {
        const ch = await client.channels.fetch(channelId);
        if (!ch || !("send" in ch)) {
          console.error(
            `[discord-adapter] channel ${channelId} not sendable (missing bot access?)`
          );
          continue;
        }
        await (ch as TextChannel).send(m.text);
      } catch (e) {
        console.error(
          `[discord-adapter] outbound post failed (channel=${channelId}): ${e instanceof Error ? e.message : e}`
        );
      }
    }
  } catch (e) {
    console.error(
      `[discord-adapter] outbound drain threw: ${e instanceof Error ? e.message : e}`
    );
  }
}

async function main() {
  await waitForBroker();
  await client.login(TOKEN);
  setInterval(drainOutbound, OUTBOUND_POLL_INTERVAL_MS);
}

main().catch((e) => {
  console.error(
    `[discord-adapter] fatal: ${e instanceof Error ? e.stack ?? e.message : e}`
  );
  process.exit(1);
});
