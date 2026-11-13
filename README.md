# QA Kits 2.2.0

QA Kits is a browser extension for trying synthetic data in web forms and running page-side QA checks. It runs scans and form interactions in the current tab after you invoke it. Results are heuristic and should be reviewed.

## Features

- The popup and Chromium side panel organize controls into **Test**, **Output**, and **Setup** sections. The fill action remains visible while each section scrolls.

- Detects common native and custom form controls and fills supported text, number, date/time, select, radio, checkbox, contenteditable, and common ARIA combobox fields with synthetic data. It rescans during fills and reports when dynamic field counts change. File inputs can receive previously added, mapped test files.
- Provides normal fill and Positive, Negative, Boundary, and Full QA modes. Full QA checks field results and restores supported values. Submission is off by default; an optional, separately confirmed submit check can click one safe submit-like control after a final fill.
- An optional **data seed** (Options → Data & seed) makes generated values reproducible; the seed is recorded in the Full QA report so a run can be replayed.
- Supports locally stored test files and file-to-category mappings. Optional single-file auto-mapping previews compatible, unmapped categories and asks before saving; it keeps existing mappings and marks confirmed suggestions for review. A separate setting controls whether a mapped file may be reused across matching fields (off by default). Also supports custom field selectors by hostname, test credentials by site, and repeatable-row rules.
- Scans fields and page controls, reports heuristic accessibility and security findings, checks a built-in typo list plus editable ignore/dictionary words, reports empty or placeholder links and failed images, and checks a configurable number of same-origin links. Cross-origin links are labeled not checked.
- Finds likely page actions, lists risky controls separately, and can run an explicitly selected action sequence. Dry run is on by default; disabling it requires a one-time confirmation, and risky or repeated actions require confirmation before clicking. A banner helps select a regular page tab or open the Chromium side panel when the current page cannot be inspected. Actions may activate site behavior; inspect the target before running it.
- Generates test case suggestions from observed page structure and exports CSV, Markdown, printable HTML, or Playwright JavaScript, TypeScript, and Python source. The extension exports these files; it does not execute the generated test code. Printable HTML can be printed to PDF by the browser, but the extension does not export PDF directly.
- In the Chromium build, can capture **page evidence (PNG)** with console and network diagnostics, collect activity during fill when enabled, apply approximate network conditions, and preview a custom viewport. A Full QA run downloads its report in JSON and HTML.
- Includes an optional AI assistant for a user-entered question and, if selected, a limited page-structure summary. It previews the request before sending; page URL/title are masked by default, and the endpoint origin must be allowlisted in Options.

Accessibility, security, spelling, link, selector-stability, and field checks are heuristic. Contrast values are approximations. These checks are not comprehensive audits, certifications, or proof that a page is safe or accessible.

## Installation

### Chrome and Edge

1. Extract or clone this project.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**, choose **Load unpacked**, and select the project folder that contains `manifest.json`.
4. Open a page you are authorized to test, then open the extension from the toolbar.

The Chromium manifest defines both a popup and a side panel. The toolbar action opens the side panel when the browser supports the Side Panel API.

### Firefox

1. Build the Firefox package: `npm install`, then `npm run build:firefox`. This creates `dist/firefox/` and `dist/qa-kits-firefox.zip` with the Firefox manifest already in place.
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on…**.
3. Select `dist/firefox/manifest.json` (or the zip).

Firefox uses the popup. Screenshot/activity capture, network profiles, viewport tools and the side panel are Chrome/Edge only; they are disabled with a "Chrome / Edge only" badge.

### Firefox extension ID

Firefox builds use the manifest gecko ID. Override it at build time without changing source manifests:

```powershell
$env:QAKITS_GECKO_ID = "qa-kits@your-domain.example"
npm run build:firefox
```

Use a stable extension ID under your control (typically an email-style ID). The default remains a valid non-placeholder development ID until overridden.

## Using the extension

1. Open the extension on the page to inspect. Once you add test sites in Options → General → Allowed test environments, the header badge shows **Allowed test env** on those sites and **Not allowlisted** elsewhere. Until then no badge is shown.
2. Choose **Scan page** to review detected fields and page findings.
3. Optionally configure generated values, upload files, mappings, or hostname-specific selectors in **Advanced settings & file mappings**. The options page can start a page picker to create a selector for the selected field type.
4. Select a fill or QA mode, then choose **Fill the form**. Review the fields changed and any skipped or unverified results.
5. Open **Output** to review QA results, generate and export test case suggestions, or capture page evidence. **Setup** contains saved settings, AI, network, viewport, and shortcut guidance.

