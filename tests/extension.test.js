const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadWindow(...files) {
  const dom = new JSDOM('<!doctype html><html><body><form><input id="email" name="email" data-testid="user-email" /></form></body></html>', {
    runScripts: 'outside-only', url: 'https://example.test/'
  });
  dom.window.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) };
  for (const file of files) dom.window.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  return dom.window;
}

test('selector engine returns a stable data-testid locator', () => {
  const window = loadWindow('utils/selector-engine.js');
  const input = window.document.querySelector('#email');
  const result = window.SFFASelectorEngine.inspect(input);
  assert.equal(result.selector, '[data-testid="user-email"]');
  assert.equal(result.unique, true);
  assert.match(result.playwrightLocator, /getByTestId/);
});

test('data generator creates valid Aadhaar and location values', async () => {
  const window = loadWindow('utils/data-generator.js');
  const aadhaar = window.SFFADataGenerator.generateAadhaar();
  assert.match(aadhaar, /^\d{12}$/);
  const location = window.SFFADataGenerator.generateLocation();
  assert.ok(location.state);
  assert.ok(location.district);
  assert.ok(location.city);
});

test('form detector detects email and visible text fields', () => {
  const window = loadWindow('content/form-detector.js');
  window.document.body.innerHTML = '<input id="email" name="email" type="email"><select id="country"><option>India</option></select><input id="secret" type="password" disabled>';
  window.document.querySelectorAll('*').forEach(element => { element.getBoundingClientRect = () => ({ width: 100, height: 20 }); });
  const fields = window.SFFAFormDetector.detectFormFields(window.document);
  assert.ok(fields.text.some(field => field.element.id === 'email'));
  assert.equal(fields.text.some(field => field.element.id === 'secret'), false);
  assert.ok(fields.select.some(field => field.element.id === 'country'));
});
