/**
 * Parse Server-Sent Events from a Response body.
 *
 * Yields parsed JSON data from each "data:" line in the SSE stream.
 */
export declare function parseSSE<T>(response: Response): AsyncGenerator<T, void, undefined>;
/**
 * Chunk data from the dialectic streaming endpoint.
 */
export interface DialecticStreamChunk {
    done: boolean;
    delta: {
        content?: string;
    };
}
/**
 * Async iterable wrapper for dialectic streaming responses.
 *
 * Provides a convenient interface for iterating over streaming content
 * and collecting the final response.
 */
export declare class DialecticStreamResponse implements AsyncIterable<string> {
    private generator;
    private chunks;
    private consumed;
    constructor(generator: AsyncGenerator<string, void, undefined>);
    /**
     * Iterate over content chunks as they arrive.
     */
    [Symbol.asyncIterator](): AsyncGenerator<string, void, undefined>;
    /**
     * Get the complete response after streaming finishes.
     */
    getFinalResponse(): Promise<string>;
    /**
     * Collect all chunks into an array.
     */
    toArray(): Promise<string[]>;
}
/**
 * Create a DialecticStreamResponse from an SSE response.
 */
export declare function createDialecticStream(response: Response): DialecticStreamResponse;
