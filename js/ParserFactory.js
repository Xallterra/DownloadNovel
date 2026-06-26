/**
 * ParserFactory.js — Parser registry and URL matching for NovelGrabber.
 *
 * Provides a central registry where site-specific parsers register
 * themselves by hostname.  When the extension needs a parser it calls
 * `ParserFactory.getParser(url, dom)` which returns the best match
 * or falls back to the generic DefaultParser.
 *
 * ── Registration Flow ────────────────────────────────────────────
 *
 * Each parser file appends to `window.parserRegistrations` at load
 * time.  ParserFactory.init() sweeps that array and calls
 * `register()` for every entry.  This keeps parser files decoupled
 * from the factory — they don't need to import it.
 *
 * ── Load Order (in manifest.json or HTML) ────────────────────────
 *
 *   1. Parser.js              (base class)
 *   2. DefaultParser.js       (generic fallback)
 *   3. parsers/*.js           (site-specific, any order)
 *   4. ParserFactory.js       (this file — must be LAST)
 */

class ParserFactory {
    constructor() {
        /**
         * Map of hostname → parser constructor function.
         * @type {Map<string, function(): Parser>}
         */
        this._hostnameRegistry = new Map();

        /**
         * Array of {predicate, constructor} for URL-rule based matching.
         * @type {Array<{predicate: function(string): boolean, constructor: function(): Parser}>}
         */
        this._urlRules = [];

        /**
         * Cached DefaultParser instance (lazily created).
         * @type {DefaultParser|null}
         */
        this._defaultParser = null;
    }

    // ─── Registration API ────────────────────────────────────────────

    /**
     * Register a parser constructor for a specific hostname.
     *
     * @param {string}   hostname          e.g. "royalroad.com"
     * @param {function(): Parser} parserConstructor  Factory function
     *                                      returning a new parser instance.
     */
    register(hostname, parserConstructor) {
        const normalised = hostname.toLowerCase().trim();
        this._hostnameRegistry.set(normalised, parserConstructor);
    }

    /**
     * Register a parser using a URL predicate function or RegExp.
     *
     * The predicate receives the full URL string and should return
     * `true` if the parser should handle it.  A RegExp is automatically
     * converted into a predicate.
     *
     * @param {RegExp|function(string): boolean} urlPredicate
     * @param {function(): Parser} parserConstructor
     */
    registerUrlRule(urlPredicate, parserConstructor) {
        let predicate;

        if (urlPredicate instanceof RegExp) {
            const re = urlPredicate;
            predicate = (url) => re.test(url);
        } else if (typeof urlPredicate === 'function') {
            predicate = urlPredicate;
        } else {
            throw new TypeError('urlPredicate must be a RegExp or function');
        }

        this._urlRules.push({ predicate, constructor: parserConstructor });
    }

    // ─── Lookup API ──────────────────────────────────────────────────

    /**
     * Return the best-matching parser instance for the given URL.
     *
     * Matching priority:
     *   1. Exact hostname match (including `www.` variant).
     *   2. First matching URL rule (predicate / regex).
     *   3. DefaultParser fallback.
     *
     * @param {string}    url  The page URL.
     * @param {Document} [dom] Optional DOM (unused by default but
     *                         available for future content-sniffing).
     * @returns {Parser}
     */
    getParser(url, dom) {
        // ── 1. Hostname lookup ───────────────────────────────────────
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.toLowerCase();

            // Direct match.
            if (this._hostnameRegistry.has(hostname)) {
                return this._hostnameRegistry.get(hostname)();
            }

            // Try without "www." prefix.
            const noWww = hostname.replace(/^www\./, '');
            if (noWww !== hostname && this._hostnameRegistry.has(noWww)) {
                return this._hostnameRegistry.get(noWww)();
            }

            // Try with "www." prefix.
            const withWww = 'www.' + noWww;
            if (this._hostnameRegistry.has(withWww)) {
                return this._hostnameRegistry.get(withWww)();
            }
        } catch (_) {
            // If the URL can't be parsed, fall through.
        }

        // ── 2. URL rule matching ─────────────────────────────────────
        for (const rule of this._urlRules) {
            try {
                if (rule.predicate(url)) {
                    return rule.constructor();
                }
            } catch (_) {
                // If a predicate throws, skip it.
            }
        }

        // ── 3. Fallback ─────────────────────────────────────────────
        return this._getDefaultParser();
    }

    /**
     * Static convenience wrapper for callers that use ParserFactory as a
     * global service instead of reaching for the singleton directly.
     *
     * @param {string} url
     * @param {Document} [dom]
     * @returns {Parser}
     */
    static getParser(url, dom) {
        return window.parserFactory.getParser(url, dom);
    }

    /**
     * Check whether a site-specific parser is registered for the given URL.
     *
     * @param {string} url
     * @returns {boolean}
     */
    hasParser(url) {
        try {
            const parser = this.getParser(url);
            return !(parser instanceof DefaultParser);
        } catch (_) {
            return false;
        }
    }

    /**
     * Static convenience wrapper for parser availability checks.
     *
     * @param {string} url
     * @returns {boolean}
     */
    static hasParser(url) {
        return window.parserFactory.hasParser(url);
    }

    /**
     * Return a list of all registered hostnames (for the popup UI).
     *
     * @returns {string[]}
     */
    getRegisteredHostnames() {
        return Array.from(this._hostnameRegistry.keys()).sort();
    }

    /**
     * Static convenience wrapper for registered hostname discovery.
     *
     * @returns {string[]}
     */
    static getRegisteredHostnames() {
        return window.parserFactory.getRegisteredHostnames();
    }

    // ─── Initialisation ──────────────────────────────────────────────

    /**
     * Process the `window.parserRegistrations` array populated by
     * individual parser files and register each entry.
     *
     * Call this once after all parser scripts have loaded.
     */
    init() {
        const registrations = window.parserRegistrations || [];

        for (const entry of registrations) {
            if (entry.hostname && typeof entry.parser === 'function') {
                this.register(entry.hostname, entry.parser);
            }
            if (entry.urlRule && typeof entry.parser === 'function') {
                this.registerUrlRule(entry.urlRule, entry.parser);
            }
        }

        console.log(
            `[ParserFactory] Initialised with ${this._hostnameRegistry.size} hostname(s) ` +
            `and ${this._urlRules.length} URL rule(s).`
        );
    }

    // ─── Private ─────────────────────────────────────────────────────

    /**
     * Lazily create (or return cached) DefaultParser instance.
     *
     * @returns {DefaultParser}
     * @private
     */
    _getDefaultParser() {
        if (!this._defaultParser) {
            this._defaultParser = new DefaultParser();
        }
        return this._defaultParser;
    }
}

// ─── Global Singleton ────────────────────────────────────────────────

// Create the singleton instance and expose it globally.
window.parserFactory = new ParserFactory();

// Auto-initialise: sweep registrations from all parser files.
window.parserFactory.init();

// Also expose the class itself for testing / advanced usage.
window.ParserFactory = ParserFactory;
