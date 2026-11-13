// Test tab: target tab, content-script injection, scan page, fill/QA runs and page actions.

/** Returns the active tab or null when tab access fails. */
async function getActiveTab() {
  if (!hasExt()) {
    throw new Error('Extension context not detected. Load this folder via chrome://extensions → Load unpacked, then open it from the toolbar icon.');
  }

  return selectedTargetTab || window.SFFAExt.queryActiveTab();
}

/** Lists regular tabs and selects one after requesting its host access when needed. */
async function showTargetTabPicker() {
  const label = document.getElementById('targetTabPickerLabel');
  const select = document.getElementById('targetTabPicker');
  if (!hasExt() || !window.SFFAExt.tabs?.query || !label || !select) return;
  try {
    const ownPrefix = window.SFFAExt.runtime?.getURL?.('') || 'chrome-extension://';
    const allTabs = (await window.SFFAExt.tabs.query({ currentWindow: true })).filter(tab => !String(tab.url || '').startsWith(ownPrefix));
    availableTargetTabs = allTabs.filter(tab => /^https?:\/\//i.test(tab.url || ''));
    // Without the `tabs` permission or site access, Chrome hides tab URLs and titles.
    const hiddenTabs = allTabs.filter(tab => !tab.url);
    if (!availableTargetTabs.length && hiddenTabs.length) {
      select.replaceChildren();
      label.hidden = true;
      showTargetTabPicker.pending = true;
      setExtensionContextBanner(true, 'Tab list access needed.');
      return;
    }
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a tab…';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    for (const tab of availableTargetTabs) {
      const option = document.createElement('option');
      option.value = String(tab.id);
      option.textContent = `${tab.title || 'Untitled page'} — ${new URL(tab.url).hostname}`;
      option.selected = String(tab.id) === String(selectedTargetTab?.id || (await window.SFFAExt.queryActiveTab())?.id);
      select.appendChild(option);
    }
    if (hiddenTabs.length) {
      const note = document.createElement('option');
      note.disabled = true;
      note.textContent = `${hiddenTabs.length} other tab${hiddenTabs.length === 1 ? '' : 's'} hidden — allow access to list ${hiddenTabs.length === 1 ? 'it' : 'them'}`;
      select.appendChild(note);
    }
    label.hidden = false;
    if (!availableTargetTabs.length) {
      select.disabled = true;
      label.hidden = true;
      document.getElementById('targetTabPickerDetails')?.setAttribute('hidden', '');
      setExtensionContextBanner(true, 'No regular website tabs are available in this window. Open a website, then select it here.');
      return;
    }
    select.disabled = false;
    if (select.dataset.bound !== 'true') {
      select.dataset.bound = 'true';
      select.addEventListener('change', async () => {
        const target = availableTargetTabs.find(tab => String(tab.id) === select.value);
        if (!target) return;
        const active = await window.SFFAExt.queryActiveTab();
        if (target.id !== active?.id) {
          let origin;
          try { origin = `${new URL(target.url).origin}/*`; } catch (_) { return; }
          if (!await window.SFFAExt.permissions?.request({ origins: [origin] })) {
            setExtensionContextBanner(true, 'Page access was not granted. Choose the active tab or grant access in the browser prompt.');
            return;
          }
        }
        selectedTargetTab = target;
        await updateTargetTab();
      });
    }
    await updateTargetTab();
  } catch (error) {
    setExtensionContextBanner(true, 'Could not list tabs. Select a regular website tab and try again.');
    await SFFALogger.log(`Tab selection failed: ${error.message}`, 'warn');
  }
}

const RESTRICTED_URL_PREFIXES = [
  'chrome://', 'edge://', 'chrome-extension://', 'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com/', 'https://addons.mozilla.org/', 'devtools://',
  'about:', 'moz-extension://'
];
/** Checks whether a URL uses a browser-restricted scheme that prevents script injection. */
function isRestrictedPageUrl(url) {
  return RESTRICTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

/** Page scripts in load order (defined once in utils/ext.js). */
const CONTENT_SCRIPT_FILES = window.SFFAExt?.contentScripts || [];

/** Ensures the popup's content scripts are present in the target tab. */
async function ensureContentScriptInjected(tabId) {
  try {
    await Promise.race([
      // A lightweight PING (not SFFA_DETECT_ONLY, which runs full field detection) just confirms the page script is loaded.
      window.SFFAExt.sendTabMessage(tabId, { type: 'SFFA_PING' }, CONTENT_SCRIPT_FILES),
      new Promise((_, reject) => setTimeout(() => reject(new PageTimeoutError(15000)), 15000))
    ]);
    return true;
  } catch (_) {
    showSummaryError();
    return false;
  }
}

/** Updates the fill progress indicator using completed and total field counts. */
function setProgress(done, total) {
  const wrap = document.getElementById('progressWrap');
  const progressbar = document.getElementById('fillProgressbar');
  const bar = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  const percentLabel = document.getElementById('progressPercent');
  wrap.classList.remove('hidden');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  bar.style.width = `${pct}%`;
  progressbar.setAttribute('aria-valuenow', String(pct));
  percentLabel.textContent = `${pct}%`;
  label.textContent = `${done} / ${total} fields completed`;
}

const FILL_MODE_DESCRIPTIONS = {
  normal: 'Fills every field with realistic fake data.',
  positive: 'Fills the fields you pick with correct values.',
  negative: 'Fills the fields you pick with wrong values to test error messages.',
  boundary: 'Fills the fields you pick with very short, very long and min/max values.',
  fullqa: 'Tries valid, wrong and edge-case data, then offers the report to download. Nothing is submitted unless you turn it on.'
};
const FILL_BUTTON_LABELS = {
  normal: 'Fill the form', positive: 'Fill with valid data', negative: 'Fill with wrong data',
  boundary: 'Fill with edge cases', fullqa: 'Run full QA'
};
const NEXT_STEP_HINTS = {
  normal: 'Next: check the page, then submit it yourself or use step 3.',
  positive: 'Next: check that the form accepted the values without errors.',
  negative: 'Next: check that the page shows clear error messages.',
  boundary: 'Next: check how the page handled the limits.',
  fullqa: 'Download the report you need with the buttons below. Open the Output tab for the summary.'
};

/** Updates labels and controls to match the selected fill mode. */
function updateFillModePresentation() {
  const mode = getSelectedQaMode();
  document.getElementById('fullQaModeButton')?.setAttribute('aria-pressed', String(mode === 'fullqa'));
  document.querySelectorAll('.mode-option').forEach(option => {
    const radio = option.querySelector('input[name="qaMode"]');
    option.classList.toggle('is-selected', !!radio?.checked);
  });
  document.getElementById('modeDescription').textContent = FILL_MODE_DESCRIPTIONS[mode] || FILL_MODE_DESCRIPTIONS.normal;
  document.getElementById('fullQaOptions').classList.toggle('hidden', mode !== 'fullqa');
  document.getElementById('qaFieldScope').classList.toggle('hidden', !isFieldScopedMode(mode));
  const oneByOne = document.getElementById('qaOneByOne');
  if (oneByOne) {
    oneByOne.hidden = !(mode === 'negative' || mode === 'boundary');
    if (!oneByOne.hidden) loadQaTargetFields();
  }
  const button = document.getElementById('fillFormBtn');
  const reason = document.getElementById('fillButtonReason');
  if (reason && hasExt()) reason.textContent = FILL_MODE_DESCRIPTIONS[mode] || FILL_MODE_DESCRIPTIONS.normal;
  if (!button.disabled) {
    button.classList.remove('is-success', 'is-error');
    setActionButtonLabel(button, FILL_BUTTON_LABELS[mode] || FILL_BUTTON_LABELS.normal);
  }
  try { localStorage.setItem('sffaLastMode', mode); } catch (_) { /* Remembering the mode is optional. */ }
}

/**
 * Fills the "Field" list for one-field-at-a-time Wrong data / Edge case runs from the page's
 * current fields (within the Required / Optional choice). Keeps the current choice when possible.
 */
async function loadQaTargetFields() {
  const select = document.getElementById('qaTargetField');
  if (!select || !hasExt()) return;
  const keep = select.value;
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url || isRestrictedPageUrl(tab.url)) return;
    const response = await withTimeout(window.SFFAExt.sendTabMessage(tab.id, { type: 'SFFA_LIST_TESTABLE_FIELDS', fieldScope: getSelectedFieldScope() }, CONTENT_SCRIPT_FILES), 8000, null);
    if (!response?.ok) return;
    const { h } = window.SFFADom;
    const kindName = { text: 'box', select: 'dropdown', radio: 'options', checkboxGroup: 'checkboxes', checkbox: 'checkbox' };
    select.replaceChildren(
      h('option', { value: '', text: `All fields (${response.fields.length})` }),
      ...response.fields.map(f => h('option', { value: f.key, text: `${f.label} — ${kindName[f.kind] || f.kind}` }))
    );
    select.value = response.fields.some(f => f.key === keep) ? keep : '';
  } catch (_) { /* The list stays as it was; the run itself reports a missing field. */ }
}

/** Updates the fill status panel's state, message, and optional details visibility. */
function setFillStatus(state, message, showDetails = false) {
  const status = document.getElementById('fillStatus');
  const symbols = { running: 'clock', success: 'checkCircle', warning: 'alert', error: 'xCircle' };
  status.replaceChildren();
  status.className = `fill-status ${state}`;
  const icon = document.createElement('span');
  icon.className = 'fill-status-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.dataset.icon = symbols[state] || 'info';
  const text = document.createElement('span');
  text.className = 'fill-status-text';
  text.textContent = state === 'error' ? friendlyError(message) : message;
  status.append(icon, text);
  if (state === 'success' || state === 'warning') {
    const next = document.createElement('span');
    next.className = 'fill-status-next';
    next.textContent = NEXT_STEP_HINTS[getSelectedQaMode()] || NEXT_STEP_HINTS.normal;
    status.appendChild(next);
  }
  if (showDetails) {
    const details = document.createElement('button');
    details.className = 'fill-status-details';
    details.type = 'button';
    details.textContent = 'View details';
    details.addEventListener('click', () => {
      const logView = document.getElementById('logView');
      if (logView.classList.contains('hidden')) document.getElementById('toggleLogView').click();
      logView.closest('section')?.scrollIntoView?.({ block: 'nearest' });
    });
    status.appendChild(details);
  }
  status.classList.remove('hidden');
}

