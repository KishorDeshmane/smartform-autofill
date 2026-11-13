// QA Kits page runtime — Form fill and field-scoped QA fill runs.
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  if (window.__SFFA_RT_SKIP__) return;
  const RT = window.__SFFA_RT__;
  if (!RT) throw new Error('QA Kits: content/runtime/core.js must load first.');

  async function autoExpandCollapsedSections(log) {
    const EXPAND_LABELS = ['expand all', 'show all', 'expand all sections'];
    const candidates = document.querySelectorAll('button, [role="button"], a');
    let clicked = 0;
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (EXPAND_LABELS.includes(text) && !el.disabled) {
        el.click();
        clicked++;
      }
    }
    if (clicked) {
      await log(`✓ Expanded ${clicked} collapsed section control(s) before scanning the form`, 'info');
      await RT.waitForDomSettle({ debounceMs: 250, maxWaitMs: 1500 });
    }
  }

  

  /** Detects page fields, fills them with supplied data, and returns a fill summary. */
  async function runFill(testData, fieldScope) {
    const run = RT.beginRun('Fill Entire Form');
    try {
      await RT.log('Starting form fill...', 'info');

      await autoExpandCollapsedSections(RT.log);

      const settings = await window.SFFAStorage.getSettings();
      const hostname = window.location.hostname;
      const siteConfig = await window.SFFAStorage.getSiteConfig(hostname);
      const customSelectors = siteConfig?.customSelectors || null;

      const detected = window.SFFAFormDetector.detectFormFields(customSelectors, settings.extraFileKeywords);
      const scopedDetected = fieldScope
        ? window.SFFAQAEngine.filterDetectedFieldsByScope(detected, fieldScope)
        : detected;
      const detectedFieldCount =
        scopedDetected.text.length +
        scopedDetected.select.length +
        scopedDetected.customDropdowns.length +
        Object.keys(scopedDetected.radioGroups).length +
        scopedDetected.checkboxes.length +
        Object.keys(scopedDetected.checkboxGroups || {}).length +
        scopedDetected.file.length;
      const detectedElements = new Set([
        ...scopedDetected.text, ...scopedDetected.select, ...scopedDetected.customDropdowns,
        ...scopedDetected.checkboxes, ...scopedDetected.file,
        ...Object.values(scopedDetected.radioGroups || {}).flatMap(group => group.options || []),
        ...Object.values(scopedDetected.checkboxGroups || {}).flatMap(group => group.options || [])
      ].map(field => field.element || field));
      const siteCredentials = settings.credentialsBySite?.[hostname] || {};
      const credentialInputs = window.SFFAAdvancedFiller
        ? (window.SFFADeepDOM?.queryAll('input') || Array.from(document.querySelectorAll('input')))
          .filter(element => {
            const kind = window.SFFAAdvancedFiller.sensitiveKind(element);
            return !detectedElements.has(element) && ((kind === 'password' && typeof siteCredentials.testPassword === 'string' && siteCredentials.testPassword.length > 0)
              || (kind === 'otp' && typeof siteCredentials.testOtp === 'string' && siteCredentials.testOtp.length > 0));
          })
        : [];
      const totalFields = detectedFieldCount + credentialInputs.length;

      if (totalFields === 0) {
        await RT.log('No fillable fields detected on this page.', 'warn');
        return {
          summary: { textFilled: 0, dropdownsFilled: 0, radiosFilled: 0, checkboxesFilled: 0, filesUploaded: 0, skipped: [], total: 0 },
          testData
        };
      }

      await RT.log(`Detected ${totalFields} fillable field(s).`, 'info');
      RT.reportProgress(0, totalFields);

      const files = await window.SFFAStorage.getFiles();
      const mappings = await window.SFFAStorage.getMappings();
      if (scopedDetected.file.length) await window.SFFAStorage.hydrateFileContents(files);

      const summary = await window.SFFAFormFiller.fillEntireForm(
        scopedDetected, testData, files, mappings, (msg, level) => window.SFFALogger.log(msg, level), {
          rescan: () => window.SFFAQAEngine.filterDetectedFieldsByScope(
            window.SFFAFormDetector.detectFormFields(customSelectors, settings.extraFileKeywords), fieldScope
          ),
          isCancelled: () => run.cancelled,
          settings,
          fieldScope,
          credentials: siteCredentials,
          repeatRows: settings.repeatRowsBySite?.[hostname] || [],
          multiSelectCount: settings.multiSelectCount || 2,
          hydrateFiles: records => window.SFFAStorage.hydrateFileContents(records)
        }
      );

      RT.reportProgress(totalFields, totalFields);
      await RT.log(
        `Form fill completed: ${summary.textFilled + summary.dropdownsFilled + summary.radiosFilled + summary.checkboxesFilled + summary.filesUploaded} filled, ${summary.skipped.length} skipped.`,
        summary.skipped.length ? 'warn' : 'success'
      );

      let verification = null, validationErrors = null;
      try {
        if (window.SFFAQAEngine) {
          await RT.waitForDomSettle({ debounceMs: 150, maxWaitMs: 800 });
          verification = window.SFFAQAEngine.verifyFilledFields(scopedDetected);
          validationErrors = window.SFFAQAEngine.detectValidationErrors();
        }
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }

      return { summary, testData, verification, validationErrors };
    } finally {
      RT.endRun();
    }
  }

  

  /** Runs the selected QA fill mode and reports its scenario results. */
  async function runQAFill(mode, options = {}) {
    const run = RT.beginRun(`${mode === 'negative' ? 'Negative' : 'Boundary'} test run`);
    try {
      await RT.log(`Starting ${mode} test run...`, 'info');
      await autoExpandCollapsedSections(RT.log);

      const settings = await window.SFFAStorage.getSettings();
      const hostname = window.location.hostname;
      const siteConfig = await window.SFFAStorage.getSiteConfig(hostname);
      const customSelectors = siteConfig?.customSelectors || null;

      const engine = window.SFFAQAEngine;
      const logger = (msg, level) => window.SFFALogger.log(msg, level);
      const detectScoped = () => engine.filterDetectedFieldsByScope(
        window.SFFAFormDetector.detectFormFields(customSelectors, settings.extraFileKeywords), options.fieldScope);
      const firstDetected = detectScoped();
      if (options.oneAtATime) return await runOneFieldAtATime(run, mode, options, { engine, logger, detectScoped, firstDetected, settings });

      // Every value for every field, one round at a time: round N gives each field its Nth value.
      // The original values are put back between rounds and at the end.
      const rounds = Math.min(25, engine.scenarioPassCount(mode, firstDetected));
      const original = engine.captureDetectedState(firstDetected);
      const summary = { total: 0, applied: 0, blocked: 0, limited: 0, skipped: [], scenarios: [], rounds: 0 };
      const results = [];
      const validationErrors = [];
      const seenErrors = new Set();
      const seenCases = new Set();
      try {
        for (let round = 0; round < rounds; round++) {
          if (run.cancelled) break;
          const detected = round === 0 ? firstDetected : detectScoped();
          const pass = await engine.fillWithScenarioData(detected, mode, logger, {
            scenarioOffset: round, eachValueOnce: true, isCancelled: () => run.cancelled
          });
          await RT.waitForDomSettle({ debounceMs: 200, maxWaitMs: 1200 });
          const saved = options.clickSubmit ? await saveIfWrongValues(pass, mode) : null;
          for (const result of engine.evaluateScenarioCases(pass.cases)) {
            const key = `${result.field}|${result.scenario}`;
            if (seenCases.has(key)) continue;
            seenCases.add(key);
            results.push({ ...result, round: round + 1 });
          }
          for (const error of engine.detectValidationErrors()) {
            if (seenErrors.has(error.message)) continue;
            seenErrors.add(error.message);
            validationErrors.push(error);
          }
          summary.total += pass.total;
          summary.applied += pass.applied;
          summary.blocked += pass.blocked;
          summary.limited += pass.limited;
          summary.skipped.push(...pass.skipped.filter(item => !summary.skipped.includes(item)));
          summary.rounds = round + 1;
          if (saved?.urlChanged) { summary.stoppedReason = `The page moved to another screen after "${saved.label}" — the form accepted the values, so the run stopped.`; break; }
          if (round < rounds - 1) await engine.restoreDetectedState(original, logger);
        }
      } finally {
        await engine.restoreDetectedState(original, logger).catch(() => {});
      }

      const counts = results.reduce((all, r) => ({ ...all, [r.result]: (all[r.result] || 0) + 1 }), {});
      summary.results = results;
      summary.counts = counts;
      await RT.log(
        `${mode === 'negative' ? 'Wrong data' : 'Edge case'} run completed: ${results.length} case(s) in ${summary.rounds} round(s) — ` +
        `${counts.pass || 0} passed, ${counts.warn || 0} with no error shown, ${counts.fail || 0} failed. Original values restored.`,
        counts.fail ? 'warn' : 'success'
      );

      // `verification` keeps the popup's per-field markers in step with the results.
      const verification = {
        pass: counts.pass || 0, warn: (counts.warn || 0) + (counts.info || 0), fail: counts.fail || 0,
        details: results.filter(r => r.result === 'fail').slice(0, 25).map(r => ({ label: r.field, fieldStatus: 'FAILED', expected: r.expected === 'accept' ? 'value accepted' : 'an error message', actual: r.note }))
      };
      return { summary, verification, validationErrors };
    } finally {
      RT.endRun();
    }
  }

  const SAVE_WORDS = /^(save|submit|continue|next|apply|register|update|create|send|proceed|sign ?up|done|finish|confirm details)\b|\b(save|submit|continue|next)\b/i;
  const NEVER_CLICK = /cancel|back|reset|clear|close|delete|remove|discard|logout|log out|sign out|pay|purchase|buy|terminate|deactivate/i;

  /**
   * The form's own Save / Submit / Next button for a field (also when it is disabled), or null.
   * Never a Cancel / Reset / Delete / Pay-like button.
   */
  function findSaveButton(el) {
    const scope = el?.form || el?.closest?.('form') || document;
    const label = b => (b.value || b.textContent || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim();
    const shown = b => { const r = b.getBoundingClientRect(); const st = getComputedStyle(b); return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden'; };
    const safe = b => shown(b) && !NEVER_CLICK.test(label(b)) && !RT.isRiskyActionLabel(label(b).toLowerCase().replace(/\b(submit|save|confirm)\b/g, '').trim());
    const all = Array.from(scope.querySelectorAll('button, input[type="submit"], [role="button"]')).filter(safe);
    return all.find(b => b.type === 'submit' && b.tagName !== 'A') || all.find(b => SAVE_WORDS.test(label(b))) || null;
  }

  /**
   * Clicks Save / Submit to reveal errors that appear only on save. A full page submission is stopped
   * (the page's own checks still run); the page's reaction is reported:
   * { clicked, disabled, submitted, urlChanged, label }.
   */
  async function clickSaveAndWatch(el) {
    const button = findSaveButton(el);
    if (!button) return { clicked: false, reason: 'no Save / Submit button found' };
    const label = (button.value || button.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Submit';
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') return { clicked: false, disabled: true, label };
    const startUrl = location.href;
    let submitted = false;
    const onSubmit = event => { submitted = true; event.preventDefault(); };
    window.addEventListener('submit', onSubmit, true);
    try {
      button.click();
      await RT.waitForDomSettle({ debounceMs: 250, maxWaitMs: 2000 });
    } finally {
      window.removeEventListener('submit', onSubmit, true);
    }
    return { clicked: true, submitted, urlChanged: location.href !== startUrl, label };
  }

  /**
   * Clicks Save after a pass when it has a value the form should refuse (never for values it should
   * accept, so correct data is not sent), and attaches the result to the pass's cases.
   */
  async function saveIfWrongValues(pass, mode) {
    const engine = window.SFFAQAEngine;
    const shouldRefuse = pass.cases.filter(c => c.outcome === 'entered' && engine.caseExpectation(c) === 'reject');
    if (!shouldRefuse.length) return null;
    const result = await clickSaveAndWatch(shouldRefuse[0].element);
    for (const c of pass.cases) c.submit = result;
    if (result.clicked) await RT.log(`Clicked "${result.label}" to check for on-save errors (${mode === 'negative' ? 'wrong data' : 'edge case'}).`, 'info');
    return result;
  }

  /** The testable units of a page in order: text fields, dropdowns, radio groups, checkbox groups, checkboxes. */
  function testUnits(detected) {
    const units = [];
    for (const field of detected.text || []) units.push({ kind: 'text', el: field.element, part: { text: [field] } });
    for (const field of detected.select || []) units.push({ kind: 'select', el: field.element, part: { select: [field] } });
    for (const [name, group] of Object.entries(detected.radioGroups || {})) units.push({ kind: 'radio', el: group.options?.[0], part: { radioGroups: { [name]: group } }, size: (group.options || []).length });
    for (const [name, group] of Object.entries(detected.checkboxGroups || {})) units.push({ kind: 'checkboxGroup', el: group.options?.[0], part: { checkboxGroups: { [name]: group } } });
    for (const field of detected.checkboxes || []) units.push({ kind: 'checkbox', el: field.element, part: { checkboxes: [field] } });
    return units.filter(unit => unit.el);
  }

  /** How many values a unit gets in a mode (each value is tried once). */
  function unitValueCount(engine, mode, unit) {
    if (unit.kind === 'text') return engine.scenarioCountFor(mode, unit.part.text[0]);
    if (mode === 'negative') return 1;
    return unit.kind === 'radio' ? unit.size : unit.kind === 'checkboxGroup' ? 3 : unit.kind === 'checkbox' ? 2 : 1;
  }

  /**
   * Wrong data / Edge cases, one field at a time: every field first gets correct data, then each
   * value is tried on ONE field while the others stay correct, the page's reaction is judged, and the
   * field goes back to its correct value. `options.targetKey` limits the run to one chosen field.
   * Original values are put back at the end. Files are never touched (an upload cannot be undone).
   */
  async function runOneFieldAtATime(run, mode, options, { engine, logger, detectScoped, firstDetected, settings }) {
    const noFiles = detected => ({ ...detected, file: [] });
    const original = engine.captureDetectedState(firstDetected);
    const results = [];
    const validationErrors = [];
    const seenErrors = new Set();
    const summary = { total: 0, applied: 0, blocked: 0, limited: 0, skipped: [], scenarios: [], rounds: 0, style: 'one-at-a-time', fieldsTested: 0 };
    let customBefore = [];
    try {
      // 1. Correct data everywhere, so an error can only come from the field under test.
      const testData = await window.SFFADataGenerator.generateFreshTestData(settings);
      // Custom dropdowns get a correct choice too, but a page-made list cannot be set back: note what they showed.
      // A type-to-search input shows its choice next to it, in the surrounding box.
      const shownIn = el => el.tagName === 'INPUT' ? (el.closest('[class*="-container"], [class*="select"]') || el.parentElement) : el;
      const typeToSearch = el => el.tagName === 'INPUT' && (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete') || /^react-select-\d+-input$/.test(el.id || ''));
      // Include switched-off ones too (a City box that opens once a State is chosen).
      const inputs = new Set([
        ...(firstDetected.customDropdowns || []).map(field => field.element),
        ...(firstDetected.text || []).map(field => field.element).filter(typeToSearch),
        ...document.querySelectorAll('input[role="combobox"], input[aria-autocomplete]')
      ]);
      const boxes = new Map();
      for (const el of inputs) { const box = shownIn(el); if (box && !boxes.has(box)) boxes.set(box, el); }
      customBefore = [...boxes].map(([box, el]) => {
        const text = (box.textContent || '').replace(/\s+/g, ' ').trim();
        const prompt = text.replace(/^(?:please\s+)?(?:select|choose|pick)\s+(?:an?\s+|the\s+)?/i, '');
        return { box, text, label: prompt && prompt.length <= 40 ? prompt : engine.fieldLabel({ element: el }) };
      });
      await RT.log('Filling every field with correct data first…', 'info');
      await window.SFFAFormFiller.fillEntireForm(noFiles(firstDetected), testData, [], {}, logger, {
        settings, isolatedMode: true, rescan: () => noFiles(detectScoped()), isCancelled: () => run.cancelled,
        // Calendar-only date boxes: save their (empty) value so the final restore clears them again.
        rememberBeforeFill: el => original.state.push(...engine.captureDetectedState({ text: [{ element: el }] }).state)
      });
      await RT.waitForDomSettle({ debounceMs: 200, maxWaitMs: 1500 });
      const validDetected = detectScoped();
      const validState = engine.captureDetectedState(validDetected);

      // 2. One field at a time.
      let units = testUnits(validDetected);
      if (options.targetKey) units = units.filter(unit => engine.fieldKey(unit.el) === options.targetKey);
      if (!units.length) throw new Error(options.targetKey ? 'The chosen field is no longer on the page. Pick it again.' : 'No fields to test.');
      for (const unit of units) {
        if (run.cancelled) break;
        const count = unitValueCount(engine, mode, unit);
        let tested = false;
        for (let i = 0; i < count; i++) {
          if (run.cancelled) break;
          const part = { text: [], select: [], customDropdowns: [], radioGroups: {}, checkboxGroups: {}, checkboxes: [], file: [], ...unit.part };
          const pass = await engine.fillWithScenarioData(part, mode, logger, { scenarioOffset: i, eachValueOnce: true, isCancelled: () => run.cancelled });
          await RT.waitForDomSettle({ debounceMs: 150, maxWaitMs: 900 });
          const saved = options.clickSubmit ? await saveIfWrongValues(pass, mode) : null;
          for (const result of engine.evaluateScenarioCases(pass.cases)) results.push({ ...result, round: i + 1 });
          for (const error of engine.detectValidationErrors()) {
            if (!seenErrors.has(error.message)) { seenErrors.add(error.message); validationErrors.push(error); }
          }
          summary.total += pass.total;
          summary.applied += pass.applied;
          summary.blocked += pass.blocked;
          summary.limited += pass.limited;
          summary.skipped.push(...pass.skipped.filter(item => !summary.skipped.includes(item)));
          summary.rounds = Math.max(summary.rounds, i + 1);
          tested = tested || pass.applied > 0;
          if (saved?.urlChanged) { summary.stoppedReason = `The page moved to another screen after "${saved.label}" — the form accepted a wrong value, so the run stopped.`; break; }
          await engine.restoreDetectedState(validState, logger); // back to correct data before the next value
        }
        if (tested) summary.fieldsTested++;
        if (summary.stoppedReason) break;
      }
    } finally {
      await engine.restoreDetectedState(original, logger).catch(() => {});
      // Close a calendar or list left open by the last field.
      const active = document.activeElement;
      if (active && active !== document.body) {
        active.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        active.blur?.();
      }
    }
    summary.notPutBack = customBefore
      .filter(item => item.box.isConnected && (item.box.textContent || '').replace(/\s+/g, ' ').trim() !== item.text)
      .map(item => item.label);
    const counts = results.reduce((all, r) => ({ ...all, [r.result]: (all[r.result] || 0) + 1 }), {});
    summary.results = results;
    summary.counts = counts;
    await RT.log(
      `${mode === 'negative' ? 'Wrong data' : 'Edge case'} run (one field at a time): ${results.length} case(s) on ${summary.fieldsTested} field(s) — ` +
      `${counts.pass || 0} passed, ${counts.warn || 0} with no error shown, ${counts.fail || 0} failed. ` +
      (summary.notPutBack.length ? `Original values restored, except these dropdowns, which keep a correct choice: ${summary.notPutBack.join(', ')}.` : 'Original values restored.'),
      counts.fail ? 'warn' : 'success'
    );
    const verification = {
      pass: counts.pass || 0, warn: (counts.warn || 0) + (counts.info || 0), fail: counts.fail || 0,
      details: results.filter(r => r.result === 'fail').slice(0, 25).map(r => ({ label: r.field, fieldStatus: 'FAILED', expected: r.expected === 'accept' ? 'value accepted' : 'an error message', actual: r.note }))
    };
    return { summary, verification, validationErrors };
  }

  /** Lists the fields a Wrong data / Edge case run can target (key, label, kind), within the field scope. */
  function listTestableFields(fieldScope) {
    const settingsSelectors = null;
    const detected = window.SFFAQAEngine.filterDetectedFieldsByScope(window.SFFAFormDetector.detectFormFields(settingsSelectors, null), fieldScope);
    return testUnits(detected).map(unit => {
      const listed = window.SFFAQAEngine.listDetectedFields({ text: [], select: [], customDropdowns: [], radioGroups: {}, checkboxes: [], checkboxGroups: {}, file: [], ...unit.part });
      const entry = listed.fields[0] || {};
      return { key: window.SFFAQAEngine.fieldKey(unit.el), label: entry.label || unit.kind, kind: unit.kind };
    });
  }

  Object.assign(RT, { autoExpandCollapsedSections, runFill, runQAFill, listTestableFields });
})();
