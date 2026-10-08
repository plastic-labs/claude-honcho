/**
 * Visual logging for honcho hooks
 *
 * Only hooks that output JSON with `systemMessage` show inline indicators in Claude Code:
 * - UserPromptSubmit — addSystemMessage() adds to existing JSON output
 * - PostToolUse — visCapture() outputs JSON with systemMessage
 * - Stop — visStopMessage() outputs JSON with systemMessage, on a failed upload only
 *
 * SessionStart, SessionEnd, and PreCompact output plain text to stdout (context injection),
 * so they cannot show inline indicators. Their activity is logged to the verbose log file only.
 */

import { arrows, symbols } from "./unicode.js";
import { isLoggingEnabled } from "./config.js";

// Plain text (no ANSI) for systemMessage — shown in Claude Code's UI
const sym = {
  left: arrows.left,      // ←
  right: arrows.right,    // →
  check: symbols.check,   // ✓
  bullet: symbols.bullet, // •
  cross: symbols.cross,   // ✗
};

type HookDirection = "in" | "out" | "info" | "ok" | "warn" | "error";

const directionSymbol: Record<HookDirection, string> = {
  in:    sym.left,
  out:   sym.right,
  info:  sym.bullet,
  ok:    sym.check,
  warn:  "!",
  error: sym.cross,
};

/**
 * Format a visual log line (plain text, no ANSI — for systemMessage display)
 */
function formatLine(direction: HookDirection, hookName: string, message: string): string {
  return `[honcho] ${hookName} ${directionSymbol[direction]} ${message}`;
}

/**
 * Output a systemMessage JSON to stdout — shown to the user in Claude Code's UI
 * Use this for hooks that don't already write to stdout (PostToolUse, Stop)
 */
export function visMessage(direction: HookDirection, hookName: string, message: string): void {
  const line = formatLine(direction, hookName, message);
  console.log(JSON.stringify({ systemMessage: line }));
}

/**
 * Build the injection systemMessage for the user-prompt hook: a one-line status
 * summary, and with `showContents` the injected conclusions as bullets. The
 * stable profile block is intentionally omitted here — it lives in the injection
 * log, not in every turn's transcript. `matched` is only set for high-signal
 * topics, so a low-signal fuzzy fallback query is never surfaced as a bogus
 * match.
 */
export function visInjectionMessage(hookName: string, opts: {
  conclusions: string[];
  matched?: string[];
  /** Overrides the matched suffix, e.g. "prompt" → "(query: prompt)". */
  queryLabel?: string;
  /** Print the conclusions, not just the count. */
  showContents?: boolean;
}): string {
  const count = opts.conclusions.length;
  const noun = count === 1 ? "conclusion" : "conclusions";
  const head = opts.queryLabel
    ? `injected ${count} ${noun} (query: ${opts.queryLabel})`
    : opts.matched?.length
      ? `injected ${count} ${noun} (matched: ${opts.matched.join(", ")})`
      : `injected ${count} ${noun}`;
  const summary = formatLine("in", hookName, head);
  if (!opts.showContents) return summary;
  const body = opts.conclusions.map(c => `  ${sym.bullet} ${c}`).join("\n");
  return body ? `${summary}\n${body}` : summary;
}

/**
 * Build the per-turn systemMessage for the "dialectic" component: a status line
 * (tier · elapsed), and with `showContents` the full reasoned answer, so the
 * user sees exactly what was injected. The answer is prose and can be long —
 * that's the trade-off for showing it; it lands in additionalContext for the
 * model either way.
 */
export function visDialecticMessage(hookName: string, reasoning: string, elapsedMs: number, answer: string, showContents = false): string {
  const head = formatLine("in", hookName, `injected dialectic (${reasoning} · ${(elapsedMs / 1000).toFixed(1)}s)`);
  return showContents && answer.trim() ? `${head}\n${answer.trim()}` : head;
}

/**
 * Build the per-turn systemMessage for the "sessionContext" component: a
 * status line with the message and token counts, and with `showContents` every
 * injected message as a bullet. Each message is collapsed to a single truncated
 * line — the full text goes to additionalContext; this listing is for
 * visibility into what was injected. The count has no display cutoff: it's
 * bounded upstream by the sessionContextTokens budget passed to
 * session.context().
 */
export function visSessionContextMessage(hookName: string, lines: string[], tokenCount: number, showContents = false): string {
  const noun = lines.length === 1 ? "message" : "messages";
  const head = formatLine("in", hookName, `injected ${lines.length} session ${noun} (~${tokenCount} tokens)`);
  if (!showContents) return head;
  const body = lines
    .map((l) => {
      const flat = l.replace(/\s+/g, " ").trim();
      return `  ${sym.bullet} ${flat.length > 150 ? `${flat.slice(0, 149)}…` : flat}`;
    })
    .join("\n");
  return body ? `${head}\n${body}` : head;
}

