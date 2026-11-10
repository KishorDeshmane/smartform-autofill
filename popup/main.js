// Popup entry point: target-tab refresh, init() wiring and global error handlers. Loaded last.

/** Id of the tab the header currently shows; page changes in this tab refresh the header. */
let headerTabId = null;

/**
 * Short page address for the header chip: host + path (no query string, for privacy), plus a
 * "#/route" hash used by single-page apps. Long paths keep the start of the host and the last part.
 */
function pageLabel(url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return { short: '', full: '' }; }
  const route = /^#\/|^#!\//.test(parsed.hash) ? parsed.hash : '';
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  const full = `${parsed.hostname}${path}${route}`;
  if (full.length <= 30) return { short: full, full }; // about what fits in the header chip
  const tail = `${path}${route}`.split('/').filter(Boolean).slice(-1)[0] || '';
  return { short: `${parsed.hostname}/…/${tail}`.slice(0, 60), full };
}

/** Sets the header chip text and briefly highlights it when the page changed. */
function setHostChip(text, title = '') {
  const chip = document.getElementById('pageHostChip');
  if (!chip) return;
  const changed = chip.textContent !== text && chip.dataset.ready === '1';
  const span = document.createElement('span');
  span.className = 'host-chip-text';
  span.textContent = text;
  chip.replaceChildren(span);
  chip.title = title || 'Target tab. Click to choose another tab when none is detected.';
  chip.dataset.ready = '1';
  if (changed) {
    chip.classList.remove('is-updated');
    void chip.offsetWidth; // restart the highlight
    chip.classList.add('is-updated');
  }
}

/** Refreshes the active target tab and restores its cached summary. */
async function updateTargetTab() {
  const target = document.getElementById('targetTab');
  if (!target) return;
  if (!hasExt()) {
    target.textContent = 'Target: Open this UI from the extension toolbar.';
    setExtensionContextBanner(false);
    return;
  }
  const tab = await getActiveTab();
  const hostChip = document.getElementById('pageHostChip');
  const statusDot = document.getElementById('pageStatusDot');
  if (!tab) {
    target.textContent = 'Target: No website tab found';
    if (hostChip) setHostChip('Choose a tab');
    if (statusDot) { statusDot.dataset.state = 'idle'; statusDot.title = 'No website tab found'; }
    setExtensionContextBanner(true, 'No page is selected. Choose a regular website tab to continue.');
    return;
  }
  if (!tab.url) {
    // The browser hides the address until the extension has access to this site.
    target.textContent = 'Target: This tab (access needed)';
    if (hostChip) setHostChip('Access needed');
    if (statusDot) { statusDot.dataset.state = 'idle'; statusDot.title = 'Site access needed'; }
    setExtensionContextBanner(true, 'Site access needed to read this tab.');
    return;
  }
  headerTabId = tab.id;
  try { await restoreSummaryForTab(tab); }
  catch (error) { console.warn('[SFFA] Could not restore the saved summary for this tab:', error); }
  let hostname = '';
  try { hostname = new URL(tab.url).hostname; } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
  target.textContent = `Target: ${sanitizeReportText(tab.title || 'Untitled page')}${hostname ? ` (${hostname})` : ''}`;
  const label = pageLabel(tab.url);
  if (hostChip) setHostChip(label.short || hostname || 'Current page', label.full ? `${label.full}${tab.title ? ` — ${tab.title}` : ''}
Click to choose another tab.` : '');
  await updateEnvironmentBadge(hostname);
  if (statusDot) { statusDot.dataset.state = tab.url && !isRestrictedPageUrl(tab.url) ? 'ready' : 'idle'; statusDot.title = statusDot.dataset.state === 'ready' ? 'Page ready' : 'Page unavailable'; statusDot.setAttribute('role', 'img'); statusDot.setAttribute('aria-label', statusDot.title); }
  if (!tab.url || isRestrictedPageUrl(tab.url)) {
    setExtensionContextBanner(true, 'This browser page cannot be inspected. Select a regular website tab to continue.');
  } else {
    setExtensionContextBanner(true);
  }
}

