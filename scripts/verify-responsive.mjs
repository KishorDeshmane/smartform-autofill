/* global NodeFilter, renderPickedElementCard -- measure() and the populate step run inside the popup page. */
// Responsive layout audit for the popup / side panel and the options page.
// Loads each page with realistic content at many widths (light + dark) and measures:
//  - horizontal page overflow
//  - text spilling out of its box (not intentional ellipsis/scroll areas)
//  - text of different elements overlapping
//  - text squeezed to one word per line
// Usage: npm run verify:responsive   (writes screenshots + report to screenshots/responsive/)
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(project, 'screenshots', 'responsive');
await fs.mkdir(outDir, { recursive: true });
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [320, 360, 380, 420, 480, 600, 800, 1018, 1280];
const THEMES = process.env.THEMES ? process.env.THEMES.split(',') : ['light', 'dark'];
const popupUrl = pathToFileURL(path.join(project, 'popup', 'popup.html')).href;
const optionsUrl = pathToFileURL(path.join(project, 'options', 'options.html')).href;

const scanResponse = {
  ok: true,
  result: {
    durationMs: 184, fieldCount: 9, forms: 1, inputs: 7, textareas: 1, dropdowns: 1, customDropdowns: 0, radioGroups: 1, checkboxes: 1, fileUploads: 1,
    required: 6, disabled: 0, readonly: 0, hidden: 0, iframes: { accessible: 0, total: 0 }, pageContext: 'registration',
    securityBoundaries: { captcha: false, mfa: false, inaccessibleFrames: 0 },
    potentialIssues: ['Email field has no autocomplete attribute that helps password managers and browsers'],
    issueDetails: [{ text: 'Email field has no autocomplete attribute that helps password managers and browsers', status: 'Warning', locator: '#email-address-field-with-a-long-identifier' }],
    linkChecks: [{ href: 'https://example.test/a/very/long/path/that/keeps/going/and/going/terms-and-conditions', ok: false, status: 404 }],
    exploratory: { links: [{ text: 'Terms and conditions for using the registration service', href: 'https://example.test/terms' }], invalidLinks: [], spelling: [{ word: 'adress', suggestion: 'address' }], brokenImages: [], pendingImages: [] },
    accessibility: { status: 'heuristic', findings: [{ severity: 'Medium', title: 'Label missing on phone input', confidence: 'High', selector: '#phone', recommendation: 'Associate a <label>.' }], limitations: [] },
    lowConfidenceFields: [], riskyButtons: [],
    fieldList: [
      { key: 'a', label: 'Applicant full legal name as printed on government identity document', type: 'fullName', kind: 'text', required: true, selector: '#a', confidence: 'HIGH' },
      { key: 'b', label: 'Email', type: 'email', kind: 'email', required: true, selector: '#b', confidence: 'HIGH' },
      { key: 'c', label: 'Employee code', type: '', kind: 'text', required: false, selector: '#c', confidence: 'LOW' },
      { key: 'd', label: 'Upload photo', type: 'photo', kind: 'file', required: true, selector: '#d', confidence: 'MEDIUM' }
    ],
    fieldListTotal: 4
  }
};

/** Installs a mocked extension API so the popup renders in a plain page. */
function mockChrome({ theme, scan }) {
  localStorage.setItem('sffaTheme', theme);
  localStorage.setItem('sffaWelcomeDismissed', '1');
  const store = { sffa_settings: { allowedTestEnvironments: ['example.test'] } };
  globalThis.chrome = {
    runtime: { id: 'mock', getURL: v => `chrome-extension://mock/${v}`, getManifest: () => ({ permissions: ['debugger'], optional_permissions: [] }), onMessage: { addListener() {} }, sendMessage: async m => (m?.payload?.type === 'SFFA_DEBUGGER_AVAILABLE' ? { ok: true, supported: true, available: true } : { ok: true }) },
    storage: { local: { get: async k => (typeof k === 'string' ? { [k]: store[k] } : store), set: async v => Object.assign(store, v) }, session: { get: async () => ({}), set: async () => {} } },
    tabs: { query: async () => [{ id: 1, url: 'https://app.example.test/register', title: 'Register' }], sendMessage: async (_id, m) => (m.type === 'SFFA_SCAN_PAGE' ? scan : { ok: true, ready: true }), onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [] },
    permissions: { contains: async () => true, request: async () => true },
    debugger: { attach() {}, detach() {}, sendCommand() {}, onEvent: { addListener() {} }, onDetach: { addListener() {} } }
  };
}

