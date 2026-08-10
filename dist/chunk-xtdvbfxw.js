import {
  arrows,
  symbols
} from "./chunk-jr0fd6n2.js";
import {
  isLoggingEnabled
} from "./chunk-yfrrc1d5.js";

// src/visual.ts
import { homedir } from "os";
import { join } from "path";
import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "fs";
var sym = {
  left: arrows.left,
  right: arrows.right,
  check: symbols.check,
  bullet: symbols.bullet,
  cross: symbols.cross
};
var directionSymbol = {
  in: sym.left,
  out: sym.right,
  info: sym.bullet,
  ok: sym.check,
  warn: "!",
  error: sym.cross
};
function formatLine(direction, hookName, message) {
  return `[honcho] ${hookName} ${directionSymbol[direction]} ${message}`;
}
function visMessage(direction, hookName, message) {
  const line = formatLine(direction, hookName, message);
  console.log(JSON.stringify({ systemMessage: line }));
}
function visInjectionMessage(hookName, opts) {
  const count = opts.conclusions.length;
  const noun = count === 1 ? "conclusion" : "conclusions";
  const head = opts.queryLabel ? `injected ${count} ${noun} (query: ${opts.queryLabel})` : opts.matched?.length ? `injected ${count} ${noun} (matched: ${opts.matched.join(", ")})` : `injected ${count} ${noun}`;
  const summary = formatLine("in", hookName, head);
  if (!opts.showContents)
    return summary;
  const body = opts.conclusions.map((c) => `  ${sym.bullet} ${c}`).join(`
`);
  return body ? `${summary}
${body}` : summary;
}
function visDialecticMessage(hookName, reasoning, elapsedMs, answer, showContents = false) {
  const head = formatLine("in", hookName, `injected dialectic (${reasoning} · ${(elapsedMs / 1000).toFixed(1)}s)`);
  return showContents && answer.trim() ? `${head}
${answer.trim()}` : head;
}
function visSessionContextMessage(hookName, lines, tokenCount, showContents = false) {
  const noun = lines.length === 1 ? "message" : "messages";
  const head = formatLine("in", hookName, `injected ${lines.length} session ${noun} (~${tokenCount} tokens)`);
  if (!showContents)
    return head;
  const body = lines.map((l) => {
    const flat = l.replace(/\s+/g, " ").trim();
    return `  ${sym.bullet} ${flat.length > 150 ? `${flat.slice(0, 149)}…` : flat}`;
  }).join(`
`);
  return body ? `${head}
${body}` : head;
}
function visComposedInjection(hookName, labels) {
  const summary = labels.length ? `injected ${labels.join(" + ")}` : "nothing to inject";
  return formatLine("in", hookName, summary);
}
function visCapture(summary) {
  visMessage("out", "post-tool-use", `captured: ${summary}`);
}
function visSkipMessage(hookName, reason) {
  visMessage("info", hookName, `skipped (${reason})`);
}
function visStopMessage(direction, message) {
  visMessage(direction, "response", message);
}
function addSystemMessage(existingJson, message) {
  return { ...existingJson, systemMessage: message };
}
var VERBOSE_LOG = join(homedir(), ".honcho", "verbose.log");
function ensureVerboseLog() {
  const dir = join(homedir(), ".honcho");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function writeVerbose(text) {
  if (!isLoggingEnabled())
    return;
  ensureVerboseLog();
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  appendFileSync(VERBOSE_LOG, `[${timestamp}] ${text}
`);
}
function verboseApiResult(label, data) {
  if (!data)
    return;
  const separator = "─".repeat(60);
  const content = data.length > 3000 ? data.slice(0, 3000) + `
... (${data.length - 3000} more chars)` : data;
  writeVerbose(`${label}
${separator}
${content}
${separator}`);
}
function verboseList(label, items) {
  if (!items || items.length === 0)
    return;
  const formatted = items.map((item) => `  • ${item}`).join(`
`);
  writeVerbose(`${label} (${items.length} items)
${formatted}`);
}
function clearVerboseLog() {
  if (!isLoggingEnabled())
    return;
  ensureVerboseLog();
  writeFileSync(VERBOSE_LOG, "");
}
function formatVerboseBlock(label, data) {
  if (!data)
    return "";
  const separator = "─".repeat(60);
  const content = data.length > 3000 ? data.slice(0, 3000) + `
... (${data.length - 3000} more chars)` : data;
  return `
[verbose] ${label}
${separator}
${content}
${separator}`;
}
function formatVerboseList(label, items) {
  if (!items || items.length === 0)
    return "";
  const formatted = items.map((item) => `  • ${item}`).join(`
`);
  return `
[verbose] ${label} (${items.length} items)
${formatted}`;
}

export { visInjectionMessage, visDialecticMessage, visSessionContextMessage, visComposedInjection, visCapture, visSkipMessage, visStopMessage, addSystemMessage, verboseApiResult, verboseList, clearVerboseLog, formatVerboseBlock, formatVerboseList };

//# debugId=DB4203846EBE5B4E64756E2164756E21
//# sourceMappingURL=chunk-xtdvbfxw.js.map
