/**
 * ArchiveOfOurOwnParser.js — Parser for archiveofourown.org (AO3).
 *
 * AO3 supports both multi-chapter works (with a chapter select dropdown
 * or "Entire Work" view) and single-chapter works.  Chapter prose lives
 * inside `div.userstuff` elements, but the work summary also uses that
 * class — we must exclude `div.userstuff.summary`.
 */

class ArchiveOfOurOwnParser extends Parser {
    constructor() {
        super();
    }

    // ─── Chapter Discovery ───────────────────────────────────────────

    /**
     * Multi-chapter works have a `<select id="selected_id">` dropdown
     * whose `<option>` values are the chapter IDs.  We build full URLs
     * from those IDs.
     *
     * Single-chapter works have no dropdown — we return a single entry
     * pointing at the current page.
     *
     * @param {Document} dom
     * @returns {Promise<Array<{title: string, sourceUrl: string}>>}
     */
    async getChapterUrls(dom) {
        const chapters = [];
        const baseUrl = dom.baseURI || window.location.href;

        // Try the chapter select dropdown first.
        const options = dom.querySelectorAll('select#selected_id option');

        if (options.length > 0) {
            // Extract the work ID from the current URL.
            // Pattern: /works/<workId>/chapters/<chapterId>
            const workIdMatch = baseUrl.match(/\/works\/(\d+)/);
            const workId = workIdMatch ? workIdMatch[1] : null;

            for (const opt of options) {
                const chapterId = opt.value;
                if (!chapterId) continue;

                const title = opt.textContent.trim() || `Chapter ${chapters.length + 1}`;

                let sourceUrl;
                if (workId) {
                    sourceUrl = `https://archiveofourown.org/works/${workId}/chapters/${chapterId}`;
                } else {
                    sourceUrl = this.resolveUrl(`chapters/${chapterId}`, baseUrl);
                }

                chapters.push({ title, sourceUrl });
            }
        }

        // Fallback: chapter index links.
        if (chapters.length === 0) {
            const chapterLinks = dom.querySelectorAll('li.chapter a[href*="/chapters/"], ol.chapter a');
            for (const a of chapterLinks) {
                const href = a.getAttribute('href');
                if (!href) continue;
                const sourceUrl = this.resolveUrl(href, baseUrl);
                const title = a.textContent.trim() || `Chapter ${chapters.length + 1}`;
                chapters.push({ title, sourceUrl });
            }
        }

        // Single-chapter work — just use the current page.
        if (chapters.length === 0) {
            const titleEl = dom.querySelector('h2.title');
            chapters.push({
                title: titleEl ? titleEl.textContent.trim() : 'Chapter 1',
                sourceUrl: baseUrl,
            });
        }

        this.chapterUrls = chapters;
        return chapters;
    }

    // ─── Content Extraction ──────────────────────────────────────────

    /**
     * Chapter content is in `div.userstuff` — but NOT the summary block.
     * On the "Entire Work" page there may be multiple such divs; we
     * return the first chapter-level one.
     *
     * @param {Document} dom
     * @returns {Element|null}
     */
    findContent(dom) {
        // Find all .userstuff elements and filter out the summary.
        const candidates = dom.querySelectorAll('div.userstuff');

        let content = null;
        for (const el of candidates) {
            if (el.classList.contains('summary')) continue;
            // On the "Entire Work" page the module role is the chapter div.
            content = el;
            break;
        }

        // Narrower: the chapter div often has role="article".
        if (!content) {
            content = dom.querySelector('div[role="article"] div.userstuff')
                || dom.querySelector('#chapters div.userstuff');
        }

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    // ─── Metadata ────────────────────────────────────────────────────

    /**
     * Work title is in `<h2 class="title heading">`.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractTitle(dom) {
        const el = dom.querySelector('h2.title.heading')
            || dom.querySelector('h2.title');
        return el ? el.textContent.trim() : super.extractTitle(dom);
    }

    /**
     * Author is a link with `rel="author"`.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractAuthor(dom) {
        const el = dom.querySelector('a[rel="author"]');
        return el ? el.textContent.trim() : 'Unknown';
    }

    /**
     * AO3 works generally do not have cover images.
     *
     * @param {Document} dom
     * @returns {string|null}
     */
    findCoverImageUrl(dom) {
        // Check for a work skin image or embedded cover.
        const img = dom.querySelector('.work.meta img, .cover img');
        return img ? (img.getAttribute('src') || null) : null;
    }

    /**
     * AO3 explicitly sets the language in work metadata.
     *
     * @param {Document} dom
     * @returns {string}
     */
    extractLanguage(dom) {
        const langDd = dom.querySelector('dd.language');
        if (langDd) {
            const lang = langDd.textContent.trim().toLowerCase();
            // Map common labels to BCP-47 codes.
            const langMap = {
                'english': 'en', 'español': 'es', 'français': 'fr',
                'deutsch': 'de', '中文': 'zh', '日本語': 'ja',
                'русский': 'ru', 'português': 'pt', 'italiano': 'it',
                'polski': 'pl', 'filipino': 'fil', 'bahasa indonesia': 'id',
            };
            return langMap[lang] || super.extractLanguage(dom);
        }
        return super.extractLanguage(dom);
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    /**
     * @param {Element} element
     */
    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const ao3Selectors = [
            '.landmark',
            'h3.landmark',
            '.navigation',
            '.feedback',
            '#feedback',
            '.actions',
            '.preface .notes',
            '.end.notes',
            '#kudos',
            '#comments',
            '.comment_error',
        ];

        for (const sel of ao3Selectors) {
            try {
                const nodes = element.querySelectorAll(sel);
                for (const node of nodes) node.remove();
            } catch (_) { /* skip */ }
        }
    }
}

// Expose globally.
window.ArchiveOfOurOwnParser = ArchiveOfOurOwnParser;

// Register with ParserFactory.
window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: 'archiveofourown.org', parser: () => new ArchiveOfOurOwnParser() }
);
