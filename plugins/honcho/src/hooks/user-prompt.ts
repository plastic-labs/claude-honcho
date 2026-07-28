import { Honcho } from "@honcho-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getObservationMode, getInjectionConfig, type InjectionConfig } from "../config.js";
import {
  getMessageCount,
  incrementMessageCount,
  getInstanceIdForCwd,
} from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { visInjectionMessage, visDialecticMessage, visSessionContextMessage, visSkipMessage, addSystemMessage, verboseApiResult, verboseList } from "../visual.js";
import type { ReasoningLevel } from "../config.js";
import { honchoSessionUrl } from "../styles.js";
import { setMemoryState, setSessionLink } from "../state.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
  workspace_roots?: string[];
}

// Terse acknowledgements
const TRIVIAL_REPLY_PATTERN = /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i;

export function isTerseReply(prompt: string): boolean {
  return TRIVIAL_REPLY_PATTERN.test(prompt.trim());
}

// Patterns to skip context injection
const SKIP_CONTEXT_PATTERNS = [
  TRIVIAL_REPLY_PATTERN,
  /^\//, // slash commands
];

// Harness-injected turns that Claude Code delivers in the user-message slot but
// the human never typed: background-task events, slash-command stdout, injected
// system reminders.
const HARNESS_INJECTED_PATTERNS = [
  /^<task-notification>/,
  /^<local-command-stdout>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<system-reminder>/,
  /^<bash-(stdout|stderr|input)>/,
  // `<<...>>` sentinels the runtime re-submits through the user slot and
  // resolves at fire time (e.g. <<autonomous-loop-dynamic>> from /loop wakeups)
  /^<<[\w-]+>>$/,
];

export function isHarnessInjected(prompt: string): boolean {
  const trimmed = prompt.trim();
  return HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed));
}

const FETCH_TIMEOUT_MS = 4000;
// The dialectic chat() call is far slower than context() (~12s at medium, up to
// ~120s at max reasoning), so it gets its own budget rather than the 4s context
// race. Matched to the 120s read-path (UserPromptSubmit) hook ceiling in
// hooks.json so the richest tiers can complete. This is a synchronous injection,
// so the user's turn blocks for up to this long when dialectic is enabled. (The
// prompt upload no longer runs here — it's a separate async hook — so this
// budget is the whole hook.)
const DIALECTIC_TIMEOUT_MS = 120000;

/** Resolve a promise with its value, or null if `ms` elapses or it rejects. */
function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Extract meaningful topics from a prompt for semantic search. Returns terms
 * that are high-signal for conclusion matching. `precise` is true when topics
 * came from high-signal patterns (file paths, quoted strings, tech terms,
 * errors) rather than the fuzzy word fallback; the fallback still drives
 * search, but callers use `precise` to decide whether the topics are worth
 * showing to the user as a match.
 */
function extractTopics(prompt: string): { topics: string[]; precise: boolean } {
  const topics: string[] = [];

  // File paths (high signal)
  const filePaths = prompt.match(/[\w\-\/\.]+\.(ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml|sql)/gi) || [];
  topics.push(...filePaths.slice(0, 5));

  // Quoted strings (explicit references)
  const quoted = prompt.match(/"([^"]+)"/g)?.map(q => q.slice(1, -1)) || [];
  topics.push(...quoted.slice(0, 3));

  // Technical terms
  const techTerms = prompt.match(/\b(react|vue|svelte|angular|elysia|express|fastapi|django|flask|postgres|redis|docker|kubernetes|bun|node|deno|typescript|python|rust|go|graphql|rest|api|auth|oauth|jwt|stripe|webhook|honcho|mcp|claude|cursor|sentry)\b/gi) || [];
  topics.push(...[...new Set(techTerms.map(t => t.toLowerCase()))].slice(0, 5));

  // Error patterns
  const errors = prompt.match(/error[:\s]+[\w\s]+|failed[:\s]+[\w\s]+|exception[:\s]+[\w\s]+/gi) || [];
  topics.push(...errors.slice(0, 2));

  if (topics.length > 0) {
    return { topics: [...new Set(topics)], precise: true };
  }

  // Fallback: meaningful words >3 chars minus stopwords
  const stopwords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'shall', 'need', 'want', 'like', 'just', 'also', 'more', 'some', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'all', 'each', 'every', 'both', 'few', 'most', 'other', 'into', 'over', 'such', 'only', 'same', 'than', 'very', 'your', 'make', 'take', 'come', 'give', 'look', 'think', 'know']);
  const words = prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  return { topics: [...new Set(words.filter(w => !stopwords.has(w)))].slice(0, 10), precise: false };
}

