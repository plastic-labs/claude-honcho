/**
 * Node-compatible stdin reader
 * Replaces Bun.stdin.text() for cross-runtime compatibility
 */
/**
 * Read all content from stdin as text
 * Works with both Node.js and Bun
 */
export declare function readStdin(): Promise<string>;
