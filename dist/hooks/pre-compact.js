#!/usr/bin/env bun
// @bun
import {
  Spinner
} from "../chunk-4zgbdwm4.js";
import {
  setMemoryState
} from "../chunk-9pntsn3x.js";
import {
  formatVerboseBlock,
  formatVerboseList
} from "../chunk-xtdvbfxw.js";
import {
  require_dist
} from "../chunk-4ryv9310.js";
import {
  logApiCall,
  logHook,
  setLogContext
} from "../chunk-jr0fd6n2.js";
import {
  __toESM,
  getCachedStdin,
  getHonchoClientOptions,
  getObservationMode,
  getSessionName,
  isPluginEnabled,
  loadConfig,
  readStdinText
} from "../chunk-yfrrc1d5.js";

// src/config.ts
import { homedir } from "os";
import { join, basename, dirname, resolve, sep } from "path";
var _detectedHost = null;
function setDetectedHost(host) {
  _detectedHost = host;
}
function detectHost(stdinInput) {
  const envHost = process.env.HONCHO_HOST;
  if (envHost === "cursor" || envHost === "claude_code" || envHost === "obsidian")
    return envHost;
  if (stdinInput?.cursor_version)
    return "cursor";
  if (process.env.CURSOR_PROJECT_DIR)
    return "cursor";
  return "claude_code";
}
var _stdinText = null;
function cacheStdin(text) {
  _stdinText = text;
}
async function readStdinText2() {
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}
async function initHook() {
  const stdinText = await readStdinText2();
  cacheStdin(stdinText);
  let input = {};
  try {
    input = JSON.parse(stdinText || "{}");
  } catch {
    process.exit(0);
  }
  if (input.cursor_version)
    process.exit(0);
  setDetectedHost(detectHost(input));
}
var CONFIG_DIR = join(homedir(), ".honcho");
var CONFIG_FILE = join(CONFIG_DIR, "config.json");
var VALID_ENVIRONMENTS = new Set(["production", "local"]);

