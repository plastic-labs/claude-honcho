#!/usr/bin/env bun
import {
  visStopMessage
} from "../chunk-xtdvbfxw.js";
import {
  require_dist
} from "../chunk-4ryv9310.js";
import {
  logApiCall,
  logHook,
  setLogContext
} from "../chunk-jr0fd6n2.js";
import {
  __toESM,
  addMessagesBatched,
  chunkContent,
  getCachedStdin,
  getHonchoClientOptions,
  getInstanceIdForCwd,
  getSessionName,
  initHook,
  isPluginEnabled,
  loadConfig,
  readStdinText
} from "../chunk-yfrrc1d5.js";

// src/hooks/stop.ts
var import_sdk = __toESM(require_dist(), 1);
import { existsSync, readFileSync } from "fs";
function isWakeupBoundary(entry) {
  return entry.promptSource === "system" || entry.origin?.kind === "task-notification";
}
function isRealUserPrompt(entry) {
  if (entry.isMeta)
    return false;
  const mc = entry.message?.content ?? entry.content;
  const text = typeof mc === "string" ? mc : Array.isArray(mc) ? mc.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("") : "";
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}
function assistantText(entry) {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string")
    return mc;
  if (Array.isArray(mc)) {
    return mc.filter((p) => p.type === "text" && p.text).map((p) => p.text).join(`

`);
  }
  return "";
}
function getCurrentTurnAssistantMessages(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath))
    return [];
  let lines;
  try {
    lines = readFileSync(transcriptPath, "utf-8").trim().split(`
`).filter((l) => l.trim());
  } catch {
    return [];
  }
  let lastPromptIdx = -1;
  for (let i = lines.length - 1;i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if ((entry.type || entry.role) === "user" && (isRealUserPrompt(entry) || isWakeupBoundary(entry))) {
        lastPromptIdx = i;
        break;
      }
    } catch {
      continue;
    }
  }
  if (lastPromptIdx === -1)
    return [];
  const blocks = [];
  for (let i = lastPromptIdx + 1;i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      if ((entry.type || entry.role) !== "assistant")
        continue;
      const text = assistantText(entry);
      if (text && text.trim())
        blocks.push({ text, timestamp: entry.timestamp });
    } catch {
      continue;
    }
  }
  return blocks;
}
async function handleStop() {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }
  if (!isPluginEnabled()) {
    process.exit(0);
  }
  if (config.saveMessages === false) {
    process.exit(0);
  }
  let hookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }
  if (hookInput.stop_hook_active) {
    process.exit(0);
  }
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const transcriptPath = hookInput.transcript_path;
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);
  setLogContext(cwd, sessionName);
  const turnMessages = getCurrentTurnAssistantMessages(transcriptPath || "");
  if (turnMessages.length === 0) {
    logHook("stop", `Skipping (no assistant content this turn)`);
    process.exit(0);
  }
  logHook("stop", `Capturing ${turnMessages.length} assistant message(s) this turn`);
  try {
    const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
    const noEnsure = () => Promise.resolve();
    const aiPeer = new import_sdk.Peer(config.aiPeer, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
    const fallbackTs = new Date().toISOString();
    const lastIdx = turnMessages.length - 1;
    const messages = turnMessages.flatMap((block, i) => chunkContent(block.text).map((chunk) => aiPeer.message(chunk, {
      createdAt: block.timestamp || fallbackTs,
      metadata: {
        instance_id: instanceId || undefined,
        type: i === lastIdx ? "assistant_response" : "assistant_intermediate",
        session_affinity: sessionName
      }
    })));
    logApiCall("session.addMessages", "POST", `${turnMessages.length} assistant msg(s), ${messages.length} chunk(s), direct`);
    const session = new import_sdk.Session(sessionName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
    await addMessagesBatched(session, messages, (e) => {
      logHook("stop", `Direct upload failed, retrying via get-or-create: ${e}`);
      return honcho.session(sessionName);
    });
    logHook("stop", `Saved ${turnMessages.length} assistant message(s)`);
    visStopMessage("out", `saved ${turnMessages.length} assistant msg(s)`);
  } catch (error) {
    logHook("stop", `Upload failed: ${error}`, { error: String(error) });
  }
  process.exit(0);
}

// hooks/stop.ts
await initHook();
await handleStop();

//# debugId=DE2C9C64B380847C64756E2164756E21
//# sourceMappingURL=stop.js.map
