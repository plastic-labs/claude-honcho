import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// state.ts resolves ~/.honcho through a module-level homedir() const, so the
// tally runs in a child process with HOME pointed at a throwaway directory.
function runInSandbox(home: string, script: string): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("HONCHO_"))
  ) as Record<string, string>;
  const proc = Bun.spawnSync(["bun", "-e", script], {
    env: { ...env, HOME: home },
    cwd: join(import.meta.dir, ".."),
  });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return proc.stdout.toString().trim();
}

// Same sandbox, but the writers run at once: the tally has no lock, so a
// read-modify-write implementation loses increments here.
async function runParallel(home: string, scripts: string[]): Promise<void> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("HONCHO_"))
  ) as Record<string, string>;
  const procs = scripts.map((script) =>
    Bun.spawn(["bun", "-e", script], {
      env: { ...env, HOME: home },
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })
  );
  const codes = await Promise.all(procs.map((p) => p.exited));
  const bad = codes.findIndex((c) => c !== 0);
  if (bad !== -1) throw new Error(await new Response(procs[bad].stderr).text());
}

describe("message save tally", () => {
  test("counts user and assistant saves separately and clears them", () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-tally-"));
    try {
      const out = runInSandbox(
        home,
        `const s = await import("./src/state.ts");
         s.recordMessageSave("user", 1, "sess-a");
         s.recordMessageSave("assistant", 3, "sess-a");
         s.recordMessageSave("user", 1, "sess-a");
         s.recordMessageSave("user", 5, "sess-b");
         const a = s.getMessageSaveTally("sess-a");
         const b = s.getMessageSaveTally("sess-b");
         s.clearSessionFiles("sess-a");
         console.log(JSON.stringify({ a, b, after: s.getMessageSaveTally("sess-a") }));`
      );
      const { a, b, after } = JSON.parse(out);
      // A failed UserPromptSubmit must stay visible behind a successful Stop.
      expect(a).toEqual({ user: 2, assistant: 3 });
      // Windows do not bleed into each other.
      expect(b).toEqual({ user: 5, assistant: 0 });
      expect(after).toEqual({ user: 0, assistant: 0 });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("keeps no tally without a session_id, so none can go stale", () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-tally-"));
    try {
      const out = runInSandbox(
        home,
        `const s = await import("./src/state.ts");
         s.recordMessageSave("user", 1);
         console.log(JSON.stringify(s.getMessageSaveTally()));`
      );
      expect(JSON.parse(out)).toEqual({ user: 0, assistant: 0 });
      const dir = join(home, ".honcho");
      const files = existsSync(dir) ? readdirSync(dir) : [];
      expect(files.filter((f) => f.startsWith("saves"))).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  test("survives concurrent writers from separate hook processes", async () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-tally-"));
    try {
      // Three writers per role, 20 saves each: Stop can still be posting a
      // batch when the next UserPromptSubmit fires, and neither may clobber
      // the other's count.
      const writer = (role: string) =>
        `const s = await import("./src/state.ts");
         for (let i = 0; i < 20; i++) s.recordMessageSave("${role}", 1, "sess-race");`;
      await runParallel(home, [
        ...Array(3).fill(writer("user")),
        ...Array(3).fill(writer("assistant")),
      ]);
      const out = runInSandbox(
        home,
        `const s = await import("./src/state.ts");
         console.log(JSON.stringify(s.getMessageSaveTally("sess-race")));`
      );
      expect(JSON.parse(out)).toEqual({ user: 60, assistant: 60 });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
