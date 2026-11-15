/**
 * Backfill runner — imports local Claude Code session transcripts into Honcho.
 *
 * Scans ~/.claude/projects/<dir>/<uuid>.jsonl within a recency window, rebuilds
 * each conversation, names sessions by Claude Code session id like the live hooks, and
 * uploads with the original message timestamps.
 *
 * A transcript recorded under a repo-local .honcho/config.json goes where the
 * live hooks would have sent it: that project's workspace, server, credential,
 * peers and session name. Projects whose config turns saving off are skipped.
 *
 * Usage:
 *   bun run backfill-runner.ts [--days N] [--workspace NAME] [--dry-run] [--yes]
 *   --days N          transcripts modified in the last N days (default 30)
 *   --workspace NAME  target workspace (default: configured workspace)
 *   --dry-run         print the plan without uploading
 *   --yes             reserved; non-interactive, uploads unless --dry-run
 */
import type { Honcho } from "@honcho-ai/sdk";
import {
  loadConfig,
  loadConfigFor,
  sanitizeForSessionName,
  getConfigDir,
  getDetectedHost,
  setDetectedHost,
  type HonchoCLAUDEConfig,
} from "../config.js";
import { addMessagesBatched, chunkContent } from "../cache.js";
import { createHonchoClient, openSession } from "../honcho-client.js";
import { parseTranscriptForBackfill, findTranscripts, transcriptCwd, type ParsedMessage } from "./transcript-parse.js";
import { getSessionScopes } from "../git.js";
import { localContextFor, localSessionName, setLocalConfigContext, type LocalContext } from "../local-config.js";
import * as s from "../styles.js";
import { join, basename } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

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

const STATE_FILE = join(getConfigDir(), "backfill-state.json");

/** Idempotency ledger: which (workspace, transcript@mtime) pairs already imported, and
 *  which chats the hooks save as they happen, so an import never uploads them twice. */
interface BackfillState {
  imported: Record<string, number>; // key `${workspace}::${transcriptPath}` -> mtimeMs
  live?: Record<string, number>; // key `${workspace}::${sessionName}` -> when its session start ran
}

/** Record that the hooks save this chat as it happens (its session start ran). */
export function recordLiveSession(workspace: string, sessionName: string): void {
  const state = loadState();
  (state.live ??= {})[`${workspace}::${sessionName}`] = Date.now();
  saveState(state);
}

