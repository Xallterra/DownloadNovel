/**
 * EpubPacker.js — Assembles a complete EPUB 2.0.1 file from EpubItems and metadata.
 *
 * Generates all required structural files (mimetype, container.xml, content.opf,
 * toc.ncx, stylesheet.css, Cover.xhtml) and packs everything into a ZIP blob
 * using the zip.js library.
 *
 * Depends on:
 *   - JSZip (global `JSZip` constructor)
 *   - EpubItem.js
 *   - Util.js
 */

"use strict";

class EpubPacker {

    /**
     * Pack an array of EpubItems and metadata into a complete EPUB Blob.
     *
     * @param {EpubItem[]} epubItems — The content items (chapters, images, CSS, etc.).
     *   Chapter items should have zipPaths under "OEBPS/Text/" and mediaType "application/xhtml+xml".
     *   Image items should have zipPaths under "OEBPS/Images/".
     * @param {Object} metadata — Book metadata.
     * @param {string} metadata.title — Book title.
     * @param {string} metadata.author — Author name.
     * @param {string} [metadata.language="en"] — Language code (e.g., "en", "ja").
     * @param {string} [metadata.uuid] — Unique identifier; auto-generated if omitted.
     * @param {string} [metadata.coverImageId] — Manifest ID of the cover image item.
     * @param {string} [metadata.customCss] — Additional CSS to append to the default stylesheet.
     * @returns {Promise<Blob>} The EPUB file as a Blob.
     */
    async pack(epubItems, metadata) {
        const meta = this._normalizeMetadata(metadata);

        // Build the structural EPUB files
        const structuralItems = this._buildStructuralItems(epubItems, meta);

        // Combine structural items with user-supplied content items
        const allItems = [...structuralItems, ...epubItems];

        // Pack everything into a ZIP blob
        return await this._createZip(allItems);
    }

    /**
     * Normalize and fill in defaults for metadata.
     * @private
     */
    _normalizeMetadata(metadata) {
        return {
            title:        metadata.title || "Untitled",
            author:       metadata.author || "Unknown Author",
            language:     metadata.language || "en",
            uuid:         metadata.uuid || Util.createUuid(),
            coverImageId: metadata.coverImageId || null,
            customCss:    metadata.customCss || "",
        };
    }

    /**
     * Build all required EPUB structural files.
     * @private
     * @returns {EpubItem[]}
     */
    _buildStructuralItems(contentItems, meta) {
        const items = [];

        // 1. mimetype — must be first file, stored uncompressed
        items.push(new EpubItem(
            "mimetype",
            "application/epub+zip",
            "application/epub+zip",
            "mimetype"
        ));

        // 2. META-INF/container.xml
        items.push(new EpubItem(
            "META-INF/container.xml",
            "application/xml",
            this._buildContainerXml(),
            "container"
        ));

        // 3. OEBPS/Styles/stylesheet.css
        items.push(new EpubItem(
            "OEBPS/Styles/stylesheet.css",
            "text/css",
            this._buildStylesheet(meta.customCss),
            "stylesheet"
        ));

        // 4. OEBPS/Text/Cover.xhtml (only if a cover image is specified)
        if (meta.coverImageId) {
            const coverImage = contentItems.find(item => item.id === meta.coverImageId);
            const coverSrc = coverImage
                ? "../Images/" + coverImage.getFilename()
                : "";
            items.push(new EpubItem(
                "OEBPS/Text/Cover.xhtml",
                "application/xhtml+xml",
                this._buildCoverXhtml(meta.title, coverSrc),
                "cover"
            ));
        }

        // 5. OEBPS/toc.ncx
        const chapters = this._getChapters(contentItems, meta);
        items.push(new EpubItem(
            "OEBPS/toc.ncx",
            "application/x-dtbncx+xml",
            this._buildTocNcx(chapters, meta),
            "ncx"
        ));

        // 6. OEBPS/content.opf (must be last structural item so it references all others)
        items.push(new EpubItem(
            "OEBPS/content.opf",
            "application/oebps-package+xml",
            this._buildContentOpf(contentItems, meta),
            "opf"
        ));

        return items;
    }

