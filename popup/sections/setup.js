// Setup tab: capture, network profiles, viewport tools and runtime progress listener.

/** Refreshes the capture-status row for the currently selected tab. */
async function refreshCaptureStatus() {
  const row = document.getElementById('captureStatusRow');
  if (!row) return;
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) { row.classList.add('hidden'); return; }
    const res = await sendRuntimeMessage({ type: 'SFFA_IS_CAPTURING', tabId: tab.id });
    row.classList.toggle('hidden', !(res && res.attached));
  } catch (e) {
    row.classList.add('hidden');
  }
}

let debuggerApiAvailable = null;

/**
 * Confirms the Chrome DevTools (debugger) API is usable for Viewport, Network and Screenshot tools.
 * Chrome does not allow `debugger` as an optional permission (a request is rejected without a prompt),
 * so the Chrome build grants it at install; Firefox has no such API.
 */
async function ensureCapturePermissions() {
  return !!(typeof chrome !== 'undefined' && chrome.debugger?.attach);
}

/** Disables capture controls and explains when the browser debugger API is unavailable. */
async function applyDebuggerAvailability() {
  try {
    const res = await sendRuntimeMessage({ type: 'SFFA_DEBUGGER_AVAILABLE' });
    // Only lock the tools when this browser cannot use them at all (Firefox). In Chrome/Edge the
    // permission may simply not be granted yet: keep the tools enabled; the first click asks for it.
    // (Locking them here used to make the permission impossible to request.)
    if (res && res.supported !== false) {
      debuggerApiAvailable = true;
      if (!res.available) {
        const note = 'Reload the extension at chrome://extensions to enable this tool.';
        const viewportStatus = document.getElementById('viewportSupportStatus');
        if (viewportStatus) viewportStatus.textContent = note;
        const networkStatus = document.getElementById('networkProfileStatus');
        if (networkStatus) networkStatus.textContent = note;
      } else {
        const ready = 'Ready.';
        const viewportStatus = document.getElementById('viewportSupportStatus');
        if (viewportStatus) viewportStatus.textContent = ready;
        const networkStatus = document.getElementById('networkProfileStatus');
        if (networkStatus) networkStatus.textContent = ready;
      }
      return;
    }
    debuggerApiAvailable = false;
  } catch (e) {
    return;
  }
  const captureBtn = document.getElementById('captureReportBtn');
  const captureToggle = document.getElementById('captureActivityToggle');
  const hint = document.getElementById('captureUnsupportedHint');
  const networkApply = document.getElementById('applyNetworkProfileBtn');
  const networkRestore = document.getElementById('restoreNetworkProfileBtn');
  const viewportPreview = document.getElementById('viewportPreviewBtn');
  const unavailableText = 'Screenshots, activity capture, network profiles, and viewport preview require Chromium DevTools Protocol and are unavailable in Firefox.';
  document.querySelectorAll('#networkProfile, #applyNetworkProfileBtn, #restoreNetworkProfileBtn, #applyViewportBtn, #restoreViewportBtn, #viewportPreviewBtn, #viewportWidth, #viewportHeight, #viewportOpenWindowBtn, #viewportPreset, #viewportRotateBtn').forEach(control => {
    control.disabled = true;
    control.title = unavailableText;
  });
  const status = document.getElementById('networkProfileStatus');
  if (status) status.textContent = unavailableText;
  const viewportStatus = document.getElementById('viewportSupportStatus');
  if (viewportStatus) viewportStatus.textContent = 'Chrome / Edge only.';
  if (captureBtn) {
    captureBtn.disabled = true;
    captureBtn.title = 'Not available in this browser (needs Chrome DevTools Protocol)';
  }
  if (captureToggle) {
    captureToggle.checked = false;
    captureToggle.disabled = true;
  }
  if (hint) hint.classList.remove('hidden');
  if (hint) hint.textContent = unavailableText;
  if (networkApply) networkApply.disabled = true;
  if (networkRestore) networkRestore.disabled = true;
  if (viewportPreview) viewportPreview.disabled = true;
}

