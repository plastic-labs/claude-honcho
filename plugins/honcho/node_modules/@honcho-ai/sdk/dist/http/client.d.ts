export interface HonchoHTTPClientConfig {
    baseURL: string;
    apiKey?: string;
    timeout?: number;
    maxRetries?: number;
    defaultHeaders?: Record<string, string>;
    defaultQuery?: Record<string, string | number | boolean | undefined>;
}
export interface RequestOptions {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
}
/**
 * Minimal HTTP client for the Honcho API with retry logic and timeout support.
 */
export declare class HonchoHTTPClient {
    readonly baseURL: string;
    readonly apiKey?: string;
    readonly timeout: number;
    readonly maxRetries: number;
    readonly defaultHeaders: Record<string, string>;
    readonly defaultQuery?: Record<string, string | number | boolean | undefined>;
    constructor(config: HonchoHTTPClientConfig);
    /**
     * Make an HTTP request with automatic retries and timeout handling.
     */
    request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
    /**
     * Make a GET request.
     */
    get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
    /**
     * Make a POST request.
     */
    post<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * Make a PUT request.
     */
    put<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * Make a PATCH request.
     */
    patch<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * Make a DELETE request.
     * Most DELETE endpoints return no content (204), so the default return type is void.
     * For endpoints that return data, specify the type parameter explicitly.
     */
    delete(path: string, options?: RequestOptions): Promise<void>;
    delete<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * Make a streaming request that returns a Response object for SSE parsing.
     */
    stream(method: string, path: string, options?: RequestOptions): Promise<Response>;
    /**
     * Make a multipart form data request (for file uploads).
     */
    upload<T>(path: string, formData: FormData, options?: Omit<RequestOptions, 'body'>): Promise<T>;
    private buildURL;
    private buildHeaders;
    private fetchWithTimeout;
    private parseErrorBody;
    private parseRetryAfter;
    private getRetryDelay;
    private sleep;
}
