/** Git helpers for session scopes. */

import { execSync } from "child_process";
import { hostname } from "os";
import { basename, dirname, resolve } from "path";
import { sanitizeForSessionName } from "./config.js";

/**
 * Run a git command and return the output, or null if it fails
 */
function gitCommand(cwd: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/** Repository name for cwd, shared by every linked worktree (and bare-hub
 *  layouts); the directory name when cwd isn't in a git repository. */
export function getRepoName(cwd: string): string {
  const common = gitCommand(cwd, "rev-parse --git-common-dir");
  if (!common) return basename(resolve(cwd));
  const dir = resolve(cwd, common);
  return basename(dir) === ".git" ? basename(dirname(dir)) : basename(dir).replace(/\.git$/, "");
}

/** Honcho scopes a new session joins: its repository and this machine. */
export function getSessionScopes(cwd: string): string[] {
  const scopes = [getRepoName(cwd), hostname().split(".")[0]]
    .map(sanitizeForSessionName)
    .filter((s) => /[a-z0-9]/.test(s));
  return [...new Set(scopes)];
}