/** Runs all layout measurements inside the page and returns issues. */
function measure() {
  const issues = [];
  const describe = el => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 80);
  };
  const visible = el => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || n.hidden) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push({ kind: 'page-overflow', detail: `${document.documentElement.scrollWidth} > ${window.innerWidth}` });

  const textNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text || !node.parentElement || !visible(node.parentElement)) continue;
    if (node.parentElement.closest('select, option, script, style, .visually-hidden, [aria-hidden="true"] .skeleton')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // Clip to ancestors that hide overflow (ellipsis, scroll areas): hidden text is not visible overlap.
    let clip = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
    for (let n = node.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible') {
        const b = n.getBoundingClientRect();
        clip = { left: Math.max(clip.left, b.left), right: Math.min(clip.right, b.right), top: Math.max(clip.top, b.top), bottom: Math.min(clip.bottom, b.bottom) };
      }
    }
    const rects = [...range.getClientRects()]
      .map(r => ({ left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right), top: Math.max(r.top, clip.top), bottom: Math.min(r.bottom, clip.bottom), rawRight: r.right, rawLeft: r.left }))
      .map(r => ({ ...r, width: r.right - r.left, height: r.bottom - r.top }))
      .filter(r => r.width > 1 && r.height > 1);
    if (rects.length) textNodes.push({ node, el: node.parentElement, text, rects });
  }

  // Text spilling outside its element (ignoring intentional scroll/ellipsis containers).
  for (const { el, text, rects } of textNodes) {
    let box = el;
    while (box && getComputedStyle(box).display === 'inline') box = box.parentElement;
    if (!box) continue;
    const s = getComputedStyle(box);
    if (s.textOverflow === 'ellipsis' || /auto|scroll|hidden|clip/.test(s.overflowX)) continue;
    const b = box.getBoundingClientRect();
    const spill = rects.some(r => r.right > b.right + 2 || r.left < b.left - 2);
    if (spill) issues.push({ kind: 'text-spills', element: describe(box), text: text.slice(0, 50) });
  }

  // Stretched boxes: a heading, badge or header row much taller than its own text leaves big empty gaps.
  for (const el of document.querySelectorAll('h1, h2, h3, h4, summary, .card-header, .fill-section-header, .badge, .pill, .btn')) {
    if (!visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const content = [...range.getClientRects()].filter(r => r.height > 1);
    if (!content.length) continue;
    const textHeight = Math.max(...content.map(r => r.bottom)) - Math.min(...content.map(r => r.top));
    const box = el.getBoundingClientRect().height;
    if (box > textHeight + 48 && box > textHeight * 2.2) issues.push({ kind: 'stretched-box', element: describe(el), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), detail: `${Math.round(box)}px tall for ${Math.round(textHeight)}px of content` });
  }

  // Controls pushed past the panel edge (hidden overflow does not show as page scrolling).
  for (const el of document.querySelectorAll('button, input, select, textarea, a[href]')) {
    if (!visible(el)) continue;
    // Items in a sideways-scrolling strip (such as the Options section menu) are meant to start off-screen.
    let scrolls = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/auto|scroll/.test(getComputedStyle(n).overflowX)) { scrolls = true; break; }
    if (scrolls) continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) issues.push({ kind: 'off-screen', element: describe(el), text: (el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), detail: `right edge ${Math.round(r.right)} > ${window.innerWidth}` });
  }

  // Controls sticking out of their card (for example a 100%-wide button that also has side margins).
  for (const el of document.querySelectorAll('button, input, select, textarea, .btn')) {
    if (!visible(el)) continue;
    const card = el.parentElement?.closest('.card, details, dialog, .picked-card');
    if (!card) continue;
    const r = el.getBoundingClientRect(), b = card.getBoundingClientRect();
    if (r.right > b.right + 1 || r.left < b.left - 1) issues.push({ kind: 'sticks-out', element: describe(el), text: (el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40), detail: `${Math.round(r.right - b.right)}px past the card` });
  }

  // Squeezed text: multi-word text broken to roughly one word per line.
  for (const { el, text, rects } of textNodes) {
    const words = text.split(' ').filter(Boolean).length;
    const lines = new Set(rects.map(r => Math.round(r.top))).size;
    if (words >= 3 && lines >= words && el.getBoundingClientRect().width < 120) issues.push({ kind: 'squeezed', element: describe(el), text: text.slice(0, 50), lines, words });
  }

  // Overlapping text from different elements.
  for (let i = 0; i < textNodes.length; i++) {
    for (let j = i + 1; j < textNodes.length; j++) {
      const a = textNodes[i], b = textNodes[j];
      if (a.node === b.node) continue;
      const hit = a.rects.some(ra => b.rects.some(rb => ra.left < rb.right - 2 && rb.left < ra.right - 2 && ra.top < rb.bottom - 2 && rb.top < ra.bottom - 2));
      if (hit) {
        // Ignore stacking layers such as dialogs/toasts drawn above content.
        const layer = el => {
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            if (n.matches('dialog[open], .toast, .help-tooltip, .ui-tooltip')) return n;
            if (/fixed|sticky/.test(getComputedStyle(n).position)) return n;
          }
          return null;
        };
        if (layer(a.el) !== layer(b.el)) continue;
        issues.push({ kind: 'text-overlap', a: `${describe(a.el)} "${a.text.slice(0, 30)}"`, b: `${describe(b.el)} "${b.text.slice(0, 30)}"` });
      }
    }
  }
  return issues;
}

