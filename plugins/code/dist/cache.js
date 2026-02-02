import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { getContextRefreshConfig, getLocalContextConfig } from "./config.js";
const CACHE_DIR = join(homedir(), ".honcho");
const ID_CACHE_FILE = join(CACHE_DIR, "cache.json");
const CONTEXT_CACHE_FILE = join(CACHE_DIR, "context-cache.json");
const MESSAGE_QUEUE_FILE = join(CACHE_DIR, "message-queue.jsonl");
const CLAUDE_CONTEXT_FILE = join(CACHE_DIR, "claude-context.md");
// Ensure cache directory exists
function ensureCacheDir() {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
    }
}
export function loadIdCache() {
    ensureCacheDir();
    if (!existsSync(ID_CACHE_FILE)) {
        return {};
    }
    try {
        return JSON.parse(readFileSync(ID_CACHE_FILE, "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveIdCache(cache) {
    ensureCacheDir();
    writeFileSync(ID_CACHE_FILE, JSON.stringify(cache, null, 2));
}
export function getCachedWorkspaceId(workspaceName) {
    const cache = loadIdCache();
    if (cache.workspace?.name === workspaceName) {
        return cache.workspace.id;
    }
    return null;
}
export function setCachedWorkspaceId(name, id) {
    const cache = loadIdCache();
    cache.workspace = { name, id };
    saveIdCache(cache);
}
export function getCachedPeerId(peerName) {
    const cache = loadIdCache();
    return cache.peers?.[peerName] || null;
}
export function setCachedPeerId(peerName, peerId) {
    const cache = loadIdCache();
    if (!cache.peers)
        cache.peers = {};
    cache.peers[peerName] = peerId;
    saveIdCache(cache);
}
export function getCachedSessionId(cwd) {
    const cache = loadIdCache();
    return cache.sessions?.[cwd]?.id || null;
}
export function setCachedSessionId(cwd, name, id) {
    const cache = loadIdCache();
    if (!cache.sessions)
        cache.sessions = {};
    cache.sessions[cwd] = { name, id, updatedAt: new Date().toISOString() };
    saveIdCache(cache);
}
// Claude instance tracking for parallel session support
export function getClaudeInstanceId() {
    const cache = loadIdCache();
    return cache.claudeInstanceId || null;
}
export function setClaudeInstanceId(instanceId) {
    const cache = loadIdCache();
    cache.claudeInstanceId = instanceId;
    saveIdCache(cache);
}
// These are now configurable via config.json, with defaults in getContextRefreshConfig()
function getContextTTL() {
    const config = getContextRefreshConfig();
    return (config.ttlSeconds ?? 300) * 1000; // Convert to ms
}
function getMessageRefreshThreshold() {
    const config = getContextRefreshConfig();
    return config.messageThreshold ?? 50;
}
export function loadContextCache() {
    ensureCacheDir();
    if (!existsSync(CONTEXT_CACHE_FILE)) {
        return {};
    }
    try {
        return JSON.parse(readFileSync(CONTEXT_CACHE_FILE, "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveContextCache(cache) {
    ensureCacheDir();
    writeFileSync(CONTEXT_CACHE_FILE, JSON.stringify(cache, null, 2));
}
export function getCachedUserContext() {
    const cache = loadContextCache();
    if (cache.userContext && Date.now() - cache.userContext.fetchedAt < getContextTTL()) {
        return cache.userContext.data;
    }
    return null;
}
export function setCachedUserContext(data) {
    const cache = loadContextCache();
    cache.userContext = { data, fetchedAt: Date.now() };
    saveContextCache(cache);
}
export function getCachedClaudeContext() {
    const cache = loadContextCache();
    if (cache.claudeContext && Date.now() - cache.claudeContext.fetchedAt < getContextTTL()) {
        return cache.claudeContext.data;
    }
    return null;
}
export function setCachedClaudeContext(data) {
    const cache = loadContextCache();
    cache.claudeContext = { data, fetchedAt: Date.now() };
    saveContextCache(cache);
}
export function isContextCacheStale() {
    const cache = loadContextCache();
    if (!cache.userContext)
        return true;
    return Date.now() - cache.userContext.fetchedAt >= getContextTTL();
}
// Track message count for threshold-based refresh
export function incrementMessageCount() {
    const cache = loadContextCache();
    cache.messageCount = (cache.messageCount || 0) + 1;
    saveContextCache(cache);
    return cache.messageCount;
}
export function shouldRefreshKnowledgeGraph() {
    const cache = loadContextCache();
    const currentCount = cache.messageCount || 0;
    const lastRefresh = cache.lastRefreshMessageCount || 0;
    // Refresh if we've sent threshold messages since last refresh
    return (currentCount - lastRefresh) >= getMessageRefreshThreshold();
}
export function markKnowledgeGraphRefreshed() {
    const cache = loadContextCache();
    cache.lastRefreshMessageCount = cache.messageCount || 0;
    saveContextCache(cache);
}
export function resetMessageCount() {
    const cache = loadContextCache();
    cache.messageCount = 0;
    cache.lastRefreshMessageCount = 0;
    saveContextCache(cache);
}
export function queueMessage(content, peerId, cwd, instanceId) {
    ensureCacheDir();
    const message = {
        content,
        peerId,
        cwd,
        timestamp: new Date().toISOString(),
        uploaded: false,
        instanceId: instanceId || getClaudeInstanceId() || undefined,
    };
    appendFileSync(MESSAGE_QUEUE_FILE, JSON.stringify(message) + "\n");
}
export function getQueuedMessages(forCwd) {
    ensureCacheDir();
    if (!existsSync(MESSAGE_QUEUE_FILE)) {
        return [];
    }
    try {
        const content = readFileSync(MESSAGE_QUEUE_FILE, "utf-8");
        const lines = content.split("\n").filter((line) => line.trim());
        const messages = lines.map((line) => JSON.parse(line)).filter((msg) => !msg.uploaded);
        // Filter by cwd if specified
        if (forCwd) {
            return messages.filter((msg) => msg.cwd === forCwd);
        }
        return messages;
    }
    catch {
        return [];
    }
}
export function clearMessageQueue() {
    ensureCacheDir();
    writeFileSync(MESSAGE_QUEUE_FILE, "");
}
export function markMessagesUploaded(forCwd) {
    if (!forCwd) {
        // Clear all
        clearMessageQueue();
        return;
    }
    // Only remove messages for the specified cwd, keep others
    ensureCacheDir();
    if (!existsSync(MESSAGE_QUEUE_FILE))
        return;
    try {
        const content = readFileSync(MESSAGE_QUEUE_FILE, "utf-8");
        const lines = content.split("\n").filter((line) => line.trim());
        const remaining = lines.filter((line) => {
            try {
                const msg = JSON.parse(line);
                return msg.cwd !== forCwd;
            }
            catch {
                return false;
            }
        });
        writeFileSync(MESSAGE_QUEUE_FILE, remaining.join("\n") + (remaining.length ? "\n" : ""));
    }
    catch {
        // ignore
    }
}
// ============================================
// CLAUDE Context File - self-summary
// ============================================
export function getClaudeContextPath() {
    return CLAUDE_CONTEXT_FILE;
}
export function loadClaudeLocalContext() {
    ensureCacheDir();
    if (!existsSync(CLAUDE_CONTEXT_FILE)) {
        return "";
    }
    try {
        return readFileSync(CLAUDE_CONTEXT_FILE, "utf-8");
    }
    catch {
        return "";
    }
}
export function saveClaudeLocalContext(content) {
    ensureCacheDir();
    writeFileSync(CLAUDE_CONTEXT_FILE, content);
}
export function appendClaudeWork(workDescription) {
    ensureCacheDir();
    const timestamp = new Date().toISOString();
    const entry = `\n- [${timestamp}] ${workDescription}`;
    let existing = loadClaudeLocalContext();
    if (!existing) {
        existing = `# CLAUDE Work Context\n\nAuto-generated log of CLAUDE's recent work.\n\n## Recent Activity\n`;
    }
    // Keep only last N entries to prevent file from growing too large
    let maxEntries = getLocalContextConfig().maxEntries;
    if (!maxEntries) {
        maxEntries = 10;
    }
    const lines = existing.split("\n");
    const activityStart = lines.findIndex((l) => l.includes("## Recent Activity"));
    if (activityStart !== -1) {
        const header = lines.slice(0, activityStart + 1);
        const activities = lines.slice(activityStart + 1).filter((l) => l.trim());
        const recentActivities = activities.slice(-(maxEntries - 1)); // Keep last N-1, add 1 new
        existing = [...header, ...recentActivities].join("\n");
    }
    saveClaudeLocalContext(existing + entry);
}
export function generateClaudeSummary(sessionName, workItems, assistantMessages) {
    const timestamp = new Date().toISOString();
    // Extract key actions from assistant messages
    const actions = [];
    for (const msg of assistantMessages.slice(-10)) {
        // Look for action indicators
        if (msg.includes("Created") || msg.includes("Updated") || msg.includes("Fixed")) {
            const firstSentence = msg.split(/[.!?\n]/)[0];
            if (firstSentence.length < 200) {
                actions.push(firstSentence);
            }
        }
    }
    let summary = `# CLAUDE Work Context

Last updated: ${timestamp}
Session: ${sessionName}

## What CLAUDE Was Working On

`;
    if (workItems.length > 0) {
        summary += workItems.map((w) => `- ${w}`).join("\n");
        summary += "\n\n";
    }
    if (actions.length > 0) {
        summary += "## Recent Actions\n\n";
        summary += actions.slice(-10).map((a) => `- ${a}`).join("\n");
        summary += "\n\n";
    }
    summary += "## Recent Activity\n";
    return summary;
}
// ============================================
// Git State Cache - track git state per directory
// ============================================
const GIT_STATE_FILE = join(CACHE_DIR, "git-state.json");
export function loadGitStateCache() {
    ensureCacheDir();
    if (!existsSync(GIT_STATE_FILE)) {
        return {};
    }
    try {
        return JSON.parse(readFileSync(GIT_STATE_FILE, "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveGitStateCache(cache) {
    ensureCacheDir();
    writeFileSync(GIT_STATE_FILE, JSON.stringify(cache, null, 2));
}
export function getCachedGitState(cwd) {
    const cache = loadGitStateCache();
    return cache[cwd] || null;
}
export function setCachedGitState(cwd, state) {
    const cache = loadGitStateCache();
    cache[cwd] = state;
    saveGitStateCache(cache);
}
export function detectGitChanges(previous, current) {
    const changes = [];
    if (!previous) {
        changes.push({
            type: "initial",
            description: `Session started on branch '${current.branch}' at ${current.commit}`,
        });
        return changes;
    }
    // Branch switch
    if (previous.branch !== current.branch) {
        changes.push({
            type: "branch_switch",
            description: `Branch switched from '${previous.branch}' to '${current.branch}'`,
            from: previous.branch,
            to: current.branch,
        });
    }
    // New commits (different SHA on same branch, or any commit change)
    if (previous.commit !== current.commit) {
        changes.push({
            type: "new_commits",
            description: `New commit: ${current.commit} - ${current.commitMessage}`,
            from: previous.commit,
            to: current.commit,
        });
    }
    // Dirty state changed
    if (!previous.isDirty && current.isDirty) {
        changes.push({
            type: "files_changed",
            description: `Uncommitted changes detected: ${current.dirtyFiles.slice(0, 5).join(", ")}${current.dirtyFiles.length > 5 ? "..." : ""}`,
        });
    }
    return changes;
}
// ============================================
// Utility: Clear all caches (for debugging)
// ============================================
export function clearAllCaches() {
    ensureCacheDir();
    if (existsSync(ID_CACHE_FILE))
        writeFileSync(ID_CACHE_FILE, "{}");
    if (existsSync(CONTEXT_CACHE_FILE))
        writeFileSync(CONTEXT_CACHE_FILE, "{}");
    if (existsSync(MESSAGE_QUEUE_FILE))
        writeFileSync(MESSAGE_QUEUE_FILE, "");
    if (existsSync(GIT_STATE_FILE))
        writeFileSync(GIT_STATE_FILE, "{}");
    // Don't clear claude-context.md - that's valuable history
}
