/**
 * ImageCollector.js — Discovers, downloads, deduplicates, and embeds images for EPUB.
 *
 * Scans DOM elements for <img> tags, downloads the images as binary data,
 * generates EpubItem entries with sequential IDs, and rewrites <img> src
 * attributes to point to the EPUB-local image paths.
 *
 * Depends on:
 *   - Util.js
 *   - EpubItem.js
 *   - HttpClient.js
 */

"use strict";

class ImageCollector {

    /**
     * Create a new ImageCollector.
     * The internal image map tracks discovered images by their absolute URL.
     */
    constructor() {
        /**
         * Map of absolute image URL → image record.
         * Each record: { url, extension, mimeType, id, data (ArrayBuffer|null), zipPath }
         * @type {Map<string, Object>}
         */
        this._imageMap = new Map();

        /** Counter for generating sequential image IDs */
        this._nextIndex = 1;
    }

    /**
     * Scan a DOM element for all <img> elements and register their URLs.
     * Normalizes relative URLs against the provided base URL.
     * Duplicate URLs are automatically skipped (deduplication by absolute URL).
     *
     * @param {Element} contentElement — The DOM element to scan.
     * @param {string} baseUrl — The base URL of the page (for resolving relative paths).
     * @returns {number} The number of newly discovered (non-duplicate) images.
     */
    collectImages(contentElement, baseUrl) {
        if (!contentElement || !(contentElement instanceof Element)) {
            return 0;
        }

        const imgs = contentElement.querySelectorAll("img");
        let newCount = 0;

        for (const img of imgs) {
            const rawSrc = img.getAttribute("src") || img.getAttribute("data-src") || "";
            if (!rawSrc || rawSrc.startsWith("data:")) {
                // Skip empty srcs and data URIs (inline images)
                continue;
            }

            // Resolve relative URLs to absolute
            const absoluteUrl = Util.resolveUrl(baseUrl, rawSrc);

            // Skip if we already know about this URL (deduplication)
            if (this._imageMap.has(absoluteUrl)) {
                continue;
            }

            // Determine the file extension and MIME type
            let extension = Util.getFileExtension(absoluteUrl);
            if (!extension) {
                // Default to jpg if we can't determine the extension
                extension = "jpg";
            }
            const mimeType = Util.getMimeType(extension);

            // Generate a sequential ID: image0001, image0002, ...
            const id = "image" + String(this._nextIndex).padStart(4, "0");
            const zipPath = `OEBPS/Images/${id}.${extension}`;
            this._nextIndex++;

            this._imageMap.set(absoluteUrl, {
                url: absoluteUrl,
                originalSrc: rawSrc,
                extension,
                mimeType,
                id,
                data: null,
                zipPath,
            });

            newCount++;
        }

        return newCount;
    }

    /**
     * Download all discovered images that haven't been downloaded yet.
     *
     * @param {function(number, number, string): void} [progressCallback] — Called after
     *   each image download: (completedCount, totalCount, url).
     * @returns {Promise<{success: number, failed: number}>} Summary of download results.
     */
    async downloadImages(progressCallback = null) {
        // Collect URLs of images that still need downloading
        const pendingUrls = [];
        for (const [url, record] of this._imageMap) {
            if (record.data === null) {
                pendingUrls.push(url);
            }
        }

        if (pendingUrls.length === 0) {
            return { success: 0, failed: 0 };
        }

        let successCount = 0;
        let failedCount = 0;

        // Use HttpClient's throttled fetcher for concurrency control
        const results = await HttpClient.fetchWithThrottle(
            pendingUrls,
            (url) => HttpClient.fetchBinary(url),
            { maxConcurrent: 5, delayMs: 100, maxRetries: 2 },
            (completed, total, url, _result) => {
                if (progressCallback) {
                    progressCallback(completed, total, url);
                }
            }
        );

        // Store the downloaded data in our image records
        for (const [url, entry] of results) {
            const record = this._imageMap.get(url);
            if (!record) continue;

            if (entry.error || !entry.result) {
                console.warn(`[ImageCollector] Failed to download: ${url}`, entry.error?.message);
                failedCount++;
                // Remove failed images from the map so they don't appear in the EPUB
                this._imageMap.delete(url);
            } else {
                record.data = entry.result;
                successCount++;
            }
        }

        return { success: successCount, failed: failedCount };
    }

