/**
 * A beautiful wave spinner with colors, inspired by Claude Code's thinking animation
 * Writes directly to /dev/tty to bypass Claude Code's stream capture
 */

import { openSync, writeSync, closeSync } from "fs";
import { blocks, circles, stars, braille, brackets } from "./unicode.js";

// ANSI color codes - orange to pale light blue gradient
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  // Orange to pale light blue gradient
  c1: "\x1b[38;5;208m", // orange
  c2: "\x1b[38;5;214m", // light orange
  c3: "\x1b[38;5;215m", // peach orange
  c4: "\x1b[38;5;223m", // pale peach
  c5: "\x1b[38;5;195m", // very pale blue
  c6: "\x1b[38;5;159m", // pale light blue
  c7: "\x1b[38;5;117m", // light blue
  c8: "\x1b[38;5;81m",  // sky blue
  // Extended palette for smoother transitions
  c9: "\x1b[38;5;216m",  // soft orange
  c10: "\x1b[38;5;153m", // pale cyan
  // Success/fail
  green: "\x1b[38;5;114m",
  red: "\x1b[38;5;203m",
  cyan: "\x1b[38;5;87m",
  yellow: "\x1b[38;5;221m",
};

// Wave characters - smooth sine wave feel (runtime generated)
const waveChars = [
  blocks.lower1_8, blocks.lower2_8, blocks.lower3_8, blocks.lower4_8,
  blocks.lower5_8, blocks.lower6_8, blocks.lower7_8, blocks.full,
  blocks.lower7_8, blocks.lower6_8, blocks.lower5_8, blocks.lower4_8,
  blocks.lower3_8, blocks.lower2_8
];

// Braille patterns for a flowing "thinking" animation (runtime generated)
const brailleWave = braille.wave;

// Bouncing dots animation (runtime generated)
const bounceDots = braille.dots;

// Moon phases using Unicode circles (runtime generated)
const moonPhases = [
  circles.empty, circles.upperRight, circles.rightHalf, circles.lowerRight,
  circles.filled, circles.lowerRight, circles.rightHalf, circles.upperRight
];

// Sparkle characters that pulse (runtime generated)
const sparkles = [
  stars.small, stars.sparkle1, stars.sparkle2, stars.sparkle1,
  stars.sparkle3, stars.star6, stars.star4, stars.star8
];

// Neural network / thinking symbols (runtime generated)
const neuralChars = [circles.leftHalf, circles.upperHalf, circles.rightHalf, circles.lowerHalf];

// ASCII-safe alternatives (works in any terminal)
const asciiDots = [".  ", ".. ", "...", " ..", "  .", " ..", "...", ".. "];
const asciiSpinner = ["|", "/", "-", "\\"];
const asciiBar = ["[      ]", "[=     ]", "[==    ]", "[===   ]", "[====  ]", "[===== ]", "[======]", "[===== ]", "[====  ]", "[===   ]", "[==    ]", "[=     ]"];

// ASCII-safe cooldown frames
const asciiCooldownFrames = [
  "[======]",
  "[===== ]",
  "[====  ]",
  "[===   ]",
  "[==    ]",
  "[=     ]",
  "[      ]",
  "[      ]",
];

/**
 * Check if terminal likely supports Unicode
 */
function supportsUnicode(): boolean {
  const lang = process.env.LANG || process.env.LC_ALL || "";
  const hasUtf8 = lang.toLowerCase().includes("utf-8") || lang.toLowerCase().includes("utf8");
  const term = process.env.TERM || "";
  const isBasicTerm = term === "dumb" || term === "linux" || term === "";
  return hasUtf8 && !isBasicTerm;
}

// Color gradient array for easy indexing
const gradient = [c.c1, c.c2, c.c3, c.c4, c.c5, c.c6, c.c7, c.c8, c.c7, c.c6, c.c5, c.c4, c.c3, c.c2];

// Extended gradient with lavender tones
const gradientExtended = [c.c1, c.c9, c.c2, c.c10, c.c3, c.c4, c.c5, c.c6, c.c7, c.c8, c.c7, c.c6, c.c5, c.c4, c.c3, c.c10, c.c2, c.c9];

export interface SpinnerOptions {
  style?: "wave" | "dots" | "simple" | "neural" | "braille" | "moon" | "ascii";
}

/**
 * Write directly to the terminal, bypassing stdout/stderr capture
 */
function writeTTY(text: string): void {
  try {
    // Try to write directly to /dev/tty (works on macOS/Linux)
    const fd = openSync("/dev/tty", "w");
    writeSync(fd, text);
    closeSync(fd);
  } catch {
    // Fallback to stderr if /dev/tty not available
    process.stderr.write(text);
  }
}

/**
 * Class-based Spinner for use in hooks
 */
