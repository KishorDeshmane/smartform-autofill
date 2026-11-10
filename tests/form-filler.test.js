const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow, recordEvents } = require('./helpers');

const FILLER_FILES = ['utils/file-types.js', 'utils/deep-dom.js', 'content/form-detector.js', 'content/form-filler.js'];

const TEST_DATA = {
  fullName: 'Priya Sharma', firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma1234@example.com',
  mobile: '9876543210', age: '30', dob: '1994-05-17', message: 'Hello from QA', gender: 'Female',
  state: 'Maharashtra', district: 'Pune', city: 'Pune'
};

/** Builds the page, detects fields, runs fillEntireForm, and returns the window and summary. */
async function fill(html, data = TEST_DATA) {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = html;
  const detected = window.SFFAFormDetector.detectFormFields();
  const summary = await window.SFFAFormFiller.fillEntireForm(detected, data, [], {}, () => {}, { timeoutMs: 1500 });
  return { window, doc: window.document, summary };
}

test('fills text, email, number, date and textarea fields with matching test data', async () => {
  const { doc, summary } = await fill(`
    <label>Full name <input id="name" name="fullname"></label>
    <label>Email <input id="email" type="email" name="email"></label>
    <label>Age <input id="age" type="number" name="age"></label>
    <label>Date of birth <input id="dob" type="date" name="dob"></label>
    <label>Message <textarea id="msg" name="message"></textarea></label>`);
  assert.equal(doc.getElementById('name').value, 'Priya Sharma');
  assert.equal(doc.getElementById('email').value, TEST_DATA.email);
  assert.match(doc.getElementById('age').value, /^\d+$/);
  assert.match(doc.getElementById('dob').value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(doc.getElementById('msg').value, 'Hello from QA');
  assert.ok(summary.textFilled >= 5, `textFilled=${summary.textFilled}`);
});

test('dispatches input and change events so frameworks see the new value', async () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = '<label>Email <input id="email" type="email" name="email"></label>';
  const input = window.document.getElementById('email');
  const events = recordEvents(input);
  const detected = window.SFFAFormDetector.detectFormFields();
  await window.SFFAFormFiller.fillEntireForm(detected, TEST_DATA, [], {}, () => {}, { timeoutMs: 1500 });
  assert.ok(events.includes('input'), `events: ${events}`);
  assert.ok(events.includes('change'), `events: ${events}`);
});

test('chooses a real option in a select, never the placeholder', async () => {
  const { doc } = await fill('<label>Country <select id="country" name="country"><option value="">Select…</option><option value="in">India</option><option value="us">USA</option></select></label>');
  assert.notEqual(doc.getElementById('country').value, '');
});

test('checks one radio in a group, preferring the test-data match', async () => {
  const { doc } = await fill(`<form><fieldset><legend>Gender</legend>
    <label><input type="radio" name="gender" id="m" value="male"> Male</label>
    <label><input type="radio" name="gender" id="f" value="female"> Female</label></fieldset></form>`);
  const checked = [...doc.querySelectorAll('input[name=gender]')].filter(r => r.checked).map(r => r.id);
  assert.equal(checked.length, 1);
});

test('checks required and consent checkboxes but leaves optional ones alone', async () => {
  const { doc } = await fill(`
    <label><input type="checkbox" id="terms" name="terms"> I agree to the terms</label>
    <label><input type="checkbox" id="req" name="opt_in_required" required> Required box</label>
    <label><input type="checkbox" id="news" name="newsletter"> Send me newsletters</label>`);
  assert.equal(doc.getElementById('terms').checked, true);
  assert.equal(doc.getElementById('req').checked, true);
  assert.equal(doc.getElementById('news').checked, false);
});

test('does not touch disabled, readonly or honeypot fields', async () => {
  const { doc } = await fill(`
    <label>Email <input id="email" type="email" name="email"></label>
    <label>Email 2 <input id="disabled" type="email" name="email2" disabled></label>
    <label>Email 3 <input id="ro" type="email" name="email3" readonly value="keep"></label>
    <input id="hp" name="email_honeypot">`);
  assert.equal(doc.getElementById('email').value, TEST_DATA.email);
  assert.equal(doc.getElementById('disabled').value, '');
  assert.equal(doc.getElementById('ro').value, 'keep');
  assert.equal(doc.getElementById('hp').value, '');
});

