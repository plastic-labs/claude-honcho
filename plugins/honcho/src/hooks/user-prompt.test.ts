import { expect, test } from "bun:test";
import { extractTopics } from "./user-prompt.js";

const query = (prompt: string) => extractTopics(prompt).join(" ");

test("a prompt in a non-Latin script yields a query instead of nothing", () => {
  // Persian: "check whether Honcho is writing memory properly"
  expect(query("بررسی کن ببین هونچو داره حافظه رو درست مینویسه یا نه")).toBe(
    "بررسی کن ببین هونچو داره حافظه رو درست مینویسه یا نه",
  );
  // Japanese, Russian — same path.
  expect(query("認証フローのバグを修正して")).not.toBe("");
  expect(query("почини баг в авторизации")).not.toBe("");
});

test("a mixed-script prompt keeps the whole question, not just the Latin crumbs", () => {
  // Persian for "review branch X and push it if it's complete". The old word
  // fallback returned ["production"], which searches for the wrong thing.
  const prompt = "برنچ production رو ریویو کن و اگه کامل بود پوش کن";
  expect(query(prompt)).toBe(prompt);
});

test("high-signal extractors still win over the whole-prompt fallback", () => {
  // Persian for "open the file src/config.ts".
  expect(extractTopics("فایل src/config.ts رو باز کن")).toEqual(["src/config.ts"]);
});

test("Latin-script prompts are unaffected", () => {
  expect(extractTopics("why does the docker build fail for the api?")).toEqual([
    "docker",
    "api",
  ]);
  expect(extractTopics("rename the widget helper to something clearer")).toEqual([
    "rename",
    "widget",
    "helper",
    "something",
    "clearer",
  ]);
  // Punctuation and emoji are not letters, so they don't trip the script check.
  expect(extractTopics("ship it 🚀 — the caching layer is done")).toEqual([
    "ship",
    "caching",
    "layer",
    "done",
  ]);
});

test("a long pasted prompt is capped rather than embedded whole", () => {
  const prompt = "خطا: " + "x".repeat(2000);
  expect(query(prompt).length).toBe(500);
});
