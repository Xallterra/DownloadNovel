/**
 * NovelGrabber — Background Service Worker (Manifest V3)
 * 
 * Handles cross-origin fetches on behalf of the popup,
 * since service workers have full host_permissions access.
 */

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchHtml') {
        fetchHtml(request.url, request.options || {})
            .then(html => sendResponse({ success: true, html }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }

    if (request.action === 'fetchBinary') {
        fetchBinary(request.url, request.options || {})
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'getActiveTabContent') {
        getActiveTabContent()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'downloadEpub') {
        downloadEpub(request.blob, request.filename)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'openDownloadPage') {
        const pageUrl = chrome.runtime.getURL(
            `download.html?source=${encodeURIComponent(request.url || '')}`
        );
        chrome.tabs.create({ url: pageUrl })
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

/**
 * Fetch HTML content from a URL
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<string>} The HTML content
 */
async function fetchHtml(url, options = {}) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            ...options.headers
        },
        ...options
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    return await response.text();
}

/**
 * Fetch binary content from a URL
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<ArrayBuffer>} The binary content
 */
async function fetchBinary(url, options = {}) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Accept': 'image/*,*/*;q=0.8',
            ...options.headers
        },
        ...options
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    const buffer = await response.arrayBuffer();
    // Convert to array for message passing (ArrayBuffer can't be sent directly)
    return Array.from(new Uint8Array(buffer));
}

/**
 * Get the active tab's HTML content by injecting a script
 * @returns {Promise<Object>} The tab info and HTML
 */
async function getActiveTabContent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        throw new Error('No active tab found');
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
                html: document.documentElement.outerHTML,
                url: document.location.href,
                title: document.title
            })
        });

        if (results && results[0]) {
            return {
                success: true,
                html: results[0].result.html,
                url: results[0].result.url,
                title: results[0].result.title
            };
        }
        throw new Error('Failed to get tab content');
    } catch (error) {
        throw new Error(`Cannot access tab: ${error.message}`);
    }
}

/**
 * Download an EPUB file using the Chrome downloads API
 * @param {string} dataUrl - The data URL of the EPUB
 * @param {string} filename - The filename for the download
 */
async function downloadEpub(dataUrl, filename) {
    await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
    });
}

// Log when service worker starts
console.log('NovelGrabber service worker initialized');
