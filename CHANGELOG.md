# Changelog

## Unreleased

### Changed
- Renamed the extension to **QA Kits** (store name, toolbar title, popup, settings, help, exports). Saved files, mappings and settings are kept.
- **More wrong values in Wrong data.** Every kind of field gets more realistic mistakes: e.g. email 4 → 10 (space inside, two dots, starts with a dot, no domain ending…), mobile 4 → 9 (wrong first digit, letter O for zero, country code…), Aadhaar, PAN, GST, IFSC, PIN code, number, date, password, URL and name too. Values a correct form may accept (country code, decimal, emoji…) are reported but never counted as failures.
- **Full QA no longer downloads files by itself.** When the run ends, a "Download the Full QA report" card offers buttons for the HTML report, the JSON data and (when activity capture is on) the page screenshot; only the files you click are downloaded. The card comes back when you reopen the popup on the same page.

### Added
- **Setting "Keep values already in the form"** (Options → General, off by default). When on, Quick fill and Valid data leave every field that already has a value as it is (text, dropdowns, radio buttons, checkbox groups, uploads, saved passwords) and fill only the empty ones. Wrong data, Edge cases and Full QA are not affected: they change values to test them and put them back.

### Fixed
- Upload boxes no mapping matches (e.g. DCRA "Upload Evidence") were skipped when every stored file was mapped to other categories. Such a file is now used as the last fallback (`chooseFileRecords`, source `anyStored`).
- Pages with many upload boxes got a file in only some of them when the site locks (disables) its upload boxes while it sends a file to its server: the next boxes were skipped as "disabled". The fill now waits (up to 30 s) until the page unlocks them (`waitForUploadUnlock`). Also: a field the page re-drew is now scanned again and filled in place; before, a re-drawn upload box could hand its file to the first box of the same kind (`findFreshFileInputByType` skips boxes already used or holding a file).
- **Step 3 never pressed Submit or Confirm buttons**, although it is called "Submit, save or go next". They are now offered and pressed (Preview only is still on by default). Buttons that also mention payment, pay, checkout, delete and similar are still skipped.
- **Labels that did not match what the feature does.** Full QA texts now use Valid data / Wrong data / Edge cases; the Reports card no longer says the Full QA report downloads by itself; the fresh-data and automatic-mapping hints say exactly when they apply; the page-action skip text lists every kind of button that is skipped; the Options Save button text lists everything it saves.
- **The data seed never appeared in the Full QA report** (it always said "none (random)").
- **Pages with many upload boxes filled slowly.** When the page shows the chosen file's name under the box, the fill now moves on at once instead of waiting 1.2 seconds per upload (a 101-upload page: 230 s → 101 s).
- **After choosing Full QA, clicking Quick fill did nothing.** Quick fill stayed selected underneath, so the click changed nothing and Full QA kept running. Choosing Full QA now clears the other choice, so any mode can be picked again.
- **Colour pickers and sliders showed false failures in Wrong data / Edge cases / Full QA.** The browser never lets these boxes be empty; that is no longer reported as a form bug.
- **Uploads were done last, not in page order.** Upload boxes are now filled where they are on the page, between the questions around them.
- **Most upload boxes stayed empty when there were more boxes than stored files.** Each file was used only once; now unused files go first, and when they run out a fitting file is used again.
- **Long questions that mention "mobile" got a phone number.** A multi-line answer box never gets a phone number, PIN code, ID number or date now.
- **Full QA counted correct rejections as failures.** When a wrong value (for example a bad email) showed an error, Full QA reported it as failed. Wrong and edge values are now judged the same way as in Wrong data / Edge cases: an error shown is a pass.
- **A calendar's month title ("November 2026") was reported as an error message.** Pop-up calendars are now ignored when looking for errors.
- **Wrong data / Edge cases said "original values put back" even when some dropdowns kept a choice.** The result now names those dropdowns (for example State, City). A calendar left open at the end is closed.
- **Full QA and Wrong data / Edge cases left calendar-only date boxes empty.** They are now filled with correct data and cleared again at the end.
- **Full QA's step-by-step fill ignored saved logins, repeat rows and your settings.** It now uses them, like Quick fill.
- **Checked on real practice forms (DemoQA, Selenium web form, Formy) and fixed what they showed:**
  - An email box with the placeholder "name@example.com" got a name; it now gets an email.
  - Date boxes that already show a date like "11 Nov 2026" are filled in that same format (they used to stay unchanged); a "date" box with no format hint gets a date whose day equals the month, so it reads the same as DD/MM and MM/DD.
  - A date picker's own Month / Year boxes were filled as if they were form fields; they are now left alone.
  - Type-to-search dropdowns (react-select and similar: State, City, Subjects) were left empty; the extension now opens them, types a few letters when needed, and picks an option.
  - A first option such as "Open this select menu" counted as a real choice; a real option is now chosen.
