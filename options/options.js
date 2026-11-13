
// Theme matches the popup: system -> light -> dark, persisted under `sffaTheme`.
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' };

/** Applies and persists a theme ('system' follows the OS) and updates the toggle. */
function applyOptionsTheme(theme, persist = true) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  if (persist) {
    try { localStorage.setItem('sffaTheme', theme); }
    catch (error) { if (window.SFFAExt && typeof window.SFFAExt.logError === 'function') window.SFFAExt.logError('options.theme.persist', error); }
  }
  const toggle = document.getElementById('optionsThemeToggle');
  if (toggle) {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    toggle.dataset.icon = THEME_ICON[theme];
    toggle.title = `Theme: ${theme}`;
    toggle.setAttribute('aria-label', `Theme: ${theme}. Switch to ${next} theme`);
  }
}

const savedTheme = (() => {
  try { return localStorage.getItem('sffaTheme'); }
  catch (error) { if (window.SFFAExt && typeof window.SFFAExt.logError === 'function') window.SFFAExt.logError('options.theme.load', error); return null; }
})();
let currentTheme = THEME_ORDER.includes(savedTheme) ? savedTheme : 'system';
applyOptionsTheme(currentTheme, false);
// Shared with the popup: localStorage `sffaReduceEffects` ('1' = no blur, solid surfaces).
try { if (localStorage.getItem('sffaReduceEffects') === '1') document.documentElement.dataset.effects = 'reduced'; } catch (_) { /* Default effects. */ }
document.addEventListener('DOMContentLoaded', () => {
  applyOptionsTheme(currentTheme, false);
  document.getElementById('optionsThemeToggle')?.addEventListener('click', () => {
    currentTheme = THEME_ORDER[(THEME_ORDER.indexOf(currentTheme) + 1) % THEME_ORDER.length];
    applyOptionsTheme(currentTheme);
  });
  initSectionNav();
  const effects = document.getElementById('reduceEffectsToggle');
  if (effects) {
    effects.checked = document.documentElement.dataset.effects === 'reduced';
    effects.addEventListener('change', () => {
      if (effects.checked) document.documentElement.dataset.effects = 'reduced';
      else delete document.documentElement.dataset.effects;
      try { localStorage.setItem('sffaReduceEffects', effects.checked ? '1' : '0'); } catch (_) { /* Session only. */ }
    });
  }
});

/** Highlights the left-nav link for the section currently in view. */
function initSectionNav() {
  const links = Array.from(document.querySelectorAll('.sidenav a[href^="#"]'));
  const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  /** Marks one nav link as the current location. */
  const mark = id => links.forEach(link => link.setAttribute('aria-current', String(link.getAttribute('href') === `#${id}`)));
  if (sections[0]) mark(sections[0].id);
  if (typeof IntersectionObserver !== 'function') return;
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) mark(visible[0].target.id);
  }, { rootMargin: '-80px 0px -60% 0px' });
  sections.forEach(section => observer.observe(section));
}

const SELECTOR_FIELD_TYPES = [
  'firstName', 'lastName', 'fullName', 'email', 'mobile', 'organizationName',
  'registrationNumber', 'paymentReference', 'state', 'district', 'city',
  'pinCode', 'identityNumber',
  ...((window.SFFAFileTypes && window.SFFAFileTypes.FILE_TYPE_DEFINITIONS.map(d => d.type)) || [
    'photo', 'identityDocument', 'addressProof', 'signature', 'authorizationLetter'
  ])
];

/** Validates repeat-row rules and returns the original site-to-rules object. */
function validateRepeatRows(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Repeat rows must be a site-to-rules JSON object');
  for (const [host, rules] of Object.entries(value)) {
    if (!Array.isArray(rules)) throw new Error(`Repeat rows for ${host} must be an array`);
    for (const rule of rules) {
      if (!rule || typeof rule.buttonSelector !== 'string' || typeof rule.rowSelector !== 'string') throw new Error(`Each repeat-row rule for ${host} needs buttonSelector and rowSelector`);
      if (!Number.isInteger(Number(rule.count)) || Number(rule.count) < 0 || Number(rule.count) > 10) throw new Error(`Repeat-row count for ${host} must be between 0 and 10`);
      try { document.querySelector(rule.buttonSelector); document.querySelector(rule.rowSelector); } catch (_) { throw new Error(`Invalid repeat-row selector for ${host}`); }
    }
  }
  return value;
}

/** Shows a transient message in the options page status area. */
function showStatus(msg) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2200);
}

