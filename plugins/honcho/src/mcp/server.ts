import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Honcho } from "@honcho-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
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
  getLastActiveCwd,
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

// Fields that affect session identity/routing — stale sessions risk cross-contamination
const SESSION_AFFECTING_FIELDS = new Set([
  "workspace", "aiPeer", "peerName", "sessionStrategy", "sessionPeerPrefix",
  "endpoint.environment", "endpoint.baseUrl", "globalOverride",
]);

// ============================================
// get_config handler
// ============================================

// ============================================
// Pre-rendered status card (box-drawing)
// ============================================

function renderCard(rows: [string, string][], title: string): string {
  const labelWidth = 12;
  const gap = 3;
  const maxVal = 22;
  const ruleWidth = labelWidth + gap + maxVal + 2;
  const top = `\u250C\u2500 ${title} ${"\u2500".repeat(Math.max(0, ruleWidth - title.length - 4))}`;
  const bot = `\u2514${"\u2500".repeat(ruleWidth)}`;
  const blank = "\u2502";
  const body = rows.map(([label, value]) => {
    const v = value.length > maxVal ? value.slice(0, maxVal - 1) + "\u2026" : value;
    return `\u2502  ${label.padEnd(labelWidth)}${" ".repeat(gap)}${v}`;
  });
  return [top, blank, ...body, blank, bot].join("\n");
}

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
  const globalOverride = rawFile.globalOverride === true;
  const resolved = cfg ? {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: getEndpointInfo(cfg),
    globalOverride,
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
    ? endpointInfo.type === "production" ? "platform" : endpointInfo.type
    : null;

  const current = cfg ? {
    workspace: cfg.workspace,
    session: sessionName,
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    host: `${endpointLabel} (${endpointInfo?.url})`,
  } : null;

  // Host info — include other hosts so the config skill can offer linking
  const allHosts = getKnownHosts();
  const otherHosts: Record<string, { workspace: string }> = {};
  for (const hk of allHosts) {
    if (hk === host) continue;
    const block = rawFile.hosts?.[hk];
    otherHosts[hk] = { workspace: block?.workspace ?? hk };
  }

  const hostInfo = {
    detected: host,
    hasHostsBlock: !!rawFile.hosts,
    otherHosts,
  };

  // Warnings
  const warnings: string[] = [];

  // Host-specific fields (workspace, aiPeer) are NOT overridden by env vars
  // when a hosts block exists. Only warn about env vars that actually apply.
  const hasHostsBlock = !!rawFile.hosts?.[host];
  const hostSpecificFields = new Set(["workspace", "aiPeer"]);

  for (const [field, envVar] of Object.entries(ENV_SHADOW_MAP)) {
    const envVal = process.env[envVar];
    if (!envVal) continue;
    if (hasHostsBlock && hostSpecificFields.has(field)) {
      // Env var is set but hosts block takes precedence — not actually shadowed
      warnings.push(`env var ${envVar}="${envVal}" is set but ignored (hosts block takes precedence). Remove it from your shell config.`);
    } else {
      warnings.push(`${field} is shadowed by env var ${envVar}="${envVal}"`);
    }
  }

  // Check for legacy fields without hosts block
  if (cfgExists && !rawFile.hosts) {
    warnings.push("Config uses legacy flat fields. Consider running /honcho:config to migrate to hosts block.");
  }

  if (cfgExists && rawFile.hosts && rawFile.workspace && rawFile.globalOverride === undefined) {
    warnings.push("Config has flat 'workspace' alongside hosts block but no 'globalOverride' set. The flat field is unused. Set globalOverride=true to apply it globally, or remove it.");
  }

  // Pre-render the status card
  const strategyLabels: Record<string, string> = {
    "per-directory": "per directory",
    "git-branch": "per git branch",
    "chat-instance": "per chat",
  };
  const hostLabel = endpointInfo
    ? endpointInfo.type === "production"
      ? `platform (app.honcho.dev)`
      : endpointInfo.type === "local"
        ? `local (${endpointInfo.url})`
        : endpointInfo.url
    : "unknown";
  const linkedLabel = resolved?.linkedHosts?.length
    ? resolved.linkedHosts.join(", ")
    : "none";

  const card = cfg ? renderCard([
    ["workspace", cfg.workspace],
    ["session", sessionName ?? "unknown"],
    ["mapping", strategyLabels[cfg.sessionStrategy ?? "per-directory"] ?? cfg.sessionStrategy ?? "per directory"],
    ["peer", `${cfg.peerName} / ${cfg.aiPeer}`],
    ["host", hostLabel],
    ["messages", cfg.saveMessages !== false ? "saving enabled" : "saving disabled"],
    ["linked", linkedLabel],
  ], "current honcho config") : null;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ card, resolved, current, host: hostInfo, warnings, configPath: cfgPath, configExists: cfgExists }, null, 2),
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
      workspace: "Switches to a different workspace.",
      "endpoint.environment": "Switches the Honcho backend.",
      "endpoint.baseUrl": "Switches the Honcho backend URL.",
    };
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          field,
          requiresConfirm: true,
          description: descriptions[field] ?? "Pass confirm=true to proceed.",
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
      // Clear persisted session names — they embed the peer name
      cfg.sessions = {};
      cacheInvalidation = { cleared: ["peer IDs", "user context", "session overrides"], reason: "Peer name changed" };
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
      // Accept "platform" as alias for "production"
      const envVal = String(value) === "platform" ? "production" : String(value);
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
      // Clear persisted session names — they were derived under the old strategy
      cfg.sessions = {};
      break;

    case "sessionPeerPrefix":
      previousValue = cfg.sessionPeerPrefix !== false;
      cfg.sessionPeerPrefix = Boolean(value);
      // Clear persisted session names — they embed the old prefix
      cfg.sessions = {};
      break;

    case "linkedHosts": {
      previousValue = cfg.linkedHosts ?? [];
      const hosts = Array.isArray(value) ? value.map(String) : [];
      cfg.linkedHosts = hosts.length ? hosts : undefined;
      break;
    }

    case "globalOverride": {
      // Read-modify-write the raw file directly since globalOverride
      // is a file-level field, not part of the resolved HonchoCLAUDEConfig
      const goCfgPath = getConfigPath();
      let goRaw: Record<string, any> = {};
      try { goRaw = JSON.parse(readFileSync(goCfgPath, "utf-8")); } catch { /* */ }
      previousValue = goRaw.globalOverride ?? false;
      goRaw.globalOverride = Boolean(value);
      if (goRaw.globalOverride && !goRaw.workspace) {
        // When enabling, ensure flat workspace exists
        goRaw.workspace = cfg.workspace;
      }
      writeFileSync(goCfgPath, JSON.stringify(goRaw, null, 2));
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            field,
            previousValue,
            newValue: Boolean(value),
            description: Boolean(value)
              ? "Global override enabled: flat workspace field now applies to ALL hosts."
              : "Global override disabled: each host uses its own hosts block.",
            restartWarning: "Close and restart all active Claude Code sessions. Open sessions still use the previous config and will write to the wrong Honcho session.",
          }, null, 2),
        }],
      };
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

  // Warn about stale sessions when changing fields that affect session routing
  const restartWarning = SESSION_AFFECTING_FIELDS.has(field)
    ? "Close and restart all active Claude Code sessions. Open sessions still use the previous config and will write to the wrong Honcho session."
    : undefined;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        field,
        previousValue,
        newValue: value,
        cacheInvalidation,
        restartWarning,
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
                  "globalOverride",
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
    const cwd = getLastActiveCwd() || process.cwd();

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
