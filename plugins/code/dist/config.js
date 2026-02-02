import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
// Default base URLs for the new SDK (v3 API)
const HONCHO_BASE_URLS = {
    production: "https://api.honcho.dev/v3",
    local: "http://localhost:8000/v3",
};
const CONFIG_DIR = join(homedir(), ".honcho");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export function getConfigDir() {
    return CONFIG_DIR;
}
export function getConfigPath() {
    return CONFIG_FILE;
}
export function configExists() {
    return existsSync(CONFIG_FILE);
}
/**
 * Load config from file, with environment variable fallbacks.
 * This allows the plugin to work without running `honcho init` first
 * if the user sets HONCHO_API_KEY and other env vars.
 */
export function loadConfig() {
    // Try file-based config first
    if (configExists()) {
        try {
            const content = readFileSync(CONFIG_FILE, "utf-8");
            const fileConfig = JSON.parse(content);
            // Merge with env vars (env vars take precedence for API key)
            return mergeWithEnvVars(fileConfig);
        }
        catch {
            // Fall through to env-only config
        }
    }
    // No file config - try environment variables only
    return loadConfigFromEnv();
}
/**
 * Load config purely from environment variables.
 * Returns null if required vars (HONCHO_API_KEY) are not set.
 */
export function loadConfigFromEnv() {
    const apiKey = process.env.HONCHO_API_KEY;
    if (!apiKey) {
        return null;
    }
    const peerName = process.env.HONCHO_PEER_NAME || process.env.USER || "user";
    const workspace = process.env.HONCHO_WORKSPACE || "claude_code";
    const claudePeer = process.env.HONCHO_CLAUDE_PEER || "claude";
    const endpoint = process.env.HONCHO_ENDPOINT;
    const config = {
        apiKey,
        peerName,
        workspace,
        claudePeer,
        saveMessages: process.env.HONCHO_SAVE_MESSAGES !== "false",
        enabled: process.env.HONCHO_ENABLED !== "false",
    };
    // Handle endpoint configuration
    if (endpoint) {
        if (endpoint === "local") {
            config.endpoint = { environment: "local" };
        }
        else if (endpoint.startsWith("http")) {
            config.endpoint = { baseUrl: endpoint };
        }
    }
    return config;
}
/**
 * Merge file-based config with environment variable overrides.
 * Env vars take precedence for sensitive values like API key.
 */
function mergeWithEnvVars(config) {
    // API key from env takes precedence (allows secure injection)
    if (process.env.HONCHO_API_KEY) {
        config.apiKey = process.env.HONCHO_API_KEY;
    }
    // Other env overrides
    if (process.env.HONCHO_WORKSPACE) {
        config.workspace = process.env.HONCHO_WORKSPACE;
    }
    if (process.env.HONCHO_PEER_NAME) {
        config.peerName = process.env.HONCHO_PEER_NAME;
    }
    if (process.env.HONCHO_ENABLED === "false") {
        config.enabled = false;
    }
    return config;
}
export function saveConfig(config) {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
export function getClaudeSettingsPath() {
    return join(homedir(), ".claude", "settings.json");
}
export function getClaudeSettingsDir() {
    return join(homedir(), ".claude");
}
// Session management helpers
export function getSessionForPath(cwd) {
    const config = loadConfig();
    if (!config?.sessions)
        return null;
    return config.sessions[cwd] || null;
}
export function setSessionForPath(cwd, sessionName) {
    const config = loadConfig();
    if (!config)
        return;
    if (!config.sessions) {
        config.sessions = {};
    }
    config.sessions[cwd] = sessionName;
    saveConfig(config);
}
export function getAllSessions() {
    const config = loadConfig();
    return config?.sessions || {};
}
export function removeSessionForPath(cwd) {
    const config = loadConfig();
    if (!config?.sessions)
        return;
    delete config.sessions[cwd];
    saveConfig(config);
}
// Config helpers with defaults
export function getMessageUploadConfig() {
    const config = loadConfig();
    return {
        maxUserTokens: config?.messageUpload?.maxUserTokens ?? undefined, // No limit by default
        maxAssistantTokens: config?.messageUpload?.maxAssistantTokens ?? undefined, // No limit by default
        summarizeAssistant: config?.messageUpload?.summarizeAssistant ?? false,
    };
}
export function getContextRefreshConfig() {
    const config = loadConfig();
    return {
        messageThreshold: config?.contextRefresh?.messageThreshold ?? 30, // Every 30 messages
        ttlSeconds: config?.contextRefresh?.ttlSeconds ?? 300, // 5 minutes
        skipDialectic: config?.contextRefresh?.skipDialectic ?? false, // Dialectic enabled by default
    };
}
export function getLocalContextConfig() {
    const config = loadConfig();
    return {
        maxEntries: config?.localContext?.maxEntries ?? 50, // Default 50 entries
    };
}
// Plugin enable/disable
export function isPluginEnabled() {
    const config = loadConfig();
    return config?.enabled !== false; // default: true
}
export function setPluginEnabled(enabled) {
    const config = loadConfig();
    if (!config)
        return;
    config.enabled = enabled;
    saveConfig(config);
}
// Simple token estimation (chars / 4)
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
// Truncate text to approximate token limit
export function truncateToTokens(text, maxTokens) {
    const estimatedChars = maxTokens * 4;
    if (text.length <= estimatedChars) {
        return text;
    }
    return text.slice(0, estimatedChars - 3) + "...";
}
/**
 * Get the base URL for Honcho API based on config.
 * Priority: baseUrl > environment > "production" (default)
 */
export function getHonchoBaseUrl(config) {
    if (config.endpoint?.baseUrl) {
        // Custom URL takes precedence - ensure it has /v3 suffix
        const url = config.endpoint.baseUrl;
        return url.endsWith("/v3") ? url : `${url}/v3`;
    }
    if (config.endpoint?.environment === "local") {
        return HONCHO_BASE_URLS.local;
    }
    return HONCHO_BASE_URLS.production;
}
/**
 * Get Honcho client options based on config.
 * New SDK requires baseUrl and workspaceId at construction time.
 */
export function getHonchoClientOptions(config) {
    return {
        apiKey: config.apiKey,
        baseUrl: getHonchoBaseUrl(config),
        workspaceId: config.workspace,
    };
}
/**
 * Get current endpoint display info
 */
export function getEndpointInfo(config) {
    if (config.endpoint?.baseUrl) {
        return { type: "custom", url: config.endpoint.baseUrl };
    }
    if (config.endpoint?.environment === "local") {
        return { type: "local", url: HONCHO_BASE_URLS.local };
    }
    return { type: "production", url: HONCHO_BASE_URLS.production };
}
/**
 * Set endpoint configuration
 */
export function setEndpoint(environment, baseUrl) {
    const config = loadConfig();
    if (!config)
        return;
    config.endpoint = {
        environment,
        baseUrl,
    };
    saveConfig(config);
}
