/**
 * WebNovelParser.js — Parser for webnovel.com.
 *
 * Webnovel (by Qidian / Yuewen) uses JavaScript-heavy rendering.
 * Chapter links use `a.j_chapter_link` or similar classes.  Chapter
 * content is inside `div.cha-words` or `div.chapter-content`.
 */

class WebNovelParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Chapter links on the book detail page.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;
        const seen = new Set();

        // Primary selector.
        let links = dom.querySelectorAll('a.j_chapter_link');

        // Fallback selectors for different page versions.
        if (links.length === 0) {
            links = dom.querySelectorAll('.volume-item a[href*="/chapter/"], .chapter-item a');
        }
        if (links.length === 0) {
            links = dom.querySelectorAll('ol.catalog-volume-ol a[href], ul.catalog-volume-ul a[href]');
        }
        if (links.length === 0) {
            links = dom.querySelectorAll('a[href*="_"]');
            // Filter to only chapter-looking URLs.
            links = Array.from(links).filter(a => {
                const href = a.getAttribute('href') || '';
                return href.match(/\/\d+_\d+/) || href.includes('/chapter/');
            });
        }

        for (const a of links) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);
            if (seen.has(sourceUrl)) continue;
            seen.add(sourceUrl);

            const title = a.textContent.trim() || `Chapter ${chapters.length + 1}`;
            chapters.push({ title, sourceUrl });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Chapter content is in `div.cha-words` or `div.chapter-content`.
     *
     * Note: Webnovel may render locked chapters with obfuscated text;
     * only unlocked/free chapters will have readable content.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        const content = dom.querySelector('div.cha-words')
            || dom.querySelector('div.chapter-content')
            || dom.querySelector('.cha-cnt .cha-words')
            || dom.querySelector('.j_contentWrap');

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
        const el = dom.querySelector('.det-title')
            || dom.querySelector('h1.lh1d2')
            || dom.querySelector('h1')
            || dom.querySelector('h2.lh1d2');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        // Webnovel uses various markup patterns for the author.
        const el = dom.querySelector('span[data-eid] a')
            || dom.querySelector('p.ell.dib.vam a')
            || dom.querySelector('.det-hd-detail address a')
            || dom.querySelector('a[href*="/profile/"]')
            || dom.querySelector('h2 a[href*="/profile/"]');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('.det-hd img')
            || dom.querySelector('.g_thumb img')
            || dom.querySelector('.book-img img');
        return img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const wnSelectors = [
            '.j_bottom_comment_area',
            '.cha-bts',
            '.cha-tit',
            '.g_ad_ph',
            '.admline',
            '.cha-info',
            '.copy-text',
            '.lock-text',
            '.j_locked_chap',
            '.chapter-end-btn',
            '.review-see-,more',
            '.m-ad-card',
            '.pirate',
            '.no-content',
        ];

        for (const sel of wnSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.WebNovelParser = WebNovelParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'webnovel.com', parser: () => new WebNovelParser() },
    { hostname: 'www.webnovel.com', parser: () => new WebNovelParser() }
);
