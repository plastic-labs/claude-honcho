import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Honcho } from "@honcho-ai/sdk";
import { existsSync, readFileSync } from "fs";
import {
  loadConfig,
  saveConfig,
  getHonchoClientOptions,
  getSessionName,
  getConfigPath,
  configExists,
  getDetectedHost,
  getEndpointInfo,
  getKnownHosts,
  getLinkedWorkspaces,
  setDetectedHost,
  type HonchoCLAUDEConfig,
  type SessionStrategy,
  type HonchoEnvironment,
} from "../config.js";
import {
  loadIdCache,
  loadContextCache,
  getQueuedMessages,
  clearIdCache,
  clearPeerCache,
  clearUserContextOnly,
  clearClaudeContextOnly,
} from "../cache.js";

// ============================================
// Environment variable names that can shadow config fields
// ============================================

const ENV_SHADOW_MAP: Record<string, string> = {
  peerName: "HONCHO_PEER_NAME",
  workspace: "HONCHO_WORKSPACE",
  aiPeer: "HONCHO_AI_PEER",
  enabled: "HONCHO_ENABLED",
  logging: "HONCHO_LOGGING",
  saveMessages: "HONCHO_SAVE_MESSAGES",
  "endpoint.baseUrl": "HONCHO_ENDPOINT",
  "endpoint.environment": "HONCHO_ENDPOINT",
};

// Fields that require confirm=true to change
const DANGEROUS_FIELDS = new Set(["workspace", "endpoint.environment", "endpoint.baseUrl"]);

// ============================================
// get_config handler
// ============================================

function handleGetConfig(cwd: string) {
  const cfg = loadConfig();
  const host = getDetectedHost();
  const cfgPath = getConfigPath();
  const cfgExists = configExists();

  // Read raw file to detect hosts block and legacy fields
  let rawFile: Record<string, any> = {};
  if (cfgExists) {
    try { rawFile = JSON.parse(readFileSync(cfgPath, "utf-8")); } catch { /* */ }
  }

  // Resolved config
  const linkedWorkspaces = getLinkedWorkspaces();
  const resolved = cfg ? {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: getEndpointInfo(cfg),
    sessionStrategy: cfg.sessionStrategy ?? "per-directory",
    sessionPeerPrefix: cfg.sessionPeerPrefix !== false,
    linkedHosts: cfg.linkedHosts ?? [],
    linkedWorkspaces,
    sessions: cfg.sessions ?? {},
    messageUpload: cfg.messageUpload ?? {},
    contextRefresh: cfg.contextRefresh ?? {},
    localContext: cfg.localContext ?? {},
    enabled: cfg.enabled !== false,
    logging: cfg.logging !== false,
    saveMessages: cfg.saveMessages !== false,
  } : null;

  // Current status header values
  const sessionName = cfg ? getSessionName(cwd) : null;
  const endpointInfo = cfg ? getEndpointInfo(cfg) : null;
  const endpointLabel = endpointInfo
    ? endpointInfo.type === "production" ? "SaaS" : endpointInfo.type
    : null;

  const current = cfg ? {
    workspace: cfg.workspace,
    session: sessionName,
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    host: `${endpointLabel} (${endpointInfo?.url})`,
  } : null;

  // Host info
  const knownHosts = getKnownHosts();
  const hostInfo = {
    detected: host,
    hasHostsBlock: !!rawFile.hosts,
    hostKeys: knownHosts,
    otherHosts: knownHosts.filter(h => h !== host),
  };

  // Cache state
  const idCache = loadIdCache();
  const contextCache = loadContextCache();
  const messageQueue = getQueuedMessages();

  const cache = {
    workspaceName: idCache.workspace?.name ?? null,
    peerCount: idCache.peers ? Object.keys(idCache.peers).length : 0,
    sessionCount: idCache.sessions ? Object.keys(idCache.sessions).length : 0,
    contextAge: contextCache.userContext
      ? Math.round((Date.now() - contextCache.userContext.fetchedAt) / 1000)
      : null,
    messageQueueSize: messageQueue.length,
  };

  // Warnings
  const warnings: string[] = [];

  // Check for env var shadowing
  for (const [field, envVar] of Object.entries(ENV_SHADOW_MAP)) {
    if (process.env[envVar]) {
      warnings.push(`${field} is shadowed by env var ${envVar}="${process.env[envVar]}"`);
    }
  }

  // Check for legacy fields without hosts block
  if (cfgExists && !rawFile.hosts) {
    warnings.push("Config uses legacy flat fields. Consider running /honcho:config to migrate to hosts block.");
  }

  // Check for cache/config workspace mismatch
  if (cfg && idCache.workspace && idCache.workspace.name !== cfg.workspace) {
    warnings.push(`Cache workspace "${idCache.workspace.name}" does not match config workspace "${cfg.workspace}". Consider clearing caches.`);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ resolved, current, host: hostInfo, cache, warnings, configPath: cfgPath, configExists: cfgExists }, null, 2),
    }],
  };
}

