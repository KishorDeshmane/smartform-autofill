// End-to-end tests: load the built Chrome extension in Chromium and drive the real popup.
// Run with `npm run test:e2e` (builds dist/chrome first). Needs `npx playwright install chromium` once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'chrome');
const ORIGIN = 'https://qa.example.test';

const FORM = `<div role="dialog" aria-modal="true"><h2>Add TRAI User</h2><form>
<label>Role <select name="role" required><option value="">Select</option><option>QOS Custom role</option></select></label>
<label>First Name <input name="firstName" required></label><label>Last Name <input name="lastName"></label>
<label>Email <input type="email" name="email" required></label><label>Mobile Number <input name="mobile" required></label>
<label>Designation <input name="designation" required></label><label>Department <input name="department"></label>
<button type="submit">Create User</button></form></div>`;
const LINKS = Array.from({ length: 60 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join(' ');
const PAGES = {
  '/modal': `<!doctype html><title>Users</title><body>${FORM}</body>`,
  '/links': `<!doctype html><title>Links</title><body><nav>${LINKS}</nav>${FORM}</body>`,
  '/slow-links': `<!doctype html><title>Slow links</title><body><nav>${LINKS}</nav>${FORM}</body>`,
  // Freezes the main thread shortly after load: the extension cannot get an answer.
  '/frozen': `<!doctype html><title>Frozen</title><body>${FORM}<script>setTimeout(() => { const end = Date.now() + 45000; while (Date.now() < end) {} }, 2500);</script></body>`,
  // Freezes the main thread on the first input event, i.e. in the middle of a fill.
  // Responsive page (has a viewport meta tag, like real mobile-ready sites).
  '/responsive': `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Responsive</title></head><body>${FORM}</body></html>`,
  // Page actions: Save is safe (counts clicks), Delete is risky and must never be clicked.
  '/actions': `<!doctype html><title>Actions</title><body><form onsubmit="return false"><label>Name <input name="fullname"></label>
    <button type="button" id="save" onclick="window.saves=(window.saves||0)+1">Save</button>
    <button type="button" id="delete" onclick="window.deletes=(window.deletes||0)+1">Delete account</button></form></body>`,
  '/upload': `<!doctype html><title>Upload</title><body><form><label>Upload photo <input type="file" name="photo" accept="image/*"></label>
    <label>Full name <input name="fullname"></label></form></body>`,
  // 300 fields in one big container: used to take ~40s to scan and fail the fill.
  // Four row Save buttons; every click re-renders the list (like many single-page apps do).
  '/rows': `<!doctype html><title>Rows</title><body><div id="list"></div><script>
    window.clicks = [];
    function render() { document.getElementById('list').innerHTML = [1, 2, 3, 4].map(n => '<div class="row">Row ' + n + ' <button type="button" class="row-save" data-row="' + n + '">Save</button></div>').join(''); }
    document.addEventListener('click', e => { const b = e.target.closest('.row-save'); if (b && e.isTrusted === false) { window.clicks.push({ row: Number(b.dataset.row), at: Date.now() }); render(); } });
    render();
  </script></body>`,
  '/datalist': `<!doctype html><title>Order</title><body><form onsubmit="return false">
    <label>City <input name="city" list="cities" required></label>
    <datalist id="cities"><option value="Pune"><option value="Mumbai"><option value="Nagpur"></datalist>
    <label>PIN code <input name="pincode" pattern="[0-9]{6}" list="pins"></label>
    <datalist id="pins"><option value="ABC"><option value="411001"></datalist>
    <label>Email <input type="email" name="email" required></label></form></body>`,
  // Like many React upload pages (e.g. a document-onboarding screen): each pending card has only a
  // "Browse Files" button; one hidden input is shared. The button remembers which document is next,
  // the change handler reads the file, clears the input and moves the card to "Uploaded".
  // Uploaded cards have a hidden "Replace document" input that must not be touched by a fill.
  '/doc-cards': `<!doctype html><title>Documents</title><body><div id="docs">
    <input class="hidden" style="display:none" accept=".pdf,.jpg,.jpeg,.png" type="file">
    <section><h3>Pending Documents</h3><div id="pending"></div></section>
    <section><h3>Uploaded Documents</h3><div id="uploaded"></div></section></div>
    <label class="group"><div><input id="consent" class="appearance-none" type="checkbox"></div><span>I hereby consent that the uploaded documents are <strong>correct and accurate</strong>, and I consent to <strong>digitally signing</strong> them.</span></label>
    <script>
      const docs = { moa: ['MOA &amp; AOA', 'Copy of Memorandum of Association (MOA) &amp; Articles of Association (AOA).'],
        fin: ['Financial Statements for Last Three Years', 'Financial statements issued by Chartered Accountant.'],
        pan: ['Copy of PAN', 'Copy of the organisation PAN.'] };
      let pending = ['moa', 'fin'], uploaded = ['pan'], active = null;
      window.uploads = []; window.replaced = []; window.dialogs = 0;
      const shared = document.querySelector('input[type=file]');
      function render() {
        document.getElementById('pending').innerHTML = pending.map(id => '<div class="card"><h4>' + docs[id][0] + '</h4><p>' + docs[id][1] + '</p><p>Click to browse or drag and drop</p><button type="button" data-doc="' + id + '">Browse Files</button></div>').join('');
        document.getElementById('uploaded').innerHTML = uploaded.map(id => '<div class="card"><h3>' + docs[id][0] + '</h3><p>' + docs[id][1] + '</p><label aria-label="Replace document" title="Replace document">&#8635;<input class="hidden" type="file" data-replace="' + id + '" style="display:none"></label></div>').join('');
      }
      document.addEventListener('click', e => { const b = e.target.closest('button[data-doc]'); if (b) { active = b.dataset.doc; window.dialogs++; shared.click(); } });
      shared.addEventListener('change', () => {
        if (!active || !shared.files.length) return;
        window.uploads.push({ doc: active, name: shared.files[0].name });
        pending = pending.filter(id => id !== active); uploaded.push(active); active = null;
        shared.value = ''; render();
        document.getElementById('consent').checked = false; // documents changed: consent must be given again
      });
      document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.replace) window.replaced.push(e.target.dataset.replace); });
      render();
    </script></body>`,
  // A plain flex-wrap <div> of unnamed checkboxes (no fieldset, no name), state kept by the page.
  '/sectors': `<!doctype html><title>Sectors</title><body><form onsubmit="return false">
    <label>Company name <input name="company"></label>
    <p>Select sectors</p>
    <div class="flex flex-wrap gap-2 rounded-lg border p-3" id="sectors">
      <label class="flex cursor-pointer items-center gap-2"><input class="h-4 w-4 rounded" type="checkbox">Telecom</label>
      <label class="flex cursor-pointer items-center gap-2"><input class="h-4 w-4 rounded" type="checkbox">Banking</label>
      <label class="flex cursor-pointer items-center gap-2"><input class="h-4 w-4 rounded" type="checkbox">Healthcare</label>
      <label class="flex cursor-pointer items-center gap-2"><input class="h-4 w-4 rounded" type="checkbox">None of the above</label>
    </div></form>
    <script>window.selected = new Set(); document.getElementById('sectors').addEventListener('change', e => { const t = e.target.parentElement.textContent.trim(); e.target.checked ? window.selected.add(t) : window.selected.delete(t); });</script></body>`,
  // "Choose File" label wrapping a hidden input whose card names no known document type.
  '/choose-file': `<!doctype html><title>Choose file</title><body><div class="space-y-2"><p>Board resolution for the applicant</p>
    <div class="flex items-center gap-3"><label class="flex cursor-pointer items-center gap-2 rounded-lg border">Choose File
      <input accept=".pdf,.doc,.docx" class="hidden" style="display:none" type="file"></label></div></div>
    <script>window.got = []; document.querySelector('input').addEventListener('change', e => window.got.push(e.target.files[0] && e.target.files[0].name));</script></body>`,
  // A page with several passive security findings (new-tab link, inline handler, password without autocomplete).
  '/insecure': `<!doctype html><title>Login</title><body><form><label>User <input name="user"></label>
    <label>Password <input type="password" name="pw"></label><button type="button" onclick="void 0">Sign in</button></form>
    <a href="/help" target="_blank">Help</a><a href="/terms" target="_blank">Terms</a>
    <script src="/lib/a.js"></script><script src="/lib/b.js"></script><script src="/lib/c.js"></script></body>`,
  // A realistic form for Wrong data / Edge cases: browser rules, a page-made error message, limits.
  '/qa-form': `<!doctype html><title>Apply</title><body><form novalidate>
    <div><label for="email">Email</label><input id="email" type="email" name="email" required></div>
    <div><label for="fullname">Full name</label><input id="fullname" name="fullname" required></div>
    <div><label for="pan">PAN number</label><input id="pan" name="panNumber" aria-describedby="panErr"><p id="panErr" class="text-red-600" hidden></p></div>
    <div><label for="pin">PIN code</label><input id="pin" name="pincode" maxlength="6" pattern="[0-9]{6}"></div>
    <div><label for="age">Age</label><input id="age" type="number" name="age" min="18" max="60"></div>
    <div><label><input id="agree" type="checkbox" required> I agree to the terms</label></div>
    <button type="submit">Apply</button></form>
    <script>
      const pan = document.getElementById('pan'), err = document.getElementById('panErr');
      const check = () => { const bad = pan.value !== '' && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.value); err.hidden = !bad; err.textContent = bad ? 'Enter a valid PAN, for example ABCDE1234F' : ''; pan.setAttribute('aria-invalid', String(bad)); };
      pan.addEventListener('input', check); pan.addEventListener('blur', check);
    </script></body>`,
  // Checks fields only when Save is clicked (like many React forms). Mobile is never checked: a bug to find.
  '/save-check': `<!doctype html><title>Profile</title><body><form id="f">
    <div><label for="em">Email</label><input id="em" name="email"><p class="error" id="emErr"></p></div>
    <div><label for="mob">Mobile</label><input id="mob" type="tel" name="mobile"></div>
    <button type="submit">Save</button></form>
    <script>
      window.saved = [];
      document.getElementById('f').addEventListener('submit', e => {
        e.preventDefault();
        const em = document.getElementById('em'), err = document.getElementById('emErr');
        const bad = !/^[^@ ]+@[^@ ]+[.][a-z]{2,}$/i.test(em.value);
        err.textContent = bad ? 'Enter a valid email address' : '';
        if (!bad) window.saved.push({ email: em.value, mobile: document.getElementById('mob').value });
      });
    </script></body>`,
  '/big-form': `<!doctype html><title>Big form</title><body><form><div class="inner">${Array.from({ length: 300 }, (_, i) => `<div class="row"><label>Field number ${i} <input name="f${i}"></label><span class="help">Help text ${i}</span></div>`).join('')}${Array.from({ length: 1500 }, (_, i) => `<p>Paragraph ${i} with <b>some</b> <i>inline</i> text</p>`).join('')}</div></form></body>`,
  '/freeze-on-fill': `<!doctype html><title>Freeze on fill</title><body>${FORM}<script>let frozen = false; document.addEventListener('input', () => { if (frozen) return; frozen = true; setTimeout(() => { const end = Date.now() + 50000; while (Date.now() < end) {} }, 0); }, true);</script></body>`
};

/** Copies dist/chrome to a temp folder; optionally grants host access in that copy only. */
async function prepareExtension({ hostAccess, extraPermissions = [] }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sffa-ext-'));
  await fs.cp(DIST, dir, { recursive: true });
  if (hostAccess) {
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.host_permissions = [`${ORIGIN}/*`];
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
  if (extraPermissions.length) {
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.permissions = [...new Set([...manifest.permissions, ...extraPermissions])];
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return dir;
}

/** Launches Chromium with the extension, serving the fake site through request routing. */
async function launch({ hostAccess = true, extraPermissions = [] } = {}) {
  const extensionDir = await prepareExtension({ hostAccess, extraPermissions });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sffa-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 420, height: 760 },
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
  });
  await context.route(`${ORIGIN}/**`, route => {
    const url = new URL(route.request().url());
    if (route.request().resourceType() === 'document' && PAGES[url.pathname]) return route.fulfill({ contentType: 'text/html', body: PAGES[url.pathname] });
    if (route.request().headers().referer?.includes('/slow-links')) return undefined; // never answer
    return route.fulfill({ status: 200, body: 'ok' });
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  const errors = [];
  /** Opens a site page, then the popup (as a tab); the popup targets the last used website tab. */
  async function open(pathname) {
    const site = context.pages()[0] || await context.newPage();
    await site.goto(`${ORIGIN}${pathname}`);
    const popup = await context.newPage();
    popup.on('pageerror', error => errors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''), null, { timeout: 10000 });
    await popup.evaluate(() => { localStorage.setItem('sffaWelcomeDismissed', '1'); document.getElementById('welcomeCard')?.setAttribute('hidden', ''); });
    return { site, popup };
  }
  async function close() {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
    await fs.rm(extensionDir, { recursive: true, force: true }).catch(() => {});
  }
  return { context, worker, extensionId, open, close, errors };
}

/** Clicks Scan and waits for either the stat tiles or an inline error. */
async function scan(popup, timeout = 90000) {
  await popup.click('#scanPageBtn');
  await popup.waitForSelector('#scanResult .stat-tile, #scanResult .result-error', { timeout });
  return (await popup.textContent('#scanResult')).replace(/\s+/g, ' ').trim();
}

test('background is alive, answers messages and settings persist', async () => {
  const env = await launch();
  try {
    assert.equal(await env.worker.evaluate(() => chrome.runtime.onMessage.hasListeners()), true, 'service worker message listener');
    const { popup } = await env.open('/modal');
    const ping = await popup.evaluate(() => window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_PING' }, { timeoutMs: 5000 }));
    assert.deepEqual(ping, { ok: true });
    await popup.evaluate(() => SFFAStorage.updateSettings({ dataSeed: 'e2e-seed' }));
    await popup.reload();
    assert.equal(await popup.evaluate(() => SFFAStorage.getSettings().then(s => s.dataSeed)), 'e2e-seed');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('header shows the hostname with access, and "Access needed" without it', async () => {
  const granted = await launch({ hostAccess: true });
  try {
    const { popup } = await granted.open('/modal');
    assert.equal((await popup.textContent('#pageHostChip')).trim(), 'qa.example.test/modal', 'site and page path');
    assert.equal((await popup.textContent('#pageStatusLabel')).trim(), 'Ready');
    // Generic use: no allowlist configured, so no environment badge is shown at all.
    assert.equal(await popup.isVisible('#envBadge'), false, 'no badge until test sites are configured');
    // Once test sites are configured, the badge reports whether this site is one of them.
    await popup.evaluate(() => SFFAStorage.updateSettings({ allowedTestEnvironments: ['example.test'] }));
    await popup.reload();
    await popup.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''));
    assert.equal((await popup.textContent('#envBadge')).trim(), 'Allowed test env');
    await popup.evaluate(() => SFFAStorage.updateSettings({ allowedTestEnvironments: ['staging.other.test'] }));
    await popup.reload();
    await popup.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''));
    assert.equal((await popup.textContent('#envBadge')).trim(), 'Not allowlisted');
  } finally { await granted.close(); }
  const denied = await launch({ hostAccess: false });
  try {
    const { popup } = await denied.open('/modal');
    assert.equal((await popup.textContent('#pageHostChip')).trim(), 'Access needed');
    assert.equal(await popup.isVisible('#grantAccessBanner'), true);
  } finally { await denied.close(); }
});

test('tab picker explains hidden tabs instead of showing an empty list', async () => {
  const env = await launch({ hostAccess: false });
  try {
    const { popup } = await env.open('/modal');
    await popup.click('#pageHostChip');
    await popup.waitForFunction(() => /list your tabs/i.test(document.getElementById('grantAccessBanner')?.textContent || ''), null, { timeout: 5000 });
    assert.match(await popup.textContent('#extensionContextMessage'), /list your open website tabs/);
  } finally { await env.close(); }
});

test('scan of a modal form shows stat tiles; fill reports filled fields and the page has values', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/links');
    const text = await scan(popup);
    assert.match(text, /Fields\s*7/);
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
    const status = (await popup.textContent('#fillStatus')).replace(/\s+/g, ' ');
    assert.match(status, /\d+ fields filled/);
    const values = await site.evaluate(() => Object.fromEntries([...document.querySelectorAll('input')].map(i => [i.name, i.value])));
    assert.ok(values.email.includes('@'), `email filled: ${values.email}`);
    assert.ok(values.firstName.length > 0, 'first name filled');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('Quick fill uses datalist suggestions in real Chrome, skipping options the field rejects', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/datalist');
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
    const values = await site.evaluate(() => Object.fromEntries([...document.querySelectorAll('input')].map(i => [i.name, i.value])));
    assert.ok(['Pune', 'Mumbai', 'Nagpur'].includes(values.city), `city: ${values.city}`);
    assert.equal(values.pincode, '411001', 'the option that breaks the pattern is skipped');
    assert.ok(values.email.includes('@'), `email: ${values.email}`);
    assert.equal(await site.evaluate(() => document.querySelector('form').checkValidity()), true, 'the filled form is valid');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('links that never respond do not stall the scan', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/slow-links');
    const started = Date.now();
    const text = await scan(popup, 30000);
    assert.match(text, /Fields\s*7/);
    // The link-check budget is 12s; allow headroom for slow or busy machines. Without the budget,
    // 25 never-answering links at up to 2s + 2s retry each would take far longer.
    assert.ok(Date.now() - started < 20000, `scan took ${Date.now() - started}ms`);
  } finally { await env.close(); }
});

test('a frozen page ends the scan with "Reload page & retry"', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/frozen');
    await new Promise(resolve => setTimeout(resolve, 3000)); // let the page freeze
    await scan(popup, 90000);
    const buttons = await popup.$$eval('#scanResult .result-error button', list => list.map(b => b.textContent.trim()));
    assert.ok(buttons.includes('Reload page & retry'), `buttons: ${buttons}`);
  } finally { await env.close(); }
});