/**
 * Build the systemMessage for the SessionStart composition: a single status
 * line naming which components were injected and which came back empty (e.g.
 * "injected directives · summary none yet · peer card empty"). Session start is
 * a once-per-session surface, so unlike the per-turn line it stays terse — the
 * payload itself goes to additionalContext.
 */
export function visComposedInjection(hookName: string, labels: string[], notes: string[] = []): string {
  const head = labels.length ? `injected ${labels.join(" + ")}` : "nothing injected";
  return formatLine("in", hookName, [head, ...notes].join(" · "));
}

/**
 * Build the per-turn line for a selected component that injected nothing.
 * `unavailable` marks a fetch that failed or timed out.
 */
export function visEmptyComponent(hookName: string, message: string, unavailable = false): string {
  return formatLine(unavailable ? "warn" : "info", hookName, message);
}

/**
 * One-line PreCompact summary of what the memory anchor carries, e.g.
 * "anchored peer card (12 items) · conclusions · 2 dialectic answers (3.1s)".
 */
export function visAnchorSummary(hookName: string, items: string[], elapsedMs: number): string {
  const what = items.length ? items.join(" · ") : "session identity only";
  return formatLine("in", hookName, `anchored ${what} (${(elapsedMs / 1000).toFixed(1)}s)`);
}

/**
 * Output tool capture as systemMessage (for post-tool-use — no existing stdout)
 */
export function visCapture(summary: string): void {
  visMessage("out", "post-tool-use", `captured: ${summary}`);
}

/**
 * Output skip as systemMessage (for hooks with no existing stdout), below a
 * one-off banner when one is due.
 */
export function visSkipMessage(hookName: string, reason: string, banner?: string): void {
  const line = formatLine("info", hookName, `skipped (${reason})`);
  console.log(JSON.stringify({ systemMessage: banner ? `${banner}\n${line}` : line }));
}

/**
 * Output stop hook message as systemMessage (no existing stdout)
 * Named "response" in display — "stop" fires after every Claude turn, not session end
 */
export function visStopMessage(direction: HookDirection, message: string): void {
  visMessage(direction, "response", message);
}

/**
 * Add systemMessage to an existing hookSpecificOutput JSON object
 * Used by UserPromptSubmit which already outputs JSON
 */
export function addSystemMessage(existingJson: any, message: string): any {
  return { ...existingJson, systemMessage: message };
}

// ============================================
// Verbose output — written to ~/.honcho/verbose.log
// Tail with: tail -f ~/.honcho/verbose.log
//
// Hook stdout reaches the transcript (and often the model), so full API
// payloads go here instead.
// ============================================

import { homedir } from "os";
import { join } from "path";
import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "fs";

const VERBOSE_LOG = join(homedir(), ".honcho", "verbose.log");

function ensureVerboseLog(): void {
  const dir = join(homedir(), ".honcho");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function writeVerbose(text: string): void {
  if (!isLoggingEnabled()) return;
  ensureVerboseLog();
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  appendFileSync(VERBOSE_LOG, `[${timestamp}] ${text}\n`);
}

/**
 * Log detailed API response data to verbose log file (~/.honcho/verbose.log).
 * Used by SessionStart and UserPromptSubmit hooks where stdout is always
 * visible to Claude (so we can't use stdout for debug data).
 * View with: tail -f ~/.honcho/verbose.log
 */
export function verboseApiResult(label: string, data: string | null | undefined): void {
  if (!data) return;
  const separator = "─".repeat(60);
  const content = data.length > 3000 ? data.slice(0, 3000) + `\n... (${data.length - 3000} more chars)` : data;
  writeVerbose(`${label}\n${separator}\n${content}\n${separator}`);
}

/**
 * Log a list of items (like peerCard) to verbose log file (~/.honcho/verbose.log).
 * Used by SessionStart and UserPromptSubmit hooks (stdout always visible).
 */
export function verboseList(label: string, items: string[] | null | undefined): void {
  if (!items || items.length === 0) return;
  const formatted = items.map(item => `  • ${item}`).join("\n");
  writeVerbose(`${label} (${items.length} items)\n${formatted}`);
}

/**
 * Clear the verbose log (call at session start)
 */
export function clearVerboseLog(): void {
  if (!isLoggingEnabled()) return;
  ensureVerboseLog();
  writeFileSync(VERBOSE_LOG, "");
}

/**
 * Get the verbose log path
 */
export function getVerboseLogPath(): string {
  return VERBOSE_LOG;
}
