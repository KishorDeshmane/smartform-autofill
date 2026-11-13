// QA Kits page runtime — On-page element picker and picked-element click runs.
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  if (window.__SFFA_RT_SKIP__) return;
  const RT = window.__SFFA_RT__;
  if (!RT) throw new Error('QA Kits: content/runtime/core.js must load first.');

  let pickerState = null;

  

  /** Escapes a value for use in a CSS selector, with a fallback when CSS.escape is absent. */
  function cssEscapeSFFA(s) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(s);
    return String(s).replace(/([^\w-])/g, '\\$1');
  }

  

  /** Adds the element-picker overlay styles once to the page document. */
  function injectPickerStyles() {
    if (document.getElementById('__sffa_picker_style')) return;
    const style = document.createElement('style');
    style.id = '__sffa_picker_style';
    style.textContent = `
      #__sffa_picker_overlay { position: fixed; z-index: 2147483646; pointer-events: none;
        border: 2px solid #4f46e5; background: rgba(79,70,229,0.15); border-radius: 4px;
        display: none; box-sizing: border-box; }
      #__sffa_picker_hint { position: fixed; z-index: 2147483647; left: 50%; top: 14px;
        transform: translateX(-50%); background: #1e2433; color: #fff;
        font: 600 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
        padding: 8px 14px; border-radius: 20px; box-shadow: 0 4px 16px rgba(0,0,0,.25); pointer-events: none; }
    `;
    document.documentElement.appendChild(style);
  }

  

  /** Creates or returns the element-picker highlight overlay. */
  function ensurePickerOverlay() {
    let ov = document.getElementById('__sffa_picker_overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = '__sffa_picker_overlay';
      document.documentElement.appendChild(ov);
    }
    return ov;
  }

  

  /** Creates or returns the hint panel used while the element picker is active. */
  function ensurePickerHint() {
    let hint = document.getElementById('__sffa_picker_hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = '__sffa_picker_hint';
      hint.textContent = '🎯 Click the button/link you want to use — Esc to cancel';
      document.documentElement.appendChild(hint);
    }
    return hint;
  }

  

  /** Removes picker overlay and hint elements from the page. */
  function removePickerChrome() {
    const ov = document.getElementById('__sffa_picker_overlay');
    const hint = document.getElementById('__sffa_picker_hint');
    if (ov) ov.remove();
    if (hint) hint.remove();
  }

  

  /** Updates the highlighted element as the pointer moves during element picking. */
  function onPickerMouseMove(e) {
    if (!pickerState) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.id === '__sffa_picker_overlay' || el.id === '__sffa_picker_hint') return;
    pickerState.hoverEl = el;
    const rect = el.getBoundingClientRect();
    const ov = ensurePickerOverlay();
    ov.style.display = 'block';
    ov.style.left = rect.left + 'px';
    ov.style.top = rect.top + 'px';
    ov.style.width = rect.width + 'px';
    ov.style.height = rect.height + 'px';
  }

  

  /** Handles Escape and keyboard selection while the element picker is active. */
  function onPickerKeydown(e) {
    if (e.key === 'Escape' && pickerState) {
      e.preventDefault();
      RT.log('Element picker cancelled.', 'info');
      stopElementPicker();
    }
  }

  

  /** Captures the clicked element and opens its picker confirmation panel. */
  function onPickerClick(e) {
    if (!pickerState) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const clickedRaw = pickerState.hoverEl || document.elementFromPoint(e.clientX, e.clientY);
    const options = pickerState.options;
    stopElementPicker();
    if (!clickedRaw) {
      RT.log('Element picker: could not resolve an element at that point.', 'warn');
      return;
    }
    if (options.selectorMode) {
      const selector = stableCssSelector(clickedRaw);
      window.SFFAExt.api.sendRuntimeMessage({
        type: 'SFFA_SELECTOR_PICKED',
        hostname: location.hostname,
        fieldType: options.fieldType,
        selector
      }).catch(() => {});
      return;
    }
    const clickable = clickedRaw.closest('button, [role="button"], input[type="submit"], input[type="button"], a') || clickedRaw;
    const matches = findMatchingElements(clickable);
    RT.log(`Element picked: "${RT.getActionLabel(clickable) || clickable.tagName.toLowerCase()}" — ${matches.length} matching element(s) found on page.`, 'info');
    rememberPick(clickable, matches, options);
  }

  

  /** Builds a unique CSS locator, preferring attributes commonly kept stable by applications. */
  function stableCssSelector(element) {
    const tag = element.tagName.toLowerCase();
    const candidates = [];
    for (const attr of ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'name', 'aria-label', 'placeholder']) {
      const value = element.getAttribute(attr);
      if (value) candidates.push(`${tag}[${attr}=${JSON.stringify(value)}]`);
    }
    if (element.id) candidates.unshift(`#${CSS.escape(element.id)}`);
    for (const candidate of candidates) {
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part = `#${CSS.escape(node.id)}`; parts.unshift(part); break; }
      const siblings = Array.from(node.parentElement?.children || []).filter(sibling => sibling.tagName === node.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      const candidate = parts.join(' > ');
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }
    return parts.join(' > ') || tag;
  }

  

  /** Installs picker listeners and visual hints, returning an error if picking is already active. */
  function startElementPicker(options) {
    injectPickerStyles();
    if (pickerState) stopElementPicker();
    document.getElementById('__sffa_picker_panel')?.remove();
    pickerState = { hoverEl: null, options: options || {} };
    ensurePickerHint();
    document.addEventListener('mousemove', onPickerMouseMove, true);
    document.addEventListener('click', onPickerClick, true);
    document.addEventListener('keydown', onPickerKeydown, true);
    document.documentElement.style.cursor = 'crosshair';
  }

  

  /** Removes picker event listeners and temporary page UI, then clears picker state. */
  function stopElementPicker() {
    if (!pickerState) return;
    document.removeEventListener('mousemove', onPickerMouseMove, true);
    document.removeEventListener('click', onPickerClick, true);
    document.removeEventListener('keydown', onPickerKeydown, true);
    document.documentElement.style.cursor = '';
    removePickerChrome();
    pickerState = null;
  }

  

  /** Describes how to find the picked element again (tag, classes, label) after the page re-renders. */
  function pickRecipe(el) {
    return { tag: el.tagName, classes: Array.from(el.classList || []), label: RT.normalizeActionText(RT.getActionLabel(el)) };
  }

  /** Finds page elements matching a recipe; `el` (when still on the page) is always included. */
  function findByRecipe({ tag, classes, label }, el = null) {
    let nodes = [];
    if (classes.length) {
      try {
        const selector = tag.toLowerCase() + '.' + classes.map(cssEscapeSFFA).join('.');
        nodes = Array.from(document.querySelectorAll(selector));
      } catch (e) {
        nodes = [];
      }
    }
    if (!nodes.length) {
      nodes = Array.from(
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a')
      ).filter(n => n.tagName === tag && label && RT.normalizeActionText(RT.getActionLabel(n)) === label);
    }
    if (el && el.isConnected && !nodes.includes(el)) nodes.unshift(el);
    const unique = Array.from(new Set(nodes)).filter(RT.isVisibleEnabledAction);
    unique.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    return unique;
  }

  /** Finds page elements matching the selected element's identifying attributes. */
  function findMatchingElements(el) {
    return findByRecipe(pickRecipe(el), el);
  }



  // The picked element is kept here until the extension panel runs or cancels it. Nothing is drawn
  // on the website except a short highlight; the "Element selected" card lives in the extension UI.
  let pendingPick = null;
  const BULK_THRESHOLD = 100;

  /** Outlines the picked targets for a few seconds so the tester can see what was picked. */
  function highlightTargets(targets, ms = 5000) {
    for (const target of targets) {
      const previousOutline = target.style.outline, previousOffset = target.style.outlineOffset;
      target.style.outline = '3px solid #1267d6';
      target.style.outlineOffset = '3px';
      setTimeout(() => {
        if (target.style.outline.includes('#1267d6')) { target.style.outline = previousOutline; target.style.outlineOffset = previousOffset; }
      }, ms);
    }
  }

  const MAX_INTERVAL_MS = 10 * 60 * 1000;

  /** Interval used when the panel sends none (older panel): the legacy 100+ "bulk" pause, else 0.5s. */
  function legacyIntervalMs(options, count) {
    const useBulkDelay = options.bulkSaveDelay !== false;
    const configured = Number.isFinite(options.saveDelayMs) ? Math.max(0, options.saveDelayMs) : 5000;
    return useBulkDelay && count > BULK_THRESHOLD ? configured : 500;
  }

  /**
   * Returns the picked elements that are on the page now. A page that re-rendered (common after a
   * click in single-page apps) replaces the original nodes, so they are found again from the recipe.
   */
  function resolveTargets(pick) {
    const live = pick.matches.filter(el => el.isConnected && RT.isVisibleEnabledAction(el));
    if (live.length) return live;
    const found = findByRecipe(pick.recipe, null);
    if (found.length) pick.matches = found;
    return found;
  }

  /** Summary sent to the extension panel (text only, no element references). */
  function describePick(pick) {
    const { label, matches, options } = pick;
    return {
      label,
      matchCount: matches.length,
      suggestedIntervalMs: legacyIntervalMs(options, matches.length),
      risky: RT.isRiskyActionLabel(label),
      pickedAt: pick.pickedAt
    };
  }

  /** Stores the pick, highlights it and tells the extension panel to show the card. */
  function rememberPick(el, matches, options) {
    const label = (RT.getActionLabel(el) || el.tagName.toLowerCase()).slice(0, 60);
    pendingPick = { label, matches, options, recipe: pickRecipe(el), pickedAt: Date.now() };
    highlightTargets(matches, 4000);
    window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_ELEMENT_PICKED', pick: describePick(pendingPick) })?.catch?.(() => {});
  }

  /** Sends live progress for the card in the extension panel. */
  function reportPickProgress(status, clicked, total) {
    try { window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_PICKED_PROGRESS', status, clicked, total })?.catch?.(() => {}); }
    catch (_) { /* Progress is best-effort. */ }
  }

  /** Returns the pending pick summary (re-finding re-rendered elements), or null when it is gone. */
  function getPendingPick() {
    if (pendingPick && !resolveTargets(pendingPick).length) pendingPick = null; // page changed
    return pendingPick ? describePick(pendingPick) : null;
  }

  /** Forgets the pending pick. */
  function cancelPendingPick() {
    pendingPick = null;
    return { ok: true };
  }

  /** Formats milliseconds for status text: "0.5s", "2s", "1m 30s". */
  function formatInterval(ms) {
    if (ms < 1000) return `${ms / 1000}s`;
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`;
  }

  /** Waits `ms`, returning early when the run is stopped; shows a countdown for long waits. */
  async function waitBetweenClicks(run, ms, onTick) {
    const end = Date.now() + ms;
    let lastShown = -1;
    while (!run.cancelled) {
      const left = end - Date.now();
      if (left <= 0) return;
      const seconds = Math.ceil(left / 1000);
      if (ms >= 2000 && seconds !== lastShown) { lastShown = seconds; onTick(seconds); }
      await RT.sleepMs(Math.min(250, left));
    }
  }

  /**
   * Runs the pending pick (requested from the extension panel). `dryRun` comes from the panel's
   * current toggle; `intervalMs` is the wait between clicks chosen in the panel. Resolves with a
   * result the panel shows in the card. The pick is kept afterwards so it can be run again.
   */
  async function runPendingPick({ dryRun = true, intervalMs } = {}) {
    if (!pendingPick) return { ok: false, code: 'SFFA_PICK_GONE', error: 'Nothing is selected any more. Use Pick element again.' };
    const targets = resolveTargets(pendingPick);
    if (!targets.length) {
      pendingPick = null;
      return { ok: false, code: 'SFFA_PICK_GONE', error: 'The picked element is no longer on the page. Use Pick element again.' };
    }
    const { options } = pendingPick;
    let run;
    try { run = RT.beginRun('Picked Element Action'); }
    catch (e) { return { ok: false, error: e.message }; }
    try {
      const delayMs = Number.isFinite(intervalMs)
        ? Math.min(MAX_INTERVAL_MS, Math.max(0, Math.round(intervalMs)))
        : legacyIntervalMs(options, targets.length);

      if (dryRun) {
        targets[0].scrollIntoView({ block: 'center', inline: 'nearest' });
        highlightTargets(targets);
        const status = `Dry run: highlighted ${targets.length} target(s); nothing was clicked.`;
        await RT.log(status, 'info');
        return { ok: true, dryRun: true, clicked: 0, failed: 0, total: targets.length, intervalMs: delayMs, status };
      }

      let clicked = 0, failed = 0, stopped = false;
      const total = targets.length;
      await RT.log(`Picked-element click run started: ${total} target(s)${total > 1 ? `, ${formatInterval(delayMs)} between clicks` : ''}.`, 'info');
      reportPickProgress(`Clicking 0/${total}…`, 0, total);
      for (let i = 0; i < total; i++) {
        if (run.cancelled) { stopped = true; break; }
        // A click may re-render the list: use the live element at the same position when needed.
        let el = targets[i];
        if (!el.isConnected) el = findByRecipe(pendingPick.recipe, null)[i] || el;
        if (!el.isConnected || !RT.isVisibleEnabledAction(el)) { failed++; continue; }
        try {
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
          await RT.sleepMs(120);
          el.click();
          clicked++;
          reportPickProgress(`Clicked ${clicked}/${total}…`, clicked, total);
        } catch (_) { failed++; }
        if (i < total - 1 && delayMs > 0 && !run.cancelled) {
          await waitBetweenClicks(run, delayMs, seconds => reportPickProgress(`Clicked ${clicked}/${total} · next click in ${seconds}s`, clicked, total));
        }
      }
      if (run.cancelled) stopped = true;
      const status = stopped
        ? `Stopped after ${clicked}/${total} clicked.`
        : `Done: ${clicked}/${total} clicked${failed ? `, ${failed} skipped (hidden or disabled)` : ''}.`;
      await RT.log(`Picked-element click run finished: ${clicked}/${total} clicked, ${failed} failed.`, failed ? 'warn' : 'success');
      return { ok: true, dryRun: false, clicked, failed, total, stopped, intervalMs: delayMs, status };
    } catch (error) {
      return { ok: false, error: `Action stopped: ${error.message}` };
    } finally { RT.endRun(); }
  }

  Object.assign(RT, { startElementPicker, getPendingPick, cancelPendingPick, runPendingPick });
})();
