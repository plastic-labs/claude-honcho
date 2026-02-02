/**
 * Activity logging for honcho plugin
 *
 * Designed to be:
 * - Educational: Show how honcho plugin architecture works
 * - Elegant: Visual hierarchy with consistent symbols
 * - Useful: Real-time debugging and demo capabilities
 */
export type LogLevel = "hook" | "api" | "cache" | "flow" | "async" | "error" | "debug";
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    source: string;
    message: string;
    data?: any;
    timing?: number;
    success?: boolean;
    parent?: string;
    depth?: number;
    cwd?: string;
    session?: string;
}
export declare function setLogContext(cwd: string, session?: string): void;
export declare function getLogContext(): {
    cwd: string | null;
    session: string | null;
};
/**
 * Log an activity entry
 */
export declare function logActivity(level: LogLevel, source: string, message: string, data?: any, options?: {
    timing?: number;
    success?: boolean;
    depth?: number;
    cwd?: string;
    session?: string;
}): void;
/**
 * Log a hook lifecycle event
 */
export declare function logHook(hookName: string, message: string, data?: any): void;
/**
 * Log an API call with optional timing
 */
export declare function logApiCall(endpoint: string, method: string, details?: string, timing?: number, success?: boolean): void;
/**
 * Log a cache operation
 */
export declare function logCache(operation: "hit" | "miss" | "write" | "clear", key: string, details?: string): void;
/**
 * Log data flow / state transition
 */
export declare function logFlow(stage: string, message: string, data?: any): void;
/**
 * Log async/parallel operation
 */
export declare function logAsync(operation: string, message: string, results?: {
    name: string;
    success: boolean;
    timing?: number;
}[]): void;
/**
 * Start a timed operation - returns a function to call when done
 */
export declare function startTimed(source: string, operation: string): (success?: boolean, details?: string) => void;
/**
 * Get the log file path
 */
export declare function getLogPath(): string;
export interface LogFilter {
    cwd?: string;
    session?: string;
    level?: LogLevel[];
}
/**
 * Read recent log entries with optional filtering
 */
export declare function getRecentLogs(count?: number, filter?: LogFilter): LogEntry[];
/**
 * Format a log entry for display
 */
export declare function formatLogEntry(entry: LogEntry, options?: {
    showSession?: boolean;
}): string;
/**
 * Format a group of related entries as a visual tree
 * For demo/educational display
 */
export declare function formatLogGroup(entries: LogEntry[], title?: string): string[];
/**
 * Watch the log file for changes (for tail -f behavior)
 */
export declare function watchLogs(callback: (entries: LogEntry[]) => void): () => void;
/**
 * Clear the log file
 */
export declare function clearLogs(): void;
/**
 * Print a visual legend explaining log types
 */
export declare function printLegend(): void;
