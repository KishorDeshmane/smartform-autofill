const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadWindow } = require('./helpers');

const exporter = () => loadWindow(['utils/testcase-export.js']).SFFATestCaseExport;

/** Parses a CSV document (RFC 4180 quoting) into rows of cells. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}

const sampleCase = {
  srNo: 1, id: 'TC-001', category: 'Validation', title: 'Email "required" check, with comma',
  steps: ['Open page', 'Leave email empty'], expectedResult: 'Shows an error', priority: 'High',
  sourceUrl: 'https://example.test/form', element: 'Locator: #email', locator: '#email'
};

test('CSV output starts with a BOM, has a header row, and round-trips quotes, commas and newlines', () => {
  const { toCsv, columns } = exporter();
  const csv = toCsv([sampleCase]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const rows = parseCsv(csv.slice(1));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], [...columns.map(c => c[1])]);
  const titleIndex = columns.findIndex(c => c[0] === 'title');
  const stepsIndex = columns.findIndex(c => c[0] === 'steps');
  assert.equal(rows[1][titleIndex], sampleCase.title);
  assert.equal(rows[1][stepsIndex], 'Open page\nLeave email empty');
});

test('CSV neutralises spreadsheet formula injection', () => {
  const { toCsv, columns } = exporter();
  const rows = parseCsv(toCsv([{ title: '=HYPERLINK("http://evil")', notes: '+1+1', basis: '@SUM(A1)', testData: '-2' }]).slice(1));
  const at = key => rows[1][columns.findIndex(c => c[0] === key)];
  for (const key of ['title', 'notes', 'basis', 'testData']) assert.ok(at(key).startsWith("'"), `${key} should be prefixed`);
});

test('Playwright JS output is syntactically valid and uses the supplied locator and URL', () => {
  const source = exporter().toPlaywright([sampleCase, { id: 'TC-002', title: 'Page level', element: 'Page' }]);
  const body = source.replace(/^import .*$/m, '');
  assert.doesNotThrow(() => new vm.Script(`(async () => {\n${body}\n})`));
  assert.match(source, /page\.locator\("#email"\)/);
  assert.match(source, /await page\.goto\("https:\/\/example\.test\/form"\)/);
  assert.match(source, /Page-level scenario/);
});

test('Playwright JS output cannot be broken out of by hostile titles or comment terminators', () => {
  const hostile = { id: 'X', title: '"); process.exit(1); ("', steps: ['*/ process.exit(1); /*'], element: 'Locator: #a', locator: '#a' };
  const body = exporter().toPlaywright([hostile]).replace(/^import .*$/m, '');
  assert.doesNotThrow(() => new vm.Script(`(async () => {\n${body}\n})`));
  assert.ok(!/^\s*process\.exit/m.test(body));
});

test('Markdown output escapes pipes and HTML', () => {
  const md = exporter().toMarkdown([{ title: 'a | b <script>' }]);
  assert.match(md, /a \\\| b &lt;script&gt;/);
});

test('line separators in test-case text cannot break out of comments in exported tests', async () => {
  const { toPlaywright, toPlaywrightPython } = exporter();
  const breaks = ['\r', '\u2028', '\u2029'];
  const hostile = breaks.map((br, i) => ({
    id: `TC-${i}`, title: 'x', locator: '#a', element: 'Locator: #a', sourceUrl: `not-a-url${br}globalThis.P_URL${i} = true; //`,
    precondition: `pre${br}globalThis.P_PRE${i} = true; //`,
    steps: [`step${br}globalThis.P_STEP${i} = true; //`],
    expectedResult: `done${br}globalThis.P_EXP${i} = true; //`
  }));
  const runs = [];
  const ctx = { test: (_n, fn) => runs.push(fn({ page: { goto: async () => {}, locator: () => ({}), screenshot: async () => {} } })), expect: () => ({ toBeVisible: async () => {} }) };
  ctx.globalThis = ctx;
  vm.runInNewContext(toPlaywright(hostile).replace(/^import .*$/m, ''), ctx);
  await Promise.all(runs);
  assert.deepEqual(Object.keys(ctx).filter(k => k.startsWith('P_')), [], 'no injected statement may run');
  const py = toPlaywrightPython(hostile.map(tc => ({ ...tc, expectedResult: 'done\r    import os  #' })));
  for (const line of py.split(/\r\n|\r|\n/)) assert.ok(!/^\s*import os\b/.test(line), `python line became code: ${JSON.stringify(line)}`);
});
