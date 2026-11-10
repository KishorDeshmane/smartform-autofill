// SmartForm AutoFill page runtime — Shared run state, logging/progress, heartbeat and DOM-settle helpers.
// Generated from the former single-file content/content.js. Modules share state through
// window.__SFFA_RT__ (RT) and each stays wrapped in its own function, so re-injection is safe.
(function () {
  // After an extension reload, a copy injected earlier keeps its globals but is disconnected.
  // Skip setup only when an existing copy is still alive; otherwise start a fresh runtime.
  if (window.__SFFA_READY__ && typeof window.__SFFA_ALIVE__ === 'function' && window.__SFFA_ALIVE__()) {
    window.__SFFA_RT_SKIP__ = true;
    return;
  }
  window.__SFFA_RT_SKIP__ = false;
  try { window.__SFFA_FIELD_OBSERVER__?.disconnect?.(); } catch (_) { /* The orphaned observer may already be gone. */ }
  window.__SFFA_FIELD_OBSERVER__ = null;
  const RT = window.__SFFA_RT__ = {};

  const log = (msg, level) => window.SFFALogger.log(msg, level);

  

  /** Sends the current field-fill progress to the extension runtime. */
  function reportProgress(done, total) {
    try {
      window.SFFAExt.api.sendRuntimeMessage({
        type: 'SFFA_PROGRESS',
        done,
        total
      }).catch(() => {});
    } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
  }

  

  /** Tells the popup which scan stage is running so it can show live progress. */
  function reportScanProgress(stage, detail = '') {
    try { window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_SCAN_PROGRESS', stage, detail })?.catch?.(() => {}); }
    catch (_) { /* Progress is best-effort. */ }
  }

  

  /** Sends progress details for a multi-step QA run. */
  function reportQaRunProgress(step, maxSteps, phase, extra) {
    try {
      window.SFFAExt.api.sendRuntimeMessage({
        type: 'SFFA_QA_RUN_PROGRESS',
        step,
        maxSteps,
        phase,
        ...extra
      }).catch(() => {});
    } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
  }

  

  /** Resolves after the specified delay. */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  

  RT.currentRun = null;

  

  /** Marks a run as active unless another run is already in progress. */
  function beginRun(type) {
    if (RT.currentRun) {
      const err = new Error(
        `A "${RT.currentRun.type}" run is already in progress on this page — wait for it to finish, or cancel it first.`
      );
      err.code = 'SFFA_BUSY';
      throw err;
    }
    RT.currentRun = { type, cancelled: false, startedAt: Date.now() };
    startRunHeartbeat();
    return RT.currentRun;
  }

  

  let runHeartbeatTimer = null;

  
  /**
   * While a run is active, tell the popup every few seconds that this page is still alive.
   * The popup's watchdog stops waiting when these (and progress messages) stop arriving,
   * e.g. because the page froze or this script was disconnected.
   */
  function startRunHeartbeat() {
    stopRunHeartbeat();
    const beat = () => {
      if (!RT.currentRun) { stopRunHeartbeat(); return; }
      try { window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_RUN_HEARTBEAT', runType: RT.currentRun.type })?.catch?.(() => {}); }
      catch (_) { /* Heartbeat is best-effort. */ }
    };
    beat();
    runHeartbeatTimer = setInterval(beat, 5000);
  }

  

  /** Stops the active-run heartbeat. */
  function stopRunHeartbeat() {
    if (runHeartbeatTimer) clearInterval(runHeartbeatTimer);
    runHeartbeatTimer = null;
  }

  

  /** Clears the active-run state and notifies listeners that work has finished. */
  function endRun() {
    RT.currentRun = null;
    stopRunHeartbeat();
  }

  

  /** Waits for DOM mutations to quiet down or for the maximum wait time to elapse. */
  function waitForDomSettle({ debounceMs = 350, maxWaitMs = 4000 } = {}) {
    return new Promise(resolve => {
      let settled = false;
      let debounceTimer = null;
      /** Marks this scenario operation complete and releases its local busy state. */
      const finish = () => {
        if (settled) return;
        settled = true;
        try { observer.disconnect(); } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
        clearTimeout(debounceTimer);
        clearTimeout(hardCap);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(finish, debounceMs);
      });
      try {
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      debounceTimer = setTimeout(finish, debounceMs);
      const hardCap = setTimeout(finish, maxWaitMs);
    });
  }

  Object.assign(RT, { log, reportProgress, reportScanProgress, reportQaRunProgress, beginRun, endRun, waitForDomSettle });
})();
