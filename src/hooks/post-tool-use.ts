import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, getHonchoClientOptions } from "../config.js";
import { basename } from "path";
import { appendClaudeWork, getClaudeInstanceId } from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";


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
  const significantTools = new Set(["Write", "Edit", "Bash", "Task", "NotebookEdit"]);

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

/**
 * Extract meaningful purpose/description from file content
 */
function inferContentPurpose(content: string, filePath: string): string {
  // Detect file type from extension
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  // For code files, try to extract the main export/function/class
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    // Look for main export
    const exportMatch = content.match(/export\s+(default\s+)?(function|class|const|interface|type)\s+(\w+)/);
    if (exportMatch) {
      return `defines ${exportMatch[2]} ${exportMatch[3]}`;
    }
    // Look for component
    const componentMatch = content.match(/(?:function|const)\s+(\w+).*(?:return|=>)\s*[(<]/);
    if (componentMatch) {
      return `component ${componentMatch[1]}`;
    }
  }

  // For Python
  if (ext === 'py') {
    const classMatch = content.match(/class\s+(\w+)/);
    const defMatch = content.match(/def\s+(\w+)/);
    if (classMatch) return `defines class ${classMatch[1]}`;
    if (defMatch) return `defines function ${defMatch[1]}`;
  }

  // For markdown/docs
  if (['md', 'mdx', 'txt'].includes(ext)) {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) return `doc: ${headingMatch[1].slice(0, 50)}`;
  }

  // For config files
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) {
    return 'config file';
  }

  // Fallback: line count
  const lineCount = content.split('\n').length;
  return `${lineCount} lines`;
}

/**
 * Summarize what changed in an edit (not just the raw strings)
 */
function summarizeEdit(oldStr: string, newStr: string, filePath: string): string {
  const oldLines = oldStr.split('\n').length;
  const newLines = newStr.split('\n').length;

  // Detect type of change
  if (oldStr.trim() === '') {
    // Pure addition
    const purpose = inferContentPurpose(newStr, filePath);
    return `added ${newLines} lines (${purpose})`;
  }

  if (newStr.trim() === '') {
    // Deletion
    return `removed ${oldLines} lines`;
  }

  // Look for meaningful changes
  const oldTokens: string[] = oldStr.match(/\w+/g) ?? [];
  const newTokens: string[] = newStr.match(/\w+/g) ?? [];

  // Find added/removed identifiers
  const added = newTokens.filter(t => !oldTokens.includes(t) && t.length > 2);
  const removed = oldTokens.filter(t => !newTokens.includes(t) && t.length > 2);

  if (added.length > 0 && removed.length > 0) {
    return `changed: ${removed.slice(0, 2).join(', ')} → ${added.slice(0, 2).join(', ')}`;
  }
  if (added.length > 0) {
    return `added: ${added.slice(0, 3).join(', ')}`;
  }
  if (removed.length > 0) {
    return `removed: ${removed.slice(0, 3).join(', ')}`;
  }

  // Fallback
  const lineDiff = newLines - oldLines;
  if (lineDiff > 0) return `expanded by ${lineDiff} lines`;
  if (lineDiff < 0) return `reduced by ${-lineDiff} lines`;
  return `modified ${oldLines} lines`;
}

function formatToolSummary(
  toolName: string,
  toolInput: Record<string, any>,
  toolResponse: Record<string, any>
): string {
  switch (toolName) {
    case "Write": {
      const filePath = toolInput.file_path || "unknown";
      const content = toolInput.content || "";
      const purpose = inferContentPurpose(content, filePath);
      const fileName = filePath.split('/').pop() || filePath;
      return `Wrote ${fileName} (${purpose})`;
    }
    case "Edit": {
      const filePath = toolInput.file_path || "unknown";
      const fileName = filePath.split('/').pop() || filePath;
      const oldStr = toolInput.old_string || "";
      const newStr = toolInput.new_string || "";
      const changeSummary = summarizeEdit(oldStr, newStr, filePath);
      return `Edited ${fileName}: ${changeSummary}`;
    }
    case "Bash": {
      const command = (toolInput.command || "").slice(0, 100);
      const success = !toolResponse.error;
      // Extract meaningful command info
      const cmdParts = command.split(/[;&|]/)[0].trim();
      // Categorize command type
      if (['npm', 'pnpm', 'yarn', 'bun'].some(pm => command.includes(pm))) {
        const action = command.match(/(install|build|test|run|dev|start)/)?.[0] || 'command';
        return `Package ${action}: ${success ? 'success' : 'failed'}`;
      }
      if (command.includes('git commit')) {
        const msg = command.match(/-m\s*["']([^"']+)["']/)?.[1] || '';
        return `Git commit: ${msg.slice(0, 50)}${msg.length > 50 ? '...' : ''}`;
      }
      if (command.includes('git push')) {
        return `Git push: ${success ? 'success' : 'failed'}`;
      }
      if (['curl', 'wget', 'fetch'].some(c => command.includes(c))) {
        const url = command.match(/https?:\/\/[^\s"']+/)?.[0] || '';
        return `HTTP request to ${url.split('/')[2] || 'API'}: ${success ? 'success' : 'failed'}`;
      }
      if (command.includes('docker') || command.includes('flyctl') || command.includes('fly ')) {
        return `Deploy: ${cmdParts.slice(0, 60)} (${success ? 'success' : 'failed'})`;
      }
      return `Ran: ${cmdParts.slice(0, 60)} (${success ? "success" : "failed"})`;
    }
    case "Task": {
      const desc = toolInput.description || "unknown";
      const type = toolInput.subagent_type || "";
      return `Agent task (${type}): ${desc}`;
    }
    case "NotebookEdit": {
      const notebookPath = toolInput.notebook_path || "unknown";
      const fileName = notebookPath.split('/').pop() || notebookPath;
      const editMode = toolInput.edit_mode || "replace";
      const cellType = toolInput.cell_type || "code";
      return `Notebook ${editMode} ${cellType} cell in ${fileName}`;
    }
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

  // Set log context
  setLogContext(cwd, getSessionName(cwd));

  if (!shouldLogTool(toolName, toolInput)) {
    process.exit(0);
  }

  const summary = formatToolSummary(toolName, toolInput, toolResponse);
  logHook("post-tool-use", summary, { tool: toolName });

  // INSTANT: Update local claude context file (~2ms)
  appendClaudeWork(summary);

  // Upload to Honcho and wait for completion
  await logToHonchoAsync(config, cwd, summary).catch((e) => logHook("post-tool-use", `Upload failed: ${e}`, { error: String(e) }));

  process.exit(0);
}

async function logToHonchoAsync(config: any, cwd: string, summary: string): Promise<void> {
  // Skip if message saving is disabled
  if (config.saveMessages === false) {
    return;
  }

  const honcho = new Honcho(getHonchoClientOptions(config));
  const sessionName = getSessionName(cwd);

  // Get session and peer using new fluent API
  const session = await honcho.session(sessionName);
  const claudePeer = await honcho.peer(config.claudePeer);

  // Log the tool use with instance_id and session_affinity for project-scoped fact extraction
  logApiCall("session.addMessages", "POST", `tool: ${summary.slice(0, 50)}`);
  const instanceId = getClaudeInstanceId();

  await session.addMessages([
    claudePeer.message(`[Tool] ${summary}`, {
      metadata: {
        instance_id: instanceId || undefined,
        session_affinity: sessionName,
      },
    }),
  ]);
}
