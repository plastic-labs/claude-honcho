import type { QueueStatus, QueueStatusResponse } from './types/api';
/**
 * Resolve an ID from either a string or an object with an `id` property.
 */
export declare function resolveId(obj: string | {
    id: string;
}): string;
/**
 * Interface for queue status objects that can be polled
 */
export interface PollableQueueStatus {
    pendingWorkUnits: number;
    inProgressWorkUnits: number;
}
/**
 * Transform a QueueStatusResponse to QueueStatus (snake_case to camelCase).
 */
export declare function transformQueueStatus(status: QueueStatusResponse): QueueStatus;
