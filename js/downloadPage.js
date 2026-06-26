(function () {
    "use strict";

    let sourceUrl = "";
    let pageDom = null;
    let currentParser = null;
    let chapters = [];
    let isProcessing = false;
    let isPaused = false;
    let pauseWaiters = [];
    let activeDownloadId = null;
    let stopRequested = false;
    let protectedContentError = null;
    let jobState = {
        phase: "idle",
        done: 0,
        total: 0,
        status: "No active download.",
        browserStatus: "",
        sourceUrl: "",
        updatedAt: 0,
    };

    const els = {
        bookTitle: document.getElementById("bookTitle"),
        sourceUrl: document.getElementById("sourceUrl"),
        parserName: document.getElementById("parserName"),
        titleInput: document.getElementById("titleInput"),
        authorInput: document.getElementById("authorInput"),
        fileNameInput: document.getElementById("fileNameInput"),
        languageInput: document.getElementById("languageInput"),
        speedMode: document.getElementById("speedMode"),
        rightsConfirm: document.getElementById("rightsConfirm"),
        startChapter: document.getElementById("startChapter"),
        endChapter: document.getElementById("endChapter"),
        chapterSummary: document.getElementById("chapterSummary"),
        chapterPreview: document.getElementById("chapterPreview"),
        progressFill: document.getElementById("progressFill"),
        progressCount: document.getElementById("progressCount"),
        statusText: document.getElementById("statusText"),
        downloadStatus: document.getElementById("downloadStatus"),
        statusLog: document.getElementById("statusLog"),
        reloadBtn: document.getElementById("reloadBtn"),
        verificationBtn: document.getElementById("verificationBtn"),
        pauseBtn: document.getElementById("pauseBtn"),
        downloadBtn: document.getElementById("downloadBtn"),
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        sourceUrl = new URLSearchParams(location.search).get("source") || "";
        jobState.sourceUrl = sourceUrl;
        els.sourceUrl.textContent = sourceUrl;
        els.reloadBtn.addEventListener("click", loadSource);
        els.downloadBtn.addEventListener("click", downloadSelectedRange);
        els.verificationBtn.addEventListener("click", openVerificationPage);
        els.pauseBtn.addEventListener("click", togglePause);
        els.rightsConfirm.addEventListener("change", updateDownloadAvailability);
        chrome.downloads?.onChanged?.addListener(handleDownloadChanged);
        loadSource();
    }

    async function loadSource() {
        resetProgress("Loading table of contents...");
        els.downloadBtn.disabled = true;

        try {
            if (!sourceUrl) throw new Error("Missing source URL");

            const htmlDoc = await HttpClient.fetchHtml(sourceUrl);
            pageDom = htmlDoc;
            const baseEl = pageDom.createElement("base");
            baseEl.href = sourceUrl;
            pageDom.head.prepend(baseEl);

            currentParser = ParserFactory.getParser(sourceUrl, pageDom);
            els.parserName.textContent = currentParser.constructor.name.replace("Parser", "");

            const title = currentParser.extractTitle(pageDom) || "Untitled";
            const author = currentParser.extractAuthor(pageDom) || "Unknown";
            const language = currentParser.extractLanguage(pageDom) || "en";

            els.bookTitle.textContent = title;
            els.titleInput.value = title;
            els.authorInput.value = author;
            els.languageInput.value = language;
            els.fileNameInput.value = `${Util.sanitizeFilename(title)}.epub`;

            chapters = sortChapters(await currentParser.getChapterUrls(pageDom));
            if (chapters.length === 0) throw new Error("No chapters found");

            els.startChapter.max = chapters.length;
            els.endChapter.max = chapters.length;
            els.startChapter.value = 1;
            els.endChapter.value = chapters.length;
            els.chapterSummary.textContent = `${chapters.length} chapters found and arranged from 1 to ${chapters.length}. All are selected by default.`;
            renderChapterPreview();
            updateDownloadAvailability();
            setStatus("Ready to download.");
            log(`Ready: ${chapters.length} ordered chapters found.`);
        } catch (error) {
            setStatus(`Error: ${error.message}`);
            log(`ERROR: ${error.stack || error.message}`);
        }
    }

    function renderChapterPreview() {
        const preview = chapters.slice(0, 120).map((chapter, index) => {
            const title = escapeHtml(chapter.title || `Chapter ${index + 1}`);
            return `<div class="chapter-row"><span>${index + 1}</span>${title}</div>`;
        }).join("");
        const more = chapters.length > 120
            ? `<div class="chapter-row"><span>...</span>${chapters.length - 120} more chapters</div>`
            : "";
        els.chapterPreview.innerHTML = preview + more;
    }

    async function downloadSelectedRange() {
        if (isProcessing || !els.rightsConfirm.checked) return;
        isProcessing = true;
        isPaused = false;
        pauseWaiters = [];
        activeDownloadId = null;
        stopRequested = false;
        protectedContentError = null;
        els.downloadBtn.disabled = true;
        els.verificationBtn.hidden = true;
        els.pauseBtn.disabled = false;
        els.pauseBtn.textContent = "Pause";
        setDownloadStatus("Browser download: not started");

        const start = clamp(parseInt(els.startChapter.value, 10) || 1, 1, chapters.length);
        const end = clamp(parseInt(els.endChapter.value, 10) || chapters.length, start, chapters.length);
        const selected = chapters.slice(start - 1, end);

        resetProgress(`Downloading chapters ${start}-${end}...`);
        publishJobState({
            phase: "fetching",
            done: 0,
            total: selected.length,
            status: `Downloading chapters ${start}-${end}...`,
        });
        log(`Starting EPUB build for ${selected.length} chapters.`);

        try {
            const epubChapters = [];
            const imageCollector = new ImageCollector();
            const errors = [];
            let completed = 0;
            const queue = [...selected];
            const workers = [];
            const profile = typeof currentParser.getDownloadProfile === "function"
                ? currentParser.getDownloadProfile()
                : {};
            const speed = getDownloadSpeed(profile);
            const maxConcurrent = speed.maxConcurrent;
            const delayMs = speed.delayMs;
            log(`Speed: ${els.speedMode.value} (${maxConcurrent} simultaneous request${maxConcurrent === 1 ? "" : "s"}, ${delayMs} ms delay).`);

            for (let i = 0; i < Math.min(maxConcurrent, queue.length); i++) {
                workers.push(processWorker(queue, selected, epubChapters, imageCollector, errors, () => {
                    completed++;
                    const message = isPaused
                        ? `Paused after ${completed} of ${selected.length} chapters.`
                        : `Fetched ${completed} of ${selected.length} chapters...`;
                    updateProgress(completed, selected.length, message);
                }, delayMs));
            }

            await Promise.all(workers);

            epubChapters.sort((a, b) => a.index - b.index);

            let imageItems = [];
            if (imageCollector.totalDiscovered > 0) {
                setStatus("Downloading images...");
                await imageCollector.downloadImages((done, total) => {
                    setStatus(`Downloading image ${done} of ${total}...`);
                });
                imageItems = imageCollector.getEpubItems();
            }

            setStatus("Packing EPUB...");
            publishJobState({ phase: "packing", status: "Packing EPUB..." });
            const metadata = {
                title: els.titleInput.value.trim() || "Untitled",
                author: els.authorInput.value.trim() || "Unknown",
                language: els.languageInput.value.trim() || "en",
                uuid: Util.createUuid(),
                customCss: "",
            };

            const chapterItems = epubChapters.map((chapter, index) => {
                const chapterNum = String(index + 1).padStart(4, "0");
                return new EpubItem(
                    `OEBPS/Text/Chapter${chapterNum}.xhtml`,
                    "application/xhtml+xml",
                    wrapChapterXhtml(chapter.title, chapter.content),
                    `chapter${chapterNum}`
                );
            });

            const packer = new EpubPacker();
            const epubBlob = await packer.pack([...chapterItems, ...imageItems], metadata);
            const filename = getNovelFilename();
            const epubFile = new File([epubBlob], filename, {
                type: "application/epub+zip",
            });
            const objectUrl = URL.createObjectURL(epubFile);
            setDownloadStatus("Browser download: waiting for save location...");
            triggerNamedDownload(objectUrl, filename);
            activeDownloadId = await findNewestDownload(filename);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

            updateProgress(selected.length, selected.length, "EPUB built. Chrome download started.");
            publishJobState({ phase: "saving", status: "EPUB built. Chrome download started." });
            refreshDownloadStatus(activeDownloadId);
            if (errors.length) {
                log(`Completed with ${errors.length} chapter error(s). Those chapters were included as error notes.`);
            } else {
                log("Completed successfully.");
            }
        } catch (error) {
            if (isProtectedContentError(error)) {
                isPaused = true;
                setStatus("Paused: browser verification is required. No EPUB was created.");
                setDownloadStatus("Browser download: stopped before EPUB creation");
                els.verificationBtn.hidden = false;
                publishJobState({
                    phase: "verification",
                    status: "Paused: complete browser verification, then retry this range.",
                });
                log(`Stopped at chapter ${error.chapterOrder || "?"}: ${error.message}`);
                log("Open the verification page, complete the challenge in the browser, then retry the same range.");
            } else {
                setStatus(`Error: ${error.message}`);
                publishJobState({ phase: "error", status: `Error: ${error.message}` });
                log(`ERROR: ${error.stack || error.message}`);
            }
        } finally {
            isProcessing = false;
            isPaused = false;
            releasePauseWaiters();
            els.pauseBtn.disabled = true;
            els.pauseBtn.textContent = "Pause";
            updateDownloadAvailability();
        }
    }

    function updateDownloadAvailability() {
        els.downloadBtn.disabled = isProcessing || chapters.length === 0 || !els.rightsConfirm.checked;
    }

    async function processWorker(queue, selected, results, imageCollector, errors, onComplete, delayMs) {
        while (queue.length && !stopRequested) {
            await waitIfPaused();
            if (stopRequested) break;
            const chapter = queue.shift();
            const index = selected.indexOf(chapter);

            try {
                const result = await getChapterContent(chapter);
                let content = result.contentElement.cloneNode(true);
                currentParser.removeUnwantedElements(content);
                Util.sanitizeHtml(content);

                imageCollector.collectImages(content, chapter.sourceUrl);
                imageCollector.rewriteImageSources(content, chapter.sourceUrl);

                results.push({
                    index,
                    title: result.title || chapter.title || `Chapter ${index + 1}`,
                    content: content.innerHTML,
                });
            } catch (error) {
                if (isProtectedContentError(error)) {
                    // Keep the blocked chapter in the queue. The worker and all
                    // other workers remain alive until the user resumes.
                    queue.unshift(chapter);
                    enterVerificationPause(error, chapter);
                    await waitIfPaused();
                    continue;
                }

                errors.push({ chapter: chapter.title, error: error.message });
                results.push({
                    index,
                    title: chapter.title || `Chapter ${index + 1}`,
                    content: `<p><em>Error loading this chapter: ${escapeHtml(error.message)}</em></p>`,
                });
                log(`Chapter error: ${chapter.title || chapter.sourceUrl} - ${error.message}`);
            }

            onComplete();
            if (queue.length && !stopRequested && delayMs > 0) {
                await waitIfPaused();
                await Util.sleep(delayMs);
            }
        }
    }

    function togglePause() {
        if (!isProcessing) return;

        const resumingVerification = isPaused && Boolean(protectedContentError);
        isPaused = !isPaused;
        els.pauseBtn.textContent = isPaused ? "Resume" : "Pause";

        if (isPaused) {
            setStatus("Paused. Current in-flight chapters may finish, then the queue will wait.");
            publishJobState({ phase: "paused", status: "Paused by user." });
            log("Paused by user.");
        } else {
            if (resumingVerification) {
                protectedContentError = null;
                els.verificationBtn.hidden = true;
                setDownloadStatus("Browser download: not started");
                setStatus("Verification completed. Retrying the blocked chapter...");
                publishJobState({
                    phase: "fetching",
                    status: "Verification completed. Retrying the blocked chapter...",
                });
                log("Resuming after verification; retrying the blocked chapter.");
            } else {
                setStatus("Resuming chapter queue...");
                publishJobState({ phase: "fetching", status: "Resuming chapter queue..." });
                log("Resumed by user.");
            }
            releasePauseWaiters();
        }
    }

    function enterVerificationPause(error, chapter) {
        if (protectedContentError) return;

        protectedContentError = error;
        isPaused = true;
        els.verificationBtn.hidden = false;
        els.pauseBtn.disabled = false;
        els.pauseBtn.textContent = "Resume After Verification";
        setStatus("Paused: complete browser verification, then resume.");
        setDownloadStatus("Browser download: paused before EPUB creation");
        publishJobState({
            phase: "verification",
            status: "Paused: complete browser verification, then click Resume After Verification.",
        });
        log(`Verification required at ${chapter.title || chapter.sourceUrl}: ${error.message}`);
        log("Open the verification page, complete the challenge, then click Resume After Verification.");
    }

    function waitIfPaused() {
        if (!isPaused) return Promise.resolve();
        return new Promise(resolve => pauseWaiters.push(resolve));
    }

    function releasePauseWaiters() {
        const waiters = pauseWaiters;
        pauseWaiters = [];
        waiters.forEach(resolve => resolve());
    }

    async function getChapterContent(chapter) {
        if (typeof currentParser.fetchChapterContent === "function") {
            const result = await currentParser.fetchChapterContent(chapter);
            return {
                title: result?.title || chapter.title,
                contentElement: result?.contentElement || result,
            };
        }

        const doc = await HttpClient.fetchHtml(chapter.sourceUrl);
        throwIfVerificationPage(doc, chapter);
        const content = currentParser.findContent(doc);
        if (!content) throw new Error("No chapter content found");
        return { title: chapter.title, contentElement: content };
    }

    function sortChapters(items) {
        return [...items].sort((a, b) => {
            const aOrder = getChapterOrder(a);
            const bOrder = getChapterOrder(b);
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a.sourceUrl || "").localeCompare(String(b.sourceUrl || ""));
        });
    }

    function getChapterOrder(chapter) {
        if (Number.isFinite(chapter.order)) return chapter.order;
        const source = `${chapter.title || ""} ${chapter.sourceUrl || ""}`;
        const match = source.match(/(?:chapter|ch|c)[^\d]{0,8}(\d+(?:\.\d+)?)/i)
            || source.match(/\/(\d+)(?:[/?#-]|$)/);
        return match ? parseFloat(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    function wrapChapterXhtml(title, contentHtml) {
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

    function getNovelFilename() {
        const title = els.titleInput.value.trim() || els.bookTitle.textContent.trim() || "novel";
        const filename = `${Util.sanitizeFilename(title)}.epub`;
        els.fileNameInput.value = filename;
        return filename;
    }

    function getDownloadSpeed(siteProfile) {
        const isRestricted = Number.isFinite(siteProfile.maxConcurrent)
            || Number.isFinite(siteProfile.delayMs);
        const balanced = {
            maxConcurrent: siteProfile.maxConcurrent || 4,
            delayMs: siteProfile.delayMs ?? 150,
        };

        if (els.speedMode.value === "fast") {
            return isRestricted
                ? {
                    maxConcurrent: Math.min(2, Math.max(1, balanced.maxConcurrent * 2)),
                    delayMs: Math.max(250, Math.round(balanced.delayMs / 2)),
                }
                : { maxConcurrent: 8, delayMs: 30 };
        }

        if (els.speedMode.value === "cautious") {
            return {
                maxConcurrent: Math.min(2, balanced.maxConcurrent),
                delayMs: Math.max(750, balanced.delayMs * 2),
            };
        }

        return balanced;
    }

    function triggerNamedDownload(url, filename) {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function findNewestDownload(filename) {
        // Give Chrome a moment to register the download started by the link.
        await Util.sleep(300);
        try {
            const items = await chrome.downloads.search({
                orderBy: ["-startTime"],
                limit: 10,
            });
            const expected = filename.toLowerCase();
            const match = items.find(item => {
                const actual = String(item.filename || "").replace(/\\/g, "/").split("/").pop().toLowerCase();
                return actual === expected;
            });
            return match?.id || null;
        } catch (_) {
            return null;
        }
    }

    function resetProgress(message) {
        els.progressFill.style.width = "0%";
        els.progressCount.textContent = "0 / 0";
        els.statusLog.textContent = "";
        setDownloadStatus("Browser download: not started");
        setStatus(message);
    }

    function updateProgress(done, total, message) {
        const pct = total ? (done / total) * 100 : 0;
        els.progressFill.style.width = `${pct}%`;
        els.progressCount.textContent = `${done} / ${total}`;
        setStatus(message);
        publishJobState({
            phase: isPaused ? "paused" : "fetching",
            done,
            total,
            status: message,
        });
    }

    function setStatus(message) {
        els.statusText.textContent = message;
    }

    function setDownloadStatus(message) {
        els.downloadStatus.textContent = message;
        publishJobState({ browserStatus: message });
    }

    function isProtectedContentError(error) {
        return Boolean(error?.protectedContent)
            || error?.code === "TURNSTILE_REQUIRED"
            || /(turnstile|captcha|verification required|verify you are human|checking your browser)/i.test(error?.message || "");
    }

    function throwIfVerificationPage(doc, chapter) {
        const title = doc.title || "";
        const text = (doc.body?.innerText || doc.body?.textContent || "").slice(0, 12000);
        const hasChallengeWidget = Boolean(doc.querySelector(
            'iframe[src*="turnstile"], iframe[src*="captcha"], .cf-turnstile, [data-sitekey], #challenge-form, #cf-challenge-running'
        ));
        const challengeText = /(verify you are human|verification required|complete the (?:security )?check|checking your browser|attention required|captcha|turnstile challenge|cloudflare ray id)/i;
        if (!hasChallengeWidget && !challengeText.test(`${title}\n${text}`)) return;

        const error = new Error("Browser verification is required before this chapter can be downloaded");
        error.name = "VerificationRequiredError";
        error.code = "VERIFICATION_REQUIRED";
        error.protectedContent = true;
        error.chapterUrl = chapter.sourceUrl;
        error.chapterOrder = chapter.order;
        throw error;
    }

    function publishJobState(patch) {
        jobState = {
            ...jobState,
            ...patch,
            sourceUrl,
            updatedAt: Date.now(),
        };
        chrome.storage.local.set({ novelGrabberJob: jobState }).catch(() => {});
    }

    function openVerificationPage() {
        const url = protectedContentError?.chapterUrl || sourceUrl;
        if (url) {
            window.open(url, "_blank", "noopener");
        }
    }

    async function refreshDownloadStatus(downloadId) {
        if (!downloadId) return;

        try {
            const [item] = await chrome.downloads.search({ id: downloadId });
            if (!item) return;
            setDownloadStatus(formatDownloadItem(item));
        } catch (error) {
            setDownloadStatus(`Browser download: status unavailable (${error.message})`);
        }
    }

    function handleDownloadChanged(delta) {
        if (!activeDownloadId || delta.id !== activeDownloadId) return;
        refreshDownloadStatus(activeDownloadId);

        if (delta.state?.current === "complete") {
            setDownloadStatus("Browser download: complete");
            publishJobState({ phase: "complete", status: "Download complete." });
            log("Browser download completed.");
        } else if (delta.state?.current === "interrupted") {
            const reason = delta.error?.current ? ` (${delta.error.current})` : "";
            setDownloadStatus(`Browser download: interrupted${reason}`);
            publishJobState({ phase: "error", status: `Browser download interrupted${reason}.` });
            log(`Browser download interrupted${reason}.`);
        }
    }

    function formatDownloadItem(item) {
        if (item.state === "complete") return "Browser download: complete";
        if (item.state === "interrupted") {
            return `Browser download: interrupted${item.error ? ` (${item.error})` : ""}`;
        }

        const total = item.totalBytes || item.fileSize || 0;
        if (total > 0) {
            const pct = Math.round((item.bytesReceived / total) * 100);
            return `Browser download: ${pct}% (${formatBytes(item.bytesReceived)} / ${formatBytes(total)})`;
        }
        return `Browser download: ${item.state || "in progress"}`;
    }

    function formatBytes(bytes) {
        if (!bytes) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        let value = bytes;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function log(message) {
        const time = new Date().toLocaleTimeString();
        els.statusLog.textContent += `[${time}] ${message}\n`;
        els.statusLog.scrollTop = els.statusLog.scrollHeight;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
})();
