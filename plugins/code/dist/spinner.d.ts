/**
 * A beautiful wave spinner with colors, inspired by Claude Code's thinking animation
 * Writes directly to /dev/tty to bypass Claude Code's stream capture
 */
export interface SpinnerOptions {
    style?: "wave" | "dots" | "simple" | "neural" | "braille" | "moon" | "ascii";
}
/**
 * Class-based Spinner for use in hooks
 */
export declare class Spinner {
    private interval;
    private frame;
    private message;
    private width;
    private style;
    private ttyFd;
    private useAscii;
    constructor(options?: SpinnerOptions);
    private write;
    private closeTTY;
    private render;
    start(message?: string): void;
    update(message: string): void;
    stop(successMessage?: string): void;
    fail(message?: string): void;
}
/**
 * Play a cooldown animation when Claude shuts down
 * Returns a promise that resolves when animation completes
 * Automatically uses ASCII-safe characters if Unicode isn't supported
 */
export declare function playCooldown(message?: string): Promise<void>;
/**
 * Functional spinner creator (alternative API)
 */
export declare function createSpinner(options?: SpinnerOptions): Spinner;
/**
 * Simple inline wave for one-shot display (no animation)
 */
export declare function renderWave(length?: number): string;
/**
 * Wrap an async operation with the spinner
 */
export declare function withSpinner<T>(operation: () => Promise<T>, message?: string, successMessage?: string): Promise<T>;
