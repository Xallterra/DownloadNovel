# Download Novel - Chrome Web Store Listing

## Short description

Save supported web novels as clean EPUB files for authorized offline reading.

## Detailed description

Download Novel converts supported web-novel chapters into a clean EPUB for offline reading.

Features:

- Detects and orders chapters from a novel's table of contents.
- Downloads a selected chapter range.
- Pauses and resumes long jobs.
- Pauses when a website requires browser verification.
- Removes navigation, advertising, recommendations, and other non-book page elements.
- Shows live chapter and browser download progress.
- Processes content locally without analytics or a developer-operated server.

Use Download Novel only for public-domain works, your own writing, or content you have permission to download. The extension does not bypass paywalls, DRM, locked chapters, CAPTCHA, or website verification.

Before each EPUB build, users must confirm that they own or have permission to download the selected content. Use of the extension is subject to the published Terms of Use.

## Suggested category

Productivity

## Permission justifications

### Host access

Required to fetch the table of contents, chapter pages, and book images from the novel website explicitly selected by the user. The extension supports novels hosted on different domains, so this functionality cannot be limited to one publisher.

### activeTab and scripting

Required to read the currently selected novel page after the user invokes the extension.

### downloads

Required to save the generated EPUB and display browser download status.

### storage

Required to retain download progress and local preferences between extension UI sessions.

## Publishing checklist

- Replace the contact placeholder in `PRIVACY.md`.
- Host the privacy policy at a public HTTPS URL.
- Have a qualified attorney review `TERMS_OF_USE.md`, replace every placeholder, and publish it at a public HTTPS URL.
- Add the privacy-policy URL in the Developer Dashboard.
- Upload at least one accurate screenshot.
- Add a support email and verify it.
- Complete the dashboard privacy disclosures so they match the policy and extension behavior.
