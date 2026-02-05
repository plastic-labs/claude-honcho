import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getHonchoClientOptions, getSessionForPath } from "../config.js";
import { basename } from "path";

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

export async function runMcpServer(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("[honcho-mcp] Not configured. Run: honcho init");
    process.exit(1);
  }

  const server = new Server(
    {
      name: "honcho",
      version: "0.1.2",
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
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const cwd = process.cwd();
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
