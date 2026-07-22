/**
 * Parse Claude Code session transcripts (`~/.claude/projects/<dir>/<uuid>.jsonl`)
 * for the /honcho:import backfill.
 */
import { existsSync, readFileSync } from "fs";

export interface TranscriptEntry {
  type?: string;
  role?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  message?: {
    role?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
}

/** Ordered, cleaned message ready to upload. */
export interface ParsedMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  /** Assistant only: last block of its turn (assistant_response vs assistant_intermediate). */
  isResponse?: boolean;
  /** Entry's env, used for session mapping. */
  cwd?: string;
  gitBranch?: string;
}

function entryType(entry: TranscriptEntry): string | undefined {
  return entry.type || entry.role;
}

/** True for a real user-typed prompt. Excludes tool_results, isMeta entries, and `<...>` command caveats. */
function isRealUserPrompt(entry: TranscriptEntry): boolean {
  if (entry.isMeta) return false;
  const mc = entry.message?.content ?? entry.content;
  const text =
    typeof mc === "string"
      ? mc
      : Array.isArray(mc)
        ? mc.filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("")
        : "";
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}

function userText(entry: TranscriptEntry): string {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string") return mc;
  if (Array.isArray(mc)) return mc.filter((p) => p.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

function assistantText(entry: TranscriptEntry): string {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string") return mc;
  if (Array.isArray(mc)) return mc.filter((p) => p.type === "text" && p.text).map((p) => p.text!).join("\n\n");
  return "";
}

function readLines(transcriptPath: string): string[] {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try {
    return readFileSync(transcriptPath, "utf-8").split("\n").filter((line) => line.trim());
  } catch {
    return [];
  }
}

/**
 * Full-conversation parse: user + assistant messages in order, each with its
 * timestamp and the cwd/gitBranch for session mapping. Skips isMeta / isSidechain
 * / tool-result-only / `<...>` command caveats.
 */
export function parseTranscriptForBackfill(transcriptPath: string): {
  messages: ParsedMessage[];
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
} {
  const messages: ParsedMessage[] = [];
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let sessionId: string | undefined;

  for (const line of readLines(transcriptPath)) {
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // Track the latest environment seen — used to name the session.
    if (entry.cwd) cwd = entry.cwd;
    if (entry.gitBranch) gitBranch = entry.gitBranch;
    if (entry.sessionId) sessionId = entry.sessionId;

    if (entry.isMeta || entry.isSidechain) continue;
    const type = entryType(entry);

    if (type === "user") {
      if (!isRealUserPrompt(entry)) continue;
      const content = userText(entry).trim();
      if (content) {
        messages.push({ role: "user", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    } else if (type === "assistant") {
      const content = assistantText(entry).trim();
      if (content) {
        messages.push({ role: "assistant", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    }
  }

  // Last assistant block of a turn = response, earlier ones = intermediate.
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "assistant") continue;
    const next = messages[i + 1];
    messages[i].isResponse = !next || next.role === "user";
  }

  return { messages, cwd, gitBranch, sessionId };
}
