import {
  blocks,
  brackets,
  braille,
  circles,
  stars
} from "./chunk-jr0fd6n2.js";

// src/spinner.ts
import { openSync, writeSync, closeSync } from "fs";
var c = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  c1: "\x1B[38;5;208m",
  c2: "\x1B[38;5;214m",
  c3: "\x1B[38;5;215m",
  c4: "\x1B[38;5;223m",
  c5: "\x1B[38;5;195m",
  c6: "\x1B[38;5;159m",
  c7: "\x1B[38;5;117m",
  c8: "\x1B[38;5;81m",
  c9: "\x1B[38;5;216m",
  c10: "\x1B[38;5;153m",
  green: "\x1B[38;5;114m",
  red: "\x1B[38;5;203m",
  cyan: "\x1B[38;5;87m",
  yellow: "\x1B[38;5;221m"
};
var waveChars = [
  blocks.lower1_8,
  blocks.lower2_8,
  blocks.lower3_8,
  blocks.lower4_8,
  blocks.lower5_8,
  blocks.lower6_8,
  blocks.lower7_8,
  blocks.full,
  blocks.lower7_8,
  blocks.lower6_8,
  blocks.lower5_8,
  blocks.lower4_8,
  blocks.lower3_8,
  blocks.lower2_8
];
var brailleWave = braille.wave;
var bounceDots = braille.dots;
var moonPhases = [
  circles.empty,
  circles.upperRight,
  circles.rightHalf,
  circles.lowerRight,
  circles.filled,
  circles.lowerRight,
  circles.rightHalf,
  circles.upperRight
];
var sparkles = [
  stars.small,
  stars.sparkle1,
  stars.sparkle2,
  stars.sparkle1,
  stars.sparkle3,
  stars.star6,
  stars.star4,
  stars.star8
];
var neuralChars = [circles.leftHalf, circles.upperHalf, circles.rightHalf, circles.lowerHalf];
var asciiDots = [".  ", ".. ", "...", " ..", "  .", " ..", "...", ".. "];
var asciiSpinner = ["|", "/", "-", "\\"];
var asciiBar = ["[      ]", "[=     ]", "[==    ]", "[===   ]", "[====  ]", "[===== ]", "[======]", "[===== ]", "[====  ]", "[===   ]", "[==    ]", "[=     ]"];
function supportsUnicode() {
  const lang = process.env.LANG || process.env.LC_ALL || "";
  const hasUtf8 = lang.toLowerCase().includes("utf-8") || lang.toLowerCase().includes("utf8");
  const term = process.env.TERM || "";
  const isBasicTerm = term === "dumb" || term === "linux" || term === "";
  return hasUtf8 && !isBasicTerm;
}
var gradient = [c.c1, c.c2, c.c3, c.c4, c.c5, c.c6, c.c7, c.c8, c.c7, c.c6, c.c5, c.c4, c.c3, c.c2];
var gradientExtended = [c.c1, c.c9, c.c2, c.c10, c.c3, c.c4, c.c5, c.c6, c.c7, c.c8, c.c7, c.c6, c.c5, c.c4, c.c3, c.c10, c.c2, c.c9];
class Spinner {
  interval = null;
  frame = 0;
  message = "";
  width = 7;
  style;
  ttyFd = null;
  useAscii;
  exitHandler = null;
  constructor(options = {}) {
    this.useAscii = options.style === "ascii" || !supportsUnicode();
    this.style = this.useAscii ? "ascii" : options.style || "wave";
  }
  write(text) {
    if (process.platform === "win32") {
      process.stderr.write(text);
      return;
    }
    try {
      if (this.ttyFd === null) {
        this.ttyFd = openSync("/dev/tty", "w");
      }
      writeSync(this.ttyFd, text);
    } catch {
      process.stderr.write(text);
    }
  }
  closeTTY() {
    if (this.ttyFd !== null) {
      try {
        closeSync(this.ttyFd);
      } catch {}
      this.ttyFd = null;
    }
  }
  render() {
    let output = "";
    if (this.style === "wave") {
      const sparkleIdx = Math.floor(this.frame / 2) % sparkles.length;
      const leftSparkle = c.c4 + sparkles[sparkleIdx] + c.reset;
      let wave = "";
      for (let i = 0;i < this.width; i++) {
        const charIdx = (this.frame + i) % waveChars.length;
        const colorIdx = (this.frame + i) % gradientExtended.length;
        wave += gradientExtended[colorIdx] + waveChars[charIdx];
      }
      const rightSparkle = c.c4 + sparkles[(sparkleIdx + 4) % sparkles.length] + c.reset;
      output = leftSparkle + wave + rightSparkle;
    } else if (this.style === "neural") {
      const prefix = c.c4 + brackets.angleLeft + c.reset;
      const suffix = c.c4 + brackets.angleRight + c.reset;
      let inner = "";
      for (let i = 0;i < 6; i++) {
        const charIdx = (this.frame + i * 2) % neuralChars.length;
        const colorIdx = (this.frame + i) % gradientExtended.length;
        inner += gradientExtended[colorIdx] + neuralChars[charIdx];
      }
      const dotIdx = this.frame % bounceDots.length;
      const dotColor = gradientExtended[this.frame * 3 % gradientExtended.length];
      output = prefix + inner + suffix + " " + dotColor + bounceDots[dotIdx];
    } else if (this.style === "braille") {
      for (let i = 0;i < 8; i++) {
        const charIdx = (this.frame + i) % brailleWave.length;
        const colorIdx = (this.frame + i * 2) % gradientExtended.length;
        output += gradientExtended[colorIdx] + brailleWave[charIdx];
      }
      const sparkleIdx = Math.floor(this.frame / 2) % sparkles.length;
      output += " " + c.c5 + sparkles[sparkleIdx];
    } else if (this.style === "moon") {
      const moonIdx = this.frame % moonPhases.length;
      const sparkleIdx = Math.floor(this.frame / 3) % sparkles.length;
      let stars2 = "";
      for (let i = 0;i < 5; i++) {
        const starIdx = (this.frame + i * 2) % sparkles.length;
        const colorIdx = (this.frame + i) % gradientExtended.length;
        stars2 += gradientExtended[colorIdx] + sparkles[starIdx] + " ";
      }
      output = stars2 + moonPhases[moonIdx] + " " + c.c5 + sparkles[sparkleIdx];
    } else if (this.style === "dots") {
      for (let i = 0;i < 3; i++) {
        const dotIdx = (this.frame + i * 3) % bounceDots.length;
        const colorIdx = (this.frame + i * 2) % gradientExtended.length;
        output += gradientExtended[colorIdx] + bounceDots[dotIdx];
      }
    } else if (this.style === "ascii") {
      const spinnerIdx = this.frame % asciiSpinner.length;
      const barIdx = this.frame % asciiBar.length;
      const dotsIdx = this.frame % asciiDots.length;
      const colorIdx = this.frame % gradientExtended.length;
      output = gradientExtended[colorIdx] + asciiSpinner[spinnerIdx] + " " + gradientExtended[(colorIdx + 3) % gradientExtended.length] + asciiBar[barIdx] + " " + gradientExtended[(colorIdx + 6) % gradientExtended.length] + asciiDots[dotsIdx];
    } else {
      const dots = ".".repeat(this.frame % 3 + 1).padEnd(3);
      output = c.c4 + "o" + c.c5 + "o" + c.c6 + "o" + c.reset + dots;
    }
    output += c.reset + " " + c.dim + this.message + c.reset;
    this.write(`\r\x1B[K${output}`);
    this.frame++;
  }
  start(message = "Loading...") {
    if (this.interval)
      return;
    this.message = message;
    this.frame = 0;
    this.exitHandler = () => {
      try {
        if (process.platform === "win32") {
          process.stderr.write("\r\x1B[K\x1B[?25h");
        } else {
          const fd = openSync("/dev/tty", "w");
          writeSync(fd, "\r\x1B[K\x1B[?25h");
          closeSync(fd);
        }
      } catch {}
    };
    process.on("exit", this.exitHandler);
    this.write("\x1B[?25l");
    this.render();
    this.interval = setInterval(() => this.render(), 120);
  }
  update(message) {
    this.message = message;
  }
  stop(successMessage) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.exitHandler) {
      process.removeListener("exit", this.exitHandler);
      this.exitHandler = null;
    }
    this.write("\r\x1B[K\x1B[?25h");
    if (successMessage) {
      const sparkle = this.useAscii ? c.c5 + "*" + c.reset : c.c5 + stars.sparkle2 + c.reset;
      this.write(`${sparkle} ${c.green}${successMessage}${c.reset}
`);
    }
    this.closeTTY();
  }
  fail(message) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.exitHandler) {
      process.removeListener("exit", this.exitHandler);
      this.exitHandler = null;
    }
    this.write("\r\x1B[K\x1B[?25h");
    if (message) {
      const x = this.useAscii ? "x" : String.fromCodePoint(10007);
      this.write(`${c.red}${x}${c.reset} ${c.dim}${message}${c.reset}
`);
    }
    this.closeTTY();
  }
}
var cooldownFrames = [
  blocks.full.repeat(8),
  blocks.dark.repeat(8),
  blocks.medium.repeat(8),
  blocks.light.repeat(8),
  blocks.medium.repeat(8),
  blocks.light.repeat(8),
  "        ",
  blocks.light.repeat(8),
  "        "
];
var fadeDots = [
  circles.filled.repeat(4),
  circles.filled.repeat(3) + circles.empty,
  circles.filled.repeat(2) + circles.empty.repeat(2),
  circles.filled + circles.empty.repeat(3),
  circles.empty.repeat(4),
  "    "
];

export { Spinner };

//# debugId=F0B18221D2EFC74E64756E2164756E21
//# sourceMappingURL=chunk-4zgbdwm4.js.map
