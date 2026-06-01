import {
  existsSync,
  readFileSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  fstatSync,
  readSync,
  closeSync,
} from "fs";
import { join } from "path";
import {
  loadConfig,
  getSessionName,
  isPluginEnabled,
  getCachedStdin,
  getConfigDir,
  getDetectedHost,
} from "../config.js";
import {
  generateClaudeSummary,
  saveClaudeLocalContext,
  loadClaudeLocalContext,
  getInstanceIdForCwd,
} from "../cache.js";
import { logHook, setLogContext } from "../log.js";
import type { SessionEndPayload } from "./session-end-worker.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
  workspace_roots?: string[];
}

interface TranscriptEntry {
  type: string;
  timestamp?: string;
  message?: {
    role?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

/**
 * Check if assistant content is meaningful prose vs just tool acknowledgment
 */
function isMeaningfulAssistantContent(content: string): boolean {
  if (content.length < 50) return false;

  const toolAnnouncements = [
    /^(I'll|Let me|I'm going to|I will|Now I'll|First,? I'll)\s+(run|use|execute|check|read|look at|search|edit|write|create)/i,
    /^Running\s+/i,
    /^Checking\s+/i,
    /^Looking at\s+/i,
  ];
  for (const pattern of toolAnnouncements) {
    if (pattern.test(content.trim()) && content.length < 200) {
      return false;
    }
  }

  if (/^(The command|The file|The output|This shows|Here's what)/i.test(content.trim()) && content.length < 150) {
    return false;
  }

  const meaningfulPatterns = [
    /\b(because|since|therefore|however|although|this means|in summary|to summarize|the issue is|the problem is|I recommend|you should|we should|this approach|the solution|key point|important|note that)\b/i,
    /\b(implemented|fixed|resolved|completed|added|created|updated|changed|modified|refactored)\b/i,
    /\b(error|bug|issue|problem|solution|fix|improvement|optimization)\b/i,
  ];
  for (const pattern of meaningfulPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return content.length >= 200;
}

// cap how much of a transcript we read on the exit critical path. recent
// messages (what the tail-based summary/upload need) live at the end of the
// jsonl file, so reading only the last slice bounds work on huge transcripts
// and keeps the hook from re-blocking the exit it is meant to free.
const TRANSCRIPT_TAIL_CAP = 4 * 1024 * 1024; // 4 MB

/** read at most the last `cap` bytes of a (possibly huge) transcript. when the
 *  window starts mid-line, the partial first line is dropped so JSON.parse never
 *  sees half a line; when it already starts on a line boundary nothing is lost. */
export function readTranscriptTail(transcriptPath: string, cap = TRANSCRIPT_TAIL_CAP): string {
  const fd = openSync(transcriptPath, "r");
  try {
    const size = fstatSync(fd).size;
    if (size <= cap) {
      return readFileSync(transcriptPath, "utf-8");
    }
    const start = size - cap;
    // peek the byte before the window: if it's a newline the window already
    // begins on a clean line boundary, so the first line is complete — keep it.
    const prev = Buffer.allocUnsafe(1);
    readSync(fd, prev, 0, 1, start - 1);
    const cutMidLine = prev[0] !== 0x0a; // 0x0a = "\n"

    const buf = Buffer.allocUnsafe(cap);
    const read = readSync(fd, buf, 0, cap, start);
    const text = buf.toString("utf-8", 0, read);
    if (!cutMidLine) return text;
    const nl = text.indexOf("\n");
    return nl >= 0 ? text.slice(nl + 1) : text;
  } finally {
    closeSync(fd);
  }
}

function parseTranscript(transcriptPath: string): Array<{ role: string; content: string; isMeaningful?: boolean; timestamp?: string }> {
  const messages: Array<{ role: string; content: string; isMeaningful?: boolean; timestamp?: string }> = [];

  if (!transcriptPath || !existsSync(transcriptPath)) {
    return messages;
  }

  try {
    const content = readTranscriptTail(transcriptPath);
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);
        const entryType = entry.type || entry.role;
        const messageContent = entry.message?.content || entry.content;

        if (entryType === "user" && messageContent) {
          const userContent =
            typeof messageContent === "string"
              ? messageContent
              : messageContent
                  .filter((p) => p.type === "text")
                  .map((p) => p.text || "")
                  .join("\n");
          if (userContent && userContent.trim()) {
            messages.push({ role: "user", content: userContent, timestamp: entry.timestamp });
          }
        } else if (entryType === "assistant" && messageContent) {
          let assistantContent = "";

          if (typeof messageContent === "string") {
            assistantContent = messageContent;
          } else if (Array.isArray(messageContent)) {
            const textBlocks = messageContent
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text!)
              .join("\n\n");

            const toolUses = messageContent
              .filter((p) => p.type === "tool_use")
              .map((p: any) => p.name)
              .filter(Boolean);

            assistantContent = textBlocks;

            if (toolUses.length > 0 && textBlocks.length < 100) {
              assistantContent = textBlocks + (textBlocks ? "\n" : "") + `[Used tools: ${toolUses.join(", ")}]`;
            }
          }

          if (assistantContent && assistantContent.trim()) {
            const isMeaningful = isMeaningfulAssistantContent(assistantContent);
            const maxLen = isMeaningful ? 3000 : 1500;
            messages.push({
              role: "assistant",
              content: assistantContent.slice(0, maxLen),
              isMeaningful,
              timestamp: entry.timestamp,
            });
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Failed to read transcript
  }

  return messages;
}

function extractWorkItems(assistantMessages: string[]): string[] {
  const workItems: string[] = [];
  const actionPatterns = [
    /(?:created|wrote|added)\s+(?:file\s+)?([^\n.]+)/gi,
    /(?:edited|modified|updated|fixed)\s+([^\n.]+)/gi,
    /(?:implemented|built|developed)\s+([^\n.]+)/gi,
    /(?:refactored|optimized|improved)\s+([^\n.]+)/gi,
  ];

  for (const msg of assistantMessages.slice(-15)) {
    for (const pattern of actionPatterns) {
      const matches = msg.matchAll(pattern);
      for (const match of matches) {
        const item = match[1]?.trim();
        if (item && item.length < 100 && !workItems.includes(item)) {
          workItems.push(item);
        }
      }
    }
  }

  return workItems.slice(0, 10);
}

/**
 * Hand the Honcho upload to a detached background worker so the hook returns in
 * milliseconds. SessionEnd runs while Claude Code is tearing down; any network
 * I/O on the critical path risks blowing the exit budget and getting cancelled.
 * The worker is fully detached (new session via setsid, stdio ignored, unref'd)
 * so it outlives this process and uploads out-of-band. Best-effort: a failure to
 * dispatch never blocks exit — the local summary was already saved in phase 1.
 */
function dispatchUploadWorker(payload: SessionEndPayload): void {
  // track only files WE created, so failure-cleanup can never unlink another
  // process's payload (filenames are unique, but stay defensive).
  let createdTmp: string | undefined;
  let createdFinal: string | undefined;
  try {
    const stateDir = getConfigDir();
    const queueDir = join(stateDir, "session-end-queue");
    // 0700 dir + 0600 file: the payload holds transcript-derived conversation
    // text, so keep it private even under a permissive umask. mkdir's mode only
    // applies on creation, so also chmod (best-effort) to tighten a queue dir
    // that a prior build may have created with looser permissions.
    mkdirSync(queueDir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(queueDir, 0o700);
    } catch {
      // best-effort: a chmod failure must never block the upload dispatch
    }

    const finalPath = join(
      queueDir,
      `payload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const tmpPath = `${finalPath}.tmp`;
    // atomic publish: exclusive-create the tmp file, then rename so the worker
    // never sees a partial file (rename preserves the 0600 mode).
    writeFileSync(tmpPath, JSON.stringify(payload), { mode: 0o600, flag: "wx" });
    createdTmp = tmpPath;
    renameSync(tmpPath, finalPath);
    createdTmp = undefined;
    createdFinal = finalPath;

    const workerPath = join(import.meta.dir, "session-end-worker.ts");
    const proc = Bun.spawn([process.execPath, "run", workerPath], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        HONCHO_SESSION_END_PAYLOAD: finalPath,
      },
    });
    // the worker now owns the payload and will unlink it.
    createdFinal = undefined;
    proc.unref();
  } catch (error) {
    logHook("session-end", `Failed to dispatch upload worker: ${error}`, { error: String(error) });
    // best-effort: never leave an unpublished/un-owned payload (conversation text) behind.
    for (const p of [createdTmp, createdFinal]) {
      if (!p) continue;
      try {
        unlinkSync(p);
      } catch {
        // already gone
      }
    }
  }
}

/**
 * SessionEnd hook — returns instantly, never blocks Claude Code's exit.
 *
 *   1. Phase 1: local summary (synchronous, zero risk — guaranteed before exit)
 *   2. Phase 2: dispatch a detached worker for the Honcho upload, then exit 0
 */
export async function handleSessionEnd(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  if (!isPluginEnabled()) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = getCachedStdin() ?? await Bun.stdin.text();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    // Continue with defaults
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const reason = hookInput.reason || "unknown";
  const transcriptPath = hookInput.transcript_path;
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);

  setLogContext(cwd, sessionName);
  logHook("session-end", `Session ending`, { reason });

  // =========================================================
  // Phase 1: LOCAL WORK (instant, survives any cancellation)
  // =========================================================
  const transcriptMessages = transcriptPath ? parseTranscript(transcriptPath) : [];
  const allAssistant = transcriptMessages.filter((msg) => msg.role === "assistant");
  const meaningful = allAssistant.filter((msg) => msg.isMeaningful);
  const other = allAssistant.filter((msg) => !msg.isMeaningful);
  const assistantMessages = [
    ...meaningful.slice(-25),
    ...other.slice(-15),
  ].slice(-40);

  // Save local summary FIRST — even if the hook gets killed after this,
  // the next session-start will have context about what happened.
  const workItems = extractWorkItems(assistantMessages.map((m) => m.content));
  const existingContext = loadClaudeLocalContext();
  let recentActivity = "";
  if (existingContext) {
    const activityMatch = existingContext.match(/## Recent Activity\n([\s\S]*)/);
    if (activityMatch) {
      recentActivity = activityMatch[1];
    }
  }
  const newSummary = generateClaudeSummary(
    sessionName,
    workItems,
    assistantMessages.map((m) => m.content)
  );
  saveClaudeLocalContext(newSummary + recentActivity);

  // =========================================================
  // Phase 2: DISPATCH (instant, non-blocking)
  // Hand the Honcho upload to a detached background worker and return. The
  // worker outlives this process and uploads out-of-band, so the exit is never
  // delayed by network I/O. The end marker is always sent; assistant messages
  // are included unless saveMessages is disabled (the worker enforces that).
  // =========================================================
  dispatchUploadWorker({
    host: getDetectedHost(),
    cwd,
    sessionName,
    instanceId: instanceId || undefined,
    reason,
    transcriptCount: transcriptMessages.length,
    messages: assistantMessages.map((m) => ({
      content: m.content,
      timestamp: m.timestamp,
      isMeaningful: m.isMeaningful,
    })),
  });

  const meaningfulCount = assistantMessages.filter((m) => m.isMeaningful).length;
  logHook(
    "session-end",
    `Dispatched upload worker: ${assistantMessages.length} assistant msgs (${meaningfulCount} meaningful)`,
  );
  process.exit(0);
}