// ============================================
// set_config handler
// ============================================

function handleSetConfig(args: Record<string, unknown>) {
  const field = args.field as string;
  const value = args.value;
  const confirm = args.confirm === true;

  // Dangerous field gate
  if (DANGEROUS_FIELDS.has(field) && !confirm) {
    const descriptions: Record<string, string> = {
      workspace: "Changing workspace switches the entire data space. All cached IDs, context, and session mappings will be invalidated. Existing data remains in the old workspace but will no longer be visible.",
      "endpoint.environment": "Changing the endpoint switches the Honcho backend. All cached IDs and context will be invalidated.",
      "endpoint.baseUrl": "Changing the endpoint URL switches the Honcho backend. All cached IDs and context will be invalidated.",
    };
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          field,
          requiresConfirm: true,
          description: descriptions[field] ?? "This is a dangerous change. Pass confirm=true to proceed.",
        }, null, 2),
      }],
    };
  }

  const cfg = loadConfig();
  if (!cfg) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: false, error: "No config loaded. Set HONCHO_API_KEY first." }, null, 2),
      }],
      isError: true,
    };
  }

  let previousValue: unknown;
  let cacheInvalidation: { cleared: string[]; reason: string } | null = null;
  const warnings: string[] = [];

  // Check env var shadowing
  const shadowEnv = ENV_SHADOW_MAP[field];
  if (shadowEnv && process.env[shadowEnv]) {
    warnings.push(`${field} is shadowed by env var ${shadowEnv}="${process.env[shadowEnv]}". File will be updated but env var takes precedence at runtime.`);
  }

  // Apply the change
  switch (field) {
    case "peerName":
      previousValue = cfg.peerName;
      cfg.peerName = String(value);
      clearPeerCache();
      clearUserContextOnly();
      cacheInvalidation = { cleared: ["peer IDs", "user context"], reason: "Peer name changed" };
      break;

    case "aiPeer":
      previousValue = cfg.aiPeer;
      cfg.aiPeer = String(value);
      clearPeerCache();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["peer IDs", "claude context"], reason: "AI peer changed" };
      break;

    case "workspace":
      previousValue = cfg.workspace;
      cfg.workspace = String(value);
      clearIdCache();
      clearUserContextOnly();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["all IDs", "all context"], reason: "Workspace changed" };
      break;

    case "endpoint.environment":
      previousValue = cfg.endpoint?.environment;
      if (!cfg.endpoint) cfg.endpoint = {};
      // Accept "saas" as alias for "production"
      const envVal = String(value) === "saas" ? "production" : String(value);
      cfg.endpoint.environment = envVal as HonchoEnvironment;
      cfg.endpoint.baseUrl = undefined;
      clearIdCache();
      clearUserContextOnly();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["all IDs", "all context"], reason: "Endpoint changed" };
      break;

    case "endpoint.baseUrl":
      previousValue = cfg.endpoint?.baseUrl;
      if (!cfg.endpoint) cfg.endpoint = {};
      cfg.endpoint.baseUrl = String(value);
      cfg.endpoint.environment = undefined;
      clearIdCache();
      clearUserContextOnly();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["all IDs", "all context"], reason: "Endpoint URL changed" };
      break;

    case "sessionStrategy":
      previousValue = cfg.sessionStrategy ?? "per-directory";
      cfg.sessionStrategy = String(value) as SessionStrategy;
      break;

    case "sessionPeerPrefix":
      previousValue = cfg.sessionPeerPrefix !== false;
      cfg.sessionPeerPrefix = Boolean(value);
      break;

    case "linkedHosts": {
      previousValue = cfg.linkedHosts ?? [];
      const hosts = Array.isArray(value) ? value.map(String) : [];
      cfg.linkedHosts = hosts.length ? hosts : undefined;
      break;
    }

    case "enabled":
      previousValue = cfg.enabled;
      cfg.enabled = Boolean(value);
      break;

    case "logging":
      previousValue = cfg.logging;
      cfg.logging = Boolean(value);
      break;

    case "saveMessages":
      previousValue = cfg.saveMessages;
      cfg.saveMessages = Boolean(value);
      break;

    case "messageUpload.maxUserTokens":
      previousValue = cfg.messageUpload?.maxUserTokens;
      if (!cfg.messageUpload) cfg.messageUpload = {};
      cfg.messageUpload.maxUserTokens = value === null ? undefined : Number(value);
      break;

    case "messageUpload.maxAssistantTokens":
      previousValue = cfg.messageUpload?.maxAssistantTokens;
      if (!cfg.messageUpload) cfg.messageUpload = {};
      cfg.messageUpload.maxAssistantTokens = value === null ? undefined : Number(value);
      break;

    case "messageUpload.summarizeAssistant":
      previousValue = cfg.messageUpload?.summarizeAssistant;
      if (!cfg.messageUpload) cfg.messageUpload = {};
      cfg.messageUpload.summarizeAssistant = Boolean(value);
      break;

    case "contextRefresh.messageThreshold":
      previousValue = cfg.contextRefresh?.messageThreshold;
      if (!cfg.contextRefresh) cfg.contextRefresh = {};
      cfg.contextRefresh.messageThreshold = Number(value);
      break;

    case "contextRefresh.ttlSeconds":
      previousValue = cfg.contextRefresh?.ttlSeconds;
      if (!cfg.contextRefresh) cfg.contextRefresh = {};
      cfg.contextRefresh.ttlSeconds = Number(value);
      break;

    case "contextRefresh.skipDialectic":
      previousValue = cfg.contextRefresh?.skipDialectic;
      if (!cfg.contextRefresh) cfg.contextRefresh = {};
      cfg.contextRefresh.skipDialectic = Boolean(value);
      break;

    case "localContext.maxEntries":
      previousValue = cfg.localContext?.maxEntries;
      if (!cfg.localContext) cfg.localContext = {};
      cfg.localContext.maxEntries = Number(value);
      break;

    case "sessions.set": {
      const { path, name: sName } = value as { path: string; name: string };
      if (!cfg.sessions) cfg.sessions = {};
      previousValue = cfg.sessions[path] ?? null;
      cfg.sessions[path] = sName;
      break;
    }

    case "sessions.remove": {
      const { path: rPath } = value as { path: string };
      if (!cfg.sessions) cfg.sessions = {};
      previousValue = cfg.sessions[rPath] ?? null;
      delete cfg.sessions[rPath];
      break;
    }

    default:
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: `Unknown field: ${field}` }, null, 2),
        }],
        isError: true,
      };
  }

  // Persist
  saveConfig(cfg);

  // Return updated resolved config
  const endpointInfo = getEndpointInfo(cfg);
  const updatedLinkedWorkspaces = getLinkedWorkspaces();
  const resolved = {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: endpointInfo,
    sessionStrategy: cfg.sessionStrategy ?? "per-directory",
    sessionPeerPrefix: cfg.sessionPeerPrefix !== false,
    linkedHosts: cfg.linkedHosts ?? [],
    linkedWorkspaces: updatedLinkedWorkspaces,
    sessions: cfg.sessions ?? {},
    messageUpload: cfg.messageUpload ?? {},
    contextRefresh: cfg.contextRefresh ?? {},
    localContext: cfg.localContext ?? {},
    enabled: cfg.enabled !== false,
    logging: cfg.logging !== false,
    saveMessages: cfg.saveMessages !== false,
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        field,
        previousValue,
        newValue: value,
        cacheInvalidation,
        warnings: warnings.length ? warnings : undefined,
        resolved,
      }, null, 2),
    }],
  };
}

