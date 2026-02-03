/**
 * Honcho pixel art character for terminal display
 * Designed to stack nicely with Claude Code's mascot (3 rows)
 */

import { openSync, writeSync, closeSync } from "fs";
import { blocks, circles } from "./unicode.js";

// ANSI color codes
const c = {
  reset: "\x1b[0m",
  // Foreground colors - light blue gradient
  blue1: "\x1b[38;5;117m",   // light blue (main)
  blue2: "\x1b[38;5;81m",    // sky blue (accent)
  blue3: "\x1b[38;5;159m",   // pale blue (highlight)
  blue4: "\x1b[38;5;153m",   // soft cyan
  // Legacy peach colors (for backwards compat)
  peach: "\x1b[38;5;216m",
  salmon: "\x1b[38;5;209m",
  orange: "\x1b[38;5;208m",
  pale: "\x1b[38;5;223m",
  cream: "\x1b[38;5;224m",
  // Background colors for solid fills
  bgPeach: "\x1b[48;5;216m",
  bgSalmon: "\x1b[48;5;209m",
  bgOrange: "\x1b[48;5;208m",
  // Dark for eyes
  dark: "\x1b[38;5;236m",
  black: "\x1b[38;5;16m",
  // For text
  dim: "\x1b[2m",
};

// Block characters (runtime generated to survive bundling)
const B = {
  full: blocks.full,           // █
  upper: blocks.upperHalf,     // ▀
  lower: blocks.lowerHalf,     // ▄
  lower2_8: blocks.lower2_8,   // ▂
};

// Circle for eyes
const eye = circles.filled;    // ●

/**
 * Simple clean Honcho face - solid peach circle with dark eyes
 * Uses background colors for solid fill effect
 */
export function renderHoncho(): string[] {
  const p = c.peach;   // peach foreground
  const d = c.dark;    // dark for eyes
  const r = c.reset;

  // Clean 3-row face: rounded top, eyes in middle, rounded bottom
  return [
    `  ${p}${B.lower}${B.full}${B.full}${B.full}${B.full}${B.lower}${r}  `,
    ` ${p}${B.full}${B.full}${d}${B.upper}${p}${B.full}${B.full}${d}${B.upper}${p}${B.full}${B.full}${r} `,
    `  ${p}${B.upper}${B.full}${B.full}${B.full}${B.full}${B.upper}${r}  `,
  ];
}

/**
 * Honcho with smile - cleaner design
 */
export function renderHonchoSmile(): string[] {
  const p = c.peach;
  const r = c.reset;

  return [
    `  ${p}${B.lower}${B.full}${B.full}${B.full}${B.full}${B.lower}${r}  `,
    ` ${p}${B.full}${B.full}${r}${B.upper}${p}${B.full}${B.full}${r}${B.upper}${p}${B.full}${B.full}${r} `,
    `  ${p}${B.upper}${r}${B.lower}${B.lower}${B.lower}${B.lower}${p}${B.upper}${r}  `,
  ];
}

/**
 * Wider honcho
 */
export function renderHonchoWide(): string[] {
  const p = c.peach;
  const r = c.reset;

  return [
    `  ${p}${B.lower}${B.full}${B.full}${B.full}${B.full}${B.full}${B.full}${B.lower}${r}  `,
    ` ${p}${B.full}${B.full}${B.full}${r}${B.upper}${p}${B.full}${B.full}${r}${B.upper}${p}${B.full}${B.full}${B.full}${r} `,
    `  ${p}${B.upper}${B.full}${B.full}${B.full}${B.full}${B.full}${B.full}${B.upper}${r}  `,
  ];
}

/**
 * Compact honcho
 */
export function renderHonchoCompact(): string[] {
  const p = c.peach;
  const r = c.reset;

  return [
    ` ${p}${B.lower}${B.full}${B.full}${B.full}${B.lower}${r} `,
    `${p}${B.full}${B.full}${r}${B.upper}${p}${B.full}${r}${B.upper}${p}${B.full}${B.full}${r}`,
    ` ${p}${B.upper}${B.full}${B.full}${B.full}${B.upper}${r} `,
  ];
}