/** Applies a selected simulated network profile to the active tab. */
async function onNetworkProfileClick(profile) {
  const status = document.getElementById('networkProfileStatus');
  if (status) status.textContent = 'Applying network profile…';
  if (!(await ensureCapturePermissions())) { if (status) status.textContent = 'This tool needs Chrome or Edge (it uses Chrome DevTools). Reload the extension at chrome://extensions if you just updated it.'; return; }
  const apply = document.getElementById('applyNetworkProfileBtn');
  const restore = document.getElementById('restoreNetworkProfileBtn');
  apply.disabled = true;
  restore.disabled = true;
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('Cannot emulate network conditions on this page');
    const result = await sendRuntimeMessage({ type: 'SFFA_NETWORK_PROFILE', tabId: tab.id, profile });
    if (!result?.ok) throw new Error(result?.error || 'Network profile could not be applied');
    status.textContent = profile === 'normal'
      ? 'Normal network conditions restored. Use Stop Capturing to detach the debugger when finished.'
      : `${profile} network profile applied to the current tab. Use Restore normal when finished.`;
    await refreshCaptureStatus();
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message);
  } finally {
    apply.disabled = debuggerApiAvailable === false;
    restore.disabled = debuggerApiAvailable === false;
  }
}

/**
 * Fills the Device preset list, restores the tester's last choice, and keeps width/height, the
 * preset and the orientation in sync. localStorage: sffaViewportPreset, sffaViewportLandscape.
 */
function initViewportPresets() {
  const P = window.SFFAViewportPresets;
  const select = document.getElementById('viewportPreset');
  const widthInput = document.getElementById('viewportWidth');
  const heightInput = document.getElementById('viewportHeight');
  if (!P || !select || !widthInput || !heightInput || select.dataset.ready === 'true') return;
  select.dataset.ready = 'true';
  for (const group of P.groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    for (const preset of P.presets.filter(p => p.group === group)) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = `${preset.name} — ${preset.width} × ${preset.height}`;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }
  const remember = () => {
    try {
      localStorage.setItem('sffaViewportPreset', select.value);
      localStorage.setItem('sffaViewportLandscape', select.dataset.landscape === 'true' ? '1' : '0');
    } catch (_) { /* Remembering the preset is optional. */ }
  };
  const showMeta = () => {
    const meta = document.getElementById('viewportPresetMeta');
    try { if (meta) meta.textContent = P.describe(currentViewportOptions()); }
    catch (error) { if (meta) meta.textContent = error.message; }
  };
  const applyPreset = () => {
    const preset = P.find(select.value);
    if (preset) {
      const options = P.deviceOptions(preset, select.dataset.landscape === 'true');
      widthInput.value = String(options.width);
      heightInput.value = String(options.height);
    }
    showMeta();
    remember();
  };
  let savedPreset = 'iphone-14';
  let savedLandscape = false;
  try {
    savedPreset = localStorage.getItem('sffaViewportPreset') || savedPreset;
    savedLandscape = localStorage.getItem('sffaViewportLandscape') === '1';
  } catch (_) { /* Use the default preset. */ }
  select.value = P.find(savedPreset) || savedPreset === 'custom' ? savedPreset : 'iphone-14';
  select.dataset.landscape = String(savedLandscape && select.value !== 'custom');
  if (select.value !== 'custom') applyPreset(); else showMeta();
  select.addEventListener('change', () => { select.dataset.landscape = 'false'; applyPreset(); });
  for (const input of [widthInput, heightInput]) {
    input.addEventListener('input', () => {
      // Typing a size that no longer matches the preset switches to Custom.
      const preset = P.find(select.value);
      const expected = preset ? P.deviceOptions(preset, select.dataset.landscape === 'true') : null;
      if (expected && (Number(widthInput.value) !== expected.width || Number(heightInput.value) !== expected.height)) {
        select.value = 'custom';
        select.dataset.landscape = 'false';
        remember();
      }
      showMeta();
    });
  }
  document.getElementById('viewportRotateBtn')?.addEventListener('click', () => {
    if (P.find(select.value)) {
      select.dataset.landscape = String(select.dataset.landscape !== 'true');
      applyPreset();
    } else {
      [widthInput.value, heightInput.value] = [heightInput.value, widthInput.value];
      showMeta();
    }
  });
}

/** Device options (size, pixel density, touch, mobile layout) for the current preset or custom size. */
function currentViewportOptions() {
  const P = window.SFFAViewportPresets;
  const select = document.getElementById('viewportPreset');
  const width = Number(document.getElementById('viewportWidth')?.value);
  const height = Number(document.getElementById('viewportHeight')?.value);
  const preset = P?.find(select?.value);
  if (preset) {
    const landscape = select.dataset.landscape === 'true';
    return { ...P.deviceOptions(preset, landscape), width, height };
  }
  return P ? P.deviceOptions({ width, height }) : { width, height };
}

