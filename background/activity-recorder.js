// QA Kit — page activity recorder without the Chrome debugger (so Chrome shows no "debugging" bar).
// Two self-contained functions are injected with chrome.scripting.executeScript:
//   installActivityHook (MAIN world): watches console calls, uncaught errors, fetch, XHR and loaded
//     resources, and reports each as a DevTools-like event on a private DOM event.
//   setActivityRelay (extension's isolated world): collects those events and passes them to the
//     background in small batches. The background records them with the same code it used for
//     debugger events, so reports and counts look the same as before.
/* global CustomEvent, Element, Request, PerformanceObserver -- these run inside the page, not the worker. */
(function (root) {
  /** MAIN world. Installed once per page; later calls only change the event name. */
  function installActivityHook(eventName) {
    const existing = window.__qaKitActivityHook;
    if (existing) { existing.eventName = eventName; return; }
    const state = { eventName };
    Object.defineProperty(window, '__qaKitActivityHook', { value: state, configurable: true });
    let seq = 0;
    const nextId = () => `qa${Date.now().toString(36)}${(seq++).toString(36)}`;
    const emit = (method, params) => {
      if (!state.eventName) return; // Paused (recording stopped).
      try { document.dispatchEvent(new CustomEvent(state.eventName, { detail: JSON.stringify({ method, params }) })); }
      catch (_) { /* Never break the page. */ }
    };
    const describe = value => {
      try {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
        if (value === undefined) return 'undefined';
        if (typeof value === 'object' && value !== null) {
          if (value instanceof Element) return `<${value.tagName.toLowerCase()}${value.id ? `#${value.id}` : ''}>`;
          return JSON.stringify(value).slice(0, 300);
        }
        return String(value);
      } catch (_) { return Object.prototype.toString.call(value); }
    };
    const absolute = url => { try { return new URL(String(url), location.href).href; } catch (_) { return String(url); } };
    // A same-site file that fails (e.g. a 404 image) is seen twice: by its error event and by the
    // resource timing entry. Whichever comes first reports it; the other one is skipped.
    const reportedFailures = new Map();
    const firstFailureReport = url => {
      const seenAt = reportedFailures.get(url);
      reportedFailures.delete(url);
      if (seenAt !== undefined && Date.now() - seenAt < 3000) return false;
      if (reportedFailures.size > 200) reportedFailures.clear();
      reportedFailures.set(url, Date.now());
      return true;
    };

    // Console
    for (const type of ['error', 'warn', 'info', 'log']) {
      const original = console[type];
      if (typeof original !== 'function') continue;
      console[type] = function (...args) {
        if (state.eventName) emit('Runtime.consoleAPICalled', { type: type === 'warn' ? 'warning' : type, args: args.slice(0, 8).map(a => ({ value: describe(a).slice(0, 500) })) });
        return original.apply(this, args);
      };
    }

    // Uncaught errors, and resources (images, scripts, styles) that fail to load.
    window.addEventListener('error', event => {
      const target = event.target;
      if (target && target !== window && target.tagName) {
        const url = target.currentSrc || target.src || target.href;
        if (!url || !firstFailureReport(absolute(url))) return;
        const requestId = nextId();
        emit('Network.requestWillBeSent', { requestId, request: { method: 'GET', url: absolute(url) } });
        emit('Network.loadingFailed', { requestId, errorText: 'Could not load', type: target.tagName.toLowerCase() });
        return;
      }
      emit('Runtime.exceptionThrown', { exceptionDetails: {
        text: event.message || 'Uncaught error',
        exception: { description: describe(event.error || event.message).slice(0, 800) },
        url: event.filename || '', lineNumber: event.lineno || 0
      } });
    }, true);
    window.addEventListener('unhandledrejection', event => {
      emit('Runtime.exceptionThrown', { exceptionDetails: {
        text: 'Unhandled promise rejection',
        exception: { description: `Unhandled promise rejection: ${describe(event.reason).slice(0, 800)}` }
      } });
    });

    // fetch
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (input, init) {
        const requestId = nextId();
        const started = performance.now();
        let method = 'GET';
        let url = '';
        try {
          method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
          url = absolute(input instanceof Request ? input.url : input);
        } catch (_) { /* Keep defaults. */ }
        emit('Network.requestWillBeSent', { requestId, request: { method, url } });
        return originalFetch.apply(this, arguments).then(response => {
          emit('Network.responseReceived', { requestId, durationMs: Math.round(performance.now() - started), response: { status: response.status, url: response.url || url } });
          return response;
        }, error => {
          emit('Network.loadingFailed', { requestId, errorText: error?.name === 'AbortError' ? 'Aborted' : (error?.message || 'Failed'), type: 'fetch' });
          throw error;
        });
      };
    }

    // XMLHttpRequest
    const XHR = window.XMLHttpRequest?.prototype;
    if (XHR) {
      const open = XHR.open;
      const send = XHR.send;
      XHR.open = function (method, url) {
        this.__qaKit = { method: String(method || 'GET').toUpperCase(), url: absolute(url) };
        return open.apply(this, arguments);
      };
      XHR.send = function () {
        const info = this.__qaKit;
        if (info) {
          const requestId = nextId();
          const started = performance.now();
          let failure = '';
          emit('Network.requestWillBeSent', { requestId, request: { method: info.method, url: info.url } });
          // Listeners are removed at loadend, so a reused XHR does not report earlier requests again.
          const onError = () => { failure = 'Network error'; };
          const onAbort = () => { failure = 'Aborted'; };
          const onTimeout = () => { failure = 'Timed out'; };
          const onLoadEnd = () => {
            this.removeEventListener('error', onError);
            this.removeEventListener('abort', onAbort);
            this.removeEventListener('timeout', onTimeout);
            this.removeEventListener('loadend', onLoadEnd);
            if (this.status > 0 && !failure) emit('Network.responseReceived', { requestId, durationMs: Math.round(performance.now() - started), response: { status: this.status, url: this.responseURL || info.url } });
            else emit('Network.loadingFailed', { requestId, errorText: failure || 'Failed', type: 'xhr' });
          };
          this.addEventListener('error', onError);
          this.addEventListener('abort', onAbort);
          this.addEventListener('timeout', onTimeout);
          this.addEventListener('loadend', onLoadEnd);
        }
        return send.apply(this, arguments);
      };
    }

    // Other loaded resources with a known HTTP status (same-site, or sites that allow timing info).
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest' || !(entry.responseStatus > 0)) continue;
          if (entry.responseStatus >= 400 && !firstFailureReport(entry.name)) continue;
          const requestId = nextId();
          emit('Network.requestWillBeSent', { requestId, request: { method: 'GET', url: entry.name } });
          emit('Network.responseReceived', { requestId, durationMs: Math.round(entry.duration), response: { status: entry.responseStatus, url: entry.name } });
        }
      }).observe({ type: 'resource', buffered: false });
    } catch (_) { /* Older browsers: fetch/XHR are still recorded. */ }
  }

  /** MAIN world. Stops the hook reporting (and describing console arguments) until the next start. */
  function pauseActivityHook() {
    const state = window.__qaKitActivityHook;
    if (state) state.eventName = null;
  }

  /** Isolated world. `on` true starts passing events to the background in batches; false stops. */
  function setActivityRelay(eventName, on) {
    const KEY = '__qaKitActivityRelay';
    const old = window[KEY];
    if (old) {
      document.removeEventListener(old.eventName, old.listener);
      clearInterval(old.timer);
      old.flush();
      delete window[KEY];
    }
    if (!on) return;
    let batch = [];
    const flush = () => {
      if (!batch.length) return;
      const events = batch;
      batch = [];
      try { chrome.runtime.sendMessage({ type: 'SFFA_ACTIVITY_EVENTS', events }).catch(() => {}); }
      catch (_) { /* Extension reloaded: nothing to send to. */ }
    };
    const listener = event => {
      if (typeof event.detail !== 'string' || event.detail.length > 20000) return;
      try { batch.push(JSON.parse(event.detail)); } catch (_) { return; }
      if (batch.length >= 50) flush();
    };
    document.addEventListener(eventName, listener);
    window[KEY] = { eventName, listener, flush, take: () => { const events = batch; batch = []; return events; }, timer: setInterval(flush, 500) };
  }

  /** Isolated world. Returns events not sent yet, so a report or count includes the latest activity. */
  function takeActivityBatch() {
    return window.__qaKitActivityRelay?.take() || [];
  }

  root.SFFAActivityRecorder = { installActivityHook, pauseActivityHook, setActivityRelay, takeActivityBatch };
})(typeof window !== 'undefined' ? window : self);
