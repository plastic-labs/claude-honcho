"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Page = void 0;
/**
 * Generic paginated result wrapper for Honcho SDK.
 * Provides async iteration and transformation capabilities.
 */
class Page {
    /**
     * Initialize a new Page.
     *
     * @param data - The page response data
     * @param transformFunc - Optional function to transform objects from the original type to type T.
     *                        If not provided, objects are passed through unchanged.
     * @param fetchNextPage - Optional function to fetch the next page of results.
     */
    constructor(data, transformFunc, fetchNextPage) {
        this._data = data;
        this._transformFunc = transformFunc;
        this._fetchNextPage = fetchNextPage;
    }
    /**
     * Create a Page from raw response data.
     */
    static from(data, fetchNextPage) {
        return new Page(data, undefined, fetchNextPage);
    }
    /**
     * Create a Page with a transformation function.
     */
    static fromWithTransform(data, transformFunc, fetchNextPage) {
        return new Page(data, transformFunc, fetchNextPage);
    }
    /**
     * Async iterator for all transformed items across all pages.
     *
     * **Warning:** This iterator automatically fetches ALL subsequent pages as you iterate.
     * For large datasets, this may result in many API calls. If you only need
     * the current page, use the `items` property instead.
     */
    async *[Symbol.asyncIterator]() {
        // Yield items from current page
        for (const item of this._data.items) {
            yield this._transformFunc
                ? this._transformFunc(item)
                : item;
        }
        // Fetch and yield items from subsequent pages
        let currentPage = this;
        while (currentPage.hasNextPage) {
            const nextPage = await currentPage.getNextPage();
            if (!nextPage)
                break;
            currentPage = nextPage;
            for (const item of nextPage._data.items) {
                yield nextPage._transformFunc
                    ? nextPage._transformFunc(item)
                    : item;
            }
        }
    }
    /**
     * Get a transformed item by index on the current page.
     */
    get(index) {
        const items = this._data.items || [];
        if (index < 0 || index >= items.length) {
            throw new RangeError(`Index ${index} is out of bounds for page with ${items.length} items`);
        }
        const item = items[index];
        return this._transformFunc
            ? this._transformFunc(item)
            : item;
    }
    /**
     * Get the number of items on the current page.
     */
    get length() {
        return this._data.items?.length ?? 0;
    }
    /**
     * Get all transformed items on the current page.
     */
    get items() {
        const items = this._data.items || [];
        return this._transformFunc
            ? items.map(this._transformFunc)
            : items;
    }
    /**
     * Get the total number of items across all pages.
     */
    get total() {
        return this._data.total;
    }
    /**
     * Get the current page number (1-indexed).
     */
    get page() {
        return this._data.page;
    }
    /**
     * Get the page size.
     */
    get size() {
        return this._data.size;
    }
    /**
     * Get the total number of pages.
     */
    get pages() {
        return this._data.pages;
    }
    /**
     * Check if there's a next page.
     */
    get hasNextPage() {
        return this._data.page < this._data.pages;
    }
    /**
     * Fetch the next page of results.
     * Returns null if there are no more pages or if no fetch function is provided.
     */
    async getNextPage() {
        if (!this.hasNextPage || !this._fetchNextPage) {
            return null;
        }
        const nextPageData = await this._fetchNextPage(this._data.page + 1, this._data.size);
        return new Page(nextPageData, this._transformFunc, this._fetchNextPage);
    }
    /**
     * Collect all items from all pages into an array.
     */
    async toArray() {
        const allItems = [];
        for await (const item of this) {
            allItems.push(item);
        }
        return allItems;
    }
}
exports.Page = Page;