    /**
     * Collect chapter items in order, optionally prepending the cover page.
     * @private
     * @returns {{id: string, title: string, href: string}[]}
     */
    _getChapters(contentItems, meta) {
        const chapters = [];

        // Add cover page as the first "chapter" if it exists
        if (meta.coverImageId) {
            chapters.push({
                id: "cover",
                title: "Cover",
                href: "Text/Cover.xhtml",
            });
        }

        // Add all chapter XHTML items, sorted by their zip path
        const chapterItems = contentItems
            .filter(item => item.isChapter())
            .sort((a, b) => a.zipPath.localeCompare(b.zipPath));

        for (const item of chapterItems) {
            // Derive a human-readable title from the filename
            const filename = item.getFilename().replace(/\.xhtml$/, "");
            const title = filename.replace(/([A-Z])/g, " $1").replace(/(\d+)/g, " $1").trim();
            chapters.push({
                id: item.id,
                title: title || filename,
                href: item.zipPath.replace(/^OEBPS\//, ""),
            });
        }

        return chapters;
    }

    // ─── XML Generators ──────────────────────────────────────────────

    /**
     * META-INF/container.xml — points the reading system to content.opf.
     * @private
     */
    _buildContainerXml() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    }

    /**
     * OEBPS/content.opf — the OPF package document with metadata, manifest, and spine.
     * @private
     */
    _buildContentOpf(contentItems, meta) {
        const manifestLines = [];
        const spineLines = [];

        // NCX reference (always present)
        manifestLines.push(`    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

        // Stylesheet
        manifestLines.push(`    <item id="stylesheet" href="Styles/stylesheet.css" media-type="text/css"/>`);

        // Cover page
        if (meta.coverImageId) {
            manifestLines.push(`    <item id="cover" href="Text/Cover.xhtml" media-type="application/xhtml+xml"/>`);
            spineLines.push(`    <itemref idref="cover"/>`);
        }

        // Content items (chapters, images, etc.)
        const chapterItems = [];
        for (const item of contentItems) {
            if (!item.id) continue;

            // Make href relative to the OEBPS directory
            const href = item.zipPath.replace(/^OEBPS\//, "");
            manifestLines.push(
                `    <item id="${Util.xmlEncode(item.id)}" href="${Util.xmlEncode(href)}" media-type="${Util.xmlEncode(item.mediaType)}"/>`
            );

            if (item.isChapter()) {
                chapterItems.push(item);
            }
        }

        // Sort chapters by zipPath for a predictable spine order
        chapterItems.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
        for (const ch of chapterItems) {
            spineLines.push(`    <itemref idref="${Util.xmlEncode(ch.id)}"/>`);
        }

        // Build the cover-image meta tag if applicable
        const coverMeta = meta.coverImageId
            ? `\n    <meta name="cover" content="${Util.xmlEncode(meta.coverImageId)}"/>`
            : "";

        return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${Util.xmlEncode(meta.title)}</dc:title>
    <dc:creator opf:role="aut">${Util.xmlEncode(meta.author)}</dc:creator>
    <dc:language>${Util.xmlEncode(meta.language)}</dc:language>
    <dc:identifier id="BookId">urn:uuid:${Util.xmlEncode(meta.uuid)}</dc:identifier>${coverMeta}
  </metadata>
  <manifest>
${manifestLines.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineLines.join("\n")}
  </spine>
</package>`;
    }

    /**
     * OEBPS/toc.ncx — EPUB 2 navigation (table of contents).
     * @private
     */
    _buildTocNcx(chapters, meta) {
        const navPoints = chapters.map((ch, i) => `    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${Util.xmlEncode(ch.title)}</text>
      </navLabel>
      <content src="${Util.xmlEncode(ch.href)}"/>
    </navPoint>`);

        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${Util.xmlEncode(meta.uuid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${Util.xmlEncode(meta.title)}</text>
  </docTitle>
  <navMap>
${navPoints.join("\n")}
  </navMap>
</ncx>`;
    }

    /**
     * OEBPS/Styles/stylesheet.css — default reading styles.
     * @private
     */
    _buildStylesheet(customCss) {
        const base = `/* NovelGrabber Default EPUB Stylesheet */

/* Reset and base typography */
body {
    margin: 1em;
    padding: 0;
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 1em;
    line-height: 1.6;
    color: #222;
    background-color: #fff;
    text-align: justify;
    -webkit-hyphens: auto;
    hyphens: auto;
}

/* Headings */
h1, h2, h3, h4, h5, h6 {
    font-family: "Helvetica Neue", "Arial", sans-serif;
    text-align: left;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.3;
}

h1 {
    font-size: 1.8em;
    border-bottom: 1px solid #ccc;
    padding-bottom: 0.3em;
}

h2 { font-size: 1.4em; }
h3 { font-size: 1.2em; }

/* Paragraphs */
p {
    margin: 0.5em 0;
    text-indent: 1.5em;
}

p:first-child,
h1 + p, h2 + p, h3 + p {
    text-indent: 0;
}

/* Links */
a {
    color: #2a6496;
    text-decoration: none;
}

/* Images */
img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1em auto;
}

/* Cover page */
.cover-page {
    text-align: center;
    padding: 0;
    margin: 0;
}

.cover-page img {
    max-width: 100%;
    max-height: 100%;
    margin: 0 auto;
}

/* Block quotes */
blockquote {
    margin: 1em 2em;
    padding-left: 1em;
    border-left: 3px solid #ccc;
    font-style: italic;
    color: #555;
}

/* Horizontal rules (scene breaks) */
hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 2em auto;
    width: 50%;
}

/* Preformatted text */
pre, code {
    font-family: "Courier New", monospace;
    font-size: 0.9em;
}

pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 1em 0;
    padding: 0.5em;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
}

/* Tables */
table {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
}

th, td {
    border: 1px solid #ccc;
    padding: 0.4em 0.8em;
    text-align: left;
}

th {
    background-color: #f0f0f0;
    font-weight: bold;
}`;

        if (customCss) {
            return base + "\n\n/* Custom Styles */\n" + customCss;
        }
        return base;
    }

    /**
     * OEBPS/Text/Cover.xhtml — cover page displaying the cover image.
     * @private
     */
    _buildCoverXhtml(title, coverImageSrc) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${Util.xmlEncode(title)}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/stylesheet.css"/>
</head>
<body>
  <div class="cover-page">
    <img src="${Util.xmlEncode(coverImageSrc)}" alt="Cover"/>
  </div>
</body>
</html>`;
    }

