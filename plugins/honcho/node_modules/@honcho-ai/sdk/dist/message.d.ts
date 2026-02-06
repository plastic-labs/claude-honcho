import type { MessageResponse } from './types/api';
import type { MessageConfiguration } from './validation';
/**
 * Input for creating a message.
 *
 * This is the type returned by `Peer.message()` and accepted by
 * `Session.addMessages()`.
 */
export interface MessageInput {
    /** The peer ID who authored this message */
    peerId: string;
    /** The message content */
    content: string;
    /** Optional metadata to associate with the message */
    metadata?: Record<string, unknown>;
    /** Optional configuration for the message (reasoning settings) */
    configuration?: MessageConfiguration;
    /** Optional ISO 8601 timestamp for when the message was created */
    createdAt?: string;
}
/**
 * A message in a Honcho session.
 */
export declare class Message {
    /** Unique identifier for this message */
    readonly id: string;
    /** The message content */
    readonly content: string;
    /** The peer ID who authored this message */
    readonly peerId: string;
    /** The session ID this message belongs to */
    readonly sessionId: string;
    /** The workspace ID this message belongs to */
    readonly workspaceId: string;
    /** Metadata associated with this message */
    readonly metadata: Record<string, unknown>;
    /** ISO 8601 timestamp for when the message was created */
    readonly createdAt: string;
    /** Number of tokens in this message */
    readonly tokenCount: number;
    constructor(id: string, content: string, peerId: string, sessionId: string, workspaceId: string, metadata: Record<string, unknown>, createdAt: string, tokenCount: number);
    /**
     * Create a Message from an API response.
     */
    static fromApiResponse(data: MessageResponse): Message;
    toString(): string;
}
