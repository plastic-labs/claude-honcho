/**
 * Git State Utilities
 *
 * Captures git state from the filesystem without requiring Claude to run git commands.
 * Used to detect external changes (branch switches, commits) between Claude sessions.
 */
import type { GitState, GitFeatureContext } from "./cache.js";
/**
 * Check if a directory is a git repository
 */
export declare function isGitRepo(cwd: string): boolean;
/**
 * Capture current git state for a directory
 */
export declare function captureGitState(cwd: string): GitState | null;
/**
 * Get recent commits (for context)
 */
export declare function getRecentCommits(cwd: string, count?: number): string[];
/**
 * Get branches (local)
 */
export declare function getLocalBranches(cwd: string): string[];
/**
 * Format git state for display/context injection
 */
export declare function formatGitContext(state: GitState, recentCommits?: string[]): string;
/**
 * Infer feature context from git state and recent commits
 * Uses local inference only - no API calls
 */
export declare function inferFeatureContext(gitState: GitState, recentCommits?: string[]): GitFeatureContext;
/**
 * Format feature context for display/injection
 */
export declare function formatFeatureContext(context: GitFeatureContext): string;
