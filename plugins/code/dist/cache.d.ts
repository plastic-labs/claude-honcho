interface IdCache {
    workspace?: {
        name: string;
        id: string;
    };
    peers?: Record<string, string>;
    sessions?: Record<string, {
        name: string;
        id: string;
        updatedAt: string;
    }>;
    claudeInstanceId?: string;
}
export declare function loadIdCache(): IdCache;
export declare function saveIdCache(cache: IdCache): void;
export declare function getCachedWorkspaceId(workspaceName: string): string | null;
export declare function setCachedWorkspaceId(name: string, id: string): void;
export declare function getCachedPeerId(peerName: string): string | null;
export declare function setCachedPeerId(peerName: string, peerId: string): void;
export declare function getCachedSessionId(cwd: string): string | null;
export declare function setCachedSessionId(cwd: string, name: string, id: string): void;
export declare function getClaudeInstanceId(): string | null;
export declare function setClaudeInstanceId(instanceId: string): void;
interface ContextCache {
    userContext?: {
        data: any;
        fetchedAt: number;
    };
    claudeContext?: {
        data: any;
        fetchedAt: number;
    };
    summaries?: {
        data: any;
        fetchedAt: number;
    };
    messageCount?: number;
    lastRefreshMessageCount?: number;
}
export declare function loadContextCache(): ContextCache;
export declare function saveContextCache(cache: ContextCache): void;
export declare function getCachedUserContext(): any | null;
export declare function setCachedUserContext(data: any): void;
export declare function getCachedClaudeContext(): any | null;
export declare function setCachedClaudeContext(data: any): void;
export declare function isContextCacheStale(): boolean;
export declare function incrementMessageCount(): number;
export declare function shouldRefreshKnowledgeGraph(): boolean;
export declare function markKnowledgeGraphRefreshed(): void;
export declare function resetMessageCount(): void;
interface QueuedMessage {
    content: string;
    peerId: string;
    cwd: string;
    timestamp: string;
    uploaded?: boolean;
    instanceId?: string;
}
export declare function queueMessage(content: string, peerId: string, cwd: string, instanceId?: string): void;
export declare function getQueuedMessages(forCwd?: string): QueuedMessage[];
export declare function clearMessageQueue(): void;
export declare function markMessagesUploaded(forCwd?: string): void;
export declare function getClaudeContextPath(): string;
export declare function loadClaudeLocalContext(): string;
export declare function saveClaudeLocalContext(content: string): void;
export declare function appendClaudeWork(workDescription: string): void;
export declare function generateClaudeSummary(sessionName: string, workItems: string[], assistantMessages: string[]): string;
export interface GitState {
    branch: string;
    commit: string;
    commitMessage: string;
    isDirty: boolean;
    dirtyFiles: string[];
    timestamp: string;
}
interface GitStateCache {
    [cwd: string]: GitState;
}
export declare function loadGitStateCache(): GitStateCache;
export declare function saveGitStateCache(cache: GitStateCache): void;
export declare function getCachedGitState(cwd: string): GitState | null;
export declare function setCachedGitState(cwd: string, state: GitState): void;
export interface GitFeatureContext {
    type: "feature" | "fix" | "refactor" | "docs" | "test" | "chore" | "unknown";
    description: string;
    keywords: string[];
    areas: string[];
    confidence: "high" | "medium" | "low";
}
export interface GitStateChange {
    type: "branch_switch" | "new_commits" | "files_changed" | "initial";
    description: string;
    from?: string;
    to?: string;
}
export declare function detectGitChanges(previous: GitState | null, current: GitState): GitStateChange[];
export declare function clearAllCaches(): void;
export {};
