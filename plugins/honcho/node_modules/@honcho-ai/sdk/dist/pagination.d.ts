import type { PageResponse } from './types/api';
/**
 * Function type for fetching the next page of results.
 */
export type NextPageFetcher<T> = (page: number, size: number) => Promise<PageResponse<T>>;
/**
 * Generic paginated result wrapper for Honcho SDK.
 * Provides async iteration and transformation capabilities.
 */
export declare class Page<T, TOriginal = T> implements AsyncIterable<T> {
    private _data;
    private _transformFunc?;
    private _fetchNextPage?;
    /**
     * Initialize a new Page.
     *
     * @param data - The page response data
     * @param transformFunc - Optional function to transform objects from the original type to type T.
     *                        If not provided, objects are passed through unchanged.
     * @param fetchNextPage - Optional function to fetch the next page of results.
     */
    constructor(data: PageResponse<TOriginal>, transformFunc?: (item: TOriginal) => T, fetchNextPage?: NextPageFetcher<TOriginal>);
    /**
     * Create a Page from raw response data.
     */
    static from<T>(data: PageResponse<T>, fetchNextPage?: NextPageFetcher<T>): Page<T, T>;
    /**
     * Create a Page with a transformation function.
     */
    static fromWithTransform<T, TOriginal>(data: PageResponse<TOriginal>, transformFunc: (item: TOriginal) => T, fetchNextPage?: NextPageFetcher<TOriginal>): Page<T, TOriginal>;
    /**
     * Async iterator for all transformed items across all pages.
     *
     * **Warning:** This iterator automatically fetches ALL subsequent pages as you iterate.
     * For large datasets, this may result in many API calls. If you only need
     * the current page, use the `items` property instead.
     */
    [Symbol.asyncIterator](): AsyncIterator<T>;
    /**
     * Get a transformed item by index on the current page.
     */
    get(index: number): T;
    /**
     * Get the number of items on the current page.
     */
    get length(): number;
    /**
     * Get all transformed items on the current page.
     */
    get items(): T[];
    /**
     * Get the total number of items across all pages.
     */
    get total(): number;
    /**
     * Get the current page number (1-indexed).
     */
    get page(): number;
    /**
     * Get the page size.
     */
    get size(): number;
    /**
     * Get the total number of pages.
     */
    get pages(): number;
    /**
     * Check if there's a next page.
     */
    get hasNextPage(): boolean;
    /**
     * Fetch the next page of results.
     * Returns null if there are no more pages or if no fetch function is provided.
     */
    getNextPage(): Promise<Page<T, TOriginal> | null>;
    /**
     * Collect all items from all pages into an array.
     */
    toArray(): Promise<T[]>;
}
