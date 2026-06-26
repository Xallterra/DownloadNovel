/**
 * WattpadParser.js — Parser for wattpad.com.
 *
 * Wattpad uses a table-of-contents page at the story root that lists
 * parts (chapters) as links.  Chapter text is rendered inside `<pre>`
 * or `<p>` elements within the story-part container.
 */

class WattpadParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Wattpad lists chapters (called "parts") on the story info page.
     * Links are inside `.table-of-contents a` or similar containers.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;
        const seen = new Set();

        // Primary selector: table of contents links.
        let links = dom.querySelectorAll('div.table-of-contents a.on-navigate');

        // Fallback selectors for different page layouts.
        if (links.length === 0) {
            links = dom.querySelectorAll('.table-of-contents a[href*="/"]');
        }
        if (links.length === 0) {
            links = dom.querySelectorAll('.story-parts ul li a');
        }
        if (links.length === 0) {
            links = dom.querySelectorAll('a.story-parts__part');
        }

        for (const a of links) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);

            // Skip external links or duplicates.
            if (seen.has(sourceUrl)) continue;
            if (!sourceUrl.includes('wattpad.com')) continue;
            seen.add(sourceUrl);

            const title = a.textContent.trim() || `Part ${chapters.length + 1}`;
            chapters.push({ title, sourceUrl });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * On a chapter ("part") page the prose is inside `<pre>` tags
     * within the story-part container, or inside `<p>` tags within
     * paginated `div[data-page-number]` elements.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        // Try the structured content container first.
        let content = dom.querySelector('div.story-part__story pre')
            || dom.querySelector('div.story-part pre');

        // Fallback: collect all page-number divs.
        if (!content) {
            const pages = dom.querySelectorAll('div[data-page-number] p');
            if (pages.length > 0) {
                // Wrap all pages into a single container.
                content = dom.createElement('div');
                for (const p of pages) {
                    content.appendChild(p.cloneNode(true));
                }
            }
        }

        // Fallback: story-part paragraphs.
        if (!content) {
            content = dom.querySelector('.story-part p')
                ? dom.querySelector('.story-part')
                : null;
        }

        // Last resort.
        if (!content) {
            content = dom.querySelector('.part-content')
                || dom.querySelector('#story-part');
        }

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    // ─── Metadata ────────────────────────────────────────────────────

    /**
     * Story title from the info page.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        const el = dom.querySelector('.story-info__title')
            || dom.querySelector('h1');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * Author name from the info / header area.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('.author-info a.on-navigate')
            || dom.querySelector('a[href*="/user/"]')
            || dom.querySelector('.author-info__username');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * Cover image from the story info page.
     *
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('.story-cover img')
            || dom.querySelector('.cover img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const wpSelectors = [
            '.media-share',
            '.share-container',
            '.comment-container',
            '.comments-container',
            '.inline-promo',
            '.promo-container',
            '.story-part__meta',
            '.vote-container',
            '.dedication',
            '.media',
            '.video-placeholder',
            '.mu-ad',
        ];

        for (const sel of wpSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.WattpadParser = WattpadParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'wattpad.com', parser: () => new WattpadParser() },
    { hostname: 'www.wattpad.com', parser: () => new WattpadParser() }
);
