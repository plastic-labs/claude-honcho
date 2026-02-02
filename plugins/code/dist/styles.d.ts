/**
 * Shared color scheme and styling utilities for honcho CLI
 *
 * Design principles:
 * - No emojis, only tasteful Unicode symbols
 * - Orange to pale light blue gradient
 * - Consistent hierarchy: headers, labels, values, dim text
 */
export declare const colors: {
    reset: string;
    bold: string;
    dim: string;
    orange: string;
    lightOrange: string;
    peach: string;
    palePeach: string;
    paleBlue: string;
    lightBlue: string;
    skyBlue: string;
    brightBlue: string;
    success: string;
    error: string;
    warn: string;
    white: string;
    gray: string;
};
export declare const symbols: {
    check: string;
    cross: string;
    dot: string;
    bullet: string;
    arrow: string;
    line: string;
    corner: string;
    pipe: string;
    sparkle: string;
};
/**
 * Style a header/title
 */
export declare function header(text: string): string;
/**
 * Style a section header (smaller than main header)
 */
export declare function section(text: string): string;
/**
 * Style a label (for key-value pairs)
 */
export declare function label(text: string): string;
/**
 * Style a value
 */
export declare function value(text: string): string;
/**
 * Style dim/secondary text
 */
export declare function dim(text: string): string;
/**
 * Style a success message
 */
export declare function success(message: string): string;
/**
 * Style an error message
 */
export declare function error(message: string): string;
/**
 * Style a warning message
 */
export declare function warn(message: string): string;
/**
 * Style a list item
 */
export declare function listItem(text: string, indent?: number): string;
/**
 * Style a key-value pair
 */
export declare function keyValue(key: string, val: string): string;
/**
 * Style current/active item marker
 */
export declare function current(text: string): string;
/**
 * Create a horizontal rule
 */
export declare function hr(width?: number): string;
/**
 * Style a path
 */
export declare function path(p: string): string;
/**
 * Highlight text
 */
export declare function highlight(text: string): string;