- **Masked PAN / Aadhaar boxes got the wrong value.** In page order, a second box shown as dots (type "password") received the first one's value, so Aadhaar got the PAN. Only real sign-up password boxes now share a password.
- **Aadhaar boxes got a CIN, PAN or GST number.** A box labelled Aadhaar is an "identity number", which picked a random ID kind; it now always gets a 12-digit Aadhaar.
- **Wrong data / Edge cases / Full QA left test passwords behind.** These runs promise to put the original values back, but sign-up password boxes kept the test password; they are no longer touched in those runs (closed sections are also left as they were).
- **"Required fields only" filled optional sign-up password boxes.** They now follow the Required / Optional choice.
- Fields are no longer filled with another field's data. A field whose label isn't recognised (for example "Employee code" or a "Role" dropdown) used to borrow the type of a nearby field and get an email address or a name. Table, side-by-side and wrapped-label layouts are now classified field by field.
- Large forms are fast: a 300-field form now scans in about 2 seconds (was about 40) and fills in about 6 seconds instead of failing with "The page stopped responding".
- Websites no longer slow down after you use the extension. The background field watcher only reacts when form fields are actually added or removed.
- Filling an ordinary text field no longer clicks another field's "show password" button.
- Screenshot capture, network throttling and viewport tools keep working after Chrome restarts the extension in the background; **Stop capturing** and **Restore normal** always work.
- Every action that talks to the page now has a time limit, so no button can stay busy forever.
- Cancelling "Send to AI provider" keeps the API key you typed.
- **Viewport, Network and Capture page evidence now work in Chrome.** Chrome never allowed their permission (`debugger`) to be asked for later, so no prompt could ever appear. It is now granted when the extension is installed, and the tools work straight away.
- **Viewport size and network throttling now stay applied** in the tab, even after reloading or opening other pages, until you click **Restore viewport** / **Restore normal**. Restoring also removes Chrome's "debugging" bar.
- **Page buttons ask for site access when they need it.** Scan, Fill and the other page buttons stay clickable; if the extension can't read the site yet, Chrome asks first and the action continues once you allow it.
- **The panel lays out properly at every width.** The Full QA run card no longer squeezes its title to one word per line, step headers ("Submit, save or go next") move their status badges onto a second line instead of overlapping, and the scan tiles and QA metrics adapt to the space available (including the narrow left column of the wide side panel).
- **"Nothing is selected any more" after picking an element.** Picks now survive pages that re-render their buttons (common after a click), can be run again after they finish (**Click again**), and when the element is really gone the card offers **Pick again** instead of a button that can only fail. Pressing **Stop** no longer closes the card.
- **Upload cards with only a "Browse Files" button now get their file.** Many document pages (for example onboarding screens with "Pending Documents") have no file input in each card: the button remembers which document is next and opens one shared hidden input. The extension now presses each card's button first, then attaches the file mapped to that card's document type (MOA & AOA, Financial Statements, …), top to bottom. The scan lists each card by its heading.
- **Consent and declaration checkboxes are ticked reliably.** Wording such as "I hereby certify", "I acknowledge", "I authorise" or "correct and accurate" now counts, whether the box is wrapped in a label, labelled with `for=`, or just has text next to it. Opt-out boxes ("do not contact me", "delete…") are never ticked. After uploads, consent boxes are ticked again, because many pages clear them when documents change. The log names every box ticked and the optional ones left alone.
- **Checkbox options in a plain container are ticked.** Lists like `<div><label><input type="checkbox"> Telecom</label>…</div>` (no fieldset, no name) were treated as separate optional boxes and left unticked. A container that holds several checkboxes and no other inputs is now a checkbox group: its options are ticked one by one (with a short pause so React pages keep each tick), "None of the above" and opt-out options are skipped, and the log shows the group by its heading.
- **Upload fields without a recognised document type still get a file.** A "Choose File" field whose card names no known document type used to be skipped. Now, when no file is mapped to the field's type, a file mapped to "Other Document" is used, then any stored file not mapped to a type. Only files in the field's accepted formats (for example .pdf/.doc/.docx) are chosen, and each fallback file is used once. If the mapped file is the wrong format, the log says which formats the field accepts.
- **Already uploaded documents are never replaced by a fill.** Hidden "Replace document" inputs are skipped, so a fill cannot overwrite a document you uploaded or signed earlier.
- **Uploads count as attached when the page clears the input after reading it** (common in React apps), instead of being reported as "requires manual selection".
- **Clear all data** (Setup → Danger zone) now works, and the optional auto-clear no longer breaks the extension when it triggers. Both had failed since 2.1.3.

