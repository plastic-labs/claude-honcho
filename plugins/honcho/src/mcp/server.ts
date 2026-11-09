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
  setDetectedHost,
  type HonchoCLAUDEConfig,
  getPluginVersion,
  refreshCredential,
} from "../config.js";
import { setClientApiKey } from "../honcho-client.js";
import { honchoSessionUrl } from "../styles.js";

// ============================================
// Environment variable names that can shadow config fields
// ============================================

const ENV_SHADOW_MAP: Record<string, string> = {
  peerName: "HONCHO_PEER_NAME",
  workspace: "HONCHO_WORKSPACE",
  aiPeer: "HONCHO_AI_PEER",
  baseUrl: "HONCHO_ENDPOINT",
};

// Fields that require confirm=true to change
const DANGEROUS_FIELDS = new Set(["workspace", "baseUrl"]);

// Fields that affect session identity/routing — stale sessions risk cross-contamination
const SESSION_AFFECTING_FIELDS = new Set([
  "workspace", "aiPeer", "peerName",
  "baseUrl",
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

function handleGetConfig() {
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
  const resolved = cfg ? {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: getEndpointInfo(cfg),
  } : null;

  // Current status header values
  const sessionName = cfg ? getSessionName() : null;
  const endpointInfo = cfg ? getEndpointInfo(cfg) : null;
  const endpointLabel = endpointInfo
    ? endpointInfo.type === "production" ? "platform" : endpointInfo.type
    : null;

  const sessionUrl = cfg && sessionName ? honchoSessionUrl(cfg, sessionName) : null;

  const current = cfg ? {
    workspace: cfg.workspace,
    session: sessionName,
    sessionUrl,
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

  // HONCHO_API_KEY is omitted from ENV_SHADOW_MAP and handled specially: an API
  // key selects the Honcho *environment*, so when the env var overrides the
  // configured key (resolveConfig: env wins, matching standard env>config
  // precedence) every read and write silently routes to a different environment
  // than config.json names. That's far more surprising than a normal override,
  // so surface it whenever the env var is set — loudly on a mismatch.
  const envApiKey = process.env.HONCHO_API_KEY;
  if (envApiKey && rawFile.apiKey) {
    const mask = (k: string) => `${k.slice(0, 10)}…${k.slice(-4)}`;
    if (envApiKey !== rawFile.apiKey) {
      warnings.push(
        `HONCHO_API_KEY env var (${mask(envApiKey)}) overrides config.json apiKey (${mask(rawFile.apiKey)}) and is the key actually in use. ` +
        `An API key selects the Honcho environment, so reads/writes go to the env var's environment, NOT the one config.json names. ` +
        `Unset HONCHO_API_KEY in your shell to use config.json's key.`
      );
    } else {
      warnings.push(`apiKey is also set via HONCHO_API_KEY env var (identical value). The env var takes precedence at runtime.`);
    }
  }

  // Check for legacy fields without hosts block
  if (cfgExists && !rawFile.hosts) {
    warnings.push("Config uses legacy flat fields. Any /honcho set or set_config rewrites it into the hosts block.");
  }

  if (cfg?.legacyWorkspace) {
    warnings.push(`globalOverride is no longer supported, so this chat uses workspace "${cfg.workspace}", not "${cfg.legacyWorkspace}". Run \`honcho doctor\` with the Honcho CLI, or set workspace to "${cfg.legacyWorkspace}", to keep using it.`);
  }

  // Pre-render the status card
  const hostLabel = endpointInfo
    ? endpointInfo.type === "production"
      ? `platform (app.honcho.dev)`
      : endpointInfo.url
    : "unknown";

  const card = cfg ? renderCard([
    ["workspace", cfg.workspace],

    ["session", sessionName ?? "unknown"],
    ["peer", `${cfg.peerName} / ${cfg.aiPeer}`],
    ["host", hostLabel],
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
  const field = args.field;
  if (typeof field !== "string" || !field) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: "field must be a non-empty string" }, null, 2) }],
      isError: true,
    };
  }
  const value = args.value;
  const confirm = args.confirm === true;

  // Dangerous field gate
  if (DANGEROUS_FIELDS.has(field) && !confirm) {
    const descriptions: Record<string, string> = {
      workspace: "Switches to a different workspace.",
      baseUrl: "Switches the Honcho backend URL.",
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
      break;

    case "aiPeer":
      previousValue = cfg.aiPeer;
      cfg.aiPeer = String(value);
      break;

    case "workspace":
      previousValue = cfg.workspace;
      cfg.workspace = String(value);
      break;

    case "baseUrl":
      previousValue = cfg.baseUrl;
      cfg.baseUrl = String(value);
      break;

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
  const resolved = {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: endpointInfo,
  };

  // Warn about stale sessions when changing fields that affect session routing
  const restartWarning = SESSION_AFFECTING_FIELDS.has(field)
    ? "Close and restart all active Claude Code sessions. Open sessions still use the previous config and will write to the wrong Honcho session."
    : undefined;

  // Include session URL when session-affecting fields change
  const newSessionName = SESSION_AFFECTING_FIELDS.has(field) ? getSessionName() : undefined;
  const sessionUrl = newSessionName ? honchoSessionUrl(cfg, newSessionName) ?? undefined : undefined;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        field,
        previousValue,
        newValue: value,
        restartWarning,
        sessionUrl,
        warnings: warnings.length ? warnings : undefined,
        resolved,
      }, null, 2),
    }],
  };
}

