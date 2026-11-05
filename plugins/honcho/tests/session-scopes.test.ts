import { describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { hostname, tmpdir } from "os";
import { join } from "path";
import { getRepoName, getSessionScopes } from "../src/git";

describe("session scopes", () => {
  test("repo name is shared by the main checkout, its subdirectories and linked worktrees", () => {
    const root = mkdtempSync(join(tmpdir(), "honcho-scopes-"));
    try {
      const main = join(root, "My.Repo");
      mkdirSync(join(main, "src"), { recursive: true });
      const git = (args: string) => execSync(`git ${args}`, { cwd: main, stdio: "pipe" });
      git("init -q");
      git("-c user.email=t@t -c user.name=t commit -q --allow-empty -m init");
      git(`worktree add -q ${join(root, "wt-feature")}`);

      expect(getRepoName(main)).toBe("My.Repo");
      expect(getRepoName(join(main, "src"))).toBe("My.Repo");
      expect(getRepoName(join(root, "wt-feature"))).toBe("My.Repo");
      expect(getSessionScopes(join(root, "wt-feature"))[0]).toBe("my-repo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("falls back to the directory name outside git, including missing directories", () => {
    const root = mkdtempSync(join(tmpdir(), "honcho-scopes-"));
    try {
      const plain = join(root, "notes");
      mkdirSync(plain);
      expect(getRepoName(plain)).toBe("notes");
      expect(getRepoName(join(root, "gone"))).toBe("gone");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("second scope is the short machine hostname", () => {
    const host = hostname().split(".")[0].toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    expect(getSessionScopes(tmpdir())).toContain(host);
  });
});
