// Popup layout, theme, stepper, summary, toast and runtime/tab messaging helpers.

/** Switches the visible popup section and supports arrow-key tab navigation. */
function initSectionTabs() {
  const tabs = Array.from(document.querySelectorAll('[role="tab"][aria-controls]'));
  const tabList = document.querySelector('.section-tabs');
  const fillButton = document.getElementById('fillFormBtn');
  const fillReason = document.getElementById('fillButtonReason');
  const select = tab => {
    tabs.forEach((item, index) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
      if (selected) tabList?.setAttribute('data-active-index', String(index));
    });
    const name = tab?.id === 'tabOutputButton' ? 'output' : tab?.id === 'tabSetupButton' ? 'setup' : 'test';
    document.querySelector('.app')?.setAttribute('data-active-tab', name);
    if (fillButton) {
      fillButton.hidden = name !== 'test';
      fillReason?.classList.toggle('hidden', name !== 'test');
      if (name === 'test') updateFillModePresentation();
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next]?.focus();
      if (tabs[next]) select(tabs[next]);
    });
  });
  if (tabs[0]) select(tabs[0]);
  fillButton?.addEventListener('click', event => {
    if (document.querySelector('.app')?.dataset.activeTab !== 'output') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('printTcBtn')?.click();
  }, true);
}

/** Applies and wires the "Reduce visual effects" switch (localStorage `sffaReduceEffects`). */
function initReduceEffects(root = document.documentElement) {
  let reduced = false;
  try { reduced = localStorage.getItem('sffaReduceEffects') === '1'; } catch (_) { /* Default to full effects. */ }
  const set = on => { if (on) root.dataset.effects = 'reduced'; else delete root.dataset.effects; };
  set(reduced);
  const toggle = document.getElementById('reduceEffectsToggle');
  if (!toggle || toggle.dataset.bound === 'true') return;
  toggle.dataset.bound = 'true';
  toggle.checked = reduced;
  toggle.addEventListener('change', () => {
    set(toggle.checked);
    try { localStorage.setItem('sffaReduceEffects', toggle.checked ? '1' : '0'); } catch (_) { /* Applies for this session only. */ }
  });
}

/** Initializes manual theme selection and popup/side-panel sizing. */
function initThemeAndLayout() {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  // Cycle: system -> light -> dark -> system. Saved under `sffaTheme` ('system' | 'light' | 'dark').
  const ORDER = ['system', 'light', 'dark'];
  const ICON = { system: 'monitor', light: 'sun', dark: 'moon' };
  let stored = 'system';
  try { stored = localStorage.getItem('sffaTheme') || 'system'; } catch (_) { /* Storage may be blocked; fall back to system. */ }
  let current = ORDER.includes(stored) ? stored : 'system';
  const apply = theme => {
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    if (toggle) {
      const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
      toggle.setAttribute('aria-label', `Theme: ${theme}. Switch to ${next} theme`);
      toggle.title = `Theme: ${theme}`;
      document.getElementById('themeModeIcon')?.setAttribute('data-icon', ICON[theme]);
    }
  };
  apply(current);
  initReduceEffects(root);
  toggle?.addEventListener('click', () => {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    try { localStorage.setItem('sffaTheme', current); } catch (_) { /* Non-persistent theme is acceptable. */ }
    apply(current);
  });
  root.dataset.surface = window.innerWidth >= 700 ? 'side-panel' : 'popup';
  window.addEventListener('resize', () => {
    root.dataset.surface = window.innerWidth >= 700 ? 'side-panel' : 'popup';
  });
}

/** Keeps compact workflow labels synchronized with existing workflow state elements. */
function syncStepperState(step, state) {
  const map = { scan: 'stepperScanState', fill: 'stepperFillState', action: 'stepperSubmitState' };
  const target = document.getElementById(map[step]);
  if (!target) return;
  const labels = { notStarted: 'Not started', ready: 'Ready', running: 'Running', done: 'Done', error: 'Error', blocked: 'Blocked' };
  target.textContent = labels[state] || state;
  const item = target.closest('li');
  if (!item) return;
  item.dataset.state = state;
  const icon = item.querySelector('.step-number');
  if (!icon) return;
  const glyph = { done: 'check', blocked: 'lock', error: 'alert' }[state];
  if (glyph) { icon.dataset.icon = glyph; icon.textContent = ''; }
  else { delete icon.dataset.icon; icon.textContent = icon.dataset.step || ''; }
}

