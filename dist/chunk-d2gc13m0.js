import {
  require_client,
  require_conclusions,
  require_errors,
  require_message,
  require_pagination,
  require_peer,
  require_session,
  require_session_context,
  require_streaming
} from "./chunk-xdntcesh.js";
import {
  __commonJS
} from "./chunk-gnp95nzg.js";

// node_modules/@honcho-ai/sdk/dist/index.js
var require_dist = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Summary = exports.SessionSummaries = exports.SessionContext = exports.Session = exports.PeerContext = exports.Peer = exports.Page = exports.Message = exports.DialecticStreamResponse = exports.UnprocessableEntityError = exports.TimeoutError = exports.ServerError = exports.RateLimitError = exports.PermissionDeniedError = exports.NotFoundError = exports.HonchoError = exports.ConnectionError = exports.ConflictError = exports.BadRequestError = exports.AuthenticationError = exports.ConclusionScope = exports.Conclusion = exports.Honcho = undefined;
  var client_1 = require_client();
  Object.defineProperty(exports, "Honcho", { enumerable: true, get: function() {
    return client_1.Honcho;
  } });
  var conclusions_1 = require_conclusions();
  Object.defineProperty(exports, "Conclusion", { enumerable: true, get: function() {
    return conclusions_1.Conclusion;
  } });
  Object.defineProperty(exports, "ConclusionScope", { enumerable: true, get: function() {
    return conclusions_1.ConclusionScope;
  } });
  var errors_1 = require_errors();
  Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function() {
    return errors_1.AuthenticationError;
  } });
  Object.defineProperty(exports, "BadRequestError", { enumerable: true, get: function() {
    return errors_1.BadRequestError;
  } });
  Object.defineProperty(exports, "ConflictError", { enumerable: true, get: function() {
    return errors_1.ConflictError;
  } });
  Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function() {
    return errors_1.ConnectionError;
  } });
  Object.defineProperty(exports, "HonchoError", { enumerable: true, get: function() {
    return errors_1.HonchoError;
  } });
  Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function() {
    return errors_1.NotFoundError;
  } });
  Object.defineProperty(exports, "PermissionDeniedError", { enumerable: true, get: function() {
    return errors_1.PermissionDeniedError;
  } });
  Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function() {
    return errors_1.RateLimitError;
  } });
  Object.defineProperty(exports, "ServerError", { enumerable: true, get: function() {
    return errors_1.ServerError;
  } });
  Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function() {
    return errors_1.TimeoutError;
  } });
  Object.defineProperty(exports, "UnprocessableEntityError", { enumerable: true, get: function() {
    return errors_1.UnprocessableEntityError;
  } });
  var streaming_1 = require_streaming();
  Object.defineProperty(exports, "DialecticStreamResponse", { enumerable: true, get: function() {
    return streaming_1.DialecticStreamResponse;
  } });
  var message_1 = require_message();
  Object.defineProperty(exports, "Message", { enumerable: true, get: function() {
    return message_1.Message;
  } });
  var pagination_1 = require_pagination();
  Object.defineProperty(exports, "Page", { enumerable: true, get: function() {
    return pagination_1.Page;
  } });
  var peer_1 = require_peer();
  Object.defineProperty(exports, "Peer", { enumerable: true, get: function() {
    return peer_1.Peer;
  } });
  Object.defineProperty(exports, "PeerContext", { enumerable: true, get: function() {
    return peer_1.PeerContext;
  } });
  var session_1 = require_session();
  Object.defineProperty(exports, "Session", { enumerable: true, get: function() {
    return session_1.Session;
  } });
  var session_context_1 = require_session_context();
  Object.defineProperty(exports, "SessionContext", { enumerable: true, get: function() {
    return session_context_1.SessionContext;
  } });
  Object.defineProperty(exports, "SessionSummaries", { enumerable: true, get: function() {
    return session_context_1.SessionSummaries;
  } });
  Object.defineProperty(exports, "Summary", { enumerable: true, get: function() {
    return session_context_1.Summary;
  } });
});

// src/styles.ts
var colors = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  orange: "\x1B[38;5;208m",
  lightOrange: "\x1B[38;5;214m",
  peach: "\x1B[38;5;215m",
  palePeach: "\x1B[38;5;223m",
  paleBlue: "\x1B[38;5;195m",
  lightBlue: "\x1B[38;5;159m",
  skyBlue: "\x1B[38;5;117m",
  brightBlue: "\x1B[38;5;81m",
  success: "\x1B[38;5;114m",
  error: "\x1B[38;5;203m",
  warn: "\x1B[38;5;214m",
  white: "\x1B[38;5;255m",
  gray: "\x1B[38;5;245m"
};
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
function header(text) {
  const line = symbols.line.repeat(text.length);
  return `${colors.orange}${text}${colors.reset}
${colors.dim}${line}${colors.reset}`;
}
function section(text) {
  return `${colors.lightBlue}${text}${colors.reset}`;
}
function label(text) {
  return `${colors.skyBlue}${text}${colors.reset}`;
}
function dim(text) {
  return `${colors.dim}${text}${colors.reset}`;
}
function success(message) {
  return `${colors.success}${symbols.check}${colors.reset} ${message}`;
}
function error(message) {
  return `${colors.error}${symbols.cross}${colors.reset} ${message}`;
}
function warn(message) {
  return `${colors.warn}!${colors.reset} ${message}`;
}
function listItem(text, indent = 0) {
  const padding = "  ".repeat(indent);
  return `${padding}${colors.dim}${symbols.bullet}${colors.reset} ${text}`;
}

export { require_dist, header, section, label, dim, success, error, warn, listItem };

//# debugId=929275ED766AF3DE64756E2164756E21
//# sourceMappingURL=chunk-d2gc13m0.js.map
