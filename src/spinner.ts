/**
 * A beautiful wave spinner with colors, inspired by Claude Code's thinking animation
 */

// ANSI color codes - using bright/bold variants for visibility
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  // Rich gradient: purple → magenta → pink → coral → orange (warm Claude palette)
  c1: "\x1b[38;5;129m", // deep purple
  c2: "\x1b[38;5;135m", // purple
  c3: "\x1b[38;5;171m", // magenta
  c4: "\x1b[38;5;213m", // pink
  c5: "\x1b[38;5;219m", // light pink
  c6: "\x1b[38;5;217m", // peach
  c7: "\x1b[38;5;216m", // coral
  c8: "\x1b[38;5;215m", // light coral
  // Success/fail
  green: "\x1b[38;5;114m",
  red: "\x1b[38;5;203m",
  cyan: "\x1b[38;5;87m",
};

// Wave characters - smooth sine wave feel
const waveChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"];

// Sparkle characters that pulse
const sparkles = ["⋆", "✧", "✦", "✧"];

// Color gradient array for easy indexing
const gradient = [c.c1, c.c2, c.c3, c.c4, c.c5, c.c6, c.c7, c.c8, c.c7, c.c6, c.c5, c.c4, c.c3, c.c2];

export interface SpinnerOptions {
  style?: "wave" | "dots" | "simple";
}

/**
 * Class-based Spinner for use in hooks
 */
export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private message = "";
  private width = 16;
  private style: string;

  constructor(options: SpinnerOptions = {}) {
    this.style = options.style || "wave";
  }

  private render() {
    let output = "";

    if (this.style === "wave") {
      // Build colorful wave
      for (let i = 0; i < this.width; i++) {
        const charIdx = (this.frame + i) % waveChars.length;
        const colorIdx = (this.frame + i) % gradient.length;
        output += gradient[colorIdx] + waveChars[charIdx];
      }

      // Add pulsing sparkle
      const sparkleIdx = Math.floor(this.frame / 3) % sparkles.length;
      const sparkleColor = gradient[(this.frame * 2) % gradient.length];
      output += " " + sparkleColor + sparkles[sparkleIdx];
    } else {
      // Simple dots fallback
      const dots = ".".repeat((this.frame % 3) + 1).padEnd(3);
      output = c.c4 + "●" + c.c5 + "●" + c.c6 + "●" + c.reset + dots;
    }

    output += c.reset + " " + c.dim + this.message + c.reset;

    // Write to stderr (hooks output to stdout for Claude)
    process.stderr.write(`\r\x1b[K${output}`);
    this.frame++;
  }

  start(message = "Loading...") {
    if (this.interval) return;
    this.message = message;
    this.frame = 0;

    // Hide cursor
    process.stderr.write("\x1b[?25l");

    // Render immediately, then animate
    this.render();
    this.interval = setInterval(() => this.render(), 60);
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
    process.stderr.write("\r\x1b[K\x1b[?25h");

    if (successMessage) {
      // Pretty success message with checkmark
      const sparkle = c.c5 + "✦" + c.reset;
      process.stderr.write(`${sparkle} ${c.green}${successMessage}${c.reset}\n`);
    }
  }

  fail(message?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    process.stderr.write("\r\x1b[K\x1b[?25h");

    if (message) {
      process.stderr.write(`${c.red}✗${c.reset} ${c.dim}${message}${c.reset}\n`);
    }
  }
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
