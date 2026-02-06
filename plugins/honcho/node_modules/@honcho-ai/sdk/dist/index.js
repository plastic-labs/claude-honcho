"use strict";
// Main entry point for the Honcho TypeScript SDK
// Exports all main classes and types
Object.defineProperty(exports, "__esModule", { value: true });
exports.Summary = exports.SessionSummaries = exports.SessionContext = exports.Session = exports.PeerContext = exports.Peer = exports.Page = exports.Message = exports.DialecticStreamResponse = exports.UnprocessableEntityError = exports.TimeoutError = exports.ServerError = exports.RateLimitError = exports.PermissionDeniedError = exports.NotFoundError = exports.HonchoError = exports.ConnectionError = exports.ConflictError = exports.BadRequestError = exports.AuthenticationError = exports.ConclusionScope = exports.Conclusion = exports.Honcho = void 0;
// Domain classes
var client_1 = require("./client");
Object.defineProperty(exports, "Honcho", { enumerable: true, get: function () { return client_1.Honcho; } });
var conclusions_1 = require("./conclusions");
Object.defineProperty(exports, "Conclusion", { enumerable: true, get: function () { return conclusions_1.Conclusion; } });
Object.defineProperty(exports, "ConclusionScope", { enumerable: true, get: function () { return conclusions_1.ConclusionScope; } });
// HTTP infrastructure
var errors_1 = require("./http/errors");
Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function () { return errors_1.AuthenticationError; } });
Object.defineProperty(exports, "BadRequestError", { enumerable: true, get: function () { return errors_1.BadRequestError; } });
Object.defineProperty(exports, "ConflictError", { enumerable: true, get: function () { return errors_1.ConflictError; } });
Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function () { return errors_1.ConnectionError; } });
Object.defineProperty(exports, "HonchoError", { enumerable: true, get: function () { return errors_1.HonchoError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return errors_1.NotFoundError; } });
Object.defineProperty(exports, "PermissionDeniedError", { enumerable: true, get: function () { return errors_1.PermissionDeniedError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_1.RateLimitError; } });
Object.defineProperty(exports, "ServerError", { enumerable: true, get: function () { return errors_1.ServerError; } });
Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function () { return errors_1.TimeoutError; } });
Object.defineProperty(exports, "UnprocessableEntityError", { enumerable: true, get: function () { return errors_1.UnprocessableEntityError; } });
// Streaming types
var streaming_1 = require("./http/streaming");
Object.defineProperty(exports, "DialecticStreamResponse", { enumerable: true, get: function () { return streaming_1.DialecticStreamResponse; } });
var message_1 = require("./message");
Object.defineProperty(exports, "Message", { enumerable: true, get: function () { return message_1.Message; } });
var pagination_1 = require("./pagination");
Object.defineProperty(exports, "Page", { enumerable: true, get: function () { return pagination_1.Page; } });
var peer_1 = require("./peer");
Object.defineProperty(exports, "Peer", { enumerable: true, get: function () { return peer_1.Peer; } });
Object.defineProperty(exports, "PeerContext", { enumerable: true, get: function () { return peer_1.PeerContext; } });
var session_1 = require("./session");
Object.defineProperty(exports, "Session", { enumerable: true, get: function () { return session_1.Session; } });
var session_context_1 = require("./session_context");
Object.defineProperty(exports, "SessionContext", { enumerable: true, get: function () { return session_context_1.SessionContext; } });
Object.defineProperty(exports, "SessionSummaries", { enumerable: true, get: function () { return session_context_1.SessionSummaries; } });
Object.defineProperty(exports, "Summary", { enumerable: true, get: function () { return session_context_1.Summary; } });