/** Prepares the popup UI for a fill run and displays its current activity. */
function beginFillUi(mode, activity) {
  const button = document.getElementById('fillFormBtn');
  button.disabled = true;
  button.classList.remove('is-success', 'is-error');
  button.classList.add('is-running');
  button.setAttribute('aria-busy', 'true');
  setActionButtonLabel(button, mode === 'fullqa' ? 'Running full QA...' : mode === 'positive' ? 'Filling valid data...' : mode === 'negative' ? 'Trying wrong data...' : mode === 'boundary' ? 'Trying edge cases...' : 'Filling form...');
  setWorkflowStep('fill', 'running', 'The selected run is in progress.');
  const fullQaButton = document.getElementById('fullQaModeButton');
  if (fullQaButton) fullQaButton.disabled = true;
  document.querySelectorAll('input[name="qaMode"]').forEach(radio => { radio.disabled = true; });
  const stop = document.getElementById('cancelFillBtn');
  stop.disabled = false;
  stop.hidden = false;
  stop.textContent = 'Stop fill / QA run';
  document.getElementById('fillResult').classList.add('hidden');
  document.getElementById('fillPhase').classList.toggle('hidden', mode !== 'fullqa');
  document.getElementById('progressActivity').textContent = activity;
  setFillStatus('running', activity);
  setProgress(0, 1);
}

/** Restores fill controls and displays the final run status. */
function finishFillUi(state, message, mode = getSelectedQaMode(), showDetails = false) {
  const button = document.getElementById('fillFormBtn');
  button.disabled = false;
  button.classList.remove('is-running', 'is-success', 'is-error');
  button.removeAttribute('aria-busy');
  document.querySelectorAll('input[name="qaMode"]').forEach(radio => { radio.disabled = false; });
  const fullQaButton = document.getElementById('fullQaModeButton');
  if (fullQaButton) fullQaButton.disabled = false;
  if (state === 'success') {
    button.classList.add('is-success');
    setActionButtonLabel(button, FILL_BUTTON_LABELS[mode] || FILL_BUTTON_LABELS.normal);
  } else {
    updateFillModePresentation();
    if (state === 'error') button.classList.add('is-error');
  }
  setWorkflowStep('fill', state === 'error' ? 'error' : 'done', state === 'error' ? 'See the Activity Log for details.' : 'Review results in Output.');
  const actionState = document.getElementById('actionStepState');
  if (actionState?.dataset.state === 'notStarted' || actionState?.dataset.state === 'blocked') {
    setWorkflowStep('action', 'ready', 'Choose an action to continue.');
  }
  const stop = document.getElementById('cancelFillBtn');
  stop.disabled = true;
  stop.hidden = true;
  stop.textContent = 'Stop fill / QA run';
  setFillStatus(state, message, showDetails);
}

/** Displays the appropriate empty result message when no fields were found. */
function renderEmptyFillState(resultEl, scopeOnly = false) {
  const { h } = window.SFFADom;
  document.getElementById('progressWrap').classList.add('hidden');
  const analyzeButton = h('button', { class: 'btn btn-small btn-secondary', type: 'button', text: 'Analyze Page' });
  analyzeButton.addEventListener('click', () => document.getElementById('scanPageBtn').click());
  resultEl.classList.remove('hidden');
  resultEl.replaceChildren(
    h('div', { class: 'fill-result-title', text: scopeOnly ? 'No fields match this scope' : 'No fillable fields detected' }),
    h('p', { text: scopeOnly ? 'Change the required/optional selection or analyze the page.' : 'Analyze the page to review detected controls.' }),
    analyzeButton
  );
}

/** Renders progress text and step counts for the full QA workflow. */
function updateFullQaProgress(message) {
  const phaseNames = {
    detecting: 'Analyzing',
    filling: 'Filling',
    positive: 'Valid data',
    negative: 'Wrong data',
    boundary: 'Edge cases',
    verifying: 'Validating',
    validating: 'Validating',
    advancing: 'Submitting',
    done: 'Reporting',
    cancelled: 'Stopping'
  };
  const phase = phaseNames[message.phase] || 'Running';
  const phaseWrap = document.getElementById('fillPhase');
  phaseWrap.classList.remove('hidden');
  document.getElementById('fillPhaseLabel').textContent = phase;
  document.getElementById('progressActivity').textContent = `Full QA · ${phase}`;
  const total = Math.max(1, Number(message.maxSteps) || 1);
  const step = Math.max(0, Math.min(total, Number(message.step) || 0));
  const percent = Math.round((step / total) * 100);
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('fillProgressbar').setAttribute('aria-valuenow', String(percent));
  document.getElementById('progressPercent').textContent = `${percent}%`;
  document.getElementById('progressLabel').textContent = `${step} / ${total} steps · ${phase}`;
}

/** Renders per-field outcomes and summary information from a fill response. */
function renderFillResult(summary, mode = 'normal') {
  const el = document.getElementById('fillResult');
  el.classList.remove('hidden');
  const filled = summary.textFilled + summary.dropdownsFilled + summary.radiosFilled
    + summary.checkboxesFilled + summary.filesUploaded;
  const { h } = window.SFFADom;
  el.replaceChildren(
    h('div', { class: 'fill-result-title', 'data-icon': 'checkCircle', text: mode === 'positive' ? 'Valid data filled' : 'Form fill completed' }),
    resultLine('Fields filled / attached', filled, 'success', 'Filled'),
    resultLine('File fields attached', summary.filesUploaded, summary.filesUploaded ? 'success' : null, 'Attached'),
    resultLine('Fields skipped', summary.skipped.length, summary.skipped.length ? 'warning' : null, 'Skipped')
  );
}


/** Returns the selected QA/fill mode from the popup controls. */
function getSelectedQaMode() {
  if (document.getElementById('fullQaModeButton')?.getAttribute('aria-pressed') === 'true') return 'fullqa';
  const el = document.querySelector('input[name="qaMode"]:checked');
  return el ? el.value : 'normal';
}

/** Shows one workflow step as current and updates its icon, label, and reason. */
function setWorkflowStep(step, state, reason = '') {
  const el = document.getElementById(`${step}StepState`);
  if (!el) return;
  const labels = {
    notStarted: ['info', 'Not started', ''], ready: ['checkCircle', 'Ready', 'accent'], running: ['clock', 'Running', 'accent'],
    done: ['check', 'Done', 'success'], error: ['alert', 'Error', 'danger'], blocked: ['lock', 'Blocked', '']
  };
  const [icon, label, tone] = labels[state] || labels.notStarted;
  el.dataset.state = state;
  el.setAttribute('aria-label', `${label}${reason ? `: ${reason}` : ''}`);
  const badge = document.createElement('span');
  badge.className = `badge${tone ? ` badge-${tone}` : ''}`;
  badge.dataset.icon = icon;
  badge.textContent = label;
  el.replaceChildren(badge);
  const reasonId = `${step}StepReason`;
  let reasonEl = document.getElementById(reasonId);
  if (!reasonEl && state === 'blocked') {
    reasonEl = document.createElement('span');
    reasonEl.id = reasonId;
    reasonEl.className = 'workflow-blocked-reason';
    el.insertAdjacentElement('afterend', reasonEl);
  }
  if (reasonEl) {
    const displayReason = state === 'blocked' ? (reason || 'Complete the previous step first.') : reason;
    reasonEl.textContent = displayReason;
    reasonEl.hidden = !displayReason;
  }
  if (state === 'blocked' && reason) {
    el.title = reason;
    if (reasonEl) el.setAttribute('aria-describedby', reasonId);
  } else {
    el.removeAttribute('title');
    el.removeAttribute('aria-describedby');
  }
  syncStepperState(step, state);
  // Reveal the optional page-action step once a fill has finished, so the next step is visible.
  if (step === 'action' && state === 'ready' && !setWorkflowStep.actionRevealed) {
    const details = document.getElementById('actionDetails');
    if (details) { details.open = true; setWorkflowStep.actionRevealed = true; }
  }
  document.querySelectorAll('.step-current').forEach(card => card.classList.remove('step-current'));
  if (state === 'ready' || state === 'running') el.closest('.card')?.classList.add('step-current');
  const stickyReason = document.getElementById('fillButtonReason');
  if (step === 'fill' && stickyReason && reason) stickyReason.textContent = reason;
  if (step === 'action') {
    const helper = document.getElementById('pageActionHelper');
    if (helper && reason) helper.textContent = reason;
  }
}

/** Returns the required/optional field scope selected in the popup. */
function getSelectedFieldScope() {
  return {
    includeRequired: document.getElementById('includeRequiredFields').checked,
    includeOptional: document.getElementById('includeOptionalFields').checked
  };
}

/** Checks whether a mode uses the field-scope controls. */
function isFieldScopedMode(mode) {
  return ['positive', 'negative', 'boundary'].includes(mode);
}

/** Appends field verification and validation messages to a fill result panel. */
function appendVerificationPanel(container, verification, validationErrors) {
  if (!verification && !(validationErrors && validationErrors.length)) return;
  try { applyFieldResults(container, verification); } catch (error) { console.warn('[QA Kits] Could not show per-field results:', error); }
  const { h } = window.SFFADom;
  if (verification) {
    container.appendChild(resultLine('Verified accepted', verification.pass, 'success', 'Verified'));
    if (verification.warn) container.appendChild(resultLine('Could not verify', verification.warn, 'warning', 'Unverified'));
    if (verification.fail) container.appendChild(resultLine('Failed verification', verification.fail, 'danger', 'Failed'));
    if (verification.details && verification.details.length) {
      const list = h('ul', { class: 'scan-issue-list' });
      verification.details.slice(0, 25).forEach(d => {
        const failed = d.fieldStatus === 'FAILED';
        list.appendChild(h('li', {}, [
          h('span', { class: `pill pill-${failed ? 'danger' : 'warning'}`, text: failed ? 'Failed' : 'Unverified' }),
          h('span', { text: ` "${d.label}": expected ${d.expected}, got ${d.actual}` })
        ]));
      });
      container.appendChild(list);
    }
  }
  if (validationErrors && validationErrors.length) {
    container.appendChild(resultLine('Page-reported validation errors', validationErrors.length, 'danger', 'Validation'));
    const list = h('ul', { class: 'scan-issue-list' });
    validationErrors.slice(0, 10).forEach(err => list.appendChild(h('li', { text: err.message })));
    container.appendChild(list);
  }
}

/** Formats a scanned URL for display while removing sensitive components. */
function scanSafeUrl(value) {
  if (!value || value === '(empty href)') return value || '(no URL)';
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : u.protocol + '[redacted]'; }
  catch (_) { return String(value).startsWith('(') ? String(value) : '[invalid URL]'; }
}

/** True when an error means the page script is unreachable or stopped responding. */
function isPageUnreachableError(error) {
  return error instanceof PageTimeoutError
    || /Receiving end does not exist|Could not establish connection|Could not read this page|message port closed/i.test(String(error?.message || error));
}

/**
 * After a fill/QA run stalls, add a "Reload page" action to the status line. It does not re-run
 * automatically: reloading usually closes modals, so the user reopens the form first.
 */
