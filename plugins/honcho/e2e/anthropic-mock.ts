import { appendFileSync } from "fs";

// A scripted stand-in for the Anthropic Messages API, so a harness can be
// driven deterministically and for free. It speaks what a client needs for a
// conversation: POST /v1/messages (SSE when `stream` is set, JSON otherwise)
// with text and tool_use blocks, and POST /v1/messages/count_tokens. What to
// answer is decided by the caller's `respond`; every request, and anything the
// mock does not recognise, is logged so a gap shows up as a log line rather
// than a hang.

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> };

export interface MockRequest {
  method: string;
  path: string;
  body: any;
}

export interface MockLogEntry {
  method: string;
  path: string;
  /** What `respond` decided, or why the request was not answered normally. */
  note: string;
}

export interface AnthropicMock {
  url: string;
  requests: MockLogEntry[];
  stop(): void;
}

let ids = 0;
const nextId = (prefix: string) => `${prefix}_mock_${(++ids).toString().padStart(6, "0")}`;

function sse(model: string, blocks: Block[]): string {
  const events: Array<[string, unknown]> = [];
  events.push(["message_start", {
    type: "message_start",
    message: {
      id: nextId("msg"), type: "message", role: "assistant", model, content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 },
    },
  }]);
  blocks.forEach((block, index) => {
    if (block.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]);
    } else {
      events.push(["content_block_start", {
        type: "content_block_start", index,
        content_block: { type: "tool_use", id: nextId("toolu"), name: block.name, input: {} },
      }]);
      events.push(["content_block_delta", {
        type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
      }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  const stopReason = blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function json(model: string, blocks: Block[]): unknown {
  return {
    id: nextId("msg"), type: "message", role: "assistant", model,
    content: blocks.map((b) => (b.type === "text" ? b : { ...b, id: nextId("toolu") })),
    stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

/**
 * Start the mock on a free localhost port. `respond` receives each
 * /v1/messages body and returns the assistant's content blocks plus a short
 * note for the log.
 */
export function startAnthropicMock(
  respond: (body: any) => { blocks: Block[]; note: string },
  logFile: string,
): AnthropicMock {
  const requests: MockLogEntry[] = [];
  const record = (entry: MockLogEntry, body?: unknown) => {
    requests.push(entry);
    appendFileSync(logFile, JSON.stringify({ ...entry, body }) + "\n");
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      let body: any = undefined;
      try {
        body = req.method === "POST" ? await req.json() : undefined;
      } catch {
        // Non-JSON bodies are logged as undefined.
      }

      // Connectivity probe Claude Code sends before its first request.
      if (path === "/api/hello") {
        record({ method: req.method, path, note: "hello" });
        return new Response(null, { status: 200 });
      }
      if (req.method === "POST" && path === "/v1/messages/count_tokens") {
        record({ method: req.method, path, note: "count_tokens" });
        return Response.json({ input_tokens: 100 });
      }
      if (req.method === "POST" && path === "/v1/messages") {
        const { blocks, note } = respond(body);
        record({ method: req.method, path, note }, body);
        const model = String(body?.model ?? "mock");
        if (body?.stream) {
          return new Response(sse(model, blocks), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
        }
        return Response.json(json(model, blocks));
      }

      record({ method: req.method, path, note: "unrecognized" }, body);
      return Response.json({ type: "error", error: { type: "not_found_error", message: `mock: no route for ${req.method} ${path}` } }, { status: 404 });
    },
  });

  return { url: `http://127.0.0.1:${server.port}`, requests, stop: () => server.stop(true) };
}
