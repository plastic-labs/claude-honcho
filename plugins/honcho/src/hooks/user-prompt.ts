import { Honcho, Session, Peer } from "@honcho-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getObservationMode, getInjectionConfig, type InjectionConfig } from "../config.js";
import {
  getMessageCount,
  incrementMessageCount,
  getInstanceIdForCwd,
  chunkContent,
  addMessagesBatched,
} from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { visInjectionMessage, visSkipMessage, addSystemMessage, verboseApiResult, verboseList } from "../visual.js";
import { honchoSessionUrl } from "../styles.js";
import { setMemoryState, setSessionLink } from "../state.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
  workspace_roots?: string[];
}

// Patterns to skip context injection
const SKIP_CONTEXT_PATTERNS = [
  /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i,
  /^\//, // slash commands
];

const FETCH_TIMEOUT_MS = 4000;

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

  // Upload the prompt immediately, concurrent with context retrieval and
  // awaited before each exit. Log-and-drop on failure, like stop.ts.
  let uploadPromise: Promise<void> = Promise.resolve();
  if (config.saveMessages !== false) {
    uploadPromise = postUserMessage(config, prompt, instanceId || undefined, sessionName)
      .catch((e) => {
        logHook("user-prompt", `Immediate upload failed: ${e}`);
      });
  }

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

  // Skip trivial prompts — no context needed for "y", "ok", etc.
  if (shouldSkipContextRetrieval(prompt)) {
    logHook("user-prompt", "Skipping context (trivial prompt)");
    visSkipMessage("user-prompt", sessionLink ? `${sessionLink} · trivial prompt` : "trivial prompt");
    await uploadPromise;
    process.exit(0);
  }

  const injection = getInjectionConfig(config);
  const wantContext = injection.perTurn.includes("context");

  if (!wantContext) {
    logHook("user-prompt", "No per-turn injection components selected");
    visSkipMessage("user-prompt", sessionLink ? `${sessionLink} · injection off` : "injection off");
    await uploadPromise;
    process.exit(0);
  }

  setMemoryState("recalling", undefined, hookInput.session_id);

  const fetchResult = await Promise.race([
    fetchFreshContext(config, prompt, injection).then(r => ({ ok: true as const, ...r })),
    new Promise<{ ok: false }>(resolve => setTimeout(() => resolve({ ok: false }), FETCH_TIMEOUT_MS)),
  ]).catch((): { ok: false } => ({ ok: false }));

  const ctx: { context: any; matched?: string[]; queryLabel?: string } | null =
    fetchResult.ok && fetchResult.context
      ? { context: fetchResult.context, matched: fetchResult.matched, queryLabel: fetchResult.queryLabel }
      : null;

  emitPerTurn(config.peerName, ctx, sessionLink);
  await uploadPromise;
  process.exit(0);
}


// Upload a user prompt. SessionStart already created the session/peers

async function postUserMessage(
  config: any,
  prompt: string,
  instanceId: string | undefined,
  sessionName: string,
): Promise<void> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const noEnsure = () => Promise.resolve();

  const userPeer = new Peer(config.peerName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
  const createdAt = new Date().toISOString();
  const messages = chunkContent(prompt).map((chunk) =>
    userPeer.message(chunk, {
      createdAt,
      metadata: {
        instance_id: instanceId || undefined,
        session_affinity: sessionName,
      },
    })
  );

  logApiCall("session.addMessages", "POST", `user prompt (${prompt.length} chars, ${messages.length} msg, direct)`);
  try {
    const session = new Session(sessionName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
    await addMessagesBatched(session, messages);
  } catch (e) {
    logHook("user-prompt", `Direct upload failed, retrying via get-or-create: ${e}`);
    const session = await honcho.session(sessionName);
    await addMessagesBatched(session, messages);
  }
}

/**
 * Emit the per-turn "context" injection: the cache/fresh/stale context blob
 * formatted into additionalContext plus its systemMessage. Exits silently when
 * nothing resolved — mirroring the old no-cache fall-through.
 */
function emitPerTurn(
  peerName: string,
  ctx: { context: any; matched?: string[]; queryLabel?: string } | null,
  sessionLink?: string,
): void {
  if (!ctx) return;

  const conclusions = extractConclusions(ctx.context);
  if (conclusions.length === 0) return;

  const parts = [`Relevant conclusions: ${conclusions.join("; ")}`];
  const visMsg = visInjectionMessage("user-prompt", { conclusions, matched: ctx.matched, queryLabel: ctx.queryLabel });
  outputContext(peerName, parts, sessionLink ? `${sessionLink}\n${visMsg}` : visMsg);
}

async function fetchFreshContext(config: any, prompt: string, injection: InjectionConfig): Promise<{ context: any; matched: string[]; queryLabel?: string }> {
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
