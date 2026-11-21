// Captures real QA Kit screenshots for the team guide PDF (npm run guide:shots).
// Usage: node capture.mjs <projectDir> <outDir>
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [project, outDir] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(project, 'node_modules', 'playwright', 'index.mjs')).href);
await fs.mkdir(outDir, { recursive: true });
const ORIGIN = 'https://demo.qakit.test';

const FORM_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Customer registration</title><style>
  body{font:15px/1.5 "Segoe UI",system-ui,sans-serif;background:#f3f5f9;margin:0;color:#1d2433}
  header{background:#1f3a8a;color:#fff;padding:14px 32px;font-weight:600;font-size:17px}
  main{max-width:760px;margin:28px auto;background:#fff;border-radius:12px;padding:28px 32px;box-shadow:0 2px 12px rgb(0 0 0/.08)}
  h1{font-size:22px;margin:0 0 4px} p.sub{color:#5b6475;margin:0 0 22px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 20px}
  label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:13px}
  input,select{font:inherit;font-weight:400;padding:9px 11px;border:1px solid #c9d0dc;border-radius:8px}
  .full{grid-column:1/-1} fieldset{border:1px solid #c9d0dc;border-radius:8px;padding:10px 14px}
  fieldset label{flex-direction:row;font-weight:400;align-items:center;display:inline-flex;margin-right:16px}
  .upload{border:2px dashed #c9d0dc;border-radius:10px;padding:14px;text-align:center;color:#5b6475}
  .check{flex-direction:row;font-weight:400;align-items:center}
  button{background:#1f3a8a;color:#fff;border:0;border-radius:8px;padding:11px 22px;font:inherit;font-weight:600;margin-top:18px}
</style></head><body><header>Acme Bank · Test environment</header><main>
<h1>Customer registration</h1><p class="sub">All fields marked * are required.</p>
<form onsubmit="return false"><div class="grid">
<label>First name * <input name="firstName" required></label>
<label>Last name * <input name="lastName" required></label>
<label>Email address * <input type="email" name="email" required></label>
<label>Mobile number * <input name="mobile" required maxlength="10"></label>
<label>Date of birth * <input type="date" name="dob" required></label>
<label>PAN number * <input name="pan" required pattern="[A-Z]{5}[0-9]{4}[A-Z]"></label>
<label>State * <select name="state" required><option value="">Select state</option><option>Maharashtra</option><option>Karnataka</option><option>Delhi</option></select></label>
<label>City * <input name="city" required></label>
<label class="full">Address * <input name="address" required></label>
<fieldset class="full"><legend>Gender *</legend><label><input type="radio" name="gender" value="f" required> Female</label><label><input type="radio" name="gender" value="m"> Male</label><label><input type="radio" name="gender" value="o"> Other</label></fieldset>
<label class="full">Photo ID proof (PDF, JPG) * <div class="upload"><input type="file" name="idProof" accept=".pdf,.jpg,.jpeg,.png" required></div></label>
<label class="check full"><input type="checkbox" name="consent" required>&nbsp; I confirm the details above are correct.</label>
</div><button type="submit">Create account</button></form></main></body></html>`;

const DIST = path.join(project, 'dist', 'chrome');
const ext = await fs.mkdtemp(path.join(os.tmpdir(), 'qakit-guide-ext-'));
await fs.cp(DIST, ext, { recursive: true });
const manifestPath = path.join(ext, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
manifest.host_permissions = [`${ORIGIN}/*`];
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'qakit-guide-profile-'));

const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
try {
  await context.route(`${ORIGIN}/**`, route => {
    if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: FORM_PAGE });
    return route.fulfill({ status: 200, body: 'ok' });
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const id = new URL(worker.url()).host;

  // chrome://extensions with Developer mode on (install steps).
  const extPage = context.pages()[0] || await context.newPage();
  await extPage.setViewportSize({ width: 1100, height: 470 });
  await extPage.goto('chrome://extensions');
  await extPage.waitForTimeout(800);
  try {
    await extPage.evaluate(() => {
      const mgr = document.querySelector('extensions-manager');
      const toolbar = mgr.shadowRoot.querySelector('extensions-toolbar');
      const toggle = toolbar.shadowRoot.querySelector('#devMode');
      if (!toggle.checked) toggle.click();
    });
    await extPage.waitForTimeout(600);
  } catch (e) { console.warn('dev mode toggle not reached', e.message); }
  await extPage.screenshot({ path: path.join(outDir, 'install-extensions-page.png') });

  const site = await context.newPage();
  await site.goto(`${ORIGIN}/register`);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 440, height: 900 });
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''), null, { timeout: 15000 });
  await popup.evaluate(() => { localStorage.setItem('sffaWelcomeDismissed', '1'); document.getElementById('welcomeCard')?.setAttribute('hidden', ''); localStorage.setItem('sffaTheme', 'light'); document.documentElement.dataset.theme = 'light'; });
  await popup.waitForTimeout(600);
  await popup.screenshot({ path: path.join(outDir, 'panel-test-tab.png') });

  // Add a test file and map it (uploads).
  await popup.evaluate(() => { const d = document.getElementById('filesDetails'); if (d) d.open = true; });
  await popup.setInputFiles('#fileInput', [{ name: 'id-proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 demo') }]);
  await popup.waitForFunction(() => document.querySelectorAll('#fileList .file-item').length === 1, null, { timeout: 10000 });
  await popup.evaluate(async () => { const files = await SFFAStorage.getFiles(); await SFFAStorage.addMappingFile('identityDocument', files[0].id); });
  // Reload so the file card shows its mapping, then reopen the upload section.
  await popup.reload();
  await popup.waitForFunction(() => !/Finding your tab/.test(document.getElementById('pageHostChip')?.textContent || ''), null, { timeout: 15000 });
  await popup.evaluate(() => { const d = document.getElementById('filesDetails'); if (d) d.open = true; });
  await popup.waitForTimeout(800);
  const files = await popup.$('#filesDetails');
  if (files) { await files.scrollIntoViewIfNeeded(); await files.screenshot({ path: path.join(outDir, 'panel-upload-files.png') }); }

  // Scan.
  await popup.evaluate(() => window.scrollTo(0, 0));
  await popup.click('#scanPageBtn');
  await popup.waitForSelector('#scanResult .stat-tile, #scanResult .result-error', { timeout: 60000 });
  await popup.waitForTimeout(500);
  await popup.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await popup.evaluate(() => { const box = document.getElementById('scanResult'); const scroller = box.closest('.content, .app-scroll') || document.scrollingElement; scroller.scrollTop += box.getBoundingClientRect().top - 140; });
  await popup.waitForTimeout(400);
  await popup.screenshot({ path: path.join(outDir, 'panel-scan-result.png') });

  // Quick fill.
  await popup.click('#fillFormBtn');
  await popup.waitForSelector('#fillStatus.success, #fillStatus.warning, #fillStatus.error', { timeout: 60000 });
  await popup.waitForTimeout(800);
  await popup.evaluate(() => document.getElementById('fillStatus')?.scrollIntoView({ block: 'center' }));
  await popup.screenshot({ path: path.join(outDir, 'panel-after-fill.png') });
  await site.bringToFront();
  await site.setViewportSize({ width: 1000, height: 900 });
  await site.screenshot({ path: path.join(outDir, 'site-filled-form.png'), fullPage: true });

  // Modes (Wrong data selected to show its options).
  await popup.bringToFront();
  const modes = await popup.$('.mode-grid, .qa-mode-grid, [role="radiogroup"]');
  await popup.evaluate(() => window.scrollTo(0, 0));
  if (modes) { await modes.scrollIntoViewIfNeeded(); await modes.screenshot({ path: path.join(outDir, 'panel-modes.png') }); }

  // Output tab: generate test cases.
  await popup.click('#tabOutputButton');
  await popup.waitForTimeout(400);
  const gen = await popup.$('#generateTestCasesBtn');
  if (gen) { await gen.click(); await popup.waitForTimeout(2500); }
  await popup.evaluate(() => window.scrollTo(0, 0));
  await popup.screenshot({ path: path.join(outDir, 'panel-output-tab.png') });

  // Setup tab.
  await popup.click('#tabSetupButton');
  await popup.waitForTimeout(500);
  await popup.screenshot({ path: path.join(outDir, 'panel-setup-tab.png') });
  console.log('ok', (await fs.readdir(outDir)).join(', '));
} finally {
  await context.close();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  await fs.rm(ext, { recursive: true, force: true }).catch(() => {});
}
