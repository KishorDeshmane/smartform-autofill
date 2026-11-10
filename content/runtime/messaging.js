// SmartForm AutoFill page runtime — Runtime message router (message type names are unchanged).
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  if (window.__SFFA_RT_SKIP__) return;
  const RT = window.__SFFA_RT__;
  if (!RT) throw new Error('SmartForm AutoFill: content/runtime/core.js must load first.');

  window.SFFAExt.onMessage((message, sender, sendResponse) => {
    const response = sendResponse;
    sendResponse = (result) => {
      if (message?._sffaDebug) console.debug('[SFFA message result]', { type: message.type, result });
      response(result);
    };
    if (message?._sffaDebug) console.debug('[SFFA message received]', { type: message.type });
    if (!message || typeof message.type !== 'string') return false;
    if (message.type === 'SFFA_PING') {
      sendResponse({
        ok: true,
        ready: true,
        busy: !!RT.currentRun,
        runType: RT.currentRun ? RT.currentRun.type : null,
        runningForMs: RT.currentRun ? Date.now() - RT.currentRun.startedAt : 0
      });
      return true;
    }

    if (message.type === 'SFFA_CANCEL_RUN') {
      if (RT.currentRun) {
        RT.currentRun.cancelled = true;
        sendResponse({ ok: true, cancelled: true, runType: RT.currentRun.type });
      } else {
        sendResponse({ ok: true, cancelled: false, note: 'No run currently in progress' });
      }
      return true;
    }

    if (message.type === 'SFFA_SCAN_PAGE_ACTIONS') {
      try {
        sendResponse({ ok: true, result: RT.getActionScanResult() });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }

    if (message.type === 'SFFA_PAGE_ACTION') {
      RT.runPageAction(message.options || {})
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ ok: false, error: err.message, code: err.code || null }));
      return true;
    }

    if (message.type === 'SFFA_START_ELEMENT_PICKER') {
      try {
        RT.startElementPicker(message.options || {});
        sendResponse({ ok: true, started: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }

    if (message.type === 'SFFA_GET_PICKED_ELEMENT') {
      sendResponse({ ok: true, pick: RT.getPendingPick() });
      return true;
    }

    if (message.type === 'SFFA_CANCEL_PICKED_ELEMENT') {
      sendResponse(RT.cancelPendingPick());
      return true;
    }

    if (message.type === 'SFFA_RUN_PICKED_ELEMENT') {
      RT.runPendingPick({ dryRun: message.dryRun !== false, intervalMs: Number.isFinite(message.intervalMs) ? message.intervalMs : undefined })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === 'SFFA_STOP_PAGE_ACTION') {
      if (RT.currentRun && (RT.currentRun.type === 'Page Action' || RT.currentRun.type === 'Picked Element Action')) {
        RT.currentRun.cancelled = true;
        sendResponse({ ok: true, stopped: true });
      } else {
        sendResponse({ ok: true, stopped: false, note: 'No Page Action is currently running' });
      }
      return true;
    }

    if (message.type === 'SFFA_FULL_QA_RUN') {
      RT.runFullQaRun(message.options || {})
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(err => sendResponse({ ok: false, error: err.message, code: err.code || null }));
      return true;
    }
    if (message.type === 'SFFA_LIST_TESTABLE_FIELDS') {
      try { sendResponse({ ok: true, fields: RT.listTestableFields(message.fieldScope) }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
      return false;
    }

    if (message.type === 'SFFA_QA_FILL') {
      RT.runQAFill(message.mode, message.options || {})
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(err => sendResponse({ ok: false, error: err.message, code: err.code || null }));
      return true;
    }

    if (message.type === 'SFFA_SCAN_PAGE') {
      (async () => {
        try {
          const hostname = window.location.hostname;
          const siteConfig = await window.SFFAStorage.getSiteConfig(hostname);
          const settings = await window.SFFAStorage.getSettings();
          RT.reportScanProgress('fields');
          // Detect once and share the result between the scan summary and the field list.
          const detected = window.SFFAFormDetector.detectFormFields(siteConfig?.customSelectors || null, settings.extraFileKeywords);
          const result = window.SFFAQAEngine.scanPage(siteConfig?.customSelectors || null, settings.extraFileKeywords, settings, detected);
          try {
            const listed = window.SFFAQAEngine.listDetectedFields(detected);
            result.fieldList = listed.fields;
            result.fieldListTotal = listed.total;
          } catch (_) { result.fieldList = []; result.fieldListTotal = 0; }
          RT.reportScanProgress('accessibility');
          // Yield so the progress message is delivered before the next synchronous pass.
          await new Promise(resolve => setTimeout(resolve, 0));
          result.accessibility = window.SFFAA11yScanner?.scan() || null;
          RT.reportScanProgress('links');
          // Link checks get an overall budget so very large pages cannot stall the scan.
          result.linkChecks = await window.SFFAQAEngine.checkSameOriginLinks(2000, settings.linkCheckLimit || 25, 12000,
            (done, total) => RT.reportScanProgress('links', `${done}/${total}`));
          sendResponse({ ok: true, result });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }
    if (message.type === 'SFFA_SECURITY_SCAN') {
      try { sendResponse({ ok: true, result: window.SFFASecurityScanner.scan() }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
      return false;
    }

    if (message.type === 'SFFA_GET_AI_CONTEXT') {
      /** Normalizes and bounds page text included in optional AI context. */
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      /** Excludes controls hidden by themselves or an ancestor from AI context. */
      const rendered = element => {
        if (!element.getClientRects().length) return false;
        for (let node = element; node; node = node.parentElement) {
          if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        }
        return true;
      };
      const fields = Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(element => element.type !== 'hidden' && rendered(element))
        .slice(0, 80)
        .map(element => ({
          type: clean(element.type || element.tagName.toLowerCase()),
          label: clean(element.getAttribute('aria-label') || Array.from(element.labels || []).map(label => label.textContent).join(' ') || element.placeholder || element.name || element.id),
          required: !!element.required || element.getAttribute('aria-required') === 'true',
          disabled: !!element.disabled
        }));
      const actions = Array.from(document.querySelectorAll('button, [role="button"], a[href]'))
        .slice(0, 80)
        .map(element => clean(element.getAttribute('aria-label') || element.textContent || element.title))
        .filter(Boolean);
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .slice(0, 30)
        .map(element => clean(element.textContent))
        .filter(Boolean);
      const currentUrl = new URL(location.href);
      currentUrl.search = '';
      currentUrl.hash = '';
      sendResponse({
        ok: true,
        context: {
          title: clean(document.title),
          url: currentUrl.href,
          headings,
          fields,
          actions
        }
      });
      return false;
    }

    if (message.type === 'SFFA_GENERATE_TESTCASES') {
      (async () => {
        try {
          const hostname = window.location.hostname;
          const siteConfig = await window.SFFAStorage.getSiteConfig(hostname);
          const settings = await window.SFFAStorage.getSettings();
          const detected = window.SFFAFormDetector.detectFormFields(siteConfig?.customSelectors || null, settings.extraFileKeywords);
          const report = window.SFFAQAEngine.generateTestCaseReport(detected);
          sendResponse({ ok: true, ...report });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (message.type === 'SFFA_FILL_FORM') {
      RT.runFill(message.testData, message.options?.fieldScope)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(err => sendResponse({ ok: false, error: err.message, code: err.code || null }));
      return true;
    }

    if (message.type === 'SFFA_DETECT_ONLY') {
      try {
        const detected = window.SFFAFormDetector.detectFormFields(null, null);
        const totalFields =
          detected.text.length + detected.select.length + detected.customDropdowns.length +
          Object.keys(detected.radioGroups).length + detected.checkboxes.length +
          Object.keys(detected.checkboxGroups || {}).length + detected.file.length;
        sendResponse({ ok: true, totalFields });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }
  });
})();
