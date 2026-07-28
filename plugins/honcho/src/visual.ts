/**
 * Visual logging for honcho hooks
 *
 * Only hooks that output JSON with `systemMessage` show inline indicators in Claude Code:
 * - UserPromptSubmit — addSystemMessage() adds to existing JSON output
 * - PostToolUse — visCapture() outputs JSON with systemMessage
 * - Stop — visStopMessage() outputs JSON with systemMessage
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
 * summary followed by the injected conclusions as bullets. The stable profile
 * block is intentionally omitted here — it lives in the injection log, not in
 * every turn's transcript. `matched` is only set for high-signal topics, so a
 * low-signal fuzzy fallback query is never surfaced as a bogus match.
 */
export function visInjectionMessage(hookName: string, opts: {
  conclusions: string[];
  matched?: string[];
  /** Overrides the matched suffix, e.g. "prompt" → "(query: prompt)". */
  queryLabel?: string;
}): string {
  const count = opts.conclusions.length;
  const noun = count === 1 ? "conclusion" : "conclusions";
  const head = opts.queryLabel
    ? `injected ${count} ${noun} (query: ${opts.queryLabel})`
    : opts.matched?.length
      ? `injected ${count} ${noun} (matched: ${opts.matched.join(", ")})`
      : `injected ${count} ${noun}`;
  const summary = formatLine("in", hookName, head);
  const body = opts.conclusions.map(c => `  ${sym.bullet} ${c}`).join("\n");
  return body ? `${summary}\n${body}` : summary;
}

/**
 * Build the per-turn systemMessage for the "dialectic" component: a status line
 * (tier · elapsed) followed by the full reasoned answer, so the user sees
 * exactly what was injected. The answer is prose and can be long — that's the
 * intended trade-off; it also lands in additionalContext for the model.
 */
export function visDialecticMessage(hookName: string, reasoning: string, elapsedMs: number, answer: string): string {
  const head = formatLine("in", hookName, `injected dialectic (${reasoning} · ${(elapsedMs / 1000).toFixed(1)}s)`);
  return answer.trim() ? `${head}\n${answer.trim()}` : head;
}

/**
 * Build the per-turn systemMessage for the "sessionContext" component: a
 * status line with the message and token counts, then every injected message
 * as a bullet. Each message is collapsed to a single truncated line — the
 * full text goes to additionalContext; this listing is for visibility into
 * what was injected. The count has no display cutoff: it's bounded upstream
 * by the sessionContextTokens budget passed to session.context().
 */
export function visSessionContextMessage(hookName: string, lines: string[], tokenCount: number): string {
  const noun = lines.length === 1 ? "message" : "messages";
  const head = formatLine("in", hookName, `injected ${lines.length} session ${noun} (~${tokenCount} tokens)`);
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
 * line naming which components were injected (e.g. "injected summary + peer
 * card (12 items)"). Session start is a once-per-session surface, so unlike the
 * per-turn line it stays terse — the payload itself goes to additionalContext.
 */
export function visComposedInjection(hookName: string, labels: string[]): string {
  const summary = labels.length ? `injected ${labels.join(" + ")}` : "nothing to inject";
  return formatLine("in", hookName, summary);
}

/**
 * Output tool capture as systemMessage (for post-tool-use — no existing stdout)
 */
export function visCapture(summary: string): void {
  visMessage("out", "post-tool-use", `captured: ${summary}`);
}

/**
 * Output skip as systemMessage (for hooks with no existing stdout)
 */
export function visSkipMessage(hookName: string, reason: string): void {
  visMessage("info", hookName, `skipped (${reason})`);
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
// NOTE: This file-based verbose output is used by SessionStart and
// UserPromptSubmit hooks, where stdout is always visible to Claude
// (not just in Ctrl+O). For hooks where stdout is only shown in
// Ctrl+O (PreCompact, PostToolUse, Stop, SessionEnd), prefer
// printing verbose data to stdout instead — use formatVerboseBlock().
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

// ============================================
// Stdout-based verbose output — for Ctrl+O visibility
//
// In Claude Code, Ctrl+O toggles visibility of hook stdout.
// For hooks where stdout is only shown in Ctrl+O (PreCompact,
// PostToolUse, Stop, SessionEnd), we can print verbose data
// directly to stdout so it appears when the user presses Ctrl+O.
// ============================================

/**
 * Format verbose API response data as a plain-text block for stdout.
 * Use in hooks where stdout is only visible in Ctrl+O (PreCompact, Stop, etc.).
 * Returns empty string if data is null/undefined.
 */
export function formatVerboseBlock(label: string, data: string | null | undefined): string {
  if (!data) return "";
  const separator = "─".repeat(60);
  const content = data.length > 3000 ? data.slice(0, 3000) + `\n... (${data.length - 3000} more chars)` : data;
  return `\n[verbose] ${label}\n${separator}\n${content}\n${separator}`;
}

/**
 * Format a list of items as a plain-text block for stdout.
 * Use in hooks where stdout is only visible in Ctrl+O (PreCompact, Stop, etc.).
 * Returns empty string if items is null/undefined/empty.
 */
export function formatVerboseList(label: string, items: string[] | null | undefined): string {
  if (!items || items.length === 0) return "";
  const formatted = items.map(item => `  • ${item}`).join("\n");
  return `\n[verbose] ${label} (${items.length} items)\n${formatted}`;
}
