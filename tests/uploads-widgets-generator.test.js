const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow } = require('./helpers');

// ---------------- File uploader rules ----------------
// jsdom has no DataTransfer, so a file that passes every rule ends at "requires manual selection";
// a file that fails a rule returns that rule's reason. Real attachment is covered by the e2e suite.
const uploader = html => {
  const window = loadWindow(['utils/file-types.js', 'content/file-uploader.js'], `<!doctype html><html><body>${html}</body></html>`);
  return { window, assign: (sel, files) => window.SFFAFileUploader.assignFilesToInput(window.document.querySelector(sel), files) };
};
const png = { id: 'p', name: 'photo.png', type: 'image/png', base64: 'iVBORw0KGgo=' };
const pdf = { id: 'd', name: 'doc.pdf', type: 'application/pdf', base64: 'JVBERi0=' };

test('uploads: files that the field does not accept are rejected with a reason', () => {
  const { assign } = uploader('<input type="file" accept="image/*">');
  const result = assign('input', [pdf]);
  assert.equal(result.success, false);
  assert.match(result.reason, /not accepted by this field/);
});

test('uploads: accept matches by extension, by exact MIME and by wildcard', () => {
  for (const accept of ['.png', 'image/png', 'image/*', '*/*']) {
    const { assign } = uploader(`<input type="file" accept="${accept}">`);
    assert.doesNotMatch(assign('input', [png]).reason || '', /not accepted/, `accept="${accept}"`);
  }
  const { assign } = uploader('<input type="file" accept=".pdf,.docx">');
  assert.match(assign('input', [png]).reason, /not accepted/);
});

test('uploads: disabled, detached and non-file inputs are refused safely', () => {
  const { window, assign } = uploader('<input type="file" disabled><input type="text" id="t">');
  assert.match(assign('input[type=file]', [png]).reason, /disabled/);
  assert.match(assign('#t', [png]).reason, /Not a file input/);
  const detached = window.document.createElement('input');
  detached.type = 'file';
  const result = window.SFFAFileUploader.assignFilesToInput(detached, [png]);
  assert.equal(result.stale, true);
  assert.match(uploader('<input type="file">').assign('input', []).reason, /No files provided/);
});

test('uploads: base64 content becomes a File with the right name, type and bytes', async () => {
  const { window } = uploader('<input type="file">');
  const file = window.SFFAFileUploader.base64ToFile('aGVsbG8=', 'hello.txt', 'text/plain', window.File);
  assert.equal(file.name, 'hello.txt');
  assert.equal(file.type, 'text/plain');
  // jsdom's File lacks .text(); read the bytes with FileReader instead.
  const text = await new Promise(resolve => { const reader = new window.FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(file); });
  assert.equal(text, 'hello');
});

// ---------------- Custom widgets (advanced filler) ----------------
const widgets = html => {
  const window = loadWindow(['utils/deep-dom.js', 'content/advanced-filler.js'], `<!doctype html><html><body>${html}</body></html>`);
  window.HTMLElement.prototype.click = function click() { this.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
  return window;
};

test('widgets: a custom consent checkbox is ticked; an unrelated preference switch is left alone', async () => {
  const window = widgets(`<div role="checkbox" id="consent" aria-checked="false" tabindex="0" aria-label="I agree to the terms"></div>
    <div role="switch" id="promo" aria-checked="false" tabindex="0" aria-label="Send me promotions"></div>`);
  for (const id of ['consent', 'promo']) {
    const el = window.document.getElementById(id);
    el.addEventListener('click', () => el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true'));
  }
  await window.SFFAAdvancedFiller.runWidgets({}, {}, {}, () => false);
  assert.equal(window.document.getElementById('consent').getAttribute('aria-checked'), 'true');
  assert.equal(window.document.getElementById('promo').getAttribute('aria-checked'), 'false');
});

test('widgets: rich-text editors receive text', async () => {
  const window = widgets('<div contenteditable="true" id="editor" aria-label="Description"></div>');
  await window.SFFAAdvancedFiller.runWidgets({}, { richTextValue: 'Hello QA' }, {}, () => false);
  assert.equal(window.document.getElementById('editor').textContent.trim(), 'Hello QA');
});

test('widgets: a cancelled run stops before touching widgets', async () => {
  const window = widgets('<div contenteditable="true" id="editor" aria-label="Notes"></div>');
  await assert.rejects(window.SFFAAdvancedFiller.runWidgets({}, {}, {}, () => true), /cancelled/i);
  assert.equal(window.document.getElementById('editor').textContent, '');
});

// ---------------- Test-case generator ----------------
const generate = html => {
  const window = loadWindow(['utils/file-types.js', 'utils/deep-dom.js', 'utils/selector-engine.js', 'content/form-detector.js', 'content/qa-engine.js', 'content/testcase-wording.js', 'content/testcase-generator.js'],
    `<!doctype html><html><body>${html}</body></html>`);
  return window.SFFATestCases.generateReport(window.SFFAFormDetector.detectFormFields());
};

test('generator: required fields and email fields get validation cases; ids are unique', () => {
  const { cases } = generate('<form><label>Email <input type="email" name="email" required></label><label>Name <input name="fullname" required></label><button type="submit">Save</button></form>');
  assert.ok(cases.length >= 3);
  const idsSeen = new Set(cases.map(c => c.id));
  assert.equal(idsSeen.size, cases.length, 'case ids are unique');
  const text = JSON.stringify(cases).toLowerCase();
  assert.match(text, /required|mandatory|empty/);
  assert.match(text, /email/);
  for (const c of cases) assert.ok(c.title && c.expectedResult && Array.isArray(c.steps) && c.steps.length, `case ${c.id} is complete`);
});

test('generator: an input with a datalist gets "suggested option" and "value not in the list" cases', () => {
  const { cases } = generate('<form><label>City <input name="city" list="cities"></label><datalist id="cities"><option value="Pune"><option value="Mumbai"></datalist></form>');
  const titles = cases.map(c => c.title);
  assert.ok(titles.some(t => /suggests values while typing/.test(t)), titles.join(' | '));
  assert.ok(titles.some(t => /value that is not in its suggestions/.test(t)));
  assert.match(JSON.stringify(cases), /Pune; Mumbai/);
});

test('generator: cases never contain values the user typed into the page', () => {
  const window = loadWindow(['utils/file-types.js', 'utils/deep-dom.js', 'utils/selector-engine.js', 'content/form-detector.js', 'content/qa-engine.js', 'content/testcase-wording.js', 'content/testcase-generator.js'],
    '<!doctype html><html><body><form><label>Password <input type="password" name="pw"></label><label>Email <input type="email" name="email"></label></form></body></html>');
  window.document.querySelector('[name=pw]').value = 'MySecretPassw0rd!';
  window.document.querySelector('[name=email]').value = 'real.person@company.com';
  const { cases } = window.SFFATestCases.generateReport(window.SFFAFormDetector.detectFormFields());
  const text = JSON.stringify(cases);
  assert.ok(!text.includes('MySecretPassw0rd!'), 'typed password leaked into test cases');
  assert.ok(!text.includes('real.person@company.com'), 'typed email leaked into test cases');
});
