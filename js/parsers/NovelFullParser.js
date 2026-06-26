/**
 * NovelFullParser.js — Parser for novelfull.com / novelfull.net.
 *
 * NovelFull paginates its chapter list across multiple pages.  Each
 * page contains `ul.list-chapter li a` entries.  Chapter content is
 * in `div#chapter-content` or `div.chapter-c`.
 */

class NovelFullParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Collect chapter links from all pagination pages.
     *
     * The first page of the chapter list is embedded in the novel info
     * page.  Subsequent pages are linked via `.pagination li a` and
     * follow the pattern `?page=2`, `?page=3`, etc.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;
        const seen = new Set();

        // Helper: extract chapter links from a parsed DOM page.
        const extractFromPage = (pageDom) => {
            const links = pageDom.querySelectorAll('ul.list-chapter li a');
            for (const a of links) {
                const href = a.getAttribute('href');
                if (!href) continue;

                const sourceUrl = this.resolveUrl(href, baseUrl);
                if (seen.has(sourceUrl)) continue;
                seen.add(sourceUrl);

                const title = a.getAttribute('title')
                    || a.textContent.trim()
                    || `Chapter ${chapters.length + 1}`;

                chapters.push({ title, sourceUrl });
            }
        };

        // Extract from the current (first) page.
        extractFromPage(dom);

        // Discover the total number of pages from the pagination.
        const paginationLinks = dom.querySelectorAll('.pagination li a, ul.pagination a');
        const pageUrls = new Set();

        for (const a of paginationLinks) {
            const href = a.getAttribute('href');
            if (!href) continue;
            const fullUrl = this.resolveUrl(href, baseUrl);
            pageUrls.add(fullUrl);
        }

        // Also check for a "last" page link to determine the upper bound.
        const lastLink = dom.querySelector('.pagination li.last a, .pagination .last a');
        if (lastLink) {
            const lastHref = lastLink.getAttribute('href');
            if (lastHref) {
                const lastUrl = this.resolveUrl(lastHref, baseUrl);
                const pageMatch = lastUrl.match(/[?&]page=(\d+)/);
                if (pageMatch) {
                    const lastPage = parseInt(pageMatch[1], 10);
                    // Generate URLs for any pages we haven't seen yet.
                    for (let p = 2; p <= lastPage; p++) {
                        const pageUrl = baseUrl.split('?')[0] + '?page=' + p;
                        pageUrls.add(pageUrl);
                    }
                }
            }
        }

        // Fetch remaining pages and extract their chapter links.
        for (const url of pageUrls) {
            if (url === baseUrl) continue;

            try {
                const response = await fetch(url);
                const html = await response.text();

                const parser = new DOMParser();
                const pageDom = parser.parseFromString(html, 'text/html');
                extractFromPage(pageDom);
            } catch (err) {
                console.warn('[NovelFullParser] Failed to fetch page:', url, err);
            }
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
        const content = dom.querySelector('div#chapter-content')
            || dom.querySelector('div.chapter-c')
            || dom.querySelector('#chr-content');

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
        const el = dom.querySelector('h3.title')
            || dom.querySelector('.desc h3');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('div.info a[href*="/author/"]')
            || dom.querySelector('.info a[href*="/author/"]');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('div.book img')
            || dom.querySelector('.info-holder img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const nfSelectors = [
            '.ads',
            '.chapter-end',
            '.ads-holder',
            '.ads-responsive',
            '.google-auto-placed',
            'script',
            '.chapter-nav',
            '.text-center',
        ];

        for (const sel of nfSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.NovelFullParser = NovelFullParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'novelfull.com', parser: () => new NovelFullParser() },
    { hostname: 'novelfull.net', parser: () => new NovelFullParser() }
);
