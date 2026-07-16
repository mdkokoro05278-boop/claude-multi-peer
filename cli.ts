#!/usr/bin/env bun
/**
 * claude-peers CLI
 *
 * Utility commands for managing the broker and inspecting peers.
 *
 * Usage:
 *   bun cli.ts status          — Show broker status and all peers
 *   bun cli.ts peers           — List all peers
 *   bun cli.ts send <id> <msg> — Send a message to a peer
 *   bun cli.ts kill-broker     — Stop the broker daemon
 */

const BROKER_PORT = parseInt(process.env.CLAUDE_PEERS_PORT ?? "7899", 10);
const BROKER_URL = `http://127.0.0.1:${BROKER_PORT}`;
const PEERS_TOKEN = process.env.CLAUDE_PEERS_TOKEN ?? "";

async function brokerFetch<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = body
    ? {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Peers-Token": PEERS_TOKEN,
        },
        body: JSON.stringify(body),
      }
    : {};
  const res = await fetch(`${BROKER_URL}${path}`, {
    ...opts,
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

const cmd = process.argv[2];

switch (cmd) {
  case "status": {
    try {
      const health = await brokerFetch<{ status: string }>("/health");
      const peers = await brokerFetch<
        Array<{
          id: string;
          pid: number;
          cwd: string;
          git_root: string | null;
          tty: string | null;
          summary: string;
          last_seen: string;
        }>
      >("/list-peers", {
        scope: "machine",
        cwd: "/",
        git_root: null,
        exclude_id: null,
      });

      console.log(`Broker: ${health.status} (${peers.length} peer(s) registered)`);
      console.log(`URL: ${BROKER_URL}`);

      if (peers.length > 0) {
        console.log("\nPeers:");
        for (const p of peers) {
          console.log(`  ${p.id}  PID:${p.pid}  ${p.cwd}`);
          if (p.summary) console.log(`         ${p.summary}`);
          if (p.tty) console.log(`         TTY: ${p.tty}`);
          console.log(`         Last seen: ${p.last_seen}`);
        }
      }
    } catch {
      console.log("Broker is not running.");
    }
    break;
  }

  case "peers": {
    try {
      const peers = await brokerFetch<
        Array<{
          id: string;
          pid: number;
          cwd: string;
          git_root: string | null;
          tty: string | null;
          summary: string;
          last_seen: string;
        }>
      >("/list-peers", {
        scope: "machine",
        cwd: "/",
        git_root: null,
      });

      if (peers.length === 0) {
        console.log("No peers registered.");
      } else {
        for (const p of peers) {
          const parts = [`${p.id}  PID:${p.pid}  ${p.cwd}`];
          if (p.summary) parts.push(`  Summary: ${p.summary}`);
          console.log(parts.join("\n"));
        }
      }
    } catch {
      console.log("Broker is not running.");
    }
    break;
  }

  case "send": {
    const toId = process.argv[3];
    const msg = process.argv.slice(4).join(" ");
    if (!toId || !msg) {
      console.error("Usage: bun cli.ts send <peer-id> <message>");
      process.exit(1);
    }
    try {
      const result = await brokerFetch<{ ok: boolean; error?: string }>("/send-message", {
        from_id: "cli",
        to_id: toId,
        text: msg,
      });
      if (result.ok) {
        console.log(`Message sent to ${toId}`);
      } else {
        console.error(`Failed: ${result.error}`);
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    break;
  }

  case "kill-broker": {
    try {
      await brokerFetch<{ status: string }>("/health");
      console.log("Broker is running. Shutting down...");

      // Windows has no lsof. Resolve the PID bound to BROKER_PORT via
      // Get-NetTCPConnection, confirm the process is actually a bun process
      // (safety check — never kill an unrelated process on the port), then stop it.
      const psScript = `
        $conns = Get-NetTCPConnection -LocalPort ${BROKER_PORT} -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
          $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
          if ($proc -and $proc.ProcessName -match '^bun(\\.exe)?$') {
            Write-Output $proc.Id
          }
        }
      `;
      const proc = Bun.spawnSync([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psScript,
      ]);
      const pids = new TextDecoder()
        .decode(proc.stdout)
        .trim()
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter((p) => /^\d+$/.test(p));

      if (pids.length === 0) {
        console.log(
          `No bun process found listening on port ${BROKER_PORT}; not killing anything.`
        );
        break;
      }

      for (const pid of pids) {
        Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${pid} -Force`]);
      }
      console.log(`Broker stopped (PID(s): ${pids.join(", ")}).`);
    } catch {
      console.log("Broker is not running.");
    }
    break;
  }

  default:
    console.log(`claude-peers CLI

Usage:
  bun cli.ts status          Show broker status and all peers
  bun cli.ts peers           List all peers
  bun cli.ts send <id> <msg> Send a message to a peer
  bun cli.ts kill-broker     Stop the broker daemon`);
}
