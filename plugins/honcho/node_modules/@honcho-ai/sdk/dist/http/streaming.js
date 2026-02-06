"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DialecticStreamResponse = void 0;
exports.parseSSE = parseSSE;
exports.createDialecticStream = createDialecticStream;
/**
 * Parse Server-Sent Events from a Response body.
 *
 * Yields parsed JSON data from each "data:" line in the SSE stream.
 */
async function* parseSSE(response) {
    if (!response.body) {
        throw new Error('Response body is null');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6); // Remove "data: " prefix
                    if (jsonStr.trim() === '[DONE]') {
                        return;
                    }
                    try {
                        const data = JSON.parse(jsonStr);
                        yield data;
                    }
                    catch {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        // Process any remaining data in the buffer
        if (buffer.startsWith('data: ')) {
            const jsonStr = buffer.slice(6);
            if (jsonStr.trim() !== '[DONE]') {
                try {
                    const data = JSON.parse(jsonStr);
                    yield data;
                }
                catch {
                    // Skip invalid JSON
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
/**
 * Async iterable wrapper for dialectic streaming responses.
 *
 * Provides a convenient interface for iterating over streaming content
 * and collecting the final response.
 */
class DialecticStreamResponse {
    constructor(generator) {
        this.chunks = [];
        this.consumed = false;
        this.generator = generator;
    }
    /**
     * Iterate over content chunks as they arrive.
     */
    async *[Symbol.asyncIterator]() {
        if (this.consumed) {
            // If already consumed, yield from cached chunks
            for (const chunk of this.chunks) {
                yield chunk;
            }
            return;
        }
        for await (const chunk of this.generator) {
            this.chunks.push(chunk);
            yield chunk;
        }
        this.consumed = true;
    }
    /**
     * Get the complete response after streaming finishes.
     */
    async getFinalResponse() {
        if (!this.consumed) {
            for await (const _ of this) {
                // Consume all chunks
            }
        }
        return this.chunks.join('');
    }
    /**
     * Collect all chunks into an array.
     */
    async toArray() {
        if (!this.consumed) {
            for await (const _ of this) {
                // Consume all chunks
            }
        }
        return [...this.chunks];
    }
}
exports.DialecticStreamResponse = DialecticStreamResponse;
/**
 * Create a DialecticStreamResponse from an SSE response.
 */
function createDialecticStream(response) {
    async function* streamContent() {
        for await (const chunk of parseSSE(response)) {
            if (chunk.done) {
                return;
            }
            const content = chunk.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
    return new DialecticStreamResponse(streamContent());
}
