"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveId = resolveId;
exports.transformQueueStatus = transformQueueStatus;
/**
 * Resolve an ID from either a string or an object with an `id` property.
 */
function resolveId(obj) {
    return typeof obj === 'string' ? obj : obj.id;
}
/**
 * Transform a SessionQueueStatusResponse to SessionQueueStatus (snake_case to camelCase).
 */
function transformSessionQueueStatus(status) {
    return {
        sessionId: status.session_id,
        totalWorkUnits: status.total_work_units,
        completedWorkUnits: status.completed_work_units,
        inProgressWorkUnits: status.in_progress_work_units,
        pendingWorkUnits: status.pending_work_units,
    };
}
/**
 * Transform a QueueStatusResponse to QueueStatus (snake_case to camelCase).
 */
function transformQueueStatus(status) {
    const sessions = status.sessions
        ? Object.fromEntries(Object.entries(status.sessions).map(([key, value]) => [
            key,
            transformSessionQueueStatus(value),
        ]))
        : undefined;
    return {
        totalWorkUnits: status.total_work_units,
        completedWorkUnits: status.completed_work_units,
        inProgressWorkUnits: status.in_progress_work_units,
        pendingWorkUnits: status.pending_work_units,
        sessions,
    };
}
