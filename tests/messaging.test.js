const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, loadWindow } = require('./helpers');

/** Loads utils/ext.js with a fake chrome API and returns { window, listeners }. */
function loadExt(chromeOverrides = {}) {
  const window = loadWindow([]);
  const listeners = [];
  window.chrome = {
    runtime: { id: 'ext', getURL: p => p, onMessage: { addListener: fn => listeners.push(fn) }, sendMessage: async () => undefined, ...chromeOverrides.runtime },
    tabs: { sendMessage: async () => undefined, ...chromeOverrides.tabs }
  };
  window.eval(fs.readFileSync(path.join(ROOT, 'utils/ext.js'), 'utf8'));
  window.console.error = () => {};
  return { window, listeners };
}

test('envelopes: a correlated reply is unwrapped to its payload', async () => {
  const { window } = loadExt({ runtime: { sendMessage: async envelope => ({ type: envelope.type, requestId: envelope.requestId, payload: { ok: true, answer: 42 } }) } });
  const reply = await window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_PING' });
  assert.equal(reply.answer, 42);
});

test('envelopes: a reply for a different request is rejected (returns null), not trusted', async () => {
  const { window } = loadExt({ runtime: { sendMessage: async () => ({ type: 'SFFA_PING', requestId: 'someone-else', payload: { ok: true } }) } });
  assert.equal(await window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_PING' }), null);
});

test('envelopes: malformed incoming envelopes get a protocol error and never reach the handler', () => {
  const { window, listeners } = loadExt();
  let handled = 0;
  window.SFFAExt.onMessage(() => { handled++; });
  const replies = [];
  listeners[0]({ type: 'SFFA_PING', requestId: 'r1', payload: { type: 'SFFA_SOMETHING_ELSE' } }, {}, r => replies.push(r));
  listeners[0]({ type: 'SFFA_PING', requestId: 'r2', payload: null }, {}, r => replies.push(r));
  assert.equal(handled, 0);
  assert.equal(replies.length, 2);
  assert.ok(replies.every(r => r.type === 'SFFA_PROTOCOL_ERROR' && r.payload.ok === false));
});

test('envelopes: a valid envelope reaches the handler and the reply is re-wrapped with the same id', () => {
  const { window, listeners } = loadExt();
  window.SFFAExt.onMessage((message, _sender, respond) => { respond({ ok: true, got: message.type }); });
  let reply;
  listeners[0]({ type: 'SFFA_PING', requestId: 'r9', payload: { type: 'SFFA_PING' } }, {}, r => { reply = r; });
  assert.deepEqual({ ...reply, payload: { ...reply.payload } }, { type: 'SFFA_PING', requestId: 'r9', payload: { ok: true, got: 'SFFA_PING' } });
});

test('tab messages: a missing page script is injected once, then the message is retried', async () => {
  let attempts = 0;
  const injected = [];
  const { window } = loadExt({ tabs: { sendMessage: async (_tab, envelope) => {
    attempts++;
    if (attempts === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
    return { type: envelope.type, requestId: envelope.requestId, payload: { ok: true } };
  } } });
  window.chrome.scripting = { executeScript: async ({ files }) => { injected.push(...files); } };
  const reply = await window.SFFAExt.sendTabMessage(5, { type: 'SFFA_PING' }, ['utils/ext.js']);
  assert.equal(reply.ok, true);
  assert.equal(attempts, 2);
  assert.deepEqual(injected, ['/utils/ext.js']);
});

test('tab messages: other errors are not hidden by re-injecting', async () => {
  let injected = false;
  const { window } = loadExt({ tabs: { sendMessage: async () => { throw new Error('No tab with id: 5'); } } });
  window.chrome.scripting = { executeScript: async () => { injected = true; } };
  await assert.rejects(window.SFFAExt.sendTabMessage(5, { type: 'SFFA_PING' }, ['utils/ext.js']), /No tab with id/);
  assert.equal(injected, false);
});

// ---------------- Service worker input limits ----------------
function loadServiceWorker() {
  let handler = null;
  const listener = { addListener() {} };
  const sandbox = {
    console: { ...console, error() {} }, URL, setTimeout, clearTimeout, AbortController,
    fetch: async () => { throw new Error('network must not be called'); },
    SFFAStorage: { mutationNames: ['addUsed'], migrateLegacyFiles: async () => ({ migrated: 0, failed: 0 }), addUsed: async () => 'ok' },
    SFFAExt: { runtime: { id: 'ext', getURL: p => `chrome-extension://ext/${p}`, onInstalled: listener, onStartup: listener, onSuspend: listener }, onMessage(fn) { handler = fn; }, logError() {} }
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8'), sandbox);
  const popup = { id: 'ext', url: 'chrome-extension://ext/popup/popup.html' };
  const send = (message, sender = popup) => new Promise(resolve => { if (handler(message, sender, resolve) !== true) setTimeout(() => resolve(undefined), 20); });
  return { send, popup };
}

test('AI requests: oversized prompts, missing model/key and huge page context are rejected before any network call', async () => {
  const { send } = loadServiceWorker();
  const base = { endpoint: 'https://api.openai.com/v1/chat/completions', prompt: 'hi', model: 'm', apiKey: 'k' };
  for (const request of [
    { ...base, prompt: 'x'.repeat(4001) }, { ...base, model: '' }, { ...base, apiKey: '' }, { ...base, context: 'x'.repeat(24001) }, { ...base, prompt: '   ' }
  ]) {
    const reply = await send({ type: 'SFFA_AI_CHAT', request });
    assert.equal(reply.ok, false, JSON.stringify(Object.keys(request)));
  }
});

test('AI requests: plain HTTP is allowed only for localhost', async () => {
  const { send } = loadServiceWorker();
  const reply = await send({ type: 'SFFA_AI_CHAT', request: { endpoint: 'http://192.168.1.10/v1', prompt: 'hi', model: 'm', apiKey: 'k' } });
  assert.equal(reply.ok, false);
  assert.match(reply.error, /HTTPS/);
});

test('file contents are served only to page scripts running in a tab, never to other contexts', async () => {
  const { send, popup } = loadServiceWorker();
  const reply = await send({ type: 'SFFA_GET_FILE_CONTENTS', fileIds: ['a'] }, popup);
  assert.equal(reply.ok, false);
  assert.match(reply.error, /content script running in a tab/);
});

test('debugger, network and viewport actions are refused from pages and the options page', async () => {
  const { send } = loadServiceWorker();
  const options = { id: 'ext', url: 'chrome-extension://ext/options/options.html', tab: { id: 1 } };
  const page = { id: 'ext', url: 'https://site.test/', tab: { id: 2 } };
  for (const type of ['SFFA_CAPTURE_REPORT', 'SFFA_NETWORK_PROFILE', 'SFFA_APPLY_VIEWPORT', 'SFFA_START_CAPTURE', 'SFFA_AI_CHAT']) {
    for (const sender of [options, page]) {
      const reply = await send({ type, tabId: 2 }, sender);
      assert.equal(reply.ok, false, `${type} from ${sender.url}`);
    }
  }
});

test('debugger tools: "not granted yet" is reported as supported (Chrome), but a build without it is unsupported (Firefox)', async () => {
  for (const [permissions, optional, expected] of [[['storage'], ['debugger'], true], [['storage'], [], false]]) {
    let handler = null;
    const listener = { addListener() {} };
    const sandbox = {
      console: { ...console, error() {} }, URL, setTimeout, clearTimeout,
      chrome: { runtime: { getManifest: () => ({ permissions, optional_permissions: optional }) } },
      SFFAReportCapture: { isDebuggerApiAvailable: false },
      SFFAStorage: { mutationNames: [], migrateLegacyFiles: async () => ({ migrated: 0, failed: 0 }) },
      SFFAExt: { runtime: { id: 'ext', getURL: p => `chrome-extension://ext/${p}`, onInstalled: listener, onStartup: listener, onSuspend: listener }, onMessage(fn) { handler = fn; }, logError() {} }
    };
    sandbox.self = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8'), sandbox);
    sandbox.SFFAReportCapture = { isDebuggerApiAvailable: false }; // module present, permission not granted
    let reply;
    handler({ type: 'SFFA_DEBUGGER_AVAILABLE' }, { id: 'ext', url: 'chrome-extension://ext/popup/popup.html' }, r => { reply = r; });
    assert.equal(reply.available, false);
    assert.equal(reply.supported, expected, `optional=${JSON.stringify(optional)}`);
  }
});
