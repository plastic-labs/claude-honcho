#!/usr/bin/env bun
/**
 * Backfill runner — imports local Claude Code session transcripts into Honcho.
 *
 * Scans ~/.claude/projects/<dir>/<uuid>.jsonl within a recency window, rebuilds
 * each conversation, names sessions with the same rules as the live hooks, and
 * uploads with the original message timestamps.
 *
 * Usage:
 *   bun run backfill-runner.ts [--days N] [--workspace NAME] [--dry-run] [--yes]
 *   --days N          transcripts modified in the last N days (default 30)
 *   --workspace NAME  target workspace (default: configured workspace)
 *   --dry-run         print the plan without uploading
 *   --yes             reserved; non-interactive, uploads unless --dry-run
 */
import { Honcho } from "@honcho-ai/sdk";
import {
  loadConfig,
  getHonchoClientOptions,
  getObservationMode,
  deriveSessionName,
  getConfigDir,
  setDetectedHost,
  type SessionStrategy,
} from "../config.js";
import { addMessagesBatched, chunkContent } from "../cache.js";
import { parseTranscriptForBackfill, type ParsedMessage } from "./transcript-parse.js";
import * as s from "../styles.js";
import { homedir } from "os";
import { join, basename } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";

interface Args {
  days: number;
  workspace?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 30, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--yes") { /* reserved, non-interactive */ }
    else if (a === "--days") args.days = parseInt(argv[++i] ?? "30", 10) || 30;
    else if (a.startsWith("--days=")) args.days = parseInt(a.slice("--days=".length), 10) || 30;
    else if (a === "--workspace") args.workspace = argv[++i];
    else if (a.startsWith("--workspace=")) args.workspace = a.slice("--workspace=".length);
  }
  return args;
}

const PROJECTS_DIR = join(homedir(), ".claude", "projects");
const STATE_FILE = join(getConfigDir(), "backfill-state.json");

/** Idempotency ledger: which (workspace, transcript@mtime) pairs already imported. */
interface BackfillState {
  imported: Record<string, number>; // key `${workspace}::${transcriptPath}` -> mtimeMs
}

function loadState(): BackfillState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { imported: {} };
  }
}

