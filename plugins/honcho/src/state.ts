/**
 * Tiny activity-state file the hooks write and the statusline reads.
 * Decoupled by design: hooks can't draw to the Claude Code TUI (no /dev/tty),
 * so instead they record what memory is doing and let the host-managed
 * statusline render the glow/pulse on its own refresh cycle.
 */

import { homedir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, appendFileSync, unlinkSync, mkdirSync } from "fs";

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
  return join(DIR, `saves-${sessionId}.jsonl`);
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

// Append-only, one event per line, because the two writers are separate
// processes with no lock between them: Stop can still be posting a batch while
// the next UserPromptSubmit fires. A read-modify-write of a single JSON object
// would let one hook overwrite the other's increment, and a dropped user
// increment is exactly what session-end reads as "nothing was saved". An
// O_APPEND write of one short line does not interleave, so the events survive
// and the reader sums them.
export function recordMessageSave(role: MessageRole, count: number = 1, sessionId?: string): void {
  if (!sessionId) return;
  try {
    // The write has to survive a missing ~/.honcho: a silently dropped tally
    // would make session-end report a working save path as broken.
    mkdirSync(DIR, { recursive: true });
    appendFileSync(
      savesFile(sessionId),
      `${JSON.stringify({ role, count, at: Date.now() })}\n`,
    );
  } catch {
    // best-effort — a missing tally only costs us a false "broken" warning
  }
}

export function getMessageSaveTally(sessionId?: string): MessageSaveTally {
  const tally: MessageSaveTally = { user: 0, assistant: 0 };
  if (!sessionId) return tally;
  try {
    for (const line of readFileSync(savesFile(sessionId), "utf-8").split("\n")) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as { role?: string; count?: number };
        // A torn or unknown line is skipped rather than failing the whole
        // tally: undercounting costs a warning, discarding everything hides
        // the saves that did land.
        if (entry.role === "user" || entry.role === "assistant") {
          tally[entry.role] += entry.count ?? 0;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // no tally file — the hooks never got as far as a successful upload
  }
  return tally;
}

// Clean up this window's files when its session ends, so they don't accumulate.
export function clearSessionFiles(sessionId?: string): void {
  if (!sessionId) return;
  const legacyTally = join(DIR, `saves-${sessionId}.json`); // pre-JSONL tally
  for (const f of [stateFile(sessionId), sessionFile(sessionId), savesFile(sessionId), legacyTally]) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
}
