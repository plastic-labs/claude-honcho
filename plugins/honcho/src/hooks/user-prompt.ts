import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getObservationMode } from "../config.js";
import {
  getCachedUserContext,
  getStaleCachedUserContext,
  isContextCacheStale,
  setCachedUserContext,
  getMessageCount,
  incrementMessageCount,
  shouldRefreshKnowledgeGraph,
  markKnowledgeGraphRefreshed,
  getInstanceIdForCwd,
  queueMessage,
} from "../cache.js";
import { logHook, logApiCall, logCache, setLogContext } from "../log.js";
import { visContextLine, visSkipMessage, addSystemMessage, verboseApiResult, verboseList } from "../visual.js";
import { honchoSessionUrl } from "../styles.js";

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
 * Extract meaningful topics from a prompt for semantic search.
 * Returns terms that are high-signal for conclusion matching.
 */
function extractTopics(prompt: string): string[] {
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
    return [...new Set(topics)];
  }

  // Fallback: meaningful words >3 chars minus stopwords
  const stopwords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'shall', 'need', 'want', 'like', 'just', 'also', 'more', 'some', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'all', 'each', 'every', 'both', 'few', 'most', 'other', 'into', 'over', 'such', 'only', 'same', 'than', 'very', 'your', 'make', 'take', 'come', 'give', 'look', 'think', 'know']);
  const words = prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  return [...new Set(words.filter(w => !stopwords.has(w)))].slice(0, 10);
}

function shouldSkipContextRetrieval(prompt: string): boolean {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
}

/**
 * Strip pasted code/diffs/long-output blocks from a user prompt before it
 * is uploaded to Honcho. Pastes ride role: "user" per the Anthropic Messages
 * API but are not the user's authored prose; the server-side fact extractor
 * otherwise reads `+`/`-` diff lines or quoted file content as user statements
 * and produces "<peer> changed/wrote/added X" misattribution bullets.
 *
 * Returns the cleaned prompt and whether any redaction fired so the caller
 * can tag metadata.type = "user_paste_not_speech".
 *
 * Implementation notes (post-review hardening, 2026-04-26):
 *   - Fenced code blocks: scanner that supports 3+ backticks or tildes and
 *     fails closed on EOF without a matching closer (the user almost
 *     certainly pasted code without remembering to close the fence).
 *   - Unified diffs: stateful line-by-line redactor entered only on a real
 *     diff anchor (`@@`, `--- a/`, `+++ b/`). Inside the block, also redacts
 *     space-prefixed context lines so leaked function names cannot survive.
 *     Exits the block on the first line that doesn't match diff grammar.
 *   - Long path-bearing lines: tightened heuristic. A line >200 chars is
 *     redacted only if it has no internal whitespace at all OR contains a
 *     dense slash-separated identifier run; long prose paragraphs with a
 *     URL/fraction pass through.
 */
function stripPastes(prompt: string): { prompt: string; redacted: boolean } {
  if (!prompt) return { prompt, redacted: false };

  let redacted = false;
  let out = prompt;

  // 1. Fenced code blocks (` ``` ` or ` ~~~ ` with 3+ chars; fail-closed)
  const fenced = stripFencedBlocks(out);
  if (fenced.redacted) {
    redacted = true;
    out = fenced.prompt;
  }

  // 2. Unified-diff blocks (anchor-gated, stateful)
  const diffed = stripUnifiedDiffBlocks(out);
  if (diffed.redacted) {
    redacted = true;
    out = diffed.prompt;
  }

  // 3. Long path-bearing output lines
  out = out
    .split("\n")
    .map((line) => {
      if (looksLikeLongPathOutput(line)) {
        redacted = true;
        return "[path/output removed]";
      }
      return line;
    })
    .join("\n");

  return { prompt: out, redacted };
}

/**
 * Scan-and-redact fenced code blocks. Supports 3+ backtick or 3+ tilde
 * fences. Fails closed: if a fence is opened and never closed, the rest of
 * the input is treated as inside the fence and redacted.
 */
function stripFencedBlocks(input: string): { prompt: string; redacted: boolean } {
  const lines = input.split("\n");
  const out: string[] = [];
  const openRe = /^(\s*)([`~]{3,})/;
  let i = 0;
  let redacted = false;

  while (i < lines.length) {
    const m = openRe.exec(lines[i]);
    if (!m) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const opener = m[2];
    const fenceChar = opener[0];
    const minLen = opener.length;
    redacted = true;
    out.push("[code block removed]");
    i++;
    while (i < lines.length) {
      const cm = /^\s*([`~]{3,})\s*$/.exec(lines[i]);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= minLen) {
        i++;
        break;
      }
      i++;
    }
    // EOF without closer: fail-closed. Already emitted marker, just exit.
  }

  return { prompt: out.join("\n"), redacted };
}