/** Splits a comma-separated settings value into trimmed, non-empty entries. */
function parseCsv(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

/** Parses a small quoted CSV file into rows without evaluating file contents. */
function parseCsvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

/** Imports user-selected synthetic test values from CSV or JSON into local settings. */
async function importProjectTestData(file) {
  const content = await file.text();
  let values = {};
  if (/\.json$/i.test(file.name)) {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const record of parsed) {
        const key = record.field || record.label || record.name || record.type;
        if (key && record.value != null) values[String(key)] = String(record.value);
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string' || typeof value === 'number') values[key] = String(value);
    } else throw new Error('JSON must be an object or an array of field/value records');
  } else {
    const rows = parseCsvRows(content);
    const headers = (rows.shift() || []).map(value => value.trim().toLowerCase());
    const keyColumn = headers.findIndex(value => ['field', 'label', 'name', 'type'].includes(value));
    const valueColumn = headers.findIndex(value => ['value', 'test value', 'testdata'].includes(value));
    if (keyColumn < 0 || valueColumn < 0) throw new Error('CSV needs a field/label/name/type column and a value column');
    for (const row of rows) if (row[keyColumn]?.trim()) values[row[keyColumn].trim()] = row[valueColumn] || '';
  }
  if (!Object.keys(values).length) throw new Error('No field values were found in the selected file');
  await SFFAStorage.updateSettings({ importedTestData: values });
  showStatus(`${Object.keys(values).length} project test value(s) imported locally`);
}


/** Loads saved generation settings into their corresponding form controls. */
async function loadGenerationSettings() {
  const settings = await SFFAStorage.getSettings();
  document.getElementById('identityFormat').value = settings.identityFormat;
  document.getElementById('dataLocale').value = settings.dataLocale || 'IN';
  document.getElementById('dataSeed').value = settings.dataSeed || '';
  document.getElementById('regNumberFormat').value = settings.regNumberFormat;
  document.getElementById('testPinCodes').value = settings.testPinCodes.join(', ');
  document.getElementById('firstNames').value = settings.firstNames.join(', ');
  document.getElementById('lastNames').value = settings.lastNames.join(', ');
  document.getElementById('multiSelectCount').value = settings.multiSelectCount || 2;
  document.getElementById('linkCheckLimit').value = settings.linkCheckLimit ?? 25;
  document.getElementById('spellingIgnoreList').value = (settings.spellingIgnoreList || []).join(', ');
  document.getElementById('spellingDictionary').value = (settings.spellingDictionary || []).join(', ');
  document.getElementById('allowedTestEnvironments').value = (settings.allowedTestEnvironments || []).join(', ');
  document.getElementById('autoClearAfterDays').value = settings.autoClearAfterDays || 0;
  document.getElementById('fillOrder').value = settings.fillOrder === 'type' ? 'type' : 'page';
  document.getElementById('tickSameAsBoxes').checked = settings.tickSameAsBoxes === true;
  document.getElementById('keepExistingValues').checked = settings.keepExistingValues === true;
  document.getElementById('aiEndpointAllowlist').value = (settings.aiEndpointAllowlist || []).join(', ');
  document.getElementById('credentialsBySite').value = JSON.stringify(settings.credentialsBySite || {}, null, 2);
  document.getElementById('repeatRowsBySite').value = JSON.stringify(settings.repeatRowsBySite || {}, null, 2);
}

/** Validates and saves generation settings from the options form, showing errors in status. */
async function saveGenerationSettings() {
  try {
    const patch = {
      identityFormat: document.getElementById('identityFormat').value,
      dataLocale: document.getElementById('dataLocale').value,
      dataSeed: document.getElementById('dataSeed').value.trim().slice(0, 64),
      regNumberFormat: document.getElementById('regNumberFormat').value || '{LETTERS}{DIGITS}',
      testPinCodes: parseCsv(document.getElementById('testPinCodes').value),
      firstNames: parseCsv(document.getElementById('firstNames').value),
      lastNames: parseCsv(document.getElementById('lastNames').value),
      multiSelectCount: Math.max(1, Math.min(10, Number(document.getElementById('multiSelectCount').value) || 2)),
      fillOrder: document.getElementById('fillOrder').value === 'type' ? 'type' : 'page',
      tickSameAsBoxes: document.getElementById('tickSameAsBoxes').checked,
      keepExistingValues: document.getElementById('keepExistingValues').checked,
      linkCheckLimit: Math.max(0, Math.min(100, Number(document.getElementById('linkCheckLimit').value) || 0)),
      spellingIgnoreList: parseCsv(document.getElementById('spellingIgnoreList').value),
      spellingDictionary: parseCsv(document.getElementById('spellingDictionary').value),
      allowedTestEnvironments: parseCsv(document.getElementById('allowedTestEnvironments').value).map(value => normalizeHostname(value)).filter(Boolean),
      autoClearAfterDays: Math.max(0, Math.min(3650, Number(document.getElementById('autoClearAfterDays').value) || 0)),
      aiEndpointAllowlist: parseCsv(document.getElementById('aiEndpointAllowlist').value).map(value => {
        const url = new URL(value);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('AI allowlist entries must be HTTPS origins (HTTP is allowed for localhost)');
        return url.origin;
      }),
      credentialsBySite: JSON.parse(document.getElementById('credentialsBySite').value || '{}'),
      repeatRowsBySite: validateRepeatRows(JSON.parse(document.getElementById('repeatRowsBySite').value || '{}'))
    };
    await SFFAStorage.updateSettings(patch);
    showStatus('Settings saved');
  } catch (error) {
    showStatus(`Invalid settings: ${error.message}`);
  }
}


