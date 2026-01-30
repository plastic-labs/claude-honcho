/**
 * Activity logging for honcho plugin
 *
 * Designed to be:
 * - Educational: Show how honcho plugin architecture works
 * - Elegant: Visual hierarchy with consistent symbols
 * - Useful: Real-time debugging and demo capabilities
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, appendFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { symbols, arrows, box } from "./unicode.js";

const CACHE_DIR = join(homedir(), ".honcho");
const LOG_FILE = join(CACHE_DIR, "activity.log");
const MAX_LOG_SIZE = 100 * 1024; // 100KB max log size

// ============================================
// Log Types - Each tells part of the story
// ============================================

export type LogLevel =
  | "hook"    // Hook lifecycle (session-start, session-end, etc.)
  | "api"     // Honcho API calls
  | "cache"   // Cache operations (hits, misses, writes)
  | "flow"    // Data flow & state transitions
  | "async"   // Parallel/async operations
  | "error"   // Errors
  | "debug";  // Verbose debugging

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
  // Enhanced metadata for visual display
  timing?: number;      // Duration in ms
  success?: boolean;    // Operation succeeded
  parent?: string;      // Parent operation ID for hierarchy
  depth?: number;       // Nesting depth for indentation
  // Session context for filtering
  cwd?: string;         // Working directory
  session?: string;     // Session name
}

// ============================================
// ANSI Colors - Orange to Pale Blue gradient
// ============================================

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  // Orange to pale blue gradient
  orange: "\x1b[38;5;208m",
  peach: "\x1b[38;5;215m",
  pale: "\x1b[38;5;223m",
  cream: "\x1b[38;5;195m",
  paleBlue: "\x1b[38;5;159m",
  lightBlue: "\x1b[38;5;117m",
  skyBlue: "\x1b[38;5;81m",
  // Semantic colors
  success: "\x1b[38;5;114m",
  error: "\x1b[38;5;203m",
  warn: "\x1b[38;5;221m",
};

// ============================================
// Visual Symbols
// ============================================

const sym = {
  check: symbols.check,       // ✓
  cross: symbols.cross,       // ✗
  arrow: arrows.right,        // →
  dot: symbols.bullet,        // •
  circle: symbols.dot,        // ·
  // Box drawing for hierarchy
  branch: box.branchRight,    // ├─
  corner: box.cornerRight,    // └─
  pipe: box.vertical,         // │
  top: box.topRight,          // ┌─
  line: box.horizontal,       // ─
};

// ============================================
// Core Logging Functions
// ============================================

function ensureLogDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Current session context (set by hooks at startup)
let currentCwd: string | null = null;
let currentSession: string | null = null;

export function setLogContext(cwd: string, session?: string): void {
  currentCwd = cwd;
  currentSession = session || null;
}

export function getLogContext(): { cwd: string | null; session: string | null } {
  return { cwd: currentCwd, session: currentSession };
}

/**
 * Log an activity entry
 */
export function logActivity(
  level: LogLevel,
  source: string,
  message: string,
  data?: any,
  options?: { timing?: number; success?: boolean; depth?: number; cwd?: string; session?: string }
): void {
  ensureLogDir();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    data,
    timing: options?.timing,
    success: options?.success,
    depth: options?.depth ?? 0,
    cwd: options?.cwd || currentCwd || undefined,
    session: options?.session || currentSession || undefined,
  };

  try {
    // Check file size and truncate if needed
    if (existsSync(LOG_FILE)) {
      const stats = Bun.file(LOG_FILE).size;
      if (stats > MAX_LOG_SIZE) {
        const content = readFileSync(LOG_FILE, "utf-8");
        const truncated = content.slice(-50 * 1024);
        Bun.write(LOG_FILE, truncated);
      }
    }

    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // Ignore logging errors
  }
}

// ============================================
// Specialized Loggers
// ============================================

/**
 * Log a hook lifecycle event
 */
export function logHook(hookName: string, message: string, data?: any): void {
  logActivity("hook", hookName, message, data);
}

/**
 * Log an API call with optional timing
 */
