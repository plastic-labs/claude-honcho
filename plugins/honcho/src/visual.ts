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
 * Build context injection details string
 * Used by user-prompt hook (which outputs JSON systemMessage — works)
 */
export function visContextLine(hookName: string, opts: {
  facts?: number;
  insights?: number;
  cached?: boolean;
  cacheAge?: number;
  sections?: number;
}): string {
  const parts: string[] = [];
  if (opts.facts) parts.push(`${opts.facts} facts`);
  if (opts.insights) parts.push(`${opts.insights} insights`);
  if (opts.sections) parts.push(`${opts.sections} sections`);

  let suffix = "";
  if (opts.cached) {
    const age = opts.cacheAge ? ` ${opts.cacheAge}s ago` : "";
    suffix = ` (cached${age})`;
  }

  if (parts.length > 0) {
    return formatLine("in", hookName, `injected ${parts.join(", ")}${suffix}`);
  }
  return "";
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
