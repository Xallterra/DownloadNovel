/**
 * LightNovelPubParser.js — Parser for lightnovelpub.com,
 * lightnovelworld.com, and lightnovelpub.fan.
 *
 * These are sibling sites with near-identical page structures.
 * Chapters are listed in `ul.chapter-list li a` and content is
 * inside `div#chapter-container` or `div.chapter-content`.
 */

class LightNovelPubParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;
        const seen = new Set();

        let links = dom.querySelectorAll('ul.chapter-list li a');

        // Fallback: some variants use a different wrapper.
        if (links.length === 0) {
            links = dom.querySelectorAll('.chapter-list a[href*="/chapter"]');
        }
        if (links.length === 0) {
            links = dom.querySelectorAll('.chapters-list a[href*="/chapter"]');
        }

        for (const a of links) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);
            if (seen.has(sourceUrl)) continue;
            seen.add(sourceUrl);

            // The link often wraps a <span> with the title; extract text.
            const titleEl = a.querySelector('.chapter-title') || a;
            const title = titleEl.textContent.trim() || `Chapter ${chapters.length + 1}`;

            chapters.push({ title, sourceUrl });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        const content = dom.querySelector('div#chapter-container')
            || dom.querySelector('div.chapter-content')
            || dom.querySelector('#chapter-c');

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    // ─── Metadata ────────────────────────────────────────────────────

    /**
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        const el = dom.querySelector('h1.novel-title')
            || dom.querySelector('div.novel-title')
            || dom.querySelector('.novel-info h1');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('span[itemprop="author"]')
            || dom.querySelector('.author a')
            || dom.querySelector('a[href*="/author/"]');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('figure.cover img')
            || dom.querySelector('.novel-cover img')
            || dom.querySelector('.cover img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const lnpSelectors = [
            '.adsbox',
            '.ad-container',
            '.ads-holder',
            '.trinity-player-iframe-container',
            '.adsbygoogle',
            '.chapter-end',
            '.chapter-nav',
            '.notice-text',
            '.unlocked',
            'center',  // Often wraps ad images
        ];

        for (const sel of lnpSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.LightNovelPubParser = LightNovelPubParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'lightnovelpub.com', parser: () => new LightNovelPubParser() },
    { hostname: 'lightnovelworld.com', parser: () => new LightNovelPubParser() },
    { hostname: 'lightnovelpub.fan', parser: () => new LightNovelPubParser() }
);
