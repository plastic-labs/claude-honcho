/**
 * Unicode characters generated at runtime using String.fromCodePoint()
 * This survives Bun's bundler which otherwise converts escape sequences to raw UTF-8 bytes
 */

// Block drawing characters
export const blocks = {
  full: String.fromCodePoint(0x2588),         // █
  upperHalf: String.fromCodePoint(0x2580),    // ▀
  lowerHalf: String.fromCodePoint(0x2584),    // ▄
  light: String.fromCodePoint(0x2591),        // ░
  medium: String.fromCodePoint(0x2592),       // ▒
  dark: String.fromCodePoint(0x2593),         // ▓
  // Wave blocks (vertical eighths)
  lower1_8: String.fromCodePoint(0x2581),     // ▁
  lower2_8: String.fromCodePoint(0x2582),     // ▂
  lower3_8: String.fromCodePoint(0x2583),     // ▃
  lower4_8: String.fromCodePoint(0x2584),     // ▄
  lower5_8: String.fromCodePoint(0x2585),     // ▅
  lower6_8: String.fromCodePoint(0x2586),     // ▆
  lower7_8: String.fromCodePoint(0x2587),     // ▇
};

// Circle characters
export const circles = {
  empty: String.fromCodePoint(0x25CB),        // ○
  filled: String.fromCodePoint(0x25CF),       // ●
  upperRight: String.fromCodePoint(0x25D4),   // ◔
  rightHalf: String.fromCodePoint(0x25D1),    // ◑
  lowerRight: String.fromCodePoint(0x25D5),   // ◕
  leftHalf: String.fromCodePoint(0x25D0),     // ◐
  upperHalf: String.fromCodePoint(0x25D3),    // ◓
  lowerHalf: String.fromCodePoint(0x25D2),    // ◒
};

// Star/sparkle characters
export const stars = {
  small: String.fromCodePoint(0x22C6),        // ⋆
  sparkle1: String.fromCodePoint(0x2727),     // ✧
  sparkle2: String.fromCodePoint(0x2726),     // ✦
  sparkle3: String.fromCodePoint(0x22B9),     // ⊹
  star6: String.fromCodePoint(0x2736),        // ✶
  star4: String.fromCodePoint(0x2734),        // ✴
  star8: String.fromCodePoint(0x2738),        // ✸
};

// Braille patterns for wave animation
export const braille = {
  wave: [
    String.fromCodePoint(0x28FE),  // ⣾
    String.fromCodePoint(0x28F7),  // ⣷
    String.fromCodePoint(0x28EF),  // ⣯
    String.fromCodePoint(0x28DF),  // ⣟
    String.fromCodePoint(0x287F),  // ⡿
    String.fromCodePoint(0x28BF),  // ⢿
    String.fromCodePoint(0x28FB),  // ⣻
    String.fromCodePoint(0x28FD),  // ⣽
  ],
  dots: [
    String.fromCodePoint(0x280B),  // ⠋
    String.fromCodePoint(0x2819),  // ⠙
    String.fromCodePoint(0x2839),  // ⠹
    String.fromCodePoint(0x2838),  // ⠸
    String.fromCodePoint(0x283C),  // ⠼
    String.fromCodePoint(0x2834),  // ⠴
    String.fromCodePoint(0x2826),  // ⠦
    String.fromCodePoint(0x2827),  // ⠧
    String.fromCodePoint(0x2807),  // ⠇
    String.fromCodePoint(0x280F),  // ⠏
  ],
};

// Bracket characters
export const brackets = {
  angleLeft: String.fromCodePoint(0x27E8),    // ⟨
  angleRight: String.fromCodePoint(0x27E9),   // ⟩
};

// Symbols
export const symbols = {
  check: String.fromCodePoint(0x2713),        // ✓
  cross: String.fromCodePoint(0x2717),        // ✗
  dot: String.fromCodePoint(0x00B7),          // ·
  bullet: String.fromCodePoint(0x2022),       // •
  arrow: String.fromCodePoint(0x2192),        // →
  line: String.fromCodePoint(0x2500),         // ─
  corner: String.fromCodePoint(0x2514),       // └
  pipe: String.fromCodePoint(0x2502),         // │
};

// Arrow characters
export const arrows = {
  right: String.fromCodePoint(0x2192),        // →
  left: String.fromCodePoint(0x2190),         // ←
  up: String.fromCodePoint(0x2191),           // ↑
  down: String.fromCodePoint(0x2193),         // ↓
  rightDouble: String.fromCodePoint(0x21D2),  // ⇒
  leftDouble: String.fromCodePoint(0x21D0),   // ⇐
  rightHook: String.fromCodePoint(0x21AA),    // ↪
  leftHook: String.fromCodePoint(0x21A9),     // ↩
};

// Box drawing characters for visual hierarchy
export const box = {
  horizontal: String.fromCodePoint(0x2500),   // ─
  vertical: String.fromCodePoint(0x2502),     // │
  topLeft: String.fromCodePoint(0x250C),      // ┌
  topRight: String.fromCodePoint(0x2510),     // ┐
  bottomLeft: String.fromCodePoint(0x2514),   // └
  bottomRight: String.fromCodePoint(0x2518),  // ┘
  branchRight: String.fromCodePoint(0x251C),  // ├
  branchLeft: String.fromCodePoint(0x2524),   // ┤
  branchDown: String.fromCodePoint(0x252C),   // ┬
  branchUp: String.fromCodePoint(0x2534),     // ┴
  cross: String.fromCodePoint(0x253C),        // ┼
  cornerRight: String.fromCodePoint(0x2514),  // └ (alias for bottomLeft)
};
