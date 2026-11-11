/**
 * Visual logging for honcho hooks
 *
 * Only hooks that output JSON with `systemMessage` show inline indicators in Claude Code:
 * - UserPromptSubmit — addSystemMessage() adds to existing JSON output
 * - Stop — visStopMessage() outputs JSON with systemMessage, on a failed upload only
 *
 * SessionStart and SessionEnd output plain text to stdout (context injection),
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
 * Use this for hooks that don't already write to stdout (Stop)
 */
export function visMessage(direction: HookDirection, hookName: string, message: string): void {
  const line = formatLine(direction, hookName, message);
  console.log(JSON.stringify({ systemMessage: line }));
}

/**
 * Build the systemMessage for the SessionStart composition: a single status
 * line naming which components were injected and which came back empty (e.g.
 * "injected directives · peer card empty"). Session start is
 * a once-per-session surface, so unlike the per-turn line it stays terse — the
 * payload itself goes to additionalContext.
 */
export function visComposedInjection(hookName: string, labels: string[], notes: string[] = []): string {
  const head = labels.length ? `injected ${labels.join(" + ")}` : "nothing injected";
  return formatLine("in", hookName, [head, ...notes].join(" · "));
}

/**
 * Output stop hook message as systemMessage (no existing stdout)
 * Named "response" in display — "stop" fires after every Claude turn, not session end
 */
export function visStopMessage(direction: HookDirection, message: string): void {
  visMessage(direction, "response", message);
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
