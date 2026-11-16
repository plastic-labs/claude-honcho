/**
 * Per-window files the hooks write under ~/.honcho for the mod
 * (hooks/register.tsx) to read: hooks can't draw to the Claude Code TUI, so
 * they leave what the mod needs here, keyed by Claude Code's session_id.
 */

import { homedir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";

const DIR = join(homedir(), ".honcho");

function sessionFile(sessionId: string): string {
  return join(DIR, `session-${sessionId}.json`);
}
function noticeFile(sessionId: string): string {
  return join(DIR, `notice-${sessionId}.json`);
}

/** Set by the mod (hooks/register.tsx). */
export function isModActive(): boolean {
  return process.env.HONCHO_MOD_UI === "1";
}

// The version nag, which the mod shows as a toast.
export function setNotice(text: string, sessionId: string): void {
  try {
    writeFileSync(noticeFile(sessionId), JSON.stringify({ text }));
  } catch {
    // best-effort
  }
}

// The hooks own the workspace + session-name math, so they write the resolved
// web URL here for `/honcho status` to show.
export function setSessionLink(url: string | null, name: string | undefined, sessionId?: string): void {
  if (!sessionId) return;
  try {
    writeFileSync(sessionFile(sessionId), JSON.stringify({ url, name }));
  } catch {
    // best-effort — /honcho status just omits the link if this is missing
  }
}

// Clean up this window's files when its session ends, so they don't accumulate.
export function clearSessionFiles(sessionId?: string): void {
  if (!sessionId) return;
  for (const f of [sessionFile(sessionId), noticeFile(sessionId)]) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
}
