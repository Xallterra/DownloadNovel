/**
 * Parser.js — Base parser class for NovelGrabber.
 *
 * All site-specific parsers extend this class and override methods
 * to extract chapter URLs, content, metadata, and cover images from
 * their respective web novel hosting sites.
 */

class Parser {
    constructor() {
        /** @type {Array<{title: string, sourceUrl: string}>} */
        this.chapterUrls = [];
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Scrape the table-of-contents / fiction-info page and return an
     * ordered list of chapter descriptors.
     *
     * @param {Document} dom  The parsed DOM of the story's main page.
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        return [];
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Given a chapter page DOM, return the Element whose innerHTML
     * contains the actual chapter prose.
     *
     * @param {Document} dom  The parsed DOM of a chapter page.
     * @returns {Element|null}
     */
    findContent(dom) {
        return null;
    }

    // ─── Metadata Extraction ─────────────────────────────────────────

    /**
     * Extract the story title from the fiction-info / main page.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        // Attempt to pull a clean <title> from the page; fall back to
        // document.title which is available in the extension context.
        const titleEl = dom.querySelector('title');
        return titleEl ? titleEl.textContent.trim() : document.title;
    }

    /**
     * Extract the author name from the fiction-info page.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        return 'Unknown';
    }

    /**
     * Extract the URL of the cover / thumbnail image, if available.
     *
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        return null;
    }

    /**
     * Extract the language code (BCP-47) for the story.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractLanguage(dom) {
        // Try the <html lang="…"> attribute first.
        const htmlLang = dom.documentElement?.getAttribute('lang');
        if (htmlLang) {
            return htmlLang.split('-')[0].toLowerCase();
        }
        return 'en';
    }

    // ─── DOM Cleanup ─────────────────────────────────────────────────

    /**
     * Remove elements that should never appear in the final EPUB:
     * scripts, styles, ads, navigation, comments, tracking pixels, etc.
     *
     * Subclasses can call `super.removeUnwantedElements(element)` and
     * then perform additional site-specific cleanup.
     *
     * @param {Element} element  The content root to clean in-place.
     */
    removeUnwantedElements(element) {
        // Tags that are never desirable inside chapter content.
        const unwantedTags = [
            'script', 'style', 'noscript', 'iframe', 'video', 'audio',
            'canvas', 'svg', 'nav', 'footer', 'header', 'aside',
            'form', 'input', 'textarea', 'select', 'button',
            'link', 'meta', 'object', 'embed',
        ];

        // CSS selectors for common ad / boilerplate containers.
        const unwantedSelectors = [
            '.ads', '.ad', '.adsbygoogle', '.ad-container',
            '.advertisement', '[id*="google_ads"]',
            '.comments', '.comment-section', '.comment-container',
            '.share', '.social-share', '.share-buttons',
            '.navigation', '.chapter-nav', '.nav-buttons',
            '.chapter-navigation', '.reader-navigation', '.reading-nav',
            '.recommendations', '.recommendation', '.recommended',
            '.related-posts', '.related-books', '.related-novels',
            '.you-may-also-like', '.also-like', '[class*="also-like"]',
            '[class*="recommend"]', '[id*="recommend"]',
            '.reading-tools', '.reader-tools', '.advanced-tools',
            '.keyboard-tip', '.reading-tip',
            '.sidebar', '.widget', '.popup',
            '.hidden', '[style*="display:none"]', '[style*="display: none"]',
            '[aria-hidden="true"]',
            '.cookie-notice', '.cookie-banner',
            '.newsletter', '.signup-form',
        ];

        // Remove unwanted tags.
        for (const tag of unwantedTags) {
            const nodes = element.querySelectorAll(tag);
            for (const node of nodes) {
                node.remove();
            }
        }

        // Remove unwanted selector matches.
        for (const selector of unwantedSelectors) {
            try {
                const nodes = element.querySelectorAll(selector);
                for (const node of nodes) {
                    node.remove();
                }
            } catch (_) {
                // querySelectorAll may throw on invalid selectors — skip.
            }
        }

        // Strip plain reader controls even when the site gives them no class.
        const readerControlPattern = /^(?:chevron_(?:left|right)\s*)?(?:prev(?:ious)?|next|home|index|table of contents|toc)$/i;
        for (const link of Array.from(element.querySelectorAll('a'))) {
            const label = link.textContent.replace(/\s+/g, ' ').trim();
            if (readerControlPattern.test(label)) {
                link.remove();
            }
        }

        for (const paragraph of Array.from(element.querySelectorAll('p'))) {
            const text = paragraph.textContent.replace(/\s+/g, ' ').trim();
            if (/^(?:tap the screen to use advanced tools|tip:\s*you can use .*?(?:browse|move|navigate) between chapters)/i.test(text)) {
                paragraph.remove();
            }
        }

        // Some sites append recommendations or reader instructions without
        // useful classes. Once one of these boundary headings appears, remove
        // it and everything after it from the same chapter-content container.
        const boundaryPattern = /^(you(?:'|’)?ll also like|you may also like|recommended(?: novels?| books?| stories?)?|related (?:novels?|books?|stories?|posts?)|more from (?:this )?author|tap the screen to use advanced tools|tip:\s*you can use)/i;
        const candidates = Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, p'));
        for (const candidate of candidates) {
            const text = candidate.textContent.replace(/\s+/g, ' ').trim();
            if (!boundaryPattern.test(text)) continue;

            let node = candidate;
            while (node && node !== element) {
                let sibling = node.nextSibling;
                while (sibling) {
                    const next = sibling.nextSibling;
                    sibling.remove();
                    sibling = next;
                }
                const parent = node.parentElement;
                node.remove();
                node = parent;
            }
            break;
        }

        // Remove empty <div> / <span> wrappers (common ad placeholders).
        const containers = element.querySelectorAll('div, span');
        for (const el of containers) {
            if (el.children.length === 0 && el.textContent.trim() === '') {
                el.remove();
            }
        }
    }

    // ─── Utilities ───────────────────────────────────────────────────

    /**
     * Build a filesystem-safe filename from a story title.
     *
     * @param {string} title
     * @returns {string}  A sanitised filename (without extension).
     */
    getFileName(title) {
        if (!title) return 'untitled';

        return title
            .trim()
            // Replace characters illegal in most file-systems.
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            // Collapse whitespace to a single space.
            .replace(/\s+/g, ' ')
            // Trim trailing dots / spaces (Windows restriction).
            .replace(/[. ]+$/, '')
            // Reasonable length cap.
            .substring(0, 200)
            || 'untitled';
    }

    /**
     * Helper: resolve a potentially-relative URL against a base.
     *
     * @param {string} href     The href value from the page.
     * @param {string} baseUrl  The URL of the page the href was found on.
     * @returns {string}        A fully-qualified URL.
     */
    resolveUrl(href, baseUrl) {
        if (!href) return '';
        try {
            return new URL(href, baseUrl).href;
        } catch (_) {
            return href;
        }
    }
}

// Expose globally for the Chrome extension content-script context.
window.Parser = Parser;