/** Client-side ceiling for dialectic chat calls. */
const DIALECTIC_TIMEOUT_MS = 120_000;

/** Conclusion reads skip explicit conclusions (facts restated from messages)
 *  and return only what Honcho derived: deductive, inductive, contradiction. */
// `in`, not `ne`: the conclusion query endpoint 500s on `ne`.
const DERIVED_ONLY = { level: { in: ["deductive", "inductive", "contradiction"] } };

/** The chat tools' `scope` argument: one name or several, blanks dropped. */
function parseScope(value: unknown): string | string[] | undefined {
  const names = (Array.isArray(value) ? value : [value])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  if (names.length === 0) return undefined;
  return names.length === 1 ? names[0] : names;
}

const NOT_CONFIGURED_RESULT = {
  content: [{ type: "text", text: "Honcho isn't configured; run /honcho setup to connect it, then try again." }],
  isError: true,
};

interface HonchoClients {
  config: HonchoCLAUDEConfig;
  honcho: Honcho;
  honchoDialectic: Honcho;
}

/** Build the Honcho clients from the current config, or null when no API key is configured. */
function createClients(): HonchoClients | null {
  const config = loadConfig();
  if (!config) return null;
  return {
    config,
    honcho: new Honcho(getHonchoClientOptions(config)),
    // Dedicated client for dialectic queries, which run far past the shared
    // 8s timeout (≈80s at max reasoning). No retries: the chat case enforces
    // one DIALECTIC_TIMEOUT_MS deadline across the whole flow.
    honchoDialectic: new Honcho({
      ...getHonchoClientOptions(config),
      timeout: DIALECTIC_TIMEOUT_MS,
      maxRetries: 0,
    }),
  };
}