function shouldSkipContextRetrieval(prompt: string): boolean {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
}

function formatSessionLink(sessionUrl: string): string {
  return `view your session in honcho GUI: ${sessionUrl}`;
}

function readVersionNag(): string | undefined {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return undefined;
  const flag = join(dataDir, ".version-stale");
  if (!existsSync(flag)) return undefined;
  try {
    return readFileSync(flag, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * UserPromptSubmit hook — serves cached context instantly, refreshes when stale.
 *
 * Context lifecycle:
 *   SessionStart  -> warms cache (parallel API calls, 30s budget)
 *   UserPrompt    -> serves cache; refreshes (with 4s timeout) when TTL expires or message threshold hit
 *   PreCompact    -> re-warms cache before context window reset
 *
 * On refresh failure, silently falls back to stale cache.
 * On no cache at all, exits silently — context will arrive next turn.
 */
export async function handleUserPrompt(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  if (!isPluginEnabled()) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = getCachedStdin() ?? await Bun.stdin.text();
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

  // The prompt upload runs as a separate async hook (save-user-message.ts) so
  // the write never blocks this turn's injection. This hook is read-only.

  // Track message count for threshold-based refresh
  const messageCountBefore = getMessageCount();
  incrementMessageCount();

  // First prompt of the session: nudge the harness to actively call the honcho
  // MCP tools (search/chat/get_context) rather than rely only on this passive
  // injection. Injected once to respect a lean per-turn context budget.
  if (messageCountBefore === 0) {
    sessionToolHint =
      `Honcho memory tools are available — call honcho.search(query) or honcho.get_context to recall ` +
      `facts about ${config.peerName} across sessions, and honcho.chat(question) for dialectic/` +
      `psychological questions. Prefer querying over guessing when the user's history is relevant.`;
  }
  // Stagger the one-off banners so the first prompt isn't crowded. The
  // version-update nag (if stale) takes the first message and bumps the GUI
  // session link to the second; with no nag, the link shows on the first.
  // The nag flag is written at SessionStart and stable for the session, so
  // its presence on message 2 tells us the link hasn't been shown yet.
  const nag = readVersionNag();
  const sessionLink =
    messageCountBefore === 0
      ? nag ?? formatSessionLink(honchoSessionUrl(config.workspace, sessionName))
      : messageCountBefore === 1 && nag
        ? formatSessionLink(honchoSessionUrl(config.workspace, sessionName))
        : undefined;

  // Skip trivial prompts — no context needed for "y", "ok", etc. Harness-injected
  // turns are excluded from storage; don't use them as retrieval queries either.
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

  // All components run concurrently on independent budgets: the context fetches
  // each on the tight 4s race, dialectic on its own budget. None blocks another,
  // and the hook completes as soon as the slowest selected component resolves or
  // times out.
  const [userCtxResult, assistantCtxResult, sessionCtx, dialectic] = await Promise.all([
    wantUserContext ? raceTimeout(fetchUserContext(config, prompt, injection), FETCH_TIMEOUT_MS) : Promise.resolve(null),
    wantAssistantContext ? raceTimeout(fetchAssistantContext(config, prompt, injection), FETCH_TIMEOUT_MS) : Promise.resolve(null),
    wantSessionContext ? raceTimeout(fetchSessionContext(config, sessionName, injection), FETCH_TIMEOUT_MS) : Promise.resolve(null),
    wantDialectic ? raceTimeout(fetchDialectic(config, prompt, injection), DIALECTIC_TIMEOUT_MS) : Promise.resolve(null),
  ]);

  const userCtx: { context: any; matched?: string[]; queryLabel?: string } | null =
    userCtxResult?.context
      ? { context: userCtxResult.context, matched: userCtxResult.matched, queryLabel: userCtxResult.queryLabel }
      : null;

  emitPerTurn(config, userCtx, assistantCtxResult?.context ?? null, sessionCtx, dialectic, sessionLink);
  process.exit(0);
}

/**
 * Emit the per-turn injection: the selected components composed into one
 * additionalContext payload plus a per-component systemMessage summary.
 * Exits silently when nothing resolved to content — mirroring the old
 * no-cache fall-through.
 */
function emitPerTurn(
  config: any,
  userCtx: { context: any; matched?: string[]; queryLabel?: string } | null,
  assistantCtx: any | null,
  sessionCtx: SessionContextResult | null,
  dialectic: DialecticResult | null,
  sessionLink?: string,
): void {
  const parts: string[] = [];
  const visLines: string[] = [];

  if (userCtx) {
    const conclusions = extractConclusions(userCtx.context);
    if (conclusions.length > 0) {
      parts.push(`Relevant conclusions: ${conclusions.join("; ")}`);
      visLines.push(visInjectionMessage("user-prompt", { conclusions, matched: userCtx.matched, queryLabel: userCtx.queryLabel }));
    }
  }

  if (assistantCtx) {
    const conclusions = extractConclusions(assistantCtx);
    if (conclusions.length > 0) {
      parts.push(`Conclusions about the assistant (${config.aiPeer}): ${conclusions.join("; ")}`);
      visLines.push(visInjectionMessage("user-prompt", { conclusions, queryLabel: `assistant ${config.aiPeer}` }));
    }
  }

  if (sessionCtx) {
    parts.push(`Recent Honcho session messages:\n${sessionCtx.lines.join("\n")}`);
    visLines.push(visSessionContextMessage("user-prompt", sessionCtx.lines, sessionCtx.tokenCount));
  }

  if (dialectic) {
    parts.push(`Dialectic recall: ${dialectic.answer}`);
    visLines.push(visDialecticMessage("user-prompt", dialectic.reasoning, dialectic.elapsedMs, dialectic.answer));
  }

  if (parts.length === 0) return;

  const visMsg = visLines.join("\n");
  outputContext(config.peerName, parts, sessionLink ? `${sessionLink}\n${visMsg}` : visMsg);
}

interface DialecticResult {
  answer: string;
  reasoning: ReasoningLevel;
  elapsedMs: number;
}

/**
 * Per-turn "dialectic" component: a reasoned peer.chat() answer over the peer's
 * representation, seeded from `dialecticTemplate` (the prompt substituted into
 * %{user_query}). Unscoped by session so recall spans the peer's full history,
 * not just this conversation. Returns null on empty/failed answer.
 */
async function fetchDialectic(config: any, prompt: string, injection: InjectionConfig): Promise<DialecticResult | null> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const observationMode = getObservationMode(config);

  // unified: query the user peer directly; directional: the ai peer about the user.
  const dialecticPeer = observationMode === "unified"
    ? await honcho.peer(config.peerName)
    : await honcho.peer(config.aiPeer);
  const target = observationMode === "unified" ? undefined : config.peerName;

  const reasoning = (injection.dialecticReasoning ?? "low") as ReasoningLevel;
  const query = (injection.dialecticTemplate ?? "%{user_query}").replace(/%\{user_query\}/g, prompt);
  const startTime = Date.now();

  try {
    const answer = await dialecticPeer.chat(query, {
      ...(target ? { target } : {}),
      reasoningLevel: reasoning,
    });
    const elapsedMs = Date.now() - startTime;
    logApiCall("peer.chat (dialectic)", "POST", `${reasoning}: ${query.slice(0, 60)}`, elapsedMs, true);
    if (typeof answer !== "string" || !answer.trim()) return null;
    return { answer: answer.trim(), reasoning, elapsedMs };
  } catch (e) {
    logHook("user-prompt", `Dialectic fetch failed: ${e}`);
    return null;
  }
}

/**
 * Per-turn "userContext" component: a prompt-scoped peer.context() fetch for
 * the user peer, observation-mode aware.
 */
async function fetchUserContext(config: any, prompt: string, injection: InjectionConfig): Promise<{ context: any; matched: string[]; queryLabel?: string }> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const observationMode = getObservationMode(config);

  // unified: user self-observations — query via userPeer (no target).
  // directional: ai cross-observations — query via aiPeer with target.
  const contextPeer = observationMode === "unified"
    ? await honcho.peer(config.peerName)
    : await honcho.peer(config.aiPeer);
  const contextTarget = observationMode === "unified" ? undefined : config.peerName;
  const contextLabel = observationMode === "unified" ? "userPeer.context" : "aiPeer.context";

  const startTime = Date.now();

  // Always search-scope the fetch: high-signal topics when we have them, else
  // the raw prompt. `includeMostFrequent` is OFF so frequency-based conclusions
  // ("task completed" repeats) don't crowd out what the distance gate selects —
  // relevance/recency drives the block, not raw frequency.
  // "prompt" mode searches with the raw prompt (no topic extraction);
  // "topics" mode (default) prefers extracted topics, falling back to the prompt.
  const usePrompt = injection.searchQuerySource === "prompt";
  const { topics, precise } = usePrompt ? { topics: [], precise: false } : extractTopics(prompt);
  const searchQuery = usePrompt || topics.length === 0 ? prompt : topics.join(" ");

  let contextResult: any = null;
  // Topics shown to the user as the match — only set when the topics are
  // high-signal, so we never surface fuzzy fallback words as a real match.
  let matched: string[] = [];

  try {
    contextResult = await contextPeer.context({
      ...(contextTarget ? { target: contextTarget } : {}),
      searchQuery,
      searchTopK: injection.searchTopK,
      searchMaxDistance: injection.searchMaxDistance,
      maxConclusions: injection.maxConclusions,
      includeMostFrequent: false,
    });
    matched = precise ? topics : [];
    logApiCall(contextLabel, "GET", `search: ${searchQuery.slice(0, 60)}`, Date.now() - startTime, true);
  } catch (e) {
    logHook("user-prompt", `Context fetch failed: ${e}`);
  }

  if (contextResult) {
    verboseApiResult("peer.context() -> representation (fresh)", (contextResult as any).representation);
    verboseList("peer.context() -> peerCard (fresh)", (contextResult as any).peerCard);
  }

  return { context: contextResult, matched, queryLabel: usePrompt ? "prompt" : undefined };
}

/**
 * Per-turn "assistantContext" component: the same prompt-scoped peer.context()
 * fetch, but for the AI peer's own representation — what Honcho has derived
 * about the assistant. Always the peer's global (self) view, regardless of
 * observation mode: there is no directional "assistant observed by user"
 * collection to fall back to.
 */
async function fetchAssistantContext(config: any, prompt: string, injection: InjectionConfig): Promise<{ context: any } | null> {
  const honcho = new Honcho(getHonchoClientOptions(config));
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
      includeMostFrequent: false,
    });
    logApiCall("aiPeer.context (assistant)", "GET", `search: ${searchQuery.slice(0, 60)}`, Date.now() - startTime, true);
    verboseApiResult("aiPeer.context() -> representation (assistant)", (context as any)?.representation);
    return { context };
  } catch (e) {
    logHook("user-prompt", `Assistant context fetch failed: ${e}`);
    return null;
  }
}

