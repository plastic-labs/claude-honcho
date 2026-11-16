/**
 * Parse Claude Code session transcripts (`~/.claude/projects/<dir>/<uuid>.jsonl`)
 * for the /honcho import backfill.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { StringDecoder } from "string_decoder";
import { join } from "path";
import { isHarnessInjected, isSlashCommand, stripLeadingReminders } from "../prompt-filters.js";

export interface TranscriptEntry {
  type?: string;
  role?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  sessionId?: string;
  cwd?: string;
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
}

function entryType(entry: TranscriptEntry): string | undefined {
  return entry.type || entry.role;
}

/** Same prompt classifier as the live hooks; literal XML is still user text. */
function isRealUserPrompt(entry: TranscriptEntry): boolean {
  if (entry.isMeta) return false;
  const text = userText(entry);
  return !isHarnessInjected(text) && !isSlashCommand(text);
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
 * timestamp, plus the Claude Code session id. Skips isMeta / isSidechain
 * / tool-result-only / harness-injected turns / slash commands.
 */
export function parseTranscriptForBackfill(transcriptPath: string): {
  messages: ParsedMessage[];
  sessionId?: string;
  cwd?: string;
} {
  const messages: ParsedMessage[] = [];
  let sessionId: string | undefined;
  let cwd: string | undefined;

  for (const line of readLines(transcriptPath)) {
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.sessionId) sessionId = entry.sessionId;
    if (!cwd && entry.cwd) cwd = entry.cwd;

    if (entry.isMeta || entry.isSidechain) continue;
    const type = entryType(entry);

    if (type === "user") {
      if (!isRealUserPrompt(entry)) continue;
      const content = stripLeadingReminders(userText(entry)).trim();
      if (content) {
        messages.push({ role: "user", content, timestamp: entry.timestamp });
      }
    } else if (type === "assistant") {
      const content = assistantText(entry).trim();
      if (content) {
        messages.push({ role: "assistant", content, timestamp: entry.timestamp });
      }
    }
  }

  // Last assistant block of a turn = response, earlier ones = intermediate.
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "assistant") continue;
    const next = messages[i + 1];
    messages[i].isResponse = !next || next.role === "user";
  }

  return { messages, sessionId, cwd };
}

/**
 * The working directory a transcript was recorded in (its first entry with a
 * cwd, as parseTranscriptForBackfill reports it), reading only as far as that
 * entry instead of the whole file.
 */
export function transcriptCwd(transcriptPath: string): string | undefined {
  let fd: number;
  try {
    fd = openSync(transcriptPath, "r");
  } catch {
    return undefined;
  }
  try {
    const chunk = Buffer.alloc(64 * 1024);
    const decoder = new StringDecoder("utf8"); // keeps a character split across chunks whole
    let pending = "";
    for (let pos = 0; ; ) {
      const n = readSync(fd, chunk, 0, chunk.length, pos);
      const eof = n === 0;
      pos += n;
      pending += eof ? decoder.end() : decoder.write(chunk.subarray(0, n));
      const lines = pending.split("\n");
      pending = eof ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.includes('"cwd"')) continue;
        try {
          const entry = JSON.parse(line) as TranscriptEntry;
          if (entry.cwd) return entry.cwd;
        } catch {
          continue;
        }
      }
      if (eof) return undefined;
    }
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

/** All transcript files under ~/.claude/projects modified within `days`. */
export function findTranscripts(days: number): Array<{ path: string; mtimeMs: number }> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const out: Array<{ path: string; mtimeMs: number }> = [];
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const dirPath = join(PROJECTS_DIR, dir);
    let entries: string[];
    try {
      if (!statSync(dirPath).isDirectory()) continue;
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(dirPath, file);
      try {
        const st = statSync(path);
        if (st.mtimeMs >= cutoff) out.push({ path, mtimeMs: st.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return out;
}