### New
- **More kinds of fields get filled.** Checked on a test page: before 5 of 10 tricky fields were filled, now all 10.
  - Optional boxes that reveal fields ("I have a GST number"): ticked, and kept ticked only when new fields appear; boxes that show nothing (a newsletter box) stay unticked.
  - Masked boxes that only accept typing (DD/MM/YYYY dates, phone masks): typed key by key when a normal value is wiped.
  - Read-only date pickers: the calendar is opened and a date is clicked.
  - Fields in tabs that are not open: each tab with fields is opened and filled, then the original tab is shown again.
  - Plain "Select …" dropdowns built without accessibility attributes: opened and an option chosen.
  - Fields with a sample in the placeholder ("e.g. EMP-1234") get a value in that format (EMP-4138) instead of a sentence.
- **Forms are filled in page order, like a person (new default).** Fields are filled top to bottom. After an answer that can change the form (a dropdown, radio, checkbox group, switch or autocomplete), the extension waits for the page to settle and fills any field that just appeared or became available right there — for example a GST number box shown after "Yes", a field unlocked by a radio choice, or a CIN box shown after "Company". State → District → City are filled together as one step. Autocomplete boxes, custom date pickers, sliders, ratings, switches and rich-text editors are filled at their own place. Closed sections that hide fields are opened first. Sign-up forms get the same test password in "Password" and "Confirm password" (a login form's password box is never filled). Files, consent boxes, saved credentials and repeat rows come last. At the end, fields the page still reports as empty or invalid are tried once more and listed by name if they still fail. The fill stops if the page moves to another address.
- **Two new settings in Options → General:** "Fill order" (Page order, recommended / By field type, old) and "Tick 'Same as …' boxes" (off by default, so both addresses are filled).
- **Test cases written so a client can read them.** Every generated case now has a plain title ("Check that the "Email" box refuses a wrong email address"), elements named as people see them ("State" dropdown, "Register" button, "Gender" options), real numbered steps (open the page, fill the other fields, click the form's own submit button), real test data (example emails and phone numbers, 17/18/19 around a minimum of 18, the page's own "5 MB" limit, the dropdown's real options) and a plain expected result. Four checks about the extension itself are no longer generated.
- **"Click Save / Submit after each wrong value" (Wrong data and Edge cases).** Many forms show errors only when Save is clicked. With this option on, the extension clicks the form's own Save / Submit / Next button after each value the form should refuse (never after values it should accept, and never Cancel, Reset, Delete or Pay buttons), stops a full page submission, and judges the result: ✓ error shown or Save stays disabled, ✗ "The form accepted this value" when it was sent without an error. If the page moves to another screen, the run stops and says why. Off by default; the choice is remembered.
- **Wrong data and Edge cases can test one field at a time (now the default).** Every field first gets correct data; then each wrong or limit value is tried on one field while the others stay correct, so any error clearly belongs to that field. The field returns to its correct value after each case, and the original values are put back at the end. A "Field" list lets you test just one field (for example only PAN); "All fields together" keeps the previous behaviour. Files are never touched.
- **Wrong data and Edge cases test every value and judge each one.** One click now tries every value on every field, one round at a time (it used to give each field just one value per click), and puts the original values back afterwards. Each case is judged after the page reacts: ✓ error shown (or value accepted when it should be), ⚠ no error shown yet (the form may check only on submit), ✗ a value that should be allowed was refused, ⓘ check manually. Results are listed by field. Typed fields that refuse impossible values count as ✓ "Browser blocked this value" instead of skipped; over-long text stops at the field's maximum length like real typing. New wrong values for Password, Website, Name, PIN code, PAN, Aadhaar, GST and IFSC. Length checks on fields with a format rule, and limits the field never declared, are marked "check manually" instead of failing.
- **The header shows the current page and follows every change.** The chip shows site + path (for example `app.example.com/applications/onboarding`, long paths shortened to site/…/last part, never the query string) and updates after each page change — a new page, the next step, or a single-page-app route — with a short highlight. The full address is shown on hover. A long address no longer pushes the header buttons out of the panel.
- **No duplicate entries in the security scan.** "CDN script without SRI" and "Mixed-content resource" were listed once per file, because each entry's text included that file's address. Findings are now merged by type, with an "Affected" list of every file; each type lowers the score once.
- **Security scan "Copy report" copies the complete, current report.** It now includes the page, date and time, score, counts per severity and, for each finding (most severe first): what was found, how to fix it, confidence, OWASP category and how often it was seen, plus the checks that could not be confirmed and what the scan does not cover. A normal Scan page hides the button so an old report cannot be copied; on another tab it asks you to scan again; copying falls back to a second method if the browser blocks it. The popup now shows "How to fix" under each finding too.
- **Accessibility note moved behind a help (i) button** in the "Accessibility" group of the scan results, in plainer wording; the group title reads "issues found" / "no issues found" instead of a code.
- **Buttons stay inside their cards.** "Ask AI" (AI QA assistant) and "Preview at this size" (Viewport) stuck out on the right; the Element selected card's buttons and "Find page actions / Pick element" now stack when there is not enough room. The responsive audit gained a check for controls sticking out of their card.
- **Section headers stay on one line.** Generated data, Activity log, AI QA assistant, Network, Viewport and Shortcuts no longer push their label or chevron onto a second line, and their icon box no longer stretches. Step headers with status labels show the title on the first line and the labels plus chevron on the second.
- **Test-case paging moved below the list.** "Showing … cases" and Previous / Next now sit after the last case; changing page scrolls back to the top of the list.
- **Test-case notes moved behind a help (i) button** next to the "…test case(s) generated" title, so the type buttons and the list start right away. Help tooltips now have a solid background, so their text stays readable over the cards.
- **Filter generated test cases by type.** Output → Generate test cases now shows a button per type (Validation, Positive, Negative, Boundary value, Security…) with its count, plus "All". Clicking a type lists only its cases; paging restarts at page 1. Exports always include every case.
- **Suggestion lists (`<datalist>`) are used when filling.** Fields such as city, country or product that offer suggestions are filled with one of those suggestions instead of random text, skipping any suggestion the field itself would reject. Generated test cases also cover choosing a suggestion and typing a value that is not in the list.
- **Element picker details now appear in the extension.** After you pick an element on the page, the "Element selected" card (label, matches, mode, risk, progress) shows in step 3 of the panel instead of being drawn on the website. Risky clicks are confirmed in the extension.
- **Wait between clicks for picked elements.** When a picked element matches several buttons (for example a Save button on every row), the Element selected card shows a **Wait between clicks** choice (no wait, 0.5 s up to 1 min, default 1 s) with the estimated total time. The page clicks them one by one with a live countdown, **Stop** works immediately even during a long wait, and your choice is remembered.
- **Device presets for responsive testing** in Setup → Viewport: 27 common phones, tablets, laptops/desktops and CSS breakpoints. Phones and tablets also get the real pixel density and touch input. **Rotate** switches portrait/landscape, and your last choice is remembered.

### Changed
- The test-environment badge in the header is hidden until you add test sites in Options → General → Allowed test environments.
- New `npm run verify:responsive` checks the popup/side panel and Options page at 9 widths (320–1280px, light and dark) for horizontal scrolling, text spilling out of its box, overlapping text and squeezed text.
- Exported Playwright tests are hardened against unusual line-break characters in test-case text.

## 2.2.0

### Fixed
- **"No page selected" / settings not saving.** The background part of the extension crashed at startup unless the optional screenshot permission had been granted. It now starts reliably; screenshot capture works as soon as you allow it, without a restart.
- **Scan or fill stuck on "Scanning…" / "Filling…".** Every request to the page now has a time limit. Long fills keep running as long as the page shows signs of life; if the page freezes or disconnects you get a clear message and a **Reload page** / **Reload page & retry** button.
- **Scanning after reloading the extension.** Pages that were already open are reconnected automatically.
- **Quick fill always reported "Unable to fill the form"** even when the fields were filled.
- **"Choose tab" showed an empty list** when Chrome hid tab addresses. You now get an **Allow access to list your tabs** button.
- **The "Reload tab & retry" button did not reload.**
- **Firefox:** the packaged add-on could not be installed (broken zip), and scan/fill could not reach the page. Both fixed; Firefox now scans and fills.
- **Every background request has a time limit**, so no button stays disabled forever.
- The popup no longer injects scripts into a page just to check whether a run is in progress.

### New
- **Detected fields list** after a scan: every field with its label, type, Required and Low-confidence markers. The filter box searches it.
- **Per-field results** after a fill: each field is marked Filled, Unverified, Failed or Skipped.
- **Live scan progress** on the Scan button ("checking links 14/25").
- **Reduce visual effects** switch (Setup and Options) for faster rendering on older computers.
- **Optional data seed** to replay exactly the same generated values; the seed appears in the Full QA report.
- Glassmorphism design with light/dark/system themes, a first-run welcome card, in-popup help, keyboard shortcuts (Alt+S scan, Alt+F fill, Alt+1/2/3 tabs, ? help) and plain-language error messages.
- Header badge showing whether the site is in your **allowed test environments** list.

### Under the hood
- The page script is split into `content/runtime/*` modules; the popup into `popup/sections/*`.
- 54 unit tests and 10 end-to-end tests (`npm run test:e2e`) that drive the real extension in Chromium.
- Content scripts may only make two narrow storage writes; everything else is rejected.
- Build zips are written by a small built-in writer so `manifest.json` is at the root and paths use `/` on every OS.

## 2.1.3
- Previous release. See `AUDIT.md` for the detailed history of the review and fixes that led to 2.2.0.