/** Adds disclosure semantics and the shared accordion styling to details headers. */
function initAccessibleDisclosures() {
  const decorate = details => {
    const header = details.querySelector(':scope > summary');
    if (!header) return;
    header.classList.add('accordion-summary');
    if (!details.id) details.id = `sffa-disclosure-${Math.random().toString(36).slice(2, 9)}`;
    header.setAttribute('aria-controls', details.id);
    header.setAttribute('aria-expanded', String(details.open));
    if (details.dataset.a11yDisclosureBound !== 'true') {
      details.dataset.a11yDisclosureBound = 'true';
      details.addEventListener('toggle', () => header.setAttribute('aria-expanded', String(details.open)));
    }
  };
  document.querySelectorAll('details').forEach(decorate);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches('details')) decorate(node);
    node.querySelectorAll?.('details').forEach(decorate);
  }))).observe(document.body, { childList: true, subtree: true });
}

/** Shows or hides the banner that explains when extension APIs are unavailable. */
function setExtensionContextBanner(isAvailable, message = '') {
  const banner = document.getElementById('extensionContextBanner');
  const messageEl = document.getElementById('extensionContextMessage');
  const selectTab = document.getElementById('selectTabBanner');
  const openPanel = document.getElementById('openSidePanelBanner');
  const manage = document.getElementById('manageExtensionBanner');
  const cannotRead = /Could not read this page|cannot be inspected/i.test(message);
  const needsAccess = /access needed/i.test(message);
  const noTab = !isAvailable || /No (regular|page|usable|active)|Select a regular|No website/i.test(message);
  let priority = noTab || !isAvailable ? 'no-tab' : needsAccess ? 'needs-access' : cannotRead ? 'cannot-read' : 'ready';
  if (priority === 'ready' && !message) {
    if (banner) banner.classList.add('hidden');
    priority = 'ready';
  } else if (banner) banner.classList.remove('hidden');
  if (banner) banner.dataset.priority = priority;
  if (messageEl) messageEl.textContent = priority === 'no-tab'
    ? 'Open a website with a form to get started'
    : priority === 'needs-access'
      ? (/tab list/i.test(message) ? 'Allow access so QA Kits can list your open website tabs.' : 'Allow QA Kits to read this tab so it can fill the form.')
      : priority === 'cannot-read'
        ? 'Can’t read this page yet. Reload the tab, then try again.'
        : 'Page ready';
  const grant = document.getElementById('grantAccessBanner');
  if (grant) {
    grant.hidden = priority !== 'needs-access';
    grant.textContent = /tab list/i.test(message) ? 'Allow access to list your tabs' : 'Allow access';
  }
  if (selectTab) {
    selectTab.textContent = priority === 'cannot-read' ? 'Reload tab & retry' : 'Choose tab';
    selectTab.hidden = priority === 'ready' || priority === 'needs-access';
    selectTab.setAttribute('aria-label', priority === 'cannot-read' ? 'Reload the selected tab and retry' : 'Choose a regular website tab');
  }
  if (openPanel) openPanel.hidden = priority !== 'ready';
  if (manage) manage.hidden = isAvailable;
  // Without site access the buttons stay clickable: clicking one asks Chrome for access first.
  const canUsePage = priority === 'ready' || priority === 'needs-access';
  document.querySelectorAll('[data-requires-ext]').forEach(btn => {
    btn.disabled = !canUsePage;
    btn.setAttribute('aria-disabled', String(!canUsePage));
  });
  const reason = document.getElementById('fillButtonReason');
  if (reason && !canUsePage) reason.textContent = priority === 'no-tab' ? 'Open a website tab with a form first.' : 'Can’t read this page. Reload the tab and try again.';
  if (reason && priority === 'needs-access') reason.textContent = 'Chrome will ask for access to this site when you start.';
  document.getElementById('targetTabPickerDetails')?.toggleAttribute('hidden', priority === 'ready');
  const statusLabel = document.getElementById('pageStatusLabel');
  if (statusLabel) statusLabel.textContent = priority === 'ready' ? 'Ready' : priority === 'cannot-read' ? 'Blocked' : priority === 'needs-access' ? 'Needs access' : 'No page';
  const dot = document.getElementById('pageStatusDot');
  dot?.setAttribute('data-state', priority === 'ready' ? 'ready' : priority === 'cannot-read' ? 'error' : 'blocked');
  dot?.setAttribute('aria-label', statusLabel?.textContent || 'Blocked');
}