const browser = await chromium.launch({ headless: true });
const report = [];
for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 6000 }, colorScheme: theme });
    const page = await context.newPage();
    await page.addInitScript(mockChrome, { theme, scan: scanResponse });
    await page.goto(popupUrl);
    await page.waitForTimeout(250);
    // Populate: scan results, picker card, every collapsible section open.
    await page.click('#scanPageBtn').catch(() => {});
    await page.waitForSelector('#scanResult .stat-tile', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach(d => { d.open = true; });
      if (typeof renderPickedElementCard === 'function') renderPickedElementCard({ label: 'Send one-time password to registered mobile', matchCount: 12, mode: 'No delay needed', risky: true });
      document.getElementById('testCaseExportRow')?.classList.remove('hidden');
      document.getElementById('exportMenu')?.removeAttribute('hidden');
      document.getElementById('qaFieldScope')?.classList.remove('hidden');
    });
    for (const tab of ['test', 'output', 'setup']) {
      await page.click(`#tab${tab[0].toUpperCase()}${tab.slice(1)}Button`);
      await page.waitForTimeout(120);
      const issues = await page.evaluate(measure);
      for (const issue of issues) report.push({ page: 'popup', theme, width, tab, ...issue });
      await page.screenshot({ path: path.join(outDir, `popup-${theme}-${width}-${tab}.png`), fullPage: true });
    }
    // Options page.
    await page.goto(optionsUrl);
    await page.waitForTimeout(250);
    for (const issue of await page.evaluate(measure)) report.push({ page: 'options', theme, width, tab: '-', ...issue });
    await page.screenshot({ path: path.join(outDir, `options-${theme}-${width}.png`), fullPage: true });
    await context.close();
  }
}
await browser.close();
await fs.writeFile(path.join(outDir, 'responsive-report.json'), `${JSON.stringify(report, null, 2)}\n`);
// Summarise by issue (one line per distinct problem, with the widths where it happens).
const grouped = new Map();
for (const item of report) {
  const key = JSON.stringify({ page: item.page, tab: item.tab, kind: item.kind, element: item.element || item.a, other: item.b, text: item.text });
  if (!grouped.has(key)) grouped.set(key, new Set());
  grouped.get(key).add(item.width);
}
const lines = [...grouped].map(([key, widths]) => ({ ...JSON.parse(key), widths: [...widths].sort((a, b) => a - b) }));
console.log(JSON.stringify({ checkedWidths: WIDTHS, distinctIssues: lines.length, issues: lines }, null, 2));
if (lines.length) process.exitCode = 1;
