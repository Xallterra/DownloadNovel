/**
 * NovelGrabber — Main Controller (main.js)
 * 
 * Orchestrates the full pipeline:
 * 1. Capture active tab DOM
 * 2. Select parser via ParserFactory
 * 3. Extract metadata & chapter list → populate UI
 * 4. On "Pack EPUB": fetch chapters → extract content → collect images → pack EPUB → download
 */

(function () {
    'use strict';

    // ---- State ----
    let currentParser = null;
    let chapterList = [];
    let pageUrl = '';
    let pageDom = null;
    let isProcessing = false;

    // ---- DOM References ----
    const elements = {
        // Metadata
        storyTitle: document.getElementById('storyTitle'),
        storyAuthor: document.getElementById('storyAuthor'),
        storyLanguage: document.getElementById('storyLanguage'),
        fileName: document.getElementById('fileName'),
        coverImageUrl: document.getElementById('coverImageUrl'),
        coverPreview: document.getElementById('coverPreview'),

        // Parser
        parserName: document.getElementById('parserName'),
        parserStatus: document.getElementById('parserStatus'),

        // Chapters
        chapterList: document.getElementById('chapterList'),
        chapterCount: document.getElementById('chapterCount'),
        chapterEmpty: document.getElementById('chapterEmpty'),
        selectAllBtn: document.getElementById('selectAllBtn'),
        selectNoneBtn: document.getElementById('selectNoneBtn'),

        // Progress
        progressSection: document.getElementById('progressSection'),
        progressBarFill: document.getElementById('progressBarFill'),
        progressCount: document.getElementById('progressCount'),
        progressStatus: document.getElementById('progressStatus'),

        // Advanced
        advancedToggle: document.getElementById('advancedToggle'),
        advancedContent: document.getElementById('advancedContent'),
        advancedChevron: document.getElementById('advancedChevron'),
        contentSelector: document.getElementById('contentSelector'),
        titleSelector: document.getElementById('titleSelector'),
        chapterLinksSelector: document.getElementById('chapterLinksSelector'),
        removeSelector: document.getElementById('removeSelector'),
        maxConcurrent: document.getElementById('maxConcurrent'),
        delayMs: document.getElementById('delayMs'),
        includeImages: document.getElementById('includeImages'),
        customCss: document.getElementById('customCss'),
        rightsConfirm: document.getElementById('rightsConfirm'),

        // Actions
        reloadBtn: document.getElementById('reloadBtn'),
        packEpubBtn: document.getElementById('packEpubBtn'),
    };

    // ---- Progress Bar Helper ----
    const progress = {
        total: 0,
        completed: 0,

        show() {
            elements.progressSection.style.display = 'block';
            elements.progressSection.classList.remove('complete');
        },

        hide() {
            elements.progressSection.style.display = 'none';
        },

        setTotal(total) {
            this.total = total;
            this.completed = 0;
            this.update('Initializing...');
        },

        increment(statusText) {
            this.completed++;
            this.update(statusText);
        },

        update(statusText) {
            const pct = this.total > 0 ? (this.completed / this.total) * 100 : 0;
            elements.progressBarFill.style.width = `${pct}%`;
            elements.progressCount.textContent = `${this.completed} / ${this.total}`;
            if (statusText) {
                elements.progressStatus.textContent = statusText;
            }
        },

        complete() {
            elements.progressBarFill.style.width = '100%';
            elements.progressCount.textContent = `${this.total} / ${this.total}`;
            elements.progressStatus.textContent = 'Complete! Your EPUB is downloading.';
            elements.progressSection.classList.add('complete');
        },

        error(message) {
            elements.progressStatus.textContent = `Error: ${message}`;
        }
    };

    // ---- Initialize ----
    async function init() {
        setupEventListeners();
        await restoreSharedProgress();
        chrome.storage.onChanged.addListener(handleStorageChanged);
        await loadPageContent();
    }

    async function restoreSharedProgress() {
        const { novelGrabberJob } = await chrome.storage.local.get('novelGrabberJob');
        renderSharedProgress(novelGrabberJob);
    }

    function handleStorageChanged(changes, areaName) {
        if (areaName === 'local' && changes.novelGrabberJob) {
            renderSharedProgress(changes.novelGrabberJob.newValue);
        }
    }

    function renderSharedProgress(job) {
        if (!job || job.phase === 'idle') return;
        progress.total = Number(job.total) || 0;
        progress.completed = Number(job.done) || 0;
        progress.show();
        progress.update([job.status, job.browserStatus].filter(Boolean).join(' '));
        elements.progressSection.classList.toggle('complete', job.phase === 'complete');
    }

    // ---- Event Listeners ----
    function setupEventListeners() {
        // Advanced toggle
        elements.advancedToggle.addEventListener('click', () => {
            elements.advancedContent.classList.toggle('open');
            elements.advancedChevron.classList.toggle('open');
        });

        // Select all/none
        elements.selectAllBtn.addEventListener('click', () => toggleAllChapters(true));
        elements.selectNoneBtn.addEventListener('click', () => toggleAllChapters(false));

        // Pack EPUB
        elements.packEpubBtn.addEventListener('click', () => {
            if (!isProcessing) packEpub();
        });

        // Reload
        elements.reloadBtn.addEventListener('click', () => loadPageContent());
        elements.rightsConfirm.addEventListener('change', updateChapterCount);

        // Cover image preview
        elements.coverImageUrl.addEventListener('input', updateCoverPreview);

        // Update filename when title changes
        elements.storyTitle.addEventListener('input', () => {
            const title = elements.storyTitle.value.trim();
            if (title) {
                elements.fileName.value = Util.sanitizeFilename(title) + '.epub';
            }
        });
    }

    // ---- Load Active Tab Content ----
    async function loadPageContent() {
        setParserStatus('Loading...', false);

        try {
            // Get active tab content via background script
            const response = await chrome.runtime.sendMessage({ action: 'getActiveTabContent' });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to get page content');
            }

            pageUrl = response.url;
            const parser = new DOMParser();
            pageDom = parser.parseFromString(response.html, 'text/html');

            // Set base URL for relative links
            const baseEl = pageDom.createElement('base');
            baseEl.href = pageUrl;
            pageDom.head.prepend(baseEl);

            await detectParser();
        } catch (error) {
            console.error('Failed to load page:', error);
            setParserStatus('Error loading page', false);
        }
    }

    // ---- Detect Parser ----
    async function detectParser() {
        try {
            currentParser = ParserFactory.getParser(pageUrl, pageDom);
            const parserName = currentParser.constructor.name || 'DefaultParser';
            setParserStatus(parserName.replace('Parser', ''), true);

            // If using DefaultParser, apply any saved selectors
            if (currentParser instanceof DefaultParser) {
                applyDefaultParserSelectors();
            }

            // Extract metadata
            const title = currentParser.extractTitle(pageDom);
            const author = currentParser.extractAuthor(pageDom);
            const language = currentParser.extractLanguage(pageDom);
            const coverUrl = currentParser.findCoverImageUrl(pageDom);

            if (title) elements.storyTitle.value = title;
            if (author) elements.storyAuthor.value = author;
            if (language) elements.storyLanguage.value = language;
            if (coverUrl) {
                elements.coverImageUrl.value = coverUrl;
                updateCoverPreview();
            }
            if (title) {
                elements.fileName.value = Util.sanitizeFilename(title) + '.epub';
            }

            // Extract chapters
            await loadChapters();
        } catch (error) {
            console.error('Parser detection failed:', error);
            setParserStatus('No parser found', false);
        }
    }

    // ---- Load Chapters ----
    async function loadChapters() {
        try {
            chapterList = sortChapters(await currentParser.getChapterUrls(pageDom));

            if (chapterList.length === 0) {
                elements.chapterEmpty.style.display = 'flex';
                elements.packEpubBtn.disabled = true;
                elements.chapterCount.textContent = '0 chapters';
                return;
            }

            elements.chapterEmpty.style.display = 'none';
            renderChapterList();
        } catch (error) {
            console.error('Failed to load chapters:', error);
            elements.chapterEmpty.innerHTML = `
                <p style="color: #f87171;">Failed to extract chapters: ${error.message}</p>
            `;
        }
    }

    // ---- Render Chapter List ----
    function renderChapterList() {
        // Clear existing items (except the empty placeholder)
        const existingItems = elements.chapterList.querySelectorAll('.chapter-item');
        existingItems.forEach(item => item.remove());

        chapterList.forEach((chapter, index) => {
            const item = document.createElement('label');
            item.className = 'chapter-item';
            item.innerHTML = `
                <input type="checkbox" checked data-index="${index}">
                <span class="chapter-checkbox"></span>
                <span class="chapter-name" title="${escapeHtml(chapter.title)}">${escapeHtml(chapter.title)}</span>
                <span class="chapter-index">${index + 1}</span>
            `;
            elements.chapterList.appendChild(item);
        });

        updateChapterCount();
    }

    // ---- Sort Chapters By TOC Order ----
    function sortChapters(chapters) {
        return [...chapters].sort((a, b) => {
            const aOrder = getChapterOrder(a);
            const bOrder = getChapterOrder(b);
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a.sourceUrl || '').localeCompare(String(b.sourceUrl || ''));
        });
    }

    function getChapterOrder(chapter) {
        if (Number.isFinite(chapter.order)) return chapter.order;
        const source = `${chapter.title || ''} ${chapter.sourceUrl || ''}`;
        const match = source.match(/(?:chapter|ch|c)[^\d]{0,8}(\d+(?:\.\d+)?)/i)
            || source.match(/\/(\d+)(?:[/?#-]|$)/);
        return match ? parseFloat(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    // ---- Toggle All Chapters ----
    function toggleAllChapters(checked) {
        const checkboxes = elements.chapterList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = checked);
        updateChapterCount();
    }

    // ---- Update Chapter Count ----
    function updateChapterCount() {
        const total = chapterList.length;
        const checked = elements.chapterList.querySelectorAll('input[type="checkbox"]:checked').length;
        elements.chapterCount.textContent = `${checked} / ${total} chapters`;
        elements.packEpubBtn.disabled = checked === 0 || !elements.rightsConfirm.checked;
    }

    // ---- Set Parser Status ----
    function setParserStatus(name, active) {
        elements.parserName.textContent = name;
        const dot = elements.parserStatus.querySelector('.status-dot');
        if (active) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    }

    // ---- Update Cover Preview ----
    function updateCoverPreview() {
        const url = elements.coverImageUrl.value.trim();
        if (url) {
            elements.coverPreview.innerHTML = `<img src="${escapeHtml(url)}" alt="Cover">`;
        } else {
            elements.coverPreview.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="m21 15-5-5L5 21"/>
                </svg>`;
        }
    }

    // ---- Apply Default Parser Selectors ----
    function applyDefaultParserSelectors() {
        if (currentParser instanceof DefaultParser) {
            const cs = elements.contentSelector.value.trim();
            const ts = elements.titleSelector.value.trim();
            const cls = elements.chapterLinksSelector.value.trim();
            const rs = elements.removeSelector.value.trim();

            if (cs) currentParser.setContentSelector(cs);
            if (ts) currentParser.setTitleSelector(ts);
            if (cls) currentParser.setChapterSelector(cls);
            if (rs) currentParser.setRemoveSelector(rs);
        }
    }

    // ---- Pack EPUB ----
    async function packEpub() {
        if (isProcessing || !elements.rightsConfirm.checked) return;
        isProcessing = true;

        const selectedIndexes = getSelectedChapterIndexes();
        if (selectedIndexes.length === 0) return;

        const selectedChapters = selectedIndexes.map(i => chapterList[i]);

        // Disable UI
        elements.packEpubBtn.disabled = true;
        elements.packEpubBtn.innerHTML = `<span class="loading-spinner"></span> Processing...`;

        // Show progress
        progress.show();
        progress.setTotal(selectedChapters.length);
        progress.update('Starting...');

        try {
            // Options
            const maxConcurrent = parseInt(elements.maxConcurrent.value) || 5;
            const delayMs = parseInt(elements.delayMs.value) || 200;
            const includeImages = elements.includeImages.checked;

            // If using DefaultParser, apply current selectors
            applyDefaultParserSelectors();

            // Fetch and process chapters
            const epubChapters = [];
            const imageCollector = new ImageCollector();
            let fetchedCount = 0;

            // Process chapters with concurrency control
            const queue = [...selectedChapters];
            const workers = [];
            const errors = [];

            for (let i = 0; i < Math.min(maxConcurrent, queue.length); i++) {
                workers.push(processChapterWorker(queue, epubChapters, imageCollector, includeImages, delayMs, errors, () => {
                    fetchedCount++;
                    progress.increment(`Fetching chapter ${fetchedCount} of ${selectedChapters.length}...`);
                }));
            }

            await Promise.all(workers);

            // Sort chapters back to original order
            epubChapters.sort((a, b) => a.index - b.index);

            // Download images if enabled
            let imageEpubItems = [];
            if (includeImages && imageCollector.totalDiscovered > 0) {
                progress.update('Downloading images...');
                await imageCollector.downloadImages((completed, total) => {
                    progress.update(`Downloading image ${completed} of ${total}...`);
                });
                imageEpubItems = imageCollector.getEpubItems();
            }

            // Build EPUB
            progress.update('Packing EPUB...');

            const metadata = {
                title: elements.storyTitle.value.trim() || 'Untitled',
                author: elements.storyAuthor.value.trim() || 'Unknown',
                language: elements.storyLanguage.value || 'en',
                uuid: Util.createUuid(),
                customCss: elements.customCss.value.trim() || '',
                coverImageUrl: elements.coverImageUrl.value.trim() || null
            };

            // Create chapter EpubItems
            const chapterItems = epubChapters.map((ch, i) => {
                const chapterNum = String(i + 1).padStart(4, '0');
                const xhtml = wrapChapterXhtml(ch.title, ch.content, metadata.title);
                return new EpubItem(
                    `OEBPS/Text/Chapter${chapterNum}.xhtml`,
                    'application/xhtml+xml',
                    xhtml,
                    `chapter${chapterNum}`
                );
            });

            // Download cover image if provided
            let coverImageItem = null;
            if (metadata.coverImageUrl) {
                try {
                    progress.update('Downloading cover image...');
                    const coverData = await HttpClient.fetchBinary(metadata.coverImageUrl);
                    const ext = Util.getFileExtension(metadata.coverImageUrl) || 'jpg';
                    const mimeType = Util.getMimeType(ext);
                    coverImageItem = new EpubItem(
                        `OEBPS/Images/cover.${ext}`,
                        mimeType,
                        coverData,
                        'cover-image'
                    );
                    metadata.coverImageId = 'cover-image';
                    metadata.coverImagePath = `Images/cover.${ext}`;
                } catch (e) {
                    console.warn('Failed to download cover image:', e);
                }
            }

            // Combine all items
            const allItems = [
                ...chapterItems,
                ...imageEpubItems,
            ];
            if (coverImageItem) allItems.push(coverImageItem);

            // Pack EPUB
            const packer = new EpubPacker();
            const epubBlob = await packer.pack(allItems, metadata);

            // Trigger download
            const novelTitle = elements.storyTitle.value.trim() || 'novel';
            const filename = `${Util.sanitizeFilename(novelTitle)}.epub`;
            const epubFile = new File([epubBlob], filename, {
                type: 'application/epub+zip'
            });
            const downloadUrl = URL.createObjectURL(epubFile);
            elements.fileName.value = filename;

            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();

            // Cleanup
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);

            progress.complete();

            if (errors.length > 0) {
                progress.update(`Complete with ${errors.length} error(s). Check console for details.`);
                console.warn('Chapter fetch errors:', errors);
            }

        } catch (error) {
            console.error('EPUB packing failed:', error);
            progress.error(error.message);
        } finally {
            isProcessing = false;
            updateChapterCount();
            elements.packEpubBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Pack EPUB`;
        }
    }

    // ---- Chapter Worker ----
    async function processChapterWorker(queue, results, imageCollector, includeImages, delayMs, errors, onComplete) {
        while (queue.length > 0) {
            const chapter = queue.shift();
            if (!chapter) break;

            const index = chapterList.indexOf(chapter);

            try {
                let actualTitle = chapter.title;
                let content = null;

                if (typeof currentParser.fetchChapterContent === 'function') {
                    const result = await currentParser.fetchChapterContent(chapter);
                    content = result?.contentElement || result;
                    actualTitle = result?.title || actualTitle;
                } else {
                    // Fetch chapter page
                    const chapterDom = await HttpClient.fetchHtml(chapter.sourceUrl);

                    // Extract content
                    content = currentParser.findContent(chapterDom);
                }

                if (!content) {
                    throw new Error(`No content found for: ${chapter.title}`);
                }

                // Clone content so we don't modify the original
                content = content.cloneNode(true);

                // Remove unwanted elements
                currentParser.removeUnwantedElements(content);

                // Sanitize
                Util.sanitizeHtml(content);

                // Collect images
                if (includeImages) {
                    imageCollector.collectImages(content, chapter.sourceUrl);
                    imageCollector.rewriteImageSources(content, chapter.sourceUrl);
                }

                results.push({
                    index: index,
                    title: actualTitle,
                    content: content.innerHTML
                });
            } catch (error) {
                console.warn(`Error fetching chapter "${chapter.title}":`, error);
                errors.push({ chapter: chapter.title, error: error.message });

                // Add placeholder
                results.push({
                    index: index,
                    title: chapter.title,
                    content: `<p><em>Error loading this chapter: ${escapeHtml(error.message)}</em></p>`
                });
            }

            onComplete();

            // Delay between requests
            if (queue.length > 0 && delayMs > 0) {
                await Util.sleep(delayMs);
            }
        }
    }

    // ---- Wrap Chapter in XHTML ----
    function wrapChapterXhtml(title, contentHtml, bookTitle) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${Util.xmlEncode(title)}</title>
    <link rel="stylesheet" type="text/css" href="../Styles/stylesheet.css"/>
</head>
<body>
    <h1>${Util.xmlEncode(title)}</h1>
    ${Util.htmlToXhtml(contentHtml)}
</body>
</html>`;
    }

    // ---- Get Selected Chapter Indexes ----
    function getSelectedChapterIndexes() {
        const checkboxes = elements.chapterList.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    }

    // ---- Escape HTML ----
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ---- Listen for chapter checkbox changes ----
    document.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.dataset.index !== undefined) {
            updateChapterCount();
        }
    });

    // ---- Start ----
    document.addEventListener('DOMContentLoaded', init);
})();
