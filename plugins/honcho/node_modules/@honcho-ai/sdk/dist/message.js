"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
/**
 * A message in a Honcho session.
 */
class Message {
    constructor(id, content, peerId, sessionId, workspaceId, metadata, createdAt, tokenCount) {
        this.id = id;
        this.content = content;
        this.peerId = peerId;
        this.sessionId = sessionId;
        this.workspaceId = workspaceId;
        this.metadata = metadata;
        this.createdAt = createdAt;
        this.tokenCount = tokenCount;
    }
    /**
     * Create a Message from an API response.
     */
    static fromApiResponse(data) {
        return new Message(data.id, data.content, data.peer_id, data.session_id, data.workspace_id, data.metadata, data.created_at, data.token_count);
    }
    toString() {
        const truncatedContent = this.content.length > 50
            ? `${this.content.slice(0, 50)}...`
            : this.content;
        return `Message(id='${this.id}', peerId='${this.peerId}', content='${truncatedContent}')`;
    }
}
exports.Message = Message;