/** Shows whether the target hostname is in the Options "Allowed test environments" list. */
async function updateEnvironmentBadge(hostname) {
  const badge = document.getElementById('envBadge');
  if (!badge) return;
  let allowed = [];
  try { allowed = (await SFFAStorage.getSettings())?.allowedTestEnvironments || []; } catch (_) { /* Keep the neutral badge. */ }
  const host = String(hostname || '').toLowerCase();
  if (!host) { badge.hidden = true; return; }
  badge.hidden = false;
  if (!allowed.length) {
    // Generic use: nothing configured, so there is nothing to compare against. Stay out of the way;
    // the badge appears once test sites are added in Options → General → Allowed test environments.
    badge.hidden = true;
    return;
  } else if (allowed.some(entry => host === entry || host.endsWith(`.${entry}`))) {
    Object.assign(badge.dataset, { state: 'allowed', icon: 'checkCircle' });
    badge.textContent = 'Allowed test env';
    badge.title = `${host} is in the allowed test environments list.`;
  } else {
    Object.assign(badge.dataset, { state: 'not-allowed', icon: 'alert' });
    badge.textContent = 'Not allowlisted';
    badge.title = `${host} is not in the allowed test environments list. Check you are not on production.`;
  }
}

/** Resolves with the promise's value, or with `fallback` if it takes longer than `ms`. */
function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })
  ]);
}

/**
 * Asks Chrome for access to websites so the extension can read and fill the selected tab.
 * Must be the first thing a click handler does: Chrome only shows the prompt during a user gesture.
 * Resolves true when access was granted.
 */
async function requestSiteAccess() {
  const origins = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];
  const granted = await window.SFFAExt.permissions?.request({ origins });
  showToast(granted ? 'Access granted. Reading the page…' : 'Site access was not granted, so nothing was run. Click again and choose Allow when Chrome asks.');
  if (!granted) return false;
  if (showTargetTabPicker.pending) {
    showTargetTabPicker.pending = false;
    await showTargetTabPicker();
  } else {
    await updateTargetTab();
  }
  return true;
}

/** Debounces the popup's target-tab refresh. */
function scheduleTargetTabRefresh() {
  summaryTabRefreshQueue = summaryTabRefreshQueue
    .then(() => updateTargetTab())
    .catch(error => console.warn('[SFFA] Could not refresh active-tab summary:', error));
}

/** Removes unsafe or excessive text before report content is displayed. */
function sanitizeReportText(value) {
  const text = String(value == null ? '' : value);
  if (!document.getElementById('redactPathsToggle')?.checked) return text;
  return text
    .replace(/file:\/\/\/[A-Za-z]:\/Users\/[^/]+/gi, 'file:///…')
    .replace(/[A-Za-z]:\\Users\\[^\\]+/gi, '…')
    .replace(/chrome-extension:\/\/[a-z]{32}/gi, 'chrome-extension://…');
}


/** Wires controls added by the redesign: export split button, empty-state CTA and shortcut hint. */
function initRedesignControls() {
  const toggle = document.getElementById('exportMenuToggle');
  const menu = document.getElementById('exportMenu');
  if (toggle && menu) {
    const setOpen = open => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => setOpen(menu.hidden));
    menu.addEventListener('click', event => { if (event.target.closest('button')) setOpen(false); });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { setOpen(false); toggle.focus(); } });
  }
  document.getElementById('goToTestBtn')?.addEventListener('click', () => document.getElementById('tabTestButton')?.click());
  initWelcomeAndHelp();
  initKeyboardShortcuts();
  const reason = document.getElementById('fillButtonReason');
  const chip = document.getElementById('actionShortcutChip');
  /** Mirrors the browser's configured open shortcut into the footer hint. */
  const syncShortcut = () => {
    const text = chip?.textContent?.trim() || '';
    if (reason) reason.dataset.shortcut = /^[A-Za-z]+(\+|\s)/.test(text) && !/not set|loading/i.test(text) ? text : '';
  };
  syncShortcut();
  if (chip) new MutationObserver(syncShortcut).observe(chip, { childList: true, characterData: true, subtree: true });
}

