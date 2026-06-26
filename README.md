# Download Novel

Download Novel is a Chrome Manifest V3 extension for turning web novels and fiction pages into EPUB files for offline reading.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the cloned project folder.

## Use

1. Open a supported story table-of-contents page, such as RoyalRoad, AO3, FanFiction.net, Wattpad, ScribbleHub, NovelFull, FreeWebNovel, LightNovelPub, WebNovel, or WTR-LAB.
2. Click the Download Novel extension icon.
3. Confirm the title, author, cover, and selected chapters.
4. Click **Pack EPUB**.

On supported novel pages, Download Novel also shows a small floating prompt. Click **Open Downloader** to use a full extension tab with persistent progress, ordered chapters, range controls, pause/resume, and browser download status. This is better for long novels because Chrome popups close easily.

For unsupported sites, open **Advanced Options** and provide CSS selectors for chapter links and chapter content.

## Current Pieces

- Manifest V3 Chrome extension shell.
- Dark popup UI with metadata, chapter selection, progress, cover, and advanced selector controls.
- Parser factory plus site parsers for the initial supported sites, WTR-LAB, WordPress/blog-hosted translators, NovelBin-style mirrors, and ReadNovelFull-style mirrors.
- Generic fallback parser for selector-based extraction.
- EPUB 2 packaging with OPF, NCX, stylesheet, chapters, cover, and embedded images.
- Throttled fetching, retry handling, and image collection.
