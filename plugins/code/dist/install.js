import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { getClaudeSettingsPath } from "./config.js";
/**
 * Check if honcho hooks are installed in Claude settings.
 */
export function checkHooksInstalled() {
    const settingsPath = getClaudeSettingsPath();
    if (!existsSync(settingsPath)) {
        return false;
    }
    try {
        const content = readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(content);
        // Check if any hook references "honcho"
        const hooks = settings.hooks;
        if (!hooks) {
            return false;
        }
        // Look for honcho in any hook command
        for (const event of Object.keys(hooks)) {
            const hookConfig = hooks[event];
            if (typeof hookConfig === "object" && hookConfig.command) {
                if (hookConfig.command.includes("honcho")) {
                    return true;
                }
            }
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * Check if a command is available in PATH.
 */
export function verifyCommandAvailable(command) {
    try {
        execSync(`which ${command}`, { stdio: "pipe" });
        return true;
    }
    catch {
        return false;
    }
}
