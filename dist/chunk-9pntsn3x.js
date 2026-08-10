// src/state.ts
import { homedir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";
var DIR = join(homedir(), ".honcho");
function stateFile(sessionId) {
  return join(DIR, sessionId ? `state-${sessionId}.json` : "state.json");
}
function sessionFile(sessionId) {
  return join(DIR, sessionId ? `session-${sessionId}.json` : "session.json");
}
function setMemoryState(phase, detail, sessionId) {
  try {
    writeFileSync(stateFile(sessionId), JSON.stringify({ phase, since: Date.now(), detail }));
  } catch {}
}
function setSessionLink(url, name, sessionId) {
  try {
    writeFileSync(sessionFile(sessionId), JSON.stringify({ url, name }));
  } catch {}
}
function clearSessionFiles(sessionId) {
  if (!sessionId)
    return;
  for (const f of [stateFile(sessionId), sessionFile(sessionId)]) {
    try {
      unlinkSync(f);
    } catch {}
  }
}

export { setMemoryState, setSessionLink, clearSessionFiles };

//# debugId=CF0B8025EA4748F964756E2164756E21
//# sourceMappingURL=chunk-9pntsn3x.js.map