export async function runMcpServer(): Promise<void> {
  setDetectedHost("claude_code");
  const config = loadConfig();
  if (!config) {
    console.error("[honcho-mcp] Not configured. Run: honcho init");
    process.exit(1);
  }

  const server = new Server(
    {
      name: "honcho",
      version: "0.1.3",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize Honcho client
  const honcho = new Honcho(getHonchoClientOptions(config));

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search",
          description: "Search across messages in the current Honcho session using semantic search",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              limit: {
                type: "number",
                description: "Max results (1-50)",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "chat",
          description: "Query Honcho's knowledge about the user using dialectic reasoning",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Natural language question about the user",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "create_conclusion",
          description: "Save a key insight or biographical detail about the user to Honcho's memory",
          inputSchema: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The insight or fact to remember",
              },
            },
            required: ["content"],
          },
        },
        {
          name: "get_config",
          description: "Get the current Honcho plugin configuration, cache state, and diagnostic warnings",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "set_config",
          description: "Update a Honcho plugin configuration field. Dangerous changes (workspace, endpoint) require confirm=true.",
          inputSchema: {
            type: "object",
            properties: {
              field: {
                type: "string",
                description: "Config field to update",
                enum: [
                  "peerName",
                  "aiPeer",
                  "workspace",
                  "endpoint.environment",
                  "endpoint.baseUrl",
                  "sessionStrategy",
                  "sessionPeerPrefix",
                  "linkedHosts",
                  "enabled",
                  "logging",
                  "saveMessages",
                  "messageUpload.maxUserTokens",
                  "messageUpload.maxAssistantTokens",
                  "messageUpload.summarizeAssistant",
                  "contextRefresh.messageThreshold",
                  "contextRefresh.ttlSeconds",
                  "contextRefresh.skipDialectic",
                  "localContext.maxEntries",
                  "sessions.set",
                  "sessions.remove",
                ],
              },
              value: {
                description: "New value. For sessions.set: {path, name}. For sessions.remove: {path}.",
              },
              confirm: {
                type: "boolean",
                description: "Required true for dangerous changes (workspace, endpoint). Without it, returns a warning instead of applying.",
              },
            },
            required: ["field", "value"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const cwd = process.cwd();

    // ── Config tools (no Honcho session needed) ──

    if (name === "get_config") {
      return handleGetConfig(cwd);
    }

    if (name === "set_config") {
      return handleSetConfig(args as Record<string, unknown>);
    }

    // ── Honcho session tools ──

    const sessionName = getSessionName(cwd);

    try {
      const session = await honcho.session(sessionName);

      switch (name) {
        case "search": {
          const query = args?.query as string;
          const limit = (args?.limit as number) ?? 10;

          const messages = await session.search(query, { limit });

          const results = messages.map((msg: any) => ({
            content: msg.content,
            peerId: msg.peer,
            createdAt: msg.createdAt || msg.created_at,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "chat": {
          const query = args?.query as string;
          const userPeer = await honcho.peer(config.peerName);

          const response = await userPeer.chat(query, {
            session,
            reasoningLevel: "medium",
          });

          return {
            content: [
              {
                type: "text",
                text: response ?? "No response from Honcho",
              },
            ],
          };
        }

        case "create_conclusion": {
          const content = args?.content as string;
          const userPeer = await honcho.peer(config.peerName);

          const conclusions = await userPeer.conclusions.create({
            content,
            sessionId: session.id,
          });

          return {
            content: [
              {
                type: "text",
                text: `Saved conclusion: ${conclusions[0]?.content || content}`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
