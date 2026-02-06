"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionError = exports.TimeoutError = exports.ServerError = exports.RateLimitError = exports.NotFoundError = exports.UnprocessableEntityError = exports.ConflictError = exports.PermissionDeniedError = exports.AuthenticationError = exports.BadRequestError = exports.HonchoError = void 0;
exports.createErrorFromResponse = createErrorFromResponse;
/**
 * Base error class for all Honcho SDK errors.
 */
class HonchoError extends Error {
    constructor(message, status, options) {
        super(message);
        this.name = 'HonchoError';
        this.status = status;
        this.code = options?.code;
        this.body = options?.body;
    }
}
exports.HonchoError = HonchoError;
/**
 * Error thrown when request validation fails (400).
 */
class BadRequestError extends HonchoError {
    constructor(message, body) {
        super(message, 400, { code: 'bad_request', body });
        this.name = 'BadRequestError';
    }
}
exports.BadRequestError = BadRequestError;
/**
 * Error thrown when authentication fails (401).
 */
class AuthenticationError extends HonchoError {
    constructor(message = 'Authentication failed') {
        super(message, 401, { code: 'authentication_error' });
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * Error thrown when the user lacks permission (403).
 */
class PermissionDeniedError extends HonchoError {
    constructor(message = 'Permission denied') {
        super(message, 403, { code: 'permission_denied' });
        this.name = 'PermissionDeniedError';
    }
}
exports.PermissionDeniedError = PermissionDeniedError;
/**
 * Error thrown on resource conflict (409).
 */
class ConflictError extends HonchoError {
    constructor(message = 'Resource conflict', body) {
        super(message, 409, { code: 'conflict', body });
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
/**
 * Error thrown when entity cannot be processed (422).
 */
class UnprocessableEntityError extends HonchoError {
    constructor(message = 'Unprocessable entity', body) {
        super(message, 422, { code: 'unprocessable_entity', body });
        this.name = 'UnprocessableEntityError';
    }
}
exports.UnprocessableEntityError = UnprocessableEntityError;
/**
 * Error thrown when a resource is not found (404).
 */
class NotFoundError extends HonchoError {
    constructor(message = 'Resource not found') {
        super(message, 404, { code: 'not_found' });
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
/**
 * Error thrown when rate limited (429).
 */
class RateLimitError extends HonchoError {
    constructor(message = 'Rate limit exceeded', retryAfter) {
        super(message, 429, { code: 'rate_limit_exceeded' });
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
/**
 * Error thrown on server errors (5xx).
 */
class ServerError extends HonchoError {
    constructor(message = 'Server error', status = 500) {
        super(message, status, { code: 'server_error' });
        this.name = 'ServerError';
    }
}
exports.ServerError = ServerError;
/**
 * Error thrown when a request times out.
 */
class TimeoutError extends HonchoError {
    constructor(message = 'Request timed out') {
        super(message, 0, { code: 'timeout' });
        this.name = 'TimeoutError';
    }
}
exports.TimeoutError = TimeoutError;
/**
 * Error thrown when a connection fails.
 */
class ConnectionError extends HonchoError {
    constructor(message = 'Connection failed') {
        super(message, 0, { code: 'connection_error' });
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
/**
 * Create the appropriate error type based on HTTP status code.
 */
function createErrorFromResponse(status, message, body, retryAfter) {
    switch (status) {
        case 400:
            return new BadRequestError(message, body);
        case 401:
            return new AuthenticationError(message);
        case 403:
            return new PermissionDeniedError(message);
        case 404:
            return new NotFoundError(message);
        case 409:
            return new ConflictError(message, body);
        case 422:
            return new UnprocessableEntityError(message, body);
        case 429:
            return new RateLimitError(message, retryAfter);
        default:
            if (status >= 500) {
                return new ServerError(message, status);
            }
            return new HonchoError(message, status, { body });
    }
}