export async function runMcpServer(): Promise<void> {
  setDetectedHost("claude_code");
  // Without a key the server still starts; every tool answers with setup
  // instructions until a config appears, then the clients are built on first use.
  let clients = createClients();
  if (!clients) {
    console.error("[honcho-mcp] Not configured. Run /honcho setup");
  }

  const server = new Server(
    {
      name: "honcho",
      version: getPluginVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search",
          description: "Semantic search across messages and derived conclusions. Messages default to the current session; use scope='workspace' to search across all sessions. Conclusions are always searched workspace-wide.",
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
              scope: {
                type: "string",
                enum: ["session", "workspace"],
                description: "Search scope. 'session' searches only the current directory's session (default). 'workspace' searches across all sessions.",
                default: "session",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "chat",
          description:
            "Ask Honcho a question and get a reasoned answer from memory. By default it answers about the user from everything Honcho knows about them. " +
            "Pass `scope` to answer only from the sessions in one or more scopes (each Claude Code chat is in a scope for its git repository and one for its machine). " +
            "Pass `workspace: true` to ask about the whole workspace — every peer, not just the user.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Natural language question",
              },
              scope: {
                anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                description: "Scope name, or several, to limit the answer to (e.g. a repository or machine name).",
              },
              workspace: {
                type: "boolean",
                description: "Ask across the whole workspace instead of about the user. Combine with `scope` to limit it.",
                default: false,
              },
              reasoning_level: {
                type: "string",
                enum: ["minimal", "low", "medium", "high", "max"],
                description: "Reasoning budget for this query. Use 'low' for simple lookups, 'medium' for general questions, 'high'/'max' for complex reasoning. Defaults to 'medium'.",
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
          name: "list_conclusions",
          description: "List conclusions Honcho has derived about the user (explicit conclusions are excluded). Use this to review what is remembered before creating duplicates, or to find IDs for deletion.",
          inputSchema: {
            type: "object",
            properties: {
              page: {
                type: "number",
                description: "Page number (1-indexed)",
                default: 1,
              },
              size: {
                type: "number",
                description: "Results per page (max 50)",
                default: 20,
              },
            },
          },
        },
        {
          name: "query_conclusions",
          description: "Semantically search conclusions Honcho has derived about the user (explicit conclusions are excluded). Returns IDs usable with delete_conclusion — much faster than paging list_conclusions when looking for something specific.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              top_k: {
                type: "number",
                description: "Max results (default 10)",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "delete_conclusion",
          description: "Delete a conclusion from Honcho's memory by ID. Use query_conclusions or list_conclusions to find the ID first.",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The conclusion ID to delete",
              },
            },
            required: ["id"],
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
          description: "Update a Honcho plugin configuration field. Dangerous changes (workspace, baseUrl) require confirm=true.",
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
                  "baseUrl",
                ],
              },
              value: {
                description: "New value.",
              },
              confirm: {
                type: "boolean",
                description: "Required true for dangerous changes (workspace, baseUrl). Without it, returns a warning instead of applying.",
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

    clients ??= createClients();
    if (!clients) {
      return NOT_CONFIGURED_RESULT;
    }
    const { config, honcho, honchoDialectic } = clients;
    // A hook may have refreshed the OAuth grant since the last call, which
    // supersedes our token; re-read it and swap it in place on both clients.
    await refreshCredential(config);
    setClientApiKey(honcho, config.apiKey);
    setClientApiKey(honchoDialectic, config.apiKey);

    // ── Config tools (no Honcho session needed) ──

    if (name === "get_config") {
      return handleGetConfig();
    }

    if (name === "set_config") {
      return handleSetConfig(args as Record<string, unknown>);
    }

    // ── Peer-only tools (no session needed) ──

    if (name === "list_conclusions" || name === "delete_conclusion" || name === "query_conclusions") {
      try {
        const userPeer = await honcho.peer(config.peerName);
        const conclusionScope = userPeer.conclusionsOf(config.peerName);

        if (name === "list_conclusions") {
          const page = (args?.page as number) ?? 1;
          const size = Math.min((args?.size as number) ?? 20, 100);
          const result = await conclusionScope.list({ page, size, filters: DERIVED_ONLY });
          const items = result.items.map((c: any) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
          }));
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ items, total: result.total, page: result.page, pages: result.pages }, null, 2),
            }],
          };
        }

        if (name === "query_conclusions") {
          const query = args?.query as string;
          const topK = Math.min((args?.top_k as number) ?? 10, 50);
          const conclusions = await conclusionScope.query(query, topK, undefined, DERIVED_ONLY);
          const items = conclusions.map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
          }));
          return {
            content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
          };
        }

        // delete_conclusion
        const id = args?.id as string;
        await conclusionScope.delete(id);
        return {
          content: [{ type: "text", text: `Deleted conclusion ${id}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }

    // ── Honcho session tools ──

    // Only create_conclusion and a session-scoped search need this chat's session.
    const sessionName = getSessionName();
    const needsSession = name === "create_conclusion" || (name === "search" && ((args?.scope as string) ?? "session") === "session");
    if (!sessionName && needsSession) {
      return {
        content: [{ type: "text", text: "Error: no Claude Code session id available" }],
        isError: true,
      };
    }

    try {
      const session = needsSession && sessionName ? await honcho.session(sessionName) : undefined;
      // Recall reads the user's own view of themselves.
      const userPeer = await honcho.peer(config.peerName);
      const scope = parseScope(args?.scope);

      switch (name) {
        case "search": {
          const query = args?.query as string;
          const limit = (args?.limit as number) ?? 10;
          const scope = (args?.scope as string) ?? "session";
          const [messages, conclusions] = await Promise.all([
            scope === "workspace"
              ? honcho.search(query, { limit })
              : session!.search(query, { limit }),
            userPeer.conclusionsOf(config.peerName).query(query, limit, undefined, DERIVED_ONLY).catch(() => []),
          ]);

          const results = {
            messages: messages.map((msg: any) => ({
              content: msg.content,
              peerId: msg.peer,
              createdAt: msg.createdAt || msg.created_at,
            })),
            conclusions: conclusions.map((c) => ({
              id: c.id,
              content: c.content,
              createdAt: c.createdAt,
            })),
          };

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
          const reasoningLevel = (args?.reasoning_level as string) ?? "medium";

          // Single deadline for the whole flow (peer resolve + chat), so
          // sequential requests can't stack past the harness's 150s budget
          let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
          const deadline = new Promise<never>((_, reject) => {
            deadlineTimer = setTimeout(
              () => reject(new Error(`Dialectic call exceeded ${DIALECTIC_TIMEOUT_MS}ms`)),
              DIALECTIC_TIMEOUT_MS
            );
          });

          const chatFlow = (async () => {
            if (args?.workspace === true) {
              return honchoDialectic.chat(query, {
                ...(scope ? { scope } : {}),
                reasoningLevel: reasoningLevel as "minimal" | "low" | "medium" | "high" | "max",
              });
            }
            const dialecticPeer = await honchoDialectic.peer(userPeer.id);
            return dialecticPeer.chat(query, {
              ...(scope ? { scope } : {}),
              reasoningLevel,
            });
          })();

          try {
            const response = await Promise.race([chatFlow, deadline]);
            return {
              content: [
                {
                  type: "text",
                  text: response ?? "No response from Honcho",
                },
              ],
            };
          } finally {
            clearTimeout(deadlineTimer);
            chatFlow.catch(() => {});
          }
        }

        case "create_conclusion": {
          const content = args?.content as string;

          const conclusions = await userPeer.conclusionsOf(config.peerName).create({
            content,
            sessionId: session!.id,
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