test('a page that freezes during a fill is caught by the watchdog with a Reload action', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/freeze-on-fill');
    const started = Date.now();
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.error', { timeout: 70000 });
    const status = (await popup.textContent('#fillStatus')).replace(/\s+/g, ' ');
    assert.match(status, /stopped responding/i);
    assert.equal(await popup.isVisible('#fillStatus .reload-page'), true);
    assert.equal(await popup.isEnabled('#fillFormBtn'), true, 'fill button re-enabled');
    assert.ok(Date.now() - started < 60000, `watchdog took ${Date.now() - started}ms`);
  } finally { await env.close(); }
});

test('after an extension reload, an already-open page can still be scanned', async (t) => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    assert.match(await scan(popup), /Fields\s*7/);
    await popup.close();
    // Reload exactly like a user: chrome://extensions → Developer mode → the extension's Reload button.
    const manager = await env.context.newPage();
    await manager.goto(`chrome://extensions/?id=${env.extensionId}`);
    await manager.waitForTimeout(800);
    const clicked = await manager.evaluate(() => {
      const root = document.querySelector('extensions-manager')?.shadowRoot;
      const toggle = root?.querySelector('extensions-toolbar')?.shadowRoot?.querySelector('#devMode');
      if (toggle && !toggle.checked) toggle.click();
      /** Finds the Reload button through nested shadow roots. */
      const find = scope => {
        if (!scope) return null;
        const hit = scope.querySelector?.('#dev-reload-button');
        if (hit) return hit;
        for (const el of scope.querySelectorAll?.('*') || []) { if (el.shadowRoot) { const found = find(el.shadowRoot); if (found) return found; } }
        return null;
      };
      const button = find(root);
      button?.click();
      return !!button;
    });
    await manager.close();
    if (!clicked) { t.skip('Reload button not found on chrome://extensions in this Chromium build'); return; }
    // Wait for the reloaded extension to accept its popup URL again.
    const reopened = await env.context.newPage();
    let loaded = false;
    for (let attempt = 0; attempt < 40 && !loaded; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      loaded = await reopened.goto(`chrome-extension://${env.extensionId}/popup/popup.html`).then(() => true).catch(() => false);
    }
    if (!loaded) { t.skip('Chromium did not re-enable the unpacked extension after chrome.runtime.reload() in this environment'); return; }
    await reopened.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''), null, { timeout: 10000 });
    await reopened.evaluate(() => document.getElementById('welcomeCard')?.setAttribute('hidden', ''));
    const text = await scan(reopened, 90000);
    // Either the fresh page script answered, or the user gets a one-click recovery. Never a hang.
    t.diagnostic(/Fields\s*7/.test(text) ? 'after reload: fresh page script answered the scan directly' : `after reload: recovery shown (${text.slice(0, 80)})`);
    if (!/Fields\s*7/.test(text)) {
      const buttons = await reopened.$$eval('#scanResult .result-error button', list => list.map(b => b.textContent.trim()));
      assert.ok(buttons.includes('Reload page & retry'), `after reload: ${text}`);
    }
  } finally { await env.close(); }
});