interface SessionContextResult {
  /** "peer: content" lines, oldest first. */
  lines: string[];
  tokenCount: number;
}

/**
 * Per-turn "sessionContext" component: recent raw messages from the currently
 * mapped Honcho session, within a token budget. Summary is off — it's the same
 * stored row the sessionStart "summary" component injects — and no peer target
 * or search query is passed, keeping this a plain message-window fetch rather
 * than another semantic retrieval. The value is turns from other instances
 * sharing the session name (per-directory strategy). Returns null when the
 * session has no messages.
 */
async function fetchSessionContext(config: any, sessionName: string, injection: InjectionConfig): Promise<SessionContextResult | null> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const startTime = Date.now();
  try {
    const session = await honcho.session(sessionName);
    const context = await session.context({
      summary: false,
      tokens: injection.sessionContextTokens ?? 1500,
    });
    logApiCall("session.context", "GET", sessionName, Date.now() - startTime, true);
    const messages = context?.messages ?? [];
    if (!messages.length) return null;
    const lines = messages.map((m: any) => `${m.peerId}: ${m.content}`);
    const tokenCount = messages.reduce((sum: number, m: any) => sum + (m.tokenCount ?? 0), 0);
    verboseApiResult("session.context() -> messages", lines.join("\n"));
    return { lines, tokenCount };
  } catch (e) {
    logHook("user-prompt", `Session context fetch failed: ${e}`);
    return null;
  }
}