/** Renders saved file-mapping keyword pairs and an empty editable row when none exist. */
async function loadMappingKeywords() {
  const settings = await SFFAStorage.getSettings();
  const extra = settings.extraFileKeywords || {};
  const container = document.getElementById('mappingsList');
  container.replaceChildren();

  const rows = Object.entries(extra);
  if (!rows.length) rows.push(['', '']);

  rows.forEach(([keyword, type]) => addMappingRow(keyword, type));

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-small';
  addBtn.textContent = '+ Add keyword';
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => addMappingRow('', ''));
  container.appendChild(addBtn);
}

/** Adds editable keyword and file-type inputs to the mapping list. */
function addMappingRow(keyword, type) {
  const container = document.getElementById('mappingsList');
  const addBtnExisting = container.querySelector(':scope > button');
  const { h } = window.SFFADom;

  const removeBtn = h('button', { class: 'remove-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove mapping', 'data-icon': 'x' });
  const row = h('div', { class: 'mapping-row' }, [
    h('input', { type: 'text', placeholder: "Keyword (e.g. 'Aadhar Card')", value: keyword, 'data-role': 'keyword' }),
    h('input', { type: 'text', placeholder: 'Maps to type (e.g. identityDocument)', value: type, 'data-role': 'type' }),
    removeBtn
  ]);
  removeBtn.addEventListener('click', () => row.remove());

  if (addBtnExisting) container.insertBefore(row, addBtnExisting);
  else container.appendChild(row);
}

/** Collects non-empty mapping rows and saves them in extension settings. */
async function saveMappingKeywords() {
  const rows = document.querySelectorAll('.mapping-row');
  const extra = {};
  rows.forEach(row => {
    const keyword = row.querySelector('[data-role="keyword"]').value.trim();
    const type = row.querySelector('[data-role="type"]').value.trim();
    if (keyword && type) extra[keyword] = type;
  });
  await SFFAStorage.updateSettings({ extraFileKeywords: extra });
}


/** Renders one CSS-selector input for every configured selector field type. */
function buildSelectorGrid() {
  const grid = document.getElementById('selectorGrid');
  grid.replaceChildren();
  const { h } = window.SFFADom;
  SELECTOR_FIELD_TYPES.forEach(type => {
    const row = h('div', { class: 'selector-row' }, [
      h('label', { style: 'font-size:12.5px;font-weight:500;', text: type }),
      h('input', { type: 'text', placeholder: 'CSS selector, e.g. #firstName', 'data-selector-type': type }),
      h('span', {})
    ]);
    grid.appendChild(row);
  });
}