/** Applies or restores an emulated viewport on the active page. */
async function setActiveTabViewport(restore = false) {
  const status = document.getElementById('viewportSupportStatus');
  if (status) status.textContent = 'Applying viewport…';
  if (!(await ensureCapturePermissions())) { if (status) status.textContent = 'This tool needs Chrome or Edge (it uses Chrome DevTools). Reload the extension at chrome://extensions if you just updated it.'; return; }
  const applyButton = document.getElementById('applyViewportBtn');
  const restoreButton = document.getElementById('restoreViewportBtn');
  const width = Number(document.getElementById('viewportWidth')?.value);
  const height = Number(document.getElementById('viewportHeight')?.value);
  const activeButton = restore ? restoreButton : applyButton;
  if (!status || !activeButton) {
    const message = 'Viewport controls not found. Close and reopen the extension, then try again.';
    showToast(message);
    await window.SFFALogger?.log(message, 'error');
    return;
  }
  if (!restore && (!Number.isInteger(width) || width < 200 || width > 3000 || !Number.isInteger(height) || height < 200 || height > 3000)) {
    status.textContent = 'Width and height must be whole numbers from 200 to 3000 pixels.';
    return;
  }
  activeButton.disabled = true;
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('No active browser tab was found.');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('This browser page cannot be resized. Switch to a regular website page and try again.');
    const device = restore ? null : currentViewportOptions();
    const response = await sendRuntimeMessage(restore
      ? { type: 'SFFA_RESTORE_VIEWPORT', tabId: tab.id }
      : { type: 'SFFA_APPLY_VIEWPORT', tabId: tab.id, width, height, device });
    if (!response?.ok) throw new Error(response?.error || 'Could not update the page viewport.');
    status.textContent = restore
      ? (response.restored ? 'Normal viewport restored.' : 'No active emulated viewport; the page is already at its normal size.')
      : `Applied ${window.SFFAViewportPresets ? window.SFFAViewportPresets.describe(device) : `${width} × ${height}`} to the active page. It stays like this, even after reloading or opening other pages in this tab, until you click Restore viewport.`;
  } catch (error) {
    const actualError = String(error?.message || error);
    const message = /restricted|cannot access|permission/i.test(actualError)
      ? 'Chrome cannot resize this restricted page. Switch to a regular website page and try again.'
      : 'Could not change the page viewport. Close DevTools or another debugger and retry.';
    status.textContent = message;
    await window.SFFALogger?.log(`Viewport ${restore ? 'restore' : 'apply'} failed: ${actualError}`, 'error');
    showToast(message);
  } finally {
    if (applyButton) applyButton.disabled = debuggerApiAvailable === false;
    if (restoreButton) restoreButton.disabled = debuggerApiAvailable === false;
  }
}

