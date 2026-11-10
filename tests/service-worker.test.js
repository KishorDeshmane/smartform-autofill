const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./helpers');

const EXT_ID = 'test-extension-id';
const BASE = `chrome-extension://${EXT_ID}/`;

/** Loads background/service-worker.js in a sandbox with mocked extension APIs and storage. */
function loadServiceWorker() {
  let handler = null;
  const calls = [];
  const storageOps = ['addFile', 'addFiles', 'deleteFile', 'updateSettings', 'setLastData', 'addUsed', 'clearAllData', 'clearCredentials', 'setAllMappings'];
  const SFFAStorage = { mutationNames: storageOps, migrateLegacyFiles: async () => ({ migrated: 0, failed: 0 }) };
  for (const name of storageOps) SFFAStorage[name] = async (...args) => { calls.push({ name, args }); return 'done'; };
  const listener = { addListener() {} };
  const SFFAExt = {
    runtime: { id: EXT_ID, getURL: p => BASE + p, onInstalled: listener, onStartup: listener, onSuspend: listener },
    onMessage(fn) { handler = fn; },
    logError() {}
  };
  const sandbox = { SFFAStorage, SFFAExt, console, URL, setTimeout, clearTimeout, AbortController };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8'), sandbox);
  /** Dispatches a message and resolves with the response passed to sendResponse. */
  const send = (message, sender) => new Promise(resolve => {
    const keepOpen = handler(message, sender, resolve);
    if (keepOpen !== true) setTimeout(() => resolve(undefined), 20);
  });
  return { send, calls };
}

const popup = { id: EXT_ID, url: `${BASE}popup/popup.html` };
const options = { id: EXT_ID, url: `${BASE}options/options.html`, tab: { id: 7 } };
const contentScript = { id: EXT_ID, url: 'https://example.test/form', tab: { id: 3 } };

test('rejects messages from another extension', async () => {
  const { send, calls } = loadServiceWorker();
  const res = await send({ type: 'SFFA_STORAGE_MUTATION', name: 'clearAllData', args: [] }, { id: 'evil-extension', url: popup.url });
  assert.equal(res.ok, false);
  assert.match(res.error, /not this extension/);
  assert.equal(calls.length, 0);
});

test('rejects popup-only messages from content scripts and the options page', async () => {
  const { send } = loadServiceWorker();
  for (const sender of [contentScript, options]) {
    const res = await send({ type: 'SFFA_CAPTURE_REPORT', tabId: 3 }, sender);
    assert.equal(res.ok, false);
    assert.match(res.error, /only from the extension popup/);
  }
});

test('rejects destructive storage mutations requested from a page context', async () => {
  const { send, calls } = loadServiceWorker();
  for (const name of ['clearAllData', 'updateSettings', 'setAllMappings', 'clearCredentials', 'deleteFile']) {
    const res = await send({ type: 'SFFA_STORAGE_MUTATION', name, args: [] }, contentScript);
    assert.deepEqual({ ok: res.ok, error: res.error }, { ok: false, error: 'Operation not permitted from page context.' });
  }
  assert.equal(calls.length, 0);
});

test('allows the content-script allowlist (setLastData, addUsed)', async () => {
  const { send, calls } = loadServiceWorker();
  assert.equal((await send({ type: 'SFFA_STORAGE_MUTATION', name: 'setLastData', args: [{ a: 1 }] }, contentScript)).ok, true);
  assert.equal((await send({ type: 'SFFA_STORAGE_MUTATION', name: 'addUsed', args: ['email', 'x@example.com'] }, contentScript)).ok, true);
  assert.deepEqual(calls.map(c => c.name), ['setLastData', 'addUsed']);
});

test('popup and options pages keep full storage access, even when options runs in a tab', async () => {
  const { send, calls } = loadServiceWorker();
  assert.equal((await send({ type: 'SFFA_STORAGE_MUTATION', name: 'clearAllData', args: [] }, popup)).ok, true);
  assert.equal((await send({ type: 'SFFA_STORAGE_MUTATION', name: 'updateSettings', args: [{}] }, options)).ok, true);
  assert.deepEqual(calls.map(c => c.name), ['clearAllData', 'updateSettings']);
});

test('rejects storage mutations with no tab and no extension page, bad args, or unknown names', async () => {
  const { send, calls } = loadServiceWorker();
  const noContext = await send({ type: 'SFFA_STORAGE_MUTATION', name: 'addUsed', args: [] }, { id: EXT_ID, url: 'https://example.test/' });
  assert.equal(noContext.ok, false);
  const tooMany = await send({ type: 'SFFA_STORAGE_MUTATION', name: 'addUsed', args: new Array(11).fill(0) }, popup);
  assert.equal(tooMany.ok, false);
  const notArray = await send({ type: 'SFFA_STORAGE_MUTATION', name: 'addUsed', args: 'x' }, popup);
  assert.equal(notArray.ok, false);
  const unknown = await send({ type: 'SFFA_STORAGE_MUTATION', name: 'constructor', args: [] }, popup);
  assert.equal(unknown.ok, false);
  assert.equal(calls.length, 0);
});

test('AI endpoint guard rejects plain HTTP to remote hosts and credentials in the URL', async () => {
  const { send } = loadServiceWorker();
  const base = { prompt: 'hi', model: 'm', apiKey: 'k' };
  for (const endpoint of ['http://api.example.com/v1/chat', 'https://user:pass@api.example.com/v1', 'not a url']) {
    const res = await send({ type: 'SFFA_AI_CHAT', request: { ...base, endpoint } }, popup);
    assert.equal(res.ok, false, endpoint);
  }
});

test('capture module loads without the optional debugger permission and picks it up once granted', () => {
  const ext = { hasExt: true, runtime: { lastError: null }, tabs: null, permissions: { onAdded: { addListener() {} } }, debugger: null };
  const sandbox = { SFFAExt: ext, console, URL, setTimeout, clearTimeout };
  sandbox.self = sandbox;
  assert.doesNotThrow(() => vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'background/report-capture.js'), 'utf8'), sandbox));
  assert.equal(typeof sandbox.SFFAReportCapture, 'object');
  assert.equal(sandbox.SFFAReportCapture.isDebuggerApiAvailable, false);
  ext.debugger = { sendCommand() {}, attach() {}, detach() {}, onEvent: { addListener() {} }, onDetach: { addListener() {} } };
  assert.equal(sandbox.SFFAReportCapture.isDebuggerApiAvailable, true);
});

test('service worker still answers messages when the capture module fails to load', async () => {
  let handler = null;
  const listener = { addListener() {} };
  const sandbox = {
    console: { ...console, error() {} }, URL, setTimeout, clearTimeout, AbortController,
    SFFAStorage: { mutationNames: [], migrateLegacyFiles: async () => ({ migrated: 0, failed: 0 }) },
    SFFAExt: { runtime: { id: EXT_ID, getURL: p => BASE + p, onInstalled: listener, onStartup: listener, onSuspend: listener }, onMessage(fn) { handler = fn; }, logError() {} },
    importScripts(...files) { if (files.some(file => file.includes('report-capture'))) throw new TypeError("Cannot read properties of null (reading 'onEvent')"); }
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8'), sandbox);
  assert.equal(typeof handler, 'function', 'message listener must be registered');
  const reply = await new Promise(resolve => handler({ type: 'SFFA_PING' }, popup, resolve));
  assert.deepEqual({ ...reply }, { ok: true });
});
