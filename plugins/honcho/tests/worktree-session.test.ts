import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runInSandbox } from "./sandbox";

describe("worktree session sharing (integration)", () => {
  test("worktrees share the main repo's mapping and derived name", () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-home-"));
    try {
      const main = join(home, "proj");
      const wt1 = join(home, "wt1");
      const wt2 = join(home, "wt2");
      mkdirSync(join(main, ".git", "worktrees"), { recursive: true });
      for (const wt of [wt1, wt2]) {
        mkdirSync(wt, { recursive: true });
        writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "x")}\n`);
      }
      mkdirSync(join(home, ".honcho"), { recursive: true });
      writeFileSync(
        join(home, ".honcho", "config.json"),
        JSON.stringify({ apiKey: "k", peerName: "t", sessions: { [main]: "shared-session" } })
      );

      const out = runInSandbox(
        home,
        `import { getSessionForPath, getSessionName } from "./src/config.ts";
         console.log(JSON.stringify({
           fromWorktree: getSessionForPath(${JSON.stringify(wt1)}),
           name1: getSessionName(${JSON.stringify(wt1)}),
           name2: getSessionName(${JSON.stringify(wt2)}),
           mainName: getSessionName(${JSON.stringify(main)}),
         }));`
      );
      const r = JSON.parse(out);
      // Main-root mapping is visible from the worktree path
      expect(r.fromWorktree).toBe("shared-session");
      expect(r.name1).toBe("shared-session");
      expect(r.name2).toBe("shared-session");
      expect(r.mainName).toBe("shared-session");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("without a mapping, worktrees derive the main repo's basename", () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-home-"));
    try {
      const main = join(home, "proj");
      const wt = join(home, "wt-feature");
      mkdirSync(join(main, ".git", "worktrees"), { recursive: true });
      mkdirSync(wt, { recursive: true });
      writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "x")}\n`);
      mkdirSync(join(home, ".honcho"), { recursive: true });
      writeFileSync(
        join(home, ".honcho", "config.json"),
        JSON.stringify({ apiKey: "k", peerName: "t" })
      );

      const out = runInSandbox(
        home,
        `import { getSessionName } from "./src/config.ts";
         console.log(JSON.stringify({
           wtName: getSessionName(${JSON.stringify(wt)}),
           mainName: getSessionName(${JSON.stringify(main)}),
         }));`
      );
      const r = JSON.parse(out);
      expect(r.wtName).toBe("t-proj");
      expect(r.wtName).toBe(r.mainName);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