export function logApiCall(endpoint: string, method: string, details?: string, timing?: number, success?: boolean): void {
  const msg = `${method} ${endpoint}${details ? ` ${sym.arrow} ${details}` : ""}`;
  logActivity("api", "honcho", msg, undefined, { timing, success });
}

/**
 * Log a cache operation
 */
export function logCache(operation: "hit" | "miss" | "write" | "clear", key: string, details?: string): void {
  const opSymbol = operation === "hit" ? sym.check : operation === "miss" ? sym.arrow : sym.dot;
  const msg = `${key} ${opSymbol} ${operation}${details ? ` (${details})` : ""}`;
  logActivity("cache", "cache", msg, undefined, { success: operation === "hit" });
}

/**
 * Log data flow / state transition
 */
export function logFlow(stage: string, message: string, data?: any): void {
  logActivity("flow", stage, message, data);
}

/**
 * Log async/parallel operation
 */
export function logAsync(operation: string, message: string, results?: { name: string; success: boolean; timing?: number }[]): void {
  logActivity("async", operation, message, results ? { results } : undefined);
}

/**
 * Start a timed operation - returns a function to call when done
 */
export function startTimed(source: string, operation: string): (success?: boolean, details?: string) => void {
  const start = Date.now();
  return (success = true, details?: string) => {
    const timing = Date.now() - start;
    logApiCall(operation, "timing", details, timing, success);
  };
}

// ============================================
// Display Formatting
// ============================================

/**
 * Get the log file path
 */
export function getLogPath(): string {
  return LOG_FILE;
}

export interface LogFilter {
  cwd?: string;         // Filter by working directory
  session?: string;     // Filter by session name
  level?: LogLevel[];   // Filter by log levels
}

/**
 * Read recent log entries with optional filtering
 */
export function getRecentLogs(count: number = 50, filter?: LogFilter): LogEntry[] {
  ensureLogDir();

  if (!existsSync(LOG_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(l => l);
    let entries = lines.map(line => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    }).filter((e): e is LogEntry => e !== null);

    // Apply filters
    if (filter) {
      if (filter.cwd) {
        entries = entries.filter(e => e.cwd === filter.cwd);
      }
      if (filter.session) {
        entries = entries.filter(e => e.session === filter.session);
      }
      if (filter.level && filter.level.length > 0) {
        entries = entries.filter(e => filter.level!.includes(e.level));
      }
    }

    return entries.slice(-count);
  } catch {
    return [];
  }
}

/**
 * Format a log entry for display
 */
export function formatLogEntry(entry: LogEntry, options?: { showSession?: boolean }): string {
  const time = entry.timestamp.split("T")[1].split(".")[0]; // HH:MM:SS

  // Level-specific styling
  const levelConfig: Record<LogLevel, { color: string; label: string }> = {
    hook:  { color: c.orange,    label: "HOOK"  },
    api:   { color: c.peach,     label: "API"   },
    cache: { color: c.paleBlue,  label: "CACHE" },
    flow:  { color: c.lightBlue, label: "FLOW"  },
    async: { color: c.skyBlue,   label: "ASYNC" },
    error: { color: c.error,     label: "ERROR" },
    debug: { color: c.dim,       label: "DEBUG" },
  };

  const config = levelConfig[entry.level] || levelConfig.debug;

  // Build the output
  let output = `${c.dim}${time}${c.reset} `;

  // Session indicator (when showing all sessions)
  if (options?.showSession && entry.session) {
    output += `${c.pale}${entry.session}${c.reset} `;
  }

  // Level badge
  output += `${config.color}[${config.label.padEnd(5)}]${c.reset} `;

  // Source
  output += `${c.dim}${entry.source}${c.reset} `;

  // Message
  output += entry.message;

  // Timing indicator
  if (entry.timing !== undefined) {
    const timingColor = entry.timing < 50 ? c.success : entry.timing < 200 ? c.pale : c.warn;
    output += ` ${timingColor}${entry.timing}ms${c.reset}`;
  }

  // Success/failure indicator
  if (entry.success !== undefined) {
    output += ` ${entry.success ? c.success + sym.check : c.error + sym.cross}${c.reset}`;
  }

  // Compact data display
  if (entry.data) {
    const dataStr = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
    if (dataStr.length < 80) {
      output += ` ${c.dim}${dataStr}${c.reset}`;
    }
  }

  return output;
}