Full QA operates on the current page. It does not submit or advance forms by default; the optional confirmed submit step can trigger site behavior. It records validation messages and whether the URL changed, but does not capture resulting network status codes or keep a combined report across manually navigated steps. For a multi-step workflow, navigate the site yourself and run another scan or QA pass. Page-action discovery and action execution are separate; an explicitly run action can submit a form, navigate, or otherwise affect the website.

## In-popup help and shortcuts

Press the **?** button in the header (or the `?` key) for a short guide. Inside the popup: **Alt+S** scans the page, **Alt+F** fills the form, **Alt+1/2/3** switch between Test, Output and Setup, and **Esc** closes dialogs. The popup remembers the last fill option you used.

## Keyboard shortcut

The suggested shortcut to open the extension is **Ctrl+Shift+Y**. Browsers or users may change the binding. The popup reads the current value from the browser's commands API and displays it. In Chrome or Edge, change it at `chrome://extensions/shortcuts`; in Firefox, open Add-ons and manage the extension's shortcuts. The extension does not bind shortcuts to individual workflow steps.

## File uploads

Add test files with **Add file** in the extension. The file picker accepts `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.csv`, and `.txt`. Files and their metadata are stored locally by the extension. In the Files list, assign each file to the document category it is meant for. A site-specific custom selector can identify file inputs when automatic classification does not identify the intended category. Automatic mapping is only a suggestion: it shows compatible categories that currently have no mapping, and saves them only after confirmation. Existing mappings are preserved. Confirmed automatic mappings are marked for review. Reuse of one mapped file across same-category fields is a separate opt-in setting and is off by default.

During a fill, the extension scans reachable native `input[type="file"]` controls, including hidden inputs, controls in open shadow roots, and controls in accessible same-origin iframes. Detection uses labels, nearby text, field attributes, `accept` hints, and configured selectors, so a field can be detected but still need a manual category mapping. Disabled and recognized honeypot fields are skipped. Newly added file inputs are rescanned during the fill, with up to 100 additional upload rescans after the normal dynamic-field scans.

The extension only uses files mapped to the detected category. It filters mapped files against the field's `accept` attribute and respects whether the input allows multiple files. By default, a mapped file is not reused across same-category fields during one fill; enable **Reuse one mapped file across multiple fields of the same category** to opt in. If no unused matching file is available, the field is skipped. A confirmed automatic mapping may assign one file to multiple currently unmapped compatible categories (image categories require an image; other document categories accept any supported file). Check the Files list before filling, since a file mapped to a category may not be the right document for that field.

The extension can attach only files previously added through its own **Add file** flow. During a form fill, it attaches those files to the page's native file input and dispatches input/change events; it does not open the website's Browse control, prompt for additional OS files, or submit the form. Custom drop-zones without a reachable native file input are not supported. It watches briefly for a new preview image or success-like live message and reports “attached,” “attached + page reacted,” or “attached, no page response detected.” These are page-side signals only; the extension does not observe upload XHR/fetch completion or prove server acceptance. The website may upload automatically in response to the change event, require a separate action, or reject a file for its own validation rules.

## Reports and exports

Test cases are generated from detected page structure and are suggestions for use in another tool. Review selectors, steps, and expected results before relying on them. The preview allows editing steps and expected results before export and shows a heuristic selector-stability score.

Test case formats are CSV, Markdown, printable HTML, Playwright JavaScript, Playwright TypeScript, and Playwright Python. The print action opens the browser print dialog for PDF output. JavaScript/TypeScript output receives a parse-only syntax check; Python syntax is not parsed in the browser. **Run Full QA** downloads a **Full QA report (JSON/HTML)**. **Capture page evidence (PNG)** saves a screenshot with diagnostic summaries; if full-page capture is unavailable, it may fall back to the visible viewport. Viewport preview is shown in the extension and is not downloaded. Chromium can also apply an emulated viewport to the selected tab so you can interact with the page at that responsive size; choose **Restore viewport** when finished. This changes the page's emulated viewport, not the outer browser window size.

The **Capture activity during fill** setting is off by default. When enabled, capture starts around a fill/QA operation and activity may be included in a later evidence capture. The separate **Capture page evidence (PNG)** action also captures activity for its report. Chrome may show its debugger notice while capture or network emulation is active. Capture detaches and network conditions reset when the tab begins navigating; **Stop Capturing** also resets network conditions. Network presets are approximate latency/bandwidth profiles, not real mobile networks.

