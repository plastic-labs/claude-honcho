export interface MessageUploadConfig {
    maxUserTokens?: number;
    maxAssistantTokens?: number;
    summarizeAssistant?: boolean;
}
export interface ContextRefreshConfig {
    messageThreshold?: number;
    ttlSeconds?: number;
    skipDialectic?: boolean;
}
export interface LocalContextConfig {
    maxEntries?: number;
}
export type HonchoEnvironment = "production" | "local";
export interface HonchoEndpointConfig {
    environment?: HonchoEnvironment;
    baseUrl?: string;
}
export interface HonchoCLAUDEConfig {
    peerName: string;
    apiKey: string;
    workspace: string;
    claudePeer: string;
    sessions?: Record<string, string>;
    saveMessages?: boolean;
    messageUpload?: MessageUploadConfig;
    contextRefresh?: ContextRefreshConfig;
    endpoint?: HonchoEndpointConfig;
    localContext?: LocalContextConfig;
    enabled?: boolean;
}
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
export declare function configExists(): boolean;
/**
 * Load config from file, with environment variable fallbacks.
 * This allows the plugin to work without running `honcho init` first
 * if the user sets HONCHO_API_KEY and other env vars.
 */
export declare function loadConfig(): HonchoCLAUDEConfig | null;
/**
 * Load config purely from environment variables.
 * Returns null if required vars (HONCHO_API_KEY) are not set.
 */
export declare function loadConfigFromEnv(): HonchoCLAUDEConfig | null;
export declare function saveConfig(config: HonchoCLAUDEConfig): void;
export declare function getClaudeSettingsPath(): string;
export declare function getClaudeSettingsDir(): string;
export declare function getSessionForPath(cwd: string): string | null;
export declare function setSessionForPath(cwd: string, sessionName: string): void;
export declare function getAllSessions(): Record<string, string>;
export declare function removeSessionForPath(cwd: string): void;
export declare function getMessageUploadConfig(): MessageUploadConfig;
export declare function getContextRefreshConfig(): ContextRefreshConfig;
export declare function getLocalContextConfig(): LocalContextConfig;
export declare function isPluginEnabled(): boolean;
export declare function setPluginEnabled(enabled: boolean): void;
export declare function estimateTokens(text: string): number;
export declare function truncateToTokens(text: string, maxTokens: number): string;
export interface HonchoClientOptions {
    apiKey: string;
    baseUrl: string;
    workspaceId: string;
}
/**
 * Get the base URL for Honcho API based on config.
 * Priority: baseUrl > environment > "production" (default)
 */
export declare function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string;
/**
 * Get Honcho client options based on config.
 * New SDK requires baseUrl and workspaceId at construction time.
 */
export declare function getHonchoClientOptions(config: HonchoCLAUDEConfig): HonchoClientOptions;
/**
 * Get current endpoint display info
 */
export declare function getEndpointInfo(config: HonchoCLAUDEConfig): {
    type: string;
    url: string;
};
/**
 * Set endpoint configuration
 */
export declare function setEndpoint(environment?: HonchoEnvironment, baseUrl?: string): void;