/**
 * Stateful unified-diff redactor. Enters "diff mode" only on a real
 * unified-diff anchor (`@@`, `--- a/`, `+++ b/`). Inside a diff block,
 * redacts every line that matches diff grammar — including `+`/`-`
 * lines, hunk headers, file headers, and space-prefixed context lines —
 * until a line that breaks diff grammar is encountered.
 *
 * Markdown bullet lists like "- item one\n- item two\n- item three"
 * have no anchor and are passed through untouched.
 */
function stripUnifiedDiffBlocks(input: string): { prompt: string; redacted: boolean } {
  const anchorRe = /^(?:@@|---\s+a\/|\+\+\+\s+b\/)/;
  // Lines that are part of a diff block once we're already inside one:
  // hunk header, file headers, +/- lines, space-prefixed context.
  const diffBodyRe = /^(?:@@|---\s|\+\+\+\s|[+\-]| )/;
  const lines = input.split("\n");
  const out: string[] = [];
  let i = 0;
  let redacted = false;

  while (i < lines.length) {
    if (!anchorRe.test(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    // Enter diff block. Replace the entire contiguous diff with a single
    // marker. Consume the anchor line plus any following diff-grammar lines.
    redacted = true;
    out.push("[diff removed]");
    while (i < lines.length && diffBodyRe.test(lines[i])) {
      i++;
    }
    // Consume residual blank lines so we don't leave gaps in the prose.
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }
  }

  return { prompt: out.join("\n"), redacted };
}

/**
 * A line is "long path-bearing output" when it is >200 chars AND looks like
 * machine output rather than authored prose:
 *   - contains no whitespace at all (single dense token), OR
 *   - contains a contiguous run of 3+ slash-separated identifiers
 *     (path-like substring)
 *
 * Long prose paragraphs that happen to mention a URL or a fraction
 * (`and/or`, `1/2`) are not redacted under this rule.
 */
function looksLikeLongPathOutput(line: string): boolean {
  if (line.length <= 200) return false;
  if (!/\s/.test(line)) return /\//.test(line);
  return /(?:\/[A-Za-z0-9._\-]+){3,}/.test(line);
}

function formatSessionLink(sessionUrl: string): string {
  return `view your session in honcho GUI: ${sessionUrl}`;
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

  // Queue user prompt for upload at session-end (instant, no network).
  // Strip pasted code/diffs/output to keep the fact extractor from
  // attributing them to the user. If anything is redacted, tag the message
  // so server-side extraction can filter it from peer attribution.
  if (config.saveMessages !== false) {
    const { prompt: queuedPrompt, redacted } = stripPastes(prompt);
    const metadata = redacted ? { type: "user_paste_not_speech" as const } : undefined;
    queueMessage(queuedPrompt, config.peerName, cwd, instanceId || undefined, metadata);
  }

  // Track message count for threshold-based refresh
  const messageCountBefore = getMessageCount();
  incrementMessageCount();
  const shouldShowSessionLink = messageCountBefore === 0;

  // Build session link lazily — only materialized on first message
  const sessionLink = shouldShowSessionLink
    ? formatSessionLink(honchoSessionUrl(config.workspace, sessionName))
    : undefined;

  // Skip trivial prompts — no context needed for "y", "ok", etc.
  if (shouldSkipContextRetrieval(prompt)) {
    logHook("user-prompt", "Skipping context (trivial prompt)");
    visSkipMessage("user-prompt", sessionLink ? `${sessionLink} · trivial prompt` : "trivial prompt");
    process.exit(0);
  }

  // Decide whether to refresh: TTL expired or message threshold hit
  const forceRefresh = shouldRefreshKnowledgeGraph();
  const cachedContext = getCachedUserContext();
  const cacheIsStale = isContextCacheStale();

  if (cachedContext && !cacheIsStale && !forceRefresh) {
    // Fresh cache — serve instantly, no API call
    logCache("hit", "userContext", "fresh cache");
    verboseApiResult("peer.context() -> representation (cached)", cachedContext?.representation);
    verboseList("peer.context() -> peerCard (cached)", cachedContext?.peerCard);

    serveContext(config.peerName, cachedContext, true, sessionLink);
    process.exit(0);
  }

  // Cache is stale or threshold reached — try a fresh fetch with timeout
  logCache("miss", "userContext", forceRefresh ? "threshold refresh" : "stale cache");

  const fetchResult = await Promise.race([
    fetchFreshContext(config, prompt).then(r => ({ ok: true as const, ...r })),
    new Promise<{ ok: false }>(resolve => setTimeout(() => resolve({ ok: false }), FETCH_TIMEOUT_MS)),
  ]).catch((): { ok: false } => ({ ok: false }));

  if (fetchResult.ok) {
    const { context } = fetchResult;
    if (forceRefresh) {
      markKnowledgeGraphRefreshed();
    }
    if (context) {
      serveContext(config.peerName, context, false, sessionLink);
      process.exit(0);
    }
  }

  // Fetch failed or timed out — silently fall back to stale cache
  const staleContext = getStaleCachedUserContext();
  if (staleContext) {
    logHook("user-prompt", "Serving stale cache after timeout");
    serveContext(config.peerName, staleContext, true, sessionLink);
  }
  // No cache at all — exit silently, context will arrive after session-start completes

  process.exit(0);
}

/**
 * Format and output context injection to Claude.
 */
function serveContext(
  peerName: string,
  context: any,
  cached: boolean,
  sessionLink?: string,
): void {
  const { parts: contextParts } = formatCachedContext(context, peerName);
  if (contextParts.length === 0) return;

  const visMsg = visContextLine("user-prompt", { cached });
  outputContext(peerName, contextParts, sessionLink ? `${sessionLink}\n${visMsg}` : visMsg);
}

async function fetchFreshContext(config: any, prompt: string): Promise<{ context: any }> {
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

  // Try search-based context first — returns conclusions relevant to the prompt
  const topics = extractTopics(prompt);
  const searchQuery = topics.length > 0 ? topics.join(" ") : undefined;

  let contextResult: any = null;

  if (searchQuery) {
    try {
      contextResult = await contextPeer.context({
        ...(contextTarget ? { target: contextTarget } : {}),
        searchQuery,
        searchTopK: 5,
        searchMaxDistance: 0.7,
        maxConclusions: 15,
        includeMostFrequent: true,
      });
      logApiCall(contextLabel, "GET", `search: ${searchQuery.slice(0, 60)}`, Date.now() - startTime, true);
    } catch (e) {
      // Search failed — fall through to static context
      logHook("user-prompt", `Search context failed, falling back to static: ${e}`);
    }
  }

  // Fallback: static context (no search query)
  if (!contextResult) {
    contextResult = await contextPeer.context({
      ...(contextTarget ? { target: contextTarget } : {}),
      maxConclusions: 15,
      includeMostFrequent: true,
    });
    logApiCall(contextLabel, "GET", `static context`, Date.now() - startTime, true);
  }

  if (contextResult) {
    setCachedUserContext(contextResult);
    verboseApiResult("peer.context() -> representation (fresh)", (contextResult as any).representation);
    verboseList("peer.context() -> peerCard (fresh)", (contextResult as any).peerCard);
  }

  return { context: contextResult };
}

function formatCachedContext(context: any, peerName: string): { parts: string[]; conclusionCount: number } {
  const parts: string[] = [];
  let conclusionCount = 0;
  const rep = context?.representation;

  if (typeof rep === "string" && rep.trim()) {
    const lines = rep.split("\n").filter((l: string) => l.trim() && !l.startsWith("#"));
    const selected = lines.slice(0, 5);
    conclusionCount = selected.length;
    const summary = selected.map((l: string) => l.replace(/^\[.*?\]\s*/, "").replace(/^- /, "")).join("; ");
    if (summary) parts.push(`Relevant conclusions: ${summary}`);
  }

  const peerCard = context?.peerCard;
  if (peerCard?.length) {
    parts.push(`Profile: ${peerCard.join("; ")}`);
  }

  return { parts, conclusionCount };
}

function outputContext(peerName: string, contextParts: string[], systemMsg?: string): void {
  let output: any = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `[Honcho Memory for ${peerName}]: ${contextParts.join(" | ")}`,
    },
  };
  if (systemMsg) {
    output = addSystemMessage(output, systemMsg);
  }
  console.log(JSON.stringify(output));
}