// Per-turn context injects representation-derived conclusions ONLY. The full
// peer card is stable identity and belongs to the SessionStart surface (the
// "peerCard" component) — re-sending its 40+ items every turn was a recurring
// slug of low-turn-relevance tokens (DEV-2024). context() returns
// `representation` and `peerCard` as separate fields, so excluding the card is
// simply not reading it — no string surgery.
//
// The conclusion count is bounded upstream by the maxConclusions knob passed to
// context(), so no client-side cap is applied here.
function extractConclusions(context: any): string[] {
  const rep = context?.representation;
  if (typeof rep !== "string" || !rep.trim()) return [];
  return rep
    .split("\n")
    .filter((l: string) => l.trim() && !l.startsWith("#"))
    .map((l: string) => l.replace(/^\[.*?\]\s*/, "").replace(/^- /, ""));
}

// Set once per session to nudge active use of the honcho MCP tools.
let sessionToolHint = "";

function outputContext(peerName: string, contextParts: string[], systemMsg?: string): void {
  const base = `[Honcho Memory for ${peerName}]: ${contextParts.join(" | ")}`;
  let output: any = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: sessionToolHint ? `${base}\n${sessionToolHint}` : base,
    },
  };
  if (systemMsg) {
    output = addSystemMessage(output, systemMsg);
  }
  console.log(JSON.stringify(output));
}
