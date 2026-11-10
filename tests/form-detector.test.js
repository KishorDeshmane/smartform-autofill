const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow } = require('./helpers');

const DETECTOR_FILES = ['utils/file-types.js', 'utils/deep-dom.js', 'content/form-detector.js'];

/** Loads the detector, sets page HTML, and returns { window, fields }. */
function detect(html) {
  const window = loadWindow(DETECTOR_FILES);
  window.document.body.innerHTML = html;
  return { window, fields: window.SFFAFormDetector.detectFormFields() };
}

const typeOf = (fields, id) => fields.text.find(field => field.element.id === id)?.type;

test('classifies fields through an associated <label for>', () => {
  const { fields } = detect('<label for="a">Email address</label><input id="a" name="x1"><label for="b">Mobile number</label><input id="b" name="x2">');
  assert.equal(typeOf(fields, 'a'), 'email');
  assert.equal(typeOf(fields, 'b'), 'mobile');
});

test('classifies fields through a wrapping <label>', () => {
  const { fields } = detect('<label>First name <input id="fn" name="q1"></label><label>Last name <input id="ln" name="q2"></label>');
  assert.equal(typeOf(fields, 'fn'), 'firstName');
  assert.equal(typeOf(fields, 'ln'), 'lastName');
});

test('finds controls inside an open shadow root', () => {
  const window = loadWindow(DETECTOR_FILES);
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  host.attachShadow({ mode: 'open' }).innerHTML = '<input id="shadowEmail" type="email" name="email">';
  const fields = window.SFFAFormDetector.detectFormFields();
  assert.ok(fields.text.some(field => field.element.id === 'shadowEmail'), 'shadow-root input should be detected');
});

test('skips honeypot, hidden, disabled and readonly fields', () => {
  const { fields } = detect(`
    <input id="real" name="email" type="email">
    <input id="hp1" name="website_honeypot">
    <input id="hp2" class="bot-trap" name="nickname">
    <input id="hidden" name="city" style="display:none">
    <input id="disabled" name="phone" disabled>
    <input id="ro" name="pincode" readonly>`);
  const ids = fields.text.map(field => field.element.id);
  assert.deepEqual([...ids], ['real']);
});

test('isHoneypot recognises common trap markers but not ordinary names', () => {
  const window = loadWindow(DETECTOR_FILES);
  const make = attrs => Object.assign(window.document.createElement('input'), attrs);
  const { isHoneypot } = window.SFFAFormDetector;
  assert.equal(isHoneypot(make({ name: 'hp_field' })), true);
  assert.equal(isHoneypot(make({ id: 'anti-bot' })), true);
  assert.equal(isHoneypot(make({ className: 'honey-pot' })), true);
  assert.equal(isHoneypot(make({ name: 'phone' })), false);
});

test('never offers real password/OTP inputs for filling', () => {
  const { fields } = detect('<label for="p">Password</label><input id="p" type="password" name="password"><label for="o">OTP</label><input id="o" type="password" name="otp">');
  assert.equal(fields.text.length, 0);
});

test('groups radios by name and collects selects', () => {
  const { fields } = detect('<form><input type="radio" name="gender" value="m"><input type="radio" name="gender" value="f"><select id="s"><option>A</option></select></form>');
  const groups = Object.values(fields.radioGroups);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].options.length, 2);
  assert.equal(fields.select.length, 1);
});

// ---- H1: a field must not take its type from a neighbouring field's label ----
test('an unrecognised field does not borrow the type of a neighbouring field', () => {
  const { fields } = detect(`<form><div><div><label>Employee code <input name="empCode"></label></div>
    <div><label>Email <input name="email" type="email"></label></div>
    <div><label>Ticket ID <input name="ticket"></label><label>Mobile number <input name="mobile"></label></div></div></form>`);
  const typeByName = Object.fromEntries(fields.text.map(f => [f.element.name, f.type]));
  assert.equal(typeByName.email, 'email');
  assert.equal(typeByName.mobile, 'mobile');
  assert.notEqual(typeByName.empCode, 'email', 'Employee code must not be classified as email');
  assert.notEqual(typeByName.ticket, 'mobile', 'Ticket ID must not be classified as mobile');
  assert.notEqual(typeByName.ticket, 'email');
});

