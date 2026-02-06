"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionContext = exports.SessionSummaries = exports.Summary = void 0;
const message_1 = require("./message");
/**
 * Represents a summary of a session's conversation.
 */
class Summary {
    constructor(data) {
        this.content = data.content;
        this.messageId = data.messageId;
        this.summaryType = data.summaryType;
        this.createdAt = data.createdAt;
        this.tokenCount = data.tokenCount;
    }
    static fromApiResponse(data) {
        return new Summary({
            content: data.content,
            messageId: data.message_id,
            summaryType: data.summary_type,
            createdAt: data.created_at,
            tokenCount: data.token_count,
        });
    }
}
exports.Summary = Summary;
/**
 * Contains both short and long summaries for a session.
 */
class SessionSummaries {
    /**
     * Alias for id - the session ID.
     */
    get sessionId() {
        return this.id;
    }
    constructor(id, shortSummary, longSummary) {
        this.id = id;
        this.shortSummary = shortSummary;
        this.longSummary = longSummary;
    }
    static fromApiResponse(data) {
        return new SessionSummaries(data.id, data.short_summary ? Summary.fromApiResponse(data.short_summary) : null, data.long_summary ? Summary.fromApiResponse(data.long_summary) : null);
    }
}
exports.SessionSummaries = SessionSummaries;
/**
 * Represents the context of a session containing a curated list of messages.
 *
 * The SessionContext provides methods to convert message history into formats
 * compatible with different LLM providers while staying within token limits
 * and providing optimal conversation context.
 */
class SessionContext {
    /**
     * Initialize a new SessionContext.
     *
     * @param sessionId ID of the session this context belongs to
     * @param messages List of Message objects to include in the context
     * @param summary Summary of the session history prior to the message cutoff
     * @param peerRepresentation The peer representation, if context is requested from a specific perspective
     * @param peerCard The peer card, if context is requested from a specific perspective
     */
    constructor(sessionId, messages, summary = null, peerRepresentation = null, peerCard = null) {
        this.sessionId = sessionId;
        this.messages = messages;
        this.summary = summary;
        this.peerRepresentation = peerRepresentation;
        this.peerCard = peerCard;
    }
    /**
     * Convert the context to OpenAI-compatible message format.
     *
     * Transforms the message history and summary into the format expected by
     * OpenAI's Chat Completions API, with proper role assignments based on the
     * assistant's identity.
     *
     * @param assistant The assistant peer (Peer object or peer ID string) to use
     *                  for determining message roles. Messages from this peer will
     *                  be marked as "assistant", others as "user"
     * @returns A list of dictionaries in OpenAI format, where each dictionary contains
     *          "role" and "content" keys suitable for the OpenAI API
     */
    toOpenAI(assistant) {
        const assistantId = typeof assistant === 'string' ? assistant : assistant.id;
        const messages = this.messages.map((message) => ({
            role: message.peerId === assistantId ? 'assistant' : 'user',
            name: message.peerId,
            content: message.content,
        }));
        const systemMessages = [];
        if (this.peerRepresentation) {
            systemMessages.push({
                role: 'system',
                content: `<peer_representation>${this.peerRepresentation}</peer_representation>`,
            });
        }
        if (this.peerCard) {
            systemMessages.push({
                role: 'system',
                content: `<peer_card>${this.peerCard}</peer_card>`,
            });
        }
        if (this.summary) {
            systemMessages.push({
                role: 'system',
                content: `<summary>${this.summary.content}</summary>`,
            });
        }
        return [...systemMessages, ...messages];
    }
    /**
     * Convert the context to Anthropic-compatible message format.
     *
     * Transforms the message history into the format expected by Anthropic's
     * Claude API, with proper role assignments based on the assistant's identity.
     *
     * @param assistant The assistant peer (Peer object or peer ID string) to use
     *                  for determining message roles. Messages from this peer will
     *                  be marked as "assistant", others as "user"
     * @returns A list of dictionaries in Anthropic format, where each dictionary contains
     *          "role" and "content" keys suitable for the Anthropic API
     *
     * Note:
     *   Future versions may implement role alternation requirements for
     *   Anthropic's API compatibility
     */
    toAnthropic(assistant) {
        const assistantId = typeof assistant === 'string' ? assistant : assistant.id;
        const messages = this.messages.map((message) => message.peerId === assistantId
            ? {
                role: 'assistant',
                content: message.content,
            }
            : {
                role: 'user',
                content: `${message.peerId}: ${message.content}`,
            });
        const systemMessages = [];
        if (this.peerRepresentation) {
            systemMessages.push({
                role: 'user',
                content: `<peer_representation>${this.peerRepresentation}</peer_representation>`,
            });
        }
        if (this.peerCard) {
            systemMessages.push({
                role: 'user',
                content: `<peer_card>${this.peerCard}</peer_card>`,
            });
        }
        if (this.summary) {
            systemMessages.push({
                role: 'user',
                content: `<summary>${this.summary.content}</summary>`,
            });
        }
        return [...systemMessages, ...messages];
    }
    /**
     * Return the number of messages in the context.
     */
    get length() {
        return this.messages.length + (this.summary ? 1 : 0);
    }
    /**
     * Create a SessionContext from an API response.
     */
    static fromApiResponse(sessionId, data) {
        return new SessionContext(sessionId, data.messages.map(message_1.Message.fromApiResponse), data.summary ? Summary.fromApiResponse(data.summary) : null, data.peer_representation ?? null, data.peer_card ?? null);
    }
    /**
     * Return a string representation of the SessionContext.
     */
    toString() {
        return `SessionContext(messages=${this.messages.length}, summary=${this.summary ? 'present' : 'none'})`;
    }
}
exports.SessionContext = SessionContext;
