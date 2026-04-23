/**
 * Shared color scheme and styling utilities for honcho CLI
 *
 * Design principles:
 * - No emojis, only tasteful Unicode symbols
 * - Orange to pale light blue gradient
 * - Consistent hierarchy: headers, labels, values, dim text
 */
import type { HonchoEndpointConfig } from "./config.js";

// ANSI color codes - orange to pale light blue gradient
export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Primary gradient: orange → pale blue
  orange: "\x1b[38;5;208m",
  lightOrange: "\x1b[38;5;214m",
  peach: "\x1b[38;5;215m",
  palePeach: "\x1b[38;5;223m",
  paleBlue: "\x1b[38;5;195m",
  lightBlue: "\x1b[38;5;159m",
  skyBlue: "\x1b[38;5;117m",
  brightBlue: "\x1b[38;5;81m",

  // Semantic colors
  success: "\x1b[38;5;114m",  // green
  error: "\x1b[38;5;203m",    // red
  warn: "\x1b[38;5;214m",     // light orange (warning)

  // Utility
  white: "\x1b[38;5;255m",
  gray: "\x1b[38;5;245m",
};

// Unicode symbols generated at runtime (survives bundling)
export const symbols = {
  check: String.fromCodePoint(0x2713),      // ✓
  cross: String.fromCodePoint(0x2717),      // ✗
  dot: String.fromCodePoint(0x00B7),        // ·
  bullet: String.fromCodePoint(0x2022),     // •
  arrow: String.fromCodePoint(0x2192),      // →
  line: String.fromCodePoint(0x2500),       // ─
  corner: String.fromCodePoint(0x2514),     // └
  pipe: String.fromCodePoint(0x2502),       // │
  sparkle: String.fromCodePoint(0x2726),    // ✦
};

/**
 * Style a header/title
 */
export function header(text: string): string {
  const line = symbols.line.repeat(text.length);
  return `${colors.orange}${text}${colors.reset}\n${colors.dim}${line}${colors.reset}`;
}

/**
 * Style a section header (smaller than main header)
 */
export function section(text: string): string {
  return `${colors.lightBlue}${text}${colors.reset}`;
}

/**
 * Style a label (for key-value pairs)
 */
export function label(text: string): string {
  return `${colors.skyBlue}${text}${colors.reset}`;
}

/**
 * Style a value
 */
export function value(text: string): string {
  return `${colors.white}${text}${colors.reset}`;
}

/**
 * Style dim/secondary text
 */
export function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

/**
 * Style a success message
 */
export function success(message: string): string {
  return `${colors.success}${symbols.check}${colors.reset} ${message}`;
}

/**
 * Style an error message
 */
export function error(message: string): string {
  return `${colors.error}${symbols.cross}${colors.reset} ${message}`;
}

/**
 * Style a warning message
 */
export function warn(message: string): string {
  return `${colors.warn}!${colors.reset} ${message}`;
}

/**
 * Style a list item
 */
export function listItem(text: string, indent: number = 0): string {
  const padding = "  ".repeat(indent);
  return `${padding}${colors.dim}${symbols.bullet}${colors.reset} ${text}`;
}

/**
 * Style a key-value pair
 */
export function keyValue(key: string, val: string): string {
  return `${label(key)}: ${value(val)}`;
}

/**
 * Style current/active item marker
 */
export function current(text: string): string {
  return `${colors.palePeach}(${text})${colors.reset}`;
}

/**
 * Create a horizontal rule
 */
export function hr(width: number = 40): string {
  return `${colors.dim}${symbols.line.repeat(width)}${colors.reset}`;
}

/**
 * Style a path
 */
export function path(p: string): string {
  return `${colors.gray}${p}${colors.reset}`;
}

/**
 * Highlight text
 */
export function highlight(text: string): string {
  return `${colors.peach}${text}${colors.reset}`;
}

/**
 * Build a Honcho app URL for a session.
 *
 * The hosted GUI at app.honcho.dev only exists for the production endpoint.
 * For local or custom self-hosted deployments there is no web frontend, so
 * returning a cloud URL would point users at a workspace that does not exist
 * in their instance. Returns null in those cases so callers can suppress the
 * link entirely.
 */
export function honchoSessionUrl(
  workspace: string,
  sessionName: string,
  endpoint?: HonchoEndpointConfig,
): string | null {
  if (endpoint?.baseUrl || endpoint?.environment === "local") return null;
  return `https://app.honcho.dev/explore?workspace=${encodeURIComponent(workspace)}&view=sessions&session=${encodeURIComponent(sessionName)}`;
}

/**
 * OSC 8 terminal hyperlink (clickable in supported terminals)
 */
export function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/**
 * Styled session line with clickable hyperlink to Honcho app (when available)
 */
export function sessionLine(
  workspace: string,
  sessionName: string,
  endpoint?: HonchoEndpointConfig,
): string {
  const url = honchoSessionUrl(workspace, sessionName, endpoint);
  const label = `${colors.dim}Honcho session:${colors.reset}`;
  const name = `${colors.skyBlue}${sessionName}${colors.reset}`;
  return url ? `${label} ${hyperlink(url, name)}` : `${label} ${name}`;
}