test('a select labelled "Role" next to "First Name" is not classified as firstName', () => {
  const { fields } = detect(`<form><div class="row"><label>Role <select name="role"><option value="">Select</option><option>Admin</option></select></label>
    <label>First Name <input name="firstName"></label></div></form>`);
  assert.notEqual(fields.select[0].type, 'firstName');
  assert.equal(fields.text[0].type, 'firstName');
});

// ---- H1 regression guards: common generic layouts must keep classifying correctly ----
test('label text in a sibling wrapper element is still used', () => {
  const { fields } = detect(`<form><div class="field"><div class="lbl">Email address</div><div class="ctrl"><input name="x1"></div></div>
    <div class="field"><div class="lbl">Mobile number</div><div class="ctrl"><input name="x2"></div></div></form>`);
  assert.deepEqual([...fields.text.map(f => f.type)], ['email', 'mobile']);
});

test('table-row layouts still classify each field from its own row', () => {
  const { fields } = detect(`<form><table><tr><td>First name</td><td><input name="a"></td></tr>
    <tr><td>Last name</td><td><input name="b"></td></tr><tr><td>Email</td><td><input name="c"></td></tr></table></form>`);
  assert.deepEqual([...fields.text.map(f => f.type)], ['firstName', 'lastName', 'email']);
});

test('flat label/input siblings still classify each field', () => {
  const { fields } = detect(`<form><div><span>First name</span><input name="a"><span>Email</span><input name="b"><span>Mobile</span><input name="c"></div></form>`);
  assert.deepEqual([...fields.text.map(f => f.type)], ['firstName', 'email', 'mobile']);
});

test('a radio group still uses its fieldset legend', () => {
  const { fields } = detect(`<form><fieldset><legend>Gender</legend><label><input type="radio" name="g" value="m"> Male</label>
    <label><input type="radio" name="g" value="f"> Female</label></fieldset><label>Email <input name="email"></label></form>`);
  const group = Object.values(fields.radioGroups)[0];
  assert.equal(group.type, 'gender');
});

// ---- H2: detection time grows roughly linearly with form size ----
test('detecting 300 fields in one big container finishes quickly', () => {
  const rows = Array.from({ length: 300 }, (_, i) => `<div class="row"><label>Field number ${i} <input name="f${i}"></label><span>Help ${i}</span></div>`).join('');
  const noise = Array.from({ length: 1500 }, (_, i) => `<p>Paragraph ${i} <b>text</b></p>`).join('');
  const window = loadWindow(DETECTOR_FILES);
  window.document.body.innerHTML = `<form><div class="inner">${rows}${noise}</div></form>`;
  const started = Date.now();
  const fields = window.SFFAFormDetector.detectFormFields();
  const elapsed = Date.now() - started;
  assert.equal(fields.text.length, 300);
  // ~0.8s on an idle machine; the limit leaves room for a busy one while still catching the old ~14s behaviour.
  assert.ok(elapsed < 6000, `detection took ${elapsed}ms (was ~14000ms before the fix)`);
});

// ---- M1: one scan should run field detection once, not several times ----
test('scanPage reuses a detection result it is given instead of detecting again', () => {
  const window = loadWindow([...DETECTOR_FILES, 'content/qa-engine.js']);
  window.document.body.innerHTML = '<form><label>Email <input name="email" type="email"></label></form>';
  const detected = window.SFFAFormDetector.detectFormFields();
  let calls = 0;
  const original = window.SFFAFormDetector.detectFormFields;
  window.SFFAFormDetector.detectFormFields = (...args) => { calls++; return original(...args); };
  const result = window.SFFAQAEngine.scanPage(null, null, {}, detected);
  assert.equal(calls, 0, 'no extra detection when a result is supplied');
  assert.equal(result.fieldCount, 1);
});

