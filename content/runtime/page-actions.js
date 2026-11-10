// SmartForm AutoFill page runtime — Submit/Save/Next discovery and execution.
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  if (window.__SFFA_RT_SKIP__) return;
  const RT = window.__SFFA_RT__;
  if (!RT) throw new Error('SmartForm AutoFill: content/runtime/core.js must load first.');

  const PAGE_ACTION_POSITIVE = [
    'submit', 'save', 'save & continue', 'save and continue',
    'next', 'continue', 'proceed', 'confirm', 'finish', 'apply', 'send', 'done'
  ];

  
  const PAGE_ACTION_RISKY = [
    'delete', 'remove', 'cancel', 'logout', 'log out', 'sign out', 'back',
    'previous', 'prev', 'close', 'discard', 'reset', 'clear', 'pay',
    'purchase', 'place order', 'unsubscribe', 'deactivate', 'submit', 'confirm', 'checkout'
  ];

  

  /** Normalizes action text for label comparisons. */
  function normalizeActionText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  

  /** Derives an action label from element metadata and visible text. */
  function getActionLabel(el) {
    return normalizeActionText(
      el.textContent || el.value || el.getAttribute('aria-label') ||
      el.getAttribute('title') || el.getAttribute('data-testid') || ''
    );
  }

  

  /** Checks whether an element is visible, connected, and enabled for interaction. */
  function isVisibleEnabledAction(el) {
    if (!el || !el.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  

  /** Checks the action label against the module's risky-action patterns. */
  function isRiskyActionLabel(label) {
    const text = normalizeActionText(label);
    return PAGE_ACTION_RISKY.some(word => {
      if (word.includes(' ')) return text.includes(word);
      return new RegExp(`(?:^|\\b)${word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:\\b|$)`, 'i').test(text);
    });
  }

  

  /** Categorizes an action label into the supported page-action types. */
  function actionType(label) {
    const text = normalizeActionText(label);
    if (/save/.test(text)) return 'save';
    if (/submit/.test(text)) return 'submit';
    if (/next|continue|proceed/.test(text)) return 'next';
    if (/confirm|finish|apply|send|done/.test(text)) return 'other';
    return 'unknown';
  }

  

  /** Collects visible interactive page elements considered for the action scan. */
  function getPageActionCandidates() {
    const nodes = document.querySelectorAll(
      'button, [role="button"], input[type="submit"], input[type="button"]'
    );
    const candidates = [];
    const seen = new Set();
    for (const el of nodes) {
      if (!isVisibleEnabledAction(el)) continue;
      const label = getActionLabel(el);
      if (!label || isRiskyActionLabel(label)) continue;
      const nativeSubmit = el.tagName === 'BUTTON' && (el.type || '').toLowerCase() === 'submit' && !!el.form;
      const inputSubmit = el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'submit' && !!el.form;
      const positive = PAGE_ACTION_POSITIVE.some(word => label.includes(word));
      if (!positive && !nativeSubmit && !inputSubmit) continue;

      if (seen.has(el)) continue;
      seen.add(el);
      candidates.push({
        element: el,
        label: label.slice(0, 100),
        type: actionType(label),
        text: label,
        rect: el.getBoundingClientRect()
      });
    }

    const rank = { submit: 0, save: 1, next: 2, other: 3, unknown: 4 };
    candidates.sort((a, b) => (rank[a.type] - rank[b.type]) || (a.rect.top - b.rect.top));
    return candidates;
  }

  

  /** Returns the current action candidates with labels, categories, and risk indicators. */
  function getActionScanResult() {
    const all = getPageActionCandidates();
    const saveButtons = all.filter(x => x.type === 'save');
    const risky = window.SFFAQAEngine.findRiskyButtons();
    return {
      total: all.length,
      saveCount: saveButtons.length,
      riskyCount: risky.length,
      riskyCandidates: risky.slice(0, 30),
      candidates: all.slice(0, 50).map((x, index) => ({
        index: index + 1,
        label: x.label,
        type: x.type
      }))
    };
  }

  

  /** Builds DOM identity keys used to recover an action after page mutations. */
  function actionIdentityKeys(candidate, cache = new WeakMap()) {
    const el = candidate.element;
    const keys = [];
    const attrs = ['id', 'data-testid', 'data-test-id', 'data-test', 'data-row-id', 'data-key', 'data-id'];
    const prefix = JSON.stringify([candidate.type, candidate.label]);
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (value) keys.push(prefix + JSON.stringify(['button', attr, value]));
    }
    for (let row = el.parentElement; row && row !== document.body; row = row.parentElement) {
      let entry = cache.get(row);
      if (!entry) {
        const labels = new Map();
        for (const peer of row.querySelectorAll('button,[role="button"],input[type="submit"],input[type="button"]')) {
          const label = getActionLabel(peer);
          labels.set(label, (labels.get(label) || 0) + 1);
        }
        entry = { labels, text: null };
        cache.set(row, entry);
      }
      if ((entry.labels.get(candidate.label) || 0) > 1) break;
      for (const attr of attrs) {
        const value = row.getAttribute(attr);
        if (value) keys.push(prefix + JSON.stringify(['row', row.tagName, attr, value]));
      }
      if (entry.text === null) {
        const copy = row.cloneNode(true);
        copy.querySelectorAll('button,[role="button"],input,select,textarea,script,style,[role="status"],[aria-live]').forEach(n => n.remove());
        entry.text = normalizeActionText(copy.textContent);
      }
      if (entry.text && entry.text.length <= 300) keys.push(prefix + JSON.stringify(['row-text', row.tagName, entry.text]));
    }
    keys.push(prefix + ':label');
    return keys;
  }

  

  /** Captures identity keys for a candidate list before actions modify the page. */
  function snapshotActionIdentities(candidates) {
    const cache = new WeakMap();
    const allKeys = candidates.map(candidate => actionIdentityKeys(candidate, cache));
    const counts = new Map();
    for (const keys of allKeys) for (const key of new Set(keys)) counts.set(key, (counts.get(key) || 0) + 1);
    return allKeys.map(keys => keys.filter(key => counts.get(key) === 1));
  }

  

  /** Attempts to resolve a prior action candidate to its current DOM element. */
  function recoverPageAction(original, identity) {
    if (isVisibleEnabledAction(original.element)) return original;
    if (!identity.length) return null;
    const prefix = JSON.stringify([original.type, original.label]);
    const actionSelector = 'button,[role="button"],input[type="submit"],input[type="button"]';
    /** Checks whether a current action candidate has the original action's label. */
    const sameLabel = el => getActionLabel(el) === original.label;
    for (const key of identity) {
      const suffix = key.slice(prefix.length);
      let elements = [];
      if (suffix === ':label') {
        elements = Array.from(document.querySelectorAll(actionSelector)).filter(sameLabel);
      } else {
        const [kind, tagOrAttr, attrOrValue, value] = JSON.parse(suffix);
        if (kind === 'button') {
          elements = Array.from(document.querySelectorAll(actionSelector)).filter(el => el.getAttribute(tagOrAttr) === attrOrValue && sameLabel(el));
        } else {
          for (const row of document.getElementsByTagName(tagOrAttr)) {
            if (kind === 'row' && row.getAttribute(attrOrValue) !== value) continue;
            const buttons = Array.from(row.querySelectorAll(actionSelector)).filter(sameLabel);
            if (kind === 'row-text') {
              if (buttons.length !== 1) continue;
              const copy = row.cloneNode(true);
              copy.querySelectorAll('button,[role="button"],input,select,textarea,script,style,[role="status"],[aria-live]').forEach(n => n.remove());
              if (normalizeActionText(copy.textContent) !== attrOrValue) continue;
            }
            elements.push(...buttons);
          }
        }
      }
      elements = [...new Set(elements)];
      if (elements.length > 1) return null;
      if (elements.length === 1) return isVisibleEnabledAction(elements[0]) ? { ...original, element: elements[0] } : null;
    }
    return null;
  }

  

  /** Performs the requested page action sequence and returns per-action outcomes. */
  async function runPageAction(options) {
    const run = RT.beginRun('Page Action');
    try {
      const opts = options || {};
      const useBulkSaveDelay = opts.bulkSaveDelay !== false;
      const configuredDelay = Number.isFinite(opts.saveDelayMs) ? Math.max(0, opts.saveDelayMs) : 5000;
      const normalDelay = Number.isFinite(opts.normalDelayMs) ? Math.max(250, opts.normalDelayMs) : 750;
      const scan = getActionScanResult();

      if (!scan.total) {
        return { ok: false, error: 'No safe Submit / Save / Next / Continue / Proceed button was found on this page.', scan };
      }

      const initialCandidates = getPageActionCandidates();
      const saveCount = initialCandidates.filter(x => x.type === 'save').length;
      const bulkSaveMode = useBulkSaveDelay && saveCount > 100;
      const delayMs = bulkSaveMode ? configuredDelay : normalDelay;
      const clicked = [];
      const failed = [];

      await RT.log(
        `Page Action started: ${initialCandidates.length} safe action button(s) found; ${saveCount} Save button(s). ` +
        `${bulkSaveMode ? `100+ Save mode enabled — ${delayMs / 1000}s delay between Save clicks.` : 'Single/normal action mode.'}`,
        'info'
      );

      const targets = bulkSaveMode
        ? initialCandidates.filter(x => x.type === 'save')
        : [initialCandidates[0]];
      const identities = snapshotActionIdentities(targets);

      if (opts.dryRun) {
        for (const target of targets) {
          target.element.scrollIntoView({ block: 'center', inline: 'nearest' });
          const previousOutline = target.element.style.outline;
          const previousOffset = target.element.style.outlineOffset;
          target.element.style.outline = '3px solid #1267d6';
          target.element.style.outlineOffset = '3px';
          setTimeout(() => { if (target.element.style.outline === 'rgb(18, 103, 214) solid 3px' || target.element.style.outline.includes('#1267d6')) { target.element.style.outline = previousOutline; target.element.style.outlineOffset = previousOffset; } }, 5000);
        }
        return { ok: true, scan, clicked: [], failed: [], stopped: false, previewed: targets.length, targetCount: targets.length, bulkSaveMode, delayMs };
      }

      for (let i = 0; i < targets.length; i++) {
        if (run.cancelled) {
          await RT.log(`Page Action stopped by user after ${clicked.length} click(s).`, 'warn');
          break;
        }

        let target = recoverPageAction(targets[i], identities[i]);
        if (!target || !isVisibleEnabledAction(target.element)) {
          failed.push({ label: targets[i].label, reason: 'Button unavailable or row identity is ambiguous after re-render' });
          continue;
        }

        try {
          target.element.scrollIntoView({ block: 'center', inline: 'nearest' });
          await RT.sleepMs(150);
          if (run.cancelled) break;
          target = recoverPageAction(target, identities[i]);
          if (!target) throw new Error('Button unavailable or row identity is ambiguous before click');
          target.element.click();
          clicked.push({ index: i + 1, label: target.label, type: target.type });
          try {
            window.SFFAExt.api.sendRuntimeMessage({
              type: 'SFFA_BUTTON_SEQUENCE_PROGRESS',
              current: clicked.length,
              total: targets.length,
              label: target.label,
              actionType: target.type,
              delayMs,
              bulkSaveMode
            }).catch(() => {});
          } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }

          if (i < targets.length - 1) {
            if (bulkSaveMode) {
              await RT.log(`✓ Save ${clicked.length}/${targets.length}: "${target.label}" clicked — waiting ${delayMs / 1000}s before the next Save.`, 'info');
            }
            await RT.sleepMs(delayMs);
          } else {
            await RT.sleepMs(100);
          }
        } catch (e) {
          failed.push({ label: targets[i].label, reason: e.message });
        }
      }

      const stopped = !!run.cancelled;
      const modeText = bulkSaveMode ? `100+ Save mode (${delayMs / 1000}s delay)` : 'single action';
      await RT.log(
        `Page Action ${stopped ? 'stopped' : 'completed'}: ${clicked.length}/${targets.length} clicked, ${failed.length} failed — ${modeText}.`,
        failed.length || stopped ? 'warn' : 'success'
      );
      return {
        ok: true,
        scan,
        clicked,
        failed,
        stopped,
        bulkSaveMode,
        delayMs,
        targetCount: targets.length
      };
    } finally {
      RT.endRun();
    }
  }

  Object.assign(RT, { normalizeActionText, getActionLabel, isVisibleEnabledAction, isRiskyActionLabel, getActionScanResult, runPageAction });
})();
