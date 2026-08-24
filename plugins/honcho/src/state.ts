/**
 * Tiny activity-state file the hooks write and the statusline reads.
 * Decoupled by design: hooks can't draw to the Claude Code TUI (no /dev/tty),
 * so instead they record what memory is doing and let the host-managed
 * statusline render the glow/pulse on its own refresh cycle.
 */

import { homedir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";

const DIR = join(homedir(), ".honcho");

// Per-window files keyed by Claude Code's session_id (the one field guaranteed
// identical between hook stdin and statusLine stdin). Falls back to a global
// file when no session_id is available, so multiple windows don't clobber each
// other's link/phase.
function stateFile(sessionId?: string): string {
  return join(DIR, sessionId ? `state-${sessionId}.json` : "state.json");
}
function sessionFile(sessionId?: string): string {
  return join(DIR, sessionId ? `session-${sessionId}.json` : "session.json");
}
// Unlike the state/session files above there is no global fallback: a tally is
// only meaningful for one window, and a shared file would let a session with no
// session_id read a stale positive count left by an earlier one (nothing clears
// it, since clearSessionFiles needs a session_id). No key means no tally, and
// session-end reports the validation as unavailable rather than guessing.
function savesFile(sessionId: string): string {
  return join(DIR, `saves-${sessionId}.json`);
}

export type MemoryPhase =
  | "idle"
  | "loading"
  | "compacting"
  | "recalling"
  | "querying";    // an explicit honcho MCP tool call (search/chat/context/...)

export function setMemoryState(phase: MemoryPhase, detail?: string, sessionId?: string): void {
  try {
    writeFileSync(stateFile(sessionId), JSON.stringify({ phase, since: Date.now(), detail }));
  } catch {
    // best-effort — statusline falls back to idle if this is missing/stale
  }
}

// The hooks own the workspace + session-name math, so they write the resolved
// web URL here for the statusline to render as a clickable link.
export function setSessionLink(url: string, name: string | undefined, sessionId?: string): void {
  try {
    writeFileSync(sessionFile(sessionId), JSON.stringify({ url, name }));
  } catch {
    // best-effort — statusline just omits the link if this is missing
  }
}

// Tally of messages this window actually landed on the server. The upload hooks
// bump it after a successful POST; session-end reads it so it can tell "nothing
// to save" apart from "the saving hooks never ran" instead of assuming success.
// User and assistant saves are counted separately on purpose: Stop and
// UserPromptSubmit fail independently, so a single total would let a successful
// assistant upload hide the fact that the user's own message never landed.
export type MessageRole = "user" | "assistant";

export interface MessageSaveTally {
  user: number;
  assistant: number;
}

export function recordMessageSave(role: MessageRole, count: number = 1, sessionId?: string): void {
  if (!sessionId) return;
  try {
    // The write has to survive a missing ~/.honcho: a silently dropped tally
    // would make session-end report a working save path as broken.
    mkdirSync(DIR, { recursive: true });
    const tally = getMessageSaveTally(sessionId);
    tally[role] += count;
    writeFileSync(
      savesFile(sessionId),
      JSON.stringify({ ...tally, at: Date.now() }),
    );
  } catch {
    // best-effort — a missing tally only costs us a false "broken" warning
  }
}

export function getMessageSaveTally(sessionId?: string): MessageSaveTally {
  if (!sessionId) return { user: 0, assistant: 0 };
  try {
    const raw = JSON.parse(readFileSync(savesFile(sessionId), "utf-8"));
    return { user: raw.user ?? 0, assistant: raw.assistant ?? 0 };
  } catch {
    return { user: 0, assistant: 0 };
  }
}

// Clean up this window's files when its session ends, so they don't accumulate.
export function clearSessionFiles(sessionId?: string): void {
  if (!sessionId) return;
  for (const f of [stateFile(sessionId), sessionFile(sessionId), savesFile(sessionId)]) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
}