    /**
     * Build an array of EpubItem objects for all successfully downloaded images.
     *
     * @returns {EpubItem[]} Array of EpubItems with binary image content.
     */
    getEpubItems() {
        const items = [];
        for (const record of this._imageMap.values()) {
            if (record.data === null) {
                // Skip images that haven't been downloaded or failed
                continue;
            }
            items.push(new EpubItem(
                record.zipPath,
                record.mimeType,
                record.data,
                record.id
            ));
        }
        return items;
    }

    /**
     * Rewrite <img> src attributes in a DOM element to use EPUB-local paths.
     * After calling this method, all recognized <img> elements will have their
     * `src` updated to a relative path like "../Images/image0001.jpg".
     *
     * @param {Element} contentElement — The DOM element whose <img> srcs should be rewritten.
     */
    rewriteImageSources(contentElement, baseUrl = "") {
        if (!contentElement || !(contentElement instanceof Element)) {
            return;
        }

        const imgs = contentElement.querySelectorAll("img");
        for (const img of imgs) {
            const rawSrc = img.getAttribute("src") || img.getAttribute("data-src") || "";
            if (!rawSrc || rawSrc.startsWith("data:")) {
                continue;
            }

            // Build the absolute URL to look up in our map
            // We need the base URL to resolve, but since collectImages already resolved them,
            // we try matching both the raw src and common resolutions
            const record = this._findRecordBySource(rawSrc, baseUrl);

            if (record) {
                // Rewrite to EPUB-local relative path (from Text/ to Images/)
                const filename = `${record.id}.${record.extension}`;
                img.setAttribute("src", `../Images/${filename}`);
                // Remove data-src if present to avoid confusion
                img.removeAttribute("data-src");
            }
        }
    }

    /**
     * Get the total number of discovered images (including failed downloads).
     * @returns {number}
     */
    get totalDiscovered() {
        return this._nextIndex - 1;
    }

    /**
     * Get the number of successfully downloaded images currently held.
     * @returns {number}
     */
    get downloadedCount() {
        let count = 0;
        for (const record of this._imageMap.values()) {
            if (record.data !== null) count++;
        }
        return count;
    }

    /**
     * Clear all collected images and reset the counter.
     */
    reset() {
        this._imageMap.clear();
        this._nextIndex = 1;
    }

    /**
     * Look up an image record by matching a raw src attribute.
     * Tries exact match first, then checks if any registered URL ends with the src.
     * @private
     * @param {string} rawSrc
     * @returns {Object|null}
     */
    _findRecordBySource(rawSrc, baseUrl = "") {
        if (baseUrl) {
            const absoluteUrl = Util.resolveUrl(baseUrl, rawSrc);
            if (this._imageMap.has(absoluteUrl)) {
                return this._imageMap.get(absoluteUrl);
            }
        }

        // Direct match (if src is already an absolute URL we've collected)
        if (this._imageMap.has(rawSrc)) {
            return this._imageMap.get(rawSrc);
        }

        // Try matching by URL ending (for relative paths)
        for (const [url, record] of this._imageMap) {
            if (record.originalSrc === rawSrc) {
                return record;
            }
            if (url.endsWith(rawSrc) || rawSrc.endsWith(url)) {
                return record;
            }
            // Also try matching just the pathname portion
            try {
                const urlPath = new URL(url).pathname;
                if (urlPath === rawSrc || urlPath.endsWith(rawSrc)) {
                    return record;
                }
            } catch {
                // Ignore URL parse errors
            }
        }

        return null;
    }
}

// Export for browser script-tag loading
window.ImageCollector = ImageCollector;
