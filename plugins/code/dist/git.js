/**
 * Git State Utilities
 *
 * Captures git state from the filesystem without requiring Claude to run git commands.
 * Used to detect external changes (branch switches, commits) between Claude sessions.
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
/**
 * Check if a directory is a git repository
 */
export function isGitRepo(cwd) {
    return existsSync(join(cwd, ".git"));
}
/**
 * Run a git command and return the output, or null if it fails
 */
function gitCommand(cwd, args) {
    try {
        return execSync(`git ${args}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    }
    catch {
        return null;
    }
}
/**
 * Capture current git state for a directory
 */
export function captureGitState(cwd) {
    if (!isGitRepo(cwd)) {
        return null;
    }
    // Get current branch
    const branch = gitCommand(cwd, "rev-parse --abbrev-ref HEAD") || "unknown";
    // Get current commit SHA (short)
    const commit = gitCommand(cwd, "rev-parse --short HEAD") || "unknown";
    // Get commit message
    const commitMessage = gitCommand(cwd, "log -1 --format=%s") || "";
    // Check if working tree is dirty
    const statusOutput = gitCommand(cwd, "status --porcelain") || "";
    const isDirty = statusOutput.length > 0;
    // Get list of dirty files (modified, added, deleted)
    const dirtyFiles = isDirty
        ? statusOutput
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => line.slice(3).trim()) // Remove status prefix (e.g., " M ", "?? ")
            .slice(0, 20) // Limit to 20 files
        : [];
    return {
        branch,
        commit,
        commitMessage,
        isDirty,
        dirtyFiles,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Get recent commits (for context)
 */
export function getRecentCommits(cwd, count = 5) {
    if (!isGitRepo(cwd)) {
        return [];
    }
    const output = gitCommand(cwd, `log -${count} --oneline`);
    if (!output)
        return [];
    return output.split("\n").filter((line) => line.trim());
}
/**
 * Get branches (local)
 */
export function getLocalBranches(cwd) {
    if (!isGitRepo(cwd)) {
        return [];
    }
    const output = gitCommand(cwd, "branch --format='%(refname:short)'");
    if (!output)
        return [];
    return output
        .split("\n")
        .map((b) => b.replace(/'/g, "").trim())
        .filter((b) => b);
}
/**
 * Format git state for display/context injection
 */
export function formatGitContext(state, recentCommits) {
    const parts = [];
    parts.push(`Branch: ${state.branch}`);
    parts.push(`HEAD: ${state.commit} - ${state.commitMessage}`);
    if (state.isDirty) {
        parts.push(`Status: ${state.dirtyFiles.length} uncommitted changes`);
        if (state.dirtyFiles.length <= 5) {
            parts.push(`  Files: ${state.dirtyFiles.join(", ")}`);
        }
    }
    else {
        parts.push(`Status: Clean working tree`);
    }
    if (recentCommits && recentCommits.length > 0) {
        parts.push(`Recent commits:`);
        recentCommits.slice(0, 3).forEach((c) => parts.push(`  ${c}`));
    }
    return parts.join("\n");
}
/**
 * Branch type patterns for inference
 */
const BRANCH_TYPE_PATTERNS = [
    { pattern: /^(feat|feature)[/-]/i, type: "feature" },
    { pattern: /^(fix|bugfix|hotfix)[/-]/i, type: "fix" },
    { pattern: /^(refactor|refactoring)[/-]/i, type: "refactor" },
    { pattern: /^(docs|documentation)[/-]/i, type: "docs" },
    { pattern: /^(test|tests|testing)[/-]/i, type: "test" },
    { pattern: /^(chore|build|ci)[/-]/i, type: "chore" },
];
/**
 * Commit message type patterns
 */
const COMMIT_TYPE_PATTERNS = [
    { pattern: /^feat(\(.+\))?:/i, type: "feature" },
    { pattern: /^fix(\(.+\))?:/i, type: "fix" },
    { pattern: /^refactor(\(.+\))?:/i, type: "refactor" },
    { pattern: /^docs(\(.+\))?:/i, type: "docs" },
    { pattern: /^test(\(.+\))?:/i, type: "test" },
    { pattern: /^chore(\(.+\))?:/i, type: "chore" },
    { pattern: /^(build|ci)(\(.+\))?:/i, type: "chore" },
];
/**
 * File path to area mapping
 */
const PATH_AREA_PATTERNS = [
    { pattern: /\/(api|routes|endpoints)\//i, area: "api" },
    { pattern: /\/(auth|authentication|login)\//i, area: "auth" },
    { pattern: /\/(ui|components|views|pages)\//i, area: "ui" },
    { pattern: /\/(hooks)\//i, area: "hooks" },
    { pattern: /\/(config|settings)\//i, area: "config" },
    { pattern: /\/(test|tests|__tests__|spec)\//i, area: "testing" },
    { pattern: /\/(docs|documentation)\//i, area: "docs" },
    { pattern: /\/(utils|helpers|lib)\//i, area: "utils" },
    { pattern: /\/(cache|storage)\//i, area: "cache" },
    { pattern: /\/(cli|commands)\//i, area: "cli" },
    { pattern: /\/(skills)\//i, area: "skills" },
    { pattern: /\.(md|mdx)$/i, area: "docs" },
    { pattern: /\.(test|spec)\.(ts|js|tsx|jsx)$/i, area: "testing" },
];
/**
 * Extract keywords from text (branch names, commit messages)
 */
function extractKeywords(text) {
    // Remove common prefixes and split by delimiters
    const cleaned = text
        .replace(/^(feat|fix|refactor|docs|test|chore|feature|bugfix|hotfix)[/:-]/i, "")
        .replace(/(\(.+\))?:/g, " ");
    // Split by common delimiters and filter
    const words = cleaned
        .split(/[-_/\s]+/)
        .map((w) => w.toLowerCase().trim())
        .filter((w) => w.length > 2 && w.length < 20)
        .filter((w) => !["the", "and", "for", "with", "add", "update", "fix"].includes(w));
    // Deduplicate
    return [...new Set(words)].slice(0, 10);
}
/**
 * Parse branch name into type and description
 */
function parseBranchName(branch) {
    // Check for type prefix
    for (const { pattern, type } of BRANCH_TYPE_PATTERNS) {
        if (pattern.test(branch)) {
            const description = branch
                .replace(pattern, "")
                .replace(/[-_]/g, " ")
                .trim();
            return { type, description };
        }
    }
    // No recognized prefix - extract description from branch name
    const description = branch
        .replace(/^(main|master|develop|dev)$/i, "")
        .replace(/[-_]/g, " ")
        .trim();
    return { type: "unknown", description: description || branch };
}
/**
 * Infer feature type from commit messages
 */
function inferTypeFromCommits(commits) {
    const typeCounts = {
        feature: 0,
        fix: 0,
        refactor: 0,
        docs: 0,
        test: 0,
        chore: 0,
        unknown: 0,
    };
    for (const commit of commits) {
        // Extract just the message part (after SHA)
        const message = commit.replace(/^[a-f0-9]+\s+/i, "");
        for (const { pattern, type } of COMMIT_TYPE_PATTERNS) {
            if (pattern.test(message)) {
                typeCounts[type]++;
                break;
            }
        }
    }
    // Find the dominant type (excluding unknown)
    let maxType = null;
    let maxCount = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
        if (type !== "unknown" && count > maxCount) {
            maxCount = count;
            maxType = type;
        }
    }
    return maxCount > 0 ? maxType : null;
}
/**
 * Map file paths to feature areas
 */
function inferAreasFromFiles(files) {
    const areas = new Set();
    for (const file of files) {
        for (const { pattern, area } of PATH_AREA_PATTERNS) {
            if (pattern.test(file)) {
                areas.add(area);
            }
        }
    }
    return [...areas].slice(0, 5);
}
/**
 * Infer feature context from git state and recent commits
 * Uses local inference only - no API calls
 */
export function inferFeatureContext(gitState, recentCommits = []) {
    // Parse branch name
    const { type: branchType, description: branchDesc } = parseBranchName(gitState.branch);
    // Try to infer type from commits if branch didn't give us one
    const commitType = inferTypeFromCommits(recentCommits);
    const inferredType = branchType !== "unknown" ? branchType : (commitType || "unknown");
    // Gather keywords from branch and commits
    const branchKeywords = extractKeywords(gitState.branch);
    const commitKeywords = recentCommits.flatMap((c) => extractKeywords(c));
    const allKeywords = [...new Set([...branchKeywords, ...commitKeywords])].slice(0, 10);
    // Infer areas from dirty files and recent commits
    const allFiles = [...gitState.dirtyFiles];
    // Extract file paths from commit messages if present (some formats include them)
    for (const commit of recentCommits) {
        const fileMatch = commit.match(/\b[\w/-]+\.(ts|js|tsx|jsx|json|md)\b/g);
        if (fileMatch) {
            allFiles.push(...fileMatch);
        }
    }
    const areas = inferAreasFromFiles(allFiles);
    // Build description
    let description = branchDesc;
    if (!description && gitState.commitMessage) {
        // Use commit message as fallback
        description = gitState.commitMessage
            .replace(/^(feat|fix|refactor|docs|test|chore)(\(.+\))?:\s*/i, "")
            .slice(0, 100);
    }
    // Determine confidence
    let confidence = "low";
    if (branchType !== "unknown" && allKeywords.length > 2) {
        confidence = "high";
    }
    else if (commitType || allKeywords.length > 0) {
        confidence = "medium";
    }
    return {
        type: inferredType,
        description: description || "general development",
        keywords: allKeywords,
        areas,
        confidence,
    };
}
/**
 * Format feature context for display/injection
 */
export function formatFeatureContext(context) {
    const parts = [];
    parts.push(`Type: ${context.type}`);
    parts.push(`Description: ${context.description}`);
    if (context.keywords.length > 0) {
        parts.push(`Keywords: ${context.keywords.join(", ")}`);
    }
    if (context.areas.length > 0) {
        parts.push(`Areas: ${context.areas.join(", ")}`);
    }
    parts.push(`Confidence: ${context.confidence}`);
    return parts.join("\n");
}
