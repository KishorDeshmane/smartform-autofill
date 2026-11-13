(function (root) {
  const hasExt = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

  /** Creates a UUID when available, otherwise a timestamp-based request identifier. */
  function createRequestId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Wraps a message with its type and a fresh request ID for protocol correlation. */
  function makeEnvelope(message) {
    const payload = message && typeof message === 'object' ? message : {};
    return { type: payload.type, requestId: createRequestId(), payload };
  }

  /** Unwraps a matching response envelope and throws if its ID or payload is invalid. */
  function unwrapEnvelope(response, requestId) {
    if (!response || typeof response !== 'object' || !Object.hasOwn(response, 'requestId')) return response;
    if (response.requestId !== requestId || !Object.hasOwn(response, 'payload')) {
      throw new Error('Extension response did not match its request.');
    }
    return response.payload;
  }

  /** Logs an extension API error and signals storage failures to the logger when present. */
  function logError(message, error) {
    console.error(`[QA Kits] ${message}`, error);
    if (message.startsWith('Storage ')) root.__SFFA_STORAGE_ERROR__?.(message);
  }

  const store = {
    /** Reads from chrome.storage.local and returns the fallback if the API or key is unavailable. */
    async get(key, fallback = null) {
      if (!hasExt || !chrome.storage?.local) return fallback;
      try {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? fallback;
      } catch (error) {
        logError('Storage read failed', error);
        return fallback;
      }
    },
    /** Writes to chrome.storage.local and returns false on unsupported API or failure. */
    async set(key, value) {
      if (!hasExt || !chrome.storage?.local) return false;
      try {
        await chrome.storage.local.set({ [key]: value });
        return true;
      } catch (error) {
        logError('Storage write failed', error);
        return false;
      }
    },
    // remove/clear belong to the local store: SFFAStorage.clearAllData() calls store.clear().
    // They were previously defined on sessionStore, so "Clear all data" and auto-clear always failed.
    /** Removes one key from chrome.storage.local and reports whether it succeeded. */
    async remove(key) {
      if (!hasExt || !chrome.storage?.local) return false;
      try { await chrome.storage.local.remove(key); return true; }
      catch (error) { logError('Storage removal failed', error); return false; }
    },
    /** Clears this extension's local storage area and reports whether it succeeded. */
    async clear() {
      if (!hasExt || !chrome.storage?.local) return false;
      try { await chrome.storage.local.clear(); return true; }
      catch (error) { logError('Storage clear failed', error); return false; }
    }
  };

  const sessionStore = {
    /** Reads session storage, falling back to local storage where session storage is unavailable. */
    async get(key, fallback = null) {
      const area = hasExt && (chrome.storage?.session || chrome.storage?.local);
      if (!hasExt || !area) return fallback;
      try {
        const result = await area.get(key);
        return result[key] ?? fallback;
      } catch (error) {
        logError('Session storage read failed', error);
        return fallback;
      }
    },
    /** Writes to session storage, falling back to local storage where needed. */
    async set(key, value) {
      const area = hasExt && (chrome.storage?.session || chrome.storage?.local);
      if (!hasExt || !area) return false;
      try {
        await area.set({ [key]: value });
        return true;
      } catch (error) {
        logError('Session storage write failed', error);
        return false;
      }
    },
    /** Removes a key from the available session/local storage area. */
    async remove(key) {
      const area = hasExt && (chrome.storage?.session || chrome.storage?.local);
      if (!hasExt || !area) return false;
      try { await area.remove(key); return true; }
      catch (error) { logError('Session storage remove failed', error); return false; }
    }
  };

  /** Registers a runtime listener that validates supported envelopes before dispatch. */
  function onMessage(handler) {
    if (hasExt && chrome.runtime?.onMessage) {
      try {
        chrome.runtime.onMessage.addListener((incoming, sender, sendResponse) => {
          try {
            let message = incoming;
            let requestId = null;
            if (incoming && typeof incoming === 'object' && Object.hasOwn(incoming, 'requestId')) {
              if (typeof incoming.type !== 'string' || typeof incoming.requestId !== 'string'
                || !incoming.payload || typeof incoming.payload !== 'object'
                || incoming.type !== incoming.payload.type) {
                sendResponse({ type: 'SFFA_PROTOCOL_ERROR', requestId: incoming.requestId, payload: { ok: false, error: 'Invalid message envelope.' } });
                return false;
              }
              message = incoming.payload;
              requestId = incoming.requestId;
            }
            const respond = requestId
              ? (payload) => sendResponse({ type: message.type, requestId, payload })
              : sendResponse;
            return handler(message, sender, respond);
          } catch (error) {
            logError('Message handler failed', error);
            return false;
          }
        });
      } catch (error) {
        logError('Message listener registration failed', error);
      }
    }
  }

  /** Returns the active tab in the current window, or null if the API is unavailable or fails. */
  async function queryActiveTab() {
    if (!hasExt || !chrome.tabs?.query) return null;
    const ownPrefix = chrome.runtime.getURL('');
    /** True for this extension's own pages (popup opened in a tab, options page). */
    const isOwnPage = tab => typeof tab?.url === 'string' && tab.url.startsWith(ownPrefix);
    try {
      // 1. The active tab of the window this UI lives in (normal popup / side panel case).
      const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (current && !isOwnPage(current)) return current;
      // 2. The active tab of the last focused browser window (UI opened in its own window).
      const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (focused && !isOwnPage(focused)) return focused;
      // 3. The most recently used other tab in this window (UI opened as a tab). Without site access
      //    the browser hides tab URLs, so a missing URL still counts as a possible website tab.
      const candidates = (await chrome.tabs.query({ currentWindow: true }))
        .filter(tab => !isOwnPage(tab) && (!tab.url || /^https?:|^file:/i.test(tab.url)))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      // Never report this extension's own page as the target.
      return candidates[0] || null;
    } catch (error) {
      logError('Active tab query failed', error);
      return null;
    }
  }

  /** Injects the supplied extension scripts into a tab; returns false on unsupported or failed injection. */
  async function injectContentScript(tabId, files) {
    if (!hasExt || !chrome.scripting?.executeScript) return false;
    try {
      // Chrome resolves `files` from the extension root, Firefox from the calling page (popup/…).
      // A leading slash means "extension root" in both browsers.
      const rootFiles = files.map(file => (file.startsWith('/') ? file : `/${file}`));
      await chrome.scripting.executeScript({ target: { tabId }, files: rootFiles });
      return true;
    } catch (error) {
      logError('Content script injection failed', error);
      return false;
    }
  }

  /** Sends a correlated message and retries after optional script injection if no receiver exists. */
  async function sendTabMessage(tabId, message, files = []) {
    if (!hasExt || !chrome.tabs?.sendMessage || tabId == null) return null;
    const envelope = makeEnvelope(message);
    try {
      return unwrapEnvelope(await chrome.tabs.sendMessage(tabId, envelope), envelope.requestId);
    } catch (error) {
      if (!String(error?.message || error).includes('Receiving end does not exist')) throw error;
      if (!files.length || !await injectContentScript(tabId, files)) throw error;
      return unwrapEnvelope(await chrome.tabs.sendMessage(tabId, envelope), envelope.requestId);
    }
  }

  const RUNTIME_TIMEOUT = Symbol('runtime-timeout');
  const api = {
    /** Sends a correlated runtime message and returns null when the API call fails. */
    async sendRuntimeMessage(message, { timeoutMs = 0 } = {}) {
      if (!hasExt || !chrome.runtime?.sendMessage) return null;
      const envelope = makeEnvelope(message);
      let timer = null;
      try {
        const request = chrome.runtime.sendMessage(envelope);
        const response = timeoutMs > 0
          ? await Promise.race([request, new Promise(resolve => { timer = setTimeout(() => resolve(RUNTIME_TIMEOUT), timeoutMs); })])
          : await request;
        if (response === RUNTIME_TIMEOUT) { logError(`Runtime message ${message?.type || ''} timed out after ${timeoutMs}ms`, null); return null; }
        return unwrapEnvelope(response, envelope.requestId);
      }
      catch (error) { logError('Runtime message failed', error); return null; }
      finally { if (timer) clearTimeout(timer); }
    },
    /** Opens the extension's options page, returning false when unsupported or unsuccessful. */
    async openOptionsPage() {
      if (!hasExt || !chrome.runtime?.openOptionsPage) return false;
      try { await chrome.runtime.openOptionsPage(); return true; }
      catch (error) { logError('Could not open options page', error); return false; }
    }
  };

  const runtime = hasExt ? {
    get id() { return chrome.runtime.id; },
    get lastError() { return chrome.runtime.lastError; },
    get onInstalled() { return chrome.runtime.onInstalled; },
    get onStartup() { return chrome.runtime.onStartup; },
    get onSuspend() { return chrome.runtime.onSuspend; },
    get onMessage() { return chrome.runtime.onMessage; },
    getURL: (...args) => chrome.runtime.getURL(...args),
    sendMessage: (...args) => chrome.runtime.sendMessage(...args),
    openOptionsPage: (...args) => chrome.runtime.openOptionsPage(...args)
  } : null;
  const tabs = hasExt ? {
    get onRemoved() { return chrome.tabs.onRemoved; },
    get onActivated() { return chrome.tabs.onActivated; },
    get onUpdated() { return chrome.tabs.onUpdated; },
    query: (...args) => chrome.tabs.query(...args),
    update: (...args) => chrome.tabs.update(...args),
    reload: (...args) => chrome.tabs.reload(...args),
    sendMessage: (...args) => chrome.tabs.sendMessage(...args)
  } : null;
  // `debugger` is an optional permission: chrome.debugger only exists after it is granted, possibly
  // long after this file loaded. Resolve it on every access instead of once at startup.
  const debuggerApiImpl = {
    get onEvent() { return chrome.debugger.onEvent; },
    get onDetach() { return chrome.debugger.onDetach; },
    sendCommand: (...args) => chrome.debugger.sendCommand(...args),
    attach: (...args) => chrome.debugger.attach(...args),
    detach: (...args) => chrome.debugger.detach(...args)
  };
  /** Returns the debugger adapter when the optional permission is currently granted, else null. */
  const getDebuggerApi = () => (hasExt && chrome.debugger ? debuggerApiImpl : null);
  const downloads = hasExt && chrome.downloads ? {
    /** Starts a browser download and returns its ID, or null when the API call fails. */
    async download(options) {
      try { return await chrome.downloads.download(options); }
      catch (error) { logError('Download failed', error); return null; }
    }
  } : null;
  const permissions = hasExt && chrome.permissions ? {
    /** Requests the specified optional permissions and returns whether they were granted. */
    async request(options) {
      try { return await chrome.permissions.request(options); }
      catch (error) { logError('Permission request failed', error); return false; }
    },
    /** Reports whether the specified permissions are already granted. */
    async contains(options) {
      try { return await chrome.permissions.contains(options); }
      catch (error) { logError('Permission check failed', error); return false; }
    },
    get onAdded() { return chrome.permissions.onAdded; }
  } : null;
  const sidePanel = hasExt && chrome.sidePanel ? {
    /** Applies the side-panel behavior setting and reports whether it succeeded. */
    async setPanelBehavior(options) {
      try { await chrome.sidePanel.setPanelBehavior(options); return true; }
      catch (error) { logError('Side panel setup failed', error); return false; }
    },
    /** Opens the extension side panel for the requested tab or browser window. */
    async open(options) {
      try { await chrome.sidePanel.open(options); return true; }
      catch (error) { logError('Could not open the side panel', error); return false; }
    }
  } : null;
  const commands = hasExt && chrome.commands ? {
    /** Returns the browser's current extension shortcut bindings, or an empty list when unsupported. */
    async getAll() {
      try { return await chrome.commands.getAll(); }
      catch (error) { logError('Shortcut lookup failed', error); return []; }
    }
  } : null;
  /**
   * Scripts injected into a page, in load order. Single source of truth for the popup and options.
   * content/runtime/core.js must come before the other runtime modules; dynamic-fields.js is last.
   */
  const contentScripts = Object.freeze([
    'utils/ext.js',
    'utils/logger.js',
    'utils/status-enum.js',
    'utils/storage.js',
    'utils/file-types.js',
    'utils/data-generator.js',
    'content/form-detector.js',
    'content/file-uploader.js',
    'content/form-filler.js',
    'utils/deep-dom.js',
    'utils/selector-engine.js',
    'content/advanced-filler.js',
    'utils/testcase-export.js',
    'content/testcase-wording.js',
    'content/testcase-generator.js',
    'content/qa-engine.js',
    'content/security-scanner.js',
    'content/accessibility-scanner.js',
    'content/runtime/core.js',
    'content/runtime/fill.js',
    'content/runtime/full-qa.js',
    'content/runtime/page-actions.js',
    'content/runtime/picker.js',
    'content/runtime/messaging.js',
    'content/runtime/dynamic-fields.js'
  ]);
  root.SFFAExt = { contentScripts, hasExt, store, sessionStore, onMessage, queryActiveTab, injectContentScript, sendTabMessage, api, runtime, tabs, get debugger() { return getDebuggerApi(); }, downloads, permissions, sidePanel, commands, logError };
})(typeof window !== 'undefined' ? window : self);