/** Shows the first-run welcome card and wires the help dialog. */
function initWelcomeAndHelp() {
  const card = document.getElementById('welcomeCard');
  let dismissed = false;
  try { dismissed = localStorage.getItem('sffaWelcomeDismissed') === '1'; } catch (_) { /* Show it when storage is unavailable. */ }
  if (card) card.hidden = dismissed;
  document.getElementById('welcomeDismiss')?.addEventListener('click', () => {
    try { localStorage.setItem('sffaWelcomeDismissed', '1'); } catch (_) { /* Hide for this session only. */ }
    card.hidden = true;
    document.getElementById('scanPageBtn')?.focus();
  });
  const help = document.getElementById('helpDialog');
  const openHelp = () => { if (help && !help.open) help.showModal(); };
  document.getElementById('helpBtn')?.addEventListener('click', openHelp);
  document.getElementById('welcomeHelp')?.addEventListener('click', openHelp);
  document.getElementById('helpClose')?.addEventListener('click', () => help?.close());
  help?.addEventListener('click', event => { if (event.target === help) help.close(); });
}

/** Popup keyboard shortcuts: Alt+S scan, Alt+F fill, Alt+1/2/3 tabs, ? help. */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    const click = id => {
      const el = document.getElementById(id);
      if (el && !el.disabled && !el.hidden) { event.preventDefault(); el.click(); }
    };
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 's') { document.getElementById('tabTestButton')?.click(); click('scanPageBtn'); }
      else if (key === 'f') { document.getElementById('tabTestButton')?.click(); click('fillFormBtn'); }
      else if (key === '1') click('tabTestButton');
      else if (key === '2') click('tabOutputButton');
      else if (key === '3') click('tabSetupButton');
      return;
    }
    if (!typing && event.key === '?') click('helpBtn');
  });
}

/** Re-selects the fill mode used last time so returning users don't have to choose again. */
function restoreLastMode() {
  let mode = null;
  try { mode = localStorage.getItem('sffaLastMode'); } catch (_) { /* Default mode is fine. */ }
  if (mode === 'fullqa') document.getElementById('fullQaModeButton')?.setAttribute('aria-pressed', 'true');
  else if (mode) {
    const radio = document.querySelector(`input[name="qaMode"][value="${CSS.escape(mode)}"]`);
    if (radio) radio.checked = true;
  }
}