/**
 * Honcho gradient version - light blue blob with saluting arm
 * 4-row design with a clear salute gesture (hand touching forehead) + face
 */
export function renderHonchoGradient(): string[] {
  // Pixel-grid version (2 spaces per pixel) to match the SVG/pixel vibe and avoid
  // block-drawing oddities across terminals/fonts.
  const r = c.reset;
  const bg = (n: number) => `\x1b[48;5;${n}m`;

  const P = {
    empty: "  ",
    outline: `${bg(236)}  ${r}`,     // dark outline
    body: `${bg(117)}  ${r}`,        // sky blue fill
    hi: `${bg(159)}  ${r}`,          // pale highlight (hand/shine)
    eye: `${bg(16)}  ${r}`,          // black eyes/mouth
  } as const;

  // 9x8 grid (each char = one pixel; rendered as 2-space squares)
  // Legend: ' ' empty, 'O' outline, 'B' body, 'H' highlight, 'E' eye, 'M' mouth
  const grid = [
    "     HHO ", // hand (top-right)
    "  OBBBBHO", // head top + forearm
    " OBBBBBHO", // forehead/arm connection
    " OBBE BEO", // eyes row 1
    " OBBE BEO", // eyes row 2 (taller eyes like your screenshot)
    " OBBBMMBO", // mouth row (subtle)
    "  OBBBB O", // taper
    "   OOO   ", // bottom
  ];

  const renderRow = (row: string) =>
    row
      .split("")
      .map((ch) => {
        if (ch === "O") return P.outline;
        if (ch === "B") return P.body;
        if (ch === "H") return P.hi;
        if (ch === "E" || ch === "M") return P.eye;
        return P.empty;
      })
      .join("");

  return grid.map(renderRow);
}

