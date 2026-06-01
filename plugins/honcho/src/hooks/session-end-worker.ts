#!/usr/bin/env bun
/**
 * Detached SessionEnd upload worker.
 *
 * Spawned (detached, stdio-ignored, unref'd) by the SessionEnd hook so the hook
 * itself can return in milliseconds and never block Claude Code's exit. This
 * process outlives the parent and performs ONLY the network upload to Honcho.
 *
 * Contract:
 *   - upload-only: it must NOT write claude-context.md (the parent already saved
 *     the local summary) and must NEVER write to /dev/tty (it would clobber the
 *     user's shell prompt after Claude Code has exited).
 *   - input comes from a payload file whose path is in HONCHO_SESSION_END_PAYLOAD.
 *   - it is self-bounded: a hung API can only delay it up to the SDK timeout, and
 *     an unref'd hard-stop timer is a final backstop.
 */
import { Honcho } from "@honcho-ai/sdk";
import { readFileSync, unlinkSync, opendirSync, statSync } from "fs";
import { join, dirname } from "path";
import {
  loadConfig,
  getHonchoClientOptions,
  setDetectedHost,
  type HonchoHost,
} from "../config.js";
import { chunkContent } from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";

export interface SessionEndPayloadMessage {
  content: string;
  timestamp?: string;
  isMeaningful?: boolean;
}

export interface SessionEndPayload {
  host: HonchoHost;
  cwd: string;
  sessionName: string;
  instanceId?: string;
  reason: string;
  transcriptCount: number;
  messages: SessionEndPayloadMessage[];
}

/** prune leftover payload files older than the TTL; best-effort, never throws.
 *  streams the directory (opendir) and stops after MAX_SCAN of our own `payload-*`
 *  entries, so a blown-up queue dir can't force an unbounded listing or scan. */
function pruneStalePayloads(queueDir: string, ttlMs = 10 * 60_000): void {
  const MAX_SCAN = 1000;
  let dir;
  try {
    dir = opendirSync(queueDir);
  } catch {
    return; // queue dir may not exist — nothing to prune
  }
  try {
    const now = Date.now();
    let scanned = 0;
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (!entry.name.startsWith("payload-")) continue;
      if (++scanned > MAX_SCAN) break;
      const p = join(queueDir, entry.name);
      try {
        if (now - statSync(p).mtimeMs > ttlMs) unlinkSync(p);
      } catch {
        // ignore individual file errors
      }
    }
  } finally {
    try {
      dir.closeSync();
    } catch {
      // already closed
    }
  }
}

export async function runUploadWorker(payloadPath: string): Promise<void> {
  // outer finally guarantees the payload (which holds conversation text) is
  // removed on EVERY exit path — malformed, config-disabled, success, or error.
  try {
    let payload: SessionEndPayload;
    try {
      payload = JSON.parse(readFileSync(payloadPath, "utf-8")) as SessionEndPayload;
    } catch {
      return; // unreadable/malformed — cleaned up by the outer finally
    }

    // resolve config exactly like the hook would (host drives workspace/aiPeer).
    setDetectedHost(payload.host);
    const config = loadConfig();
    if (!config || config.enabled === false) return;

    setLogContext(payload.cwd, payload.sessionName);
    logHook("session-end-worker", "Uploading session memory", { reason: payload.reason });

    try {
      const honcho = new Honcho(getHonchoClientOptions(config));
      const [session, aiPeer] = await Promise.all([
        honcho.session(payload.sessionName),
        honcho.peer(config.aiPeer),
      ]);

      const includeAssistant = config.saveMessages !== false && payload.messages.length > 0;
      const aiMessages = includeAssistant
        ? payload.messages.flatMap((msg) =>
            chunkContent(msg.content).map((chunk) =>
              aiPeer.message(chunk, {
                createdAt: msg.timestamp,
                metadata: {
                  instance_id: payload.instanceId || undefined,
                  type: msg.isMeaningful ? "assistant_prose" : "assistant_brief",
                  meaningful: msg.isMeaningful || false,
                  session_affinity: payload.sessionName,
                },
              }),
            ),
          )
        : [];

      const endMarker = aiPeer.message(
        `[Session ended] Reason: ${payload.reason}, Messages: ${payload.transcriptCount}, Time: ${new Date().toISOString()}`,
        {
          createdAt: new Date().toISOString(),
          metadata: {
            instance_id: payload.instanceId || undefined,
            session_affinity: payload.sessionName,
          },
        },
      );

      const meaningfulCount = payload.messages.filter((m) => m.isMeaningful).length;
      logApiCall(
        "session.addMessages",
        "POST",
        `${aiMessages.length} assistant (${meaningfulCount} meaningful) + 1 marker`,
      );
      await session.addMessages([...aiMessages, endMarker]);
      logHook("session-end-worker", "Session memory uploaded");
    } catch (error) {
      logHook("session-end-worker", `Upload failed: ${error}`, { error: String(error) });
    }
  } finally {
    try {
      unlinkSync(payloadPath);
    } catch {
      // already gone
    }
    pruneStalePayloads(dirname(payloadPath));
  }
}

if (import.meta.main) {
  const payloadPath = process.env.HONCHO_SESSION_END_PAYLOAD;
  // final backstop: never let a hung socket keep this process alive forever.
  // force-exit bypasses runUploadWorker's finally, so unlink the payload here too.
  const hardStop = setTimeout(() => {
    if (payloadPath) {
      try {
        unlinkSync(payloadPath);
      } catch {
        // already gone
      }
    }
    process.exit(0);
  }, 20_000);
  hardStop.unref();
  if (payloadPath) {
    await runUploadWorker(payloadPath);
  }
  process.exit(0);
}