export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private message = "";
  private width = 7;
  private style: string;
  private ttyFd: number | null = null;
  private useAscii: boolean;

  constructor(options: SpinnerOptions = {}) {
    // Auto-detect or force ASCII mode
    this.useAscii = options.style === "ascii" || !supportsUnicode();
    this.style = this.useAscii ? "ascii" : (options.style || "wave");
  }

  private write(text: string) {
    try {
      if (this.ttyFd === null) {
        this.ttyFd = openSync("/dev/tty", "w");
      }
      writeSync(this.ttyFd, text);
    } catch {
      process.stderr.write(text);
    }
  }

  private closeTTY() {
    if (this.ttyFd !== null) {
      try {
        closeSync(this.ttyFd);
      } catch {
        // Ignore close errors
      }
      this.ttyFd = null;
    }
  }

  private render() {
    let output = "";

    if (this.style === "wave") {
      // Sparkle bookends with wave
      const sparkleIdx = Math.floor(this.frame / 2) % sparkles.length;
      const leftSparkle = c.c4 + sparkles[sparkleIdx] + c.reset;

      // Build colorful wave with flowing animation
      let wave = "";
      for (let i = 0; i < this.width; i++) {
        const charIdx = (this.frame + i) % waveChars.length;
        const colorIdx = (this.frame + i) % gradientExtended.length;
        wave += gradientExtended[colorIdx] + waveChars[charIdx];
      }

      const rightSparkle = c.c4 + sparkles[(sparkleIdx + 4) % sparkles.length] + c.reset;
      output = leftSparkle + wave + rightSparkle;
    } else if (this.style === "neural") {
      // Neural network thinking animation
      const prefix = c.c4 + brackets.angleLeft + c.reset;
      const suffix = c.c4 + brackets.angleRight + c.reset;

      let inner = "";
      for (let i = 0; i < 6; i++) {
        const charIdx = (this.frame + i * 2) % neuralChars.length;
        const colorIdx = (this.frame + i) % gradientExtended.length;
        inner += gradientExtended[colorIdx] + neuralChars[charIdx];
      }

      // Add bouncing dots
      const dotIdx = this.frame % bounceDots.length;
      const dotColor = gradientExtended[(this.frame * 3) % gradientExtended.length];

      output = prefix + inner + suffix + " " + dotColor + bounceDots[dotIdx];
    } else if (this.style === "braille") {
      // Braille flowing pattern
      for (let i = 0; i < 8; i++) {
        const charIdx = (this.frame + i) % brailleWave.length;
        const colorIdx = (this.frame + i * 2) % gradientExtended.length;
        output += gradientExtended[colorIdx] + brailleWave[charIdx];
      }

      // Add trailing sparkle
      const sparkleIdx = Math.floor(this.frame / 2) % sparkles.length;
      output += " " + c.c5 + sparkles[sparkleIdx];
    } else if (this.style === "moon") {
      // Moon phase animation with sparkles
      const moonIdx = this.frame % moonPhases.length;
      const sparkleIdx = Math.floor(this.frame / 3) % sparkles.length;

      // Create a field of stars around the moon
      let stars = "";
      for (let i = 0; i < 5; i++) {
        const starIdx = (this.frame + i * 2) % sparkles.length;
        const colorIdx = (this.frame + i) % gradientExtended.length;
        stars += gradientExtended[colorIdx] + sparkles[starIdx] + " ";
      }

      output = stars + moonPhases[moonIdx] + " " + c.c5 + sparkles[sparkleIdx];
    } else if (this.style === "dots") {
      // Bouncing dots with gradient
      for (let i = 0; i < 3; i++) {
        const dotIdx = (this.frame + i * 3) % bounceDots.length;
        const colorIdx = (this.frame + i * 2) % gradientExtended.length;
        output += gradientExtended[colorIdx] + bounceDots[dotIdx];
      }
    } else if (this.style === "ascii") {
      // ASCII-safe animation (works in any terminal)
      const spinnerIdx = this.frame % asciiSpinner.length;
      const barIdx = this.frame % asciiBar.length;
      const dotsIdx = this.frame % asciiDots.length;
      const colorIdx = this.frame % gradientExtended.length;

      output = gradientExtended[colorIdx] + asciiSpinner[spinnerIdx] + " " +
               gradientExtended[(colorIdx + 3) % gradientExtended.length] + asciiBar[barIdx] + " " +
               gradientExtended[(colorIdx + 6) % gradientExtended.length] + asciiDots[dotsIdx];
    } else {
      // Simple dots fallback
      const dots = ".".repeat((this.frame % 3) + 1).padEnd(3);
      output = c.c4 + "o" + c.c5 + "o" + c.c6 + "o" + c.reset + dots;
    }

    output += c.reset + " " + c.dim + this.message + c.reset;

    // Write directly to terminal, bypassing stream capture
    this.write(`\r\x1b[K${output}`);
    this.frame++;
  }

  start(message = "Loading...") {
    if (this.interval) return;
    this.message = message;
    this.frame = 0;

    // Hide cursor
    this.write("\x1b[?25l");

    // Render immediately, then animate
    // Use 120ms for smoother animation (less CPU, less flickering)
    this.render();
    this.interval = setInterval(() => this.render(), 120);
  }

  update(message: string) {
    this.message = message;
  }

  stop(successMessage?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear line and show cursor
    this.write("\r\x1b[K\x1b[?25h");

    if (successMessage) {
      // Pretty success message - use ASCII-safe symbol if needed
      const sparkle = this.useAscii ? (c.c5 + "*" + c.reset) : (c.c5 + stars.sparkle2 + c.reset);
      this.write(`${sparkle} ${c.green}${successMessage}${c.reset}\n`);
    }

    this.closeTTY();
  }

  fail(message?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.write("\r\x1b[K\x1b[?25h");

    if (message) {
      // Use ASCII-safe symbol if needed
      const x = this.useAscii ? "x" : String.fromCodePoint(0x2717);
      this.write(`${c.red}${x}${c.reset} ${c.dim}${message}${c.reset}\n`);
    }

    this.closeTTY();
  }
}

