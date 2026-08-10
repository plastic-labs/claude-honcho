// src/skills/transcript-parse.ts
import { existsSync, readFileSync } from "fs";
function entryType(entry) {
  return entry.type || entry.role;
}
function isRealUserPrompt(entry) {
  if (entry.isMeta)
    return false;
  const mc = entry.message?.content ?? entry.content;
  const text = typeof mc === "string" ? mc : Array.isArray(mc) ? mc.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("") : "";
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}
function userText(entry) {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string")
    return mc;
  if (Array.isArray(mc))
    return mc.filter((p) => p.type === "text").map((p) => p.text || "").join(`
`);
  return "";
}
function assistantText(entry) {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string")
    return mc;
  if (Array.isArray(mc))
    return mc.filter((p) => p.type === "text" && p.text).map((p) => p.text).join(`

`);
  return "";
}
function readLines(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath))
    return [];
  try {
    return readFileSync(transcriptPath, "utf-8").split(`
`).filter((line) => line.trim());
  } catch {
    return [];
  }
}
function parseTranscriptForBackfill(transcriptPath) {
  const messages = [];
  let cwd;
  let gitBranch;
  let sessionId;
  for (const line of readLines(transcriptPath)) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.cwd)
      cwd = entry.cwd;
    if (entry.gitBranch)
      gitBranch = entry.gitBranch;
    if (entry.sessionId)
      sessionId = entry.sessionId;
    if (entry.isMeta || entry.isSidechain)
      continue;
    const type = entryType(entry);
    if (type === "user") {
      if (!isRealUserPrompt(entry))
        continue;
      const content = userText(entry).trim();
      if (content) {
        messages.push({ role: "user", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    } else if (type === "assistant") {
      const content = assistantText(entry).trim();
      if (content) {
        messages.push({ role: "assistant", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    }
  }
  for (let i = 0;i < messages.length; i++) {
    if (messages[i].role !== "assistant")
      continue;
    const next = messages[i + 1];
    messages[i].isResponse = !next || next.role === "user";
  }
  return { messages, cwd, gitBranch, sessionId };
}

export { parseTranscriptForBackfill };

//# debugId=4AE5CBBB15B1907564756E2164756E21
//# sourceMappingURL=chunk-jgtvcc65.js.map
