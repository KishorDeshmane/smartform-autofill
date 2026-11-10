const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { ROOT, loadWindow } = require('./helpers');

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const chrome = JSON.parse(read('manifest.json'));
const firefox = JSON.parse(read('manifest.firefox.json'));

test('every file referenced by both manifests exists', () => {
  for (const manifest of [chrome, firefox]) {
    const files = [
      ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}),
      manifest.action?.default_popup, manifest.options_page, manifest.side_panel?.default_path,
      manifest.background?.service_worker, ...(manifest.background?.scripts || [])
    ].filter(Boolean);
    for (const file of files) assert.ok(exists(file), `${manifest.name}: missing ${file}`);
  }
});

test('the service worker imports only files that exist', () => {
  const sw = read('background/service-worker.js');
  for (const [, file] of sw.matchAll(/importScripts\(([^)]*)\)/g)) {
    for (const [, rel] of file.matchAll(/'([^']+)'/g)) assert.ok(exists(path.join('background', rel)), `missing ${rel}`);
  }
});

test('every script and stylesheet in popup.html and options.html exists', () => {
  for (const page of ['popup/popup.html', 'options/options.html']) {
    const html = read(page);
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css))"/g)) {
      assert.ok(exists(path.join(path.dirname(page), ref)), `${page}: missing ${ref}`);
    }
  }
});

test('page scripts: every file exists, core loads first, dynamic-fields last, all runtime modules included', () => {
  const window = loadWindow([]);
  window.chrome = { runtime: { id: 't', getURL: p => p } };
  window.eval(read('utils/ext.js'));
  const list = [...window.SFFAExt.contentScripts];
  for (const file of list) assert.ok(exists(file), `missing ${file}`);
  assert.equal(new Set(list).size, list.length, 'no duplicates');
  const runtime = fs.readdirSync(path.join(ROOT, 'content', 'runtime')).map(f => `content/runtime/${f}`);
  for (const file of runtime) assert.ok(list.includes(file), `${file} is never injected`);
  const firstRuntime = list.findIndex(f => f.startsWith('content/runtime/'));
  assert.equal(list[firstRuntime], 'content/runtime/core.js');
  assert.equal(list.at(-1), 'content/runtime/dynamic-fields.js');
  // Libraries must load before the modules that use them.
  const before = (a, b) => assert.ok(list.indexOf(a) < list.indexOf(b), `${a} must load before ${b}`);
  before('utils/ext.js', 'utils/storage.js');
  before('utils/selector-engine.js', 'content/accessibility-scanner.js');
  before('utils/deep-dom.js', 'content/qa-engine.js');
  before('content/form-detector.js', 'content/form-filler.js');
  before('content/qa-engine.js', 'content/runtime/core.js');
});

test('versions match across package.json and both manifests', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(chrome.version, pkg.version);
  assert.equal(firefox.version, pkg.version);
});

test('the Firefox manifest does not request Chromium-only permissions', () => {
  const all = [...(firefox.permissions || []), ...(firefox.optional_permissions || [])];
  for (const permission of ['debugger', 'sidePanel']) assert.ok(!all.includes(permission), `firefox requests ${permission}`);
  assert.ok(firefox.browser_specific_settings?.gecko?.id, 'gecko id present');
});

test('Chrome manifest: debugger is install-time (Chrome rejects it as optional); tabs and site access stay optional', () => {
  // chrome.permissions.request({ permissions: ['debugger'] }) is rejected with "Only permissions specified in the
  // manifest may be requested" when debugger is listed as optional, so Viewport/Network/Screenshot could never work.
  assert.ok(chrome.permissions.includes('debugger'), 'debugger must be in "permissions"');
  assert.ok(!(chrome.optional_permissions || []).includes('debugger'), 'debugger must not be optional');
  assert.ok(!chrome.permissions.includes('tabs'), 'tabs must be optional');
  assert.ok(!(chrome.host_permissions || []).length, 'no host access by default');
  assert.match(chrome.content_security_policy.extension_pages, /script-src 'self'/);
});

test('the zip writer produces a valid archive: forward-slash paths, contents at the root, intact data', async () => {
  const { zipDirectory } = await import(path.join(ROOT, 'scripts', 'zip.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]:)/, 'file:///$1'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sffa-zip-'));
  fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
  const files = { 'manifest.json': '{"x":1}', 'a/b/deep.txt': 'hello '.repeat(200), 'a/blank.bin': '' };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, ...name.split('/')), content);
  const zipPath = path.join(os.tmpdir(), `sffa-test-${Date.now()}.zip`);
  await zipDirectory(dir, zipPath);
  const buf = fs.readFileSync(zipPath);
  // Parse the central directory.
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const seen = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(offset), 0x02014b50);
    const method = buf.readUInt16LE(offset + 10);
    const size = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const data = buf.subarray(localOffset + 30 + localNameLength, localOffset + 30 + localNameLength + size);
    seen[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    offset += 46 + nameLength;
  }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(files).sort());
  for (const name of Object.keys(seen)) assert.ok(!name.includes('\\'), `backslash in ${name}`);
  for (const [name, content] of Object.entries(files)) assert.equal(seen[name], content, `${name} round-trips`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
});

test('source files contain no raw U+2028/U+2029 characters (they silently break JavaScript)', () => {
  const bad = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'dist', 'screenshots', '.git'].includes(entry.name)) walk(rel); continue; }
      if (!/\.(m?js|html|css|json)$/.test(entry.name)) continue;
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (/[\u2028\u2029]/.test(text)) bad.push(rel);
    }
  };
  walk('.');
  assert.deepEqual(bad, []);
});

test('popup layout: Full QA card keeps title and subtitle in one text block; headers can wrap', () => {
  const html = read('popup/popup.html');
  const css = read('popup/popup.css');
  assert.match(html, /id="fullQaModeButton"[^>]*><span class="full-qa-text"><span class="full-qa-title">Full QA run<\/span><span class="full-qa-sub">/, 'Full QA card text must be a single grid item');
  assert.match(css, /\.card-header, \.fill-section-header \{[^}]*flex-wrap: wrap/, 'card headers must wrap on narrow panels');
  assert.match(css, /\.collapsible-summary, \.advanced-module-summary \{ flex-wrap: wrap; \}/, 'step headers must wrap on narrow panels');
  assert.match(css, /\.stat-grid \{[^}]*auto-fit/, 'scan tiles must adapt to the available width');
  assert.ok(JSON.parse(read('package.json')).scripts['verify:responsive'], 'responsive audit script is registered');
});
