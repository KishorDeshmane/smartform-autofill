
(function (root) {
  const CDP_VERSION = '1.3';
  const LOG_REPLAY_WAIT_MS = 600;
  const MAX_LOG_LINES = 60;
  const MAX_ERROR_ENTRIES = 30;
  const MAX_BUFFERED_LINES = 400;
  const MAX_CAPTURE_HEIGHT_PX = 16000;
  const MAX_CANVAS_AREA_PX = 180 * 1000 * 1000;
  const LAZY_SCROLL_BUDGET_MS = 3000;
  /** Redacts credentials and sensitive query/hash values from captured URLs. */
  function sanitizeUrl(raw) {
    if (!raw) return '';
    try {
      const u = new URL(String(raw));
      u.username = '';
      u.password = '';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return String(raw)
        .replace(/^([a-z][a-z\d+.-]*:\/\/)[^/?#@]*@/i, '$1')
        .replace(/[?#].*$/, '');
    }
  }

  /** Bounds and redacts sensitive text before it is retained in a capture session. */
  function sanitizeText(raw) {
    return String(raw == null ? '' : raw)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\b(password|passwd|token|secret|api[-_]?key|authorization|cookie|email|phone|mobile|address|ssn)\b(\s*[:=]\s*)(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1$2[REDACTED]');
  }

  /** Removes or masks path details according to the capture privacy setting. */
  function sanitizePaths(raw) {
    return String(raw == null ? '' : raw)
      .replace(/file:\/\/\/[A-Za-z]:\/Users\/[^/]+/gi, 'file:///…')
      .replace(/[A-Za-z]:\\Users\\[^\\]+/gi, '…')
      .replace(/chrome-extension:\/\/[a-z]{32}/gi, 'chrome-extension://…');
  }

  /** Adds a deduplicated error summary to the session's capped flagged-error list. */
  function addFlaggedError(session, entry) {
    const normalized = String(entry.text || entry.raw || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    const location = String(entry.raw || '').match(/\(([^():]+):(\d+)(?::\d+)?\)/);
    const key = `${normalized}|${location?.[1] || entry.url || ''}|${location?.[2] || ''}`;
    if (session.flaggedErrorKeys.has(key)) return;
    session.flaggedErrorKeys.add(key);
    pushCapped(session.flaggedErrors, entry);
  }

  const sessions = new Map();

  /** Creates an empty capture-session record with initialized collections and counters. */
  function newSession() {
    return {
      attached: false,
      viewportOverride: null,
      consoleLines: [],
      networkLines: [],
      flaggedErrors: [],
      flaggedErrorKeys: new Set(),
      pendingRequests: new Map(),
      counts: { total: 0, c2xx: 0, c3xx: 0, c4xx: 0, c5xx: 0, failed: 0 }
    };
  }

  /** Returns a tab's current capture session, creating one when absent. */
  function getOrCreateSession(tabId) {
    let s = sessions.get(tabId);
    if (!s) {
      s = newSession();
      sessions.set(tabId, s);
    }
    return s;
  }

  /** Appends an item to an array and removes oldest entries beyond the configured cap. */
  function pushCapped(arr, item) {
    arr.push(item);
    while (arr.length > MAX_BUFFERED_LINES) arr.shift();
  }

  /** Sends a Chrome DevTools Protocol command to the attached tab debugger. */
  function cdpSend(tabId, method, params) {
    return new Promise((resolve, reject) => {
      if (!bindDebuggerListeners()) { reject(new Error('Screenshot capture needs the debugger permission. Allow it when the browser asks.')); return; }
      root.SFFAExt.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
        if (root.SFFAExt.runtime.lastError) reject(new Error(root.SFFAExt.runtime.lastError.message));
        else resolve(result);
      });
    });
  }

  /** Attaches the extension debugger once (no recovery). */
  function cdpAttachOnce(tabId) {
    return new Promise((resolve, reject) => {
      if (!bindDebuggerListeners()) { reject(new Error('Screenshot capture needs the debugger permission. Allow it when the browser asks.')); return; }
      if (!bindDebuggerListeners()) { reject(new Error('Screenshot capture needs the debugger permission. Allow it when the browser asks.')); return; }
      root.SFFAExt.debugger.attach({ tabId }, CDP_VERSION, () => {
        if (root.SFFAExt.runtime.lastError) reject(new Error(root.SFFAExt.runtime.lastError.message));
        else resolve();
      });
    });
  }

  /**
   * Attaches the debugger. If Chrome says a debugger is already attached, it may be this extension's
   * own attachment left over from before a service-worker restart: detach it (Chrome only lets the
   * owner detach) and try once more. A debugger owned by someone else (e.g. DevTools) still fails.
   */
  async function cdpAttach(tabId) {
    try { await cdpAttachOnce(tabId); }
    catch (error) {
      if (!/already attached/i.test(error.message)) throw error;
      if (!await cdpDetach(tabId)) throw new Error('Another debugger (for example DevTools) is attached to this tab. Close DevTools for this tab and try again.');
      await cdpAttachOnce(tabId);
    }
  }

  /** Detaches the extension debugger from a tab; resolves true when this extension was attached. */
  function cdpDetach(tabId) {
    return new Promise((resolve) => {
      if (!root.SFFAExt?.debugger) { resolve(false); return; }
      root.SFFAExt.debugger.detach({ tabId }, () => resolve(!root.SFFAExt.runtime.lastError));
    });
  }

  // ---- Session persistence across service-worker restarts ----
  // Chrome keeps the extension's debugger attachment (and keeps sending its events) when MV3 stops
  // the worker, but the in-memory session map is lost. Remember attached tabs in storage.session.
  const SESSIONS_KEY = 'sffaDebuggerSessions';
  const sessionArea = () => (typeof chrome !== 'undefined' && chrome.storage?.session) || null;

  /** Saves which tabs are attached (and any viewport override) so a restarted worker can resume. */
  function persistSessions() {
    const area = sessionArea();
    if (!area) return Promise.resolve();
    const records = [...sessions].filter(([, s]) => s.attached).map(([tabId, s]) => ({
      tabId, viewportOverride: s.viewportOverride || null, networkProfile: s.networkProfile || null, captureActive: !!s.captureActive
    }));
    return area.set({ [SESSIONS_KEY]: records }).catch(() => {});
  }

  /** Rebuilds session records for tabs that Chrome still reports as debugger-attached. */
  async function restoreSessions() {
    const area = sessionArea();
    if (!area || !root.SFFAExt?.debugger) return;
    try {
      const records = (await area.get(SESSIONS_KEY))?.[SESSIONS_KEY] || [];
      if (!records.length) return;
      const attachedTabIds = await new Promise(resolve => chrome.debugger.getTargets(targets =>
        resolve(new Set(targets.filter(t => t.attached && Number.isInteger(t.tabId)).map(t => t.tabId)))));
      for (const record of records) {
        if (!attachedTabIds.has(record.tabId) || sessions.get(record.tabId)?.attached) continue;
        const session = getOrCreateSession(record.tabId);
        session.attached = true;
        session.viewportOverride = record.viewportOverride;
        session.networkProfile = record.networkProfile || null;
        session.captureActive = !!record.captureActive;
        session.restored = true;
      }
      bindDebuggerListeners();
      await persistSessions();
    } catch (_) { /* Restoring is best-effort; attach/detach recover from stale state on their own. */ }
  }
  let sessionsRestored = null;
  /** Restores sessions once per worker lifetime (lazily, after all helpers are defined). */
  function whenSessionsRestored() {
    if (!sessionsRestored) sessionsRestored = restoreSessions();
    return sessionsRestored;
  }

  /** Resolves after the specified delay. */
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Returns a formatted local wall-clock timestamp for capture metadata. */
  function formatWallClock() {
    return new Date().toTimeString().split(' ')[0];
  }

  /** Converts a DevTools console argument into bounded display text. */
  function describeConsoleArg(arg) {
    if (arg.value !== undefined) return sanitizeText(arg.value);
    if (arg.description) return sanitizeText(arg.description);
    return sanitizeText(arg.type || '');
  }

  /** Classifies an HTTP status code into the capture report's status category. */
  function statusKind(status) {
    if (status >= 500) return 'net-5xx';
    if (status >= 400) return 'net-4xx';
    if (status >= 300) return 'net-3xx';
    return 'net-2xx';
  }

  /** Stops session recording and detaches the debugger when it is attached. */
  async function stopCaptureSession(tabId) {
    await whenSessionsRestored();
    const session = sessions.get(tabId);
    if (!session || !session.attached) {
      // No record, but Chrome may still hold this extension's attachment (e.g. after a restart).
      // Detaching also clears any network/viewport emulation that attachment applied.
      const detached = await cdpDetach(tabId);
      return { ok: true, wasAttached: detached };
    }
    try {
      await cdpSend(tabId, 'Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'none'
      });
    } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    if (session.viewportOverride) {
      try { await cdpSend(tabId, 'Emulation.clearDeviceMetricsOverride'); }
      catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      session.viewportOverride = null;
    }
    session.attached = false;
    session.networkProfile = null;
    session.captureActive = false;
    await cdpDetach(tabId);
    await persistSessions();
    return { ok: true, wasAttached: true };
  }

  /** Restores normal network settings and detaches every active tab session. */
  async function detachAllSessions() {
    await Promise.all([...sessions.keys()].map(tabId => stopCaptureSession(tabId).catch(() => {})));
  }

  /** Reports whether the tab's capture session is currently debugger-attached. */
  function isSessionAttached(tabId) {
    const session = sessions.get(tabId);
    return !!(session && session.attached);
  }

  /** Returns bounded capture counts and entries for a tab, or an empty summary. */
  function getSessionSummary(tabId) {
    const session = sessions.get(tabId);
    if (!session) return { consoleErrors: 0, failedRequests: 0 };
    return {
      consoleErrors: session.flaggedErrors.filter(entry => entry.kind === 'console').length,
      failedRequests: session.flaggedErrors.filter(entry => entry.kind === 'network-status' || entry.kind === 'network-failed').length
    };
  }

  /** Records supported DevTools console and network events in the matching tab session. */
  function handleDebuggerEvent(source, method, params) {
    const session = sessions.get(source.tabId);
    if (!session || !session.attached) return;

    if (method === 'Log.entryAdded') {
      const e = params.entry;
      const text = sanitizeText(e.text);
      const line = `[${formatWallClock()}] ${e.level.toUpperCase()}: ${text}`;
      pushCapped(session.consoleLines, line);
      if (e.level === 'error') {
        addFlaggedError(session, { raw: line, kind: 'console', text });
      }
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = sanitizeText((params.args || []).map(describeConsoleArg).join(' '));
      const line = `[${formatWallClock()}] ${params.type.toUpperCase()}: ${text}`;
      pushCapped(session.consoleLines, line);
      if (params.type === 'error') {
        addFlaggedError(session, { raw: line, kind: 'console', text });
      }
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      const desc = sanitizeText((d.exception && (d.exception.description || d.exception.value)) || d.text || 'Uncaught exception');
      const location = d.url ? ` (${d.url}:${d.lineNumber || 0})` : '';
      const line = `[${formatWallClock()}] UNCAUGHT EXCEPTION: ${desc}${location}`;
      pushCapped(session.consoleLines, line);
      addFlaggedError(session, { raw: line, kind: 'console', text: desc });
    } else if (method === 'Network.requestWillBeSent') {
      session.pendingRequests.set(params.requestId, {
        method: params.request.method,
        url: sanitizeUrl(params.request.url),
        startedAt: Date.now()
      });
      while (session.pendingRequests.size > MAX_BUFFERED_LINES) session.pendingRequests.delete(session.pendingRequests.keys().next().value);
      const line = `[${formatWallClock()}] \u2192 ${params.request.method} ${sanitizeUrl(params.request.url)}`;
      pushCapped(session.networkLines, { text: line, kind: 'net-request' });
    } else if (method === 'Network.responseReceived') {
      const { status } = params.response;
      const url = sanitizeUrl(params.response.url);
      const pending = session.pendingRequests.get(params.requestId);
      const method_ = pending?.method || params.response.requestMethod || '';
      const duration = pending ? Date.now() - pending.startedAt : null;
      const durationText = duration !== null ? ` (~${duration}ms)` : '';
      const line = `[${formatWallClock()}] \u2190 ${status} ${method_} ${url}${durationText}`;
      const kind = statusKind(status);
      pushCapped(session.networkLines, { text: line, kind });
      session.counts.total++;
      if (kind === 'net-2xx') session.counts.c2xx++;
      else if (kind === 'net-3xx') session.counts.c3xx++;
      else if (kind === 'net-4xx') session.counts.c4xx++;
      else if (kind === 'net-5xx') session.counts.c5xx++;
      if (status >= 400) {
        addFlaggedError(session, { raw: line, kind: 'network-status', status, url, text: line });
      }
      session.pendingRequests.delete(params.requestId);
    } else if (method === 'Network.loadingFailed') {
      const pending = session.pendingRequests.get(params.requestId);
      const line = `[${formatWallClock()}] \u2717 FAILED ${params.errorText} (${params.type})${pending ? ` ${sanitizeUrl(pending.url)}` : ''}`;
      pushCapped(session.networkLines, { text: line, kind: 'net-failed' });
      session.counts.total++;
      session.counts.failed++;
      addFlaggedError(session, { raw: line, kind: 'network-failed', errorText: params.errorText, text: line });
      session.pendingRequests.delete(params.requestId);
    }
  }

  let debuggerListenersBound = false;
  /**
   * Binds DevTools Protocol listeners once chrome.debugger exists. `debugger` is an optional
   * permission, so at service-worker start it is usually absent; touching it unguarded used to throw
   * here and stop the whole background script (no message listener -> popup stuck on "No page selected").
   */
  function bindDebuggerListeners() {
    const api = root.SFFAExt?.debugger;
    if (debuggerListenersBound) return true;
    if (!api?.onEvent || !api?.onDetach) return false;
    api.onEvent.addListener(handleDebuggerEvent);
    api.onDetach.addListener((source) => {
      const session = sessions.get(source.tabId);
      if (session) { session.attached = false; session.viewportOverride = null; }
    });
    debuggerListenersBound = true;
    return true;
  }
  bindDebuggerListeners();
  try { root.SFFAExt?.permissions?.onAdded?.addListener(() => bindDebuggerListeners()); }
  catch (_) { /* Listeners are also bound lazily before each debugger call. */ }

  if (root.SFFAExt.tabs && root.SFFAExt.tabs.onRemoved) {
    root.SFFAExt.tabs.onRemoved.addListener((tabId) => {
      sessions.delete(tabId);
    });
  }

  /** True while the user has a viewport size or network profile applied to the tab. */
  function holdsEmulation(session) {
    return !!(session?.viewportOverride || session?.networkProfile);
  }

  /** Re-applies the user's viewport and network settings (e.g. after a navigation). */
  async function reapplyEmulation(tabId) {
    const session = sessions.get(tabId);
    if (!session?.attached) return;
    if (session.viewportOverride) {
      await emulateDevice(tabId, normalizeDevice(session.viewportOverride.width, session.viewportOverride.height, session.viewportOverride)).catch(() => {});
    }
    if (session.networkProfile && NETWORK_PROFILES[session.networkProfile]) {
      await cdpSend(tabId, 'Network.enable').catch(() => {});
      await cdpSend(tabId, 'Network.emulateNetworkConditions', { ...NETWORK_PROFILES[session.networkProfile], packetLoss: 0, packetQueueLength: 0, packetReordering: false }).catch(() => {});
    }
  }

  if (root.SFFAExt.tabs?.onUpdated) {
    root.SFFAExt.tabs.onUpdated.addListener((tabId, changeInfo) => {
      const session = sessions.get(tabId);
      if (!session?.attached) return;
      if (changeInfo.status === 'loading') {
        // A viewport size or network profile stays until the user restores it, across reloads and
        // navigation in this tab. A plain capture session still ends when the page changes.
        if (!holdsEmulation(session)) stopCaptureSession(tabId).catch(() => {});
        else session.captureActive = false;
      } else if (changeInfo.status === 'complete' && holdsEmulation(session)) {
        reapplyEmulation(tabId).catch(() => {});
      }
    });
  }

  /** Attaches the debugger if needed and enables the DevTools domains used by capture. */
  async function ensureAttached(tabId) {
    await whenSessionsRestored();
    const session = getOrCreateSession(tabId);
    if (session.attaching) return session.attaching;
    if (session.attached) return { session, freshlyAttached: false };
    session.attaching = (async () => {
      try {
        await cdpAttach(tabId);
        session.attached = true;
        await cdpSend(tabId, 'Page.enable');
        await cdpSend(tabId, 'Network.enable');
        await cdpSend(tabId, 'Log.enable');
        await cdpSend(tabId, 'Runtime.enable');
        await persistSessions();
        return { session, freshlyAttached: true };
      } catch (error) {
        if (session.attached) await cdpDetach(tabId);
        session.attached = false;
        throw error;
      } finally { session.attaching = null; }
    })();
    return session.attaching;
  }

  /**
   * Validates device options from the popup. Older callers send only width/height: phone-sized widths
   * (<= 600) then emulate a touch phone at 2x, wider ones a desktop at 1x.
   */
  function normalizeDevice(width, height, device = {}) {
    const phoneLike = width <= 600;
    const mobile = typeof device?.mobile === 'boolean' ? device.mobile : phoneLike;
    const touch = typeof device?.touch === 'boolean' ? device.touch : phoneLike;
    const deviceScaleFactor = device?.deviceScaleFactor === undefined ? (phoneLike ? 2 : 1) : Number(device.deviceScaleFactor);
    if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 1 || deviceScaleFactor > 4) throw new Error('Pixel density must be between 1 and 4.');
    return { width, height, mobile, touch, deviceScaleFactor };
  }

  /** Sends the size/density/mobile override and the matching touch emulation. */
  async function emulateDevice(tabId, override) {
    await cdpSend(tabId, 'Emulation.setDeviceMetricsOverride', {
      width: override.width, height: override.height, deviceScaleFactor: override.deviceScaleFactor ?? 1, mobile: !!override.mobile
    });
    await cdpSend(tabId, 'Emulation.setTouchEmulationEnabled', override.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }).catch(() => {});
  }

  /** Removes the device override and touch emulation. */
  async function clearDeviceEmulation(tabId) {
    await cdpSend(tabId, 'Emulation.clearDeviceMetricsOverride');
    await cdpSend(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
  }

  /** Applies a persistent emulated device (size, pixel density, mobile layout, touch) until restored. */
  async function applyViewportOverride(tabId, width, height, device) {
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('A valid browser tab is required.');
    if (!Number.isInteger(width) || width < 200 || width > 3000 || !Number.isInteger(height) || height < 200 || height > 3000) {
      throw new Error('Viewport width and height must be whole numbers from 200 to 3000 pixels.');
    }
    const override = normalizeDevice(width, height, device);
    const { session } = await ensureAttached(tabId);
    try {
      await emulateDevice(tabId, override);
      session.viewportOverride = override;
      await persistSessions();
      return { ok: true, ...override };
    } catch (error) {
      try { await clearDeviceEmulation(tabId); } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      session.viewportOverride = null;
      throw error;
    }
  }

  /** Clears a persistent emulated viewport and returns the tab to its normal layout size. */
  async function restoreViewportOverride(tabId) {
    await whenSessionsRestored();
    const session = sessions.get(tabId);
    if (!session?.attached) {
      // An orphaned attachment can still hold the override; detaching clears it.
      return { ok: true, restored: await cdpDetach(tabId) };
    }
    if (!session.viewportOverride) return { ok: true, restored: false };
    await clearDeviceEmulation(tabId);
    session.viewportOverride = null;
    // Nothing else uses the debugger: detach so Chrome's "debugging this browser" bar goes away.
    if (!session.networkProfile && !session.captureActive) await stopCaptureSession(tabId);
    else await persistSessions();
    return { ok: true, restored: true };
  }

  /** Creates or resets a tab capture session and begins collecting debugger events. */
  async function startCaptureSession(tabId) {
    try {
      const { session, freshlyAttached } = await ensureAttached(tabId);
      session.captureActive = true;
      await persistSessions();
      if (freshlyAttached) await sleep(LOG_REPLAY_WAIT_MS);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  const NETWORK_PROFILES = {
    normal: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'none' },
    '2g': { offline: false, latency: 1500, downloadThroughput: 6400, uploadThroughput: 2400, connectionType: 'cellular2g' },
    'slow-2g': { offline: false, latency: 2000, downloadThroughput: 6400, uploadThroughput: 6400, connectionType: 'cellular2g' },
    '3g': { offline: false, latency: 400, downloadThroughput: 96000, uploadThroughput: 32000, connectionType: 'cellular3g' },
    '4g': { offline: false, latency: 100, downloadThroughput: 524288, uploadThroughput: 393216, connectionType: 'cellular4g' },
    '5g': { offline: false, latency: 20, downloadThroughput: 10000000, uploadThroughput: 5000000, connectionType: 'cellular4g' },
    '6g': { offline: false, latency: 5, downloadThroughput: 100000000, uploadThroughput: 50000000, connectionType: 'cellular4g' },
    fast: { offline: false, latency: 20, downloadThroughput: 10000000, uploadThroughput: 5000000, connectionType: 'cellular4g' },
    slow: { offline: false, latency: 400, downloadThroughput: 96000, uploadThroughput: 32000, connectionType: 'cellular3g' },
    'very-slow': { offline: false, latency: 2000, downloadThroughput: 6400, uploadThroughput: 6400, connectionType: 'cellular2g' },
    offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' }
  };

  /** Applies the selected DevTools network emulation profile to a tab. */
  async function setNetworkProfile(tabId, profile) {
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('A valid browser tab is required.');
    const conditions = NETWORK_PROFILES[profile];
    if (!conditions) throw new Error('Unsupported network profile.');
    await whenSessionsRestored();
    if (profile === 'normal' && !sessions.get(tabId)?.attached) {
      // Nothing to throttle: make sure no stale attachment keeps old conditions, without attaching.
      await cdpDetach(tabId);
      return { ok: true, profile };
    }
    const { session } = await ensureAttached(tabId);
    await cdpSend(tabId, 'Network.emulateNetworkConditions', {
      ...conditions,
      packetLoss: 0,
      packetQueueLength: 0,
      packetReordering: false
    });
    session.networkProfile = profile === 'normal' ? null : profile;
    if (!session.networkProfile && !session.viewportOverride && !session.captureActive) await stopCaptureSession(tabId);
    else await persistSessions();
    return { ok: true, profile };
  }

  /** Captures a screenshot preview at the requested emulated viewport dimensions. */
  async function captureViewportPreview(tabId, width, height, device) {
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('A valid browser tab is required.');
    if (!Number.isInteger(width) || width < 200 || width > 3000 || !Number.isInteger(height) || height < 200 || height > 3000) {
      throw new Error('Viewport width and height must be whole numbers from 200 to 3000 pixels.');
    }
    const { session } = await ensureAttached(tabId);
    const previousOverride = session.viewportOverride;
    let restoreError = null;
    let preview;
    try {
      // Same device behaviour as Apply, but rendered at 1x so the preview image stays a sensible size.
      await emulateDevice(tabId, { ...normalizeDevice(width, height, device), deviceScaleFactor: 1 });
      await sleep(250);
      const layout = await cdpSend(tabId, 'Page.getLayoutMetrics');
      const pageSize = layout.cssContentSize || layout.contentSize;
      if (!pageSize?.width || !pageSize?.height) throw new Error('Could not read full-page dimensions.');
      const evaluated = await cdpSend(tabId, 'Runtime.evaluate', {
        expression: '({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})',
        returnByValue: true
      });
      const metrics = evaluated.result?.value;
      if (!metrics) throw new Error('Could not read page layout metrics.');
      const captureWidth = Math.min(Math.ceil(pageSize.width), 3000);
      const maxCaptureHeight = 16000;
      const captureHeight = Math.min(Math.ceil(pageSize.height), maxCaptureHeight);
      const screenshot = await cdpSend(tabId, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: captureWidth, height: captureHeight, scale: 1 }
      });
      if (!screenshot.data || screenshot.data.length > 20 * 1024 * 1024) throw new Error('Full-page preview image is too large to display. Try reducing the viewport width.');
      preview = {
        requested: { width, height },
        actual: { width: metrics.width, height: metrics.height },
        document: { width: metrics.scrollWidth, height: metrics.scrollHeight },
        horizontalOverflow: metrics.scrollWidth > metrics.width + 1,
        capturedWidth: captureWidth,
        capturedHeight: captureHeight,
        truncated: captureHeight < pageSize.height || captureWidth < pageSize.width,
        imageData: screenshot.data
      };
    } finally {
      try {
        if (previousOverride) {
          await emulateDevice(tabId, normalizeDevice(previousOverride.width, previousOverride.height, previousOverride));
        } else {
          await clearDeviceEmulation(tabId);
        }
      }
      catch (error) { restoreError = error.message; }
    }
    return { ok: true, restoredViewport: !restoreError, restoreError, preview };
  }


  /** Produces a short explanation for an HTTP response status and URL. */
  function explainHttpStatus(status, url) {
    const s = Number(status);
    if (s === 400) return 'Server rejected the request as malformed - likely a missing/invalid field in the request payload.';
    if (s === 401) return 'Not authenticated - the request went out without a valid login/session/token, or it expired.';
    if (s === 403) return 'Authenticated but not authorized - the account/token does not have permission for this resource.';
    if (s === 404) return 'The requested URL/resource does not exist on the server - wrong endpoint, removed resource, or a typo in the path.';
    if (s === 408) return 'The server timed out waiting for the request - likely a slow/unstable connection.';
    if (s === 409) return 'Conflict - the request clashes with the current server state (e.g. duplicate entry, stale data).';
    if (s === 413) return 'Payload too large - a file or request body exceeded the server\u2019s size limit.';
    if (s === 415) return 'Unsupported media type - the server didn\u2019t accept the content-type that was sent.';
    if (s === 422) return 'Validation failed - the server understood the request but the data didn\u2019t pass its checks.';
    if (s === 429) return 'Rate limited - too many requests were sent too quickly; the server is throttling this client.';
    if (s === 500) return 'Internal server error - the backend crashed or threw an unhandled exception while processing this request.';
    if (s === 502) return 'Bad gateway - an upstream/proxy server got an invalid response from the actual backend.';
    if (s === 503) return 'Service unavailable - the server is overloaded, restarting, or down for maintenance.';
    if (s === 504) return 'Gateway timeout - an upstream server didn\u2019t respond in time.';
    if (s >= 400 && s < 500) return 'Client-side HTTP error - the request itself was rejected by the server.';
    if (s >= 500) return 'Server-side HTTP error - the backend failed to handle this request.';
    return null;
  }

  /** Maps a DevTools network error string to a readable explanation. */
  function explainNetworkErrorText(errorText) {
    const t = (errorText || '').toLowerCase();
    if (t.includes('err_connection_refused')) return 'The server actively refused the connection - it may be down, or the port/URL is wrong.';
    if (t.includes('err_connection_timed_out') || t.includes('err_timed_out')) return 'The connection timed out - the server never responded in time (network issue or overloaded server).';
    if (t.includes('err_name_not_resolved')) return 'DNS lookup failed - the domain name doesn\u2019t resolve (typo in the URL, or the domain isn\u2019t reachable from this network).';
    if (t.includes('err_internet_disconnected')) return 'No internet connection was available when this request was made.';
    if (t.includes('err_cert') || t.includes('ssl')) return 'SSL/TLS certificate problem - the site\u2019s certificate is invalid, expired, or self-signed.';
    if (t.includes('err_cache_miss')) return 'Browser cache miss on a request that expected cached data - usually harmless.';
    if (t.includes('err_aborted')) return 'The request was cancelled/aborted before it finished - often caused by navigating away or the page cancelling it itself.';
    if (t.includes('err_blocked_by_client')) return 'Blocked by the browser itself - most commonly an ad-blocker or privacy extension.';
    if (t.includes('err_too_many_redirects')) return 'Redirect loop - the server kept redirecting back and forth without resolving.';
    if (t.includes('failed to fetch') || t.includes('cors')) return 'Blocked by CORS - the server didn\u2019t send an Access-Control-Allow-Origin header permitting this page\u2019s origin to read the response.';
    return null;
  }

  /** Adds a heuristic explanation to selected console message patterns. */
  function explainConsoleText(text) {
    const t = text || '';
    if (/chunkloaderror|loading chunk .* failed/i.test(t)) {
      return 'A JS "chunk" (code-split bundle) failed to load - very often because the page is running an old cached version while the server has since deployed a newer build with different file hashes. A hard refresh usually fixes it.';
    }
    if (/hydration failed|did not match|text content does not match|hydration mismatch/i.test(t)) {
      return 'React hydration mismatch - what the server rendered doesn\u2019t match what the client rendered on first paint (often caused by locale/date/random values differing between server and browser).';
    }
    if (/cannot read propert(y|ies) of (undefined|null)/i.test(t)) {
      return 'Code tried to read a property on something that was undefined/null at that point - usually data that hasn\u2019t loaded yet, or an API response shaped differently than expected.';
    }
    if (/is not a function/i.test(t)) {
      return 'Something was called as a function but isn\u2019t one - often a wrong import, an undefined variable, or a library version mismatch.';
    }
    if (/is not defined/i.test(t)) {
      return 'Reference to a variable/function that doesn\u2019t exist in this scope - a missing import, typo, or a script that hasn\u2019t loaded yet.';
    }
    if (/unexpected token/i.test(t)) {
      return 'JavaScript syntax error - the browser received code it couldn\u2019t parse, often from a bad build, a truncated response, or an HTML error page served instead of a JS file.';
    }
    if (/maximum call stack size exceeded/i.test(t)) {
      return 'Infinite/too-deep recursion - a function is calling itself (directly or indirectly) without a proper stopping condition.';
    }
    if (/content security policy|csp/i.test(t)) {
      return 'Blocked by the page\u2019s Content Security Policy - a script/style/resource tried to load from a source the CSP header doesn\u2019t allow.';
    }
    if (/mixed content/i.test(t)) {
      return 'Mixed content - an HTTPS page tried to load an insecure HTTP resource, which browsers block by default.';
    }
    if (/failed to fetch|networkerror when attempting to fetch/i.test(t)) {
      return 'A fetch() call failed outright - typically CORS being blocked, the server being unreachable, or the request being cancelled.';
    }
    if (/uncaught \(in promise\)/i.test(t)) {
      return 'An async operation (a Promise) rejected and nothing caught the rejection - look at what follows for the underlying reason.';
    }
    if (/quota|localstorage/i.test(t) && /exceed/i.test(t)) {
      return 'Browser storage quota exceeded - too much data was written to localStorage/sessionStorage/IndexedDB.';
    }
    return null;
  }

  /** Combines captured error fields into a report-ready explanation. */
  function explainError(entry) {
    if (/reading '(local|sync|session)'|onMessage/i.test(entry.text || entry.raw || '')) {
      return 'Not running as an installed extension.';
    }
    if (entry.kind === 'network-status') {
      return explainHttpStatus(entry.status, entry.url) || 'Unrecognized status code - check the response body/server logs for specifics.';
    }
    if (entry.kind === 'network-failed') {
      return explainNetworkErrorText(entry.errorText) || 'Unrecognized network failure code - the request never completed; check connectivity or server availability.';
    }
    return explainConsoleText(entry.text)
      || 'Could not automatically classify this error from its message - read the raw text/stack above for specifics.';
  }

  /** Scrolls the page in steps to prompt lazy-loaded content before full-page capture. */
  async function triggerLazyContent(tabId) {
    const script = `
      (async () => {
        try {
          const budgetMs = ${LAZY_SCROLL_BUDGET_MS};
          const start = Date.now();
          const originalY = window.scrollY;
          const step = Math.max(200, Math.floor(window.innerHeight * 0.85));
          let y = 0;
          let total = document.documentElement.scrollHeight;
          while (y < total && (Date.now() - start) < budgetMs) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 90));
            y += step;
            total = Math.max(total, document.documentElement.scrollHeight);
          }
          window.scrollTo(0, total);
          await new Promise((r) => setTimeout(r, 150));
          window.scrollTo(0, originalY);
          return true;
        } catch (e) {
          return false;
        }
      })();
    `;
    try {
      await cdpSend(tabId, 'Runtime.evaluate', { expression: script, awaitPromise: true });
    } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
  }

  /** Captures page imagery and session activity, then returns report data or an error. */
  async function captureFullPageReport(tabId) {
    const { session, freshlyAttached } = await ensureAttached(tabId);
    if (freshlyAttached) await sleep(LOG_REPLAY_WAIT_MS);

    const notes = [];

    try {
      await triggerLazyContent(tabId);

      const metrics = await cdpSend(tabId, 'Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize;
      if (!size || !size.width || !size.height) throw new Error('Could not read page dimensions');

      let clippedHeight = size.height;
      if (clippedHeight > MAX_CAPTURE_HEIGHT_PX) {
        notes.push(`Page is ${Math.round(size.height)}px tall — capture truncated to the first ${MAX_CAPTURE_HEIGHT_PX}px (browser screenshot size limit).`);
        clippedHeight = MAX_CAPTURE_HEIGHT_PX;
      }

      let shot;
      let usedViewportFallback = false;
      try {
        shot = await cdpSend(tabId, 'Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: size.width, height: clippedHeight, scale: 1 }
        });
      } catch (captureErr) {
        notes.push(`Full-page capture failed (${captureErr.message}) — fell back to a viewport-only screenshot.`);
        usedViewportFallback = true;
        shot = await cdpSend(tabId, 'Page.captureScreenshot', { format: 'png' });
      }

      const settings = await self.SFFAStorage?.getSettings?.();
      const redactPaths = settings?.redactPathsInReports !== false;
      const composedDataUrl = await composeReportImage(
        shot.data, session.consoleLines, session.networkLines, session.flaggedErrors, session.counts, notes, redactPaths
      );

      const timestamp = Date.now();
      const downloadId = await root.SFFAExt.downloads.download({
        url: composedDataUrl,
        filename: `sffa-report-${timestamp}.png`,
        saveAs: true
      });
      if (downloadId == null) throw new Error('The report image was captured but the browser could not start its download.');

      return {
        ok: true,
        consoleCount: session.consoleLines.length,
        networkCount: session.networkLines.length,
        errorCount: session.flaggedErrors.length,
        usedViewportFallback
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /** Wraps text into lines that fit the canvas context's maximum width. */
  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** Composes the screenshot and captured activity into a downloadable report image. */
  async function composeReportImage(screenshotBase64, consoleLines, networkEntries, flaggedErrors, counts, notes, redactPaths = true) {
    const shotBlob = await (await fetch(`data:image/png;base64,${screenshotBase64}`)).blob();
    let shotBitmap = await createImageBitmap(shotBlob);

    const downscaleNotes = [];
    if (shotBitmap.width * shotBitmap.height > MAX_CANVAS_AREA_PX) {
      const scale = Math.sqrt(MAX_CANVAS_AREA_PX / (shotBitmap.width * shotBitmap.height));
      const newWidth = Math.max(1, Math.floor(shotBitmap.width * scale));
      const newHeight = Math.max(1, Math.floor(shotBitmap.height * scale));
      const scaled = await createImageBitmap(shotBitmap, { resizeWidth: newWidth, resizeHeight: newHeight, resizeQuality: 'medium' });
      if (shotBitmap.close) shotBitmap.close();
      shotBitmap = scaled;
      downscaleNotes.push(`Screenshot downscaled ~${(1 / scale).toFixed(1)}x to fit within the browser's canvas size limit.`);
    }

    const width = shotBitmap.width;
    const padding = 16;
    const lineHeight = 16;
    const maxTextWidth = width - padding * 2;

    const measureCanvas = new OffscreenCanvas(width, 10);
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = '12px monospace';

    const renderLines = [];

    const c = counts || { total: 0, c2xx: 0, c3xx: 0, c4xx: 0, c5xx: 0, failed: 0 };
    const summaryText = `SUMMARY: ${c.total} request(s) \u2022 ${c.c2xx} ok \u2022 ${c.c3xx} redirect \u2022 `
      + `${c.c4xx} client error \u2022 ${c.c5xx} server error \u2022 ${c.failed} failed \u2022 ${flaggedErrors.length} total issue(s) flagged`;
    renderLines.push({ text: summaryText, kind: 'summary' });
    renderLines.push({ text: '', kind: 'normal' });

    const allNotes = [...(notes || []), ...downscaleNotes];
    if (allNotes.length) {
      renderLines.push({ text: `\u2139 NOTES (${allNotes.length})`, kind: 'header' });
      allNotes.forEach((n) => {
        wrapText(measureCtx, `- ${n}`, maxTextWidth).forEach((l) => renderLines.push({ text: l, kind: 'warn' }));
      });
      renderLines.push({ text: '', kind: 'normal' });
    }

    if (flaggedErrors.length) {
      renderLines.push({ text: `\u26a0 ERRORS DETECTED (${flaggedErrors.length})`, kind: 'header-error' });
      renderLines.push({ text: 'See the console and network logs below for details.', kind: 'normal' });
    }

    renderLines.push({ text: '', kind: 'normal' });
    renderLines.push({ text: '\u2500\u2500 CONSOLE LOG \u2500\u2500', kind: 'header' });
    const uniqueConsoleLines = [];
    const consoleErrorKeys = new Set();
    for (const line of consoleLines) {
      if (/\b(?:ERROR|UNCAUGHT EXCEPTION)\b/i.test(line)) {
        const body = line.replace(/^\[[^\]]+\]\s*/, '').replace(/^(?:ERROR|UNCAUGHT EXCEPTION):\s*/i, '').trim();
        const location = body.match(/\(([^():]+):(\d+)(?::\d+)?\)/);
        const key = `${body.replace(/\([^()]+:\d+(?::\d+)?\)/g, '').trim()}|${location?.[1] || ''}|${location?.[2] || ''}`;
        if (consoleErrorKeys.has(key)) continue;
        consoleErrorKeys.add(key);
      }
      uniqueConsoleLines.push(line);
    }
    (uniqueConsoleLines.length ? uniqueConsoleLines.slice(-MAX_LOG_LINES) : ['(no console activity captured)'])
      .forEach((line) => {
        const safeLine = redactPaths ? sanitizePaths(line) : line;
        renderLines.push({ text: safeLine, kind: /ERROR/.test(line) ? 'error' : /WARN/.test(line) ? 'warn' : 'normal' });
      });

    renderLines.push({ text: '', kind: 'normal' });
    renderLines.push({ text: '\u2500\u2500 NETWORK LOG \u2500\u2500', kind: 'header' });
    if (!networkEntries.length) {
      renderLines.push({ text: '(no network activity captured)', kind: 'normal' });
    } else {
      networkEntries.slice(-MAX_LOG_LINES).forEach((entry) => renderLines.push({
        ...entry,
        text: redactPaths ? sanitizePaths(entry.text) : entry.text
      }));
    }

    const logsHeight = padding * 2 + renderLines.length * lineHeight;
    const height = shotBitmap.height + logsHeight;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(shotBitmap, 0, 0);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, shotBitmap.height, width, logsHeight);
    ctx.textBaseline = 'top';

    const colors = {
      summary: '#a5f3fc',
      'header-error': '#fca5a5',
      header: '#38bdf8',
      error: '#f87171',
      warn: '#fbbf24',
      explanation: '#fbbf24',
      normal: '#e2e8f0',
      'net-request': '#94a3b8',
      'net-2xx': '#4ade80',
      'net-3xx': '#38bdf8',
      'net-4xx': '#fb923c',
      'net-5xx': '#f87171',
      'net-failed': '#f87171'
    };
    const fonts = {
      summary: 'bold 12px monospace',
      'header-error': 'bold 13px monospace',
      header: 'bold 12px monospace',
      error: '12px monospace',
      warn: '12px monospace',
      explanation: 'italic 12px monospace',
      normal: '12px monospace',
      'net-request': '12px monospace',
      'net-2xx': '12px monospace',
      'net-3xx': '12px monospace',
      'net-4xx': '12px monospace',
      'net-5xx': '12px monospace',
      'net-failed': '12px monospace'
    };

    let y = shotBitmap.height + padding;
    for (const { text, kind } of renderLines) {
      ctx.fillStyle = colors[kind] || colors.normal;
      ctx.font = fonts[kind] || fonts.normal;
      ctx.fillText(redactPaths ? sanitizePaths(text) : text, padding, y);
      y += lineHeight;
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataUrl(blob);
  }

  /** Converts a Blob to a data URL using FileReader, rejecting on read failure. */
  async function blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

  root.SFFAReportCapture = {
    captureFullPageReport, startCaptureSession, stopCaptureSession, isSessionAttached, getSessionSummary, setNetworkProfile,
    captureViewportPreview, applyViewportOverride, restoreViewportOverride,
    /** Live check: true once the optional debugger permission has been granted. */
    whenSessionsRestored,
    get isDebuggerApiAvailable() { return !!root.SFFAExt?.debugger?.sendCommand; },
    sanitizeUrl, sanitizeText, detachAllSessions
  };
})(typeof window !== 'undefined' ? window : self);