## Browser differences

| Build | Supported behavior |
| --- | --- |
| Chromium (`manifest.json`, Chrome/Edge) | Form scan/fill, settings, exports, AI assistant, screenshot and activity capture, approximate network profiles, viewport preview, and side panel where supported. |
| Firefox (`manifest.firefox.json`) | Form scan/fill, settings, exports, and AI assistant. The manifest omits Chromium debugger, side panel, and `tabs` permissions; screenshot/activity capture, network profiles, and viewport preview are disabled with an explanation. |

Both manifests request optional access to HTTPS sites and localhost. Browser restrictions can prevent the extension from working on internal browser pages, extension stores, or other restricted tabs.

## Permissions

### Required

- `storage`: save extension settings and data in browser extension storage.
- `unlimitedStorage`: allow larger local storage capacity for stored data and files.
- `activeTab`: access the current tab after you invoke the extension.
- `scripting`: inject the extension's page-scanning and form tools into the active tab.
- `downloads`: save reports, exports, and captured images.
- `sidePanel` (Chromium only): provide the side-panel interface.
- `debugger` (Chromium only): Viewport, Network profiles, page-evidence screenshots and activity capture. Chrome does not allow this permission to be requested later, so it is granted at install. It is used only when you start one of those tools; Chrome then shows its "started debugging this browser" bar until you restore or stop.

### Optional (requested when needed)

- `tabs` (Chromium only): read the active tab and observe tab changes for the extension interface.
- Host access for `https://*/*`, `http://localhost/*`, and `http://127.0.0.1/*`: page operations and, after a request, network access to a configured AI endpoint. When access is missing, clicking any page button (Scan, Fill, Find page actions, Generate test cases…) asks Chrome for it first, then continues.

The Firefox manifest requests only `storage`, `unlimitedStorage`, `activeTab`, `scripting`, `downloads`, and the optional host access.

## Data and privacy

The extension stores data locally in browser extension storage and IndexedDB. Depending on how you use it, this includes settings, synthetic/generated and imported project data, the last filled-data display, up to 300 activity log entries, file metadata and file contents, file mappings, hostname-specific selectors and allowlists, repeatable-row rules, site-specific test credentials, and previously used generated email/mobile values. The extension does not encrypt this data itself. Remove stored files and settings through the extension data controls when they are no longer needed.

Page scanning, filling, and QA checks run in the browser. Same-origin link checking makes bounded `HEAD` requests and may retry with a ranged `GET`; its configurable limit defaults to 25. Cross-origin links are marked not checked. Page scripts may react to values and events produced by filling or upload actions, including by sending their own network requests. In particular, a site may upload an attached file automatically when its file input changes; the extension cannot determine from the local attachment alone whether the site sent or accepted it.

The AI assistant is optional and sends a request only after you review the displayed payload and confirm **Ask AI**. The request includes your question, selected model, and API key in the authorization header and is sent to an approved OpenAI-compatible endpoint over HTTPS (HTTP is accepted only for localhost). Configure approved endpoint origins in Options. The API key is used for that request and is not saved by the extension. If **Include page structure** is enabled, the request also contains a bounded summary of the current page, including headings, visible form-control types and labels, required/disabled state, and action labels. Page title and URL are masked by default; field values are omitted. The endpoint provider receives and processes the request under its own policies.

Use the Settings controls to clear files, credentials, logs, or all extension data. Optional auto-clear removes extension data after the configured number of days without extension storage writes. The extension does not encrypt stored files, credentials, or settings. Use synthetic values and avoid storing real credentials or sensitive documents.

## Limitations and safety

