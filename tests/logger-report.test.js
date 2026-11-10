const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow, loadWithChromeStorage } = require('./helpers');

// ---- Activity log ----
test('activity log keeps every entry written in parallel and caps at 300', async () => {
  const { window, data } = loadWithChromeStorage(['utils/ext.js', 'utils/logger.js']);
  await Promise.all(Array.from({ length: 25 }, (_, i) => window.SFFALogger.log(`entry ${i}`, 'info')));
  assert.equal(data.sffa_logs.length, 25, 'no lost log entries');
  for (let i = 0; i < 320; i++) await window.SFFALogger.log(`bulk ${i}`);
  const all = await window.SFFALogger.getAll();
  assert.equal(all.length, 300);
  assert.match(JSON.stringify(all.at(-1)), /bulk 319/);
});

test('clearing the activity log empties it', async () => {
  const { window } = loadWithChromeStorage(['utils/ext.js', 'utils/logger.js']);
  await window.SFFALogger.log('something');
  await window.SFFALogger.clear();
  assert.equal((await window.SFFALogger.getAll()).length, 0);
});

// ---- QA report redaction and HTML ----
const report = () => loadWindow(['utils/qa-report.js']).SFFAQAReport;

test('report sanitizer redacts sensitive keys at any depth', () => {
  const clean = report().sanitize({
    mode: 'full-qa', password: 'hunter2', nested: { apiKey: 'sk-1', list: [{ email: 'a@b.c', phone: '98765', note: 'ok' }] }, Authorization: 'Bearer abc'
  });
  assert.equal(clean.password, '[REDACTED]');
  assert.equal(clean.nested.apiKey, '[REDACTED]');
  assert.equal(clean.nested.list[0].email, '[REDACTED]');
  assert.equal(clean.nested.list[0].phone, '[REDACTED]');
  assert.equal(clean.nested.list[0].note, 'ok');
  assert.equal(clean.Authorization, '[REDACTED]');
  assert.equal(clean.mode, 'full-qa');
});

test('report sanitizer strips query strings and fragments from URLs and hides non-web schemes', () => {
  const { sanitize, sanitizeUrl } = report();
  assert.equal(sanitize({ pageUrl: 'https://app.test/p?token=abc#frag' }).pageUrl, 'https://app.test/p');
  assert.equal(sanitizeUrl('file:///C:/Users/me/secret.html'), 'file:[redacted]');
  assert.equal(sanitizeUrl('chrome-extension://abc/popup.html'), 'chrome-extension:[redacted]');
});

test('free text in reports has tokens and bearer credentials redacted', () => {
  const clean = report().sanitize({ notes: 'Called https://api.test/x?access_token=SECRET1&page=2 with Bearer SECRET2' });
  assert.ok(!clean.notes.includes('SECRET1') && !clean.notes.includes('SECRET2'), clean.notes);
  assert.match(clean.notes, /page=2/);
});

test('report sanitizer survives circular data', () => {
  const data = { name: 'x' };
  data.self = data;
  assert.equal(report().sanitize(data).self, '[Circular]');
});

test('HTML report escapes page-controlled text and shows the data seed', () => {
  const html = report().toHtml({
    mode: 'full-qa', dataSeed: 'seed-<b>1</b>',
    findings: [{ title: '<img src=x onerror=alert(1)>', severity: 'High', description: '<script>alert(1)</script>' }],
    cases: [{ id: 'TC-1', title: '"><svg onload=alert(1)>', steps: ['<iframe>'] }]
  });
  assert.ok(!/<script>alert|<img src=x|<svg onload|<iframe>/.test(html), 'no raw markup from data');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Data seed/);
  assert.match(html, /seed-&lt;b&gt;1&lt;\/b&gt;/);
});
