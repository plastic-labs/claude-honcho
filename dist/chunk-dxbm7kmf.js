import {
  honchoSessionUrl
} from "./chunk-49wja30f.js";
import {
  setMemoryState,
  setSessionLink
} from "./chunk-9pntsn3x.js";
import {
  addSystemMessage,
  verboseApiResult,
  verboseList,
  visDialecticMessage,
  visInjectionMessage,
  visSessionContextMessage,
  visSkipMessage
} from "./chunk-xtdvbfxw.js";
import {
  require_dist
} from "./chunk-4ryv9310.js";
import {
  logApiCall,
  logHook,
  setLogContext
} from "./chunk-jr0fd6n2.js";
import {
  __toESM,
  getCachedStdin,
  getHonchoClientOptions,
  getInjectionConfig,
  getInstanceIdForCwd,
  getMessageCount,
  getObservationMode,
  getSessionName,
  incrementMessageCount,
  isPluginEnabled,
  loadConfig,
  readStdinText
} from "./chunk-yfrrc1d5.js";

// src/hooks/user-prompt.ts
var import_sdk = __toESM(require_dist(), 1);
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
var TRIVIAL_REPLY_PATTERN = /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i;
function isTerseReply(prompt) {
  return TRIVIAL_REPLY_PATTERN.test(prompt.trim());
}
var SKIP_CONTEXT_PATTERNS = [
  TRIVIAL_REPLY_PATTERN,
  /^\//
];
var HARNESS_INJECTED_PATTERNS = [
  /^<task-notification>/,
  /^<local-command-stdout>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<system-reminder>/,
  /^<bash-(stdout|stderr|input)>/,
  /^<<[\w-]+>>$/
];
function isHarnessInjected(prompt) {
  const trimmed = prompt.trim();
  return HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed));
}
var FETCH_TIMEOUT_MS = 4000;
var DIALECTIC_TIMEOUT_MS = 120000;
function raceTimeout(p, ms) {
  return Promise.race([
    p.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms))
  ]);
}
function extractTopics(prompt) {
  const topics = [];
  const filePaths = prompt.match(/[\w\-\/\.]+\.(ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml|sql)/gi) || [];
  topics.push(...filePaths.slice(0, 5));
  const quoted = prompt.match(/"([^"]+)"/g)?.map((q) => q.slice(1, -1)) || [];
  topics.push(...quoted.slice(0, 3));
  const techTerms = prompt.match(/\b(react|vue|svelte|angular|elysia|express|fastapi|django|flask|postgres|redis|docker|kubernetes|bun|node|deno|typescript|python|rust|go|graphql|rest|api|auth|oauth|jwt|stripe|webhook|honcho|mcp|claude|cursor|sentry)\b/gi) || [];
  topics.push(...[...new Set(techTerms.map((t) => t.toLowerCase()))].slice(0, 5));
  const errors = prompt.match(/error[:\s]+[\w\s]+|failed[:\s]+[\w\s]+|exception[:\s]+[\w\s]+/gi) || [];
  topics.push(...errors.slice(0, 2));
  if (topics.length > 0) {
    return { topics: [...new Set(topics)], precise: true };
  }
  const stopwords = new Set(["the", "and", "for", "that", "this", "with", "from", "have", "are", "was", "were", "been", "being", "has", "had", "does", "did", "will", "would", "could", "should", "can", "may", "might", "must", "shall", "need", "want", "like", "just", "also", "more", "some", "what", "when", "where", "which", "who", "how", "why", "all", "each", "every", "both", "few", "most", "other", "into", "over", "such", "only", "same", "than", "very", "your", "make", "take", "come", "give", "look", "think", "know"]);
  const words = prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  return { topics: [...new Set(words.filter((w) => !stopwords.has(w)))].slice(0, 10), precise: false };
}
function shouldSkipContextRetrieval(prompt) {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
}
function formatSessionLink(sessionUrl) {
  return `view your session in honcho GUI: ${sessionUrl}`;
}
function readVersionNag() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir)
    return;
  const flag = join(dataDir, ".version-stale");
  if (!existsSync(flag))
    return;
  try {
    return readFileSync(flag, "utf8").trim() || undefined;
  } catch {
    return;
  }
}
async function handleUserPrompt() {
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
  } catch {
    process.exit(0);
  }
  const prompt = hookInput.prompt || "";
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);
  setLogContext(cwd, sessionName);
  if (!prompt.trim()) {
    process.exit(0);
  }
  logHook("user-prompt", `Prompt received (${prompt.length} chars)`);
  setSessionLink(honchoSessionUrl(config.workspace, sessionName), sessionName, hookInput.session_id);
  const messageCountBefore = getMessageCount();
  incrementMessageCount();
  if (messageCountBefore === 0) {
    sessionToolHint = `Honcho memory tools are available — call honcho.search(query) or honcho.get_context to recall ` + `facts about ${config.peerName} across sessions, and honcho.chat(question) for dialectic/` + `psychological questions. Prefer querying over guessing when the user's history is relevant.`;
  }
  const nag = readVersionNag();
  const sessionLink = messageCountBefore === 0 ? nag ?? formatSessionLink(honchoSessionUrl(config.workspace, sessionName)) : messageCountBefore === 1 && nag ? formatSessionLink(honchoSessionUrl(config.workspace, sessionName)) : undefined;
  if (isHarnessInjected(prompt) || shouldSkipContextRetrieval(prompt)) {
    logHook("user-prompt", "Skipping context (harness-injected or trivial prompt)");
    visSkipMessage("user-prompt", sessionLink ? `${sessionLink} · skipped` : "skipped");
    process.exit(0);
  }
  const injection = getInjectionConfig(config);
  const wantUserContext = injection.perTurn.includes("userContext");
  const wantAssistantContext = injection.perTurn.includes("assistantContext");
  const wantSessionContext = injection.perTurn.includes("sessionContext");
  const wantDialectic = injection.perTurn.includes("dialectic");
  if (!wantUserContext && !wantAssistantContext && !wantSessionContext && !wantDialectic) {
    logHook("user-prompt", "No per-turn injection components selected");
    visSkipMessage("user-prompt", sessionLink ? `${sessionLink} · injection off` : "injection off");
    process.exit(0);
  }
  setMemoryState("recalling", undefined, hookInput.session_id);
  const [userCtxResult, assistantCtxResult, sessionCtx, dialectic] = await Promise.all([
    wantUserContext ? raceTimeout(fetchUserContext(config, prompt, injection), FETCH_TIMEOUT_MS) : Promise.resolve(null),
    wantAssistantContext ? raceTimeout(fetchAssistantContext(config, prompt, injection), FETCH_TIMEOUT_MS) : Promise.resolve(null),
    wantSessionContext ? raceTimeout(fetchSessionContext(config, sessionName, injection), FETCH_TIMEOUT_MS) : Promise.resolve(null),
    wantDialectic ? raceTimeout(fetchDialectic(config, prompt, injection), DIALECTIC_TIMEOUT_MS) : Promise.resolve(null)
  ]);
  const userCtx = userCtxResult?.context ? { context: userCtxResult.context, matched: userCtxResult.matched, queryLabel: userCtxResult.queryLabel } : null;
  emitPerTurn(config, injection, userCtx, assistantCtxResult?.context ?? null, sessionCtx, dialectic, sessionLink);
  process.exit(0);
}
function emitPerTurn(config, injection, userCtx, assistantCtx, sessionCtx, dialectic, sessionLink) {
  const parts = [];
  const visLines = [];
  const show = (c) => injection.showContents?.includes(c) ?? false;
  if (userCtx) {
    const conclusions = extractConclusions(userCtx.context);
    if (conclusions.length > 0) {
      parts.push(`Relevant conclusions: ${conclusions.join("; ")}`);
      visLines.push(visInjectionMessage("user-prompt", { conclusions, matched: userCtx.matched, queryLabel: userCtx.queryLabel, showContents: show("userContext") }));
    }
  }
  if (assistantCtx) {
    const conclusions = extractConclusions(assistantCtx);
    if (conclusions.length > 0) {
      parts.push(`Conclusions about the assistant (${config.aiPeer}): ${conclusions.join("; ")}`);
      visLines.push(visInjectionMessage("user-prompt", { conclusions, queryLabel: `assistant ${config.aiPeer}`, showContents: show("assistantContext") }));
    }
  }
  if (sessionCtx) {
    parts.push(`Recent Honcho session messages:
${sessionCtx.lines.join(`
`)}`);
    visLines.push(visSessionContextMessage("user-prompt", sessionCtx.lines, sessionCtx.tokenCount, show("sessionContext")));
  }
  if (dialectic) {
    parts.push(`Dialectic recall: ${dialectic.answer}`);
    visLines.push(visDialecticMessage("user-prompt", dialectic.reasoning, dialectic.elapsedMs, dialectic.answer, show("dialectic")));
  }
  if (parts.length === 0)
    return;
  const visMsg = visLines.join(`
`);
  outputContext(config.peerName, parts, sessionLink ? `${sessionLink}
${visMsg}` : visMsg);
}
async function fetchDialectic(config, prompt, injection) {
  const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
  const observationMode = getObservationMode(config);
  const dialecticPeer = observationMode === "unified" ? await honcho.peer(config.peerName) : await honcho.peer(config.aiPeer);
  const target = observationMode === "unified" ? undefined : config.peerName;
  const reasoning = injection.dialecticReasoning ?? "low";
  const query = (injection.dialecticTemplate ?? "%{user_query}").replace(/%\{user_query\}/g, prompt);
  const startTime = Date.now();
  try {
    const answer = await dialecticPeer.chat(query, {
      ...target ? { target } : {},
      reasoningLevel: reasoning
    });
    const elapsedMs = Date.now() - startTime;
    logApiCall("peer.chat (dialectic)", "POST", `${reasoning}: ${query.slice(0, 60)}`, elapsedMs, true);
    if (typeof answer !== "string" || !answer.trim())
      return null;
    return { answer: answer.trim(), reasoning, elapsedMs };
  } catch (e) {
    logHook("user-prompt", `Dialectic fetch failed: ${e}`);
    return null;
  }
}
async function fetchUserContext(config, prompt, injection) {
  const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
  const observationMode = getObservationMode(config);
  const contextPeer = observationMode === "unified" ? await honcho.peer(config.peerName) : await honcho.peer(config.aiPeer);
  const contextTarget = observationMode === "unified" ? undefined : config.peerName;
  const contextLabel = observationMode === "unified" ? "userPeer.context" : "aiPeer.context";
  const startTime = Date.now();
  const usePrompt = injection.searchQuerySource === "prompt";
  const { topics, precise } = usePrompt ? { topics: [], precise: false } : extractTopics(prompt);
  const searchQuery = usePrompt || topics.length === 0 ? prompt : topics.join(" ");
  let contextResult = null;
  let matched = [];
  try {
    contextResult = await contextPeer.context({
      ...contextTarget ? { target: contextTarget } : {},
      searchQuery,
      searchTopK: injection.searchTopK,
      searchMaxDistance: injection.searchMaxDistance,
      maxConclusions: injection.maxConclusions,
      includeMostFrequent: false
    });
    matched = precise ? topics : [];
    logApiCall(contextLabel, "GET", `search: ${searchQuery.slice(0, 60)}`, Date.now() - startTime, true);
  } catch (e) {
    logHook("user-prompt", `Context fetch failed: ${e}`);
  }
  if (contextResult) {
    verboseApiResult("peer.context() -> representation (fresh)", contextResult.representation);
    verboseList("peer.context() -> peerCard (fresh)", contextResult.peerCard);
  }
  return { context: contextResult, matched, queryLabel: usePrompt ? "prompt" : undefined };
}
async function fetchAssistantContext(config, prompt, injection) {
  const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
  const aiPeer = await honcho.peer(config.aiPeer);
  const usePrompt = injection.searchQuerySource === "prompt";
  const { topics } = usePrompt ? { topics: [] } : extractTopics(prompt);
  const searchQuery = usePrompt || topics.length === 0 ? prompt : topics.join(" ");
  const startTime = Date.now();
  try {
    const context = await aiPeer.context({
      searchQuery,
      searchTopK: injection.searchTopK,
      searchMaxDistance: injection.searchMaxDistance,
      maxConclusions: injection.maxConclusions,
      includeMostFrequent: false
    });
    logApiCall("aiPeer.context (assistant)", "GET", `search: ${searchQuery.slice(0, 60)}`, Date.now() - startTime, true);
    verboseApiResult("aiPeer.context() -> representation (assistant)", context?.representation);
    return { context };
  } catch (e) {
    logHook("user-prompt", `Assistant context fetch failed: ${e}`);
    return null;
  }
}
async function fetchSessionContext(config, sessionName, injection) {
  const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
  const startTime = Date.now();
  try {
    const session = await honcho.session(sessionName);
    const context = await session.context({
      summary: false,
      tokens: injection.sessionContextTokens ?? 1500
    });
    logApiCall("session.context", "GET", sessionName, Date.now() - startTime, true);
    const messages = context?.messages ?? [];
    if (!messages.length)
      return null;
    const lines = messages.map((m) => `${m.peerId}: ${m.content}`);
    const tokenCount = messages.reduce((sum, m) => sum + (m.tokenCount ?? 0), 0);
    verboseApiResult("session.context() -> messages", lines.join(`
`));
    return { lines, tokenCount };
  } catch (e) {
    logHook("user-prompt", `Session context fetch failed: ${e}`);
    return null;
  }
}
function extractConclusions(context) {
  const rep = context?.representation;
  if (typeof rep !== "string" || !rep.trim())
    return [];
  return rep.split(`
`).filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.replace(/^\[.*?\]\s*/, "").replace(/^- /, ""));
}
var sessionToolHint = "";
function outputContext(peerName, contextParts, systemMsg) {
  const base = `[Honcho Memory for ${peerName}]: ${contextParts.join(" | ")}`;
  let output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: sessionToolHint ? `${base}
${sessionToolHint}` : base
    }
  };
  if (systemMsg) {
    output = addSystemMessage(output, systemMsg);
  }
  console.log(JSON.stringify(output));
}

export { isTerseReply, isHarnessInjected, handleUserPrompt };

//# debugId=7F3A6B761EA2480164756E2164756E21
//# sourceMappingURL=chunk-dxbm7kmf.js.map
