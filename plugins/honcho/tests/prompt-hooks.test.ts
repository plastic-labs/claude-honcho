import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { injectedPrompts, userPrompts } from "./harness-fixtures";

describe("UserPromptSubmit hooks", () => {
  test("save only genuine user text, and recall nothing per turn", async () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-prompt-hooks-"));
    const uploads: Array<{ peer_id: string; content: string }> = [];
    const searches: string[] = [];
    const requests: string[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        requests.push(url.pathname);
        if (url.pathname.endsWith("/messages")) {
          const body = await req.json() as { messages: Array<{ peer_id: string; content: string }> };
          uploads.push(...body.messages);
          return Response.json(body.messages.map((m, i) => ({ ...m, id: `m${i}`, session_id: "project", workspace_id: "test" })));
        }
        if (url.pathname.endsWith("/context")) {
          searches.push(url.searchParams.get("search_query") ?? "");
          return Response.json({ representation: {}, peer_card: [] });
        }
        return Response.json({ id: "test", metadata: {}, configuration: {} });
      },
    });
    try {
      mkdirSync(join(home, ".honcho"));
      writeFileSync(join(home, ".honcho/config.json"), JSON.stringify({
        apiKey: "test-only",
        peerName: "human",
        workspace: "test",
        endpoint: { baseUrl: `http://127.0.0.1:${server.port}` },
      }));
      const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("HONCHO_") && !key.startsWith("CLAUDE_")));
      const invoke = async (hook: string, prompt: string) => {
        const proc = Bun.spawn([process.execPath, `hooks/${hook}.ts`], {
          cwd: join(import.meta.dir, ".."),
          env: { ...base, HOME: home },
          stdin: new Blob([JSON.stringify({ prompt, cwd: join(home, "project"), session_id: "fixture" })]),
          stdout: "pipe",
          stderr: "pipe",
        });
        const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text(), new Response(proc.stdout).text()]);
        expect(stderr).toBe("");
        expect(code).toBe(0);
      };
      for (const hook of ["save-user-message", "user-prompt"]) {
        for (const prompt of injectedPrompts) await invoke(hook, prompt);
      }
      expect(requests).toEqual([]);
      for (const { prompt } of userPrompts) {
        await invoke("save-user-message", prompt);
        await invoke("user-prompt", prompt);
      }
      expect(uploads).toHaveLength(userPrompts.length);
      expect(uploads.map((m) => m.peer_id)).toEqual(userPrompts.map(() => "human"));
      expect(uploads.map((m) => m.content)).toEqual(userPrompts.map((p) => p.text));
      // Nothing is recalled per turn: no context() or chat() calls.
      expect(searches).toEqual([]);
      expect(requests.filter((p) => p.endsWith("/chat"))).toEqual([]);
    } finally {
      server.stop(true);
      rmSync(home, { recursive: true, force: true });
    }
  }, 30000);
});
