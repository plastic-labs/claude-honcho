// src/styles.ts
var symbols = {
  check: String.fromCodePoint(10003),
  cross: String.fromCodePoint(10007),
  dot: String.fromCodePoint(183),
  bullet: String.fromCodePoint(8226),
  arrow: String.fromCodePoint(8594),
  line: String.fromCodePoint(9472),
  corner: String.fromCodePoint(9492),
  pipe: String.fromCodePoint(9474),
  sparkle: String.fromCodePoint(10022)
};
function honchoSessionUrl(workspace, sessionName) {
  return `https://app.honcho.dev/explore?workspace=${encodeURIComponent(workspace)}&view=sessions&session=${encodeURIComponent(sessionName)}`;
}

export { honchoSessionUrl };

//# debugId=E4C77F67F2ED227A64756E2164756E21
//# sourceMappingURL=chunk-49wja30f.js.map
