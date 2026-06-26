/**
 * WtrLabParser.js - Parser for wtr-lab.com.
 *
 * WTR-LAB renders its reader through a Next.js app. The novel page exposes
 * metadata in __NEXT_DATA__, while chapter prose is loaded from
 * /api/reader/get as JSON. This parser uses that API directly.
 */

class WtrLabParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        const chapters = [];
        const seen = new Set();
        const baseUrl = dom.baseURI || window.location.href;
        const info = this._getNovelInfo(dom, baseUrl);

        const renderedLinks = dom.querySelectorAll('a[href*="/novel/"][href*="/chapter-"]');
        for (const a of renderedLinks) {
            const href = a.getAttribute('href');
            if (!href) continue;

            const sourceUrl = this.resolveUrl(href, baseUrl);
            const order = this._extractChapterOrder(sourceUrl);
            if (!order || seen.has(order)) continue;

            seen.add(order);
            chapters.push({
                title: this._cleanTitle(a.textContent) || `Chapter ${order}`,
                sourceUrl,
                order,
                rawId: info.rawId,
                locale: info.locale,
            });
        }

        if (info.chapterCount > 0) {
            for (let order = 1; order <= info.chapterCount; order++) {
                if (seen.has(order)) continue;
                chapters.push({
                    title: `Chapter ${order}`,
                    sourceUrl: `${info.novelUrl}/chapter-${order}`,
                    order,
                    rawId: info.rawId,
                    locale: info.locale,
                });
            }
        }

        chapters.sort((a, b) => a.order - b.order);
        this.chapterUrls = chapters;
        return chapters;
    }

    async fetchChapterContent(chapter) {
        const order = chapter.order || this._extractChapterOrder(chapter.sourceUrl);
        const rawId = chapter.rawId || this._extractRawId(chapter.sourceUrl);
        const locale = chapter.locale || this._extractLocale(chapter.sourceUrl) || "en";

        if (!order || !rawId) {
            throw new Error("Missing WTR-LAB chapter id");
        }

        const response = await HttpClient.postJson("https://wtr-lab.com/api/reader/get", {
            translate: "ai",
            language: locale,
            raw_id: rawId,
            chapter_no: order,
        });

        if (response.requireTurnstile) {
            throw new WtrLabTurnstileError(chapter.sourceUrl, order);
        }

        if (!response.success) {
            const message = response.message || response.error || response.code || "WTR-LAB reader API failed";
            if (/turnstile/i.test(message)) {
                throw new WtrLabTurnstileError(chapter.sourceUrl, order, message);
            }
            throw new Error(message);
        }

        const chapterData = response.chapter || {};
        const readerData = response.data?.data || {};
        const body = readerData.body || [];
        const images = readerData.images || [];
        const glossaryTerms = readerData.glossary_data?.terms || [];
        const content = document.createElement("div");
        content.className = "chapter-body";

        for (const block of body) {
            this._appendBodyBlock(content, block, glossaryTerms);
        }

        for (const image of images) {
            const src = typeof image === "string" ? image : (image?.src || image?.url);
            if (!src) continue;
            const img = document.createElement("img");
            img.src = src;
            content.appendChild(img);
        }

        return {
            title: readerData.title || chapterData.title || chapter.title || `Chapter ${order}`,
            contentElement: content,
        };
    }

    findContent(dom) {
        const content = dom.querySelector(".chapter-body")
            || dom.querySelector(".reader-container .chapter-wrap")
            || dom.querySelector(".reader-container");

        if (content) {
            this.removeUnwantedElements(content);
        }
        return content;
    }

    extractTitle(dom) {
        const data = this._getNextData(dom);
        const title = data?.props?.pageProps?.serie?.serie_data?.data?.title;
        if (title) return title.trim();

        const ogTitle = dom.querySelector('meta[property="og:title"]')?.getAttribute("content");
        if (ogTitle) return ogTitle.replace(/\s*-\s*WTR-LAB\s*$/i, "").trim();

        return super.extractTitle(dom);
    }

    extractAuthor(dom) {
        const data = this._getNextData(dom);
        const serieData = data?.props?.pageProps?.serie?.serie_data?.data;
        return (serieData?.author || serieData?.raw?.author || "Unknown").trim();
    }

    findCoverImageUrl(dom) {
        const data = this._getNextData(dom);
        const image = data?.props?.pageProps?.serie?.serie_data?.data?.image;
        if (image) return image;

        return dom.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    }

    removeUnwantedElements(element) {
        super.removeUnwantedElements(element);

        const selectors = [
            ".header",
            ".bottom-reader-nav",
            ".reader-controls",
            ".chapter-actions",
            ".ads",
            "[data-radix-popper-content-wrapper]",
        ];

        for (const selector of selectors) {
            try {
                element.querySelectorAll(selector).forEach(node => node.remove());
            } catch (_) { /* skip */ }
        }
    }

    _appendBodyBlock(content, block, glossaryTerms = []) {
        if (block === null || block === undefined) return;

        if (typeof block === "string" || typeof block === "number") {
            const p = document.createElement("p");
            p.textContent = this._expandGlossaryPlaceholders(String(block), glossaryTerms);
            content.appendChild(p);
            return;
        }

        if (Array.isArray(block)) {
            const p = document.createElement("p");
            const text = block.map(part => {
                if (typeof part === "string") return part;
                return part?.text || part?.en || "";
            }).join("");
            p.textContent = this._expandGlossaryPlaceholders(text, glossaryTerms);
            if (p.textContent.trim()) content.appendChild(p);
            return;
        }

        if (block.type === "image") {
            const src = block.src || block.url;
            if (src) {
                const img = document.createElement("img");
                img.src = src;
                content.appendChild(img);
            }
            return;
        }

        const text = block.text || block.en || block.content || block.original || "";
        if (text) {
            const p = document.createElement("p");
            p.textContent = this._expandGlossaryPlaceholders(text, glossaryTerms);
            content.appendChild(p);
        }
    }

    _expandGlossaryPlaceholders(text, glossaryTerms) {
        return String(text || "").replace(/(?:※|â€»)(\d+)(?:⛬|â›¬)/g, (_match, rawIndex) => {
            const index = parseInt(rawIndex, 10);
            const term = glossaryTerms[index];
            return term?.[0] || term?.to || term?.en || "";
        });
    }

    getDownloadProfile() {
        return {
            maxConcurrent: 1,
            delayMs: 1200,
            stopOnProtectedContent: true,
        };
    }

    _getNovelInfo(dom, baseUrl) {
        const data = this._getNextData(dom);
        const pageProps = data?.props?.pageProps || {};
        const serie = pageProps.serie || {};
        const serieData = serie.serie_data || {};
        const defaultRaw = Array.isArray(serie.raws)
            ? (serie.raws.find(raw => raw.default) || serie.raws[0])
            : null;
        const rawId = defaultRaw?.id || serieData.raw_id || this._extractRawId(baseUrl);
        const chapterCount = defaultRaw?.chapter_count || serieData.chapter_count || 0;
        const locale = this._extractLocale(baseUrl) || data?.query?.locale || "en";
        const slug = serieData.slug || this._extractNovelSlug(baseUrl);
        const novelUrl = `https://wtr-lab.com/${locale}/novel/${rawId}/${slug}`;

        return { rawId, chapterCount, locale, slug, novelUrl };
    }

    _getNextData(dom) {
        const script = dom.querySelector("#__NEXT_DATA__");
        if (!script) return null;

        try {
            return JSON.parse(script.textContent || "{}");
        } catch (error) {
            console.warn("[WtrLabParser] Failed to parse __NEXT_DATA__:", error);
            return null;
        }
    }

    _extractChapterOrder(url) {
        const match = String(url || "").match(/chapter-(\d+)/i);
        return match ? parseInt(match[1], 10) : null;
    }

    _extractRawId(url) {
        const match = String(url || "").match(/\/novel\/(\d+)\//i);
        return match ? parseInt(match[1], 10) : null;
    }

    _extractLocale(url) {
        const match = String(url || "").match(/wtr-lab\.com\/([^/]+)\//i)
            || String(url || "").match(/^\/([^/]+)\//);
        return match ? match[1] : "en";
    }

    _extractNovelSlug(url) {
        const match = String(url || "").match(/\/novel\/\d+\/([^/?#]+)/i);
        return match ? match[1] : "";
    }

    _cleanTitle(text) {
        return String(text || "").replace(/\s+/g, " ").trim();
    }
}

class WtrLabTurnstileError extends Error {
    constructor(chapterUrl, chapterOrder, message = "Please complete the Turnstile challenge to continue reading") {
        super(message);
        this.name = "WtrLabTurnstileError";
        this.code = "TURNSTILE_REQUIRED";
        this.chapterUrl = chapterUrl;
        this.chapterOrder = chapterOrder;
        this.protectedContent = true;
    }
}

window.WtrLabParser = WtrLabParser;
window.WtrLabTurnstileError = WtrLabTurnstileError;

window.parserRegistrations = window.parserRegistrations || [];
window.parserRegistrations.push(
    { hostname: "wtr-lab.com", parser: () => new WtrLabParser() },
    { hostname: "www.wtr-lab.com", parser: () => new WtrLabParser() }
);