/** Loads popup settings and data, then registers UI and browser event handlers. */
async function init() {
  restoreLastMode();
  initSectionTabs();
  // Resolve the target tab right away; it must not wait on storage or background replies below.
  const firstTabRefresh = updateTargetTab().catch(error => console.warn('[SFFA] Initial tab detection failed:', error));
  initThemeAndLayout();
  initRedesignControls();
  if (window.SFFAFileTypes && window.SFFAFileTypes.UPLOAD_ACCEPT_ATTRIBUTE) {
    document.getElementById('fileInput').setAttribute('accept', window.SFFAFileTypes.UPLOAD_ACCEPT_ATTRIBUTE);
  }

  const settings = await SFFAStorage.getSettings();
  aiApprovedOrigins = new Set(settings.aiEndpointAllowlist || ['https://api.openai.com']);
  document.getElementById('freshDataToggle').checked = settings.freshDataEveryRun;
  document.getElementById('captureActivityToggle').checked = settings.captureActivityDuringFill;
  document.getElementById('reuseMappedFileToggle').checked = !!settings.reuseMappedFileAcrossFields;
  document.getElementById('autoFileMappingToggle').checked = !!settings.automaticFileMapping;
  document.getElementById('redactPathsToggle').checked = settings.redactPathsInReports !== false;
  document.getElementById('aiMaskPageUrl').checked = settings.aiMaskPageUrl !== false;
  document.getElementById('aiMaskPageTitle').checked = settings.aiMaskPageTitle !== false;
  const aiPrompt = document.getElementById('aiPrompt');
  if (aiPrompt && !aiPrompt.value.trim()) aiPrompt.value = SECURITY_SCAN_PROMPT;

  if (hasExt()) await withTimeout(sendRuntimeMessage({ type: 'SFFA_ENSURE_MIGRATION' }), 4000, null);

  await renderFileList().catch(error => console.warn('[SFFA] File list failed to render:', error));

  const lastFilledDisplay = await SFFAStorage.getLastFilledDisplay().catch(() => null);
  renderGeneratedData(lastFilledDisplay);

  await renderLogs().catch(error => console.warn('[SFFA] Activity log failed to render:', error));

  document.getElementById('addFileBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('grantAccessBanner')?.addEventListener('click', requestSiteAccess);
  // Any page button (Scan, Fill, Find actions, Generate…) asks for site access first when it is missing,
  // then carries on with the action the user clicked.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-requires-ext]');
    if (!button || button.disabled) return;
    if (document.getElementById('extensionContextBanner')?.dataset.priority !== 'needs-access') return;
    if (button.dataset.accessRetry === '1') { delete button.dataset.accessRetry; return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    requestSiteAccess().then(granted => {
      if (!granted) return;
      button.dataset.accessRetry = '1';
      button.click();
    });
  }, true);
  // The one-field-at-a-time "Field" list follows the Required / Optional choice.
  for (const id of ['includeRequiredFields', 'includeOptionalFields']) {
    document.getElementById(id)?.addEventListener('change', () => { if (!document.getElementById('qaOneByOne')?.hidden) loadQaTargetFields(); });
  }
  // "Click Save / Submit after each wrong value" is remembered (off until the tester turns it on).
  const clickSubmitBox = document.getElementById('qaClickSubmit');
  if (clickSubmitBox) {
    try { clickSubmitBox.checked = localStorage.getItem('sffaQaClickSubmit') === '1'; } catch (_) { /* default off */ }
    clickSubmitBox.addEventListener('change', () => { try { localStorage.setItem('sffaQaClickSubmit', clickSubmitBox.checked ? '1' : '0'); } catch (_) { /* optional */ } });
  }
  document.getElementById('qaTestStyle')?.addEventListener('change', event => {
    const field = document.getElementById('qaTargetField');
    if (field) field.disabled = event.target.value === 'all';
  });
  document.getElementById('pageHostChip')?.addEventListener('click', () => {
    if (document.getElementById('extensionContextBanner')?.dataset.priority !== 'ready') showTargetTabPicker();
  });
  document.getElementById('selectTabBanner').addEventListener('click', async () => {
    if (document.getElementById('extensionContextBanner')?.dataset.priority === 'cannot-read') {
      try { await getActiveTab().then(tab => tab?.id && window.SFFAExt.tabs.reload?.(tab.id)); } catch (_) { /* Reload failure remains visible in the status region. */ }
      showTargetTabPicker();
    } else showTargetTabPicker();
  });
  document.getElementById('openSidePanelBanner').addEventListener('click', async () => {
    const tab = await window.SFFAExt.queryActiveTab();
    if (!tab?.windowId || !await window.SFFAExt.sidePanel?.open({ windowId: tab.windowId })) {
      setExtensionContextBanner(true, 'Could not open the side panel. Open SmartForm AutoFill from the toolbar instead.');
    }
  });
  if (/Firefox/i.test(navigator.userAgent)) {
    const manageLink = document.getElementById('manageExtensionBanner');
    if (manageLink) { manageLink.href = 'about:debugging#/runtime/this-firefox'; manageLink.textContent = 'Manage extension'; }
  }

  await firstTabRefresh;
  await updateTargetTab().catch(error => console.warn('[SFFA] Tab detection failed:', error));
  restorePendingPick();
  if (hasExt()) {
    window.SFFAExt.tabs.onActivated?.addListener(() => scheduleTargetTabRefresh());
    window.SFFAExt.tabs.onUpdated?.addListener((tabId, changeInfo) => {
      // Any page change in the shown tab (new page, Next step, single-page-app route, title) updates the header.
      const shown = headerTabId ?? activeSummaryTab?.id;
      if (tabId === shown && (changeInfo.url || changeInfo.status === 'complete' || changeInfo.title)) {
        scheduleTargetTabRefresh();
      }
    });
  }

  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length) handleFilesSelected(e.target.files);
    e.target.value = '';
  });

  document.getElementById('cancelFillBtn').addEventListener('click', async () => {
    const stopButton = document.getElementById('cancelFillBtn');
    stopButton.disabled = true;
    stopButton.textContent = 'Stopping...';
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('No active tab found');
      const response = await sendTabMessage(tab.id, { type: 'SFFA_CANCEL_RUN' }, { timeoutMs: 10000 });
      if (!response?.cancelled) throw new Error(response?.note || 'No active run to stop');
      setFillStatus('running', 'Stop requested. The current operation is stopping safely.');
      showToast('Stop requested. The current operation will finish safely.');
    } catch (error) {
      stopButton.disabled = false;
      stopButton.textContent = 'Stop fill / QA run';
      showToast(error.message);
    }
  });
  document.getElementById('fillFormBtn').addEventListener('click', onFillFormClick);
  document.querySelectorAll('input[name="qaMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('fullQaModeButton')?.setAttribute('aria-pressed', 'false');
      updateFillModePresentation();
    });
  });
  document.getElementById('fullQaModeButton').addEventListener('click', () => {
    document.getElementById('fullQaModeButton').setAttribute('aria-pressed', 'true');
    updateFillModePresentation();
  });
  setWorkflowStep('scan', 'ready', 'Scan the current page to review its fields and findings.');
  setWorkflowStep('fill', 'notStarted', 'Choose a fill mode. Scanning first is optional.');
  setWorkflowStep('action', 'notStarted', 'Find or pick a page action when ready.');
  updateFillModePresentation();
  (async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id || !tab.url) return;
      // Only ask an already-loaded page script; never inject scripts just to check for a busy run.
      const response = await withTimeout(window.SFFAExt.sendTabMessage(tab.id, { type: 'SFFA_PING' }, []), 3000, null);
      if (response?.busy) {
        const stopButton = document.getElementById('cancelFillBtn');
        const fillButton = document.getElementById('fillFormBtn');
        stopButton.disabled = false;
        stopButton.hidden = false;
        fillButton.disabled = true;
        fillButton.classList.add('is-running');
        fillButton.setAttribute('aria-busy', 'true');
        setActionButtonLabel(fillButton, 'Run in progress...');
        document.querySelectorAll('input[name="qaMode"]').forEach(radio => { radio.disabled = true; });
        setFillStatus('running', `${response.runType || 'QA'} run is active in this tab.`);
      }
    } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
  })();
  document.getElementById('scanPageBtn').addEventListener('click', onScanPageClick);
  document.getElementById('securityScanBtn').addEventListener('click', onSecurityScanClick);
  document.getElementById('copySecurityScanBtn').addEventListener('click', copySecurityScanReport);
  document.getElementById('aiAskBtn').addEventListener('click', onAiAskClick);
  document.getElementById('loadSecurityPromptBtn').addEventListener('click', applySecurityScanPrompt);
  document.getElementById('copyAiResultBtn').addEventListener('click', copyAiResult);
  document.getElementById('scanActionButtonsBtn').addEventListener('click', () => scanPageActions(true));
  const bulkSaveModeToggle = document.getElementById('bulkSaveModeToggle');
  const saveDelaySelect = document.getElementById('saveDelaySelect');
  saveDelaySelect.disabled = !bulkSaveModeToggle.checked;
  bulkSaveModeToggle.addEventListener('change', () => {
    saveDelaySelect.disabled = !bulkSaveModeToggle.checked;
  });
  document.getElementById('pageActionBtn').addEventListener('click', onPageActionClick);
  const dryRunToggle = document.getElementById('actionDryRunToggle');
  dryRunToggle.checked = settings.dryRunPageActions !== false;
  dryRunToggle.addEventListener('change', async event => {
    if (!event.target.checked) {
      const currentSettings = await SFFAStorage.getSettings();
      if (!currentSettings.actionDryRunOffConfirmed) {
        const confirmed = await confirmDialog('Turning off Dry run allows selected page actions to click the website. Actions may submit, delete, pay, or sign you out.', { title: 'Turn off dry run?', confirmLabel: 'Turn off dry run' });
        if (!confirmed) { event.target.checked = true; return; }
        await SFFAStorage.updateSettings({ actionDryRunOffConfirmed: true });
      }
    }
    await SFFAStorage.updateSettings({ dryRunPageActions: event.target.checked });
    const card = document.getElementById('pickedElementCard');
    if (card && !card.hidden && card.dataset.pick) renderPickedElementCard(JSON.parse(card.dataset.pick));
  });
  document.getElementById('pickElementBtn').addEventListener('click', onPickElementClick);
  document.getElementById('stopPageActionBtn').addEventListener('click', onStopPageActionClick);
  document.getElementById('generateTestCasesBtn').addEventListener('click', onGenerateTestCasesClick);
  document.getElementById('exportTcCsvBtn').addEventListener('click', () => {
    downloadTextFile('smartform-autofill-testcases.csv', 'text/csv', testCasesToCsv(lastTestCases));
  });
  document.getElementById('exportTcMdBtn').addEventListener('click', () => {
    downloadTextFile('smartform-autofill-testcases.md', 'text/markdown', testCasesToMarkdown(lastTestCases));
  });
  document.getElementById('exportTcHtmlBtn').addEventListener('click', () => {
    downloadTextFile('smartform-autofill-testcases.html', 'text/html', window.SFFAQAReport.toHtml(lastTestCaseReport || { cases: lastTestCases }));
  });
  document.getElementById('printTcBtn').addEventListener('click', printTestCases);
  document.getElementById('exportTcJsBtn').addEventListener('click', () => {
    downloadTextFile('smartform-autofill-testcases.spec.js', 'text/javascript', testCasesToPlaywright(lastTestCases));
  });
  document.getElementById('exportTcTsBtn').addEventListener('click', () => {
    downloadTextFile('smartform-autofill-testcases.spec.ts', 'text/typescript', testCasesToPlaywright(lastTestCases));
  });
  document.getElementById('exportTcPyBtn').addEventListener('click', () => {
    downloadTextFile('smartform-autofill-testcases.py', 'text/x-python', testCasesToPlaywrightPython(lastTestCases));
  });
  document.getElementById('captureReportBtn').addEventListener('click', onCaptureReportClick);
  document.getElementById('applyNetworkProfileBtn').addEventListener('click', () => onNetworkProfileClick(document.getElementById('networkProfile').value));
  document.getElementById('restoreNetworkProfileBtn').addEventListener('click', () => onNetworkProfileClick('normal'));
  document.getElementById('applyViewportBtn')?.addEventListener('click', () => setActiveTabViewport(false));
  document.getElementById('restoreViewportBtn')?.addEventListener('click', () => setActiveTabViewport(true));
  document.getElementById('viewportPreviewBtn')?.addEventListener('click', onViewportPreviewClick);
  document.getElementById('viewportOpenWindowBtn')?.addEventListener('click', openViewportWindowFallback);
  const previewImage = document.getElementById('viewportPreviewImage');
  const zoomDialog = document.getElementById('viewportZoomDialog');
  /** Opens the zoom dialog for the current preview image. */
  const openZoom = () => {
    if (!previewImage?.src || !zoomDialog?.showModal) return;
    viewportZoom = 1;
    renderViewportZoom();
    zoomDialog.showModal();
  };
  previewImage?.addEventListener('click', openZoom);
  previewImage?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openZoom();
    }
  });
  document.getElementById('viewportZoomIn')?.addEventListener('click', () => {
    viewportZoom = Math.min(4, Number((viewportZoom + 0.25).toFixed(2)));
    renderViewportZoom();
  });
  document.getElementById('viewportZoomOut')?.addEventListener('click', () => {
    viewportZoom = Math.max(0.5, Number((viewportZoom - 0.25).toFixed(2)));
    renderViewportZoom();
  });
  document.getElementById('viewportZoomReset')?.addEventListener('click', () => {
    viewportZoom = 1;
    renderViewportZoom();
  });
  document.getElementById('viewportZoomClose')?.addEventListener('click', () => zoomDialog?.close());
  zoomDialog?.addEventListener('click', event => {
    if (event.target === zoomDialog) zoomDialog.close();
  });
  document.getElementById('stopCaptureBtn').addEventListener('click', onStopCaptureClick);
  refreshCaptureStatus();
  initViewportPresets();
  applyDebuggerAvailability();

  document.getElementById('freshDataToggle').addEventListener('change', async (e) => {
    await SFFAStorage.updateSettings({ freshDataEveryRun: e.target.checked });
  });

  document.getElementById('captureActivityToggle').addEventListener('change', async (e) => {
    await SFFAStorage.updateSettings({ captureActivityDuringFill: e.target.checked });
  });
  document.getElementById('reuseMappedFileToggle').addEventListener('change', async e => {
    await SFFAStorage.updateSettings({ reuseMappedFileAcrossFields: e.target.checked });
  });
  document.getElementById('autoFileMappingToggle').addEventListener('change', async (e) => {
    await SFFAStorage.updateSettings({ automaticFileMapping: e.target.checked });
    renderFileList();
  });
  document.getElementById('redactPathsToggle').addEventListener('change', async (e) => {
    await SFFAStorage.updateSettings({ redactPathsInReports: e.target.checked });
    await renderLogs();
  });
  document.getElementById('aiMaskPageUrl').addEventListener('change', async e => SFFAStorage.updateSettings({ aiMaskPageUrl: e.target.checked }));
  document.getElementById('aiMaskPageTitle').addEventListener('change', async e => SFFAStorage.updateSettings({ aiMaskPageTitle: e.target.checked }));

  document.getElementById('openOptions').addEventListener('click', () => {
    window.SFFAExt.api.openOptionsPage();
  });
  document.getElementById('advancedSettingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.SFFAExt.api.openOptionsPage();
  });

  document.getElementById('toggleLogView').textContent = 'View logs';

  document.getElementById('clearLogBtn').addEventListener('click', async () => {
    if (!await confirmDialog('Every entry in the activity log will be removed.', { title: 'Clear the activity log?', confirmLabel: 'Clear log' })) return;
    await SFFALogger.clear();
    await renderLogs();
  });

  document.getElementById('clearFilesBtn').addEventListener('click', async () => {
    if (!await confirmDialog('All stored test files and their file-to-category mappings will be deleted. This cannot be undone.', { title: 'Delete stored files?', confirmLabel: 'Delete files' })) return;
    await SFFAStorage.clearFiles();
    await renderFileList();
    showToast('Stored test files and mappings cleared');
  });
  document.getElementById('clearCredentialsBtn').addEventListener('click', async () => {
    if (!await confirmDialog('Saved test credentials for every site will be deleted. This cannot be undone.', { title: 'Delete site credentials?', confirmLabel: 'Delete credentials' })) return;
    await SFFAStorage.clearCredentials();
    showToast('Saved test credentials cleared');
  });
  document.getElementById('clearAllDataBtn').addEventListener('click', async () => {
    if (!await confirmDialog('Files, mappings, credentials, logs, generated data and site settings will all be removed. This cannot be undone.', { title: 'Clear all extension data?', confirmLabel: 'Clear everything' })) return;
    await SFFAStorage.clearAllData();
    await renderFileList();
    await renderLogs();
    renderGeneratedData(null);
    showToast('All extension data cleared');
  });

  document.getElementById('copyDataBtn').addEventListener('click', async () => {
    const data = await SFFAStorage.getLastFilledDisplay();
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    showToast('Copied to clipboard');
  });

  document.getElementById('exportJsonBtn').addEventListener('click', async () => {
    const data = await SFFAStorage.getLastFilledDisplay();
    if (!data) return;
    downloadBlob(JSON.stringify(data, null, 2), `sffa-data-${Date.now()}.json`, 'application/json');
  });

  document.getElementById('exportCsvBtn').addEventListener('click', async () => {
    const data = await SFFAStorage.getLastFilledDisplay();
    if (!data) return;
    downloadBlob(dataToCsv(data), `sffa-data-${Date.now()}.csv`, 'text/csv');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setExtensionContextBanner(hasExt());
  installDisabledButtonExplanations();
  initAccessibleDisclosures();
  installTooltips();
  renderSummary();
  await init();
  window.SFFAShortcuts?.init();
});

