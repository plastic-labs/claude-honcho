/**
 * Tiny activity-state file the hooks write and the statusline reads.
 * Decoupled by design: hooks can't draw to the Claude Code TUI (no /dev/tty),
 * so instead they record what memory is doing and let the host-managed
 * statusline render the glow/pulse on its own refresh cycle.
 */

import { homedir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync } from "fs";

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
function savesFile(sessionId?: string): string {
  return join(DIR, sessionId ? `saves-${sessionId}.json` : "saves.json");
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
export function recordMessageSave(count: number = 1, sessionId?: string): void {
  try {
    writeFileSync(
      savesFile(sessionId),
      JSON.stringify({ saved: getMessageSaveCount(sessionId) + count, at: Date.now() }),
    );
  } catch {
    // best-effort — a missing tally only costs us a false "broken" warning
  }
}

export function getMessageSaveCount(sessionId?: string): number {
  try {
    return JSON.parse(readFileSync(savesFile(sessionId), "utf-8")).saved ?? 0;
  } catch {
    return 0;
  }
}

// Clean up this window's files when its session ends, so they don't accumulate.
export function clearSessionFiles(sessionId?: string): void {
  if (!sessionId) return;
  for (const f of [stateFile(sessionId), sessionFile(sessionId), savesFile(sessionId)]) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
}