/**
 * Format a group of related entries as a visual tree
 * For demo/educational display
 */
export function formatLogGroup(entries: LogEntry[], title?: string): string[] {
  const lines: string[] = [];

  if (title) {
    lines.push(`${c.orange}${sym.top}${sym.line} ${title} ${sym.line.repeat(30)}${c.reset}`);
  }

  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    const prefix = title ? (isLast ? sym.corner : sym.branch) : "";
    const indent = entry.depth ? "   ".repeat(entry.depth) : "";

    lines.push(`${c.dim}${prefix}${c.reset}${indent}${formatLogEntry(entry)}`);
  });

  return lines;
}

/**
 * Watch the log file for changes (for tail -f behavior)
 */
export function watchLogs(callback: (entries: LogEntry[]) => void): () => void {
  ensureLogDir();

  // Track by line count, not byte size (more reliable)
  let lastLineCount = 0;
  if (existsSync(LOG_FILE)) {
    try {
      const content = readFileSync(LOG_FILE, "utf-8");
      lastLineCount = content.trim().split("\n").filter(l => l).length;
    } catch {
      lastLineCount = 0;
    }
  }

  const checkForUpdates = () => {
    if (!existsSync(LOG_FILE)) return;

    try {
      const content = readFileSync(LOG_FILE, "utf-8");
      const lines = content.trim().split("\n").filter(l => l);
      const currentLineCount = lines.length;

      if (currentLineCount > lastLineCount) {
        // Get only the new lines since last check
        const newLines = lines.slice(lastLineCount);
        const newEntries = newLines
          .map(line => {
            try {
              return JSON.parse(line) as LogEntry;
            } catch {
              return null;
            }
          })
          .filter((e): e is LogEntry => e !== null);

        if (newEntries.length > 0) {
          callback(newEntries);
        }

        lastLineCount = currentLineCount;
      }
    } catch {
      // Ignore read errors during polling
    }
  };

  // Poll every 200ms for snappier response
  const interval = setInterval(checkForUpdates, 200);

  return () => {
    clearInterval(interval);
  };
}

/**
 * Clear the log file
 */
export function clearLogs(): void {
  ensureLogDir();
  if (existsSync(LOG_FILE)) {
    writeFileSync(LOG_FILE, "");
  }
}

// ============================================
// Demo/Educational Output
// ============================================

/**
 * Print a visual legend explaining log types
 */
export function printLegend(): void {
  console.log("");
  console.log(`${c.orange}${c.bold}Log Types${c.reset}`);
  console.log(`${c.dim}${sym.line.repeat(40)}${c.reset}`);
  console.log(`  ${c.orange}[HOOK]${c.reset}  Hook lifecycle ${c.dim}(session-start, user-prompt, etc.)${c.reset}`);
  console.log(`  ${c.peach}[API]${c.reset}   Honcho API calls ${c.dim}(with timing)${c.reset}`);
  console.log(`  ${c.paleBlue}[CACHE]${c.reset} Local cache ${c.dim}(hit/miss/write)${c.reset}`);
  console.log(`  ${c.lightBlue}[FLOW]${c.reset}  Data flow ${c.dim}(state transitions)${c.reset}`);
  console.log(`  ${c.skyBlue}[ASYNC]${c.reset} Parallel ops ${c.dim}(concurrent fetches)${c.reset}`);
  console.log("");
  console.log(`${c.orange}${c.bold}Symbols${c.reset}`);
  console.log(`${c.dim}${sym.line.repeat(40)}${c.reset}`);
  console.log(`  ${c.success}${sym.check}${c.reset} Success    ${c.error}${sym.cross}${c.reset} Failure    ${sym.arrow} Flow/transition`);
  console.log(`  ${c.success}< 50ms${c.reset}     ${c.pale}< 200ms${c.reset}     ${c.warn}> 200ms${c.reset}  ${c.dim}(timing)${c.reset}`);
  console.log("");
}