const handledRejections = new WeakSet();
const popupDiagnosticKeys = new Set();

/** Adds a bounded diagnostic entry to the popup's runtime diagnostic panel. */
function recordPopupDiagnostic(source, detail) {
  const text = sanitizeReportText(String(detail?.stack || detail?.message || detail || 'Unknown error'));
  const key = `${source}|${text}`;
  if (popupDiagnosticKeys.has(key)) return;
  popupDiagnosticKeys.add(key);
  const line = `[${new Date().toLocaleTimeString()}] ${source}: ${text}`;
  const panel = document.getElementById('diagnosticsPanel');
  const output = document.getElementById('diagnosticsOutput');
  if (panel && output) {
    output.textContent = [...output.textContent.split('\n').filter(Boolean), line].slice(-30).join('\n');
    panel.hidden = false;
  }
  SFFALogger?.log(`${source}: ${text}`, 'error').catch(() => {});
}

window.addEventListener('error', event => {
  recordPopupDiagnostic('Window error', event.error || event.message);
});

window.addEventListener('unhandledrejection', event => {
  if (event.promise && handledRejections.has(event.promise)) return;
  if (event.promise) handledRejections.add(event.promise);
  recordPopupDiagnostic('Unhandled promise rejection', event.reason);
  showToast(event.reason?.message || 'Operation failed. Please try again.');
  event.preventDefault();
});
