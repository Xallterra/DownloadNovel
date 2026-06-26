/**
 * DefaultParser.js — Generic CSS-selector driven parser.
 *
 * When no site-specific parser matches the current URL the user can
 * provide their own CSS selectors via the extension popup.  This
 * parser applies those selectors to extract content, titles, and
 * chapter links from any site.
 */

class DefaultParser extends Parser {
    constructor() {
        super();

        /** @type {string|null} CSS selector for the chapter prose container. */
        this._contentSelector = null;

        /** @type {string|null} CSS selector for the story title element. */
        this._titleSelector = null;

        /** @type {string|null} Comma-separated selectors for elements to remove. */
        this._removeSelector = null;

        /** @type {string|null} CSS selector for chapter link anchors on the TOC page. */
        this._chapterSelector = null;

        /** @type {string|null} CSS selector for the author element. */
        this._authorSelector = null;

        /** @type {string|null} CSS selector for the cover image element. */
        this._coverSelector = null;
    }

    // ─── Selector Configuration ──────────────────────────────────────

    /**
     * Set the CSS selector used to locate the chapter content container.
     * Example: `"div.chapter-content"`
     *
     * @param {string} sel
     * @returns {DefaultParser}  For chaining.
     */
    setContentSelector(sel) {
        this._contentSelector = sel;
        return this;
    }

    /**
     * Set the CSS selector used to extract the story title.
     * Example: `"h1.title"`
     *
     * @param {string} sel
     * @returns {DefaultParser}
     */
    setTitleSelector(sel) {
        this._titleSelector = sel;
        return this;
    }

    /**
     * Set the CSS selector(s) for elements that should be stripped from
     * the content before converting to EPUB.  Multiple selectors can be
     * comma-separated, e.g. `".ads, .nav, .comments"`.
     *
     * @param {string} sel
     * @returns {DefaultParser}
     */
    setRemoveSelector(sel) {
        this._removeSelector = sel;
        return this;
    }

    /**
     * Set the CSS selector for chapter link anchors on the TOC page.
     * Example: `"a.chapter-link"`
     *
     * @param {string} sel
     * @returns {DefaultParser}
     */
    setChapterSelector(sel) {
        this._chapterSelector = sel;
        return this;
    }

    /**
     * Set the CSS selector for the author name element.
     * Example: `"span.author"`
     *
     * @param {string} sel
     * @returns {DefaultParser}
     */
    setAuthorSelector(sel) {
        this._authorSelector = sel;
        return this;
    }

    /**
     * Set the CSS selector for the cover image element.
     * Example: `".cover img"`
     *
     * @param {string} sel
     * @returns {DefaultParser}
     */
    setCoverSelector(sel) {
        this._coverSelector = sel;
        return this;
    }

    // ─── Parser Interface Overrides ──────────────────────────────────

    /**
     * Discover chapter links using the configured selector.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const links = this._chapterSelector
            ? dom.querySelectorAll(this._chapterSelector)
            : this._findLikelyChapterLinks(dom);
        const chapters = [];
        const seen = new Set();

        for (const link of links) {
            const href = link.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, dom.baseURI || window.location.href);
            if (seen.has(sourceUrl)) continue;
            seen.add(sourceUrl);

            const title = link.textContent.trim() || `Chapter ${chapters.length + 1}`;
            chapters.push({ title, sourceUrl });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    /**
     * Locate the content element using the configured selector.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        if (!this._contentSelector) {
            // Sensible fallback: try common content containers.
            const fallbacks = [
                'article', 'main', '.content', '.chapter-content',
                '#content', '#chapter-content', '.entry-content',
                '.post-content', '.story-text', '.reading-content',
                '.chapter-body', '.chapter-c', '.chapter-inner',
                '.novel-content', '.text-left', '.chr-c', '#chr-content',
                '.entry', '.post', '.read-content', '.reader-content',
            ];
            for (const sel of fallbacks) {
                const el = dom.querySelector(sel);
                if (el) {
                    this._applyRemoveSelector(el);
                    this.removeUnwantedElements(el);
                    return el;
                }
            }
            return null;
        }

        const content = dom.querySelector(this._contentSelector);
        if (content) {
            this._applyRemoveSelector(content);
            this.removeUnwantedElements(content);
        }
        return content;
    }

    /**
     * Extract the story title using the configured selector.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        if (this._titleSelector) {
            const el = dom.querySelector(this._titleSelector);
            if (el) return el.textContent.trim();
        }
        return super.extractTitle(dom);
    }

    /**
     * Extract the author name using the configured selector.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        if (this._authorSelector) {
            const el = dom.querySelector(this._authorSelector);
            if (el) return el.textContent.trim();
        }
        return super.extractAuthor(dom);
    }

    /**
     * Extract the cover image URL using the configured selector.
     *
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        if (this._coverSelector) {
            const img = dom.querySelector(this._coverSelector);
            if (img) {
                return img.getAttribute('src') || img.getAttribute('data-src') || null;
            }
        }
        return super.findCoverImageUrl(dom);
    }

    // ─── Internal Helpers ────────────────────────────────────────────

    /**
     * Apply the user-supplied "remove" selectors to a content element.
     *
     * @param {Element} element
     * @private
     */
    _applyRemoveSelector(element) {
        if (!this._removeSelector) return;

        try {
            const nodes = element.querySelectorAll(this._removeSelector);
            for (const node of nodes) {
                node.remove();
            }
        } catch (_) {
            // If the selector is invalid, log and continue.
            console.warn('[DefaultParser] Invalid remove selector:', this._removeSelector);
        }
    }

    _findLikelyChapterLinks(dom) {
        const selectors = [
            'a[href*="chapter"]',
            'a[href*="/chapters/"]',
            'a[href*="/read/"]',
            'a[href*="/episode/"]',
            'a[href*="/episodes/"]',
            'a[href*="/novel/"][href*="/"]',
            '.chapter-list a',
            '.chapters a',
            '.chapter-list-item a',
            '.list-chapter a',
            '.toc a',
            '#toc a',
            '[class*="chapter"] a',
            '[id*="chapter"] a',
        ];
        const candidates = [];
        const seen = new Set();

        for (const selector of selectors) {
            let links = [];
            try {
                links = dom.querySelectorAll(selector);
            } catch (_) {
                continue;
            }

            for (const link of links) {
                const href = link.getAttribute('href') || '';
                const text = link.textContent.trim();
                if (!href || href.startsWith('#') || seen.has(href)) continue;
                if (!this._looksLikeChapterLink(href, text)) continue;

                seen.add(href);
                candidates.push(link);
            }
        }

        return candidates;
    }

    _looksLikeChapterLink(href, text) {
        const value = `${href} ${text}`.toLowerCase();
        if (/(comment|login|register|privacy|terms|author|category|tag|genre|review|report)/.test(value)) {
            return false;
        }
        return /(chapter|chapters|ch[-_\s]?\d+|episode|part|vol(?:ume)?|第.{0,6}章|c\d+)/i.test(value)
            || /\/\d+(?:[/?#-]|$)/.test(href);
    }
}

// Expose globally.
window.DefaultParser = DefaultParser;
