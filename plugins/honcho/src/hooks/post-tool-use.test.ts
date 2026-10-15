import { expect, test } from "bun:test";
import { isTrivialCommand } from "./post-tool-use.js";

test("plain trivial commands are still filtered", () => {
  for (const cmd of ["ls -a", "pwd", "cd /tmp", "git status --short", "git log --oneline -3"]) {
    expect(isTrivialCommand(cmd)).toBe(true);
  }
});

test("a wrapper in front does not smuggle a trivial command through", () => {
  for (const cmd of ["rtk ls -a", "rtk git status --short", "sudo cat /etc/hosts", "time ls"]) {
    expect(isTrivialCommand(cmd)).toBe(true);
  }
});

test("real work is still logged", () => {
  for (const cmd of ["npm run build", "rtk git commit -m x", "docker compose up -d", "pytest -q"]) {
    expect(isTrivialCommand(cmd)).toBe(false);
  }
});

test("a command that merely starts with a trivial one is not filtered", () => {
  // The old startsWith check swallowed all of these as cd / cat / type / ls.
  for (const cmd of ["cdk deploy", "catalog-build --all", "typescript-bundle", "lsof -i :3000"]) {
    expect(isTrivialCommand(cmd)).toBe(false);
  }
});

test("a bare wrapper is not mistaken for its argument", () => {
  expect(isTrivialCommand("rtk")).toBe(false);
  expect(isTrivialCommand("")).toBe(false);
});