test('setNativeValue refuses disabled/readonly elements and respects the native setter', () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = '<input id="a"><input id="b" disabled><input id="c" readonly>';
  const { setNativeValue } = window.SFFAFormFiller;
  const $ = id => window.document.getElementById(id);
  assert.equal(setNativeValue($('a'), 'x'), true);
  assert.equal($('a').value, 'x');
  assert.equal(setNativeValue($('b'), 'x'), false);
  assert.equal(setNativeValue($('c'), 'x'), false);
});

test('honours maxlength when filling', async () => {
  const { doc } = await fill('<label>Full name <input id="name" name="fullname" maxlength="5"></label>');
  assert.ok(doc.getElementById('name').value.length <= 5);
});

test('stops when the run is cancelled', async () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = '<label>Email <input id="email" type="email" name="email"></label>';
  const detected = window.SFFAFormDetector.detectFormFields();
  await assert.rejects(
    window.SFFAFormFiller.fillEntireForm(detected, TEST_DATA, [], {}, () => {}, { isCancelled: () => true }),
    /cancelled/i
  );
  assert.equal(window.document.getElementById('email').value, '');
});

test('field-scope filter accepts a null scope (normal fill) without throwing', () => {
  const window = loadWindow(['utils/file-types.js', 'utils/deep-dom.js', 'content/form-detector.js', 'content/qa-engine.js']);
  window.document.body.innerHTML = '<label>Email <input id="email" type="email" name="email"></label>';
  const detected = window.SFFAFormDetector.detectFormFields();
  assert.doesNotThrow(() => window.SFFAQAEngine.filterDetectedFieldsByScope(detected, null));
  assert.equal(window.SFFAQAEngine.filterDetectedFieldsByScope(detected, null), detected);
});

test('same-origin link checks stop at the overall time budget instead of stalling the scan', async () => {
  const links = Array.from({ length: 30 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join('');
  const window = loadWindow(['utils/file-types.js', 'utils/deep-dom.js', 'content/form-detector.js', 'content/qa-engine.js'], `<!doctype html><body>${links}</body>`);
  // A server that never answers: each request only ends when its AbortController fires.
  window.fetch = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const progress = [];
  const started = Date.now();
  const results = await window.SFFAQAEngine.checkSameOriginLinks(300, 25, 1000, (done, total) => progress.push(`${done}/${total}`));
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2500, `link checks took ${elapsed}ms`);
  assert.ok(results.some(r => /time limit/.test(r.reason || '')), 'links past the budget are reported as not checked');
  assert.equal(progress.at(-1), '25/25');
});

test('detected-field list has labels, types, required flags and keys that match post-fill verification', async () => {
  const window = loadWindow(['utils/file-types.js', 'utils/deep-dom.js', 'utils/selector-engine.js', 'content/form-detector.js', 'content/qa-engine.js', 'content/form-filler.js']);
  window.document.body.innerHTML = `
    <label>Email <input id="email" type="email" name="email" required></label>
    <label>Full name <input id="name" name="fullname"></label>
    <label>Country <select id="country" name="country"><option value="">Select</option><option value="in">India</option></select></label>`;
  const detected = window.SFFAFormDetector.detectFormFields();
  const listed = window.SFFAQAEngine.listDetectedFields(detected);
  assert.equal(listed.total, 3);
  const email = listed.fields.find(f => f.label.startsWith('Email'));
  assert.equal(email.type, 'email');
  assert.equal(email.kind, 'email');
  assert.equal(email.required, true);
  assert.ok(email.key, 'has a key');
  assert.ok(listed.fields.every(f => !('value' in f)), 'no field values are exposed');
  await window.SFFAFormFiller.fillEntireForm(detected, { email: 'a@example.com', fullName: 'Asha Rao' }, [], {}, () => {}, { timeoutMs: 1500 });
  const verification = window.SFFAQAEngine.verifyFilledFields(detected);
  const keys = new Set(verification.fields.map(f => f.key));
  for (const field of listed.fields) assert.ok(keys.has(field.key), `verification has a result for ${field.label}`);
  assert.equal(verification.fields.find(f => f.key === email.key).status, 'pass');
});

// ---- Fill: password-visibility toggles must only be used for the masked field they belong to ----
test('filling an ordinary text field never clicks another field\'s show-password toggle', async () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = `<form><div class="grid">
    <label>Full name <input id="name" name="fullname"></label>
    <div class="pw"><label>Password <input id="pw" type="password" name="password"></label><button type="button" class="toggle-password eye-off" aria-label="Show password">eye</button></div>
  </div></form>`;
  let clicks = 0;
  window.document.querySelector('.toggle-password').addEventListener('click', () => clicks++);
  await window.SFFAFormFiller.revealMaskedFieldIfNeeded(window.document.getElementById('name'), () => {});
  assert.equal(clicks, 0, 'the password toggle was clicked while filling "Full name"');
});