/** Adds explanatory text or tooltips to controls disabled by the current browser context. */
function installDisabledButtonExplanations() {
  /** Sets or removes the automatic tooltip explaining a disabled control. */
  const applyReason = control => {
    const disabled = control.disabled;
    control.setAttribute('aria-disabled', String(disabled));
    if (!control.dataset.disabledReasonId) control.dataset.disabledReasonId = `${control.id || 'control'}DisabledReason`;
    const reasonId = control.dataset.disabledReasonId;
    let reason = document.getElementById(reasonId);
    if (control.id === 'fillFormBtn' || control.matches('input[name="qaMode"]')) return;
    // A button that is disabled because it is busy should not claim the page is unavailable.
    if (disabled && control.getAttribute('aria-busy') === 'true') {
      reason?.remove();
      return;
    }
    if (disabled) {
      const text = control.id === 'pageActionBtn' ? 'Find page actions or pick an element first.'
        : control.id === 'saveDelaySelect' ? 'Enable the repeated-action pause first.'
          : control.hasAttribute('data-requires-ext') ? 'Open a website tab with a form first.'
            : control.id === 'fullQaModeButton' ? 'Wait for the current form run to finish.'
              : control.id === 'captureActivityToggle' ? 'Activity capture is available in Chrome and Edge only.'
              : 'Not available yet.';
      if (!control.title) control.title = text;
      if (!reason) {
        reason = document.createElement('span');
        reason.id = reasonId;
        reason.className = 'disabled-reason';
        reason.textContent = text;
        control.insertAdjacentElement('afterend', reason);
      } else reason.textContent = text;
      const describedBy = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(reasonId);
      control.setAttribute('aria-describedby', [...describedBy].join(' '));
    } else if (reason) {
      reason.remove();
      const describedBy = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id !== reasonId);
      if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
      else control.removeAttribute('aria-describedby');
    }
  };
  document.querySelectorAll('button:disabled, select:disabled, input:disabled, textarea:disabled').forEach(applyReason);
  new MutationObserver(records => {
    records.forEach(record => {
      if (record.target instanceof HTMLButtonElement || record.target instanceof HTMLSelectElement
        || record.target instanceof HTMLInputElement || record.target instanceof HTMLTextAreaElement) applyReason(record.target);
    });
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
}

/** Sends a message to a tab, injecting the required content scripts if necessary. */
async function sendTabMessage(tabId, message, { timeoutMs = 0, watchdogMs = 0 } = {}) {
  debugSummary('tab request', { tabId, type: message?.type });
  let watchdog = null;
  try {
    const request = window.SFFAExt.sendTabMessage(tabId, { ...message, _sffaDebug: isSummaryDebugEnabled() }, CONTENT_SCRIPT_FILES);
    const guards = [request];
    if (timeoutMs > 0) guards.push(new Promise((_, reject) => setTimeout(() => reject(new PageTimeoutError(timeoutMs)), timeoutMs)));
    if (watchdogMs > 0) {
      // Long runs are fine as long as the page keeps reporting progress/heartbeats.
      notePageActivity(tabId);
      guards.push(new Promise((_, reject) => {
        watchdog = setInterval(() => {
          const last = pageActivityByTab.get(tabId) || 0;
          if (Date.now() - last > watchdogMs) reject(new PageTimeoutError(watchdogMs, 'idle'));
        }, 1000);
      }));
    }
    const response = guards.length > 1 ? await Promise.race(guards) : await request;
    debugSummary('tab response', { type: message?.type, response });
    if (response == null) {
      showSummaryError();
      throw new Error('Could not read this page. Reload the tab and try again.');
    }
    return response;
  } catch (error) {
    const messageText = String(error?.message || error);
    if (/Receiving end does not exist|message port closed|Could not establish connection/i.test(messageText)) showSummaryError();
    throw error;
  } finally {
    if (watchdog) clearInterval(watchdog);
  }
}

/** Raised when the page does not answer in time (usually a disconnected or very busy page script). */
class PageTimeoutError extends Error {
  constructor(ms, kind = 'timeout') {
    super(kind === 'idle'
      ? `The page stopped responding (no activity for ${Math.round(ms / 1000)} seconds).`
      : `The page did not respond within ${Math.round(ms / 1000)} seconds.`);
    this.name = 'PageTimeoutError';
  }
}

/** Reloads a tab and resolves once it has finished loading (or after a safety timeout). */
function reloadTabAndWait(tabId, timeoutMs = 20000) {
  return new Promise(resolve => {
    const tabs = window.SFFAExt.tabs;
    if (!tabs?.reload) { resolve(false); return; }
    const timer = setTimeout(() => { tabs.onUpdated?.removeListener?.(listener); resolve(false); }, timeoutMs);
    /** Resolves when the reloaded tab reports status "complete". */
    function listener(id, info) {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      tabs.onUpdated.removeListener(listener);
      resolve(true);
    }
    tabs.onUpdated?.addListener(listener);
    Promise.resolve(tabs.reload(tabId)).catch(() => { clearTimeout(timer); resolve(false); });
  });
}

/** Sends a message to the extension runtime and returns its response or null. */
/** Per-message time limits for popup → background calls (ms). Everything else gets 10s. */
const RUNTIME_MESSAGE_TIMEOUTS = {
  SFFA_CAPTURE_REPORT: 120000, SFFA_VIEWPORT_PREVIEW: 120000, SFFA_APPLY_VIEWPORT: 120000, SFFA_RESTORE_VIEWPORT: 120000,
  SFFA_START_CAPTURE: 30000, SFFA_STOP_CAPTURE: 30000, SFFA_NETWORK_PROFILE: 30000, SFFA_AI_CHAT: 25000
};

/**
 * Sends a message to the extension background. Never waits forever: on timeout it resolves with
 * { ok: false, timedOut: true, error } so callers' existing `response.ok` handling shows a message.
 */
async function sendRuntimeMessage(message, { timeoutMs } = {}) {
  const ms = timeoutMs ?? RUNTIME_MESSAGE_TIMEOUTS[message?.type] ?? 10000;
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, timedOut: true, error: `The extension background did not respond within ${Math.round(ms / 1000)} seconds.` }), ms);
  });
  try { return await Promise.race([window.SFFAExt.api.sendRuntimeMessage(message), timeout]); }
  finally { clearTimeout(timer); }
}