function saveState(state: BackfillState): void {
  if (!existsSync(getConfigDir())) mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** All transcript files under ~/.claude/projects modified within `days`. */
export function findTranscripts(days: number): Array<{ path: string; mtimeMs: number }> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const out: Array<{ path: string; mtimeMs: number }> = [];
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const dirPath = join(PROJECTS_DIR, dir);
    let entries: string[];
    try {
      if (!statSync(dirPath).isDirectory()) continue;
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(dirPath, file);
      try {
        const st = statSync(path);
        if (st.mtimeMs >= cutoff) out.push({ path, mtimeMs: st.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return out;
}

interface SessionGroup {
  name: string;
  messages: Array<ParsedMessage & { sourceTranscript: string }>;
}

/** Group all messages into Honcho sessions, naming each via the configured strategy
 *  and per-message cwd/branch (+ the transcript uuid for chat-instance). */
export function groupIntoSessions(
  transcripts: Array<{ path: string; mtimeMs: number }>,
  strategy: SessionStrategy,
  peerName: string | undefined,
  sessionPeerPrefix: boolean | undefined,
  sessionOverrides: Record<string, string> = {}
): { groups: Map<string, SessionGroup>; parsed: number; empty: number } {
  const groups = new Map<string, SessionGroup>();
  let parsed = 0;
  let empty = 0;

  for (const { path } of transcripts) {
    const { messages, cwd: tCwd, gitBranch: tBranch, sessionId } = parseTranscriptForBackfill(path);
    if (messages.length === 0) {
      empty++;
      continue;
    }
    parsed++;
    const source = basename(path);
    for (const msg of messages) {
      const cwd = msg.cwd || tCwd;
      if (!cwd) continue; // can't name a session without a directory
      // Honor manual per-directory overrides exactly as getSessionName() does,
      // so backfilled sessions share names with future live sessions.
      const name =
        strategy === "per-directory" && sessionOverrides[cwd]
          ? sessionOverrides[cwd]
          : deriveSessionName(strategy, cwd, {
              peerName,
              sessionPeerPrefix,
              branch: msg.gitBranch || tBranch,
              instanceId: sessionId,
            });
      let group = groups.get(name);
      if (!group) {
        group = { name, messages: [] };
        groups.set(name, group);
      }
      group.messages.push({ ...msg, sourceTranscript: source });
    }
  }
  return { groups, parsed, empty };
}

async function run(): Promise<void> {
  setDetectedHost("claude_code");
  const args = parseArgs(process.argv.slice(2));

  console.log("");
  console.log(s.header("honcho backfill"));
  console.log("");

  const config = loadConfig();
  if (!config) {
    console.log(s.warn("No Honcho config found — run /honcho:setup first."));
    process.exit(1);
  }

  const targetWorkspace = args.workspace || config.workspace;
  const strategy: SessionStrategy = config.sessionStrategy ?? "per-directory";

  console.log(`  ${s.label("Workspace")}:   ${targetWorkspace}${args.workspace ? s.dim("  (override)") : ""}`);
  console.log(`  ${s.label("Strategy")}:    ${strategy}`);
  console.log(`  ${s.label("Window")}:      last ${args.days} days`);
  console.log(`  ${s.label("User peer")}:   ${config.peerName}`);
  console.log(`  ${s.label("AI peer")}:     ${config.aiPeer}`);
  console.log("");

  // Discover + filter transcripts
  const allTranscripts = findTranscripts(args.days);
  const state = loadState();
  const already = allTranscripts.filter((t) => state.imported[`${targetWorkspace}::${t.path}`] === t.mtimeMs);
  const todo = allTranscripts.filter((t) => state.imported[`${targetWorkspace}::${t.path}`] !== t.mtimeMs);

  console.log(s.section("Scanning transcripts"));
  console.log(s.listItem(`${allTranscripts.length} transcript(s) in window`));
  if (already.length > 0) {
    console.log(s.listItem(s.dim(`${already.length} already imported into ${targetWorkspace} — skipping`)));
  }
  if (todo.length === 0) {
    console.log("");
    console.log(s.success("Nothing new to import."));
    process.exit(0);
  }

  // Group into sessions
  const { groups, parsed, empty } = groupIntoSessions(
    todo,
    strategy,
    config.peerName,
    config.sessionPeerPrefix,
    config.sessions ?? {}
  );
  const totalMessages = [...groups.values()].reduce((n, g) => n + g.messages.length, 0);

  console.log(s.listItem(`${parsed} transcript(s) with content${empty ? s.dim(` (${empty} empty, skipped)`) : ""}`));
  console.log(s.listItem(`${groups.size} session(s), ${totalMessages} message(s) to upload`));
  console.log("");

  // Show a preview of session names + counts (cap the printed list)
  console.log(s.section("Sessions"));
  const sorted = [...groups.values()].sort((a, b) => b.messages.length - a.messages.length);
  for (const g of sorted.slice(0, 15)) {
    console.log(s.listItem(`${g.name} ${s.dim(`(${g.messages.length} msg)`)}`));
  }
  if (sorted.length > 15) console.log(s.listItem(s.dim(`… and ${sorted.length - 15} more`)));
  console.log("");

  if (args.dryRun) {
    console.log(s.success("Dry run — no messages uploaded."));
    process.exit(0);
  }

  // Upload
  const opts = getHonchoClientOptions(config);
  opts.workspaceId = targetWorkspace;
  // Backfilling large histories: give the network more headroom than the hooks.
  opts.timeout = 60_000;
  opts.maxRetries = 3;
  const honcho = new Honcho(opts);
  const observationMode = getObservationMode(config);

  console.log(s.section(`Uploading to ${targetWorkspace}`));

  let uploadedSessions = 0;
  let uploadedMessages = 0;
  const errors: string[] = [];

  for (const g of sorted) {
    try {
      const [session, userPeer, aiPeer] = await Promise.all([
        honcho.session(g.name),
        honcho.peer(config.peerName),
        honcho.peer(config.aiPeer),
      ]);

      const peers: Parameters<typeof session.addPeers>[0] =
        observationMode === "directional" ? [userPeer, [aiPeer, { observeOthers: true }]] : [userPeer, aiPeer];
      await session.addPeers(peers);

      const fallbackTs = new Date().toISOString();
      const messages = g.messages.flatMap((m) => {
        const peer = m.role === "user" ? userPeer : aiPeer;
        return chunkContent(m.content).map((chunk) =>
          peer.message(chunk, {
            createdAt: m.timestamp || fallbackTs,
            metadata: {
              backfill: true,
              source_transcript: m.sourceTranscript,
              session_affinity: g.name,
              type: m.role === "assistant"
                ? (m.isResponse ? "assistant_response" : "assistant_intermediate")
                : undefined,
            },
          })
        );
      });

      await addMessagesBatched(session, messages);
      uploadedSessions++;
      uploadedMessages += g.messages.length;
      console.log(s.listItem(s.success(`${g.name} ${s.dim(`(${g.messages.length} msg)`)}`)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${g.name}: ${msg}`);
      console.log(s.listItem(s.warn(`${g.name} — ${msg}`)));
    }
  }

  // Only mark imported on a fully clean run; leave failures unmarked so a re-run retries.
  if (errors.length === 0) {
    for (const t of todo) {
      state.imported[`${targetWorkspace}::${t.path}`] = t.mtimeMs;
    }
    saveState(state);
  }

  console.log("");
  console.log(
    s.success(
      `Imported ${uploadedMessages} message(s) across ${uploadedSessions} session(s) into ${targetWorkspace}.`
    )
  );
  if (errors.length > 0) {
    console.log(s.warn(`${errors.length} session(s) failed — re-run to retry (not marked complete).`));
  }
  console.log("");
}

// Only auto-run when invoked directly; the guard lets other modules import
// findTranscripts/groupIntoSessions without triggering an upload.
if (import.meta.main) {
  run().catch((err) => {
    console.log(s.error(`Backfill failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
}