// ---- H3: the dynamic-field watcher must not re-detect on every unrelated DOM change ----
test('dynamic-field watcher ignores text-only DOM changes but still notices new fields', async () => {
  const window = loadWindow([]);
  const sent = [];
  window.chrome = { runtime: { id: 'test', getURL: p => p, sendMessage: async message => { sent.push(message.payload || message); return undefined; }, onMessage: { addListener() {} } } };
  for (const file of ['utils/ext.js', 'utils/file-types.js', 'utils/deep-dom.js', 'content/form-detector.js', 'content/runtime/core.js', 'content/runtime/dynamic-fields.js']) {
    window.eval(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'));
  }
  window.document.body.innerHTML = '<div id="clock"></div><form><label>Email <input name="email"></label></form>';
  let detections = 0;
  const original = window.SFFAFormDetector.detectFormFields;
  window.SFFAFormDetector.detectFormFields = (...args) => { detections++; return original(...args); };
  await new Promise(resolve => setTimeout(resolve, 2600)); // initial baseline run
  const baseline = detections;
  for (let i = 0; i < 8; i++) { // a "clock" updating text, like many live pages
    window.document.getElementById('clock').textContent = `tick ${i}`;
    window.document.getElementById('clock').appendChild(window.document.createElement('span'));
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  await new Promise(resolve => setTimeout(resolve, 2600));
  assert.equal(detections - baseline, 0, `text/decoration changes caused ${detections - baseline} full detections`);
  // A real new field must still be noticed and reported.
  window.document.querySelector('form').insertAdjacentHTML('beforeend', '<label>Mobile <input name="mobile"></label>');
  await new Promise(resolve => setTimeout(resolve, 2600));
  assert.ok(detections - baseline >= 1, 'a new field triggers detection');
  assert.ok(sent.some(m => m.type === 'SFFA_DYNAMIC_FIELDS' && m.count === 2), `dynamic-field notice sent: ${JSON.stringify(sent.map(m => m.type))}`);
  window.__SFFA_FIELD_OBSERVER__?.disconnect();
});

const DOC_CARDS = `<div id="docs"><input id="shared" type="file" style="display:none" accept=".pdf">
  <div id="pending">
    <div class="card"><h4>MOA &amp; AOA</h4><p>Memorandum of Association and Articles of Association.</p><button id="b1" type="button">Browse Files</button></div>
    <div class="card"><h4>Financial Statements for Last Three Years</h4><p>Issued by a Chartered Accountant.</p><button id="b2" type="button">Browse Files</button></div>
  </div>
  <div id="uploaded"><div class="card"><h3>Copy of PAN</h3><label aria-label="Replace document"><input id="rep" type="file" style="display:none"></label></div></div>
</div>`;

test('upload cards with only a "Browse Files" button become one file field each, typed from the card', () => {
  const { fields } = detect(DOC_CARDS);
  const viaTrigger = fields.file.filter(f => f.viaTrigger);
  assert.deepEqual(JSON.parse(JSON.stringify(viaTrigger.map(f => [f.trigger.id, f.element.id, f.type, f.label]))), [
    ['b1', 'shared', 'moaAoa', 'MOA & AOA'],
    ['b2', 'shared', 'financialStatement', 'Financial Statements for Last Three Years']
  ]);
  assert.equal(fields.file.filter(f => f.element.id === 'shared' && !f.viaTrigger).length, 0, 'no ambiguous plain entry for the shared input');
});

test('a hidden "Replace document" input is marked so a fill leaves the uploaded document alone', () => {
  const { fields } = detect(DOC_CARDS);
  const replace = fields.file.find(f => f.element.id === 'rep');
  assert.equal(replace.replacesExisting, true);
  const { fields: plain } = detect('<label>Upload photo <input id="p" type="file"></label>');
  assert.equal(plain.file[0].replacesExisting, false);
  assert.equal(plain.file[0].viaTrigger, undefined, 'a normal file input is unchanged');
});

test('upload triggers never include links that navigate away or submit buttons', () => {
  const { fields } = detect(`<input id="s" type="file" style="display:none">
    <div><h4>Resume</h4><a href="/upload" id="nav">Upload</a></div>
    <form><div><h4>Photo</h4><button id="sub" type="submit">Upload</button></div></form>`);
  assert.equal(fields.file.filter(f => f.viaTrigger).length, 0);
});