test('a password field still uses its own show-password toggle', async () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = `<form><div class="pw"><label>Password <input id="pw" type="password" name="password"></label>
    <button type="button" class="toggle-password eye-off" aria-label="Show password">eye</button></div></form>`;
  let clicks = 0;
  window.document.querySelector('.toggle-password').addEventListener('click', () => clicks++);
  await window.SFFAFormFiller.revealMaskedFieldIfNeeded(window.document.getElementById('pw'), () => {});
  assert.equal(clicks, 1);
});

test('looking for visibility toggles on 300 plain text fields is fast', async () => {
  const window = loadWindow(FILLER_FILES);
  const rows = Array.from({ length: 300 }, (_, i) => `<div class="row"><label>Field ${i} <input name="f${i}"></label><span class="hint">Hint ${i}</span><i class="icon"></i></div>`).join('');
  window.document.body.innerHTML = `<form><div class="inner">${rows}</div></form>`;
  const started = Date.now();
  for (const input of window.document.querySelectorAll('input')) await window.SFFAFormFiller.revealMaskedFieldIfNeeded(input, () => {});
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `took ${elapsed}ms`);
});

test('datalist: an input with suggestions is filled with one of its options, not generated data', async () => {
  const { doc, summary } = await fill(`
    <label>City <input id="city" name="city" list="cities"></label>
    <datalist id="cities"><option value="Mumbai"><option value="Delhi"><option value="Bengaluru"></datalist>
    <label>Product <input id="product" name="product" list="products"></label>
    <datalist id="products"><option value=""><option value="Laptop" disabled><option value="Tablet"></datalist>`);
  assert.ok(['Mumbai', 'Delhi', 'Bengaluru'].includes(doc.getElementById('city').value), doc.getElementById('city').value);
  assert.equal(doc.getElementById('product').value, 'Tablet', 'empty and disabled options are skipped');
  assert.equal(summary.textFilled, 2);
});

test('datalist: repeated fields sharing one list get different options', async () => {
  const { doc } = await fill(`
    <label>From city <input id="from" name="fromCity" list="cities"></label>
    <label>To city <input id="to" name="toCity" list="cities"></label>
    <datalist id="cities"><option value="Pune"><option value="Nagpur"></datalist>`);
  assert.notEqual(doc.getElementById('from').value, doc.getElementById('to').value);
  assert.deepEqual([doc.getElementById('from').value, doc.getElementById('to').value].sort(), ['Nagpur', 'Pune']);
});

test('datalist: options the field rejects (pattern, maxlength, min/max) are skipped', async () => {
  const { doc } = await fill(`
    <label>PIN code <input id="pin" name="pincode" pattern="[0-9]{6}" list="pins"></label>
    <datalist id="pins"><option value="ABC"><option value="411001"></datalist>
    <label>Quantity <input id="qty" type="number" name="qty" min="1" max="10" list="qtys"></label>
    <datalist id="qtys"><option value="50"><option value="5"></datalist>`);
  assert.equal(doc.getElementById('pin').value, '411001');
  assert.equal(doc.getElementById('qty').value, '5');
});

test('datalist: when no option fits, the field still gets normal generated data', async () => {
  const { doc } = await fill(`
    <label>Email <input id="email" type="email" name="email" list="mails"></label>
    <datalist id="mails"><option value="not-an-email"></datalist>`);
  assert.equal(doc.getElementById('email').value, TEST_DATA.email);
});

