/**
 * Util.js — Shared utility functions for the NovelGrabber extension.
 * Provides helpers for UUID generation, filename sanitization, XML encoding,
 * HTML-to-XHTML conversion, URL resolution, MIME type mapping, and DOM sanitization.
 */

"use strict";

class Util {

    /**
     * Generate a UUID v4 string.
     * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
     * @returns {string} A random UUID v4.
     */
    static createUuid() {
        // Use crypto.getRandomValues for cryptographic quality randomness
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);

        // Set version bits (4) in byte 6
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        // Set variant bits (10xx) in byte 8
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
        return [
            hex.substring(0, 8),
            hex.substring(8, 12),
            hex.substring(12, 16),
            hex.substring(16, 20),
            hex.substring(20, 32)
        ].join("-");
    }

    /**
     * Sanitize a string for use as a filename.
     * Removes characters illegal on Windows/macOS/Linux, collapses whitespace,
     * trims leading/trailing dots and spaces, and enforces a max length.
     * @param {string} name — The raw filename candidate.
     * @returns {string} A safe filename string.
     */
    static sanitizeFilename(name) {
        if (!name || typeof name !== "string") {
            return "untitled";
        }

        let sanitized = name
            // Remove characters illegal in Windows filenames: \ / : * ? " < > |
            .replace(/[\\/:*?"<>|]/g, "")
            // Remove control characters (0x00–0x1F, 0x7F)
            .replace(/[\x00-\x1f\x7f]/g, "")
            // Collapse runs of whitespace into a single space
            .replace(/\s+/g, " ")
            // Trim leading/trailing whitespace and dots
            .replace(/^[\s.]+|[\s.]+$/g, "");

        // Enforce a maximum filename length (255 is the common FS limit)
        if (sanitized.length > 200) {
            sanitized = sanitized.substring(0, 200);
        }

        return sanitized || "untitled";
    }

    /**
     * Promise-based delay.
     * @param {number} ms — Milliseconds to wait.
     * @returns {Promise<void>}
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Escape XML special characters: &, <, >, ", '
     * @param {string} str — The raw string.
     * @returns {string} The XML-safe string.
     */
    static xmlEncode(str) {
        if (!str || typeof str !== "string") {
            return "";
        }
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    /**
     * Convert an HTML string into valid XHTML.
     * Parses via DOMParser, serializes via XMLSerializer, and cleans the output.
     * @param {string} html — The raw HTML string.
     * @returns {string} A well-formed XHTML string.
     */
    static htmlToXhtml(html) {
        if (!html || typeof html !== "string") {
            return "";
        }

        // Parse the HTML into a DOM document
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Serialize the body content to XHTML via XMLSerializer
        const serializer = new XMLSerializer();
        let xhtml = "";
        for (const child of doc.body.childNodes) {
            xhtml += serializer.serializeToString(child);
        }

        // Clean up common namespace artifacts the serializer may inject
        xhtml = xhtml
            .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "")
            .replace(/ xmlns:ns\d+=""/g, "")
            .replace(/ns\d+:/g, "");

        return xhtml;
    }

    /**
     * Resolve a relative URL against a base URL.
     * @param {string} base — The base URL (e.g., the page the link was found on).
     * @param {string} relative — The relative URL to resolve.
     * @returns {string} The fully resolved absolute URL.
     */
    static resolveUrl(base, relative) {
        if (!relative) {
            return base || "";
        }
        try {
            return new URL(relative, base).href;
        } catch {
            // If URL constructor fails, return the relative URL unchanged
            return relative;
        }
    }

    /**
     * Extract the file extension from a URL string (without the leading dot).
     * Strips query strings and fragments before extraction.
     * @param {string} url — The URL to inspect.
     * @returns {string} The lowercase extension (e.g., "png"), or empty string.
     */
    static getFileExtension(url) {
        if (!url || typeof url !== "string") {
            return "";
        }
        try {
            const pathname = new URL(url).pathname;
            const lastDot = pathname.lastIndexOf(".");
            if (lastDot === -1 || lastDot === pathname.length - 1) {
                return "";
            }
            // Guard against paths like "/some.directory/file" — take only after last slash
            const lastSlash = pathname.lastIndexOf("/");
            if (lastDot < lastSlash) {
                return "";
            }
            return pathname.substring(lastDot + 1).toLowerCase();
        } catch {
            // Fallback: simple regex extraction
            const match = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
            return match ? match[1].toLowerCase() : "";
        }
    }

    /**
     * Map a file extension to its MIME type.
     * Covers common image types used in web novels/EPUBs.
     * @param {string} extension — The lowercase file extension (no dot).
     * @returns {string} The corresponding MIME type, or "application/octet-stream".
     */
    static getMimeType(extension) {
        const mimeMap = {
            "jpg":  "image/jpeg",
            "jpeg": "image/jpeg",
            "png":  "image/png",
            "gif":  "image/gif",
            "svg":  "image/svg+xml",
            "webp": "image/webp",
            "bmp":  "image/bmp",
            "ico":  "image/x-icon",
            "tif":  "image/tiff",
            "tiff": "image/tiff",
            "avif": "image/avif",
            "css":  "text/css",
            "xhtml":"application/xhtml+xml",
            "html": "text/html",
            "xml":  "application/xml",
            "ncx":  "application/x-dtbncx+xml",
            "otf":  "font/otf",
            "ttf":  "font/ttf",
            "woff": "font/woff",
            "woff2":"font/woff2",
        };
        const ext = (extension || "").toLowerCase().replace(/^\./, "");
        return mimeMap[ext] || "application/octet-stream";
    }

    /**
     * Sanitize a DOM element by removing scripts, styles, and event-handler attributes.
     * Operates in-place on the provided element.
     * @param {Element} element — The DOM element to sanitize.
     * @returns {Element} The same element, now sanitized.
     */
    static sanitizeHtml(element) {
        if (!element || !(element instanceof Element)) {
            return element;
        }

        // Remove all <script> elements
        const scripts = element.querySelectorAll("script");
        scripts.forEach(s => s.remove());

        // Remove all <style> elements
        const styles = element.querySelectorAll("style");
        styles.forEach(s => s.remove());

        // Remove <link rel="stylesheet"> elements
        const links = element.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(l => l.remove());

        // Remove <iframe>, <object>, <embed>, <applet> elements
        const dangerous = element.querySelectorAll("iframe, object, embed, applet");
        dangerous.forEach(d => d.remove());

        // Remove event-handler attributes (onclick, onload, onerror, etc.)
        // and javascript: hrefs from every element in the tree
        const allElements = element.querySelectorAll("*");
        allElements.forEach(el => {
            // Collect attribute names first to avoid mutating during iteration
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
                const name = attr.name.toLowerCase();
                if (name.startsWith("on")) {
                    el.removeAttribute(attr.name);
                }
                if (name === "href" || name === "src" || name === "action") {
                    if (attr.value.trim().toLowerCase().startsWith("javascript:")) {
                        el.removeAttribute(attr.name);
                    }
                }
            }
        });

        // Also sanitize the root element's own attributes
        const rootAttrs = Array.from(element.attributes);
        for (const attr of rootAttrs) {
            if (attr.name.toLowerCase().startsWith("on")) {
                element.removeAttribute(attr.name);
            }
        }

        return element;
    }
}

// Export for browser script-tag loading
window.Util = Util;