function visibleWidth(s: string): number {
  // Strip ANSI color codes, then measure remaining characters.
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Minimal cute blob - even simpler
 */
export function renderHonchoMinimal(): string[] {
  const p = c.peach;
  const r = c.reset;

  return [
    ` ${p}${B.lower}${B.full}${B.full}${B.lower}${r} `,
    `${p}${B.full}${r}${B.upper}${p}${B.full}${r}${B.upper}${p}${B.full}${r}`,
    ` ${p}${B.upper}${B.full}${B.full}${B.upper}${r} `,
  ];
}

/**
 * ASCII-safe Honcho - works in any terminal regardless of encoding
 * Uses only basic ASCII characters
 */
export function renderHonchoAscii(): string[] {
  const o = c.orange;
  const p = c.peach;
  const s = c.salmon;
  const e = c.dark;
  const b = c.cream;
  const r = c.reset;

  // Compact peachy blob with small dot eyes
  return [
    `  ${o}.${s}~~~~${o}.${r}  `,
    ` ${s}(${e}.${p}    ${e}.${s})${r} `,
    `  ${o}'${b}----${o}'${r}  `,
  ];
}

/**
 * ASCII Honcho - standard size variant
 */
export function renderHonchoAsciiStandard(): string[] {
  const o = c.orange;
  const p = c.peach;
  const s = c.salmon;
  const e = c.dark;
  const b = c.cream;
  const r = c.reset;

  // Standard size with small eyes
  return [
    `  ${o}.${s}~~~~~~${o}.${r}  `,
    ` ${s}(${p} ${e}.${p}  ${e}.${p} ${s})${r} `,
    `  ${o}'${b}------${o}'${r}  `,
  ];
}

/**
 * ASCII Honcho - compact variant
 */
export function renderHonchoAsciiCompact(): string[] {
  const o = c.orange;
  const p = c.peach;
  const s = c.salmon;
  const e = c.dark;
  const r = c.reset;

  // Compact with tiny eyes
  return [
    ` ${o}.${s}~~~~${o}.${r} `,
    `${s}(${e}.${p}  ${e}.${s})${r}`,
    ` ${o}'${p}----${o}'${r} `,
  ];
}

/**
 * Write directly to TTY with explicit UTF-8 encoding
 * Includes escape sequence to ensure terminal is in UTF-8 mode
 */
function writeTTY(text: string, switchToUtf8 = false): void {
  try {
    const fd = openSync("/dev/tty", "w");
    // Optionally switch terminal to UTF-8 mode (ESC % G)
    if (switchToUtf8) {
      writeSync(fd, Buffer.from("\x1b%G", "utf8"));
    }
    // Write as UTF-8 buffer explicitly
    const buffer = Buffer.from(text, "utf8");
    writeSync(fd, buffer);
    closeSync(fd);
  } catch {
    // Fallback to stdout with UTF-8 buffer
    if (switchToUtf8) {
      process.stdout.write(Buffer.from("\x1b%G", "utf8"));
    }
    process.stdout.write(Buffer.from(text, "utf8"));
  }
}

/**
 * Check if terminal likely supports Unicode block characters
 * Returns false if encoding issues are likely
 */
export function supportsUnicode(): boolean {
  // Check LANG/LC_ALL for UTF-8
  const lang = process.env.LANG || process.env.LC_ALL || "";
  const hasUtf8 = lang.toLowerCase().includes("utf-8") || lang.toLowerCase().includes("utf8");

  // Check terminal type
  const term = process.env.TERM || "";
  const isBasicTerm = term === "dumb" || term === "linux" || term === "";

  // If no UTF-8 locale or basic terminal, probably doesn't support Unicode well
  return hasUtf8 && !isBasicTerm;
}

/**
 * Display honcho with optional label (like Claude's startup)
 * Always uses Unicode - relies on TTY output for proper rendering
 */
export function displayHonchoStartup(label?: string, subtitle?: string, extra?: string): string {
  const lines = renderHonchoGradient();
  const labelText = label || "Honcho Memory";
  const subtitleText = subtitle || "persistent context";

  // Pad all art lines to a consistent visible width so right-hand text aligns cleanly.
  const maxWidth = Math.max(...lines.map(visibleWidth));

  // Format with label to the right (like Claude Code does)
  const output = lines.map((line, i) => {
    const pad = " ".repeat(Math.max(0, maxWidth - visibleWidth(line)));
    const padded = `${line}${pad}`;
    if (i === 0) return `${padded}  ${c.pale}${labelText}${c.reset}`;
    if (i === 1) return `${padded}  ${c.dim}${subtitleText}${c.reset}`;
    if (i === 2 && extra) return `${padded}  ${c.dim}${extra}${c.reset}`;
    return padded;
  });

  return output.join("\n");
}

/**
 * Display honcho startup with direct TTY output
 * This ensures Unicode renders properly like Claude Code
 */
export function displayHonchoStartupTTY(label?: string, subtitle?: string, extra?: string): void {
  writeTTY(displayHonchoStartup(label, subtitle, extra) + "\n");
}

/**
 * Stack Honcho above Claude's display area
 * Returns the pixel art lines for integration
 * Always returns Unicode - use TTY output for proper rendering
 */
export function getHonchoLines(): string[] {
  return renderHonchoGradient();
}

/**
 * Preview all variants (for testing)
 * Uses direct TTY output like Claude Code does
 */
export function previewAll(): void {
  // Switch terminal to UTF-8 mode first, then output
  writeTTY("\n--- Honcho Compact ---\n", true);  // true = send UTF-8 switch sequence
  renderHonchoCompact().forEach(line => writeTTY(line + "\n"));

  writeTTY("\n--- Honcho Standard ---\n");
  renderHoncho().forEach(line => writeTTY(line + "\n"));

  writeTTY("\n--- Honcho Gradient ---\n");
  renderHonchoGradient().forEach(line => writeTTY(line + "\n"));

  writeTTY("\n--- Honcho Startup Display ---\n");
  writeTTY(displayHonchoStartup("Honcho Memory", "persistent context") + "\n");

  writeTTY("\n");
}
