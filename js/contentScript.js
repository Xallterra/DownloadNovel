/**
 * NovelGrabber - Content Script
 *
 * Captures the page DOM for the popup and shows a small persistent prompt on
 * recognizable novel pages. The prompt opens a full extension download tab,
 * which is safer than running a long download inside Chrome's closable popup.
 */

(function () {
    "use strict";

    const supportedHosts = [
        "wtr-lab.com",
        "royalroad.com",
        "archiveofourown.org",
        "fanfiction.net",
        "wattpad.com",
        "scribblehub.com",
        "freewebnovel.com",
        "novelfull.com",
        "novelfull.net",
        "lightnovelpub.com",
        "webnovel.com",
    ];

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "getPageContent") {
            try {
                const content = {
                    html: document.documentElement.outerHTML,
                    url: document.location.href,
                    title: document.title,
                    baseUrl: document.baseURI
                };
                sendResponse({ success: true, ...content });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        }
        return true;
    });

    function isNovelPage() {
        const host = location.hostname.replace(/^www\./, "").toLowerCase();
        const path = location.pathname.toLowerCase();
        if (supportedHosts.includes(host)) return true;
        return /\/(novel|fiction|story|chapter|works?)\//.test(path);
    }

    function injectPrompt() {
        if (!isNovelPage() || document.getElementById("novelgrabber-prompt")) return;
        if (sessionStorage.getItem("novelgrabberPromptDismissed") === "1") return;

        const box = document.createElement("div");
        box.id = "novelgrabber-prompt";
        box.innerHTML = `
            <style>
                #novelgrabber-prompt {
                    position: fixed;
                    right: 18px;
                    bottom: 18px;
                    z-index: 2147483647;
                    width: 280px;
                    padding: 14px;
                    border-radius: 10px;
                    background: #12121a;
                    color: #f4f4f8;
                    box-shadow: 0 16px 50px rgba(0,0,0,.35);
                    border: 1px solid rgba(255,255,255,.12);
                    font: 13px/1.45 Arial, sans-serif;
                }
                #novelgrabber-prompt strong {
                    display: block;
                    margin-bottom: 4px;
                    font-size: 14px;
                }
                #novelgrabber-prompt p {
                    margin: 0 0 10px;
                    color: #b9b9c8;
                }
                #novelgrabber-prompt .ng-actions {
                    display: flex;
                    gap: 8px;
                }
                #novelgrabber-prompt button {
                    border: 0;
                    border-radius: 8px;
                    padding: 8px 10px;
                    cursor: pointer;
                    font-weight: 700;
                }
                #novelgrabber-start {
                    flex: 1;
                    color: white;
                    background: linear-gradient(135deg, #7c3aed, #0891b2);
                }
                #novelgrabber-close {
                    color: #d5d5df;
                    background: rgba(255,255,255,.08);
                }
            </style>
            <strong>Download this novel?</strong>
            <p>Open Download Novel with ordered chapters and live status.</p>
            <div class="ng-actions">
                <button id="novelgrabber-start" type="button">Open Downloader</button>
                <button id="novelgrabber-close" type="button">No</button>
            </div>
        `;

        document.documentElement.appendChild(box);
        box.querySelector("#novelgrabber-start").addEventListener("click", () => {
            openDownloaderOrReconnect(box);
        });
        box.querySelector("#novelgrabber-close").addEventListener("click", () => {
            sessionStorage.setItem("novelgrabberPromptDismissed", "1");
            box.remove();
        });
    }

    function openDownloaderOrReconnect(box) {
        const button = box.querySelector("#novelgrabber-start");

        try {
            if (!chrome.runtime?.id) {
                location.reload();
                return;
            }

            button.disabled = true;
            button.textContent = "Opening...";
            chrome.runtime.sendMessage(
                { action: "openDownloadPage", url: location.href },
                response => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        if (/context invalidated|receiving end does not exist/i.test(error.message || "")) {
                            location.reload();
                            return;
                        }
                        button.disabled = false;
                        button.textContent = "Try Again";
                        return;
                    }

                    if (!response?.success) {
                        button.disabled = false;
                        button.textContent = "Try Again";
                    }
                }
            );
        } catch (error) {
            if (/context invalidated/i.test(error?.message || "")) {
                location.reload();
                return;
            }
            button.disabled = false;
            button.textContent = "Try Again";
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectPrompt, { once: true });
    } else {
        injectPrompt();
    }
})();
