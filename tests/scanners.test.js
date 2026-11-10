const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow } = require('./helpers');

// ---------------- Security scanner ----------------
/** Loads the security scanner on an HTTPS test page with the given body. */
function securityScan(html, setup = () => {}) {
  const window = loadWindow(['content/security-scanner.js'], `<!doctype html><html><body>${html}</body></html>`);
  setup(window);
  return window.SFFASecurityScanner.scan();
}
const ids = result => result.findings.map(f => f.id);

test('security: a clean HTTPS form scores high with no high-severity findings', () => {
  const result = securityScan('<main><form action="/save"><input type="hidden" name="csrf_token" value="x"><label>Name <input name="n"></label><button>Save</button></form></main>');
  assert.ok(result.score >= 90, `score ${result.score}`);
  assert.equal(result.findings.filter(f => f.severity === 'High').length, 0, JSON.stringify(ids(result)));
});

test('security: forms posting to plain HTTP are flagged', () => {
  assert.ok(ids(securityScan('<form action="http://insecure.test/save"><input name="q"></form>')).includes('mixed-form'));
});

test('security: new-tab links without rel=noopener are flagged; with it they are not', () => {
  assert.ok(ids(securityScan('<a href="https://x.test" target="_blank">x</a>')).includes('blank-target-noopener'));
  assert.ok(!ids(securityScan('<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>')).includes('blank-target-noopener'));
});

test('security: secret-like values are reported without exposing the value', () => {
  const result = securityScan('<input name="api_key" value="sk-live-ABCDEF1234567890">');
  assert.ok(ids(result).includes('visible-secret-like-data'));
  assert.ok(!JSON.stringify(result).includes('sk-live-ABCDEF1234567890'), 'secret value must not appear in the result');
});

test('security: secret-looking browser storage keys are named, but their values never appear', () => {
  const result = securityScan('<p>x</p>', window => window.localStorage.setItem('auth_token', 'eyJSECRETVALUE.payload.sig'));
  const finding = result.findings.find(f => f.id === 'sensitive-storage');
  assert.ok(finding, JSON.stringify(ids(result)));
  assert.match(finding.description, /auth_token/);
  assert.ok(!JSON.stringify(result).includes('eyJSECRETVALUE'));
});

test('security: repeated findings are grouped and scored once', () => {
  const result = securityScan('<button onclick="a()">1</button><button onclick="b()">2</button><div onmouseover="c()">3</div>');
  const inline = result.findings.filter(f => f.id === 'inline-handler');
  assert.equal(inline.length, 1);
  assert.equal(inline[0].occurrences, 3);
});

// ---------------- Accessibility scanner ----------------
/** Runs the accessibility scanner on the given body markup. */
function a11yScan(html) {
  // Same order as the extension: the scanner takes accessible names from the selector engine.
  const window = loadWindow(['utils/deep-dom.js', 'utils/selector-engine.js', 'content/accessibility-scanner.js'], `<!doctype html><html><body>${html}</body></html>`);
  return window.SFFAA11yScanner.scan();
}
const a11yIds = result => result.findings.map(f => f.id);

test('a11y: unlabeled form controls and images without alt are reported', () => {
  const found = a11yIds(a11yScan('<main><input name="q"><img src="logo.png"></main>'));
  assert.ok(found.includes('missing-accessible-name'), JSON.stringify(found));
  assert.ok(found.includes('image-missing-alt'), JSON.stringify(found));
});

test('a11y: labelled controls, decorative images and a main landmark produce no such findings', () => {
  const found = a11yIds(a11yScan('<main><h1>Title</h1><label>Search <input name="q"></label><img src="x.png" alt=""><button>Go</button></main>'));
  for (const id of ['missing-accessible-name', 'image-missing-alt', 'missing-main-landmark']) assert.ok(!found.includes(id), `${id} in ${JSON.stringify(found)}`);
});

test('a11y: duplicate ids, positive tabindex and skipped heading levels are reported', () => {
  const found = a11yIds(a11yScan('<main><h1>A</h1><h3>C</h3><div id="x"></div><div id="x"></div><button tabindex="3">B</button></main>'));
  for (const id of ['duplicate-id', 'positive-tabindex', 'heading-level-skip']) assert.ok(found.includes(id), `${id} missing from ${JSON.stringify(found)}`);
});

test('a11y: clickable non-semantic elements and custom controls without focus are reported', () => {
  const found = a11yIds(a11yScan('<main><div onclick="go()">Click me</div><div role="button">Fake</div></main>'));
  assert.ok(found.includes('click-handler-nonsemantic') || found.includes('custom-control-not-keyboard-focusable'), JSON.stringify(found));
  assert.ok(found.includes('custom-control-not-keyboard-focusable'), JSON.stringify(found));
});

test('a11y: a page without a main landmark is reported once', () => {
  const result = a11yScan('<div><p>Hello</p></div>');
  assert.equal(result.findings.filter(f => f.id === 'missing-main-landmark').length, 1);
});

// ---------------- Selector engine ----------------
const engine = html => {
  const window = loadWindow(['utils/selector-engine.js'], `<!doctype html><html><body>${html}</body></html>`);
  return { window, inspect: el => window.SFFASelectorEngine.inspect(el) };
};

test('selectors: test attributes beat id, and id beats a CSS path', () => {
  const { window, inspect } = engine('<input id="e" data-qa="email-field" name="email"><input id="plain"><div><span><input></span></div>');
  assert.equal(inspect(window.document.querySelector('[data-qa]')).selector, '[data-qa="email-field"]');
  assert.equal(inspect(window.document.getElementById('plain')).strategy, 'id');
  assert.equal(inspect(window.document.querySelector('span input')).strategy, 'CSS path');
});

test('selectors: values with quotes and line breaks are escaped and still unique', () => {
  const { window, inspect } = engine('<input data-testid=\'say "hi"\'><input data-testid="other">');
  const result = inspect(window.document.querySelector('input'));
  assert.equal(result.unique, true);
  assert.equal(window.document.querySelectorAll(result.selector).length, 1, `selector ${result.selector} must match exactly one element`);
});

test('selectors: a duplicate id is not used; the fallback selector targets exactly the right element', () => {
  const { window, inspect } = engine('<input id="dup"><input id="dup">');
  const second = window.document.querySelectorAll('input')[1];
  const result = inspect(second);
  assert.notEqual(result.strategy, 'id', 'an ambiguous id must not be chosen');
  assert.equal(window.document.querySelectorAll(result.selector).length, 1);
  assert.equal(window.document.querySelector(result.selector), second);
});

test('selectors: labelled controls get a Playwright role or label locator', () => {
  const { window, inspect } = engine('<label for="n">Full name</label><input id="n" name="fullname"><button aria-label="Save draft">S</button>');
  assert.match(inspect(window.document.querySelector('button')).playwrightLocator, /getByRole\("button", \{ name: "Save draft" \}\)|getByLabel/);
});
