/**
 * FreeWebNovelParser.js — Parser for freewebnovel.com.
 *
 * FreeWebNovel uses a chapter list inside `.m-newest2 ul li a` on the
 * novel's main page.  Chapter content is in `div.txt` or
 * `div.chapter-content`.
 */

class FreeWebNovelParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * The chapter list is rendered inside `.m-newest2 ul li a`.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;

        let links = dom.querySelectorAll('div.m-newest2 ul li a');

        // Fallback selectors.
        if (links.length === 0) {
            links = dom.querySelectorAll('.m-newest1 ul li a, .chapter-list a');
        }

        for (const a of links) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);
            const title = a.getAttribute('title')
                || a.textContent.trim()
                || `Chapter ${chapters.length + 1}`;

            chapters.push({ title, sourceUrl });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Chapter prose is inside `div.txt` or `div.chapter-content`.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        const content = dom.querySelector('div.txt')
            || dom.querySelector('div.chapter-content')
            || dom.querySelector('.m-read .txt');

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
        const el = dom.querySelector('h1.tit')
            || dom.querySelector('.m-desc h1');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('span.a_tag_item')
            || dom.querySelector('.m-imgtxt a[href*="/authors/"]');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('.pic img')
            || dom.querySelector('.m-imgtxt img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const fwnSelectors = [
            '.ads',
            '.chapter-end',
            '.chapter-nav',
            '.notice',
            '.ad-text',
            '.google-auto-placed',
        ];

        for (const sel of fwnSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.FreeWebNovelParser = FreeWebNovelParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'freewebnovel.com', parser: () => new FreeWebNovelParser() }
);