test('scan lists each detected field; after a fill every row shows its result', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    await scan(popup);
    const rows = await popup.$$eval('#scanResult .field-list li', list => list.map(li => ({
      label: li.querySelector('.field-label').textContent, pills: [...li.querySelectorAll('.pill:not([hidden])')].map(p => p.textContent)
    })));
    assert.equal(rows.length, 7, JSON.stringify(rows));
    assert.ok(rows.some(row => /Email/.test(row.label) && row.pills.includes('Required')), JSON.stringify(rows));
    // Filter box narrows the list.
    await popup.fill('#scanResult .scan-filter input', 'mobile');
    assert.equal(await popup.$$eval('#scanResult .field-list li:not(.is-filtered-out)', list => list.length), 1);
    await popup.fill('#scanResult .scan-filter input', '');
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning', { timeout: 60000 });
    const statuses = await popup.$$eval('#scanResult .field-list li .field-status', list => list.map(p => p.textContent));
    assert.equal(statuses.length, 7);
    assert.ok(statuses.every(Boolean), `statuses: ${statuses}`);
    assert.ok(statuses.filter(s => s === 'Filled').length >= 5, `statuses: ${statuses}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('"Reduce visual effects" removes the blur and is remembered', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    const blur = () => popup.evaluate(() => getComputedStyle(document.querySelector('.card')).backdropFilter);
    assert.notEqual(await blur(), 'none');
    await popup.click('#tabSetupButton');
    await popup.click('label:has(#reduceEffectsToggle)');
    assert.equal(await popup.getAttribute('html', 'data-effects'), 'reduced');
    assert.match(await blur(), /^(none|blur\(0px\).*)$/);
    await popup.reload();
    assert.equal(await popup.getAttribute('html', 'data-effects'), 'reduced');
    const options = await env.context.newPage();
    await options.goto(`chrome-extension://${env.extensionId}/options/options.html`);
    assert.equal(await options.getAttribute('html', 'data-effects'), 'reduced');
    assert.equal(await options.isChecked('#reduceEffectsToggle'), true);
  } finally { await env.close(); }
});

