/**
 * HttpClient.js — Fetch wrapper with throttling, retry, and exponential backoff.
 *
 * Provides static methods for fetching HTML pages (parsed into Documents),
 * binary data (as ArrayBuffers), and batch-fetching arrays of URLs with
 * configurable concurrency limits and per-request delays.
 *
 * Depends on: Util.js (for Util.sleep)
 */

"use strict";

class HttpClient {

    /** Default options for fetch operations */
    static DEFAULT_OPTIONS = Object.freeze({
        maxConcurrent: 5,
        delayMs: 200,
        maxRetries: 3,
        timeoutMs: 30000,
    });

    /**
     * Fetch a URL, parse the response as HTML, and return a Document.
     *
     * @param {string} url — The URL to fetch.
     * @param {Object} [options={}] — Fetch options.
     * @param {number} [options.maxRetries=3] — Maximum retry attempts on transient errors.
     * @param {number} [options.timeoutMs=30000] — Request timeout in milliseconds.
     * @param {Object} [options.headers] — Additional request headers.
     * @returns {Promise<Document>} The parsed HTML Document.
     * @throws {Error} On non-recoverable HTTP errors or exhausted retries.
     */
    static async fetchHtml(url, options = {}) {
        const opts = { ...HttpClient.DEFAULT_OPTIONS, ...options };
        const responseText = await HttpClient._fetchWithRetry(url, "text", opts);

        // Parse the HTML string into a DOM Document
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseText, "text/html");

        // Check for parser errors (DOMParser doesn't throw; it embeds <parsererror> nodes)
        const parserError = doc.querySelector("parsererror");
        if (parserError && doc.documentElement.nodeName === "html") {
            // HTML parser is lenient; parsererror is more common in XML mode.
            // For HTML mode this is rarely triggered, so just log a warning.
            console.warn(`[HttpClient] Parser warning for ${url}:`, parserError.textContent);
        }

