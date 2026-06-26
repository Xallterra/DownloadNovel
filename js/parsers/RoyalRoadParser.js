/**
 * RoyalRoadParser.js — Parser for royalroad.com.
 *
 * Royal Road uses a table-based chapter listing on the fiction page
 * (/fiction/<id>/<slug>) and serves chapter prose inside
 * `div.chapter-inner.chapter-content`.
 */

class RoyalRoadParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Chapters are listed in a <table id="chapters"> with each row
     * containing a link to the chapter page in the first <td>.
     *
     * @param {Document} dom  The fiction info page DOM.
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];

        // Primary: rows inside the chapters table.
        let links = dom.querySelectorAll('table#chapters tbody tr td:first-child a');

        // Fallback: some layout variations use a list of links.
        if (links.length === 0) {
            links = dom.querySelectorAll('table.table-chapters tbody tr td a, .chapter-row a[href*="/chapter/"]');
        }

        for (const a of links) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, dom.baseURI || window.location.href);
            const title = a.textContent.trim() || `Chapter ${chapters.length + 1}`;

            chapters.push({ title, sourceUrl });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Chapter prose lives in `div.chapter-inner.chapter-content`.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        const content = dom.querySelector('div.chapter-inner.chapter-content')
            || dom.querySelector('div.chapter-content');

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    // ─── Metadata ────────────────────────────────────────────────────

    /**
     * The fiction title is in an <h1> inside the .fic-title container.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        const titleEl = dom.querySelector('.fic-title h1')
            || dom.querySelector('h1[property="name"]')
            || dom.querySelector('h1');
        return titleEl ? titleEl.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * The author link sits inside an <h4> in the fiction header and
     * points to `/profile/<id>`.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const authorLink = dom.querySelector('h4 span a[href*="/profile/"]')
            || dom.querySelector('a[href*="/profile/"]');
        return authorLink ? authorLink.textContent.trim() : 'Unknown';
    }

    /**
     * Cover image is a thumbnail inside the fiction header.
     *
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('div.fic-header img.thumbnail')
            || dom.querySelector('.cover-image img')
            || dom.querySelector('.fic-header img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * Remove Royal Road-specific non-content elements.
     *
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        // Run the generic cleanup first.
        super.removeUnwantedElements(element);

        // Site-specific selectors.
        const rrSelectors = [
            '.author-note',           // Author notes before/after chapter
            '.author-note-portlet',
            '.portlet-body .ad-container',
            '.portlet.ad-container',
            '.donation',
            '.patreon-link',
            '.number-font',           // Analytics pixel wrappers
            '.bold-note',
        ];

        for (const sel of rrSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) {
                    node.remove();
                }
            } catch (_) { /* skip invalid selectors */ }
        }
    }
}

// Expose globally for content-script access.
window.RoyalRoadParser = RoyalRoadParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'royalroad.com', parser: () => new RoyalRoadParser() },
    { hostname: 'www.royalroad.com', parser: () => new RoyalRoadParser() }
);
