#!/usr/bin/env bun
import {
  clearSessionFiles
} from "../chunk-9pntsn3x.js";
import {
  logHook,
  setLogContext
} from "../chunk-jr0fd6n2.js";
import {
  getCachedStdin,
  getInstanceIdForCwd,
  getSessionName,
  initHook,
  isPluginEnabled,
  loadConfig,
  readStdinText
} from "../chunk-yfrrc1d5.js";

// src/hooks/session-end.ts
async function handleSessionEnd() {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }
  if (!isPluginEnabled()) {
    process.exit(0);
  }
  let hookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {}
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const reason = hookInput.reason || "unknown";
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);
  setLogContext(cwd, sessionName);
  logHook("session-end", `Session ending`, { reason });
  clearSessionFiles(hookInput.session_id);
  logHook("session-end", "Session ended — no upload (messages saved live)");
  process.exit(0);
}

// hooks/session-end.ts
await initHook();
await handleSessionEnd();

//# debugId=E1DAA73E44B8E07D64756E2164756E21
//# sourceMappingURL=session-end.js.map
