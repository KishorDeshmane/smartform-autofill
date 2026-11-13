# QA Kits — How to use every feature

A step-by-step guide for testers. Button and setting names are written exactly as they appear in the extension.

> Use test or staging sites only. All values the extension types are fake. Nothing is submitted unless you turn that on.

---

## 0. Before you start

1. **Install** (Chrome / Edge): open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose the project folder (the one that contains `manifest.json`).
   Firefox: run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on…**, pick `dist/firefox/manifest.json`.
2. **Open the form** you want to test in a normal browser tab.
3. **Open the extension** from the toolbar (or press **Ctrl+Shift+Y**). In Chrome/Edge it opens as a side panel.
4. If the header says **Access needed**, click any page button (for example **Scan page**). Chrome asks for access once, then the action continues.

The extension has three tabs: **Test** (do things on the page), **Output** (results and exports), **Setup** (settings and tools). The header shows the current page; it updates when the page changes. **?** opens the help.

---

## 1. Check the page (Test tab → step 1)

| Button | What it does | How to use |
|---|---|---|
| **Scan page** | Lists every field it found, plus common page problems (accessibility, broken links, spelling). | Click it. Read the field list. After a fill, each row shows the result for that field. |
| **Security scan** | Looks for common security problems on the page (insecure forms, missing protections, risky links). | Click it. Each finding shows how serious it is and **How to fix**. |
| **Copy report** | Copies the full security report as text. | Appears after a security scan. Click, then paste into your bug tracker or chat. |

Scanning first is optional. You can go straight to step 2.

---

## 2. Fill the form (Test tab → step 2)

### 2.1 Choose a fill mode

| Mode | Use it when | What happens |
|---|---|---|
| **Quick fill** | Most of the time. | Realistic fake data in every field, top to bottom like a person. Fields that appear after an answer (e.g. "City" after "State") are filled in their place. |
| **Valid data** | You want to confirm the form accepts correct input. | Same as Quick fill, but you choose **Which fields?** — **Required fields** and/or **Optional fields**. |
| **Wrong data** | You want to check the form shows clear error messages. | Tries bad values (wrong email, short mobile, PAN in the wrong order, …) and judges each one. Original values are put back afterwards. |
| **Edge cases** | You want to check limits. | Tries very short, very long, minimum and maximum values. Original values are put back afterwards. |
| **Full QA run** | You want one combined check and a report. | Runs Valid data, Wrong data, then Edge cases, puts the values back, then offers the report to download. |

Then press **Fill the form** (bottom of the popup). **Stop fill / QA run** stops at any time.

### 2.2 Wrong data and Edge cases — extra choices

- **How to test**
  - **One field at a time (others get correct values)** — recommended. Every other field holds a correct value, so an error can only come from the field being tested.
  - **All fields together** — every field gets a wrong value in the same round.
- **Field** — test **All fields** or pick one field from the list.
- **Click Save / Submit after each wrong value** — use this when the form only shows errors after you press Save. The extension clicks Save only for values the form should refuse. Use a test site: if the form wrongly accepts a value, it may really save it.

**Reading the results** (shown per field):

| Result | Meaning |
|---|---|
| **Passed** | The form refused the wrong value (error shown, Save stayed disabled, or the browser blocked it). |
| **No error shown yet** | The form did not complain. It may check only on Save — try again with **Click Save / Submit…** on. |
| **Failed** | The form accepted a value it should refuse, or refused a value it should accept. |
| **Accepted — check manually** | A value a correct form may accept (e.g. mobile with +91, a decimal, an emoji). Look at it yourself. |

If some custom dropdowns could not be set back, the result says so by name (e.g. "…except these dropdowns, which keep a correct choice: State, City").

### 2.3 Full QA run

1. Click **Full QA run**.
2. Optional: tick **Submit once after QA and capture the page response** — this really submits the form once. You are asked to confirm.
3. Press **Fill the form**.
4. When it finishes, a **Download the Full QA report** card appears. Click only what you need:
   - **HTML report** — readable report for people.
   - **JSON data** — the same data for tools.
   - **Page screenshot** — only when **Capture activity during fill** is on (Setup tab).
5. The card comes back if you close and reopen the popup on the same page.

### 2.4 Upload fields (documents and photos)

1. In **Upload fields**, click **Add file** and choose a test file (PDF, JPG, PNG, DOC, DOCX, XLS, XLSX, CSV, TXT, WEBP, GIF).
2. Choose which kind of upload it is for (Photo, ID proof, Address proof, …). This is called mapping.
3. Fill the form. Each upload box gets a file of the right kind, in page order.
   - If a box has no mapped file, an unmapped file in an accepted format is used. If every file is mapped to other kinds, one of those is used, so the box is not left empty.
   - If there are more upload boxes than files, files are used again so no box stays empty.
   - "Replace document" buttons on already uploaded files are never touched.
   - If the page locks its upload boxes while it sends a file to its server, the extension waits (up to 30 seconds) before the next upload. If the page redraws its upload boxes, each file still goes to its own box.

---

## 3. Submit, save or go next (Test tab → step 3)

Let the extension press the page's Submit, Save or Next button.