/** Stops the extension's service worker the way Chrome does when it is idle. */
async function stopServiceWorker(env, page) {
  const cdp = await env.context.newCDPSession(page);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const worker = targetInfos.find(t => t.type === 'service_worker' && t.url.includes(env.extensionId));
  assert.ok(worker, 'extension service worker target found');
  await cdp.send('Target.closeTarget', { targetId: worker.targetId });
  await new Promise(resolve => setTimeout(resolve, 1500));
}

/**
 * True when THIS extension still holds a debugger attachment on the tab. (getTargets().attached is
 * not usable here: Playwright itself attaches to every page it controls.) Probe by attaching: Chrome
 * answers "already attached" only for the extension's own attachment; a successful probe is undone.
 */
const extensionStillAttached = (popup, tabId) => popup.evaluate(id => new Promise(resolve => {
  chrome.debugger.attach({ tabId: id }, '1.3', () => {
    const error = chrome.runtime.lastError?.message || '';
    if (/already attached/i.test(error)) resolve(true);
    else chrome.debugger.detach({ tabId: id }, () => resolve(false));
  });
}), tabId);

test('capture survives a service-worker restart: status stays correct and Stop really detaches', async () => {
  const env = await launch({ extraPermissions: ['debugger', 'tabs'] });
  try {
    const { site, popup } = await env.open('/modal');
    const tabId = await popup.evaluate(() => window.getActiveTab().then(t => t.id));
    assert.equal((await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_START_CAPTURE', tabId: id }), tabId)).ok, true);
    await stopServiceWorker(env, site);
    const status = await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_IS_CAPTURING', tabId: id }), tabId);
    assert.equal(status.attached, true, 'extension still knows the capture is attached after the restart');
    const stop = await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_STOP_CAPTURE', tabId: id }), tabId);
    assert.equal(stop.ok, true);
    assert.equal(await extensionStillAttached(popup, tabId), false, 'debugger detached after Stop capturing');
  } finally { await env.close(); }
});

test('network profile can be reset after a service-worker restart', async () => {
  const env = await launch({ extraPermissions: ['debugger', 'tabs'] });
  try {
    const { site, popup } = await env.open('/modal');
    const tabId = await popup.evaluate(() => window.getActiveTab().then(t => t.id));
    assert.equal((await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_NETWORK_PROFILE', tabId: id, profile: 'slow' }), tabId)).ok, true);
    await stopServiceWorker(env, site);
    const restore = await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_NETWORK_PROFILE', tabId: id, profile: 'normal' }), tabId);
    assert.equal(restore.ok, true, `restore failed: ${restore.error}`);
    const stop = await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_STOP_CAPTURE', tabId: id }), tabId);
    assert.equal(stop.ok, true);
    assert.equal(await extensionStillAttached(popup, tabId), false, 'no debugger left attached');
  } finally { await env.close(); }
});

test('a 300-field form scans and fills quickly without a watchdog error', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/big-form');
    let started = Date.now();
    const text = await scan(popup, 60000);
    const scanMs = Date.now() - started;
    assert.match(text, /Fields\s*300/);
    started = Date.now();
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 90000 });
    const fillMs = Date.now() - started;
    const status = (await popup.textContent('#fillStatus')).replace(/\s+/g, ' ');
    assert.match(status, /300 fields filled/, status);
    assert.equal(await site.evaluate(() => [...document.querySelectorAll('input')].filter(i => !i.value).length), 0, 'every field has a value');
    // ~2s / ~6s on an idle machine. Limits allow for a busy machine but still catch the old ~40s scan;
    // the old fill failed outright, which the '300 fields filled' check above catches.
    assert.ok(scanMs < 30000, `scan took ${scanMs}ms (was ~40s)`);
    assert.ok(fillMs < 45000, `fill took ${fillMs}ms`);
  } finally { await env.close(); }
});

/** Captures files the popup would download (Save-As dialogs cannot be answered in headless Chrome). */
async function captureDownloads(popup) {
  await popup.evaluate(() => {
    window.__downloads = [];
    window.SFFAExt.downloads.download = async options => {
      window.__downloads.push({ filename: options.filename, text: await (await fetch(options.url)).text() });
      return 1;
    };
  });
  return () => popup.evaluate(() => window.__downloads);
}

test('options: settings saved on the Options page persist and reach the popup', async () => {
  const env = await launch();
  try {
    const options = await env.context.newPage();
    await options.goto(`chrome-extension://${env.extensionId}/options/options.html`);
    await options.fill('#allowedTestEnvironments', 'qa.example.test, localhost');
    await options.fill('#linkCheckLimit', '7');
    await options.fill('#dataSeed', 'e2e-options');
    await options.click('#saveGeneration');
    await options.waitForTimeout(500);
    await options.reload();
    assert.ok((await options.inputValue('#allowedTestEnvironments')).includes('qa.example.test'));
    assert.equal(await options.inputValue('#linkCheckLimit'), '7');
    assert.equal(await options.inputValue('#dataSeed'), 'e2e-options');
    const { popup } = await env.open('/modal');
    assert.equal((await popup.textContent('#envBadge')).trim(), 'Allowed test env');
  } finally { await env.close(); }
});

test('Danger zone: "Clear all data" really clears stored data after confirmation', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    await popup.evaluate(async () => {
      await SFFAStorage.updateSettings({ dataSeed: 'to-be-cleared', allowedTestEnvironments: ['x.test'] });
      await SFFAStorage.addUsed('email', 'old@example.com');
    });
    await popup.click('#tabSetupButton');
    await popup.click('#clearAllDataBtn');
    await popup.click('#confirmOk');
    await popup.waitForFunction(() => (document.querySelector('.toast.show')?.textContent || '').includes('cleared'), null, { timeout: 10000 });
    const state = await popup.evaluate(async () => ({ settings: await SFFAStorage.getSettings(), used: await SFFAStorage.getUsed('email') }));
    assert.equal(state.settings.dataSeed, '');
    assert.deepEqual(state.settings.allowedTestEnvironments, []);
    assert.deepEqual(state.used, []);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('test cases: generate from the page, then export CSV and Playwright files with real content', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    const downloads = await captureDownloads(popup);
    await popup.click('#tabOutputButton');
    await popup.click('#generateTestCasesBtn');
    await popup.waitForSelector('#testCaseExportRow:not(.hidden)', { timeout: 30000 });
    await popup.click('#exportTcCsvBtn');
    await popup.click('#exportMenuToggle');
    await popup.click('#exportTcJsBtn');
    await popup.waitForFunction(() => window.__downloads.length >= 2, null, { timeout: 10000 });
    const files = await downloads();
    const csv = files.find(f => f.filename.endsWith('.csv'));
    const spec = files.find(f => f.filename.endsWith('.spec.js'));
    assert.ok(csv && spec, JSON.stringify(files.map(f => f.filename)));
    assert.ok(csv.text.includes('Test Case ID'));
    assert.ok(csv.text.split('\n').length > 3, 'CSV has data rows');
    assert.ok(spec.text.includes("from '@playwright/test'"));
    assert.ok(spec.text.includes('test('));
  } finally { await env.close(); }
});