/** Captures a screenshot preview using the selected viewport dimensions. */
async function onViewportPreviewClick() {
  const supportStatus = document.getElementById('viewportSupportStatus');
  if (supportStatus) supportStatus.textContent = 'Requesting Chrome DevTools permissions for screenshot preview…';
  if (!(await ensureCapturePermissions())) { if (supportStatus) supportStatus.textContent = 'This tool needs Chrome or Edge (it uses Chrome DevTools). Reload the extension at chrome://extensions if you just updated it.'; return; }
  const button = document.getElementById('viewportPreviewBtn');
  const resultEl = document.getElementById('viewportPreviewResult');
  const widthInput = document.getElementById('viewportWidth');
  const heightInput = document.getElementById('viewportHeight');
  const statusEl = document.getElementById('viewportPreviewStatus');
  const previewImage = document.getElementById('viewportPreviewImage');
  const zoomImage = document.getElementById('viewportZoomImage');
  const metaEl = document.getElementById('viewportPreviewMeta');
  const fallbackButton = document.getElementById('viewportOpenWindowBtn');
  if (!button || !widthInput || !heightInput || !resultEl || !statusEl || !previewImage || !zoomImage || !metaEl) {
    const message = 'Preview container not found. Close and reopen the extension, then try again.';
    if (supportStatus) supportStatus.textContent = message;
    else showToast(message);
    await window.SFFALogger?.log(`Viewport preview failed: ${message}`, 'error');
    return;
  }
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  if (!Number.isInteger(width) || width < 200 || width > 3000) {
    widthInput.setAttribute('aria-invalid', 'true');
    resultEl.classList.remove('hidden');
    statusEl.textContent = 'Width must be a whole number from 200 to 3000 pixels.';
    widthInput.focus();
    return;
  }
  widthInput.removeAttribute('aria-invalid');
  if (!Number.isInteger(height) || height < 200 || height > 3000) {
    heightInput.setAttribute('aria-invalid', 'true');
    resultEl.classList.remove('hidden');
    statusEl.textContent = 'Height must be a whole number from 200 to 3000 pixels.';
    heightInput.focus();
    return;
  }
  heightInput.removeAttribute('aria-invalid');
  button.disabled = true;
  button.textContent = 'Preparing preview...';
  resultEl.classList.remove('hidden');
  statusEl.textContent = 'Rendering at requested size...';
  if (fallbackButton) fallbackButton.hidden = true;
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('No active browser tab was found.');
    if (tab.url && isRestrictedPageUrl(tab.url)) throw new Error('This browser page cannot be previewed. Switch to a regular website page and try again.');
    const response = await sendRuntimeMessage({ type: 'SFFA_VIEWPORT_PREVIEW', tabId: tab.id, width, height, device: currentViewportOptions() });
    if (!response?.ok) throw new Error(response?.error || 'Viewport preview failed');
    if (!response.preview?.imageData) throw new Error('The preview image was not returned.');
    const preview = response.preview;
    const imageData = `data:image/png;base64,${preview.imageData}`;
    previewImage.src = imageData;
    zoomImage.src = imageData;
    previewImage.alt = `Full-page preview at ${preview.actual.width} by ${preview.actual.height} pixels; activate to zoom`;
    metaEl.textContent =
      `${preview.actual.width} × ${preview.actual.height}px viewport · page ${preview.document.width} × ${preview.document.height}px` +
      (preview.horizontalOverflow ? ' · horizontal overflow' : ' · no horizontal overflow');
    statusEl.textContent = response.restoredViewport
      ? `${preview.truncated ? `Capture limited to ${preview.capturedWidth} × ${preview.capturedHeight}px of a ${preview.document.width} × ${preview.document.height}px page. ` : 'Full page captured. '}Scroll the image here or click it to zoom. Nothing is downloaded.`
      : 'WARNING: viewport override could not be cleared; reload the tab to restore its normal size.';
    resultEl.classList.remove('hidden');
    viewportZoom = 1;
    zoomImage.onload = renderViewportZoom;
    renderViewportZoom();
    if (preview.horizontalOverflow) updateQaDashboard({ issues: (summary.issues ?? 0) + 1 }, 'viewport preview', preview);
  } catch (error) {
    const actualError = String(error?.message || error);
    const frameBlocked = /frame-ancestors|x-frame-options|refused to display|blocked.*frame|frame.*blocked/i.test(actualError);
    const message = frameBlocked
      ? 'This site blocks iframe embedding. Viewport preview uses a screenshot, not an iframe; you can open the page in a separate resized window instead.'
      : /another debugger|debugger.*attached|cannot attach/i.test(actualError)
        ? 'Chrome could not start viewport capture. Close DevTools or another debugger, then retry.'
        : /restricted|cannot access|permission/i.test(actualError)
          ? 'Chrome cannot capture this restricted page. Switch to a regular website page and try again.'
          : 'Could not capture the page at this size. Reload the page and try again.';
    statusEl.textContent = message;
    if (frameBlocked && fallbackButton) fallbackButton.hidden = false;
    await window.SFFALogger?.log(`Viewport preview failed: ${actualError}`, 'error');
    showToast(message);
  } finally {
    button.disabled = debuggerApiAvailable === false;
    button.textContent = 'Preview at this size';
  }
}

/** Opens the active page in a separate popup with the requested outer window dimensions. */
async function openViewportWindowFallback() {
  const width = Number(document.getElementById('viewportWidth')?.value);
  const height = Number(document.getElementById('viewportHeight')?.value);
  const status = document.getElementById('viewportPreviewStatus');
  try {
    if (!Number.isInteger(width) || width < 200 || width > 3000 || !Number.isInteger(height) || height < 200 || height > 3000) {
      throw new Error('Enter whole-number dimensions from 200 to 3000 pixels first.');
    }
    const tab = await getActiveTab();
    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) throw new Error('This page cannot be opened in a separate preview window.');
    if (!window.chrome?.windows?.create) throw new Error('Opening a resized window is unavailable in this browser.');
    await window.chrome.windows.create({ url: tab.url, type: 'popup', width, height, focused: true });
    if (status) status.textContent = 'Opened the page in a separate window. Dimensions include browser frame controls, so the page viewport will be smaller.';
  } catch (error) {
    if (status) status.textContent = error.message;
    await window.SFFALogger?.log(`Could not open resized preview window: ${String(error?.message || error)}`, 'error');
  }
}