/** Last time (ms) each tab showed signs of life: progress, heartbeat or scan stage messages. */
const pageActivityByTab = new Map();

/** Records activity from a page; called by the popup's runtime message listener. */
function notePageActivity(tabId) {
  pageActivityByTab.set(tabId ?? 'unknown', Date.now());
}

/** Updates the viewport zoom control to reflect the current preview setting. */
function renderViewportZoom() {
  const image = document.getElementById('viewportZoomImage');
  const level = document.getElementById('viewportZoomLevel');
  if (image?.naturalWidth) image.style.width = `${Math.round(image.naturalWidth * viewportZoom)}px`;
  if (level) level.textContent = `${Math.round(viewportZoom * 100)}%`;
}

/** Renders the active tab's cached QA summary in the popup. */
function renderSummary() {
  const values = {
    fields: summary.fields,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    issues: summary.issues,
    score: summary.score,
    accessibility: summary.accessibility,
    console: summary.console,
    network: summary.network,
    duration: summary.durationMs === null ? null : `${(summary.durationMs / 1000).toFixed(1)}s`
  };

  for (const [key, value] of Object.entries(values)) {
    const metric = document.querySelector(`[data-dashboard="${key}"]`);
    if (!metric) continue;
    metric.textContent = value === null ? '—' : String(value);
    if (key === 'score') {
      metric.classList.remove('score-good', 'score-medium', 'score-poor');
      if (value !== null) {
        if (value >= 80) metric.classList.add('score-good');
        else if (value >= 60) metric.classList.add('score-medium');
        else metric.classList.add('score-poor');
      }
    }
  }
  const grid = document.querySelector('.qa-dashboard-grid.qa-primary-grid');
  const empty = document.querySelector('.qa-empty-state');
  const more = document.querySelector('.qa-more-metrics');
  grid?.classList.toggle('hidden', !summary.hasRun);
  if (empty) empty.classList.toggle('hidden', summary.hasRun);
  const bar = document.getElementById('qaResultBar');
  if (bar) {
    const pass = Number(summary.passed) || 0, fail = Number(summary.failed) || 0, skip = Number(summary.skipped) || 0;
    const total = pass + fail + skip;
    bar.classList.toggle('hidden', !summary.hasRun);
    const pct = n => (total ? `${(n / total) * 100}%` : '0%');
    bar.querySelector('.bar-pass').style.width = pct(pass);
    bar.querySelector('.bar-warn').style.width = pct(skip);
    bar.querySelector('.bar-fail').style.width = pct(fail);
    bar.setAttribute('aria-label', total ? `${pass} passed, ${skip} skipped, ${fail} failed` : 'Pass, skipped and failed proportion: no data');
  }
  if (more) more.classList.toggle('hidden', !summary.hasRun);
}