test('test cases: clicking a type shows only that type; All shows everything again; exports stay complete', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    const downloads = await captureDownloads(popup);
    await popup.click('#tabOutputButton');
    await popup.click('#generateTestCasesBtn');
    await popup.waitForSelector('#testCaseResult .tc-filter-chip', { timeout: 30000 });
    const total = await popup.locator('#testCaseResult .tc-detail').count();
    const chips = await popup.$$eval('#testCaseResult .tc-filter-chip', els => els.map(el => ({ category: el.dataset.category, count: Number(el.querySelector('.tc-filter-count').textContent) })));
    assert.equal(chips[0].category, 'all');
    assert.ok(chips.length > 2, `several types: ${JSON.stringify(chips)}`);
    const pick = chips.slice(1).find(c => c.count < chips[0].count);
    await popup.click(`#testCaseResult .tc-filter-chip[data-category="${pick.category}"]`);
    await popup.waitForFunction(n => document.querySelectorAll('#testCaseResult .tc-detail').length === n, Math.min(pick.count, 100), { timeout: 5000 });
    const shownCategories = await popup.$$eval('#testCaseResult .tc-detail > p:first-of-type', els => [...new Set(els.map(el => el.textContent.match(/Category: (.*?) ·/)[1]))]);
    assert.deepEqual(shownCategories, [pick.category], 'only the picked type is listed');
    assert.equal(await popup.getAttribute(`#testCaseResult .tc-filter-chip[data-category="${pick.category}"]`, 'aria-pressed'), 'true');
    assert.match(await popup.textContent('#testCaseResult .tc-filter-status'), new RegExp(`Showing ${pick.count} ${pick.category} case`));
    await popup.click('#testCaseResult .tc-filter-chip[data-category="all"]');
    await popup.waitForFunction(n => document.querySelectorAll('#testCaseResult .tc-detail').length === n, total, { timeout: 5000 });
    // Filtering does not shrink the export.
    await popup.click(`#testCaseResult .tc-filter-chip[data-category="${pick.category}"]`);
    await popup.click('#exportTcCsvBtn');
    await popup.waitForFunction(() => window.__downloads.length >= 1, null, { timeout: 10000 });
    const csv = (await downloads()).find(f => f.filename.endsWith('.csv'));
    assert.ok(csv.text.trim().split('\n').length - 1 >= chips[0].count, 'CSV still has every case');
  } finally { await env.close(); }
});

test('page actions: finds Save, never clicks Delete, and dry run does not click anything', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/actions');
    await popup.evaluate(() => { document.getElementById('actionDetails').open = true; });
    await popup.click('#scanActionButtonsBtn');
    await popup.waitForSelector('#actionButtonPreview:not(.hidden)', { timeout: 20000 });
    const preview = (await popup.textContent('#actionButtonPreview')).toLowerCase();
    assert.ok(preview.includes('1 safe page action'), preview);
    assert.ok(preview.includes('save'), preview);
    // Delete must appear only in the excluded (risky) list, never as a runnable action.
    assert.ok(preview.includes('excluded') && preview.indexOf('delete') > preview.indexOf('excluded'), preview);
    assert.equal(await popup.isChecked('#actionDryRunToggle'), true, 'dry run is on by default');
    await popup.click('#pageActionBtn');
    await popup.waitForSelector('#pageActionResult:not(.hidden)', { timeout: 30000 });
    const counts = await site.evaluate(() => ({ saves: window.saves || 0, deletes: window.deletes || 0 }));
    assert.deepEqual(counts, { saves: 0, deletes: 0 }, 'dry run must not click');
  } finally { await env.close(); }
});

test('Full QA run downloads a JSON and an HTML report describing the run', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/modal');
    const downloads = await captureDownloads(popup);
    await popup.click('#fullQaModeButton');
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 120000 });
    await popup.waitForFunction(() => window.__downloads.length >= 2, null, { timeout: 10000 });
    const files = await downloads();
    const json = files.find(f => f.filename.endsWith('.json'));
    const html = files.find(f => f.filename.endsWith('.html'));
    assert.ok(json && html, JSON.stringify(files.map(f => f.filename)));
    const report = JSON.parse(json.text);
    assert.equal(report.mode, 'full-qa');
    assert.ok(report.fieldsDetected >= 7, `fieldsDetected ${report.fieldsDetected}`);
    assert.equal(report.submit.clicked, false, 'Full QA must not submit unless explicitly enabled');
    assert.ok(html.text.includes('QA Report'));
  } finally { await env.close(); }
});

test('file uploads: a stored, mapped test file is attached to the matching upload field', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/upload');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await popup.evaluate(() => { document.getElementById('filesDetails').open = true; });
    await popup.setInputFiles('#fileInput', { name: 'avatar.png', mimeType: 'image/png', buffer: png });
    await popup.waitForSelector('#fileList .file-item', { timeout: 10000 });
    const fileId = await popup.evaluate(async () => (await SFFAStorage.getFiles())[0].id);
    await popup.evaluate(async id => SFFAStorage.addMappingFile('photo', id), fileId);
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
    const attached = await site.evaluate(() => [...document.querySelector('input[type=file]').files].map(f => ({ name: f.name, size: f.size })));
    assert.equal(attached.length, 1, `status: ${await popup.textContent('#fillStatus')}`);
    assert.equal(attached[0].name, 'avatar.png');
    assert.equal(attached[0].size, png.length);
  } finally { await env.close(); }
});

