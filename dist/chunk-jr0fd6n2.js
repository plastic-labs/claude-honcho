import {
  isLoggingEnabled
} from "./chunk-yfrrc1d5.js";

// src/log.ts
import { homedir } from "os";
import { join } from "path";
import { existsSync, appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";

// src/unicode.ts
var blocks = {
  full: String.fromCodePoint(9608),
  upperHalf: String.fromCodePoint(9600),
  lowerHalf: String.fromCodePoint(9604),
  light: String.fromCodePoint(9617),
  medium: String.fromCodePoint(9618),
  dark: String.fromCodePoint(9619),
  lower1_8: String.fromCodePoint(9601),
  lower2_8: String.fromCodePoint(9602),
  lower3_8: String.fromCodePoint(9603),
  lower4_8: String.fromCodePoint(9604),
  lower5_8: String.fromCodePoint(9605),
  lower6_8: String.fromCodePoint(9606),
  lower7_8: String.fromCodePoint(9607)
};
var circles = {
  empty: String.fromCodePoint(9675),
  filled: String.fromCodePoint(9679),
  upperRight: String.fromCodePoint(9684),
  rightHalf: String.fromCodePoint(9681),
  lowerRight: String.fromCodePoint(9685),
  leftHalf: String.fromCodePoint(9680),
  upperHalf: String.fromCodePoint(9683),
  lowerHalf: String.fromCodePoint(9682)
};
var stars = {
  small: String.fromCodePoint(8902),
  sparkle1: String.fromCodePoint(10023),
  sparkle2: String.fromCodePoint(10022),
  sparkle3: String.fromCodePoint(8889),
  star6: String.fromCodePoint(10038),
  star4: String.fromCodePoint(10036),
  star8: String.fromCodePoint(10040)
};
var braille = {
  wave: [
    String.fromCodePoint(10494),
    String.fromCodePoint(10487),
    String.fromCodePoint(10479),
    String.fromCodePoint(10463),
    String.fromCodePoint(10367),
    String.fromCodePoint(10431),
    String.fromCodePoint(10491),
    String.fromCodePoint(10493)
  ],
  dots: [
    String.fromCodePoint(10251),
    String.fromCodePoint(10265),
    String.fromCodePoint(10297),
    String.fromCodePoint(10296),
    String.fromCodePoint(10300),
    String.fromCodePoint(10292),
    String.fromCodePoint(10278),
    String.fromCodePoint(10279),
    String.fromCodePoint(10247),
    String.fromCodePoint(10255)
  ]
};
var brackets = {
  angleLeft: String.fromCodePoint(10216),
  angleRight: String.fromCodePoint(10217)
};
var symbols = {
  check: String.fromCodePoint(10003),
  cross: String.fromCodePoint(10007),
  dot: String.fromCodePoint(183),
  bullet: String.fromCodePoint(8226),
  arrow: String.fromCodePoint(8594),
  line: String.fromCodePoint(9472),
  corner: String.fromCodePoint(9492),
  pipe: String.fromCodePoint(9474)
};
var arrows = {
  right: String.fromCodePoint(8594),
  left: String.fromCodePoint(8592),
  up: String.fromCodePoint(8593),
  down: String.fromCodePoint(8595),
  rightDouble: String.fromCodePoint(8658),
  leftDouble: String.fromCodePoint(8656),
  rightHook: String.fromCodePoint(8618),
  leftHook: String.fromCodePoint(8617)
};
var box = {
  horizontal: String.fromCodePoint(9472),
  vertical: String.fromCodePoint(9474),
  topLeft: String.fromCodePoint(9484),
  topRight: String.fromCodePoint(9488),
  bottomLeft: String.fromCodePoint(9492),
  bottomRight: String.fromCodePoint(9496),
  branchRight: String.fromCodePoint(9500),
  branchLeft: String.fromCodePoint(9508),
  branchDown: String.fromCodePoint(9516),
  branchUp: String.fromCodePoint(9524),
  cross: String.fromCodePoint(9532),
  cornerRight: String.fromCodePoint(9492)
};

// src/log.ts
var CACHE_DIR = join(homedir(), ".honcho");
var LOG_FILE = join(CACHE_DIR, "activity.log");
var MAX_LOG_SIZE = 100 * 1024;
var sym = {
  check: symbols.check,
  cross: symbols.cross,
  arrow: arrows.right,
  dot: symbols.bullet,
  circle: symbols.dot,
  branch: box.branchRight,
  corner: box.cornerRight,
  pipe: box.vertical,
  top: box.topRight,
  line: box.horizontal
};
function ensureLogDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}
var currentCwd = null;
var currentSession = null;
function setLogContext(cwd, session) {
  currentCwd = cwd;
  currentSession = session || null;
}
function logActivity(level, source, message, data, options) {
  if (!isLoggingEnabled())
    return;
  ensureLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    data,
    timing: options?.timing,
    success: options?.success,
    depth: options?.depth ?? 0,
    cwd: options?.cwd || currentCwd || undefined,
    session: options?.session || currentSession || undefined
  };
  try {
    if (existsSync(LOG_FILE)) {
      const stats = statSync(LOG_FILE).size;
      if (stats > MAX_LOG_SIZE) {
        const content = readFileSync(LOG_FILE, "utf-8");
        const truncated = content.slice(-50 * 1024);
        writeFileSync(LOG_FILE, truncated);
      }
    }
    appendFileSync(LOG_FILE, JSON.stringify(entry) + `
`);
  } catch {}
}
function logHook(hookName, message, data) {
  logActivity("hook", hookName, message, data);
}
function logApiCall(endpoint, method, details, timing, success) {
  const msg = `${method} ${endpoint}${details ? ` ${sym.arrow} ${details}` : ""}`;
  logActivity("api", "honcho", msg, undefined, { timing, success });
}
function logFlow(stage, message, data) {
  logActivity("flow", stage, message, data);
}
function logAsync(operation, message, results) {
  logActivity("async", operation, message, results ? { results } : undefined);
}

export { blocks, circles, stars, braille, brackets, symbols, arrows, setLogContext, logHook, logApiCall, logFlow, logAsync };

//# debugId=ACAEB76FCF128E0164756E2164756E21
//# sourceMappingURL=chunk-jr0fd6n2.js.map