// src/hooks/pre-compact.ts
var import_sdk = __toESM(require_dist(), 1);
function formatMemoryCard(config, sessionName, userContext, claudeContext, summaries, userDialectic, claudeDialectic) {
  const parts = [];
  parts.push(`## HONCHO MEMORY ANCHOR (Pre-Compaction Injection)
This context is being injected because the conversation is about to be summarized.
These conclusions MUST be preserved in the summary.

### Session Identity
- User: ${config.peerName}
- AI: ${config.aiPeer}
- Workspace: ${config.workspace}
- Session: ${sessionName}`);
  const userPeerCard = userContext?.peerCard;
  if (userPeerCard?.length > 0) {
    parts.push(`### ${config.peerName}'s Profile (PRESERVE)
${userPeerCard.join(`
`)}`);
  }
  const userRep = userContext?.representation;
  if (typeof userRep === "string" && userRep.trim()) {
    parts.push(`### Key Conclusions About ${config.peerName} (PRESERVE)
${userRep}`);
  }
  const claudeRep = claudeContext?.representation;
  if (typeof claudeRep === "string" && claudeRep.trim()) {
    parts.push(`### ${config.aiPeer}'s Recent Work (PRESERVE)
${claudeRep}`);
  }
  const shortSummary = summaries?.shortSummary;
  if (shortSummary?.content) {
    parts.push(`### Session Context (PRESERVE)
${shortSummary.content}`);
  }
  if (userDialectic) {
    parts.push(`### AI Understanding of ${config.peerName} (PRESERVE)
${userDialectic}`);
  }
  if (claudeDialectic) {
    parts.push(`### ${config.aiPeer}'s Self-Reflection (PRESERVE)
${claudeDialectic}`);
  }
  parts.push(`### End Memory Anchor
The above context represents persistent memory from Honcho.
When summarizing this conversation, ensure these conclusions are preserved.`);
  return parts.join(`

`);
}
async function handlePreCompact() {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }
  if (!isPluginEnabled()) {
    process.exit(0);
  }
  let hookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {}
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const trigger = hookInput.trigger || "auto";
  setLogContext(cwd, getSessionName(cwd));
  logHook("pre-compact", `Compaction triggered (${trigger})`);
  const spinner = new Spinner({ style: "neural" });
  if (trigger === "auto") {
    spinner.start("anchoring memory before compaction");
  }
  setMemoryState("compacting", undefined, hookInput.session_id);
  try {
    const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
    const sessionName = getSessionName(cwd);
    const observationMode = getObservationMode(config);
    const session = await honcho.session(sessionName);
    const userPeer = await honcho.peer(config.peerName);
    const aiPeer = await honcho.peer(config.aiPeer);
    const contextPeer = observationMode === "unified" ? userPeer : aiPeer;
    const contextTarget = observationMode === "unified" ? undefined : config.peerName;
    const contextLabel = observationMode === "unified" ? "userPeer.context()" : `aiPeer.context(target=${config.peerName})`;
    if (trigger === "auto") {
      spinner.update("fetching memory context");
    }
    logApiCall(contextLabel, "GET", observationMode === "unified" ? "self" : `target=${config.peerName}`);
    logApiCall("session.summaries", "GET", sessionName);
    logApiCall("peer.chat", "POST", "dialectic queries x2");
    const dialecticArgs = observationMode === "unified" ? { session, reasoningLevel: config.reasoningLevel ?? "low" } : { target: config.peerName, session, reasoningLevel: config.reasoningLevel ?? "low" };
    const [userContextResult, summariesResult, userChatResult, claudeChatResult] = await Promise.allSettled([
      contextPeer.context({
        ...contextTarget ? { target: contextTarget } : {},
        maxConclusions: 30,
        includeMostFrequent: true
      }),
      session.summaries(),
      contextPeer.chat(`Summarize the most important things to remember about ${config.peerName}. Focus on their preferences, working style, current projects, and any critical context that should survive a conversation summary.`, dialecticArgs),
      contextPeer.chat(`What are the most important things that were worked on with ${config.peerName}? Summarize key context that should be preserved.`, dialecticArgs)
    ]);
    const userContext = userContextResult.status === "fulfilled" ? userContextResult.value : null;
    const summaries = summariesResult.status === "fulfilled" ? summariesResult.value : null;
    const verboseBlocks = [];
    verboseBlocks.push(formatVerboseBlock(`pre-compact ${contextLabel}`, userContext?.representation));
    verboseBlocks.push(formatVerboseList("pre-compact peerCard", userContext?.peerCard));
    const userDialectic = userChatResult.status === "fulfilled" ? userChatResult.value : null;
    const claudeDialectic = claudeChatResult.status === "fulfilled" ? claudeChatResult.value : null;
    const memoryCard = formatMemoryCard(config, sessionName, userContext, null, summaries, userDialectic, claudeDialectic);
    if (trigger === "auto") {
      spinner.stop("memory anchored");
    }
    setMemoryState("idle", undefined, hookInput.session_id);
    if (userDialectic) {
      verboseBlocks.push(formatVerboseBlock(`pre-compact peer.chat(user) → "${config.peerName}"`, userDialectic));
    }
    if (claudeDialectic) {
      verboseBlocks.push(formatVerboseBlock(`pre-compact peer.chat(claude) → "${config.aiPeer}"`, claudeDialectic));
    }
    logHook("pre-compact", `Memory anchored (${memoryCard.length} chars)`);
    const verboseOutput = verboseBlocks.filter(Boolean).join(`
`);
    console.log(`[${config.aiPeer}/Honcho Memory Anchor]

${memoryCard}${verboseOutput}`);
    process.exit(0);
  } catch (error) {
    logHook("pre-compact", `Error: ${error}`, { error: String(error) });
    if (trigger === "auto") {
      spinner.fail("memory anchor failed");
    }
    setMemoryState("idle", undefined, hookInput.session_id);
    console.error(`[honcho] Pre-compact warning: ${error}`);
    process.exit(0);
  }
}

// hooks/pre-compact.ts
await initHook();
await handlePreCompact();

//# debugId=3295B20DC4BCF58464756E2164756E21
//# sourceMappingURL=pre-compact.js.map