test('file uploads: cards with only a "Browse Files" button get their own mapped file; "Replace" inputs are left alone', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/doc-cards');
    const pdf = Buffer.from('%PDF-1.4 test');
    await popup.evaluate(() => { document.getElementById('filesDetails').open = true; });
    await popup.setInputFiles('#fileInput', [
      { name: 'moa.pdf', mimeType: 'application/pdf', buffer: pdf },
      { name: 'financials.pdf', mimeType: 'application/pdf', buffer: pdf },
      { name: 'pan.pdf', mimeType: 'application/pdf', buffer: pdf }
    ]);
    await popup.waitForFunction(() => document.querySelectorAll('#fileList .file-item').length === 3, null, { timeout: 10000 });
    await popup.evaluate(async () => {
      const files = await SFFAStorage.getFiles();
      const id = name => files.find(f => f.name === name).id;
      await SFFAStorage.addMappingFile('moaAoa', id('moa.pdf'));
      await SFFAStorage.addMappingFile('financialStatement', id('financials.pdf'));
      await SFFAStorage.addMappingFile('identityDocument', id('pan.pdf'));
    });
    // The scan lists each card by its heading.
    const scanText = await scan(popup);
    assert.match(scanText, /MOA & AOA/);
    assert.match(scanText, /Financial Statements for Last Three Years/);
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
    const uploads = await site.evaluate(() => window.uploads);
    assert.deepEqual(uploads.map(u => `${u.doc}:${u.name}`).sort(), ['fin:financials.pdf', 'moa:moa.pdf'], `status: ${await popup.textContent('#fillStatus')}`);
    assert.deepEqual(await site.evaluate(() => window.replaced), [], 'an already uploaded document is never replaced');
    assert.equal(await site.locator('#pending .card').count(), 0, 'both pending cards moved to Uploaded');
    assert.equal(await site.isChecked('#consent'), true, 'the consent box is ticked after the uploads that cleared it');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('checkbox options in a plain container (no fieldset, no name) are ticked; "None of the above" is not', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/sectors');
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
    const selected = await site.evaluate(() => [...window.selected].sort());
    assert.deepEqual(selected, ['Banking', 'Healthcare', 'Telecom'], `status: ${await popup.textContent('#fillStatus')}`);
    assert.equal(await site.isChecked('#sectors label:last-child input'), false, 'None of the above stays unticked');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('file uploads: a field with no recognised type gets an unused stored file in an accepted format', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/choose-file');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await popup.evaluate(() => { document.getElementById('filesDetails').open = true; });
    await popup.setInputFiles('#fileInput', [
      { name: 'avatar.png', mimeType: 'image/png', buffer: png },
      { name: 'resolution.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }
    ]);
    await popup.waitForFunction(() => document.querySelectorAll('#fileList .file-item').length === 2, null, { timeout: 10000 });
    await popup.evaluate(async () => {
      const files = await SFFAStorage.getFiles();
      await SFFAStorage.addMappingFile('photo', files.find(f => f.name === 'avatar.png').id);
    });
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
    assert.deepEqual(await site.evaluate(() => window.got), ['resolution.pdf'], `status: ${await popup.textContent('#fillStatus')}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('security scan: Copy report copies the complete current report; a normal scan hides it', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/insecure');
    await popup.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = async text => { window.__copied.push(text); }; });
    await popup.click('#securityScanBtn');
    await popup.waitForSelector('#securityScanActions:not(.hidden)', { timeout: 30000 });
    assert.match(await popup.textContent('#scanResult'), /How to fix:/, 'fixes are shown in the popup too');
    await popup.click('#copySecurityScanBtn');
    await popup.waitForFunction(() => window.__copied.length === 1, null, { timeout: 5000 });
    const report = await popup.evaluate(() => window.__copied[0]);
    for (const part of [/SECURITY SCAN REPORT/, /Page: +Login — https?:\/\/[^\s?]+\/insecure/, /Scanned: +\S/, /Score: +\d+\/100/, /Findings: +\d+ \(/,
      /1\. \[(High|Medium|Low)\] /, /What was found: /, /How to fix: +\S/, /OWASP: A\d\d:2021/, /Seen 2 times/, /About this scan: a passive check/]) {
      assert.match(report, part, `report contains ${part}`);
    }
    // One entry per finding type: three scripts without SRI are listed under one finding.
    assert.equal((report.match(/\] CDN script without SRI/g) || []).length, 1, 'no duplicate entries');
    assert.match(report, /Affected \(3\):\n +- \S+\/lib\/a\.js\n +- \S+\/lib\/b\.js\n +- \S+\/lib\/c\.js/);
    const titles = [...report.matchAll(/^\d+\. \[\w+\] (.+)$/gm)].map(m => m[1]);
    assert.equal(new Set(titles).size, titles.length, `duplicate titles: ${titles.join(' | ')}`);
    // Findings are ordered most severe first.
    const severities = [...report.matchAll(/^\d+\. \[(\w+)\]/gm)].map(m => m[1]);
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
    assert.deepEqual(severities, [...severities].sort((a, b) => rank[a] - rank[b]));
    // A normal scan replaces the results: the old security report can no longer be copied.
    await scan(popup);
    assert.equal(await popup.isVisible('#copySecurityScanBtn'), false);
  } finally { await env.close(); }
});

test('header: the page chip shows the current page and follows every page change', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/modal');
    const chip = () => popup.textContent('#pageHostChip');
    await popup.waitForFunction(() => /\/modal$/.test(document.getElementById('pageHostChip').textContent), null, { timeout: 10000 });
    assert.match(await chip(), /^[\w.-]+\/modal$/, 'host and path, no query string');
    // Single-page-app step: the address changes without a reload.
    await site.evaluate(() => window.history.pushState({}, '', '/modal/step-2?token=secret'));
    await popup.waitForFunction(() => /\/modal\/step-2$/.test(document.getElementById('pageHostChip').textContent), null, { timeout: 10000 });
    assert.doesNotMatch(await chip(), /token|secret/, 'query strings are never shown');
    // A normal move to another page.
    await site.goto(site.url().replace(/\/modal.*$/, '/links'));
    await popup.waitForFunction(() => /\/links$/.test(document.getElementById('pageHostChip').textContent), null, { timeout: 10000 });
    assert.match(await popup.getAttribute('#pageHostChip', 'title'), /\/links/, 'full address on hover');
  } finally { await env.close(); }
});

test('Wrong data: every value is tried on every field and judged; browser blocks and length limits count as passes', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/qa-form');
    await site.fill('#email', 'keep@example.com');
    await popup.check('input[name="qaMode"][value="negative"]', { force: true });
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillResult .scenario-results', { timeout: 90000 });
    const results = await popup.$$eval('#fillResult .scenario-field', fields => fields.map(f => ({
      field: f.querySelector('summary span:nth-child(2)').textContent,
      cases: [...f.querySelectorAll('.scenario-case')].map(c => ({ result: c.className.replace(/.*is-/, ''), scenario: c.querySelector('strong').textContent, note: c.querySelector('.scenario-note').textContent }))
    })));
    const field = name => results.find(r => r.field.includes(name))?.cases || [];
    // All values per field, not one: email has 4, PAN 5, PIN code 5.
    assert.equal(field('Email').length, 4, JSON.stringify(field('Email')));
    assert.equal(field('PAN').length, 5, JSON.stringify(field('PAN')));
    assert.equal(field('PIN').length, 5);
    // Field-specific wrong values exist.
    assert.ok(field('PAN').some(c => c.scenario === 'wrong order'));
    assert.ok(field('PIN').some(c => c.scenario === '5 digits'));
    // The page's own error message is detected for PAN.
    assert.ok(field('PAN').some(c => c.result === 'pass' && /valid PAN/.test(c.note)), JSON.stringify(field('PAN')));
    // The browser refuses letters in a number box: a pass, not skipped.
    assert.ok(field('Age').some(c => c.scenario === 'alphabetic' && c.result === 'pass' && /Browser blocked/.test(c.note)), JSON.stringify(field('Age')));
    // Over-long text stops at maxlength like real typing.
    assert.ok(field('Full name').length >= 4);
    // A required box left unticked is reported with the browser's message.
    assert.ok(field('agree').some(c => c.result === 'pass'), JSON.stringify(field('agree')));
    // The original values are put back afterwards.
    assert.equal(await site.inputValue('#email'), 'keep@example.com');
    assert.match(await popup.textContent('#fillStatus'), /cases · \d+ passed/);
  } finally { await env.close(); }
});

test('Edge cases: every limit value is tried and judged without false failures', async () => {
  const env = await launch();
  try {
    const { popup } = await env.open('/qa-form');
    await popup.check('input[name="qaMode"][value="boundary"]', { force: true });
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillResult .scenario-results', { timeout: 120000 });
    const age = await popup.$$eval('#fillResult .scenario-field', fields => {
      const f = fields.find(x => /Age/.test(x.querySelector('summary').textContent));
      return [...f.querySelectorAll('.scenario-case')].map(c => c.className.replace(/.*is-/, ''));
    });
    assert.equal(age.length, 12, 'all 12 number limits for Age');
    assert.ok(age.every(r => r === 'pass'), JSON.stringify(age));
    assert.equal(await popup.locator('#fillResult .scenario-case.is-fail').count(), 0, 'no false failures on a correct form');
  } finally { await env.close(); }
});

test('Wrong data, one field at a time: a chosen field is tested alone while the others hold correct values', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/qa-form');
    await site.fill('#email', 'keep@example.com');
    await popup.check('input[name="qaMode"][value="negative"]', { force: true });
    await popup.waitForFunction(() => [...document.querySelectorAll('#qaTargetField option')].some(o => /PAN/.test(o.textContent)), null, { timeout: 10000 });
    assert.equal(await popup.inputValue('#qaTestStyle'), 'one', 'one field at a time by default');
    const panKey = await popup.$eval('#qaTargetField', s => [...s.options].find(o => /PAN/.test(o.textContent)).value);
    await popup.selectOption('#qaTargetField', panKey);
    // Watch the other fields while the PAN cases run: they must hold correct (non-empty) values.
    await site.evaluate(() => { window.__emailDuring = new Set(); document.getElementById('pan').addEventListener('input', () => window.__emailDuring.add(document.getElementById('email').value)); });
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillResult .scenario-results', { timeout: 90000 });
    const fields = await popup.$$eval('#fillResult .scenario-field summary span:nth-child(2)', els => els.map(e => e.textContent));
    assert.deepEqual(fields.map(f => /PAN/.test(f)), [true], `only PAN tested: ${fields}`);
    assert.equal(await popup.locator('#fillResult .scenario-case').count(), 5, 'all 5 PAN values');
    const during = await site.evaluate(() => [...window.__emailDuring]);
    assert.ok(during.length && during.every(v => /@/.test(v)), `email held a correct value during PAN cases: ${during}`);
    assert.match(await popup.textContent('#fillResult'), /one field at a time/);
    assert.equal(await site.inputValue('#email'), 'keep@example.com', 'original values put back');
  } finally { await env.close(); }
});

test('Wrong data with "Click Save": on-save errors are seen, and a field the form never checks is reported', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/save-check');
    await popup.check('input[name="qaMode"][value="negative"]', { force: true });
    await popup.waitForFunction(() => !document.getElementById('qaOneByOne').hidden);
    await popup.check('#qaClickSubmit');
    await popup.click('#fillFormBtn');
    await popup.waitForSelector('#fillResult .scenario-results', { timeout: 120000 });
    const cases = name => popup.$$eval('#fillResult .scenario-field', (fields, n) => {
      const f = fields.find(x => x.querySelector('summary').textContent.includes(n));
      return f ? [...f.querySelectorAll('.scenario-case')].map(c => ({ result: c.className.replace(/.*is-/, ''), note: c.querySelector('.scenario-note').textContent })) : [];
    }, name);
    const email = await cases('Email');
    assert.equal(email.length, 4);
    assert.ok(email.every(c => c.result === 'pass' && /after clicking "Save"/.test(c.note)), JSON.stringify(email));
    const mobile = await cases('Mobile');
    assert.ok(mobile.some(c => c.result === 'fail' && /accepted this value/.test(c.note)), JSON.stringify(mobile));
    // Only wrong mobile numbers were ever saved: correct data is never submitted by this mode.
    const saved = await site.evaluate(() => window.saved);
    assert.ok(saved.length > 0 && saved.every(r => !/^[6-9]\d{9}$/.test(r.mobile)), JSON.stringify(saved));
    // The choice is remembered.
    await popup.reload();
    await popup.check('input[name="qaMode"][value="negative"]', { force: true });
    assert.equal(await popup.isChecked('#qaClickSubmit'), true);
  } finally { await env.close(); }
});

test('without site access, page buttons stay clickable and ask Chrome for access when clicked', async () => {
  const env = await launch({ hostAccess: false });
  try {
    const { popup } = await env.open('/modal');
    assert.equal((await popup.textContent('#pageHostChip')).trim(), 'Access needed');
    // Record the request (Playwright cannot click Chrome's own permission prompt).
    await popup.evaluate(() => {
      window.__requests = [];
      window.SFFAExt.permissions.request = async spec => { window.__requests.push(spec); return false; };
    });
    for (const id of ['scanPageBtn', 'fillFormBtn']) {
      assert.equal(await popup.isDisabled(`#${id}`), false, `#${id} must be clickable so it can ask for access`);
      await popup.click(`#${id}`);
      await popup.waitForTimeout(300);
    }
    const requests = await popup.evaluate(() => window.__requests);
    assert.equal(requests.length, 2, JSON.stringify(requests));
    assert.ok(requests.every(r => (r.origins || []).length), 'site access was requested');
    // Declining explains what happened and how to allow it later; nothing ran.
    assert.match(await popup.textContent('.toast'), /not granted|allow/i);
  } finally { await env.close(); }
});

test('viewport: "Apply to current page" resizes the live page and "Restore viewport" undoes it', async () => {
  const env = await launch(); // the real manifest: no permissions added for the test
  try {
    // A responsive page: without a viewport meta tag, mobile emulation correctly lays out at 980px like a real phone.
    const { site, popup } = await env.open('/responsive');
    const before = await site.evaluate(() => window.innerWidth);
    await popup.click('#tabSetupButton');
    await popup.evaluate(() => { for (const d of document.querySelectorAll('#tabSetup details.advanced-module')) d.open = true; });
    await popup.fill('#viewportWidth', '390');
    await popup.fill('#viewportHeight', '844');
    await popup.click('#applyViewportBtn');
    await site.waitForFunction(() => window.innerWidth === 390, null, { timeout: 15000 });
    assert.equal(await site.evaluate(() => window.innerHeight), 844);
    await popup.click('#restoreViewportBtn');
    // Restore removes the emulation; the page returns to the tab's real size. (Under Playwright that is
    // the headless window size, not Playwright's own 420px emulation, which the override replaced.)
    await site.waitForFunction(() => window.innerWidth !== 390 && window.innerHeight !== 844, null, { timeout: 15000 });
    assert.ok(before > 0);
  } finally { await env.close(); }
});

test('viewport stays applied across reloads and navigation until "Restore viewport"', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/responsive');
    await popup.click('#tabSetupButton');
    await popup.evaluate(() => { for (const d of document.querySelectorAll('#tabSetup details.advanced-module')) d.open = true; });
    await popup.fill('#viewportWidth', '390');
    await popup.fill('#viewportHeight', '844');
    await popup.click('#applyViewportBtn');
    await site.waitForFunction(() => window.innerWidth === 390, null, { timeout: 15000 });
    // Reload the page: the size must stay.
    await site.reload();
    await site.waitForLoadState('load');
    await site.waitForTimeout(1500);
    assert.deepEqual(await site.evaluate(() => [window.innerWidth, window.innerHeight]), [390, 844], 'kept after reload');
    // Navigate to another page on the same tab: the size must stay.
    await site.goto(`${ORIGIN}/responsive?step=2`);
    await site.waitForTimeout(1500);
    assert.deepEqual(await site.evaluate(() => [window.innerWidth, window.innerHeight]), [390, 844], 'kept after navigation');
    // Only Restore viewport ends it, and the debugger is released (Chrome's "debugging" bar goes away).
    const tabId = await popup.evaluate(() => window.getActiveTab().then(t => t.id));
    await popup.click('#restoreViewportBtn');
    await site.waitForFunction(() => window.innerWidth !== 390, null, { timeout: 15000 });
    await popup.waitForTimeout(500);
    assert.equal(await extensionStillAttached(popup, tabId), false, 'debugger released after Restore viewport');
  } finally { await env.close(); }
});