/** Renders saved host configurations and binds their delete buttons. */
async function renderSiteConfigList() {
  const all = await SFFAStorage.getSiteConfigs();
  const container = document.getElementById('siteConfigList');
  const hostnames = Object.keys(all);
  if (!hostnames.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No custom site configs saved yet.';
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren();
  const { h } = window.SFFADom;
  hostnames.forEach(host => {
    const fieldCount = Object.keys(all[host].customSelectors || {}).length;
    const removeBtn = h('button', { class: 'remove-btn', type: 'button', 'data-host': host, title: 'Delete', 'aria-label': `Delete config for ${host}`, 'data-icon': 'trash' });
    const div = h('div', { class: 'site-config-item' }, [
      h('span', {}, [h('strong', { text: host }), ` — ${fieldCount} field(s) configured`]),
      removeBtn
    ]);
    removeBtn.addEventListener('click', async (e) => {
      await SFFAStorage.deleteSiteConfig(e.currentTarget.dataset.host);
      renderSiteConfigList();
      showStatus('Site config removed');
    });
    container.appendChild(div);
  });
}

/** Parses a hostname or URL and returns its lowercase hostname, or an empty string. */
function normalizeHostname(value) {
  try {
    const url = new URL(value.includes('://') ? value.trim() : 'https://' + value.trim());
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.hostname.toLowerCase();
  } catch (_) { return ''; }
}

/** Validates selector entries and saves them for the hostname entered in the form. */
async function saveSiteConfig() {
  const hostname = normalizeHostname(document.getElementById('siteHostname').value);
  if (!hostname) {
    showStatus('Enter a hostname first');
    return;
  }
  const customSelectors = {};
  document.querySelectorAll('[data-selector-type]').forEach(input => {
    const val = input.value.trim();
    if (val) {
      try { document.querySelector(val); }
      catch (_) { throw new Error(`Invalid CSS selector for ${input.dataset.selectorType}`); }
      customSelectors[input.dataset.selectorType] = val;
    }
  });
  await SFFAStorage.setSiteConfig(hostname, { customSelectors });
  showStatus(`Saved config for ${hostname}`);
  renderSiteConfigList();
}

/** Loads the current hostname's saved selectors into the options form. */
async function loadSiteConfigIntoForm() {
  const hostname = normalizeHostname(document.getElementById('siteHostname').value);
  if (!hostname) return;
  const config = await SFFAStorage.getSiteConfig(hostname);
  buildSelectorGrid();
  if (config && config.customSelectors) {
    for (const [type, selector] of Object.entries(config.customSelectors)) {
      const input = document.querySelector(`[data-selector-type="${type}"]`);
      if (input) input.value = selector;
    }
  }
}

/** Requests page access when needed and starts the content-script selector picker. */
async function startOptionsSelectorPicker() {
  try {
    const tab = await window.SFFAExt.queryActiveTab();
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('Open a regular website tab first.');
    const hostname = new URL(tab.url).hostname;
    const granted = await window.SFFAExt.permissions?.request({ origins: [`${new URL(tab.url).origin}/*`] });
    if (!granted) throw new Error('Page access was not granted.');
    const scripts = window.SFFAExt.contentScripts;
    const request = { type: 'SFFA_START_ELEMENT_PICKER', options: { selectorMode: true, fieldType: document.getElementById('selectorPickType').value } };
    await window.SFFAExt.sendTabMessage(tab.id, request, scripts);
    showStatus(`Click a field on ${hostname}; press Escape to cancel`);
  } catch (error) {
    showStatus(error.message || 'Could not start the page picker.');
  }
}

/** Applies a selector returned by the content picker to the matching field control. */
function applyPickedSelector(message) {
  if (!message || message.type !== 'SFFA_SELECTOR_PICKED') return;
  document.getElementById('siteHostname').value = message.hostname || '';
  document.getElementById('selectorPickType').value = message.fieldType || '';
  const input = document.querySelector(`[data-selector-type="${CSS.escape(message.fieldType || '')}"]`);
  if (input) input.value = message.selector || '';
  showStatus(input ? `Selector added for ${message.fieldType}; save the site config` : 'Selector received; choose a field type and save it.');
}


/** Loads options data and installs the page's settings event handlers. */
async function init() {
  await loadGenerationSettings();
  await loadMappingKeywords();
  buildSelectorGrid();
  const pickerType = document.getElementById('selectorPickType');
  pickerType.replaceChildren(...SELECTOR_FIELD_TYPES.map(type => {
    const option = document.createElement('option'); option.value = type; option.textContent = type; return option;
  }));
  await renderSiteConfigList();

  document.getElementById('saveGeneration').addEventListener('click', async () => {
    await saveGenerationSettings();
    await saveMappingKeywords();
    showStatus('Settings saved');
  });

  document.getElementById('saveSiteConfig').addEventListener('click', saveSiteConfig);
  document.getElementById('loadSiteConfig').addEventListener('click', loadSiteConfigIntoForm);
  document.getElementById('pickSelectorBtn').addEventListener('click', startOptionsSelectorPicker);
  document.getElementById('importedTestDataFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importProjectTestData(file); }
    catch (error) { showStatus(`Import failed: ${error.message}`); }
    finally { event.target.value = ''; }
  });
  window.SFFAExt.onMessage(applyPickedSelector);
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('unhandledrejection', event => {
  showStatus(event.reason?.message || 'Operation failed. Please try again.');
  event.preventDefault();
});
