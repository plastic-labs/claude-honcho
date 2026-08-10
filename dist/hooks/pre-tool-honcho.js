#!/usr/bin/env bun
import {
  setMemoryState
} from "../chunk-9pntsn3x.js";
import {
  getCachedStdin,
  initHook
} from "../chunk-yfrrc1d5.js";

// src/hooks/pre-tool-honcho.ts
var LABELS = {
  search: "searching",
  chat: "asking",
  get_context: "context",
  get_representation: "recall",
  create_conclusion: "writing",
  list_conclusions: "listing",
  delete_conclusion: "writing",
  get_config: "config",
  set_config: "config"
};
async function handlePreToolHoncho() {
  try {
    const raw = getCachedStdin();
    const input = raw && raw.trim() ? JSON.parse(raw) : {};
    const toolName = input.tool_name ?? "";
    const verb = toolName.replace(/^mcp__plugin_honcho_honcho__/, "");
    setMemoryState("querying", LABELS[verb] ?? verb ?? "tool", input.session_id);
  } catch {}
  process.exit(0);
}

// hooks/pre-tool-honcho.ts
await initHook();
await handlePreToolHoncho();

//# debugId=EA24B718CF1FC96964756E2164756E21
//# sourceMappingURL=pre-tool-honcho.js.map