test('network profile stays applied across reloads until "Restore normal", which releases the debugger', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/responsive');
    const tabId = await popup.evaluate(() => window.getActiveTab().then(t => t.id));
    assert.equal((await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_NETWORK_PROFILE', tabId: id, profile: 'slow' }), tabId)).ok, true);
    await site.reload();
    await site.waitForTimeout(1500);
    assert.equal(await extensionStillAttached(popup, tabId), true, 'throttling session kept after reload');
    assert.equal((await popup.evaluate(id => window.sendRuntimeMessage({ type: 'SFFA_NETWORK_PROFILE', tabId: id, profile: 'normal' }), tabId)).ok, true);
    await popup.waitForTimeout(500);
    assert.equal(await extensionStillAttached(popup, tabId), false, 'debugger released after Restore normal');
  } finally { await env.close(); }
});

test('viewport presets: phone and desktop presets emulate the real device; rotate swaps; choice is remembered', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/responsive');
    await popup.click('#tabSetupButton');
    const openViewport = () => popup.evaluate(() => { for (const d of document.querySelectorAll('#tabSetup details.advanced-module')) d.open = true; });
    await openViewport();
    // Phone preset: size, pixel density and touch, like Chrome DevTools device mode.
    await popup.selectOption('#viewportPreset', 'iphone-14');
    assert.equal(await popup.inputValue('#viewportWidth'), '390');
    assert.equal(await popup.inputValue('#viewportHeight'), '844');
    await popup.click('#applyViewportBtn');
    await site.waitForFunction(() => window.innerWidth === 390, null, { timeout: 15000 });
    const phone = await site.evaluate(() => ({ h: window.innerHeight, dpr: window.devicePixelRatio, touch: navigator.maxTouchPoints > 0, coarse: window.matchMedia('(pointer: coarse)').matches }));
    assert.deepEqual(phone, { h: 844, dpr: 3, touch: true, coarse: true });
    // Rotate to landscape.
    await popup.click('#viewportRotateBtn');
    assert.equal(await popup.inputValue('#viewportWidth'), '844');
    await popup.click('#applyViewportBtn');
    await site.waitForFunction(() => window.innerWidth === 844 && window.innerHeight === 390, null, { timeout: 15000 });
    // Desktop preset: no touch, pixel density 1.
    await popup.selectOption('#viewportPreset', 'laptop-1366');
    await popup.click('#applyViewportBtn');
    await site.waitForFunction(() => window.innerWidth === 1366, null, { timeout: 15000 });
    assert.deepEqual(await site.evaluate(() => ({ dpr: window.devicePixelRatio, touch: navigator.maxTouchPoints > 0 })), { dpr: 1, touch: false });
    // Remembered after reopening the popup.
    await popup.reload();
    await popup.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''));
    assert.equal(await popup.inputValue('#viewportPreset'), 'laptop-1366');
    assert.equal(await popup.inputValue('#viewportWidth'), '1366');
    await popup.click('#tabSetupButton');
    await openViewport();
    await popup.click('#restoreViewportBtn');
    await site.waitForFunction(() => window.innerWidth !== 1366, null, { timeout: 15000 });
  } finally { await env.close(); }
});

