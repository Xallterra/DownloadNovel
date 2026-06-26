/**
 * NovelBinParser.js - Parser for novelbin-style sites and mirrors.
 */

class NovelBinParser extends Parser {
    async getChapterUrls(dom) {
        const chapters = [];
        const seen = new Set();
        const baseUrl = dom.baseURI || window.location.href;
        const links = dom.querySelectorAll(
            ".list-chapter a, .chapter-list a, ul.list-chapter li a, #list-chapter a, a[href*='/chapter-']"
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
        const content = dom.querySelector("#chr-content")
            || dom.querySelector("#chapter-content")
            || dom.querySelector(".chapter-c")
            || dom.querySelector(".chapter-content")
            || dom.querySelector(".chr-c");

        if (content) this.removeUnwantedElements(content);
        return content;
    }

    extractTitle(dom) {
        const title = dom.querySelector(".title")
            || dom.querySelector("h3")
            || dom.querySelector("h1");
        return title ? title.textContent.trim() : super.extractTitle(dom);
    }

    extractAuthor(dom) {
        const author = dom.querySelector(".info a[href*='author']")
            || dom.querySelector("a[href*='/author/']")
            || dom.querySelector(".author");
        return author ? author.textContent.trim() : "Unknown";
    }

    findCoverImageUrl(dom) {
        const img = dom.querySelector(".book img")
            || dom.querySelector(".book-info img")
            || dom.querySelector(".info-holder img")
            || dom.querySelector('meta[property="og:image"]');
        return img ? (img.getAttribute("content") || img.getAttribute("src") || img.getAttribute("data-src")) : null;
    }

    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);
        [".ads", ".ads-holder", ".chapter-nav", ".text-center", ".google-auto-placed"].forEach(selector => {
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

window.NovelBinParser = NovelBinParser;
window.parserRegistrations = window.parserRegistrations || [];

[
    "novelbin.com",
    "novelbin.net",
    "novelbin.me",
    "novel-bin.com",
    "novel-bin.net",
    "novel-bin.org",
    "thenovelbin.org",
    "novelnext.com",
    "novelnext.net",
    "novel-next.com",
].forEach(hostname => {
    window.parserRegistrations.push({ hostname, parser: () => new NovelBinParser() });
});
