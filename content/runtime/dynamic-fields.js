// QA Kits page runtime — Dynamic-field watcher; marks the page script ready/alive. Loaded last.
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  if (window.__SFFA_RT_SKIP__) return;
  const RT = window.__SFFA_RT__;
  if (!RT) throw new Error('QA Kits: content/runtime/core.js must load first.');

  if (!window.__SFFA_FIELD_OBSERVER__) {
    let lastFieldCount = null;
    let scanTimer = null;
    let lastRunAt = 0;
    // Only DOM changes that add or remove form controls can change the field count.
    const FIELD_SELECTOR = 'input:not([type="hidden"]), select, textarea, [contenteditable="true"], [contenteditable=""], [role="combobox"], [role="listbox"], [role="textbox"]';
    const MIN_INTERVAL_MS = 2000;
    /** True when any added or removed element is, or contains, a form control. */
    const touchesFormControls = mutations => mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes]
      .some(node => node.nodeType === 1 && (node.matches?.(FIELD_SELECTOR) || node.querySelector?.(FIELD_SELECTOR))));
    /** Schedules one detection at most every 2s, preferring idle time so live pages stay smooth. */
    const scanDynamicFields = () => {
      clearTimeout(scanTimer);
      const wait = Math.max(350, MIN_INTERVAL_MS - (Date.now() - lastRunAt));
      scanTimer = setTimeout(() => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(runDetection, { timeout: 2000 });
        else runDetection();
      }, wait);
    };
    const runDetection = () => {
      lastRunAt = Date.now();
      {
        try {
          const detected = window.SFFAFormDetector.detectFormFields(null, null);
          const count = detected.text.length + detected.select.length + detected.customDropdowns.length
            + Object.keys(detected.radioGroups).length + detected.checkboxes.length
            + Object.keys(detected.checkboxGroups || {}).length + detected.file.length;
          if (lastFieldCount !== null && count !== lastFieldCount) {
            window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_DYNAMIC_FIELDS', hostname: location.hostname, count }).catch(() => {});
          }
          lastFieldCount = count;
        } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      }
    };
    // Text, styling and decoration changes (clocks, carousels, toasts) are ignored entirely.
    const observer = new MutationObserver(mutations => { if (touchesFormControls(mutations)) scanDynamicFields(); });
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__SFFA_FIELD_OBSERVER__ = observer;
    scanDynamicFields();
  }

  window.__SFFA_READY__ = true;
  /** Reports whether this copy can still talk to the extension (false after an extension reload). */
  window.__SFFA_ALIVE__ = () => { try { return !!chrome.runtime?.id; } catch (_) { return false; } };
})();
