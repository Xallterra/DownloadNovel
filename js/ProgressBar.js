/**
 * ProgressBar.js — Progress tracking with live DOM updates.
 *
 * Manages a progress bar UI element, a status text label, and a count display.
 * Provides methods to set the total, increment progress, update status text,
 * reset, and mark completion.
 *
 * Expected DOM structure:
 *   <div class="progress-bar">              ← progressBarEl (the outer container)
 *     <div class="progress-bar-fill"></div>  ← inner fill element (auto-located)
 *   </div>
 *   <span class="status-text"></span>        ← statusEl
 *   <span class="count-text"></span>         ← countEl (e.g., "45 / 100")
 */

"use strict";

class ProgressBar {

    /**
     * Create a new ProgressBar controller.
     *
     * @param {HTMLElement} progressBarEl — The progress bar container element.
     *   Must contain a child with class "progress-bar-fill" whose width% is animated.
     * @param {HTMLElement} statusEl — An element to display the current status message.
     * @param {HTMLElement} countEl — An element to display the "completed / total" count.
     */
    constructor(progressBarEl, statusEl, countEl) {
        /** @type {HTMLElement} Outer progress bar container */
        this._progressBarEl = progressBarEl || null;

        /** @type {HTMLElement} Status text element */
        this._statusEl = statusEl || null;

        /** @type {HTMLElement} Count display element */
        this._countEl = countEl || null;

        /**
         * The inner fill element whose width represents progress.
         * Looked up once from the progressBarEl's children.
         * @type {HTMLElement|null}
         */
        this._fillEl = null;
        if (this._progressBarEl) {
            this._fillEl = this._progressBarEl.querySelector(".progress-bar-fill");
            // If no child fill element exists, assume the container itself is the fill bar
            if (!this._fillEl) {
                this._fillEl = this._progressBarEl;
            }
        }

        /** @type {number} Total number of items to complete */
        this._total = 0;

        /** @type {number} Number of items completed so far */
        this._completed = 0;

        // Initialize UI to zero state
        this._render();
    }

    /**
     * Set the total number of items and reset the completed count to zero.
     * @param {number} total — The total count.
     */
    setTotal(total) {
        this._total = Math.max(0, Math.floor(total));
        this._completed = 0;
        this._render();
    }

    /**
     * Increment the completed count by one and optionally update the status message.
     * @param {string} [statusText] — Optional status text to display.
     */
    increment(statusText) {
        this._completed = Math.min(this._completed + 1, this._total);
        if (statusText !== undefined) {
            this._setStatusText(statusText);
        }
        this._render();
    }

    /**
     * Update only the status message without changing progress.
     * @param {string} text — The status message to display.
     */
    setStatus(text) {
        this._setStatusText(text);
    }

    /**
     * Reset the progress bar to its initial zero state.
     */
    reset() {
        this._total = 0;
        this._completed = 0;
        this._setStatusText("");
        this._render();
    }

    /**
     * Set the progress bar to 100% complete.
     */
    complete() {
        this._completed = this._total;
        this._render();
    }

    /**
     * Get the current progress as a percentage (0–100).
     * @returns {number}
     */
    get percentage() {
        if (this._total <= 0) return 0;
        return Math.round((this._completed / this._total) * 100);
    }

    /**
     * Get the current completed count.
     * @returns {number}
     */
    get completed() {
        return this._completed;
    }

    /**
     * Get the total count.
     * @returns {number}
     */
    get total() {
        return this._total;
    }

    // ─── Private Rendering ───────────────────────────────────────────

    /**
     * Update all DOM elements to reflect the current state.
     * @private
     */
    _render() {
        const pct = this.percentage;

        // Update the fill element width
        if (this._fillEl) {
            this._fillEl.style.width = pct + "%";
        }

        // Update the count text (e.g., "45 / 100")
        if (this._countEl) {
            if (this._total > 0) {
                this._countEl.textContent = `${this._completed} / ${this._total}`;
            } else {
                this._countEl.textContent = "";
            }
        }
    }

    /**
     * Set the text content of the status element.
     * @private
     * @param {string} text
     */
    _setStatusText(text) {
        if (this._statusEl) {
            this._statusEl.textContent = text || "";
        }
    }
}

// Export for browser script-tag loading
window.ProgressBar = ProgressBar;
