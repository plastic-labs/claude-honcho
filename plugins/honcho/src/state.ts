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
// The per-session record of which conclusions UserPromptSubmit has already
// injected. Deliberately a SIBLING of state-*.json rather than a field inside
// it: setMemoryState() rewrites state-${sessionId}.json wholesale on every
// phase change (several times per turn), so a ledger stored there would be
// clobbered constantly. Same directory, same session_id keying, and
// clearSessionFiles() cleans it up with the rest.
function dedupFile(sessionId?: string): string {
  return join(DIR, sessionId ? `dedup-${sessionId}.json` : "dedup.json");
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

/**
 * Which conclusions this session has already injected, and when.
 *
 * `turn` counts injecting UserPromptSubmit turns (trivial and harness-injected
 * prompts exit before reaching this, so they don't advance it). `seen` maps a
 * short content hash to the turn it was LAST ACTUALLY injected on — a
 * suppressed repeat deliberately does not refresh its stamp, so a conclusion
 * becomes eligible again a fixed window after its last real injection rather
 * than being buried for the rest of the session.
 *
 * Only hashes are stored, never conclusion text: the ledger stays tiny and no
 * memory content is duplicated into a second file on disk.
 */
export interface DedupLedger {
  turn: number;
  seen: Record<string, number>;
}

/** Entries older than this many turns are dropped on save, bounding file size. */
export const DEDUP_LEDGER_RETAIN_TURNS = 50;

/** Drop stamps too old to ever matter again. Pure, so it is directly testable. */
export function pruneLedger(ledger: DedupLedger): DedupLedger {
  const cutoff = ledger.turn - DEDUP_LEDGER_RETAIN_TURNS;
  const seen: Record<string, number> = {};
  for (const [key, turn] of Object.entries(ledger.seen)) {
    if (turn > cutoff) seen[key] = turn;
  }
  return { turn: ledger.turn, seen };
}

export function loadDedupLedger(sessionId?: string): DedupLedger {
  try {
    const raw = JSON.parse(readFileSync(dedupFile(sessionId), "utf-8"));
    const turn = typeof raw?.turn === "number" && raw.turn >= 0 ? raw.turn : 0;
    const seen = raw?.seen && typeof raw.seen === "object" ? raw.seen : {};
    return { turn, seen };
  } catch {
    // Missing or corrupt: start clean. A lost ledger costs at most one turn of
    // repeats — never any memory content.
    return { turn: 0, seen: {} };
  }
}

export function saveDedupLedger(ledger: DedupLedger, sessionId?: string): void {
  try {
    writeFileSync(dedupFile(sessionId), JSON.stringify(pruneLedger(ledger)));
  } catch {
    // best-effort — a failed write just means the next turn may repeat itself
  }
}

// Clean up this window's files when its session ends, so they don't accumulate.
export function clearSessionFiles(sessionId?: string): void {
  if (!sessionId) return;
  for (const f of [stateFile(sessionId), sessionFile(sessionId), dedupFile(sessionId)]) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
}
