/**
 * WordPressNovelParser.js - Generic parser for WordPress/blog-hosted novels.
 *
 * Many translator sites use WordPress with chapter links in entries, pages,
 * menus, or table-of-contents posts and chapter text inside .entry-content.
 */

class WordPressNovelParser extends Parser {
    async getChapterUrls(dom) {
        const chapters = [];
        const seen = new Set();
        const baseUrl = dom.baseURI || window.location.href;

        const containers = [
            ".entry-content",
            ".post-content",
            ".page-content",
            "article",
            "main",
            ".site-main",
            ".content-area",
        ];

        const links = [];
        for (const selector of containers) {
            const container = dom.querySelector(selector);
            if (!container) continue;
            links.push(...container.querySelectorAll("a[href]"));
        }

        if (links.length === 0) {
            links.push(...dom.querySelectorAll('a[href*="chapter"], a[href*="episode"], a[href*="part"]'));
        }

        for (const link of links) {
            const href = link.getAttribute("href");
            const text = link.textContent.trim();
            if (!href || !this._looksLikeChapter(href, text)) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);
            if (seen.has(sourceUrl)) continue;
            seen.add(sourceUrl);

            chapters.push({
                title: text || `Chapter ${chapters.length + 1}`,
                sourceUrl,
                order: this._extractOrder(text, sourceUrl) ?? chapters.length + 1,
            });
        }

        chapters.sort((a, b) => a.order - b.order);
        this.chapterUrls = chapters;
        return chapters;
    }

    findContent(dom) {
        const content = dom.querySelector(".entry-content")
            || dom.querySelector(".post-content")
            || dom.querySelector(".page-content")
            || dom.querySelector("article .content")
            || dom.querySelector("article")
            || dom.querySelector("main");

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    extractTitle(dom) {
        const title = dom.querySelector(".entry-title")
            || dom.querySelector(".post-title")
            || dom.querySelector("article h1")
            || dom.querySelector("h1");
        return title ? title.textContent.trim() : super.extractTitle(dom);
    }

    extractAuthor(dom) {
        const author = dom.querySelector(".author a")
            || dom.querySelector(".byline a")
            || dom.querySelector('[rel="author"]');
        return author ? author.textContent.trim() : "Unknown";
    }

    findCoverImageUrl(dom) {
        const img = dom.querySelector(".wp-post-image")
            || dom.querySelector(".entry-content img")
            || dom.querySelector('meta[property="og:image"]');
        if (!img) return null;
        return img.getAttribute("content") || img.getAttribute("src") || img.getAttribute("data-src");
    }

    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const selectors = [
            ".sharedaddy",
            ".jp-relatedposts",
            ".wp-block-jetpack-subscriptions",
            ".navigation",
            ".post-navigation",
            ".comments-area",
            ".yarpp-related",
            ".code-block",
            ".adsbygoogle",
        ];

        for (const selector of selectors) {
            try {
                element.querySelectorAll(selector).forEach(node => node.remove());
            } catch (_) { /* skip */ }
        }
    }

    _looksLikeChapter(href, text) {
        const value = `${href} ${text}`.toLowerCase();
        if (/(comment|reply|share|twitter|facebook|patreon|ko-fi|discord|privacy|terms)/.test(value)) {
            return false;
        }
        return /(chapter|episode|part|volume|book\s+\d+|ch\.?\s*\d+|第.{0,6}章)/i.test(value)
            || /\/(?:\d{4}\/\d{2}\/\d{2}\/)?[^/]*(?:chapter|episode|part|ch-?\d+)/i.test(href);
    }

    _extractOrder(text, href) {
        const source = `${text || ""} ${href || ""}`;
        const match = source.match(/(?:chapter|episode|part|ch\.?)\D{0,8}(\d+(?:\.\d+)?)/i)
            || source.match(/第\s*(\d+)\s*章/)
            || source.match(/\/(?:chapter|episode|part|ch)-?(\d+(?:\.\d+)?)/i);
        return match ? parseFloat(match[1]) : null;
    }
}

window.WordPressNovelParser = WordPressNovelParser;
window.parserRegistrations = window.parserRegistrations || [];

[
    "wordpress.com",
    "blogspot.com",
    "wuxia.blog",
    "yoraikun.wordpress.com",
    "bakapervert.wordpress.com",
    "nyantl.wordpress.com",
    "shalvationtranslations.wordpress.com",
    "taffygirl13.wordpress.com",
    "asianhobbyist.com",
    "re-library.com",
    "travistranslations.com",
    "secondlifetranslations.com",
    "lightnovelstranslations.com",
].forEach(hostname => {
    window.parserRegistrations.push({ hostname, parser: () => new WordPressNovelParser() });
});

window.parserRegistrations.push({
    urlRule: /https?:\/\/[^/]+\.wordpress\.com\//i,
    parser: () => new WordPressNovelParser(),
});
