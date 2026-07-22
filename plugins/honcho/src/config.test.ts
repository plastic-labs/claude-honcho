import { expect, test } from "bun:test";
import { resolveSessionPath } from "./config.js";

const sessions = {
  "/Users/me": "home",
  "/Users/me/work": "work",
  "/Users/me/work/api": "api",
};

test("an exact declared path still wins", () => {
  expect(resolveSessionPath(sessions, "/Users/me/work")).toBe("work");
  expect(resolveSessionPath(sessions, "/Users/me/work/api")).toBe("api");
});

test("a subdirectory resolves to its declared root", () => {
  expect(resolveSessionPath(sessions, "/Users/me/work/src/modules")).toBe("work");
  expect(resolveSessionPath(sessions, "/Users/me/work/api/src")).toBe("api");
});

test("the nearest declared root wins, not the first or the shortest", () => {
  expect(resolveSessionPath(sessions, "/Users/me/work/api/tests/unit")).toBe("api");
});

test("a sibling that merely shares a name prefix is not a parent", () => {
  // "/Users/me/work" must not claim "/Users/me/workspace".
  expect(resolveSessionPath(sessions, "/Users/me/workspace")).toBe("home");
});

test("a path outside every declared root is unmapped", () => {
  expect(resolveSessionPath({ "/Users/me/work": "work" }, "/tmp/scratch")).toBeNull();
  expect(resolveSessionPath({}, "/Users/me/work/src")).toBeNull();
});

test("a declared root with a trailing slash behaves the same", () => {
  expect(resolveSessionPath({ "/Users/me/work/": "work" }, "/Users/me/work/src")).toBe("work");
});