function offerPageReloadAfterStall(error) {
  if (!isPageUnreachableError(error)) return;
  const status = document.getElementById('fillStatus');
  if (!status || status.querySelector('.reload-page')) return;
  const { h } = window.SFFADom;
  const button = h('button', { class: 'btn btn-small btn-primary reload-page', type: 'button', 'data-icon': 'refresh', text: 'Reload page' });
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Reloading…';
    const tab = await getActiveTab().catch(() => null);
    const reloaded = tab?.id ? await reloadTabAndWait(tab.id) : false;
    button.disabled = false;
    button.textContent = 'Reload page';
    showToast(reloaded ? 'Page reloaded. Open the form again, then press Fill.' : 'Could not reload the page. Reload it yourself, then try again.');
  });
  status.appendChild(button);
}

/**
 * Shows the "Element selected" card in the extension (step 3) for an element picked on the page.
 * `pick` = { label, matchCount, mode, risky } from the page; label text is page-controlled, so it is
 * only ever rendered as text.
 */
/** Choices for the wait between clicks when a pick matches several elements (milliseconds). */
const PICKED_INTERVAL_CHOICES = [0, 500, 1000, 2000, 3000, 5000, 10000, 30000, 60000];
/** The tester's last chosen interval (from settings); undefined until loaded. */
let pickedIntervalPreference;

