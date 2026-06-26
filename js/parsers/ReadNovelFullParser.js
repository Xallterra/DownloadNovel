/**
 * ReadNovelFullParser.js - Parser for readnovelfull/readlightnovel style sites.
 */

class ReadNovelFullParser extends Parser {
    async getChapterUrls(dom) {
        const chapters = [];
        const seen = new Set();
        const baseUrl = dom.baseURI || window.location.href;
        const links = dom.querySelectorAll(
            ".chapter-list a, .list-chapter a, .ul-list-chapter a, .row a[href*='chapter'], a[href*='/chapter-']"
        );

        for (const link of links) {
            const href = link.getAttribute("href");
            if (!href) continue;
            const sourceUrl = this.resolveUrl(href, baseUrl);
            if (seen.has(sourceUrl)) continue;
            seen.add(sourceUrl);

            const title = link.getAttribute("title") || link.textContent.trim() || `Chapter ${chapters.length + 1}`;
            chapters.push({
                title,
                sourceUrl,
                order: this._extractOrder(title, sourceUrl) ?? chapters.length + 1,
            });
        }

        chapters.sort((a, b) => a.order - b.order);
        this.chapterUrls = chapters;
        return chapters;
    }

    findContent(dom) {
        const content = dom.querySelector("#chapter-content")
            || dom.querySelector(".chapter-content")
            || dom.querySelector(".chapter-text")
            || dom.querySelector(".reading-content")
            || dom.querySelector(".entry-content");

        if (content) this.removeUnwantedElements(content);
        return content;
    }

    extractTitle(dom) {
        const title = dom.querySelector("h1")
            || dom.querySelector(".novel-title")
            || dom.querySelector(".truyen-title");
        return title ? title.textContent.trim() : super.extractTitle(dom);
    }

    extractAuthor(dom) {
        const author = dom.querySelector("a[href*='author']")
            || dom.querySelector(".author")
            || dom.querySelector(".info a");
        return author ? author.textContent.trim() : "Unknown";
    }

    findCoverImageUrl(dom) {
        const img = dom.querySelector(".book img")
            || dom.querySelector(".novel-cover img")
            || dom.querySelector(".info-holder img")
            || dom.querySelector('meta[property="og:image"]');
        return img ? (img.getAttribute("content") || img.getAttribute("src") || img.getAttribute("data-src")) : null;
    }

    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);
        [".ads", ".chapter-nav", ".nav-chapter", ".text-center", ".google-auto-placed"].forEach(selector => {
            try {
                element.querySelectorAll(selector).forEach(node => node.remove());
            } catch (_) { /* skip */ }
        });
    }

    _extractOrder(title, url) {
        const match = `${title} ${url}`.match(/chapter\D{0,8}(\d+(?:\.\d+)?)/i);
        return match ? parseFloat(match[1]) : null;
    }
}

window.ReadNovelFullParser = ReadNovelFullParser;
window.parserRegistrations = window.parserRegistrations || [];

[
    "readnovelfull.com",
    "readnovelfull.me",
    "readnovelfull.org",
    "readlightnovel.org",
    "readlightnovel.me",
    "readlightnovel.cc",
    "readlightnovel.today",
    "readlitenovel.com",
    "readwn.com",
    "readwn.org",
    "novelonlinefree.com",
    "novelonlinefree.info",
].forEach(hostname => {
    window.parserRegistrations.push({ hostname, parser: () => new ReadNovelFullParser() });
});