// Cooldown animation characters - reverse energy flow (runtime generated)
const cooldownFrames = [
  blocks.full.repeat(8),
  blocks.dark.repeat(8),
  blocks.medium.repeat(8),
  blocks.light.repeat(8),
  blocks.medium.repeat(8),
  blocks.light.repeat(8),
  "        ",
  blocks.light.repeat(8),
  "        ",
];

// Fading dots for shutdown (runtime generated)
const fadeDots = [
  circles.filled.repeat(4),
  circles.filled.repeat(3) + circles.empty,
  circles.filled.repeat(2) + circles.empty.repeat(2),
  circles.filled + circles.empty.repeat(3),
  circles.empty.repeat(4),
  "    "
];

/**
 * Play a cooldown animation when Claude shuts down
 * Returns a promise that resolves when animation completes
 * Automatically uses ASCII-safe characters if Unicode isn't supported
 */
export async function playCooldown(message = "saving memory"): Promise<void> {
  const useAscii = !supportsUnicode();

  return new Promise((resolve) => {
    let frame = 0;
    let ttyFd: number | null = null;

    const write = (text: string) => {
      try {
        if (ttyFd === null) {
          ttyFd = openSync("/dev/tty", "w");
        }
        writeSync(ttyFd, text);
      } catch {
        process.stderr.write(text);
      }
    };

    const closeTTY = () => {
      if (ttyFd !== null) {
        try {
          closeSync(ttyFd);
        } catch {
          // Ignore
        }
        ttyFd = null;
      }
    };

    // Hide cursor
    write("\x1b[?25l");

    const frames = useAscii ? asciiCooldownFrames : cooldownFrames;
    const dots = useAscii ? ["oooo", "ooo.", "oo..", "o...", "...."] : fadeDots;

    const totalFrames = 18;
    const interval = setInterval(() => {
      // Calculate fade progress (0 to 1)
      const progress = frame / totalFrames;

      // Select colors that fade from bright to dim
      const colorIndex = Math.min(Math.floor(progress * 6), 5);
      const fadeColors = [c.c8, c.c7, c.c6, c.c5, c.c4, c.dim];
      const currentColor = fadeColors[colorIndex];

      // Build cooldown bar
      const barIndex = Math.min(Math.floor(progress * frames.length), frames.length - 1);
      const bar = frames[barIndex];

      // Fading dots
      const dotIndex = Math.min(Math.floor(progress * dots.length), dots.length - 1);
      const dotStr = dots[dotIndex];

      // Brackets - ASCII-safe if needed
      const prefix = useAscii ? (currentColor + "<" + c.reset) : (currentColor + brackets.angleLeft + c.reset);
      const suffix = useAscii ? (currentColor + ">" + c.reset) : (currentColor + brackets.angleRight + c.reset);

      const output = prefix + currentColor + bar + suffix + " " + currentColor + dotStr + c.reset + " " + c.dim + message + c.reset;

      write(`\r\x1b[K${output}`);
      frame++;

      if (frame >= totalFrames) {
        clearInterval(interval);
        // Final clear and goodbye
        write("\r\x1b[K");
        const sparkle = useAscii ? (c.c5 + "*" + c.reset) : (c.c5 + stars.sparkle2 + c.reset);
        write(`${sparkle} ${c.dim}memory saved${c.reset}\n`);
        write("\x1b[?25h");
        closeTTY();
        resolve();
      }
    }, 60);
  });
}

/**
 * Functional spinner creator (alternative API)
 */
export function createSpinner(options?: SpinnerOptions) {
  return new Spinner(options);
}

/**
 * Simple inline wave for one-shot display (no animation)
 */
export function renderWave(length = 8): string {
  let wave = "";
  const offset = Math.floor(Math.random() * waveChars.length);
  for (let i = 0; i < length; i++) {
    const charIdx = (offset + i) % waveChars.length;
    const colorIdx = (offset + i) % gradient.length;
    wave += gradient[colorIdx] + waveChars[charIdx];
  }
  return wave + c.reset;
}

/**
 * Wrap an async operation with the spinner
 */
export async function withSpinner<T>(
  operation: () => Promise<T>,
  message = "Loading...",
  successMessage?: string
): Promise<T> {
  const spinner = new Spinner({ style: "wave" });
  spinner.start(message);
  try {
    const result = await operation();
    spinner.stop(successMessage);
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
