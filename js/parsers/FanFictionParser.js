/**
 * FanFictionParser.js — Parser for fanfiction.net.
 *
 * FF.net uses a `<select id="chap_select">` dropdown to enumerate
 * chapters.  Chapter content is rendered inside `div#storytext`.
 * Story metadata is in the `#profile_top` block.
 */

class FanFictionParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Chapters are listed in a `<select id="chap_select">` element.
     * The option values are chapter numbers (1, 2, 3…).  We reconstruct
     * full URLs using the story's base path.
     *
     * URL pattern: /s/<storyId>/<chapterNum>/<slug>
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;

        // Extract story ID from URL: /s/<storyId>/...
        const storyMatch = baseUrl.match(/\/s\/(\d+)/);
        const storyId = storyMatch ? storyMatch[1] : null;

        if (!storyId) {
            // Cannot determine story ID — return single chapter.
            chapters.push({ title: 'Chapter 1', sourceUrl: baseUrl });
            this.chapterUrls = chapters;
            return chapters;
        }

        // Use the first chapter-select dropdown (there are two — top and bottom).
        const options = dom.querySelectorAll('select#chap_select option');

        if (options.length > 0) {
            for (const opt of options) {
                const chapterNum = opt.value;
                if (!chapterNum) continue;

                const title = opt.textContent.trim() || `Chapter ${chapterNum}`;
                const sourceUrl = `https://www.fanfiction.net/s/${storyId}/${chapterNum}`;

                chapters.push({ title, sourceUrl });
            }

            // The dropdown appears twice on the page (top + bottom) with
            // identical options.  De-duplicate by chapter number.
            const seen = new Set();
            const unique = [];
            for (const ch of chapters) {
                if (seen.has(ch.sourceUrl)) continue;
                seen.add(ch.sourceUrl);
                unique.push(ch);
            }
            this.chapterUrls = unique;
            return unique;
        }

        // Single-chapter story — no dropdown exists.
        chapters.push({
            title: this.extractTitle(dom),
            sourceUrl: baseUrl,
        });

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Chapter content is inside `div#storytext` (desktop) or
     * `div#storytextp` (mobile).
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        const content = dom.querySelector('div#storytext')
            || dom.querySelector('div#storytextp')
            || dom.querySelector('div.storytext');

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    // ─── Metadata ────────────────────────────────────────────────────

    /**
     * Story title is inside `#profile_top b.xcontrast_txt` or the
     * first <b> in `#profile_top`.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        const el = dom.querySelector('#profile_top b.xcontrast_txt')
            || dom.querySelector('#profile_top b');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * Author link is the first `a[href^="/u/"]` inside `#profile_top`.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('#profile_top a[href^="/u/"]');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * Story cover is in `#profile_top img.cimage` or similar.
     *
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        const img = dom.querySelector('#profile_top img.cimage')
            || dom.querySelector('#profile_top img[data-original]')
            || dom.querySelector('#profile_top img');

        if (!img) return null;

        // FF.net often uses data-original for lazy-loaded images.
        return img.getAttribute('data-original')
            || img.getAttribute('src')
            || null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * FF.net chapter pages are relatively clean — the generic cleanup
     * is usually sufficient.
     *
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        // Remove any inline ad divs that FF.net may inject.
        const ffSelectors = [
            '.storytext-ad',
            '[id^="div-gpt-ad"]',
            '.tac_ab',
        ];

        for (const sel of ffSelectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.FanFictionParser = FanFictionParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'fanfiction.net', parser: () => new FanFictionParser() },
    { hostname: 'www.fanfiction.net', parser: () => new FanFictionParser() },
    { hostname: 'm.fanfiction.net', parser: () => new FanFictionParser() }
);