/** Checks the local setting that enables extra summary diagnostics. */
function isSummaryDebugEnabled() {
  try { return localStorage.getItem('sffaDebug') === '1'; }
  catch (_) { return false; }
}

/** Logs summary payload diagnostics when summary debugging is enabled. */
function debugSummary(source, raw) {
  const line = document.getElementById('summaryDebug');
  if (!isSummaryDebugEnabled()) {
    line?.classList.add('hidden');
    return;
  }
  const time = new Date().toLocaleTimeString();
  const json = JSON.stringify(raw ?? null);
  console.debug('[QA Kits summary]', { time, source, raw });
  if (line) {
    line.textContent = `last update: ${time}, source: ${source}, raw: ${json}`;
    line.classList.remove('hidden');
  }
}

/** Clears the visible summary and resets its per-tab state. */
function resetSummary() {
  Object.assign(summary, {
    fields: null, passed: null, failed: null, skipped: null, issues: null, score: null,
    accessibility: null, console: null, network: null, durationMs: null, hasRun: false
  });
  renderSummary();
}

/** Builds a storage key for a tab's cached summary. */
function makeSummaryKey(tab) {
  return tab?.id == null ? null : `${tab.id}|${tab.url || ''}`;
}

/** Loads and renders the saved summary associated with a tab. */
async function restoreSummaryForTab(tab) {
  activeSummaryTab = tab || null;
  activeSummaryKey = makeSummaryKey(tab);
  resetSummary();
  if (!activeSummaryKey || !hasExt()) return;
  const summaries = await window.SFFAExt.store.get(SUMMARY_STORAGE_KEY, {});
  const saved = summaries[activeSummaryKey];
  if (!saved || typeof saved !== 'object') return;
  Object.assign(summary, saved);
  renderSummary();
  debugSummary('restore', saved);
}

/** Saves and renders new summary values for the selected tab. */
async function updateSummary(values, source, raw, tab = activeSummaryTab) {
  Object.assign(summary, values);
  renderSummary();
  document.getElementById('summaryError')?.classList.add('hidden');
  debugSummary(source, raw);
  if (!summary.hasRun || !hasExt()) return;
  const key = makeSummaryKey(tab);
  if (!key) return;
  activeSummaryTab = tab;
  activeSummaryKey = key;
  const summaries = await window.SFFAExt.store.get(SUMMARY_STORAGE_KEY, {});
  summaries[key] = { ...summary };
  await window.SFFAExt.store.set(SUMMARY_STORAGE_KEY, summaries);
}

/** Updates QA dashboard counts from a result payload and records its source. */
function updateQaDashboard(values, source = 'action', raw = values) {
  const next = { ...values };
  if (Object.hasOwn(next, 'tests')) {
    next.fields = next.tests;
    delete next.tests;
  }
  if (Object.hasOwn(next, 'duration')) {
    const seconds = Number.parseFloat(next.duration);
    next.durationMs = Number.isFinite(seconds) ? seconds * 1000 : null;
    delete next.duration;
  }
  if (Object.hasOwn(next, 'passed') && Object.hasOwn(next, 'failed')) {
    const total = Number(next.passed) + Number(next.failed);
    if (total > 0) next.score = Math.round((Number(next.passed) / total) * 100);
    else next.score = null;
  }
  next.hasRun = true;
  return updateSummary(next, source, raw);
}