- Detection and filling rely on page semantics and heuristics. Ambiguous custom widgets may be missed or skipped. File upload support requires a reachable native file input; closed shadow roots, inaccessible or cross-origin iframes, and custom upload controls without such an input cannot be handled. Deep-DOM traversal has depth and node limits, and dynamic upload rescans are bounded, so unusually large or deeply nested pages may not be fully covered.
- Full QA does not submit or advance forms by default. The optional confirmed submit step clicks one visible submit control after a final fill; it can cause real site changes and may not return a report if navigation unloads the page. There is no Continue-to-next-step helper or combined multi-step QA report. Restoring state may not undo changes made by custom widgets or page scripts. Browser APIs do not allow arbitrary prior file selections to be restored.
- Accessibility and security results are bounded DOM checks, not complete audits. Spelling detection uses a bundled typo list, not a general-purpose spellchecker, plus editable custom terms. Link checks do not verify cross-origin destinations, have no cross-origin opt-in, and may report transient network failures.
- Stored files, credentials, and settings are not encrypted by the extension. The UI warns about local storage; use synthetic data and clear stored information when it is no longer needed.
- The optional submit check records visible validation messages and URL change, but does not record network response status codes. A page navigation may unload the extension's report flow before it can finish.
- Some requested widget behaviors remain heuristic: custom date pickers, framework comboboxes, and masked controls are only supported when they expose recognizable DOM controls. The extension does not guarantee interaction with every React widget or editor.
- Network presets use approximate latency/bandwidth settings. Fast, Slow, and Very slow are labels for DevTools conditions, not real mobile-network emulation.
- **Viewport device presets** (Setup → Viewport): 27 ready-made sizes in four groups — Phones (iPhone SE/12–15/Pro Max, Galaxy S8/S20/S23 Ultra, Pixel 7/8, small 320 px phone), Tablets (iPad Mini/Air/Pro 11"/12.9", Galaxy Tab S7, Surface Pro 7), Laptops & desktops (1280×720, 1366×768, 1440×900, 1536×864, 1920×1080, 2560×1440) and CSS breakpoints (576/768/992/1200/1400 px). Phone and tablet presets also emulate the device's pixel density and touch input, like Chrome DevTools device mode. **Rotate** switches portrait/landscape; the last preset is remembered; typing a size switches to Custom.
- A live emulated viewport stays applied in its tab, including across reloads and navigation, until you click **Restore viewport** (or close the tab). Network profiles likewise stay until **Restore normal**. Restoring releases the debugger, so Chrome's "debugging" bar disappears when nothing else uses it. It changes responsive page layout for interaction; it does not resize the browser's outer window.
- Generated identity-like values are synthetic samples and are not verified against government or external systems.
- Aadhaar-shaped, PAN-shaped, GSTIN-shaped, payment-card-shaped, and IBAN-shaped values are synthetic format/checksum samples only; they are not valid accounts or proof of identity. User-imported CSV/JSON values are stored locally and take priority when their field name, ID, label, or type matches; the extension does not validate that imported values are legitimate or synthetic.
- Page action sequences can click website controls. Dry run is on by default. Turning it off is confirmed once, and risky or repeated actions require confirmation before clicking. Review targets carefully, especially on production pages.

## Project structure

```text
background/   Service worker and Chromium screenshot/activity capture
content/      Page scanning, filling, QA, accessibility/security checks, test-case generation
content/runtime/  Page runtime modules (core, fill, full-qa, page-actions, picker, messaging, dynamic-fields),
              sharing state via window.__SFFA_RT__; load order is defined once in utils/ext.js (contentScripts)
icons/        Extension icons
options/      Settings and site-specific configuration page
popup/        Popup/side-panel interface: popup.html, popup.css, icons.js (local SVG icons),
              state.js, ui.js, sections/{test,output,setup,files,ai}.js, main.js (loaded last)
styles/       tokens.css: shared design tokens (the only file with raw colour values)
utils/        Browser API adapter, storage, data, DOM, logging, and report helpers
tests/        node:test + jsdom unit tests
tests-e2e/    Playwright end-to-end tests against the built extension
manifest.json Chromium manifest
manifest.firefox.json Firefox manifest alternative
```

## Development

Requires Node.js 22 or later.

```bash
npm install              # install dev dependencies (ESLint, jsdom, Playwright, axe-core)
npm test                 # run the node:test + jsdom unit tests in tests/
npm run lint             # ESLint over the whole project
npm run build:chrome     # build dist/chrome and dist/qa-kits-chrome.zip
npm run build:firefox    # build dist/firefox and dist/qa-kits-firefox.zip
npm run verify:popup     # Playwright + axe accessibility check of the popup states
npm run verify:glass     # layout/overflow/contrast matrix across widths and themes
npm run verify:responsive # popup, side panel and Options at 9 widths: overflow, spilling, overlapping or squeezed text
npm run test:e2e         # builds dist/chrome, then drives the real extension in Chromium (tests-e2e/)
```

The verify scripts need a Playwright browser the first time: `npx playwright install chromium`.
