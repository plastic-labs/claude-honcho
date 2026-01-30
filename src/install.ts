import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { getClaudeSettingsDir, getClaudeSettingsPath } from "./config.js";

interface ClaudeSettings {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  [key: string]: any;
}

const CLI_COMMAND = "honcho";
const EXPECTED_VERSION_PREFIX = "honcho v";

interface CommandVerification {
  ok: boolean;
  error?: string;
  details?: string;
  warnings?: string[];
}

/**
 * Verifies that the CLI command is properly installed and not shadowed by an alias
 */
export function verifyCommandAvailable(): CommandVerification {
  const warnings: string[] = [];

  try {
    // First check if command exists using 'which' (works in bash/zsh)
    let commandPath: string;
    try {
      commandPath = execSync(`which ${CLI_COMMAND} 2>/dev/null`, { encoding: "utf-8" }).trim();
    } catch {
      return {
        ok: false,
        error: `Command '${CLI_COMMAND}' not found in PATH`,
        details: `Install globally with: bun install -g . (from project directory)`,
        warnings,
      };
    }

    // Check for alias conflicts by comparing 'which' vs 'type' output
    // If there's an alias, 'type' will show it differently
    try {
      const typeOutput = execSync(`type ${CLI_COMMAND} 2>&1`, { 
        encoding: "utf-8",
        shell: "/bin/zsh" // Use zsh to properly detect aliases
      }).trim();
      
      if (typeOutput.includes("alias") || typeOutput.includes("aliased")) {
        return {
          ok: false,
          error: `'${CLI_COMMAND}' is shadowed by a shell alias`,
          details: `Found: ${typeOutput}\nRemove or rename the alias in your shell config (~/.zshrc or ~/.bashrc)`,
          warnings,
        };
      }
    } catch {
      // 'type' failed, continue with other checks
    }

    // Test that the command returns expected version output
    try {
      const versionOutput = execSync(`${CLI_COMMAND} --version 2>&1`, { encoding: "utf-8" }).trim();
      
      if (!versionOutput.startsWith(EXPECTED_VERSION_PREFIX)) {
        return {
          ok: false,
          error: `'${CLI_COMMAND}' exists but returns unexpected output`,
          details: `Expected version starting with '${EXPECTED_VERSION_PREFIX}'\nGot: '${versionOutput}'\n\nThis usually means another command or alias is shadowing ${CLI_COMMAND}.`,
          warnings,
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: `'${CLI_COMMAND}' command failed to execute`,
        details: `Error: ${e}\nThe command exists at ${commandPath} but couldn't run properly.`,
        warnings,
      };
    }

    return { ok: true, warnings };
  } catch (e) {
    return {
      ok: false,
      error: `Unexpected error verifying command`,
      details: String(e),
      warnings,
    };
  }
}

function getHonchoHooks(): NonNullable<ClaudeSettings["hooks"]> {
  return {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: "honcho hook session-start",
            timeout: 30000,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: "command",
            command: "honcho hook session-end",
            timeout: 30000,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Write|Edit|Bash|Task",
        hooks: [
          {
            type: "command",
            command: "honcho hook post-tool-use",
            timeout: 10000,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: "honcho hook user-prompt",
            timeout: 15000,
          },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: "auto",
        hooks: [
          {
            type: "command",
            command: "honcho hook pre-compact",
            timeout: 20000,
          },
        ],
      },
      {
        matcher: "manual",
        hooks: [
          {
            type: "command",
            command: "honcho hook pre-compact",
            timeout: 20000,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: "honcho hook stop",
            timeout: 10000,
          },
        ],
      },
    ],
  };
}

export function installHooks(): { success: boolean; message: string; warnings?: string[] } {
  // CRITICAL: Verify command is available before installing hooks
  // This prevents breaking Claude Code if there's an alias conflict
  const verification = verifyCommandAvailable();
  if (!verification.ok) {
    return {
      success: false,
      message: `${verification.error}\n\n${verification.details || ""}\n\n!  Hooks NOT installed to prevent breaking Claude Code.`,
      warnings: verification.warnings,
    };
  }

  const settingsDir = getClaudeSettingsDir();
  const settingsPath = getClaudeSettingsPath();

  // Ensure ~/.claude directory exists
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  // Load existing settings or create new
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, "utf-8");
      settings = JSON.parse(content);
    } catch {
      // Invalid JSON, start fresh
      settings = {};
    }
  }

  // Merge hooks
  const honchoHooks = getHonchoHooks();
  settings.hooks = settings.hooks || {};

  for (const [event, eventHooks] of Object.entries(honchoHooks)) {
    settings.hooks[event].push(...eventHooks);
  }

  // Write settings
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return {
    success: true,
    message: `Hooks installed to ${settingsPath}`,
    warnings: verification.warnings,
  };
}

export function uninstallHooks(): { success: boolean; message: string } {
  const settingsPath = getClaudeSettingsPath();

  if (!existsSync(settingsPath)) {
    return { success: true, message: "No hooks to uninstall" };
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings: ClaudeSettings = JSON.parse(content);

    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        // Remove empty arrays
        if (settings.hooks[event].length === 0) {
          delete settings.hooks[event];
        }
      }

      // Remove empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true, message: "Hooks uninstalled" };
  } catch {
    return { success: false, message: "Failed to uninstall hooks" };
  }
}

export function checkHooksInstalled(): boolean {
  const settingsPath = getClaudeSettingsPath();

  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings: ClaudeSettings = JSON.parse(content);

    if (!settings.hooks) return false;

    // Check if any honcho hooks exist
    for (const event of Object.keys(settings.hooks)) {
      const hasHonchoCLAUDEHook = settings.hooks[event].some((h) =>
        h.hooks.some((hook) => hook.command.includes("honcho"))
      );
      if (hasHonchoCLAUDEHook) return true;
    }

    return false;
  } catch {
    return false;
  }
}
