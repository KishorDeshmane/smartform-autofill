// Output tab: test-case generation/export, generated data and activity log.

let lastTestCases = [];
let lastTestCaseReport = null;
let testCasePage = 0;
/** Test-case type shown in the list ('all' or a category such as "Validation"). */
let testCaseCategory = 'all';
const TEST_CASES_PER_PAGE = 100;
/** Delegates CSV test-case serialization to the shared export utility. */
const testCasesToCsv = cases => window.SFFATestCaseExport.toCsv(cases);
/** Delegates Markdown test-case serialization to the shared export utility. */
const testCasesToMarkdown = cases => window.SFFATestCaseExport.toMarkdown(cases);
/** Delegates JavaScript Playwright source generation to the shared export utility. */
const testCasesToPlaywright = cases => window.SFFATestCaseExport.toPlaywright(cases);
/** Delegates Python Playwright source generation to the shared export utility. */
const testCasesToPlaywrightPython = cases => window.SFFATestCaseExport.toPlaywrightPython(cases);

/** Renders generated test-case counts and available export controls. */
function renderTestCasePage(resultEl, response) {
  const { h } = window.SFFADom;
  // Type filter: counts per category in the order they first appear.
  const counts = new Map();
  for (const tc of lastTestCases) counts.set(tc.category || 'Other', (counts.get(tc.category || 'Other') || 0) + 1);
  if (testCaseCategory !== 'all' && !counts.has(testCaseCategory)) testCaseCategory = 'all';
  const shownCases = testCaseCategory === 'all' ? lastTestCases : lastTestCases.filter(tc => (tc.category || 'Other') === testCaseCategory);
  const chip = (value, label, count) => {
    const button = h('button', { type: 'button', class: 'tc-filter-chip', 'aria-pressed': String(testCaseCategory === value), 'data-category': value }, [
      h('span', { text: label }), h('span', { class: 'tc-filter-count', text: String(count) })
    ]);
    button.addEventListener('click', () => {
      if (testCaseCategory === value) return;
      testCaseCategory = value;
      testCasePage = 0;
      renderTestCasePage(resultEl, response);
      resultEl.querySelector(`.tc-filter-chip[data-category="${CSS.escape(value)}"]`)?.focus();
    });
    return button;
  };
  const filterBar = h('div', { class: 'tc-filter', role: 'group', 'aria-label': 'Show test cases of type' }, [
    chip('all', 'All', lastTestCases.length),
    ...[...counts].map(([name, count]) => chip(name, name, count))
  ]);

  const totalPages = Math.max(1, Math.ceil(shownCases.length / TEST_CASES_PER_PAGE));
  testCasePage = Math.min(Math.max(0, testCasePage), totalPages - 1);
  const start = testCasePage * TEST_CASES_PER_PAGE;
  const pageCases = shownCases.slice(start, start + TEST_CASES_PER_PAGE);
  const list = h('div', { class: 'tc-list' });
  pageCases.forEach(tc => {
    const technicalDetails = h('details', { class: 'tc-technical' }, [
      h('summary', { text: 'Technical details' }),
      h('p', { text: `Basis: ${tc.basis || 'Not specified'}` }),
      tc.locator ? h('code', { text: `Locator: ${tc.locator} · stability ${tc.selectorStability ?? 'unrated'}/100` }) : null
    ]);
    const detail = h('details', { class: 'tc-detail' }, [
      h('summary', { text: `${tc.id} · ${tc.title}` }),
      h('p', { text: `Category: ${tc.category} · Priority: ${tc.priority}` }),
      h('p', { text: `Precondition: ${tc.precondition}` }),
      h('p', { text: `Page: ${tc.sourceUrl || 'Not available'}` }),
      h('p', { text: `Test data: ${tc.testData || 'As applicable'}` }),
      h('ol', {}, tc.steps.map(step => h('li', { text: step }))),
      h('p', { text: `Expected result: ${tc.expectedResult}` }),
      h('label', { class: 'field' }, [h('span', { text: 'Edit expected result' }), h('textarea', { rows: 2, text: tc.expectedResult })]),
      h('label', { class: 'field' }, [h('span', { text: 'Edit steps (one per line)' }), h('textarea', { rows: 3, text: tc.steps.join('\n') })]),
      h('p', { text: `Actual result: ${tc.actualResult || 'Not executed'}` }),
      h('p', { text: `Element: ${tc.elementDisplay || tc.element || 'Page-level check'}` }),
      technicalDetails,
      tc.notes ? h('p', { text: `Notes: ${tc.notes}` }) : null
    ]);
    const editors = detail.querySelectorAll('textarea');
    editors[0]?.addEventListener('input', event => { tc.expectedResult = event.target.value; });
    editors[1]?.addEventListener('input', event => { tc.steps = event.target.value.split(/\r?\n/).filter(Boolean); });
    list.appendChild(detail);
  });
  const nav = h('div', { class: 'tc-pagination' }, [
    h('button', { text: '‹ Previous', disabled: testCasePage === 0 }),
    h('span', { text: `Page ${testCasePage + 1} of ${totalPages} (${shownCases.length ? start + 1 : 0}-${start + pageCases.length} of ${shownCases.length})` }),
    h('button', { text: 'Next ›', disabled: testCasePage >= totalPages - 1 })
  ]);
  // The pager sits under the list: after changing page, scroll back to the top of the new list.
  const goToPage = delta => {
    testCasePage += delta;
    renderTestCasePage(resultEl, response);
    resultEl.querySelector('.tc-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  nav.children[0].addEventListener('click', () => goToPage(-1));
  nav.children[2].addEventListener('click', () => goToPage(1));
  const showing = testCaseCategory === 'all'
    ? `Showing all ${lastTestCases.length} cases.`
    : `Showing ${shownCases.length} ${testCaseCategory} case(s) of ${lastTestCases.length}.`;
  // Notes about the cases live behind a help (i) button so the list starts right away.
  const helpNotes = [
    'Pick a type to see only its cases. Exports always include all cases.',
    ...(response.coverage?.warnings || []),
    'Exported test scripts (JavaScript, TypeScript, Python) are not checked for syntax here; run them once before use.'
  ];
  const titleRow = h('div', { class: 'tc-title-row' }, [
    h('div', { class: 'fill-result-title', text: `${lastTestCases.length} detailed test case(s) generated` }),
    h('button', { class: 'help-tip', type: 'button', 'aria-label': 'Help: about these test cases', 'aria-describedby': 'tcHelpTooltip', text: 'i' }),
    h('span', { id: 'tcHelpTooltip', class: 'help-tooltip tc-help-tooltip', role: 'tooltip' }, helpNotes.map(text => h('span', { class: 'tc-help-line', text })))
  ]);
  resultEl.replaceChildren(
    titleRow,
    filterBar,
    list,
    h('p', { class: 'tc-filter-status', role: 'status', text: showing }),
    nav
  );
}

/** Downloads text content using a temporary Blob URL and releases the URL afterward. */
function downloadTextFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const download = window.SFFAExt.downloads?.download({ url, filename, saveAs: true });
  if (download) download.finally(() => URL.revokeObjectURL(url));
  else URL.revokeObjectURL(url);
}

/** Requests test-case generation and renders the resulting export options. */
async function onGenerateTestCasesClick() {
  const btn = document.getElementById('generateTestCasesBtn');
  const resultEl = document.getElementById('testCaseResult');
  const exportRow = document.getElementById('testCaseExportRow');
  btn.disabled = true;
  resultEl.classList.add('hidden');
  exportRow.classList.add('hidden');
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    const response = await sendTabMessage(tab.id, { type: 'SFFA_GENERATE_TESTCASES' }, { timeoutMs: 30000 });
    if (!response || !response.ok) throw new Error(response?.error || 'Test case generation failed');
    lastTestCases = response.cases;
    testCasePage = 0;
    testCaseCategory = 'all';
    lastTestCaseReport = { schemaVersion: response.schemaVersion, pageUrl: response.pageUrl, generatedAt: response.generatedAt, coverage: response.coverage, cases: lastTestCases };

    resultEl.classList.remove('hidden');
    renderTestCasePage(resultEl, response);
    exportRow.classList.remove('hidden');
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
  }
}

