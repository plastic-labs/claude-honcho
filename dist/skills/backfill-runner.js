#!/usr/bin/env bun
import {
  parseTranscriptForBackfill
} from "../chunk-jgtvcc65.js";
import {
  dim,
  error,
  header,
  label,
  listItem,
  require_dist,
  section,
  success,
  warn
} from "../chunk-d2gc13m0.js";
import"../chunk-xdntcesh.js";
import {
  __toESM,
  addMessagesBatched,
  chunkContent,
  deriveSessionName,
  getConfigDir,
  getHonchoClientOptions,
  getObservationMode,
  loadConfig,
  setDetectedHost
} from "../chunk-gnp95nzg.js";

// src/skills/backfill-runner.ts
var import_sdk = __toESM(require_dist(), 1);
import { homedir } from "os";
import { join, basename } from "path";
import { pathToFileURL } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
function parseArgs(argv) {
  const args = { days: 30, dryRun: false };
  for (let i = 0;i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run")
      args.dryRun = true;
    else if (a === "--yes") {} else if (a === "--days")
      args.days = parseInt(argv[++i] ?? "30", 10) || 30;
    else if (a.startsWith("--days="))
      args.days = parseInt(a.slice("--days=".length), 10) || 30;
    else if (a === "--workspace")
      args.workspace = argv[++i];
    else if (a.startsWith("--workspace="))
      args.workspace = a.slice("--workspace=".length);
  }
  return args;
}
var PROJECTS_DIR = join(homedir(), ".claude", "projects");
var STATE_FILE = join(getConfigDir(), "backfill-state.json");
function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { imported: {} };
  }
}
function saveState(state) {
  if (!existsSync(getConfigDir()))
    mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
function findTranscripts(days) {
  if (!existsSync(PROJECTS_DIR))
    return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const out = [];
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const dirPath = join(PROJECTS_DIR, dir);
    let entries;
    try {
      if (!statSync(dirPath).isDirectory())
        continue;
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl"))
        continue;
      const path = join(dirPath, file);
      try {
        const st = statSync(path);
        if (st.mtimeMs >= cutoff)
          out.push({ path, mtimeMs: st.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return out;
}
function groupIntoSessions(transcripts, strategy, peerName, sessionPeerPrefix, sessionOverrides = {}) {
  const groups = new Map;
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
      if (!cwd)
        continue;
      const name = strategy === "per-directory" && sessionOverrides[cwd] ? sessionOverrides[cwd] : deriveSessionName(strategy, cwd, {
        peerName,
        sessionPeerPrefix,
        branch: msg.gitBranch || tBranch,
        instanceId: sessionId
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
async function run() {
  setDetectedHost("claude_code");
  const args = parseArgs(process.argv.slice(2));
  console.log("");
  console.log(header("honcho backfill"));
  console.log("");
  const config = loadConfig();
  if (!config) {
    console.log(warn("No Honcho config found — run /honcho:setup first."));
    process.exit(1);
  }
  const targetWorkspace = args.workspace || config.workspace;
  const strategy = config.sessionStrategy ?? "per-directory";
  console.log(`  ${label("Workspace")}:   ${targetWorkspace}${args.workspace ? dim("  (override)") : ""}`);
  console.log(`  ${label("Strategy")}:    ${strategy}`);
  console.log(`  ${label("Window")}:      last ${args.days} days`);
  console.log(`  ${label("User peer")}:   ${config.peerName}`);
  console.log(`  ${label("AI peer")}:     ${config.aiPeer}`);
  console.log("");
  const allTranscripts = findTranscripts(args.days);
  const state = loadState();
  const already = allTranscripts.filter((t) => state.imported[`${targetWorkspace}::${t.path}`] === t.mtimeMs);
  const todo = allTranscripts.filter((t) => state.imported[`${targetWorkspace}::${t.path}`] !== t.mtimeMs);
  console.log(section("Scanning transcripts"));
  console.log(listItem(`${allTranscripts.length} transcript(s) in window`));
  if (already.length > 0) {
    console.log(listItem(dim(`${already.length} already imported into ${targetWorkspace} — skipping`)));
  }
  if (todo.length === 0) {
    console.log("");
    console.log(success("Nothing new to import."));
    process.exit(0);
  }
  const { groups, parsed, empty } = groupIntoSessions(todo, strategy, config.peerName, config.sessionPeerPrefix, config.sessions ?? {});
  const totalMessages = [...groups.values()].reduce((n, g) => n + g.messages.length, 0);
  console.log(listItem(`${parsed} transcript(s) with content${empty ? dim(` (${empty} empty, skipped)`) : ""}`));
  console.log(listItem(`${groups.size} session(s), ${totalMessages} message(s) to upload`));
  console.log("");
  console.log(section("Sessions"));
  const sorted = [...groups.values()].sort((a, b) => b.messages.length - a.messages.length);
  for (const g of sorted.slice(0, 15)) {
    console.log(listItem(`${g.name} ${dim(`(${g.messages.length} msg)`)}`));
  }
  if (sorted.length > 15)
    console.log(listItem(dim(`… and ${sorted.length - 15} more`)));
  console.log("");
  if (args.dryRun) {
    console.log(success("Dry run — no messages uploaded."));
    process.exit(0);
  }
  const opts = getHonchoClientOptions(config);
  opts.workspaceId = targetWorkspace;
  opts.timeout = 60000;
  opts.maxRetries = 3;
  const honcho = new import_sdk.Honcho(opts);
  const observationMode = getObservationMode(config);
  console.log(section(`Uploading to ${targetWorkspace}`));
  let uploadedSessions = 0;
  let uploadedMessages = 0;
  const errors = [];
  for (const g of sorted) {
    try {
      const [session, userPeer, aiPeer] = await Promise.all([
        honcho.session(g.name),
        honcho.peer(config.peerName),
        honcho.peer(config.aiPeer)
      ]);
      const peers = observationMode === "directional" ? [userPeer, [aiPeer, { observeOthers: true }]] : [userPeer, aiPeer];
      await session.addPeers(peers);
      const fallbackTs = new Date().toISOString();
      const messages = g.messages.flatMap((m) => {
        const peer = m.role === "user" ? userPeer : aiPeer;
        return chunkContent(m.content).map((chunk) => peer.message(chunk, {
          createdAt: m.timestamp || fallbackTs,
          metadata: {
            backfill: true,
            source_transcript: m.sourceTranscript,
            session_affinity: g.name,
            type: m.role === "assistant" ? m.isResponse ? "assistant_response" : "assistant_intermediate" : undefined
          }
        }));
      });
      await addMessagesBatched(session, messages);
      uploadedSessions++;
      uploadedMessages += g.messages.length;
      console.log(listItem(success(`${g.name} ${dim(`(${g.messages.length} msg)`)}`)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${g.name}: ${msg}`);
      console.log(listItem(warn(`${g.name} — ${msg}`)));
    }
  }
  if (errors.length === 0) {
    for (const t of todo) {
      state.imported[`${targetWorkspace}::${t.path}`] = t.mtimeMs;
    }
    saveState(state);
  }
  console.log("");
  console.log(success(`Imported ${uploadedMessages} message(s) across ${uploadedSessions} session(s) into ${targetWorkspace}.`));
  if (errors.length > 0) {
    console.log(warn(`${errors.length} session(s) failed — re-run to retry (not marked complete).`));
  }
  console.log("");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.log(error(`Backfill failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
}
export {
  groupIntoSessions,
  findTranscripts
};

//# debugId=5B03DE1B59AA36F564756E2164756E21
//# sourceMappingURL=backfill-runner.js.map
