// QA Kits page runtime — Full QA: isolated Positive/Negative/Boundary suite and optional submit.
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  if (window.__SFFA_RT_SKIP__) return;
  const RT = window.__SFFA_RT__;
  if (!RT) throw new Error('QA Kits: content/runtime/core.js must load first.');

  function sleepMs(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  

  /** Finds a visible submit-like button that does not match the explicit risky-label filters. */
  function findSafeSubmitButton() {
    const risky = window.SFFAQAEngine.findRiskyButtons();
    const riskyLabels = new Set(risky.map(r => r.label));
    const SUBMIT_WORDS = ['submit', 'save', 'continue', 'next', 'proceed', 'confirm', 'apply', 'finish', 'send'];
    const candidates = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
    for (const el of candidates) {
      if (el.disabled) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase();
      if (!text) continue;
      if (riskyLabels.has(text.slice(0, 60))) continue;
      const isNativeFormSubmit = (el.tagName === 'BUTTON' || el.tagName === 'INPUT') && el.type === 'submit' && !!el.form;
      if (isNativeFormSubmit || SUBMIT_WORDS.some(w => text.includes(w))) {
        return { element: el, label: text.slice(0, 60) };
      }
    }
    return null;
  }

  

  /** Finds a submit control only for the separately confirmed Full QA submit step. */
  function findExplicitSubmitButton() {
    const candidates = document.querySelectorAll('button[type="submit"], input[type="submit"], button, [role="button"]');
    for (const el of candidates) {
      if (el.disabled || el.matches(':disabled')) continue;
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const label = (el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim();
      if (RT.isRiskyActionLabel(label.toLowerCase().replace(/\bsubmit\b/g, '').trim())) continue;
      if (el.type === 'submit' || /^submit(?:\s|$)/i.test(label)) return { element: el, label: label.slice(0, 60) || 'submit' };
    }
    return null;
  }

  

  /** Produces a compact deterministic hash used in page fingerprints. */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  

  /** Summarizes form and control structure into a fingerprint for detecting page changes. */
  function pageFingerprint() {
    /** Checks visibility for controls considered during page action scanning. */
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };
    const fields = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(el => el.type !== 'hidden' && visible(el))
      .map(el => `${el.tagName}:${el.type || ''}:${el.name || el.id || ''}`)
      .join('|');
    const bodyTextSample = (document.body?.innerText || '').slice(0, 5000);
    const errorishCount = document.querySelectorAll(
      '[aria-invalid="true"], .error, .invalid, .is-invalid, .has-error, [role="alert"]'
    ).length;
    return [
      location.href,
      document.title,
      document.readyState,
      fields.length,
      hashString(fields),
      hashString(bodyTextSample),
      errorishCount
    ].join('::');
  }

  

  /** Executes isolated QA scenarios with state restoration and optional cancellation. */
  async function runIsolatedModeSuite(run, options = {}) {
    const startedAt = performance.now();
    const settings = await window.SFFAStorage.getSettings();
    const hostname = window.location.hostname;
    const siteConfig = await window.SFFAStorage.getSiteConfig(hostname);
    const customSelectors = siteConfig?.customSelectors || null;
    const files = await window.SFFAStorage.getFiles();
    const mappings = await window.SFFAStorage.getMappings();
    const testData = await window.SFFADataGenerator.generateFreshTestData(settings);
    await window.SFFAStorage.setLastData(testData);

    /** Adapts the run logger to the QA engine's callback signature. */
    const logger = (message, level) => RT.log(message, level);
    /** Returns fields the QA engine can restore for the requested scenario mode. */
    const restorable = (detected, mode) => window.SFFAQAEngine.getRestorableDetectedFields(detected, mode === 'positive');
    const baselines = new Map();
    const restorationLimits = new Set();
    /** Adds captured field states to the baseline and tracks fields that could not be saved. */
    const rememberState = detected => {
      const current = window.SFFAQAEngine.captureDetectedState(detected);
      current.state.forEach(item => { if (!baselines.has(item.identity?.key || item.element)) baselines.set(item.identity?.key || item.element, item); });
      current.skipped.forEach(item => restorationLimits.add(item));
    };
    /** Restores accumulated field baselines and retains any skipped-field information. */
    const restoreOriginalState = async () => {
      const result = await window.SFFAQAEngine.restoreDetectedState({
        state: [...baselines.values()],
        skipped: [...restorationLimits]
      }, logger);
      result.skipped.forEach(item => restorationLimits.add(item));
      return result;
    };
    /** Detects current page fields using the run's selectors and file keyword settings. */
    const detectRawCurrent = () => window.SFFAFormDetector.detectFormFields(customSelectors, settings.extraFileKeywords);
    /** Filters current detected fields to those supported by the requested QA mode. */
    const detectCurrent = mode => restorable(detectRawCurrent(), mode);

    await RT.autoExpandCollapsedSections(logger);
    const firstScan = window.SFFAQAEngine.scanPage(customSelectors, settings.extraFileKeywords, settings);
    const accessibilityCount = window.SFFAA11yScanner?.scan?.().findings?.length ?? null;
    RT.reportQaRunProgress(0, 1, 'detecting', { mode: 'Full QA' });
    const initialDetected = detectRawCurrent();
    let detected = restorable(initialDetected, 'negative');
    rememberState(detected);
    const detectedTotals = {
      text: initialDetected.text.length,
      select: initialDetected.select.length,
      customDropdowns: initialDetected.customDropdowns.length,
      radioGroups: Object.keys(initialDetected.radioGroups || {}).length,
      checkboxes: initialDetected.checkboxes.length + Object.keys(initialDetected.checkboxGroups || {}).length,
      file: initialDetected.file.length
    };
    const fieldsDetected = Object.values(detectedTotals).reduce((total, count) => total + count, 0);
    const summary = { textFilled: 0, dropdownsFilled: 0, radiosFilled: 0, checkboxesFilled: 0, filesUploaded: 0, skipped: [], filledTypes: [] };
    const steps = [];
    const validationErrors = [];
    const verification = { pass: 0, warn: 0, fail: 0, details: [] };
    const submitResult = { attempted: false, clicked: false, label: null, reason: options.submitEnabled ? 'No submit attempt completed.' : 'Submission was not enabled.', stepsAdvanced: 0, urlChanged: false, validationCount: 0 };
    const modes = ['positive', 'negative', 'boundary'];
    const negativePasses = window.SFFAQAEngine.scenarioPassCount('negative', detected);
    const boundaryPasses = window.SFFAQAEngine.scenarioPassCount('boundary', detected);
    const totalPasses = 1 + negativePasses + boundaryPasses;
    let pass = 0;
    let cancelled = false;
    let stopReason = 'All QA modes completed with the form restored.';

    /**
     * Wrong and edge values are judged like the Wrong data / Edge cases modes: an error shown or a value the
     * browser blocks is a pass; a value that should be refused but shows no error is "check"; failed only when wrong.
     */
    const judgeWrongValues = cases => {
      const check = { pass: 0, warn: 0, fail: 0, details: [] };
      for (const r of window.SFFAQAEngine.evaluateScenarioCases(cases)) {
        const status = r.result === 'pass' ? 'pass' : r.result === 'fail' ? 'fail' : 'warn';
        check[status]++;
        if (status === 'pass') continue;
        check.details.push({
          status,
          fieldStatus: status === 'fail' ? 'FAILED' : 'UNABLE_TO_VERIFY',
          label: r.field,
          expected: r.expected === 'reject' ? 'an error message' : r.expected === 'accept' ? 'value accepted' : 'either',
          actual: `${JSON.stringify(String(r.value ?? '').slice(0, 40))}: ${r.note}`
        });
      }
      return check;
    };

    /** Aggregates one scenario's verification and validation results into the full run. */
    const recordChecks = (mode, offset, result) => {
      const check = mode === 'positive' || !Array.isArray(result?.cases)
        ? window.SFFAQAEngine.verifyFilledFields(detected)
        : judgeWrongValues(result.cases);
      const issues = window.SFFAQAEngine.detectValidationErrors();
      verification.pass += check.pass;
      verification.warn += check.warn;
      verification.fail += check.fail;
      verification.details.push(...check.details.map(detail => ({ ...detail, mode, scenarioOffset: offset })));
      validationErrors.push(...issues.map(issue => ({ ...issue, mode, scenarioOffset: offset })));
      return { check, issues };
    };

    /** Runs one QA scenario pass unless cancelled or the safety time limit is reached. */
    const runScenarioPass = async (mode, offset) => {
      if (run.cancelled) return false;
      if (performance.now() - startedAt > (options.maxTotalMs || 30000)) {
        stopReason = 'Stopped at the Full QA safety time limit.';
        return false;
      }
      detected = detectCurrent(mode);
      rememberState(detected);
      const phase = mode === 'positive' ? 'filling' : mode === 'negative' ? 'negative' : 'boundary';
      RT.reportQaRunProgress(pass, totalPasses, phase, { mode, scenario: offset + 1 });
      let result;
      try {
        if (mode === 'positive') {
          if (detected.file.length) await window.SFFAStorage.hydrateFileContents(files);
          result = await window.SFFAFormFiller.fillEntireForm(
            detected, testData, files, mappings, logger, {
              settings,
              isolatedMode: true,
              rememberBeforeFill: el => rememberState({ text: [{ element: el }] }),
              credentials: settings.credentialsBySite?.[hostname] || {},
              repeatRows: settings.repeatRowsBySite?.[hostname] || [],
              multiSelectCount: settings.multiSelectCount || 2,
              hydrateFiles: records => window.SFFAStorage.hydrateFileContents(records),
              rescan: () => {
                const fresh = detectCurrent('positive');
                rememberState(fresh);
                return fresh;
              },
              isCancelled: () => run.cancelled
            }
          );
          result.skipped.push('Custom widgets, saved credentials, and repeatable rows are skipped during isolated Full QA because their page state cannot be reliably restored.');
          result.skipped.push(...(detected.skippedForIsolation || []));
          summary.textFilled += result.textFilled;
          summary.dropdownsFilled += result.dropdownsFilled;
          summary.radiosFilled += result.radiosFilled;
          summary.checkboxesFilled += result.checkboxesFilled;
          summary.filesUploaded += result.filesUploaded;
          summary.skipped.push(...result.skipped);
          summary.filledTypes.push(...(result.filledTypes || []));
        } else {
          result = await window.SFFAQAEngine.fillWithScenarioData(detected, mode, logger, {
            scenarioOffset: offset,
            isCancelled: () => run.cancelled
          });
          result.skipped.push(...(detected.skippedForIsolation || []));
          summary.skipped.push(...result.skipped);
          summary.textFilled += result.applied;
        }

        await RT.waitForDomSettle({ debounceMs: 150, maxWaitMs: 1000 });
        const checks = recordChecks(mode, offset, result);
        steps.push({
          step: steps.length + 1,
          mode,
          scenarioOffset: offset,
          fieldsDetected,
          fieldsFilled: mode === 'positive'
            ? result.textFilled + result.dropdownsFilled + result.radiosFilled + result.checkboxesFilled + result.filesUploaded
            : result.applied,
          fieldsSkipped: result.skipped.length,
          validationErrors: checks.issues.length
        });
      } catch (error) {
        if (run.cancelled || error.message === 'Run cancelled') {
          cancelled = true;
          stopReason = 'Cancelled by user; original native field state was restored where supported.';
          return false;
        }
        throw error;
      } finally {
        await restoreOriginalState();
      }
      pass++;
      RT.reportQaRunProgress(pass, totalPasses, mode === 'boundary' && offset === boundaryPasses - 1 ? 'reporting' : 'validating', { mode, scenario: offset + 1 });
      return !run.cancelled;
    };

    try {
      for (const mode of modes) {
        const count = mode === 'positive' ? 1 : mode === 'negative' ? negativePasses : boundaryPasses;
        for (let offset = 0; offset < count; offset++) {
          if (!await runScenarioPass(mode, offset)) {
            cancelled = run.cancelled;
            if (cancelled) stopReason = 'Cancelled by user; original native field state was restored where supported.';
            break;
          }
        }
        if (cancelled || stopReason !== 'All QA modes completed with the form restored.') break;
      }
    } finally {
      await restoreOriginalState();
    }

    if (options.submitEnabled && !cancelled && !run.cancelled) {
      const finalDetected = detectRawCurrent();
      const finalFill = await window.SFFAFormFiller.fillEntireForm(finalDetected, testData, files, mappings, logger, {
        settings,
        credentials: settings.credentialsBySite?.[hostname] || {},
        repeatRows: settings.repeatRowsBySite?.[hostname] || [],
        multiSelectCount: settings.multiSelectCount || 2,
        hydrateFiles: records => window.SFFAStorage.hydrateFileContents(records),
        isCancelled: () => run.cancelled
      });
      summary.textFilled += finalFill.textFilled;
      summary.dropdownsFilled += finalFill.dropdownsFilled;
      summary.radiosFilled += finalFill.radiosFilled;
      summary.checkboxesFilled += finalFill.checkboxesFilled;
      summary.filesUploaded += finalFill.filesUploaded;
      summary.skipped.push(...finalFill.skipped);
      const submitTarget = findExplicitSubmitButton();
      if (submitTarget) {
        submitResult.attempted = true;
        submitResult.label = submitTarget.label;
        submitResult.reason = 'User enabled Submit and verify and confirmed the page action.';
        const beforeUrl = location.href;
        submitTarget.element.click();
        submitResult.clicked = true;
        await RT.waitForDomSettle({ debounceMs: 300, maxWaitMs: 2500 });
        submitResult.urlChanged = location.href !== beforeUrl;
        submitResult.validationCount = window.SFFAQAEngine.detectValidationErrors().length;
      } else {
        submitResult.reason = 'No visible safe submit-like control was found; the page was not submitted.';
      }
    }

    const durationMs = Math.round(performance.now() - startedAt);
    const outcome = cancelled ? 'cancelled' : verification.fail || validationErrors.length ? 'validation-findings-present' : 'completed';
    if (restorationLimits.size) summary.skipped.push(...restorationLimits);
    await RT.log(`Full QA isolated modes ${cancelled ? 'cancelled' : 'completed'}: ${steps.length} case(s), ${verification.pass} verified, ${verification.fail} failed, no page actions submitted.`, cancelled || verification.fail || validationErrors.length ? 'warn' : 'success');
    RT.reportQaRunProgress(pass, totalPasses, cancelled ? 'cancelled' : 'done', { outcome, stopReason });
    return {
      scan: firstScan,
      detected: detectedTotals,
      summary,
      verification,
      validationErrors,
      accessibilityCount,
      submitResult,
      outcome,
      timings: { suite: durationMs },
      durationMs,
      steps,
      stopReason,
      cancelled,
      modes: Array.from(new Set(steps.map(step => step.mode))),
      restorationLimits: [...restorationLimits],
      dataSeed: testData.seed || null
    };
  }

  

  /** Orchestrates the full QA workflow and returns its collected results and status. */
  async function runFullQaRun(options) {
    const run = RT.beginRun('Full QA Run');
    try {
      const t0 = performance.now();
      const opts = options || {};
      if (opts.modeSuite) return await runIsolatedModeSuite(run, opts);
      const submitEnabled = false;
      const MAX_STEPS = Number.isFinite(opts.maxSteps) && opts.maxSteps > 0 ? opts.maxSteps : 8;
      const MAX_TOTAL_MS = Number.isFinite(opts.maxTotalMs) && opts.maxTotalMs > 0 ? opts.maxTotalMs : 25000;
      const stepSettle = {
        debounceMs: Number.isFinite(opts.stepSettleDebounceMs) ? opts.stepSettleDebounceMs : 300,
        maxWaitMs: Number.isFinite(opts.stepSettleMaxMs) ? opts.stepSettleMaxMs : 3500
      };
      await RT.log(`Starting Full QA Run${submitEnabled ? ' (submit enabled — will advance through multiple steps if present)' : ''}...`, 'info');

      const timings = {};
      let tStep = performance.now();
      /** Records elapsed time for a measured QA-run step. */
      const markStep = (name) => { timings[name] = Math.round(performance.now() - tStep); tStep = performance.now(); };

      const settings = await window.SFFAStorage.getSettings();
      const hostname = window.location.hostname;
      const siteConfig = await window.SFFAStorage.getSiteConfig(hostname);
      const customSelectors = siteConfig?.customSelectors || null;
      const files = await window.SFFAStorage.getFiles();
      const mappings = await window.SFFAStorage.getMappings();
      await window.SFFAStorage.hydrateFileContents(files);

      const testData = await window.SFFADataGenerator.generateFreshTestData(settings);
      await window.SFFAStorage.setLastData(testData);
      markStep('generateData');

      const steps = [];
      let firstScan = null;
      const combinedSummary = { textFilled: 0, dropdownsFilled: 0, radiosFilled: 0, checkboxesFilled: 0, filesUploaded: 0, skipped: [], filledTypes: [] };
      const detectedTotals = { text: 0, select: 0, customDropdowns: 0, file: 0 };
      let lastVerification = { pass: 0, warn: 0, fail: 0, details: [] };
      let lastValidationErrors = [];
      const submitResult = { attempted: false, clicked: false, label: null, reason: null, stepsAdvanced: 0 };
      let stopReason = null;
      let cancelled = false;

      for (let stepIndex = 1; stepIndex <= MAX_STEPS; stepIndex++) {
        if (run.cancelled) {
          cancelled = true;
          stopReason = `Cancelled by user after ${stepIndex - 1} step(s)`;
          RT.reportQaRunProgress(stepIndex - 1, MAX_STEPS, 'cancelled');
          break;
        }
        if (performance.now() - t0 > MAX_TOTAL_MS) {
          stopReason = `Stopped after ${stepIndex - 1} step(s) — time budget (${(MAX_TOTAL_MS / 1000).toFixed(0)}s) exceeded`;
          break;
        }

        RT.reportQaRunProgress(stepIndex, MAX_STEPS, 'detecting');
        await RT.autoExpandCollapsedSections(RT.log);
        const scan = window.SFFAQAEngine.scanPage(customSelectors, settings.extraFileKeywords, settings);
        if (stepIndex === 1) firstScan = scan;
        const detected = window.SFFAFormDetector.detectFormFields(customSelectors, settings.extraFileKeywords);
        detectedTotals.text += detected.text.length;
        detectedTotals.select += detected.select.length;
        detectedTotals.customDropdowns += detected.customDropdowns.length;
        detectedTotals.file += detected.file.length;

        const stepHasFields = !!(detected.text.length || detected.select.length || detected.customDropdowns.length ||
          Object.keys(detected.radioGroups).length || detected.checkboxes.length || Object.keys(detected.checkboxGroups || {}).length || detected.file.length);

        let stepSummary = { textFilled: 0, dropdownsFilled: 0, radiosFilled: 0, checkboxesFilled: 0, filesUploaded: 0, skipped: [], filledTypes: [] };
        if (stepHasFields) {
          RT.reportQaRunProgress(stepIndex, MAX_STEPS, 'filling');
          stepSummary = await window.SFFAFormFiller.fillEntireForm(detected, testData, files, mappings, (msg, level) => RT.log(msg, level), {
            rescan: () => window.SFFAFormDetector.detectFormFields(customSelectors, settings.extraFileKeywords),
            isCancelled: () => run.cancelled || performance.now() - t0 > MAX_TOTAL_MS,
            hydrateFiles: records => window.SFFAStorage.hydrateFileContents(records),
            settings,
            credentials: settings.credentialsBySite?.[hostname] || {},
            repeatRows: settings.repeatRowsBySite?.[hostname] || [],
            multiSelectCount: settings.multiSelectCount || 2
          });
          combinedSummary.textFilled += stepSummary.textFilled;
          combinedSummary.dropdownsFilled += stepSummary.dropdownsFilled;
          combinedSummary.radiosFilled += stepSummary.radiosFilled;
          combinedSummary.checkboxesFilled += stepSummary.checkboxesFilled;
          combinedSummary.filesUploaded += stepSummary.filesUploaded;
          combinedSummary.skipped.push(...stepSummary.skipped);
          combinedSummary.filledTypes.push(...(stepSummary.filledTypes || []));
        } else {
          await RT.log(`Step ${stepIndex}: no fillable fields found on this screen.`, 'info');
        }

        RT.reportQaRunProgress(stepIndex, MAX_STEPS, 'verifying');
        await RT.waitForDomSettle({ debounceMs: 200, maxWaitMs: 1200 });
        lastVerification = window.SFFAQAEngine.verifyFilledFields(detected);
        lastValidationErrors = window.SFFAQAEngine.detectValidationErrors();

        const stepRecord = {
          step: stepIndex,
          fieldsDetected: detected.text.length + detected.select.length + detected.customDropdowns.length + detected.file.length,
          fieldsFilled: stepSummary.textFilled + stepSummary.dropdownsFilled + stepSummary.radiosFilled + stepSummary.checkboxesFilled + stepSummary.filesUploaded,
          fieldsSkipped: stepSummary.skipped.length,
          validationErrors: lastValidationErrors.length,
          buttonClicked: null
        };
        steps.push(stepRecord);

        if (!submitEnabled) {
          stopReason = 'Submit not enabled by user — stayed on the first screen only';
          break;
        }

        if (lastVerification.fail > 0) {
          stopReason = `Stopped at step ${stepIndex} — required fields failed verification`;
          break;
        }
        if (lastValidationErrors.length > 0) {
          stopReason = `Stopped at step ${stepIndex} — the page reported ${lastValidationErrors.length} validation error(s) here; advancing further would mean working off an invalid state`;
          break;
        }

        if (run.cancelled) {
          cancelled = true;
          stopReason = `Cancelled by user after step ${stepIndex} (before advancing)`;
          RT.reportQaRunProgress(stepIndex, MAX_STEPS, 'cancelled');
          break;
        }

        const fingerprintBefore = pageFingerprint();
        const safe = findSafeSubmitButton();
        if (!safe) {
          stopReason = stepIndex === 1
            ? 'No safe submit-like button found on this page — nothing was clicked'
            : `Reached the end after ${stepIndex} step(s) — no further Next/Submit-style button found (this is likely the last screen)`;
          break;
        }

        safe.element.click();
        stepRecord.buttonClicked = safe.label;
        submitResult.attempted = true;
        submitResult.clicked = true;
        submitResult.label = safe.label;
        submitResult.stepsAdvanced = stepIndex;
        await RT.log(`🚀 Step ${stepIndex}: clicked "${safe.label}"`, 'info');
        RT.reportQaRunProgress(stepIndex, MAX_STEPS, 'advancing', { buttonClicked: safe.label });

        await RT.waitForDomSettle(stepSettle);

        const fingerprintAfter = pageFingerprint();
        if (fingerprintBefore === fingerprintAfter) {
          stopReason = `Stopped after step ${stepIndex} — clicking "${safe.label}" produced no visible change (likely the true final action, or the page needs a moment longer — check the screenshot/report)`;
          break;
        }
      }

      if (!stopReason) stopReason = `Stopped after reaching the ${MAX_STEPS}-step safety limit`;
      markStep('run');

      if (!cancelled) {
        await RT.waitForDomSettle({ debounceMs: 200, maxWaitMs: 1200 });
        lastValidationErrors = window.SFFAQAEngine.detectValidationErrors();
      }

      let outcome = 'not-submitted';
      if (cancelled) {
        outcome = 'cancelled';
      } else if (submitResult.clicked) {
        outcome = lastValidationErrors.length > 0 ? 'validation-errors-present' : 'no-validation-errors-detected';
      }
      submitResult.reason = stopReason;

      const durationMs = Math.round(performance.now() - t0);
      await RT.log(
        `Full QA Run ${cancelled ? 'cancelled' : 'completed'} in ${(durationMs / 1000).toFixed(1)}s across ${steps.length} step(s): ` +
        `${lastVerification.pass} verified, ${lastVerification.warn} unable to verify, ${lastVerification.fail} failed, ` +
        `${lastValidationErrors.length} validation message(s). ${stopReason}`,
        cancelled || lastVerification.fail || lastValidationErrors.length ? 'warn' : 'success'
      );
      RT.reportQaRunProgress(steps.length, MAX_STEPS, cancelled ? 'cancelled' : 'done', { outcome, stopReason });

      return {
        scan: firstScan,
        detected: detectedTotals,
        summary: combinedSummary,
        verification: lastVerification,
        validationErrors: lastValidationErrors,
        submitResult, outcome, timings, durationMs,
        steps, stopReason, cancelled,
        dataSeed: testData.seed || null
      };
    } finally {
      RT.endRun();
    }
  }

  Object.assign(RT, { sleepMs, runFullQaRun });
})();