test('element picker: the "Element selected" card is shown in the extension, never on the page', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/actions');
    const openActions = () => popup.evaluate(() => { document.getElementById('actionDetails').open = true; });
    const pick = async () => {
      await openActions();
      await popup.click('#pickElementBtn');
      await popup.waitForTimeout(400);
      await site.hover('#save');
      await site.click('#save');
    };
    // 1. Pick in dry run: card appears in the extension; nothing is drawn on the website.
    await pick();
    await popup.waitForSelector('#pickedElementCard:not([hidden])', { timeout: 10000 });
    assert.equal(await site.locator('#__sffa_picker_panel').count(), 0, 'no panel on the website');
    const card = (await popup.textContent('#pickedElementCard')).toLowerCase();
    assert.ok(card.includes('element selected') && card.includes('save') && card.includes('matches found'), card);
    // 2. Run in dry run: result shown in the card, nothing clicked.
    await popup.click('#pickedRunBtn');
    await popup.waitForFunction(() => /nothing was clicked/i.test(document.getElementById('pickedElementCard').textContent), null, { timeout: 15000 });
    assert.equal(await site.evaluate(() => window.saves || 0), 0);
    // 3. Pick again, close and reopen the extension: the card is still there.
    await pick();
    await popup.waitForSelector('#pickedElementCard:not([hidden])', { timeout: 10000 });
    await popup.reload();
    await popup.waitForSelector('#pickedElementCard:not([hidden])', { timeout: 10000 });
    // Dry run off, then really click.
    await openActions();
    await popup.click('label:has(#actionDryRunToggle)');
    if (await popup.isVisible('#confirmDialog')) await popup.click('#confirmOk');
    await popup.click('#pickedRunBtn');
    await popup.waitForFunction(() => /clicked/i.test(document.getElementById('pickedElementCard').textContent) && !/nothing was clicked/i.test(document.getElementById('pickedElementCard').textContent), null, { timeout: 15000 });
    assert.equal(await site.evaluate(() => window.saves || 0), 1, 'Save clicked exactly once');
    assert.equal(await site.evaluate(() => window.deletes || 0), 0);
    assert.equal(await site.locator('#__sffa_picker_panel').count(), 0);
  } finally { await env.close(); }
});

test('element picker: many matches are clicked one by one with the chosen wait, survive re-renders, and Stop is immediate', async () => {
  const env = await launch();
  try {
    const { site, popup } = await env.open('/rows');
    const cardText = () => popup.textContent('#pickedElementCard');
    const pick = async () => {
      await popup.evaluate(() => { document.getElementById('actionDetails').open = true; });
      await popup.click('#pickElementBtn');
      await popup.waitForTimeout(400);
      await site.hover('.row-save[data-row="2"]');
      await site.click('.row-save[data-row="2"]');
      await popup.waitForSelector('#pickedElementCard:not([hidden]) #pickedIntervalSelect', { timeout: 10000 });
    };
    await pick();
    assert.match(await cardText(), /Matches found\s*4/);
    assert.equal(await popup.inputValue('#pickedIntervalSelect'), '1000', '1 second by default');
    assert.match(await popup.textContent('#pickedIntervalHint'), /4 clicks take about/);

    // Dry run off, 1 s apart: all four rows are clicked in order even though each click re-renders the list.
    await popup.click('label:has(#actionDryRunToggle)');
    if (await popup.isVisible('#confirmDialog')) await popup.click('#confirmOk');
    await popup.waitForSelector('#pickedIntervalSelect');
    await popup.selectOption('#pickedIntervalSelect', '1000');
    await popup.click('#pickedRunBtn');
    await popup.waitForFunction(() => /Done: 4\/4 clicked/.test(document.getElementById('pickedElementCard').textContent), null, { timeout: 30000 });
    const clicks = await site.evaluate(() => window.clicks);
    assert.deepEqual(clicks.map(c => c.row), [1, 2, 3, 4], 'every row clicked once, top to bottom');
    for (let i = 1; i < clicks.length; i++) assert.ok(clicks[i].at - clicks[i - 1].at >= 950, `gap ${i} was ${clicks[i].at - clicks[i - 1].at}ms`);
    assert.match(await popup.textContent('#pickedRunBtn'), /Click all again \(4\)/, 'the pick can be run again');

    // The choice is remembered for the next pick.
    await popup.selectOption('#pickedIntervalSelect', '10000');
    await popup.reload();
    await popup.waitForSelector('#pickedIntervalSelect', { timeout: 10000 });
    await popup.waitForFunction(() => document.getElementById('pickedIntervalSelect').value === '10000', null, { timeout: 5000 });

    // Long wait + Stop: stops during the wait, without finishing the countdown.
    await site.evaluate(() => { window.clicks = []; });
    await popup.click('#pickedRunBtn');
    await popup.waitForFunction(() => /next click in \d+s/.test(document.getElementById('pickedElementCard').textContent), null, { timeout: 10000 });
    const stopAt = Date.now();
    await popup.click('#pickedCancelBtn');
    await popup.waitForFunction(() => /Stopped after 1\/4 clicked/.test(document.getElementById('pickedElementCard').textContent), null, { timeout: 5000 });
    assert.ok(Date.now() - stopAt < 3000, 'Stop does not wait for the 10 s interval');
    assert.equal((await site.evaluate(() => window.clicks)).length, 1);

    // The buttons disappear: the card offers "Pick again" instead of a run that can only fail.
    await site.evaluate(() => { document.getElementById('list').innerHTML = '<p>Saved</p>'; });
    await popup.click('#pickedRunBtn');
    await popup.waitForFunction(() => /no longer on the page/i.test(document.getElementById('pickedElementCard').textContent), null, { timeout: 10000 });
    assert.match(await popup.textContent('#pickedRunBtn'), /Pick again/);
  } finally { await env.close(); }
});
