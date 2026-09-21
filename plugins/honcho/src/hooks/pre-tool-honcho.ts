import { initHook, getCachedStdin } from "../config.js";
import { setMemoryState } from "../state.js";

// Maps each honcho MCP tool to the short verb the statusline flashes while the
// call is in flight. Anything unmapped falls back to the raw tool suffix.
const LABELS: Record<string, string> = {
  search: "searching",
  chat: "asking",
  get_context: "context",
  get_representation: "recall",
  create_conclusion: "writing",
  list_conclusions: "listing",
  delete_conclusion: "writing",
  get_config: "config",
  set_config: "config",
};

// PreToolUse for honcho MCP tools only — flashes which memory tool Claude is
// calling onto the statusline. Best-effort and dependency-light so it adds
// negligible latency to the tool call.
export async function handlePreToolHoncho(): Promise<void> {
  try {
    const raw = getCachedStdin();
    const input = raw && raw.trim() ? JSON.parse(raw) : {};
    const toolName: string = input.tool_name ?? "";
    const verb = toolName.replace(/^mcp__plugin_honcho_honcho__/, "");
    setMemoryState("querying", LABELS[verb] ?? verb ?? "tool", input.session_id);
  } catch {
    // never block the tool call
  }
  process.exit(0);
}

/** Entry point: reads stdin once, then runs the handler. */
export async function main(): Promise<void> {
  await initHook();
  await handlePreToolHoncho();
}