/** "0.5 s", "2 s", "1 min", "1 min 30 s". */
function formatIntervalLabel(ms) {
  if (!ms) return 'No wait';
  if (ms < 1000) return `${ms / 1000} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

/** Rough total time for clicking `count` elements with `intervalMs` between clicks. */
function estimatePickedRun(count, intervalMs) {
  const ms = Math.max(0, count - 1) * intervalMs + count * 150;
  return ms < 1000 ? 'under a second' : `about ${formatIntervalLabel(Math.round(ms / 1000) * 1000)}`;
}

/** Interval to preselect: the tester's last choice, else 1 s (or the larger 100+ pause from Advanced settings). */
function defaultPickedInterval(pick) {
  if (Number.isFinite(pickedIntervalPreference)) return pickedIntervalPreference;
  return Math.max(1000, Number(pick.suggestedIntervalMs) || 0);
}

function renderPickedElementCard(pick) {
  const card = document.getElementById('pickedElementCard');
  if (!card) return;
  if (!pick) { card.hidden = true; card.replaceChildren(); return; }
  const { h } = window.SFFADom;
  const dryRun = document.getElementById('actionDryRunToggle')?.checked !== false;
  const many = pick.matchCount > 1;
  const runLabel = dryRun ? 'Highlight (dry run)'
    : pick.risky ? (many ? `Confirm risky click all (${pick.matchCount})` : 'Confirm risky click')
      : many ? `Click all (${pick.matchCount})` : 'Click it';
  const modeText = intervalMs => (dryRun ? 'Dry run (nothing is clicked)'
    : many ? (intervalMs ? `One by one, ${formatIntervalLabel(intervalMs)} apart` : 'One by one, no wait') : 'Single click');
  let intervalMs = defaultPickedInterval(pick);
  const modeLine = resultLine('Mode', modeText(intervalMs));
  const rows = [
    resultLine('Label', `"${pick.label}"`),
    resultLine('Matches found', pick.matchCount),
    modeLine
  ];
  if (pick.risky) rows.push(resultLine('Risk', 'May be destructive: confirmation required', 'danger', 'Risky'));

  // Wait between clicks: only meaningful when the pick matches several elements.
  let intervalRow = null;
  if (many) {
    const choices = PICKED_INTERVAL_CHOICES.includes(intervalMs) ? PICKED_INTERVAL_CHOICES : [...PICKED_INTERVAL_CHOICES, intervalMs].sort((a, b) => a - b);
    const select = h('select', { id: 'pickedIntervalSelect', 'aria-describedby': 'pickedIntervalHint' },
      choices.map(ms => h('option', { value: String(ms), text: formatIntervalLabel(ms) })));
    select.value = String(intervalMs);
    const hint = h('span', { id: 'pickedIntervalHint', class: 'picked-interval-hint', text: '' });
    const refresh = () => {
      hint.textContent = `${pick.matchCount} clicks take ${estimatePickedRun(pick.matchCount, intervalMs)}. Give the page time to save between clicks.`;
      modeLine.lastElementChild.textContent = modeText(intervalMs);
    };
    refresh();
    select.addEventListener('change', async () => {
      intervalMs = Number(select.value) || 0;
      select.dataset.touched = '1';
      refresh();
      pickedIntervalPreference = intervalMs;
      await SFFAStorage.updateSettings({ pickedClickIntervalMs: intervalMs }).catch(() => {});
    });
    intervalRow = h('div', { class: 'picked-card-interval' }, [
      h('label', { for: 'pickedIntervalSelect', text: 'Wait between clicks' }),
      select,
      hint
    ]);
    // Load the remembered choice once, without overriding a choice made meanwhile.
    if (pickedIntervalPreference === undefined) {
      SFFAStorage.getSettings().then(settings => {
        pickedIntervalPreference = Number.isFinite(settings.pickedClickIntervalMs) ? settings.pickedClickIntervalMs : null;
        if (pickedIntervalPreference !== null && !select.dataset.touched && card.contains(select)) {
          if (![...select.options].some(o => Number(o.value) === pickedIntervalPreference)) {
            select.append(h('option', { value: String(pickedIntervalPreference), text: formatIntervalLabel(pickedIntervalPreference) }));
          }
          intervalMs = pickedIntervalPreference;
          select.value = String(intervalMs);
          refresh();
        }
      }).catch(() => { pickedIntervalPreference = null; });
    }
  }

  const runButton = h('button', { id: 'pickedRunBtn', class: `btn btn-small ${pick.risky && !dryRun ? 'btn-danger' : 'btn-primary'}`, type: 'button', 'data-icon': dryRun ? 'target' : 'play', text: runLabel });
  const cancelButton = h('button', { id: 'pickedCancelBtn', class: 'btn btn-small', type: 'button', 'data-icon': 'x', text: 'Cancel' });
  card.replaceChildren(...[
    h('div', { id: 'pickedElementTitle', class: 'picked-card-head', 'data-icon': 'pointer', text: 'Element selected' }),
    h('div', { class: 'picked-card-body' }, rows),
    intervalRow,
    h('div', { class: 'picked-card-progress', 'aria-hidden': 'true' }, [h('span')]),
    h('div', { class: 'picked-card-status', id: 'pickedStatus', role: 'status' }),
    h('div', { class: 'picked-card-actions' }, [cancelButton, runButton])
  ].filter(Boolean));
  card.hidden = false;
  card.dataset.pick = JSON.stringify(pick);
  document.getElementById('actionDetails')?.setAttribute('open', '');
  runButton.addEventListener('click', () => runPickedElement(pick, many ? intervalMs : 0));
  cancelButton.addEventListener('click', async () => {
    // While a run is going this button is "Stop" (handled in runPickedElement): keep the card and the pick.
    if (runButton.getAttribute('aria-busy') === 'true') return;
    const tab = await getActiveTab().catch(() => null);
    if (tab?.id) await sendTabMessage(tab.id, { type: 'SFFA_CANCEL_PICKED_ELEMENT' }, { timeoutMs: 10000 }).catch(() => {});
    renderPickedElementCard(null);
  });
}

/** Updates the card while the page clicks the picked element(s). */
function updatePickedProgress(message) {
  const card = document.getElementById('pickedElementCard');
  if (!card || card.hidden) return;
  const status = card.querySelector('.picked-card-status');
  if (status && message.status) status.textContent = message.status;
  const bar = card.querySelector('.picked-card-progress > span');
  if (bar && message.total) bar.style.width = `${Math.round((message.clicked / message.total) * 100)}%`;
}

/** Runs the picked element from the card: dry run highlights, otherwise clicks (risky ones confirm first). */
async function runPickedElement(pick, intervalMs = 0) {
  const card = document.getElementById('pickedElementCard');
  const runButton = document.getElementById('pickedRunBtn');
  const cancelButton = document.getElementById('pickedCancelBtn');
  const intervalSelect = document.getElementById('pickedIntervalSelect');
  const status = card?.querySelector('.picked-card-status');
  const dryRun = document.getElementById('actionDryRunToggle')?.checked !== false;
  if (runButton.dataset.pickAgain) { onPickElementClick(); return; }
  if (!dryRun && pick.risky && !await confirmDialog(`“${pick.label}” looks like a destructive action (for example delete, pay or sign out). Clicking it may change data on the website.`, { title: 'Click this risky element?', confirmLabel: 'Click it anyway' })) return;
  let pickGone = false;
  runButton.disabled = true;
  runButton.setAttribute('aria-busy', 'true');
  if (intervalSelect) intervalSelect.disabled = true;
  // While clicking, Cancel becomes Stop.
  cancelButton.textContent = 'Stop';
  cancelButton.dataset.icon = 'stop';
  const stop = async () => {
    const tab = await getActiveTab().catch(() => null);
    if (tab?.id) await sendTabMessage(tab.id, { type: 'SFFA_STOP_PAGE_ACTION' }, { timeoutMs: 10000 }).catch(() => {});
  };
  cancelButton.addEventListener('click', stop, { once: true, capture: true });
  if (status) status.textContent = dryRun ? 'Highlighting on the page…' : 'Clicking…';
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('No active tab found');
    // The page sends a heartbeat every few seconds during long waits, so the watchdog only fires if it truly stalls.
    const result = await sendTabMessage(tab.id, { type: 'SFFA_RUN_PICKED_ELEMENT', dryRun, intervalMs }, { watchdogMs: 30000 });
    if (result?.code === 'SFFA_PICK_GONE') {
      pickGone = true;
      if (status) status.textContent = result.error;
      return;
    }
    if (!result?.ok) throw new Error(result?.error || 'The picked element could not be run.');
    if (status) status.textContent = result.status;
    const bar = card.querySelector('.picked-card-progress > span');
    if (bar && result.total) bar.style.width = `${Math.round(((result.dryRun ? result.total : result.clicked) / result.total) * 100)}%`;
    if (!result.dryRun) {
      setWorkflowStep('action', 'done', result.status);
      // The pick is kept on the page, so the same element(s) can be clicked again.
      setActionButtonLabel(runButton, pick.matchCount > 1 ? `Click all again (${pick.matchCount})` : 'Click again');
    }
    await renderLogs();
  } catch (error) {
    if (status) status.textContent = friendlyError(error.message);
    offerPageReloadAfterStall(error);
  } finally {
    runButton.disabled = false;
    runButton.removeAttribute('aria-busy');
    if (intervalSelect) intervalSelect.disabled = false;
    cancelButton.removeEventListener('click', stop, { capture: true });
    cancelButton.textContent = 'Close';
    cancelButton.dataset.icon = 'x';
    if (pickGone) {
      // Nothing left to run: offer a new pick instead of a button that can only fail again.
      runButton.dataset.pickAgain = '1';
      runButton.className = 'btn btn-small btn-primary';
      runButton.dataset.icon = 'pointer';
      setActionButtonLabel(runButton, 'Pick again');
      if (intervalSelect) intervalSelect.disabled = true;
    }
  }
}

/** Shows a pick made while the popup was closed (picking on the page closes the toolbar popup). */
async function restorePendingPick() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) return;
    const response = await withTimeout(window.SFFAExt.sendTabMessage(tab.id, { type: 'SFFA_GET_PICKED_ELEMENT' }, []), 3000, null);
    if (response?.ok && response.pick) renderPickedElementCard(response.pick);
  } catch (_) { /* No page script loaded yet: nothing was picked. */ }
}

/** Adds a "Reload page & retry" button to a scan error: the most reliable recovery for a stuck page. */
function addReloadAndRetry(resultEl) {
  const host = resultEl.querySelector('.result-error > div');
  if (!host || host.querySelector('.reload-retry')) return;
  const { h } = window.SFFADom;
  const button = h('button', { class: 'btn btn-small btn-primary reload-retry', type: 'button', 'data-icon': 'refresh', text: 'Reload page & retry' });
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Reloading page…';
    const tab = await getActiveTab().catch(() => null);
    if (tab?.id) await reloadTabAndWait(tab.id);
    document.getElementById('scanPageBtn')?.click();
  });
  host.querySelector('.btn')?.before(button);
}

/** Shows which scan stage is running on the Scan button and in the loading area. */
function updateScanProgress(message) {
  const btn = document.getElementById('scanPageBtn');
  if (!btn || btn.getAttribute('aria-busy') !== 'true') return;
  const labels = { fields: 'reading fields', accessibility: 'checking accessibility', links: 'checking links' };
  btn.textContent = `Scanning… ${labels[message.stage] || 'working'}${message.detail ? ` ${message.detail}` : ''}`;
}

const FIELD_KIND_ICONS = {
  email: 'globe', tel: 'phone', url: 'external', number: 'ruler', date: 'clock', 'datetime-local': 'clock', time: 'clock', month: 'clock', week: 'clock',
  password: 'lock', textarea: 'fileText', richtext: 'fileText', select: 'list', radio: 'target', checkbox: 'check', file: 'upload', search: 'search'
};
const FIELD_STATUS_PILLS = {
  pass: ['success', 'Filled'], warn: ['warning', 'Unverified'], fail: ['danger', 'Failed'], skipped: ['', 'Skipped']
};

/** Builds the "Detected fields" list: type icon, label, type, Required / Low confidence pills. */
function renderFieldList(fields, total = fields.length) {
  const { h } = window.SFFADom;
  const list = h('ul', { class: 'field-list' });
  for (const field of fields) {
    const pills = [];
    if (field.required) pills.push(h('span', { class: 'pill pill-accent', text: 'Required' }));
    if (field.confidence === 'LOW') pills.push(h('span', { class: 'pill pill-warning', text: 'Low confidence', title: 'The field type was guessed; check the filled value.' }));
    list.appendChild(h('li', { class: 'field-row', 'data-field-key': field.key, title: field.selector || '' }, [
      h('span', { class: 'field-type-icon', 'data-icon': FIELD_KIND_ICONS[field.kind] || 'fill', 'aria-hidden': 'true' }),
      h('span', { class: 'field-main' }, [
        h('span', { class: 'field-label', text: field.label }),
        h('span', { class: 'field-meta', text: [field.type, field.kind].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') })
      ]),
      h('span', { class: 'field-pills' }, [...pills, h('span', { class: 'field-status', hidden: '' })])
    ]));
  }
  const summaryText = total > fields.length ? `Detected fields (${fields.length} of ${total})` : `Detected fields (${fields.length})`;
  return h('details', { class: 'scan-details field-list-group', open: '' }, [
    h('summary', {}, [h('span', { class: 'scan-arrow', 'aria-hidden': 'true', 'data-icon': 'chevronRight' }), h('span', { text: summaryText }), h('span', { class: 'scan-count', text: String(total) })]),
    list
  ]);
}

/**
 * Marks each detected field Filled / Unverified / Failed / Skipped after a fill. Uses the scan list
 * when present; otherwise renders the list from the verification results into `container`.
 */
function applyFieldResults(container, verification) {
  const results = Array.isArray(verification?.fields) ? verification.fields : null;
  if (!results || !results.length) return;
  let list = document.querySelector('#scanResult .field-list');
  if (!list) {
    const group = renderFieldList(results.map(item => ({ key: item.key, label: item.label, kind: '', type: '', required: false, confidence: 'HIGH' })));
    group.querySelector('summary span:nth-child(2)').textContent = `Field results (${results.length})`;
    container.appendChild(group);
    list = group.querySelector('.field-list');
  }
  const byKey = new Map(results.map(item => [item.key, item]));
  for (const row of list.querySelectorAll('li[data-field-key]')) {
    const result = byKey.get(row.dataset.fieldKey);
    const statusKey = result ? (result.status === 'warn' && /still empty|not have been recognized/i.test(result.note) ? 'skipped' : result.status) : 'skipped';
    const [tone, text] = FIELD_STATUS_PILLS[statusKey];
    const pill = row.querySelector('.field-status');
    pill.hidden = false;
    pill.className = `field-status pill${tone ? ` pill-${tone}` : ''}`;
    pill.textContent = text;
    pill.title = result?.note || (result ? '' : 'Not part of this run (outside the selected field scope or not fillable).');
    row.dataset.status = statusKey;
  }
}

/** Hides scan findings that do not contain the query and opens groups that do. */
function filterScanDetails(container, query) {
  const needle = String(query || '').trim().toLowerCase();
  container.querySelectorAll('.field-list > li').forEach(item => {
    item.classList.toggle('is-filtered-out', !!needle && !item.textContent.toLowerCase().includes(needle));
  });
  container.querySelectorAll('.scan-details').forEach(group => {
    let matches = 0;
    group.querySelectorAll('.scan-detail-list > li, .field-list > li').forEach(item => {
      const hit = !needle || item.textContent.toLowerCase().includes(needle);
      item.classList.toggle('is-filtered-out', !hit);
      if (hit) matches++;
    });
    const titleHit = needle && group.querySelector('summary')?.textContent.toLowerCase().includes(needle);
    group.classList.toggle('is-filtered-out', !!needle && !matches && !titleHit);
    if (needle && matches) group.open = true;
  });
}

/** Builds a collapsible details section for a list of scan findings. */
function scanDetails(label, items, expanded = false, helpText = '') {
  const { h } = window.SFFADom;
  const list = h('ol', { class: 'scan-detail-list' });
  for (const item of items) {
    const entry = typeof item === 'string' ? {text:item} : item;
    const content = [h('strong', {text:entry.text || entry.label || entry.word || 'Page element'})];
    if (entry.status !== undefined) content.push(h('span', {class:'scan-status',text:String(entry.status)}));
    if (entry.href || entry.src) content.push(h('div', {class:'scan-url',text:scanSafeUrl(entry.href || entry.src)}));
    if (entry.locator) content.push(h('div', {text:'Location: '+entry.locator}));
    const reason = entry.reason || entry.reasons?.join('; ') || (entry.suggestion ? 'Suggestion: '+entry.suggestion : '');
    if (reason) content.push(h('div', {text:reason}));
    list.appendChild(h('li', {}, content));
  }
  if (!items.length) list.appendChild(h('li', {text:'No items detected in this category.'}));
  // Optional notes behind a help (i) button in the group title (hover or focus to read; it does not open the group).
  const help = [];
  if (helpText) {
    const id = `scanHelp${++scanDetails.helpCount}`;
    const tip = h('button', { class: 'help-tip', type: 'button', 'aria-label': `Help: ${label}`, 'aria-describedby': id, text: 'i' });
    tip.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); tip.focus(); });
    help.push(tip, h('span', { id, class: 'help-tooltip', role: 'tooltip', text: helpText }));
  }
  return h('details', {class:`scan-details${helpText ? ' has-help' : ''}`,open:expanded ? '' : null}, [
    h('summary', {}, [h('span',{class:'scan-arrow','aria-hidden':'true','data-icon':'chevronRight'}),h('span',{text:label}),...help,h('span',{class:'scan-count',text:String(items.length)})]),list
  ]);
}

scanDetails.helpCount = 0;

/** Requests a page QA scan and renders its results in the popup. */
async function onScanPageClick() {
  const btn = document.getElementById('scanPageBtn');
  const resultEl = document.getElementById('scanResult');
  clearSecurityScanReport();
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  setWorkflowStep('scan', 'running', 'Scanning the current page.');
  btn.textContent = 'Scanning...';
  renderSkeleton(resultEl);
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      showSummaryError();
      throw new Error('Could not read this page. Reload the tab and try again.');
    }

    btn.textContent = 'Scanning… reading fields';
    const response = await sendTabMessage(tab.id, { type: 'SFFA_SCAN_PAGE' }, { timeoutMs: 60000 });
    if (!response || !response.ok) throw new Error(response?.error || 'Scan failed');
    const r = response.result;
    const captured = await sendRuntimeMessage({ type: 'SFFA_CAPTURE_COUNTS', tabId: tab.id });
    await updateQaDashboard({
      fields: Number(r.fieldCount) || 0,
      issues: (r.potentialIssues?.length || 0) + (r.accessibility?.findings?.length || 0),
      accessibility: r.accessibility?.findings?.length || 0,
      console: captured?.consoleErrors ?? 0,
      network: captured?.failedRequests ?? 0
    }, 'scan', { scan: r, captured });
    document.getElementById('summaryError')?.classList.add('hidden');

    const { h } = window.SFFADom;
    resultEl.classList.remove('hidden');
    const rows = [
      ['Forms', r.forms], ['Inputs', r.inputs], ['Textareas', r.textareas],
      ['Dropdowns', r.dropdowns], ['Custom dropdowns', r.customDropdowns],
      ['Radio groups', r.radioGroups], ['Checkboxes', r.checkboxes],
      ['File uploads', r.fileUploads], ['Required', r.required],
      ['Disabled', r.disabled], ['Read-only', r.readonly], ['Hidden', r.hidden],
      ['Iframes (accessible / total)', `${r.iframes.accessible} / ${r.iframes.total}`],
      ['Page context', r.pageContext || 'general'],
      ['CAPTCHA detected', r.securityBoundaries?.captcha ? 'Manual action required' : 'No'],
      ['MFA detected', r.securityBoundaries?.mfa ? 'Manual action may be required' : 'No'],
      ['Inaccessible iframes', r.securityBoundaries?.inaccessibleFrames || 0]
    ];
    const findingsCount = (r.potentialIssues?.length || 0) + (r.accessibility?.findings?.length || 0);
    const tile = (icon, label, value, tone) => h('div', { class: 'stat-tile', 'data-tone': tone || null }, [
      h('span', { class: 'stat-label', 'data-icon': icon, text: label }), h('span', { class: 'stat-value', text: String(value ?? 0) })
    ]);
    const children = [
      h('div', { class: 'fill-result-title', 'data-icon': 'checkCircle', text: `Page scan complete · ${r.durationMs}ms` }),
      h('div', { class: 'stat-grid' }, [
        tile('fill', 'Fields', r.fieldCount, 'accent'),
        tile('alert', 'Required', r.required),
        tile('upload', 'File inputs', r.fileUploads),
        tile('shield', 'Findings', findingsCount, findingsCount ? 'warning' : null)
      ])
    ];
    if (Array.isArray(r.fieldList) && r.fieldList.length) children.push(renderFieldList(r.fieldList, r.fieldListTotal));
    const breakdown = h('details', { class: 'scan-breakdown collapsible-inline' }, [h('summary', { text: 'Scan breakdown' })]);
    rows.forEach(([label, val]) => breakdown.appendChild(
      h('div', { class: 'fill-result-line' }, [h('span', { text: label }), h('span', { text: String(val) })])
    ));
    children.push(breakdown);
    const filterInput = h('input', { type: 'search', placeholder: 'Filter findings, links, fields…', 'aria-label': 'Filter scan findings', autocomplete: 'off' });
    filterInput.addEventListener('input', () => filterScanDetails(resultEl, filterInput.value));
    children.push(h('div', { class: 'scan-filter', 'data-icon': 'search' }, [filterInput]));
    const linkChecks = (r.linkChecks || []).map(check => ({
      ...check,
      text: check.text || r.exploratory?.links?.find(link => link.href === scanSafeUrl(check.href))?.text || '(link destination)',
      status: typeof check.status === 'number' ? (check.ok ? 'HTTP '+check.status : 'Failed — HTTP '+check.status) : (check.reason === 'cross-origin' ? 'Not checked' : 'Unverified'),
      reason: check.reason === 'cross-origin' ? 'Cross-origin link was not requested by this scan.' : (check.reason || (typeof check.status === 'number' ? 'HTTP response only; page content and business behavior are not verified.' : 'HTTP status could not be verified.'))
    }));
    const issues = [...(r.issueDetails || (r.potentialIssues || []).map(text => ({text,status:'Warning'}))),
      ...linkChecks.filter((_, i) => r.linkChecks[i].ok === false || typeof r.linkChecks[i].status !== 'number')];
    children.push(h('p',{class:'scan-detail-note',text:'Open a group to see details. Links are shown without query strings for privacy.'}));
    children.push(scanDetails('Potential issues / checks needing review', issues, true));
    children.push(scanDetails('All page links', r.exploratory?.links || []));
    children.push(scanDetails('Invalid / suspicious links', r.exploratory?.invalidLinks || []));
    const checked = r.linkChecks || [];
    const passed = checked.filter(x => typeof x.status === 'number' && x.ok === true).length;
    const failed = checked.filter(x => typeof x.status === 'number' && x.ok === false).length;
    children.push(scanDetails(`Link checks: ${passed} passed / ${failed} failed / ${checked.length - passed - failed} unverified`, linkChecks));
    children.push(scanDetails('Possible spelling issues', r.exploratory?.spelling || []));
    children.push(scanDetails('Broken images', r.exploratory?.brokenImages || []));
    children.push(scanDetails('Images still loading / unverified', r.exploratory?.pendingImages || []));
    const accessibilityIssues = (r.accessibility?.findings || []).map(finding => ({
      text: `${finding.severity}: ${finding.title} (confidence: ${finding.confidence || 'Unrated'})`,
      locator: finding.selector,
      reason: finding.recommendation
    }));
    children.push(scanDetails(`Accessibility: ${({ ISSUES_FOUND: 'issues found', NO_STATIC_ISSUES_FOUND: 'no issues found' })[r.accessibility?.status] || String(r.accessibility?.status || 'unavailable').toLowerCase().replace(/_/g, ' ')}`, accessibilityIssues, false, (r.accessibility?.limitations || []).join(' ')));
    children.push(scanDetails('Low-confidence fields', r.lowConfidenceFields || []));
    children.push(scanDetails('Risky action buttons', r.riskyButtons || []));
    resultEl.removeAttribute('aria-busy');
    resultEl.replaceChildren(...children);
    setWorkflowStep('scan', 'done', 'Review findings before filling.');
    if (document.getElementById('fillStepState')?.dataset.state === 'notStarted') setWorkflowStep('fill', 'ready', 'Choose a fill mode. Scanning is optional before a later fill.');
    await SFFALogger.log(`Scan complete: ${r.fieldCount} field(s) recognized, ${r.potentialIssues.length} potential issue(s).`, 'info');
    await renderLogs();
  } catch (err) {
    setWorkflowStep('scan', 'error', 'See the error message and retry.');
    renderInlineError(resultEl, err.message, 'Retry scan', () => document.getElementById('scanPageBtn').click());
    addReloadAndRetry(resultEl);
    showToast(err.message);
  } finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    btn.textContent = 'Scan page';
  }
}

/** Requests a heuristic security scan and renders findings and warnings. */
async function onSecurityScanClick() {
  const btn=document.getElementById('securityScanBtn'); btn.disabled=true; btn.textContent='Scanning...';
  try {
    const tab=await getActiveTab(); if(!tab?.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot scan this type of page');
    if(!await ensureContentScriptInjected(tab.id)) {
      showSummaryError();
      throw new Error('Could not read this page. Reload the tab and try again.');
    }
    const response=await sendTabMessage(tab.id,{type:'SFFA_SECURITY_SCAN'},{ timeoutMs: 30000 });
    if(!response?.ok) throw new Error(response?.error||'Security scan failed');
    const r=response.result, {h}=window.SFFADom, resultEl=document.getElementById('scanResult');
    const safeScanUrl = window.SFFAQAReport.sanitizeUrl(r?.url || 'Unknown URL');
    const score = Number.isFinite(r?.score) ? Math.max(0, Math.min(100, Number(r.score))) : 0;
    lastSecurityScan = {
      score,
      url: safeScanUrl,
      title: tab.title || '',
      tabId: tab.id,
      scannedAt: r?.scannedAt || new Date().toISOString(),
      findings: Array.isArray(r?.findings) ? r.findings : [],
      warnings: Array.isArray(r?.warnings) ? r.warnings : []
    };
    await updateQaDashboard({ issues: (summary.issues || 0) + (Array.isArray(r?.findings) ? r.findings.length : 0) }, 'security scan', { ...r, url: safeScanUrl });
    document.getElementById('summaryError')?.classList.add('hidden');
    resultEl.classList.remove('hidden');
    document.getElementById('securityScanActions').classList.remove('hidden');
    const items=Array.isArray(r?.findings) && r.findings.length ? r.findings.map(f=>h('li',{},[h('span',{text:`${f.severity}: ${f.title} (confidence: ${f.confidence || 'Unrated'}) — ${f.description}`}),f.affected?.length?h('div',{class:'scan-fix',text:`Affected (${f.affected.length}): ${f.affected.slice(0,3).map(u=>window.SFFAQAReport.sanitizeUrl(u)).join(', ')}${f.affected.length>3?` and ${f.affected.length-3} more`:''}`}):null,f.remediation?h('div',{class:'scan-fix',text:`How to fix: ${f.remediation}`}):null])) : [h('li',{text:'No passive findings detected.'})];
    for (const warning of r.warnings || []) items.push(h('li', {text: `UNVERIFIED: ${warning.description}`}));
    resultEl.replaceChildren(h('div',{class:'fill-result-title',text:`Security score: ${r.score}/100${r.warnings?.length ? ' (partial scan)' : ''}`}),h('p',{text:`${r.findings.length} finding(s) | ${safeScanUrl}`}),h('ul',{class:'scan-issue-list'},items));
  } catch(e){ showToast(e.message); } finally { btn.disabled=false; btn.textContent='Security scan'; }
}

/** Hides "Copy report" and forgets the security scan (its results are no longer on screen). */
function clearSecurityScanReport() {
  lastSecurityScan = null;
  document.getElementById('securityScanActions')?.classList.add('hidden');
}

/** Converts a security scan into a complete plain-text report for copying (email, Word, Jira). */
function buildSecurityScanReportText(scan) {
  if (!scan) return '';
  const order = ['Critical', 'High', 'Medium', 'Low', 'Info'];
  const findings = [...scan.findings].sort((a, b) => {
    const ia = order.indexOf(a.severity), ib = order.indexOf(b.severity);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
  const counts = order.map(level => [level, findings.filter(f => (f.severity || 'Info') === level).length]).filter(([, n]) => n);
  let when = scan.scannedAt;
  try { when = new Date(scan.scannedAt).toLocaleString(); } catch (_) { /* keep ISO text */ }
  const line = '-'.repeat(60);
  const lines = [
    'SECURITY SCAN REPORT — QA Kits',
    line,
    `Page:        ${scan.title ? `${scan.title} — ` : ''}${scan.url}`,
    `Scanned:     ${when}`,
    `Score:       ${scan.score}/100${scan.warnings?.length ? ' (partial scan: some checks could not be confirmed)' : ''}`,
    `Findings:    ${findings.length}${counts.length ? ` (${counts.map(([level, n]) => `${n} ${level}`).join(', ')})` : ''}`,
    line,
    ''
  ];
  if (!findings.length) lines.push('No issues were found by this passive check.', '');
  findings.forEach((f, i) => {
    lines.push(`${i + 1}. [${f.severity || 'Info'}] ${f.title || 'Finding'}`);
    lines.push(`   What was found: ${String(f.description || 'No details.').replace(/\s*\(\d+ occurrences; scored once\.\)$/, '')}`);
    if (f.affected?.length) {
      lines.push(`   Affected (${f.affected.length}):`);
      f.affected.slice(0, 20).forEach(item => lines.push(`     - ${window.SFFAQAReport.sanitizeUrl(item)}`));
      if (f.affected.length > 20) lines.push(`     … and ${f.affected.length - 20} more`);
    }
    if (f.remediation) lines.push(`   How to fix:     ${f.remediation}`);
    const meta = [f.confidence ? `Confidence: ${f.confidence}` : '', f.owasp ? `OWASP: ${f.owasp}` : '', f.occurrences > 1 ? `Seen ${f.occurrences} times` : ''].filter(Boolean);
    if (meta.length) lines.push(`   ${meta.join(' | ')}`);
    lines.push('');
  });
  if (scan.warnings?.length) {
    lines.push('Could not be confirmed from the page (check manually):');
    for (const warning of scan.warnings) lines.push(`- ${warning.description || warning.title || 'Unverified check'}`);
    lines.push('');
  }
  lines.push(line,
    'About this scan: a passive check of the page as it was loaded in the browser. It does not attack the site',
    'and does not test server security headers, cookies, login or other pages. A good score does not mean the',
    'site is secure; use it as a starting point for a full security test.');
  return lines.join('\n');
}

/** Copies text, falling back to a hidden text area when the Clipboard API is blocked. */
async function copyTextToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
    area.remove();
    return ok;
  }
}

/** Copies the complete security scan report of the current tab to the clipboard. */
async function copySecurityScanReport() {
  if (!lastSecurityScan) {
    showToast('Run a security scan before copying the report');
    return;
  }
  const tab = await getActiveTab().catch(() => null);
  if (tab?.id && lastSecurityScan.tabId && tab.id !== lastSecurityScan.tabId) {
    showToast('This report is for another tab. Run Security scan again on this page.');
    return;
  }
  const text = buildSecurityScanReportText(lastSecurityScan);
  const findings = lastSecurityScan.findings.length;
  showToast(await copyTextToClipboard(text)
    ? `Security report copied (${findings} finding${findings === 1 ? '' : 's'})`
    : 'Copy failed — select the report manually');
}

let lastSecurityScan = null;
let lastPageActionScan = null;

/** Renders page-action candidates and their risk labels in the popup. */
function renderPageActionScan(scan) {
  const countEl = document.getElementById('actionButtonCount');
  const preview = document.getElementById('actionButtonPreview');
  const actionBtn = document.getElementById('pageActionBtn');
  lastPageActionScan = scan;

  countEl.textContent = `${scan.total} action${scan.total === 1 ? '' : 's'} / ${scan.saveCount} Save`;
  actionBtn.disabled = scan.total === 0;
  actionBtn.title = scan.total === 0 ? 'No safe page action was found.' : '';
  preview.classList.remove('hidden');

  const { h } = window.SFFADom;
  const TYPE_LABELS = { save: 'SAVE', submit: 'SUBMIT', next: 'NEXT/CONTINUE', other: 'OTHER', unknown: 'FORM SUBMIT' };
  const children = [];
  if (scan.saveCount > 100) {
    const delayEnabled = document.getElementById('bulkSaveModeToggle').checked;
    const delaySeconds = Number(document.getElementById('saveDelaySelect').value) / 1000;
    children.push(h('div', { class: 'fill-result-title', text: `${scan.saveCount} Save buttons found. ${delayEnabled ? `${delaySeconds}-second delay enabled.` : 'Repeated-action delay is off.'}` }));
  } else if (scan.total) {
    children.push(h('div', { class: 'fill-result-title', text: `${scan.total} safe page action(s) found.` }));
  }
  scan.candidates.slice(0, 8).forEach(item => {
    const risky = /\b(submit|delete|remove|pay|purchase|logout|log\s*out|cancel)\b/i.test(item.label || '') || item.type === 'submit';
    children.push(h('div', { class: `action-preview-item${risky ? ' action-risky' : ''}` }, [
      h('span', { class: 'action-preview-label', text: `${item.label}${risky ? ' · CONFIRM BEFORE CLICKING' : ''}` }),
      h('span', { class: 'action-preview-type', text: TYPE_LABELS[item.type] || item.type.toUpperCase() })
    ]));
  });
  if (scan.riskyCount) {
    children.push(h('div', { class: 'fill-result-title action-risky', text: `${scan.riskyCount} risky/destructive action(s) excluded from automatic action list:` }));
    scan.riskyCandidates.forEach(item => children.push(h('div', { class: 'action-risky', text: item.label })));
  }
  if (scan.candidates.length > 8) {
    children.push(h('div', { class: 'file-hint', text: `+ ${scan.candidates.length - 8} more detected action(s)` }));
  }
  preview.replaceChildren(...children);
}

/** Requests a page-action scan and optionally shows a toast when no candidates exist. */
async function scanPageActions(showToastOnEmpty = true) {
  const scanBtn = document.getElementById('scanActionButtonsBtn');
  scanBtn.disabled = true;
  setWorkflowStep('action', 'running', 'Searching for page actions.');
  scanBtn.textContent = 'Scanning actions...';
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    const response = await sendTabMessage(tab.id, { type: 'SFFA_SCAN_PAGE_ACTIONS' }, { timeoutMs: 20000 });
    if (!response || !response.ok) throw new Error(response?.error || 'Action scan failed');
    renderPageActionScan(response.result);
    setWorkflowStep('action', response.result.total ? 'ready' : 'blocked', response.result.total ? 'Review an action before running it.' : 'No safe action was found.');
    await SFFALogger.log(
      `Page action scan: ${response.result.total} safe action(s), ${response.result.saveCount} Save button(s).`,
      response.result.total ? 'info' : 'warn'
    );
    if (!response.result.total && showToastOnEmpty) showToast('No safe Submit / Save / Next / Proceed button found');
    return { tab, scan: response.result };
  } catch (err) {
    setWorkflowStep('action', 'error', 'See the Activity Log and retry.');
    lastPageActionScan = null;
    document.getElementById('actionButtonCount').textContent = 'Scan failed';
    const preview = document.getElementById('actionButtonPreview');
    const { h } = window.SFFADom;
    const retry = h('button', { class: 'btn btn-small', type: 'button', text: 'Retry' });
    retry.addEventListener('click', () => scanPageActions(true));
    preview.classList.remove('hidden');
    preview.replaceChildren(
      h('div', { class: 'fill-result-title', text: 'Scan failed' }),
      h('p', { text: err.message || 'Could not scan page actions.' }),
      retry
    );
    if (showToastOnEmpty) showToast(err.message);
    return null;
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Find page actions';
  }
}

/** Runs the selected page action after applying the popup's safety options. */
async function onPageActionClick() {
  const actionBtn = document.getElementById('pageActionBtn');
  const stopBtn = document.getElementById('stopPageActionBtn');
  const resultEl = document.getElementById('pageActionResult');
  actionBtn.disabled = true;
  stopBtn.classList.remove('hidden');
  resultEl.classList.add('hidden');
  actionBtn.textContent = 'Running page action...';
  setWorkflowStep('action', 'running', 'Checking the selected page action.');

  try {
    let tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    const scanResponse = await sendTabMessage(tab.id, { type: 'SFFA_SCAN_PAGE_ACTIONS' }, { timeoutMs: 20000 });
    if (!scanResponse?.ok) throw new Error(scanResponse?.error || 'Could not scan page actions');
    renderPageActionScan(scanResponse.result);
    if (!scanResponse.result.total) throw new Error('No safe Submit / Save / Next / Proceed button found');
    if (!document.getElementById('actionDryRunToggle').checked) {
      const risky = scanResponse.result.candidates.filter(item => /\b(submit|delete|remove|pay|purchase|logout|log\s*out|cancel)\b/i.test(item.label || '') || item.type === 'submit');
      const labels = risky.map(item => item.label).slice(0, 5).join(', ');
      if ((risky.length || scanResponse.result.candidates.length > 1) && !confirm(`This will click ${scanResponse.result.candidates.length} page action(s)${labels ? `, including: ${labels}` : ''}. The website may save data, submit, navigate, delete, pay, or sign you out. Continue?`)) {
        setWorkflowStep('action', 'ready', 'Click cancelled. Dry run remains available.');
        return;
      }
    }

    const saveDelayMs = Number(document.getElementById('saveDelaySelect').value) || 5000;
    const bulkSaveDelay = document.getElementById('bulkSaveModeToggle').checked;
    const response = await sendTabMessage(tab.id, {
      type: 'SFFA_PAGE_ACTION',
      options: { saveDelayMs, bulkSaveDelay, normalDelayMs: 750, dryRun: document.getElementById('actionDryRunToggle').checked }
    }, { watchdogMs: 30000 }); // long click sequences are fine while the page keeps sending heartbeats

    if (!response || !response.ok) throw new Error(response?.error || 'Page action failed');

    const { h } = window.SFFADom;
    resultEl.classList.remove('hidden');
    const mode = response.bulkSaveMode ? `100+ Save mode — ${response.delayMs / 1000}s delay between clicks` : 'Single action mode';
    resultEl.replaceChildren(
      h('div', { class: 'fill-result-title', text: response.previewed ? 'Dry Run Complete' : response.stopped ? 'Page Action Stopped' : 'Page Action Completed' }),
      h('div', { class: 'fill-result-line' }, [h('span', { text: 'Mode' }), h('span', { text: mode })]),
      h('div', { class: 'fill-result-line' }, [h('span', { text: response.previewed ? 'Targets highlighted' : 'Clicked' }), h('span', { text: response.previewed ? String(response.previewed) : `${response.clicked.length} / ${response.targetCount}` })]),
      h('div', { class: 'fill-result-line' }, [h('span', { text: 'Failed' }), h('span', { text: String(response.failed.length) })]),
      h('div', { class: 'fill-result-line stop-reason' }, [h('span', { text: response.stopped ? 'Stopped by user.' : (response.failed.length ? 'Some buttons could not be clicked.' : 'All requested actions completed.') })])
    );
    await renderLogs();
    setWorkflowStep('action', response.failed?.length ? 'error' : 'done', response.previewed ? 'Dry run completed; nothing was clicked.' : 'Review the page response.');
    showToast(response.previewed ? `Dry run highlighted ${response.previewed} target(s); nothing was clicked` : response.stopped ? 'Page action stopped' : `Clicked ${response.clicked.length} page action${response.clicked.length === 1 ? '' : 's'}`);
  } catch (err) {
    setWorkflowStep('action', 'error', 'See the Activity Log and retry.');
    await SFFALogger.log(`⚠ ${err.message}`, 'error');
    showToast(err.message);
    await renderLogs();
  } finally {
    actionBtn.disabled = false;
    actionBtn.textContent = 'Submit / Save / Next';
    stopBtn.classList.add('hidden');
    try { await scanPageActions(false); } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
  }
}

/** Starts page element picking and reports whether the content script accepted it. */
async function onPickElementClick() {
  const btn = document.getElementById('pickElementBtn');
  const dryRun = document.getElementById('actionDryRunToggle').checked;
  if (!dryRun && !await confirmDialog('Dry run is off, so the element you pick can be clicked for real. It may submit, delete, pay or sign you out. You will still confirm in the extension before anything is clicked.', { title: 'Pick an element to click?', confirmLabel: 'Start picking', tone: 'primary' })) return;
  renderPickedElementCard(null);
  btn.disabled = true;
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    const saveDelayMs = Number(document.getElementById('saveDelaySelect').value) || 5000;
    const bulkSaveDelay = document.getElementById('bulkSaveModeToggle').checked;
    const response = await sendTabMessage(tab.id, {
      type: 'SFFA_START_ELEMENT_PICKER',
      options: { saveDelayMs, bulkSaveDelay, dryRun: document.getElementById('actionDryRunToggle').checked }
    }, { timeoutMs: 15000 });
    if (!response || !response.ok) throw new Error(response?.error || 'Could not start the element picker');

    showToast('Now click the element on the page (Esc to cancel). Details will appear here.');
    await SFFALogger.log('Element picker started — waiting for a click on the page.', 'info');
    await renderLogs();
  } catch (err) {
    showToast(err.message);
    await SFFALogger.log(`⚠ ${err.message}`, 'error');
    await renderLogs();
  } finally {
    btn.disabled = false;
  }
}

/** Requests cancellation of the active page action or picker operation. */
async function onStopPageActionClick() {
  const btn = document.getElementById('stopPageActionBtn');
  btn.disabled = true;
  try {
    const tab = await getActiveTab();
    if (tab?.id) await sendTabMessage(tab.id, { type: 'SFFA_STOP_PAGE_ACTION' }, { timeoutMs: 10000 });
    showToast('Stopping after the current action...');
  } catch (e) {
    showToast(e.message);
  } finally {
    btn.disabled = false;
  }
}

/** Runs the selected QA fill mode and updates popup status and results. */
async function runQaModeFill(mode) {
  const fieldScope = getSelectedFieldScope();
  if (!fieldScope.includeRequired && !fieldScope.includeOptional) {
    showToast('Select Required fields, Optional fields, or both');
    return;
  }

  const btn = document.getElementById('fillFormBtn');
  const resultEl = document.getElementById('fillResult');
  const startedAt = performance.now();
  beginFillUi(mode, mode === 'negative' ? 'Trying wrong values on the fields' : 'Trying edge-case values on the fields');

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    setProgress(0, 1);
    const oneAtATime = document.getElementById('qaTestStyle')?.value !== 'all';
    const targetKey = oneAtATime ? (document.getElementById('qaTargetField')?.value || '') : '';
    const clickSubmit = document.getElementById('qaClickSubmit')?.checked === true;
    const response = await sendTabMessage(tab.id, {
      type: 'SFFA_QA_FILL',
      mode,
      options: { fieldScope, oneAtATime, targetKey, clickSubmit }
    }, { watchdogMs: 30000 });
    if (!response || !response.ok) throw new Error(response?.error || 'QA run failed');
    setProgress(1, 1);

    if (response.summary.total === 0) {
      await updateQaDashboard({ fields: 0, passed: 0, failed: 0, skipped: response.summary.skipped?.length || 0,
        issues: response.validationErrors?.length || 0, durationMs: performance.now() - startedAt }, mode === 'negative' ? 'Wrong data' : 'Edge cases', response);
      renderEmptyFillState(resultEl, true);
      finishFillUi('warning', 'No fields matched the selected scope.', mode);
      return;
    }
    await updateQaDashboard({
      fields: response.summary.total,
      passed: response.verification?.pass ?? 0,
      failed: response.verification?.fail ?? 0,
      skipped: response.summary.skipped.length + (response.verification?.warn || 0),
      issues: response.validationErrors?.length || 0,
      durationMs: performance.now() - startedAt
    }, mode === 'negative' ? 'Wrong data' : 'Edge cases', response);

    const { h } = window.SFFADom;
    const results = response.summary.results || [];
    const counts = response.summary.counts || {};
    resultEl.classList.remove('hidden');
    resultEl.replaceChildren(
      h('div', { class: 'fill-result-title', text: mode === 'negative' ? 'Wrong data test completed' : 'Edge case test completed' }),
      h('p', { class: 'scan-detail-note', text: response.summary.style === 'one-at-a-time'
        ? `${results.length} case(s) on ${response.summary.fieldsTested} field(s), one field at a time: the other fields had correct values. ` +
          (response.summary.notPutBack?.length
            ? `The original values were put back, except these dropdowns, which keep a correct choice: ${response.summary.notPutBack.join(', ')}.`
            : 'The original values were put back.')
        : `${results.length} case(s) in ${response.summary.rounds || 1} round(s), all fields together. The original values were put back.` }),
      resultLine('Passed', counts.pass || 0, 'success', 'Pass'),
      ...(counts.warn ? [resultLine('No error shown yet', counts.warn, 'warning', 'Check')] : []),
      ...(counts.fail ? [resultLine('Failed', counts.fail, 'danger', 'Fail')] : []),
      ...(counts.info ? [resultLine('Accepted — check manually', counts.info, null, 'Info')] : []),
      ...(response.summary.skipped.length ? [resultLine('Skipped', response.summary.skipped.length)] : []),
      ...(response.summary.stoppedReason ? [h('p', { class: 'scan-detail-note qa-stopped', text: response.summary.stoppedReason })] : []),
      renderScenarioResults(results)
    );
    if (response.validationErrors?.length) appendVerificationPanel(resultEl, null, response.validationErrors);
    const status = counts.fail ? 'warning' : counts.warn ? 'warning' : 'success';
    finishFillUi(status, `${results.length} cases · ${counts.pass || 0} passed · ${counts.warn || 0} no error shown · ${counts.fail || 0} failed.`, mode);
    await renderLogs();
  } catch (err) {
    await SFFALogger.log(`⚠ ${err.message}`, 'error');
    finishFillUi('error', `Unable to complete ${mode} testing: ${err.message}`, mode, true);
    offerPageReloadAfterStall(err);
    showToast(err.message);
    await renderLogs();
  } finally {
    btn.disabled = false;
    document.getElementById('cancelFillBtn').disabled = true;
  }
}

/**
 * Results of a Wrong data / Edge case run, grouped by field: each value with ✓ (pass), ⚠ (no error
 * shown yet), ✗ (fail) or ⓘ (check manually). Fields with a problem open by default.
 */
function renderScenarioResults(results) {
  const { h } = window.SFFADom;
  const wrap = h('div', { class: 'scenario-results' });
  if (!results.length) return wrap;
  const icon = { pass: '✓', warn: '⚠', fail: '✗', info: 'ⓘ' };
  const byField = new Map();
  for (const r of results) {
    if (!byField.has(r.field)) byField.set(r.field, []);
    byField.get(r.field).push(r);
  }
  wrap.appendChild(h('div', { class: 'scenario-results-title', text: 'Results by field' }));
  for (const [field, list] of byField) {
    const tally = ['pass', 'warn', 'fail', 'info'].map(k => [k, list.filter(r => r.result === k).length]).filter(([, n]) => n);
    const hasProblem = list.some(r => r.result === 'fail' || r.result === 'warn');
    wrap.appendChild(h('details', { class: 'scan-details scenario-field', open: list.some(r => r.result === 'fail') ? '' : null }, [
      h('summary', {}, [
        h('span', { class: 'scan-arrow', 'aria-hidden': 'true', 'data-icon': 'chevronRight' }),
        h('span', { text: field }),
        h('span', { class: `scan-count${hasProblem ? ' has-problem' : ''}`, text: tally.map(([k, n]) => `${icon[k]} ${n}`).join('  ') })
      ]),
      h('ol', { class: 'scan-detail-list' }, list.map(r => h('li', { class: `scenario-case is-${r.result}` }, [
        h('span', { class: 'scenario-icon', 'aria-label': r.result, text: icon[r.result] }),
        h('span', {}, [
          h('strong', { text: r.scenario }),
          h('span', { class: 'scenario-value', text: ` — ${r.value === '' ? '(empty)' : `"${r.value}"`}` }),
          h('div', { class: 'scenario-note', text: r.note })
        ])
      ])))
    ]));
  }
  return wrap;
}

const FULL_QA_REPORT_KEY = 'sffaLastFullQaReport';

/**
 * Shows download buttons for the last Full QA report. Nothing is downloaded until the user picks a file.
 * `saved` = { tabUrl, savedAt, report, screenshot?, screenshotName? }; null hides the card.
 */
function renderFullQaDownloads(saved) {
  const box = document.getElementById('fullQaDownloads');
  if (!box) return;
  if (!saved?.report) { box.classList.add('hidden'); box.replaceChildren(); return; }
  const { h } = window.SFFADom;
  const base = `sffa-full-qa-report-${saved.savedAt || Date.now()}`;
  const button = (id, text, onClick) => {
    const b = h('button', { id, class: 'btn btn-small', type: 'button', 'data-icon': 'download', text });
    b.addEventListener('click', onClick);
    return b;
  };
  const buttons = [
    button('fullQaHtmlBtn', 'HTML report', () => downloadTextFile(`${base}.html`, 'text/html', window.SFFAQAReport.toHtml(saved.report))),
    button('fullQaJsonBtn', 'JSON data', () => downloadTextFile(`${base}.json`, 'application/json', JSON.stringify(saved.report, null, 2)))
  ];
  if (saved.screenshot) {
    buttons.push(button('fullQaShotBtn', 'Page screenshot', () => downloadDataUrl(saved.screenshotName || `${base}.png`, saved.screenshot)));
  }
  const when = saved.savedAt ? new Date(saved.savedAt).toLocaleString() : '';
  box.replaceChildren(
    h('div', { class: 'fill-result-title', 'data-icon': 'download', text: 'Download the Full QA report' }),
    h('p', { class: 'scan-detail-note', text: `${when ? `Run on ${when}. ` : ''}Pick the files you want; nothing is downloaded until you click.` }),
    h('div', { class: 'page-review-actions' }, buttons)
  );
  box.classList.remove('hidden');
}

/** Shows the last Full QA report's download buttons again when the popup opens on the same page. */
async function restoreFullQaDownloads(tab) {
  const saved = await window.SFFAExt.store.get(FULL_QA_REPORT_KEY, null);
  renderFullQaDownloads(saved && tab?.url && saved.tabUrl === tab.url ? saved : null);
}

/** Coordinates the full QA run, optional activity capture, and report rendering. */
async function runFullQaRunFlow() {
  const btn = document.getElementById('fillFormBtn');
  const startedAt = performance.now();
  beginFillUi('fullqa', 'Full QA · Analyzing');
  renderFullQaDownloads(null); // the previous report's buttons come back when this run finishes
  const resultEl = document.getElementById('fillResult');

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot run on this type of page');
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    const settings = await SFFAStorage.getSettings();
    const captureEnabled = settings.captureActivityDuringFill === true;
    const submitEnabled = document.getElementById('fullQaSubmitToggle')?.checked === true;
    if (submitEnabled) {
      const hostname = (() => { try { return new URL(tab.url).hostname; } catch (_) { return ''; } })();
      if (!confirm('Full QA will submit the page once after its test cases. This can save data, send requests, or advance a workflow. Continue?')) return;
      if (hostname && !/(localhost|127\.0\.0\.1|\.test|\.local)$/i.test(hostname)
        && !confirm(`This page (${hostname}) does not look like a local test environment. Submission may affect real data. Continue?`)) return;
    }

    if (captureEnabled) {
      try {
        await sendRuntimeMessage({ type: 'SFFA_START_CAPTURE', tabId: tab.id });
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }

    setProgress(0, 1);
    const response = await sendTabMessage(tab.id, {
      type: 'SFFA_FULL_QA_RUN',
      options: { modeSuite: true, submitEnabled }
    }, { watchdogMs: 30000 });
    if (!response || !response.ok) throw new Error(response?.error || 'Full QA Run failed');
    setProgress(1, 1);

    let capture = null;
    let captureCounts = null;
    if (captureEnabled) {
      try {
        // Keep the screenshot for the download buttons instead of saving it straight away.
        capture = await sendRuntimeMessage({ type: 'SFFA_CAPTURE_REPORT', tabId: tab.id, download: false });
        if (capture?.ok) {
          captureCounts = await sendRuntimeMessage({ type: 'SFFA_CAPTURE_COUNTS', tabId: tab.id });
        }
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }

    const s = response.summary;
    const fieldsFilled = s.textFilled + s.dropdownsFilled + s.radiosFilled + s.checkboxesFilled + s.filesUploaded;
    const fieldsDetected = response.detected.text + response.detected.select + response.detected.customDropdowns
      + response.detected.radioGroups + response.detected.checkboxes + response.detected.file;
    await updateQaDashboard({
      fields: fieldsDetected,
      passed: response.verification.pass,
      failed: response.verification.fail,
      skipped: s.skipped.length + response.verification.warn,
      issues: response.validationErrors.length + (response.scan?.potentialIssues?.length || 0) + (capture?.errorCount || 0),
      accessibility: response.accessibilityCount ?? 0,
      console: capture?.ok ? capture.consoleCount : 0,
      network: capture?.ok ? capture.networkCount : 0,
      durationMs: performance.now() - startedAt
    }, 'full QA', response);

    const qaReport = {
      url: tab.url,
      timestamp: new Date().toISOString(),
      mode: 'full-qa',
      dataSeed: response.dataSeed || 'none (random)',
      fieldsDetected,
      fieldsFilled,
      fieldsSkipped: s.skipped.length,
      fieldsFailed: response.verification.fail,
      fieldsUnconfirmed: response.verification.warn,
      uploads: s.filesUploaded,
      validationErrors: response.validationErrors.length,
      validationErrorDetails: response.validationErrors,
      accessibilityIssues: response.accessibilityCount ?? null,
      consoleErrors: capture && capture.ok && captureCounts?.ok ? captureCounts.consoleErrors : null,
      networkErrors: capture && capture.ok && captureCounts?.ok ? captureCounts.failedRequests : null,
      screenshots: capture?.ok && capture.filename ? [`${capture.filename} (download it with "Page screenshot")`] : [],
      submit: { ...response.submitResult },
      outcome: response.outcome,
      steps: response.steps,
      modes: response.modes,
      restorationLimits: response.restorationLimits,
      stopReason: response.stopReason,
      timingsMs: response.timings,
      duration: `${(response.durationMs / 1000).toFixed(1)}s`,
      verificationDetail: response.verification.details,
      scanSummary: {
        forms: response.scan?.forms || 0, inputs: response.scan?.inputs || 0,
        required: response.scan?.required || 0, potentialIssues: response.scan?.potentialIssues || []
      }
    };
    const safeQaReport = window.SFFAQAReport.sanitize(qaReport);
    // No automatic download: the report is kept (also after the popup closes) and offered as buttons.
    const savedReport = {
      tabUrl: tab.url,
      savedAt: Date.now(),
      report: safeQaReport,
      ...(capture?.ok && capture.imageDataUrl ? { screenshot: capture.imageDataUrl, screenshotName: capture.filename } : {})
    };
    try { await window.SFFAExt.store.set(FULL_QA_REPORT_KEY, savedReport); }
    catch (e) { await SFFALogger.log(`Could not keep the report after the popup closes: ${e.message}`, 'warn'); }
    renderFullQaDownloads(savedReport);

    const { h } = window.SFFADom;
    if (fieldsDetected === 0) {
      await updateQaDashboard({ fields: 0, passed: 0, failed: 0, skipped: 0, issues: 0,
        score: null, durationMs: performance.now() - startedAt }, 'full QA', response);
      renderEmptyFillState(resultEl, false);
      finishFillUi('warning', 'No fillable fields were detected.');
      showToast('Full QA found no fillable fields; download the report below');
      return;
    }
    resultEl.classList.remove('hidden');
    resultEl.replaceChildren(
      h('div', { class: 'fill-result-title', text: 'Full QA Run Completed' }),
      h('div', { class: 'fill-result-line' }, [h('span', { text: 'Fields detected' }), h('span', { text: String(fieldsDetected) })]),
      h('div', { class: 'fill-result-line' }, [h('span', { text: 'Modes completed' }), h('span', { text: (response.modes || []).join(' · ') })]),
      h('div', { class: 'fill-result-line' }, [h('span', { text: '✓ Filled / attached' }), h('span', { text: String(fieldsFilled) })]),
      h('div', { class: 'fill-result-line' }, [h('span', { text: '⚠ Skipped' }), h('span', { text: String(s.skipped.length) })]),
      h('div', { class: 'fill-result-line' }, [h('span', { text: 'Steps completed' }), h('span', { text: String(response.steps.length) })]),
      h('div', { class: 'fill-result-line' }, [
        h('span', { text: 'Page state' }),
        h('span', { text: response.restorationLimits?.length ? `${response.restorationLimits.length} field state(s) not restorable` : 'Restored' })
      ]),
      h('div', { class: 'fill-result-line stop-reason' }, [h('span', { text: response.stopReason })])
    );
    if (response.submitResult?.attempted) {
      resultEl.appendChild(h('div', { class: 'fill-result-line' }, [
        h('span', { text: 'Submit response' }),
        h('span', { text: `${response.submitResult.clicked ? 'Clicked' : 'Not clicked'} · ${response.submitResult.urlChanged ? 'URL changed' : 'URL unchanged'} · ${response.submitResult.validationCount} validation message(s)` })
      ]));
    }
    appendVerificationPanel(resultEl, response.verification, response.validationErrors);
    finishFillUi(
      s.skipped.length || response.verification.fail ? 'warning' : 'success',
      `${fieldsFilled} fields filled · ${s.skipped.length} skipped · ${response.verification.fail} failed.`,
      'fullqa'
    );
    await renderLogs();
    showToast('Full QA complete — download the report below');
  } catch (err) {
    await SFFALogger.log(`⚠ ${err.message}`, 'error');
    finishFillUi('error', `Full QA could not complete: ${err.message}`, 'fullqa', true);
    offerPageReloadAfterStall(err);
    showToast(err.message);
    await renderLogs();
  } finally {
    btn.disabled = false;
    document.getElementById('cancelFillBtn').disabled = true;
    await refreshCaptureStatus();
  }
}

/** Validates popup state and starts either normal form filling or the selected QA run. */
async function onFillFormClick() {
  const mode = getSelectedQaMode();
  if (mode === 'fullqa') {
    return runFullQaRunFlow();
  }
  if (!['normal', 'positive'].includes(mode)) {
    return runQaModeFill(mode);
  }

  const fieldScope = mode === 'positive' ? getSelectedFieldScope() : null;
  if (fieldScope && !fieldScope.includeRequired && !fieldScope.includeOptional) {
    showToast('Select Required fields, Optional fields, or both');
    return;
  }

  const btn = document.getElementById('fillFormBtn');
  const startedAt = performance.now();
  beginFillUi(mode, mode === 'positive' ? 'Filling valid data in the chosen fields' : 'Filling detected form fields');

  try {
    const settings = await SFFAStorage.getSettings();
    const freshEnabled = document.getElementById('freshDataToggle').checked;

    let testData;
    if (freshEnabled || !(await SFFAStorage.getLastData())) {
      testData = await SFFADataGenerator.generateFreshTestData(settings);
      await SFFAStorage.setLastData(testData);
      await SFFALogger.log('✓ Fresh test data generated', 'success');
      await SFFALogger.log('✓ Unique email generated', 'success');
      await SFFALogger.log('✓ Unique mobile generated', 'success');
      await SFFALogger.log('✓ Unique organization generated', 'success');
    } else {
      testData = await SFFAStorage.getLastData();
      await SFFALogger.log('Reusing previously generated dataset (fresh data disabled)', 'info');
    }


    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) {
      throw new Error('Cannot run on this type of page');
    }

    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) throw new Error('Could not access this page (browser restrictions)');

    if (settings.captureActivityDuringFill) {
      try {
        await sendRuntimeMessage({ type: 'SFFA_START_CAPTURE', tabId: tab.id });
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }

    setProgress(0, 1);

    const response = await sendTabMessage(tab.id, {
      type: 'SFFA_FILL_FORM',
      testData,
      options: { fieldScope }
    }, { watchdogMs: 30000 });

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Fill operation failed');
    }

    setProgress(1, 1);
    if (response.summary.total === 0) {
      await updateQaDashboard({ fields: 0, passed: 0, failed: 0, skipped: response.summary.skipped?.length || 0,
        issues: response.validationErrors?.length || 0, durationMs: performance.now() - startedAt },
      mode === 'positive' ? 'Valid data' : 'Quick fill', response);
      renderEmptyFillState(document.getElementById('fillResult'), !!fieldScope);
      finishFillUi('warning', fieldScope ? 'No fields matched the selected scope.' : 'No fillable fields were detected.');
      return;
    }
    await updateQaDashboard({
      fields: response.summary.total,
      passed: response.verification?.pass || 0,
      failed: response.verification?.fail || 0,
      skipped: response.summary.skipped.length + (response.verification?.warn || 0),
      issues: response.validationErrors?.length || 0,
      durationMs: performance.now() - startedAt
    }, `${mode} testing`, response);
    renderFillResult(response.summary, mode);
    appendVerificationPanel(document.getElementById('fillResult'), response.verification, response.validationErrors);

    const filledDisplayData = response.summary.actualValues || {};
    renderGeneratedData(filledDisplayData);
    await SFFAStorage.setLastFilledDisplay(filledDisplayData);
    const filled = response.summary.textFilled + response.summary.dropdownsFilled + response.summary.radiosFilled
      + response.summary.checkboxesFilled + response.summary.filesUploaded;
    finishFillUi(response.summary.skipped.length ? 'warning' : 'success', `${filled} fields filled · ${response.summary.skipped.length} skipped.`, mode);

    await renderLogs();
  } catch (err) {
    await SFFALogger.log(`⚠ ${err.message}`, 'error');
    finishFillUi('error', `Unable to fill the form: ${err.message}`, mode, true);
    offerPageReloadAfterStall(err);
    showToast(err.message);
    await renderLogs();
  } finally {
    btn.disabled = false;
    document.getElementById('cancelFillBtn').disabled = true;
    await refreshCaptureStatus();
  }
}
