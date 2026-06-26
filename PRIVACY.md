# Download Novel Privacy Policy

**Effective date:** June 26, 2026
**Last updated:** June 26, 2026

This Privacy Policy explains how the Download Novel Chrome extension ("Download Novel," "the extension," "we," or "us") handles information. Download Novel has no developer-operated backend, user accounts, analytics service, advertising service, or tracking system. Its EPUB processing is performed locally in the user's browser.

## 1. Scope and single purpose

Download Novel's single purpose is to convert web-novel content selected by the user into an EPUB file for authorized offline reading. The extension handles webpage information only as needed to provide that user-requested function.

This policy applies only to Download Novel. It does not govern websites that users choose to access with the extension, Chrome, GitHub, or other third-party services.

## 2. Information handled

Depending on the page and features used, Download Novel may handle:

- **Web history information:** the domain and URL of the current page and chapter pages requested by the user.
- **Website content:** page titles, book metadata, author names, chapter lists, chapter text, HTML, and book or chapter images.
- **Download information:** the generated filename, Chrome download identifier, bytes received, total size, completion state, and interruption reason.
- **Local job state:** source URL, job phase, chapter counts, status messages, browser-download status, and the time the status was updated.
- **Website session context:** normal browser cookies or credentials may be included automatically in direct requests to the selected website when required to access content that the user is already authorized to view. Download Novel does not separately read, display, retain, or send cookie values to the developer.

Download Novel does not request or intentionally collect names, email addresses, physical addresses, payment information, health information, personal communications, authentication secrets, or government identifiers.

## 3. How information is used

Information is used only to:

- identify book metadata and chapter links;
- retrieve user-selected chapter pages and images;
- arrange chapters in reading order;
- remove navigation, advertising, recommendations, scripts, and other non-book elements;
- create and save an EPUB file;
- pause, resume, and report download progress;
- detect when a selected website requires browser verification.

Download Novel does not use information for advertising, profiling, behavioral tracking, analytics, eligibility decisions, credit decisions, or any purpose unrelated to creating the requested EPUB.

## 4. Local processing and network requests

EPUB creation, content cleanup, image processing, and status tracking occur locally within Chrome.

To perform a user-requested download, the extension sends direct network requests from the user's browser to the novel website and resource hosts selected by the user. Those requests may disclose ordinary request information to those sites, including the requested URL, IP address, browser/network metadata, referrer information where applicable, and existing site credentials where Chrome includes them. Each destination site's privacy policy and terms govern its handling of that information.

Download Novel does not proxy these requests through a developer server. It does not send webpage content, browsing information, EPUB files, or usage data to the developer, GitHub, advertisers, analytics providers, or data brokers.

## 5. Storage, retention, and deletion

Chapter content and images are held in browser memory while an EPUB is being built. The completed EPUB is saved only to the location selected through Chrome.

Limited job-state information is stored in `chrome.storage.local` so progress can appear in the extension panel. It remains in the user's Chrome profile until it is replaced by a later job, the user clears the extension's data, or the extension is uninstalled.

Users can delete local extension data by removing Download Novel through `chrome://extensions` or by clearing the extension's stored data through Chrome. Downloaded EPUB files must be deleted separately from the user's chosen download location.

Because no user data is sent to or stored by the developer, the developer has no server-side copy to access, export, correct, or delete.

## 6. Disclosure, sale, and human access

Download Novel does not:

- sell or rent user data;
- transfer user data for advertising, marketing, analytics, profiling, or data brokerage;
- transfer user data for creditworthiness or lending decisions;
- permit the developer or other humans to read user webpage content;
- share user data except for direct technical requests to the website or resource host selected by the user, as necessary to provide the extension's single purpose; or
- use user data for purposes unrelated to the extension's prominently described function.

Information may be disclosed only if required by applicable law. Since the extension has no developer-operated data collection system, the developer ordinarily has no user data available to disclose.

## 7. Security

Download Novel minimizes data handling by processing content locally and not operating a collection server. Executable extension code is packaged with the extension rather than loaded from remote servers.

Network security depends on the protocol and security practices of the website selected by the user. HTTPS encrypts information in transit between Chrome and an HTTPS website. Download Novel cannot guarantee the security, availability, or privacy practices of third-party websites, HTTP websites, Chrome, the user's device, network, or downloaded files.

## 8. Permissions

- **`activeTab`:** accesses the current page after the user invokes the extension.
- **`scripting`:** retrieves the selected page's HTML, URL, and title for chapter detection.
- **Host access:** retrieves chapter pages and images from websites selected by the user.
- **`downloads`:** saves the generated EPUB and reports browser-download status.
- **`storage`:** stores limited local job status.

Permissions are used only for Download Novel's stated single purpose.

## 9. Chrome Web Store Limited Use

Download Novel's use and transfer of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Information is used only to provide or improve the extension's single user-facing purpose. It is not sold, used for advertising, used for credit decisions, transferred for unrelated purposes, or made available for humans to read.

## 10. Children's privacy

Download Novel is a general-purpose utility and is not directed to children under 13. The developer does not knowingly collect personal information from children or from any other user. Parents and guardians should supervise children's use of websites and downloaded content.

## 11. Changes to this policy

This policy may be updated when the extension's functionality, permissions, or legal obligations change. Material changes will be reflected by updating the date above and publishing the revised policy at this URL. Where required, additional notice or consent will be provided.

## 12. Contact

Privacy questions or requests may be submitted through the public support page:

https://github.com/Xallterra/DownloadNovel/issues
