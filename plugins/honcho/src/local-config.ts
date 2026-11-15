/**
 * Repo-local config overlay.
 *
 * A repository may hold `.honcho/config.json`, with the same shape as the
 * global `~/.honcho/config.json` (a `hosts.<host>` block or flat fields). Its
 * settings override the global ones for every working directory under that
 * repository, so a project can keep its memory in its own workspace without
 * putting credentials in the repo.
 *
 * Everything here is additive: with no repo-local file found, every function
 * returns null/undefined and config resolution is exactly the global one.
 * The plugin only ever reads the repo-local file; it never writes it.
 *
 * Leaf module (node builtins + harness-plugin-core only) so config.ts and
 * git.ts can both import it without an import cycle.
 */
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "path";
import { configPath, normalizeBaseUrl } from "@honcho-ai/harness-plugin-core";

/** Settings a repo-local file can set. Everything is optional; unset falls back to the global config. */
export interface LocalSettings {
  workspace?: string;
  peerName?: string;
  aiPeer?: string;
  baseUrl?: string;
  apiKey?: string;
  /** Put every chat under this project into one Honcho session with this name. */
  sessionName?: string;
  /**
   * `per-repo`: one session per git repository under the project (worktrees
   * and submodules by their own directory). `per-directory`: one session for
   * the project root. Anything else: the plugin's default, one session per chat.
   */
  sessionStrategy?: string;
  /** Give each git repository nested in the project (a submodule) its own repo scope / session. */
  splitSubmodules?: boolean;
  /** `false` turns the plugin off for this project: no hooks run and nothing is uploaded. */
  enabled?: boolean;
  /** `false` keeps this project's messages out of Honcho (live and on import). */
  saveMessages?: boolean;
}

/** A repo-local config found for a working directory. */
export interface LocalContext {
  /** The `.honcho` directory holding the file. */
  dir: string;
  /** Its `config.json`. */
  path: string;
  /** The project root: the directory holding `.honcho/`. */
  root: string;
  /** The working directory it was found from. */
  cwd: string;
  settings: LocalSettings;
}

const isObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** `endpoint` as 0.3.x wrote it: `{ baseUrl }` (with or without /v3) or `{ environment: "local" }`. */
function legacyEndpoint(v: unknown): string | undefined {
  if (!isObj(v)) return undefined;
  const url = str(v.baseUrl)?.replace(/\/v3\/?$/, "");
  return url ?? (v.environment === "local" ? "http://localhost:8000" : undefined);
}

/**
 * Settings for `host` from a parsed repo-local file. The host block wins over
 * the flat top-level field; unknown keys and wrongly typed values are ignored.
 */
export function readLocalSettings(file: unknown, host: string): LocalSettings {
  const f = isObj(file) ? file : {};
  const hosts = isObj(f.hosts) ? f.hosts : {};
  const found = hosts[host] ?? hosts[host.replace(/_/g, "-")] ?? hosts[host.replace(/-/g, "_")];
  const block = isObj(found) ? found : {};
  const pick = (key: string) => (block[key] !== undefined ? block[key] : f[key]);

  const baseUrl = str(block.baseUrl) ?? legacyEndpoint(block.endpoint) ?? str(f.baseUrl) ?? legacyEndpoint(f.endpoint);
  const settings: LocalSettings = {
    workspace: str(pick("workspace")),
    peerName: str(pick("peerName")),
    aiPeer: str(pick("aiPeer")),
    baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : undefined,
    apiKey: str(pick("apiKey")),
    sessionName: str(pick("sessionName")),
    sessionStrategy: str(pick("sessionStrategy")),
    splitSubmodules: bool(pick("splitSubmodules")),
    enabled: bool(pick("enabled")),
    saveMessages: bool(pick("saveMessages")),
  };
  for (const k of Object.keys(settings) as (keyof LocalSettings)[]) {
    if (settings[k] === undefined) delete settings[k];
  }
  return settings;
}

/**
 * The nearest `.honcho` directory holding a `config.json` at or above
 * `startCwd`, or null. The global config's own directory is never a match.
 */
export function findLocalConfigDir(startCwd: string): string | null {
  try {
    const globalFile = resolve(configPath());
    const home = resolve(process.env.HOME || homedir());
    let dir = resolve(startCwd);
    for (let i = 0; i < 128; i++) {
      const candidate = join(dir, ".honcho", "config.json");
      if (dir !== home && resolve(candidate) !== globalFile && existsSync(candidate)) {
        return join(dir, ".honcho");
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Unreadable path: no repo-local config.
  }
  return null;
}

/** The repo-local config for `cwd`, or null when there is none or it isn't valid JSON. */
export function localContextFor(cwd: string | null | undefined, host: string): LocalContext | null {
  if (!cwd) return null;
  const dir = findLocalConfigDir(cwd);
  if (!dir) return null;
  const path = join(dir, "config.json");
  try {
    const file = JSON.parse(readFileSync(path, "utf-8"));
    return { dir, path, root: dirname(dir), cwd: resolve(cwd), settings: readLocalSettings(file, host) };
  } catch {
    // Malformed: ignore it, as before this file existed.
    return null;
  }
}

// The working directory this process runs for (a hook's cwd, the MCP server's
// launch directory, a pane runner's session cwd), registered once at startup.
let _context: LocalContext | null = null;

/** Register the working directory whose repo-local config applies to this process. */
export function setLocalConfigContext(cwd: string | null | undefined, host: string): void {
  _context = localContextFor(cwd, host);
}

/** The repo-local config registered for this process, or null. */
export function getLocalContext(): LocalContext | null {
  return _context;
}

/**
 * The nearest directory at or above `cwd` that is a git repository (a `.git`
 * file or directory: worktrees and submodules use a file), never above `stop`.
 * Null when there is none, or when `cwd` is outside `stop`.
 */
export function findNearestGitRoot(cwd: string, stop?: string): string | null {
  try {
    let dir = resolve(cwd);
    const boundary = stop ? resolve(stop) : parse(dir).root;
    const rel = relative(boundary, dir);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    for (let i = 0; i < 128; i++) {
      if (existsSync(join(dir, ".git"))) return dir;
      if (dir === boundary) break;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Unreadable path: no repository.
  }
  return null;
}

function splitsByRepo(ctx: LocalContext): boolean {
  return ctx.settings.splitSubmodules === true || ctx.settings.sessionStrategy === "per-repo";
}

/**
 * The directory that names `cwd`'s project for scopes: the project root, or
 * with `splitSubmodules` / `per-repo` the nearest git repository inside it.
 */
export function projectAnchorDir(ctx: LocalContext, cwd: string = ctx.cwd): string {
  return splitsByRepo(ctx) ? findNearestGitRoot(cwd, ctx.root) ?? ctx.root : ctx.root;
}

/**
 * The directory whose repository scope a session in `cwd` joins, or null when
 * no repo-local config covers `cwd` (then the scope is the cwd's own repository).
 */
export function projectScopeDir(cwd: string, host: string): string | null {
  const ctx = localContextFor(cwd, host);
  return ctx ? projectAnchorDir(ctx, cwd) : null;
}

/**
 * The session every chat in `cwd` shares under this repo-local config, unsanitized,
 * or null for the default of one session per chat.
 */
export function localSessionName(ctx: LocalContext | null, cwd?: string): string | null {
  if (!ctx) return null;
  const s = ctx.settings;
  if (s.sessionName) return s.sessionName;
  if (s.sessionStrategy === "per-repo" || s.sessionStrategy === "per-directory") {
    return basename(projectAnchorDir(ctx, cwd ?? ctx.cwd));
  }
  return null;
}
