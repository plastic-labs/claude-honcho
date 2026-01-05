import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { getClaudeSettingsDir, getClaudeSettingsPath } from "./config.js";

interface ClaudeSettings {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  [key: string]: any;
}

const CLI_COMMAND = "honcho-claudis";
const EXPECTED_VERSION_PREFIX = "honcho-claudis v";

// Legacy binary names that might conflict
const LEGACY_BINARIES = ["claudis"];

interface CommandVerification {
  ok: boolean;
  error?: string;
  details?: string;
  warnings?: string[];
}

/**
 * Checks for legacy binaries that might conflict with user aliases
 */
export function checkLegacyBinaries(): { found: string[]; paths: Record<string, string> } {
  const found: string[] = [];
  const paths: Record<string, string> = {};

  for (const binary of LEGACY_BINARIES) {
    try {
      const path = execSync(`which ${binary} 2>/dev/null`, { encoding: "utf-8" }).trim();
      if (path) {
        found.push(binary);
        paths[binary] = path;
      }
    } catch {
      // Binary not found, that's good
    }
  }

  return { found, paths };
}

/**
 * Verifies that the CLI command is properly installed and not shadowed by an alias
 */
export function verifyCommandAvailable(): CommandVerification {
  const warnings: string[] = [];

  try {
    // Check for legacy binaries that might conflict with user aliases
    const legacy = checkLegacyBinaries();
    if (legacy.found.length > 0) {
      const legacyList = legacy.found.map(b => `  - ${b} (${legacy.paths[b]})`).join("\n");
      warnings.push(
        `Legacy binaries found that may conflict with shell aliases:\n${legacyList}\n` +
        `Remove them with: rm ${legacy.found.map(b => legacy.paths[b]).join(" ")}`
      );
    }

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

function getHonchoClaudisHooks(): ClaudeSettings["hooks"] {
  return {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: "honcho-claudis hook session-start",
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
            command: "honcho-claudis hook session-end",
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
            command: "honcho-claudis hook post-tool-use",
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
            command: "honcho-claudis hook user-prompt",
            timeout: 15000,
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
      message: `${verification.error}\n\n${verification.details || ""}\n\n⚠️  Hooks NOT installed to prevent breaking Claude Code.`,
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
  const honchoClaudisHooks = getHonchoClaudisHooks();
  settings.hooks = settings.hooks || {};

  for (const [event, eventHooks] of Object.entries(honchoClaudisHooks)) {
    // Remove any existing honcho-claudis or claudis (old name) hooks for this event
    if (settings.hooks[event]) {
      settings.hooks[event] = settings.hooks[event].filter(
        (h) => !h.hooks.some((hook) =>
          hook.command.includes("honcho-claudis") ||
          (hook.command.includes("claudis") && !hook.command.includes("honcho-claudis"))
        )
      );
    } else {
      settings.hooks[event] = [];
    }

    // Add new honcho-claudis hooks
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
        settings.hooks[event] = settings.hooks[event].filter(
          (h) => !h.hooks.some((hook) =>
            hook.command.includes("honcho-claudis") ||
            (hook.command.includes("claudis") && !hook.command.includes("honcho-claudis"))
          )
        );

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

    // Check if any honcho-claudis hooks exist
    for (const event of Object.keys(settings.hooks)) {
      const hasHonchoClaudisHook = settings.hooks[event].some((h) =>
        h.hooks.some((hook) => hook.command.includes("honcho-claudis"))
      );
      if (hasHonchoClaudisHook) return true;
    }

    return false;
  } catch {
    return false;
  }
}
