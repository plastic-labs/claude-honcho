/**
 * Base error class for all Honcho SDK errors.
 */
export declare class HonchoError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly body?: unknown;
    constructor(message: string, status: number, options?: {
        code?: string;
        body?: unknown;
    });
}
/**
 * Error thrown when request validation fails (400).
 */
export declare class BadRequestError extends HonchoError {
    constructor(message: string, body?: unknown);
}
/**
 * Error thrown when authentication fails (401).
 */
export declare class AuthenticationError extends HonchoError {
    constructor(message?: string);
}
/**
 * Error thrown when the user lacks permission (403).
 */
export declare class PermissionDeniedError extends HonchoError {
    constructor(message?: string);
}
/**
 * Error thrown on resource conflict (409).
 */
export declare class ConflictError extends HonchoError {
    constructor(message?: string, body?: unknown);
}
/**
 * Error thrown when entity cannot be processed (422).
 */
export declare class UnprocessableEntityError extends HonchoError {
    constructor(message?: string, body?: unknown);
}
/**
 * Error thrown when a resource is not found (404).
 */
export declare class NotFoundError extends HonchoError {
    constructor(message?: string);
}
/**
 * Error thrown when rate limited (429).
 */
export declare class RateLimitError extends HonchoError {
    readonly retryAfter?: number;
    constructor(message?: string, retryAfter?: number);
}
/**
 * Error thrown on server errors (5xx).
 */
export declare class ServerError extends HonchoError {
    constructor(message?: string, status?: number);
}
/**
 * Error thrown when a request times out.
 */
export declare class TimeoutError extends HonchoError {
    constructor(message?: string);
}
/**
 * Error thrown when a connection fails.
 */
export declare class ConnectionError extends HonchoError {
    constructor(message?: string);
}
/**
 * Create the appropriate error type based on HTTP status code.
 */
export declare function createErrorFromResponse(status: number, message: string, body?: unknown, retryAfter?: number): HonchoError;
