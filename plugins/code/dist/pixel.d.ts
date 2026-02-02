/**
 * Honcho pixel art character for terminal display
 * Designed to stack nicely with Claude Code's mascot (3 rows)
 */
/**
 * Simple clean Honcho face - solid peach circle with dark eyes
 * Uses background colors for solid fill effect
 */
export declare function renderHoncho(): string[];
/**
 * Honcho with smile - cleaner design
 */
export declare function renderHonchoSmile(): string[];
/**
 * Wider honcho
 */
export declare function renderHonchoWide(): string[];
/**
 * Compact honcho
 */
export declare function renderHonchoCompact(): string[];
/**
 * Honcho gradient version - light blue blob with saluting arm
 * 4-row design with a clear salute gesture (hand touching forehead) + face
 */
export declare function renderHonchoGradient(): string[];
/**
 * Minimal cute blob - even simpler
 */
export declare function renderHonchoMinimal(): string[];
/**
 * ASCII-safe Honcho - works in any terminal regardless of encoding
 * Uses only basic ASCII characters
 */
export declare function renderHonchoAscii(): string[];
/**
 * ASCII Honcho - standard size variant
 */
export declare function renderHonchoAsciiStandard(): string[];
/**
 * ASCII Honcho - compact variant
 */
export declare function renderHonchoAsciiCompact(): string[];
/**
 * Check if terminal likely supports Unicode block characters
 * Returns false if encoding issues are likely
 */
export declare function supportsUnicode(): boolean;
/**
 * Display honcho with optional label (like Claude's startup)
 * Always uses Unicode - relies on TTY output for proper rendering
 */
export declare function displayHonchoStartup(label?: string, subtitle?: string, extra?: string): string;
/**
 * Display honcho startup with direct TTY output
 * This ensures Unicode renders properly like Claude Code
 */
export declare function displayHonchoStartupTTY(label?: string, subtitle?: string, extra?: string): void;
/**
 * Stack Honcho above Claude's display area
 * Returns the pixel art lines for integration
 * Always returns Unicode - use TTY output for proper rendering
 */
export declare function getHonchoLines(): string[];
/**
 * Preview all variants (for testing)
 * Uses direct TTY output like Claude Code does
 */
export declare function previewAll(): void;
