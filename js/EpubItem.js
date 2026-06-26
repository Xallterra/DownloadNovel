/**
 * EpubItem.js — Represents a single file entry within an EPUB archive.
 *
 * Each EpubItem maps to one file in the final ZIP (EPUB) structure.
 * It can represent a chapter (XHTML), an image (binary), a stylesheet (CSS),
 * a navigation document (NCX), or any other EPUB resource.
 */

"use strict";

class EpubItem {

    /**
     * Create a new EpubItem.
     *
     * @param {string} zipPath — The path inside the EPUB ZIP archive
     *   (e.g., "OEBPS/Text/Chapter001.xhtml" or "OEBPS/Images/cover.jpg").
     * @param {string} mediaType — The MIME type of this resource
     *   (e.g., "application/xhtml+xml", "image/jpeg", "text/css").
     * @param {string|ArrayBuffer|Uint8Array|Blob} content — The file content.
     *   Strings are used for text-based resources (XHTML, CSS, XML).
     *   ArrayBuffer/Uint8Array/Blob are used for binary resources (images, fonts).
     * @param {string} [id] — A unique identifier for this item within the OPF manifest.
     *   If omitted, one will need to be assigned before packing.
     */
    constructor(zipPath, mediaType, content, id) {
        /** @type {string} Path within the EPUB ZIP archive */
        this.zipPath = zipPath;

        /** @type {string} MIME type of this resource */
        this.mediaType = mediaType;

        /** @type {string|ArrayBuffer|Uint8Array|Blob} File content */
        this.content = content;

        /** @type {string} Unique manifest ID */
        this.id = id || "";
    }

    /**
     * Check whether this item holds binary (non-text) content.
     * @returns {boolean} True if the content is an ArrayBuffer, Uint8Array, or Blob.
     */
    isBinary() {
        return (
            this.content instanceof ArrayBuffer ||
            this.content instanceof Uint8Array ||
            this.content instanceof Blob
        );
    }

    /**
     * Check whether this item is an XHTML chapter file.
     * @returns {boolean}
     */
    isChapter() {
        return this.mediaType === "application/xhtml+xml" &&
               this.zipPath.startsWith("OEBPS/Text/");
    }

    /**
     * Check whether this item is an image.
     * @returns {boolean}
     */
    isImage() {
        return this.mediaType.startsWith("image/");
    }

    /**
     * Check whether this item is a stylesheet.
     * @returns {boolean}
     */
    isStylesheet() {
        return this.mediaType === "text/css";
    }

    /**
     * Get the filename portion of the zip path (e.g., "Chapter001.xhtml").
     * @returns {string}
     */
    getFilename() {
        const parts = this.zipPath.split("/");
        return parts[parts.length - 1] || this.zipPath;
    }

    /**
     * Create a shallow clone of this EpubItem.
     * @returns {EpubItem}
     */
    clone() {
        return new EpubItem(this.zipPath, this.mediaType, this.content, this.id);
    }
}

// Export for browser script-tag loading
window.EpubItem = EpubItem;