/** Opens a printable generated report from a temporary Blob URL. */
function printTestCases() {
  if (!lastTestCases.length) { showToast('Generate test cases first'); return; }
  const blob = new Blob([window.SFFAQAReport.toHtml(lastTestCaseReport || { cases: lastTestCases })], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const printable = window.open(url, '_blank');
  if (!printable) {
    URL.revokeObjectURL(url);
    showToast('Allow popups to open the print report');
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

const DATA_FIELD_LABELS = {
  fullName: 'Name',
  email: 'Email',
  mobile: 'Mobile',
  organizationName: 'Organization',
  registrationNumber: 'Registration',
  paymentReference: 'Payment Reference',
  creditCardNumber: 'Credit Card Test Number (synthetic)',
  iban: 'IBAN Test Value (synthetic)',
  state: 'State',
  district: 'District',
  city: 'City',
  pinCode: 'PIN',
  identityNumber: 'Identity Number',
  startDate: 'Start Date',
  endDate: 'End Date'
};

/** Displays generated test data fields in the popup. */
function renderGeneratedData(data) {
  const dl = document.getElementById('dataList');
  const dataView = document.getElementById('dataView');
  const emptyState = dataView.querySelector('.empty-state-panel');
  const toggle = document.getElementById('toggleDataView');

  dl.replaceChildren();

  if (!data || typeof data !== 'object') data = {};

  let count = 0;
  for (const [key, label] of Object.entries(DATA_FIELD_LABELS)) {
    if (data[key] === undefined) continue;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = data[key];
    dl.appendChild(dt);
    dl.appendChild(dd);
    count++;
  }

  if (count === 0) {
    if (emptyState) emptyState.style.display = 'block';
    dataView.classList.remove('hidden');
    if (toggle) toggle.textContent = 'No data generated yet';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  dataView.classList.remove('hidden');
  if (toggle) toggle.textContent = 'Generated';
}

/** Converts generated data entries into CSV text with escaped cells. */
function dataToCsv(data) {
  const keys = Object.keys(data);
  const header = keys.join(',');
  const row = keys.map(k => {
    const v = Array.isArray(data[k]) ? data[k].join(' | ') : data[k];
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(',');
  return `${header}\n${row}`;
}

/** Triggers a browser download for content wrapped in a Blob. */
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/** Loads extension logs and renders them in the popup log panel. */
async function renderLogs() {
  const logs = await SFFALogger.getAll();
  const list = document.getElementById('logList');
  const logView = document.getElementById('logView');
  const toggle = document.getElementById('toggleLogView');
  list.replaceChildren();

  if (!logs.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-state';
    emptyItem.textContent = 'No activity yet.';
    list.appendChild(emptyItem);
    logView.classList.remove('hidden');
    if (toggle) toggle.textContent = 'View Logs';
    return;
  }

  logs.slice(-100).forEach(entry => {
    const li = document.createElement('li');
    li.className = `log-${entry.level}`;
    li.textContent = `[${entry.time}] ${sanitizeReportText(entry.message)}`;
    list.appendChild(li);
  });
  logView.classList.remove('hidden');
  if (toggle) toggle.textContent = 'View logs';
  list.scrollTop = list.scrollHeight;
}
