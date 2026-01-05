import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath } from "../config.js";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  setCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
  appendClawdWork,
} from "../cache.js";

const WORKSPACE_APP_TAG = "honcho-clawd";

interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_response?: Record<string, any>;
  cwd?: string;
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function shouldLogTool(toolName: string, toolInput: Record<string, any>): boolean {
  const significantTools = new Set(["Write", "Edit", "Bash", "Task"]);

  if (!significantTools.has(toolName)) {
    return false;
  }

  if (toolName === "Bash") {
    const command = toolInput.command || "";
    // Skip read-only or trivial bash commands
    const trivialCommands = ["ls", "pwd", "echo", "cat", "head", "tail", "which", "type", "git status", "git log", "git diff"];
    if (trivialCommands.some((cmd) => command.trim().startsWith(cmd))) {
      return false;
    }
  }

  return true;
}

function formatToolSummary(
  toolName: string,
  toolInput: Record<string, any>,
  toolResponse: Record<string, any>
): string {
  switch (toolName) {
    case "Write":
      return `Created/wrote file: ${toolInput.file_path || "unknown"}`;
    case "Edit":
      const filePath = toolInput.file_path || "unknown";
      const oldStr = (toolInput.old_string || "").slice(0, 30);
      const newStr = (toolInput.new_string || "").slice(0, 30);
      return `Edited ${filePath}: '${oldStr}...' -> '${newStr}...'`;
    case "Bash":
      const command = (toolInput.command || "").slice(0, 80);
      const success = !toolResponse.error;
      return `Ran: ${command} (${success ? "success" : "failed"})`;
    case "Task":
      return `Executed task: ${toolInput.description || "unknown"}`;
    default:
      return `Used ${toolName}`;
  }
}

export async function handlePostToolUse(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = await Bun.stdin.text();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }

  const toolName = hookInput.tool_name || "";
  const toolInput = hookInput.tool_input || {};
  const toolResponse = hookInput.tool_response || {};
  const cwd = hookInput.cwd || process.cwd();

  if (!shouldLogTool(toolName, toolInput)) {
    process.exit(0);
  }

  const summary = formatToolSummary(toolName, toolInput, toolResponse);

  // INSTANT: Update local clawd context file (~2ms)
  // This gives clawd self-awareness even without Honcho
  appendClawdWork(summary);

  // Fire-and-forget: Log to Honcho in background
  // Don't block on this - just let it happen
  logToHonchoAsync(config, cwd, summary).catch(() => {});

  // Return immediately - don't wait for Honcho
  process.exit(0);
}

async function logToHonchoAsync(config: any, cwd: string, summary: string): Promise<void> {
  // Skip if message saving is disabled
  if (config.saveMessages === false) {
    return;
  }

  const client = new Honcho({
    apiKey: config.apiKey,
    environment: "production",
  });

  // Try to use cached IDs for speed
  let workspaceId = getCachedWorkspaceId(config.workspace);
  let sessionId = getCachedSessionId(cwd);
  let clawdPeerId = getCachedPeerId(config.claudePeer);

  // If we don't have cached IDs, do full setup and cache results
  if (!workspaceId || !sessionId || !clawdPeerId) {
    const workspace = await client.workspaces.getOrCreate({
      id: config.workspace,
      metadata: { app: WORKSPACE_APP_TAG },
    });
    workspaceId = workspace.id;
    setCachedWorkspaceId(config.workspace, workspaceId);

    const sessionName = getSessionName(cwd);
    const session = await client.workspaces.sessions.getOrCreate(workspaceId, {
      id: sessionName,
      metadata: { cwd },
    });
    sessionId = session.id;
    setCachedSessionId(cwd, sessionName, sessionId);

    const clawdPeer = await client.workspaces.peers.getOrCreate(workspaceId, { id: config.claudePeer });
    clawdPeerId = clawdPeer.id;
    setCachedPeerId(config.claudePeer, clawdPeerId);
  }

  // Log the tool use
  await client.workspaces.sessions.messages.create(workspaceId, sessionId, {
    messages: [
      {
        content: `[Tool] ${summary}`,
        peer_id: config.claudePeer,
      },
    ],
  });
}