/** Displays the popup's summary unavailable state. */
function showSummaryError() {
  document.getElementById('summaryError')?.classList.remove('hidden');
}

/** Checks whether a file's metadata matches a configured upload type definition. */
function isFileCompatibleWithType(file, typeDef) {
  if (!typeDef || typeDef.mediaKind !== 'image') return true;
  const ext = window.SFFAFileTypes ? window.SFFAFileTypes.getFileExtension(file.name) : '';
  const mime = (file.type || '').toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || ext === '.gif' || mime.startsWith('image/');
}

/** Creates a locally unique identifier for a file record. */
function uid() {
  return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Formats a byte count using a suitable byte, kilobyte, or megabyte unit. */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Chooses a display icon from a file's category or filename extension. */
function iconForType(file) {
  const name = typeof file === 'string' ? '' : (file && file.name) || '';
  const mime = typeof file === 'string' ? file : (file && file.type) || '';
  const ext = window.SFFAFileTypes ? window.SFFAFileTypes.getFileExtension(name) : '';
  if (ext === '.pdf' || mime === 'application/pdf') return 'PDF';
  if (ext === '.doc' || ext === '.docx' || mime === 'application/msword' || mime.includes('wordprocessingml')) return 'DOC';
  if (ext === '.xls' || ext === '.xlsx' || ext === '.csv' || mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || mime === 'text/csv') return 'XLS';
  if (ext === '.txt' || mime === 'text/plain') return 'TXT';
  if (mime.startsWith('image/')) return 'IMG';
  return 'FILE';
}

/** Maps a stored file to an icon name from popup/icons.js. */
function iconNameForType(file) {
  const label = iconForType(file);
  return label === 'IMG' ? 'image' : label === 'FILE' ? 'file' : 'fileText';
}

/**
 * Shows the styled confirmation dialog and resolves true when the user continues.
 * Falls back to window.confirm where <dialog> is unavailable.
 */
function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'Continue', tone = 'danger' } = {}) {
  const dialog = document.getElementById('confirmDialog');
  if (!dialog || typeof dialog.showModal !== 'function') return Promise.resolve(window.confirm(message));
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const ok = document.getElementById('confirmOk');
  ok.textContent = confirmLabel;
  ok.className = `btn btn-small ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`;
  dialog.dataset.tone = tone;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
    document.getElementById('confirmCancel').focus();
  });
}

/** Builds one result row: optional status pill, label, and a right-aligned value. */
function resultLine(label, value, tone = null, pillText = null) {
  const { h } = window.SFFADom;
  const left = h('span', { class: 'result-label' }, [
    ...(tone ? [h('span', { class: `pill pill-${tone}`, text: pillText || { success: 'OK', warning: 'Check', danger: 'Fail', info: 'Info', accent: 'Run' }[tone] })] : []),
    h('span', { text: label })
  ]);
  return h('div', { class: `fill-result-line${tone === 'warning' ? ' verify-warn' : tone === 'danger' ? ' verify-fail' : ''}` }, [left, h('span', { text: String(value) })]);
}

/** Renders a shimmering placeholder into a result container while work is in progress. */
function renderSkeleton(container, { tiles = 4, lines = 3 } = {}) {
  const { h } = window.SFFADom;
  container.classList.remove('hidden');
  container.setAttribute('aria-busy', 'true');
  container.replaceChildren(h('div', { class: 'skeleton-group', 'aria-hidden': 'true' }, [
    h('div', { class: 'skeleton-tiles' }, Array.from({ length: tiles }, () => h('span', { class: 'skeleton skeleton-tile' }))),
    ...Array.from({ length: lines }, (_, i) => h('span', { class: `skeleton${i === lines - 1 ? ' skeleton-line-short' : ''}` }))
  ]));
}

/** Renders an inline error with a recovery action into a result container. */
function renderInlineError(container, message, actionLabel, onAction) {
  const { h } = window.SFFADom;
  container.removeAttribute('aria-busy');
  container.classList.remove('hidden');
  const action = h('button', { class: 'btn btn-small', type: 'button', 'data-icon': 'refresh', text: actionLabel });
  action.addEventListener('click', onAction);
  container.replaceChildren(h('div', { class: 'result-error', role: 'alert', 'data-icon': 'xCircle' }, [
    h('div', {}, [h('span', { text: friendlyError(message) }), action])
  ]));
}