    // ─── ZIP Creation ────────────────────────────────────────────────

    /**
     * Create the EPUB ZIP archive.
     * The mimetype entry must be stored first and without compression.
     * @private
     * @param {EpubItem[]} allItems
     * @returns {Promise<Blob>}
     */
    async _createZip(allItems) {
        const jszip = new JSZip();

        // Separate mimetype from other items — it must be written first, uncompressed
        const mimetypeItem = allItems.find(item => item.zipPath === "mimetype");
        const otherItems = allItems.filter(item => item.zipPath !== "mimetype");

        // Write mimetype first, with no compression (stored)
        if (mimetypeItem) {
            jszip.file("mimetype", mimetypeItem.content, { compression: "STORE" });
        }

        // Write all other items with default compression
        for (const item of otherItems) {
            if (item.isBinary()) {
                // Binary content (images, etc.)
                let data;
                if (item.content instanceof ArrayBuffer) {
                    data = new Uint8Array(item.content);
                } else if (item.content instanceof Uint8Array) {
                    data = item.content;
                } else if (item.content instanceof Blob) {
                    data = item.content;
                } else if (Array.isArray(item.content)) {
                    // Array of bytes from background fetch
                    data = new Uint8Array(item.content);
                } else {
                    data = item.content;
                }
                jszip.file(item.zipPath, data, { binary: true });
            } else {
                // Text content (XHTML, XML, CSS, etc.)
                jszip.file(item.zipPath, item.content);
            }
        }

        return await jszip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
    }

    /**
     * Wrap raw chapter body HTML in a complete XHTML document.
     * Useful for callers who provide only inner-body content and need a full XHTML file.
     *
     * @param {string} bodyContent — The inner HTML of the chapter body.
     * @param {string} title — The chapter title for the <title> element.
     * @param {string} [stylesheetHref="../Styles/stylesheet.css"] — Path to the stylesheet.
     * @returns {string} A complete XHTML document string.
     */
    static wrapChapterXhtml(bodyContent, title, stylesheetHref) {
        const href = stylesheetHref || "../Styles/stylesheet.css";
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${Util.xmlEncode(title || "")}</title>
  <link rel="stylesheet" type="text/css" href="${Util.xmlEncode(href)}"/>
</head>
<body>
${bodyContent}
</body>
</html>`;
    }
}

// Export for browser script-tag loading
window.EpubPacker = EpubPacker;