/** Whether a session start recorded this chat (see recordLiveSession). */
export function isLiveSession(workspace: string, sessionName: string, state: BackfillState = loadState()): boolean {
  return !!state.live?.[`${workspace}::${sessionName}`];
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

/** Where one transcript's messages go. */
export interface ImportTarget {
  /** Credential, server, workspace and peers to upload with. */
  config: HonchoCLAUDEConfig;
  /** Identifies the destination; groups never mix destinations. */
  key: string;
  /** Ledger key prefix: the workspace, plus the server when it isn't the global one. */
  ledger: string;
  /** The repo-local config that chose this destination, if any. */
  local: LocalContext | null;
}

interface SessionGroup {
  name: string;
  scopes: string[];
  /** Shared by several chats (a repo-local pin), so it may already hold messages. */
  shared: boolean;
  target?: ImportTarget;
  messages: Array<ParsedMessage & { sourceTranscript: string }>;
}

/** One Honcho session per transcript, named by its Claude Code session id like
 *  the live hooks, or by the session a repo-local config shares between chats.
 *  `isLive` leaves out chats the hooks already saved. */
export function groupIntoSessions(
  transcripts: Array<{ path: string; mtimeMs: number; target?: ImportTarget }>,
  isLive?: (target: ImportTarget | undefined, chatName: string) => boolean,
): { groups: Map<string, SessionGroup>; parsed: number; empty: number; live: string[] } {
  const groups = new Map<string, SessionGroup>();
  const live = new Set<string>();
  let parsed = 0;
  let empty = 0;

  for (const { path, target } of transcripts) {
    const { messages, sessionId, cwd } = parseTranscriptForBackfill(path);
    if (messages.length === 0) {
      empty++;
      continue;
    }
    parsed++;
    const source = basename(path);
    const chatName = sanitizeForSessionName(sessionId || basename(path, ".jsonl"));
    if (isLive?.(target, chatName)) {
      live.add(chatName);
      continue;
    }
    const pinned = localSessionName(target?.local ?? null, cwd);
    const name = pinned ? sanitizeForSessionName(pinned) : chatName;
    const key = target ? `${target.key}\u0000${name}` : name;
    let group = groups.get(key);
    if (!group) {
      group = { name, scopes: cwd ? getSessionScopes(cwd) : [], shared: !!pinned, target, messages: [] };
      groups.set(key, group);
    }
    for (const msg of messages) group.messages.push({ ...msg, sourceTranscript: source });
  }
  return { groups, parsed, empty, live: [...live] };
}

/**
 * Resolves each transcript's destination from its working directory: the
 * repo-local config covering it, else the global config. Null when the
 * project's config keeps its messages out of Honcho, or has no credential.
 */
function makeTargetResolver(globalConfig: HonchoCLAUDEConfig | null, workspaceOverride?: string) {
  const host = getDetectedHost();
  const memo = new Map<string, ImportTarget | null>();
  const make = (config: HonchoCLAUDEConfig | null, local: LocalContext | null): ImportTarget | null => {
    if (!config) return null;
    const workspace = workspaceOverride || config.workspace;
    const sameServer = !!globalConfig && config.baseUrl === globalConfig.baseUrl;
    return {
      config: { ...config, workspace },
      key: JSON.stringify([config.baseUrl, workspace, config.peerName, config.aiPeer, config.apiKey]),
      ledger: sameServer ? workspace : `${config.baseUrl}#${workspace}`,
      local,
    };
  };
  const globalTarget = make(globalConfig, null);
  return (cwd: string | undefined): ImportTarget | null | "off" => {
    const local = cwd ? localContextFor(cwd, host) : null;
    if (!local) return globalTarget;
    if (local.settings.enabled === false || local.settings.saveMessages === false) return "off";
    if (!memo.has(local.path)) memo.set(local.path, make(loadConfigFor(local, host), local));
    return memo.get(local.path)!;
  };
}

export async function run(): Promise<void> {
  setDetectedHost("claude_code");
  const args = parseArgs(process.argv.slice(2));

  console.log("");
  console.log(s.header("honcho backfill"));
  console.log("");

  // Transcripts come from every project, so the runner's own directory picks no
  // destination: each transcript's project decides (see makeTargetResolver).
  setLocalConfigContext(null, getDetectedHost());
  const config = loadConfig();
  // A repo-local config can hold the only credential; its own transcripts still import.
  setLocalConfigContext(process.cwd(), getDetectedHost());
  const shown = config ?? loadConfig();
  setLocalConfigContext(null, getDetectedHost());
  if (!shown) {
    console.log(s.warn("No Honcho config found — run /honcho setup first."));
    process.exit(1);
  }

  const targetWorkspace = args.workspace || shown.workspace;

  console.log(`  ${s.label("Workspace")}:   ${targetWorkspace}${args.workspace ? s.dim("  (override)") : ""}`);
  console.log(`  ${s.label("Window")}:      last ${args.days} days`);
  console.log(`  ${s.label("User peer")}:   ${shown.peerName}`);
  console.log(`  ${s.label("AI peer")}:     ${shown.aiPeer}`);
  console.log("");

  // Discover, route, and filter transcripts
  const allTranscripts = findTranscripts(args.days);
  const state = loadState();
  const targetFor = makeTargetResolver(config, args.workspace);
  const routed: Array<{ path: string; mtimeMs: number; target: ImportTarget }> = [];
  let off = 0;
  let unroutable = 0;
  for (const t of allTranscripts) {
    const target = targetFor(transcriptCwd(t.path));
    if (target === "off") off++;
    else if (!target) unroutable++;
    else routed.push({ ...t, target });
  }
  const done = (t: (typeof routed)[number]) => state.imported[`${t.target.ledger}::${t.path}`] === t.mtimeMs;
  const already = routed.filter(done);
  const todo = routed.filter((t) => !done(t));

  console.log(s.section("Scanning transcripts"));
  console.log(s.listItem(`${allTranscripts.length} transcript(s) in window`));
  if (already.length > 0) {
    const into = already.every((t) => !t.target.local) ? ` into ${targetWorkspace}` : "";
    console.log(s.listItem(s.dim(`${already.length} already imported${into} — skipping`)));
  }
  if (off > 0) {
    console.log(s.listItem(s.dim(`${off} from projects whose .honcho/config.json turns saving off — skipping`)));
  }
  if (unroutable > 0) {
    console.log(s.listItem(s.warn(`${unroutable} with no Honcho credential for their project — skipping`)));
  }
  if (todo.length === 0) {
    console.log("");
    console.log(s.success("Nothing new to import."));
    process.exit(0);
  }

  // Group into sessions, leaving out chats the hooks already saved (this one included)
  const { groups, parsed, empty, live } = groupIntoSessions(
    todo,
    (target, chatName) => isLiveSession(target?.config.workspace ?? targetWorkspace, chatName, state),
  );
  const totalMessages = [...groups.values()].reduce((n, g) => n + g.messages.length, 0);

  console.log(s.listItem(`${parsed} transcript(s) with content${empty ? s.dim(` (${empty} empty, skipped)`) : ""}`));
  if (live.length > 0) {
    console.log(s.listItem(s.dim(`${live.length} chat(s) the plugin already saved as they happened — skipping`)));
  }
  if (groups.size === 0) {
    console.log("");
    console.log(s.success("Nothing new to import."));
    process.exit(0);
  }
  console.log(s.listItem(`${groups.size} session(s), ${totalMessages} message(s) to upload`));
  console.log("");

  // Show a preview of session names + counts (cap the printed list)
  console.log(s.section("Sessions"));
  const sorted = [...groups.values()].sort((a, b) => b.messages.length - a.messages.length);
  const workspaces = [...new Set(sorted.map((g) => g.target!.config.workspace))];
  for (const g of sorted.slice(0, 15)) {
    const where = workspaces.length > 1 ? s.dim(`  → ${g.target!.config.workspace}`) : "";
    console.log(s.listItem(`${g.name} ${s.dim(`(${g.messages.length} msg)`)}${where}`));
  }
  if (sorted.length > 15) console.log(s.listItem(s.dim(`… and ${sorted.length - 15} more`)));
  console.log("");

  if (args.dryRun) {
    console.log(s.success("Dry run — no messages uploaded."));
    process.exit(0);
  }

  // Upload
  // Backfilling large histories: give the network more headroom than the hooks.
  const clients = new Map<string, Promise<Honcho>>();
  const clientFor = (target: ImportTarget): Promise<Honcho> => {
    let client = clients.get(target.key);
    if (!client) {
      client = createHonchoClient(target.config, { workspaceId: target.config.workspace, timeout: 60_000, maxRetries: 3 });
      clients.set(target.key, client);
    }
    return client;
  };

  console.log(s.section(`Uploading to ${workspaces.join(", ")}`));

  let uploadedSessions = 0;
  let uploadedMessages = 0;
  const errors: string[] = [];
  const failedTargets = new Set<string>();

  for (const g of sorted) {
    const target = g.target!;
    try {
      const honcho = await clientFor(target);
      const [session, userPeer, aiPeer] = await Promise.all([
        g.scopes.length ? openSession(honcho, g.name, g.scopes, g.shared) : honcho.session(g.name),
        honcho.peer(target.config.peerName),
        honcho.peer(target.config.aiPeer),
      ]);

      await session.addPeers([userPeer, aiPeer]);

      const fallbackTs = new Date().toISOString();
      const messages = g.messages.flatMap((m) => {
        const peer = m.role === "user" ? userPeer : aiPeer;
        return chunkContent(m.content).map((chunk) =>
          peer.message(chunk, {
            createdAt: m.timestamp || fallbackTs,
            metadata: {
              backfill: true,
              source_transcript: m.sourceTranscript,
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
      failedTargets.add(target.key);
      console.log(s.listItem(s.warn(`${g.name} — ${msg}`)));
    }
  }

  // Mark a destination's transcripts imported only when all of its sessions
  // uploaded; leave failures unmarked so a re-run retries.
  // Re-read: a session start may have recorded a live chat while this ran.
  const latest = loadState();
  for (const t of todo) {
    if (!failedTargets.has(t.target.key)) latest.imported[`${t.target.ledger}::${t.path}`] = t.mtimeMs;
  }
  saveState(latest);

  console.log("");
  console.log(
    s.success(
      `Imported ${uploadedMessages} message(s) across ${uploadedSessions} session(s) into ${workspaces.join(", ")}.`
    )
  );
  if (errors.length > 0) {
    console.log(s.warn(`${errors.length} session(s) failed — re-run to retry (not marked complete).`));
  }
  console.log("");
}

/** Entry point: runs the backfill and reports a failure as exit 1. */
export async function main(): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.log(s.error(`Backfill failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}