/**
 * Turns technical browser/extension errors into plain-language messages with a next step.
 * Unknown messages are returned unchanged.
 */
function friendlyError(message) {
  const text = String(message == null ? '' : message);
  const rules = [
    [/Receiving end does not exist|Could not establish connection|message port closed|Could not read this page/i, 'Couldn’t connect to the page. Reload the website tab and try again.'],
    [/cannot be scripted|Cannot access (contents|a chrome)|chrome:\/\/|edge:\/\/|about:|Cannot run on this type of page|cannot be inspected/i, 'This kind of page can’t be used (browser pages and extension stores are blocked). Open a regular website tab.'],
    [/Extension context invalidated/i, 'The extension was just updated. Close this panel and open it again.'],
    [/No active tab|No tab with id|No page is selected/i, 'No website tab found. Open the form you want to test, then try again.'],
    [/permission/i, 'The browser needs your permission for this site. Allow access when asked, then try again.'],
    [/Failed to fetch|NetworkError|net::ERR/i, 'A network request failed. Check your connection and try again.'],
    [/background did not respond/i, 'The extension’s background stopped responding. Close this panel and open it again. If it keeps happening, reload the extension at chrome://extensions.'],
    [/page did not respond within|page stopped responding/i, 'The page stopped responding to the extension. Reload the page and try again.'],
    [/timed out|timeout/i, 'That took too long. Please try again.'],
    [/Run cancelled|cancelled/i, 'Stopped.']
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? match[1] : text;
}

/** Displays a transient popup notification. */
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.dataset.icon = 'info';
    document.body.appendChild(toast);
  }
  toast.textContent = sanitizeReportText(friendlyError(msg));
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

/** Adds tooltip behavior to elements marked with the popup tooltip attributes. */
function installTooltips() {
  let activeTooltip = null;
  const triggers = document.querySelectorAll('.help-tip[title], [data-tooltip]');

  triggers.forEach((trigger, index) => {
    const text = trigger.dataset.tooltip || trigger.getAttribute('title');
    if (!text) return;
    trigger.removeAttribute('title');
    trigger.dataset.tooltip = text;
    trigger.classList.add('tooltip-trigger');

    const tooltip = document.createElement('span');
    tooltip.id = `sffa-tooltip-${index + 1}`;
    tooltip.className = 'ui-tooltip hidden';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = text;
    trigger.appendChild(tooltip);

    const descriptions = new Set((trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    descriptions.add(tooltip.id);
    trigger.setAttribute('aria-describedby', [...descriptions].join(' '));

    /** Hides this tooltip and clears it as the active tooltip if applicable. */
    const hide = () => {
      tooltip.classList.add('hidden');
      if (activeTooltip === tooltip) activeTooltip = null;
    };
    /** Positions and reveals this tooltip while hiding any previously active tooltip. */
    const show = () => {
      tooltip.classList.remove('hidden');
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const leftViewport = Math.max(8, Math.min(
        triggerRect.left + (triggerRect.width - tooltipWidth) / 2,
        window.innerWidth - tooltipWidth - 8
      ));
      tooltip.style.left = `${leftViewport - triggerRect.left}px`;
      const belowTop = trigger.offsetHeight + 6;
      tooltip.style.top = triggerRect.bottom + tooltipHeight + 6 <= window.innerHeight - 8
        ? `${belowTop}px`
        : `${-tooltipHeight - 6}px`;
      activeTooltip = tooltip;
    };

    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('mouseleave', event => {
      if (!tooltip.contains(event.relatedTarget)) hide();
    });
    trigger.addEventListener('focus', show);
    trigger.addEventListener('blur', hide);
    tooltip.addEventListener('mouseleave', hide);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeTooltip) {
      activeTooltip.classList.add('hidden');
      activeTooltip = null;
    }
  });
}

/** Updates a button's visible label while preserving its icon element. */
function setActionButtonLabel(button, label) {
  const tooltip = button.querySelector(':scope > .ui-tooltip');
  if (!tooltip) {
    button.textContent = label;
    return;
  }
  const textNode = Array.from(button.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = label;
  else button.insertBefore(document.createTextNode(label), tooltip);
}