        return doc;
    }

    /**
     * Fetch a URL and return the response as an ArrayBuffer (for images, fonts, etc.).
     *
     * @param {string} url — The URL to fetch.
     * @param {Object} [options={}] — Fetch options.
     * @param {number} [options.maxRetries=3] — Maximum retry attempts.
     * @param {number} [options.timeoutMs=30000] — Request timeout in milliseconds.
     * @param {Object} [options.headers] — Additional request headers.
     * @returns {Promise<ArrayBuffer>} The binary response data.
     * @throws {Error} On non-recoverable HTTP errors or exhausted retries.
     */
    static async fetchBinary(url, options = {}) {
        const opts = { ...HttpClient.DEFAULT_OPTIONS, ...options };
        return await HttpClient._fetchWithRetry(url, "arrayBuffer", opts);
    }

    /**
     * POST a JSON payload and return the parsed JSON response.
     *
     * @param {string} url - The URL to post to.
     * @param {Object} payload - JSON-serializable request body.
     * @param {Object} [options={}] - Fetch options.
     * @returns {Promise<Object>} Parsed JSON response.
     */
    static async postJson(url, payload, options = {}) {
        const opts = { ...HttpClient.DEFAULT_OPTIONS, ...options };
        const responseText = await HttpClient._fetchWithRetry(url, "text", {
            ...opts,
            method: "POST",
            body: JSON.stringify(payload || {}),
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                ...(opts.headers || {}),
            },
        });

        try {
            return JSON.parse(responseText);
        } catch (error) {
            throw new Error(`[HttpClient] Invalid JSON response from ${url}: ${error.message}`);
        }
    }

    /**
     * Process an array of URLs with a concurrency limit and inter-request delay.
     *
     * Executes `fetchFn(url)` for each URL, with at most `maxConcurrent` requests
     * in flight simultaneously, and a `delayMs` pause between starting new requests.
     *
     * @param {string[]} urls — Array of URLs to process.
     * @param {function(string): Promise<*>} fetchFn — Async function to call for each URL.
     *   Receives the URL as its sole argument and returns the fetched result.
     * @param {Object} [options={}] — Throttling options.
     * @param {number} [options.maxConcurrent=5] — Maximum number of concurrent requests.
     * @param {number} [options.delayMs=200] — Delay in ms between starting each request.
     * @param {function(number, number, string, *): void} [progressCallback] — Called after
     *   each URL completes: (completedCount, totalCount, url, result).
     * @returns {Promise<Map<string, {result: *, error: Error}>>} A Map from URL to its
     *   result or error. Each entry has either `result` or `error` populated.
     */
    static async fetchWithThrottle(urls, fetchFn, options = {}, progressCallback = null) {
        const opts = { ...HttpClient.DEFAULT_OPTIONS, ...options };
        const results = new Map();
        let completedCount = 0;
        const total = urls.length;

        if (total === 0) {
            return results;
        }

        // Semaphore-style concurrency control
        let activeCount = 0;
        let urlIndex = 0;

        return new Promise((resolveAll) => {
            /**
             * Launch the next available URL, respecting the concurrency limit.
             */
            const launchNext = async () => {
                while (urlIndex < total && activeCount < opts.maxConcurrent) {
                    const currentIndex = urlIndex++;
                    const url = urls[currentIndex];
                    activeCount++;

                    // Add inter-request delay (skip for the very first request)
                    if (currentIndex > 0 && opts.delayMs > 0) {
                        await Util.sleep(opts.delayMs);
                    }

                    // Launch the fetch (don't await — let it run concurrently)
                    HttpClient._executeOne(url, fetchFn, results).then((result) => {
                        activeCount--;
                        completedCount++;

                        if (progressCallback) {
                            try {
                                const entry = results.get(url);
                                progressCallback(completedCount, total, url, entry.result);
                            } catch (e) {
                                console.warn("[HttpClient] Progress callback error:", e);
                            }
                        }

                        if (completedCount === total) {
                            resolveAll(results);
                        } else {
                            launchNext();
                        }
                    });
                }
            };

            launchNext();
        });
    }

    // ─── Internal Helpers ────────────────────────────────────────────

    /**
     * Execute a single fetch operation and store the result.
     * @private
     */
    static async _executeOne(url, fetchFn, results) {
        try {
            const result = await fetchFn(url);
            results.set(url, { result, error: null });
            return result;
        } catch (error) {
            console.error(`[HttpClient] Failed to fetch: ${url}`, error.message);
            results.set(url, { result: null, error });
            return null;
        }
    }

    /**
     * Fetch a URL with retry and exponential backoff.
     * @private
     * @param {string} url — The URL.
     * @param {"text"|"arrayBuffer"} responseType — How to read the response body.
     * @param {Object} opts — Merged options.
     * @returns {Promise<string|ArrayBuffer>}
     */
    static async _fetchWithRetry(url, responseType, opts) {
        let lastError = null;

        for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
            try {
                // Build the fetch init object
                const fetchInit = {
                    method: opts.method || "GET",
                    credentials: opts.credentials || "include",
                };

                if (opts.headers) {
                    fetchInit.headers = opts.headers;
                }
                if (opts.body !== undefined) {
                    fetchInit.body = opts.body;
                }

                // Create an AbortController for timeout
                const controller = new AbortController();
                fetchInit.signal = controller.signal;
                const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

                let response;
                try {
                    response = await fetch(url, fetchInit);
                } finally {
                    clearTimeout(timeoutId);
                }

                // Handle HTTP error statuses
                if (!response.ok) {
                    const errorMessage = HttpClient._buildHttpErrorMessage(response.status, url);

                    // Non-retryable status codes
                    if (response.status === 404) {
                        throw new Error(errorMessage);
                    }
                    if (response.status === 403) {
                        throw new Error(errorMessage);
                    }

                    // Retryable status codes (429, 500, 502, 503, 504)
                    if (HttpClient._isRetryableStatus(response.status)) {
                        // Check for Retry-After header on 429
                        if (response.status === 429) {
                            const retryAfter = response.headers.get("Retry-After");
                            if (retryAfter) {
                                const waitSec = parseInt(retryAfter, 10);
                                if (!isNaN(waitSec) && waitSec > 0 && waitSec <= 120) {
                                    await Util.sleep(waitSec * 1000);
                                    continue;
                                }
                            }
                        }
                        throw new HttpRetryableError(errorMessage, response.status);
                    }

                    // Other errors are not retried
                    throw new Error(errorMessage);
                }

                // Read the response body
                if (responseType === "arrayBuffer") {
                    return await response.arrayBuffer();
                } else {
                    return await response.text();
                }

            } catch (error) {
                lastError = error;

                // Don't retry on non-retryable errors (unless it's a network/timeout error)
                const isRetryable = (
                    error instanceof HttpRetryableError ||
                    error.name === "AbortError" ||
                    error.name === "TypeError"   // Network errors in fetch
                );

                if (!isRetryable || attempt >= opts.maxRetries) {
                    break;
                }

                // Exponential backoff: 1s, 2s, 4s, ...
                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
                console.warn(
                    `[HttpClient] Retry ${attempt + 1}/${opts.maxRetries} for ${url} ` +
                    `(waiting ${backoffMs}ms): ${error.message}`
                );
                await Util.sleep(backoffMs);
            }
        }

        throw lastError || new Error(`[HttpClient] Failed to fetch ${url} after ${opts.maxRetries} retries`);
    }

    /**
     * Build a descriptive error message for an HTTP error status.
     * @private
     */
    static _buildHttpErrorMessage(status, url) {
        const messages = {
            400: "Bad Request",
            401: "Unauthorized — authentication required",
            403: "Forbidden — access denied by the server",
            404: "Not Found — the page does not exist",
            405: "Method Not Allowed",
            408: "Request Timeout",
            410: "Gone — the resource has been permanently removed",
            429: "Too Many Requests — rate limited by the server",
            500: "Internal Server Error",
            502: "Bad Gateway",
            503: "Service Unavailable — the server is temporarily down",
            504: "Gateway Timeout",
        };
        const description = messages[status] || `HTTP Error`;
        return `[HttpClient] ${status} ${description}: ${url}`;
    }

    /**
     * Determine whether an HTTP status code is retryable.
     * @private
     */
    static _isRetryableStatus(status) {
        return [429, 500, 502, 503, 504].includes(status);
    }
}

/**
 * Custom error class for retryable HTTP failures.
 * Used internally to distinguish retryable errors from permanent ones.
 */
class HttpRetryableError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "HttpRetryableError";
        this.status = status;
    }
}

// Export for browser script-tag loading
window.HttpClient = HttpClient;
window.HttpRetryableError = HttpRetryableError;
