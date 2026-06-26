/**
 * ScribbleHubParser.js — Parser for scribblehub.com.
 *
 * ScribbleHub lists chapters in a TOC at `/series/<id>/<slug>/` using
 * `li.toc_w a` links.  Chapter prose is served inside `div.chp_raw`.
 */

class ScribbleHubParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * The table of contents uses `li.toc_w` list items, each containing
     * a link to the chapter page.
     *
     * Note: ScribbleHub may paginate the TOC via AJAX; this parser
     * handles the initially-rendered list.  If your extension pre-loads
     * all TOC pages, all entries will be present in the DOM.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;

        const links = dom.querySelectorAll('li.toc_w a.toc_a, li.toc_w a');

        for (const a of links) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);
            const title = a.textContent.trim() || `Chapter ${chapters.length + 1}`;

            chapters.push({ title, sourceUrl });
        }

        // ScribbleHub lists chapters in reverse chronological order by
        // default.  Reverse to get oldest-first for the EPUB.
        chapters.reverse();

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Chapter prose is in `div.chp_raw`.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        const content = dom.querySelector('div.chp_raw')
            || dom.querySelector('.chapter-content');

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
        const el = dom.querySelector('div.fic_title');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('span.auth_name_fic');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('div.fic_image img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * ScribbleHub chapter pages are fairly clean — generic cleanup
     * is sufficient.
     *
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        // Remove any site-specific injections.
        const shSelectors = [
            '.wi_authornotes',
            '.a_n_ol',
            '.chp_ad',
        ];

        for (const sel of shSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.ScribbleHubParser = ScribbleHubParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'scribblehub.com', parser: () => new ScribbleHubParser() },
    { hostname: 'www.scribblehub.com', parser: () => new ScribbleHubParser() }
);