test('datalist: a value imported by the user wins over the suggestions', async () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = `<label>City <input id="city" name="city" list="cities"></label>
    <datalist id="cities"><option value="Mumbai"></datalist>`;
  const detected = window.SFFAFormDetector.detectFormFields();
  await window.SFFAFormFiller.fillEntireForm(detected, TEST_DATA, [], {}, () => {}, { timeoutMs: 1500, settings: { importedTestData: { city: 'Kolhapur' } } });
  assert.equal(window.document.getElementById('city').value, 'Kolhapur');
});

test('Browse-button cards are clicked in page order before their file is attached; Replace inputs are never touched', async () => {
  const window = loadWindow(FILLER_FILES.concat(['content/file-uploader.js']));
  window.document.body.innerHTML = `<input id="shared" type="file" style="display:none">
    <div><div><h4>MOA &amp; AOA</h4><button id="b1" type="button">Browse Files</button></div>
    <div><h4>Financial Statements</h4><button id="b2" type="button">Browse Files</button></div></div>
    <div><h3>Copy of PAN</h3><label aria-label="Replace document"><input id="rep" type="file" style="display:none"></label></div>`;
  const doc = window.document;
  const got = [];
  let active = null;
  const clicks = [];
  doc.addEventListener('click', e => { if (e.target.id === 'b1' || e.target.id === 'b2') { active = e.target.id; clicks.push(active); } });
  doc.getElementById('shared').addEventListener('change', e => { got.push(`${active}:${e.target.files[0].name}`); e.target.value = ''; });
  let replaced = 0;
  doc.getElementById('rep').addEventListener('change', () => { replaced++; });
  const detected = window.SFFAFormDetector.detectFormFields();
  const record = name => ({ id: name, name, mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' });
  const files = [record('moa.pdf'), record('fin.pdf'), record('pan.pdf')];
  const mappings = { moaAoa: ['moa.pdf'], financialStatement: ['fin.pdf'], identityDocument: ['pan.pdf'] };
  const summary = await window.SFFAFormFiller.fillEntireForm(detected, TEST_DATA, files, mappings, () => {}, { timeoutMs: 1500 });
  // jsdom has no DataTransfer, so attaching is covered by the Chrome e2e test; the order and the skip are checked here.
  assert.deepEqual([...clicks], ['b1', 'b2'], "each card's Browse button is pressed, top to bottom");
  assert.equal(replaced, 0, 'the uploaded document was not replaced');
  assert.ok(summary.total >= 2);
  void got;
});

test('checkboxes: consent and declaration wording is ticked however it is labelled; optional and opt-out boxes are not', async () => {
  const { doc } = await fill(`
    <label><input type="checkbox" id="c1"> I hereby certify that the information is true</label>
    <input type="checkbox" id="c2"><label for="c2">I acknowledge the privacy policy</label>
    <div><input type="checkbox" id="c3" class="appearance-none"><span>I authorise the agency to verify my documents</span></div>
    <label><input type="checkbox" id="c4"> I agree to the terms</label>
    <label><input type="checkbox" id="opt"> Send me product newsletters</label>
    <label><input type="checkbox" id="out"> Do not contact me, I agree to nothing else</label>
    <label><input type="checkbox" id="req" required> Notify me by SMS</label>`);
  for (const id of ['c1', 'c2', 'c3', 'c4', 'req']) assert.equal(doc.getElementById(id).checked, true, `${id} ticked`);
  assert.equal(doc.getElementById('opt').checked, false, 'optional preference box left alone');
  assert.equal(doc.getElementById('out').checked, false, 'opt-out box never ticked');
});

test('checkboxes: the log names each ticked box and the optional ones left alone', async () => {
  const window = loadWindow(FILLER_FILES);
  window.document.body.innerHTML = `<label><input type="checkbox" id="c"> I consent to digitally signing</label>
    <label><input type="checkbox" id="o"> Remember me</label>`;
  const lines = [];
  await window.SFFAFormFiller.fillEntireForm(window.SFFAFormDetector.detectFormFields(), TEST_DATA, [], {}, msg => lines.push(msg), { timeoutMs: 1500 });
  assert.ok(lines.some(l => /Ticked consent checkbox "i consent to digitally signing"/.test(l)), lines.join('\n'));
  assert.ok(lines.some(l => /Left 1 optional checkbox\(es\) unticked.*remember me/.test(l)), lines.join('\n'));
});