1. Click **Find page actions** — it lists the buttons it could press. Buttons such as Delete, Remove, Cancel, Back, Close, Reset, Log out, Pay and Checkout are always skipped.
2. Or click **Pick element** and click any button on the page yourself. A card in the extension shows what you picked and how many matching buttons there are.
3. **Preview only (don't actually click)** is on by default — nothing is clicked. Turn it off to really click (asked once).
4. Press **Submit / Save / Next**. **Stop action** stops immediately.

**Many buttons on one page** (e.g. 100 Save buttons):
- In the picked-element card, choose the wait between clicks (1–10 seconds).
- **Advanced action settings → Pause when 100 or more matching actions are found** adds the chosen pause between Save clicks.

---

## 4. Output tab

| Section | How to use |
|---|---|
| **QA summary** | Passed / Failed / Skipped counts of the last run. **More metrics** shows fields, issues, score, accessibility, console errors, failed requests and duration. |
| **Test cases** | Click **Generate test cases**. Click a type chip to see only that type; **All** shows everything. Export with **Export CSV**, or the menu: **Markdown**, **HTML report**, **Print / save as PDF**, **Playwright JS / TS / Python**. Exports always contain all cases. |
| **Reports → Capture page evidence (PNG)** | Chrome/Edge only. Saves a full-page screenshot with console and network summaries. **Stop capturing** ends it. |
| **Generated data** | **View data** shows the fake values used last. **Copy**, **Export JSON**, **Export CSV**. |
| **Activity log** | **View logs** shows what the extension did, step by step. **Clear** empties it. |

---

## 5. Setup tab

### 5.1 Settings (switches)

| Setting | What it does |
|---|---|
| **Generate fresh data every run** | On: Quick fill and Valid data make new fake data each time. Off: they reuse the last data. (Full QA and Wrong data always make new data.) |
| **Capture activity during fill** | Records console and network activity during a fill; Full QA then offers a **Page screenshot**. Chrome/Edge only. |
| **Automatic file mapping** | When exactly one file is stored, suggests which upload kinds it fits. You confirm before anything is saved. |
| **Reuse one mapped file across fields** | Off: each file is used once before any is used again. On: the same mapped file goes to every matching field. |
| **Redact local paths in reports** | Hides your computer's folder names and extension IDs in reports. |
| **Reduce visual effects** | Turns off blur and transparency. Faster on older computers. |

**Advanced settings & file mappings →** opens the Options page (section 6).

### 5.2 AI QA assistant (optional)

1. Fill **OpenAI-compatible endpoint**, **Model**, **API key**. The endpoint must be approved in Options → AI endpoints.
2. Optional: **Include page structure (no field values)**, **Mask page URL**, **Mask page title**.
3. Type your question in **Ask a QA question** (or click **Use security-scan prompt**).
4. Click **Ask AI**. You see the exact request (API key hidden) and must confirm before it is sent.
5. **Copy result** copies the answer. The API key is not saved.

### 5.3 Network (Chrome/Edge only)

Choose a **Network profile** (Normal, 4G, 3G, 2G, Slow 2G, Offline), click **Apply**. It stays on, also after reloads, until **Restore normal**.

### 5.4 Viewport — screen sizes (Chrome/Edge only)

1. Choose a **Device preset** (phones, tablets, laptops, CSS breakpoints) or type **Width** and **Height**.
2. **Rotate** switches portrait/landscape.
3. **Apply to current page** — use the real page at that size. It stays until **Restore viewport**.
4. **Preview at this size** — shows a screenshot preview only (zoom with − / + / Reset).
5. **Open page in a resized window** — opens the page in a new window of that size.

### 5.5 Danger zone

- **Clear files** — deletes all stored test files and mappings.
- **Clear credentials** — deletes saved test logins for all sites.
- **Clear all data** — deletes everything (files, mappings, credentials, logs, generated data, saved reports, settings). Asks first.

---

## 6. Options page (Setup → Advanced settings & file mappings)

| Section | Main settings |
|---|---|
| **General** | **Allowed test environments** (header shows *Allowed test env* / *Not allowlisted*), **Same-origin link check limit**, **Multi-select choices per field**, spelling ignore list and dictionary, **Fill order** (*Page order* recommended), **Tick "Same as …" boxes**, **Keep values already in the form** (off by default — on: fields that already have a value are left alone), **Reduce visual effects**. |
| **Data & seed** | **Identity number format**, **Email / mobile locale**, **Data seed** (same seed = same values; shown in the Full QA report), registration number pattern, test PIN codes, first/last name pools, **Import project test values (CSV or JSON)** (they win over generated values), repeatable rows by site. |
| **Files & mappings** | Extra keywords that identify upload fields. |
| **Site selectors** | Exact CSS selectors per field type for one website. Use **Pick field on active page**, then **Save site config**. |
| **Credentials** | Test logins per site (JSON). Not encrypted — throwaway test accounts only. |
| **AI endpoints** | Approved AI endpoint addresses. |
| **Privacy & data** | **Auto-clear data after inactive days** (0 = never). |

Click **Save settings** at the bottom (site selectors have their own Save button).

---

## 7. Keyboard shortcuts

| Keys | Action |
|---|---|
| **Ctrl+Shift+Y** | Open the extension (change at `chrome://extensions/shortcuts`) |
| **Alt+S** | Scan page |
| **Alt+F** | Fill the form |
| **Alt+1 / 2 / 3** | Test / Output / Setup tab |
| **?** | Open help |
| **Esc** | Close dialogs and menus |

---

## 8. Common problems

| Problem | What to do |
|---|---|
| "Can't read this page" | Reload the website tab, then try again. Browser pages (`chrome://`, the Web Store) can't be used. |
| A button is greyed out | Hover over it to see why. |
| A field was skipped | Some custom widgets can't be filled automatically (payment frames, signature pads, drag-and-drop-only uploads). Fill those by hand. |
| An upload box stayed empty | Add a file in **Upload fields** in a format the box accepts (see the box's "PDF, JPG …" hint). |
| Wrong data shows "No error shown yet" everywhere | The form checks only on Save. Turn on **Click Save / Submit after each wrong value** (test site only). |
| Run seems slow | Pages with many uploads wait briefly after each one so the site's server is not flooded. Watch the progress bar; **Stop fill / QA run** stops it. |