/** Stops activity capture for the active tab and refreshes capture status. */
async function onStopCaptureClick() {
  const btn = document.getElementById('stopCaptureBtn');
  btn.disabled = true;
  try {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      await sendRuntimeMessage({ type: 'SFFA_STOP_CAPTURE', tabId: tab.id });
      showToast('Capturing stopped — banner will disappear');
      await SFFALogger.log('Debugger detached — capture session stopped', 'info');
      await renderLogs();
    }
  } finally {
    btn.disabled = false;
    await refreshCaptureStatus();
  }
}


/** Requests an activity capture report and renders or downloads the response. */
async function onCaptureReportClick() {
  const btn = document.getElementById('captureReportBtn');
  if (!(await ensureCapturePermissions())) {
    showToast('Permission denied. Screenshot and activity reports need Chrome DevTools access.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Capturing...';

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (tab.url && isRestrictedPageUrl(tab.url)) {
      throw new Error('Cannot capture this type of page');
    }

    const response = await sendRuntimeMessage({
      type: 'SFFA_CAPTURE_REPORT',
      tabId: tab.id
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Capture failed');
    }

    const fallbackNote = response.usedViewportFallback
      ? ' — full-page capture failed on this page, saved a viewport-only screenshot instead' : '';
    await updateQaDashboard({
      console: response.consoleCount || 0,
      network: response.networkCount || 0,
      issues: Math.max(summary.issues ?? 0, response.errorCount || 0)
    }, 'capture report', response);
    await SFFALogger.log(
      `✓ PNG report captured (${response.consoleCount} console line(s), ${response.networkCount} network line(s), ${response.errorCount} error(s) explained)${fallbackNote}`,
      response.errorCount || response.usedViewportFallback ? 'warn' : 'success'
    );
    showToast(response.errorCount ? `Report saved — ${response.errorCount} error(s) found & explained` : 'Report saved — check your downloads');
    await renderLogs();
  } catch (err) {
    await SFFALogger.log(`⚠ ${err.message}`, 'error');
    showToast(err.message);
    await renderLogs();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Capture page evidence (PNG)';
    await refreshCaptureStatus();
  }
}

window.SFFAExt.onMessage((message, sender) => {
  try {
  if (isSummaryDebugEnabled()) console.debug('[SFFA popup runtime message]', message);
      if (['SFFA_PROGRESS', 'SFFA_QA_RUN_PROGRESS', 'SFFA_SCAN_PROGRESS', 'SFFA_RUN_HEARTBEAT', 'SFFA_DYNAMIC_FIELDS', 'SFFA_BUTTON_SEQUENCE_PROGRESS', 'SFFA_PICKED_PROGRESS'].includes(message?.type)) {
        notePageActivity(sender?.tab?.id);
      }
      if (message.type === 'SFFA_PROGRESS') {
        setProgress(message.done, message.total);
      }
      if (message.type === 'SFFA_QA_RUN_PROGRESS') {
        updateFullQaProgress(message);
      }
      if (message.type === 'SFFA_SCAN_PROGRESS') {
        updateScanProgress(message);
      }
      if (message.type === 'SFFA_ELEMENT_PICKED') {
        document.getElementById('tabTestButton')?.click();
        renderPickedElementCard(message.pick);
      }
      if (message.type === 'SFFA_PICKED_PROGRESS') {
        updatePickedProgress(message);
      }
      if (message.type === 'SFFA_DYNAMIC_FIELDS') {
        const currentHost = (() => { try { return new URL(activeSummaryTab?.url || '').hostname; } catch (_) { return ''; } })();
        if (message.hostname === currentHost) {
          const notice = document.getElementById('dynamicFieldNotice');
          if (notice) {
            notice.textContent = `${message.count} fields are now detectable on this page. Run Scan page or Fill the form to refresh results.`;
            notice.classList.remove('hidden');
          }
        }
      }
      if (message.type === 'SFFA_BUTTON_SEQUENCE_PROGRESS') {
        const resultEl = document.getElementById('pageActionResult');
        resultEl.classList.remove('hidden');
        const delayText = message.bulkSaveMode && message.current < message.total
          ? ` — waiting ${message.delayMs / 1000}s before next Save`
          : '';
        resultEl.textContent = `Clicked ${message.current} / ${message.total}: ${message.label}${delayText}`;
      }
  } catch (error) {
    window.SFFAExt.logError('Popup message handler failed', error);
  }
});
