const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow } = require('./helpers');

/** Loads the popup's shared state + UI helpers with a fake extension adapter. */
function loadPopup({ runtimeReply = () => new Promise(() => {}), tabReply = () => new Promise(() => {}) } = {}) {
  const window = loadWindow([]);
  window.SFFAExt = {
    hasExt: true,
    api: { sendRuntimeMessage: message => runtimeReply(message) },
    sendTabMessage: (_tabId, message) => tabReply(message),
    logError() {}
  };
  window.SFFADom = { h: () => window.document.createElement('div') };
  window.eval('var CONTENT_SCRIPT_FILES = [];');
  for (const file of ['popup/state.js', 'popup/ui.js']) {
    window.eval(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'));
  }
  return window;
}

test('sendRuntimeMessage resolves with a timeout error instead of waiting forever', async () => {
  const window = loadPopup();
  const started = Date.now();
  const reply = await window.eval('sendRuntimeMessage')({ type: 'SFFA_PING' }, { timeoutMs: 80 });
  assert.equal(reply.ok, false);
  assert.equal(reply.timedOut, true);
  assert.match(reply.error, /background did not respond/);
  assert.ok(Date.now() - started < 1000);
});

test('sendRuntimeMessage passes normal replies through and uses longer limits for slow operations', async () => {
  const window = loadPopup({ runtimeReply: async message => ({ ok: true, echo: message.type }) });
  const send = window.eval('sendRuntimeMessage');
  assert.equal((await send({ type: 'SFFA_PING' })).echo, 'SFFA_PING');
  // A capture that takes longer than the 10s default must not be cut off: reply after 50ms with a
  // 120s budget expected, and a 30ms explicit limit to prove explicit limits still win.
  const slow = loadPopup({ runtimeReply: () => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 50)) }).eval('sendRuntimeMessage');
  assert.equal((await slow({ type: 'SFFA_CAPTURE_REPORT' })).ok, true);
  assert.equal((await slow({ type: 'SFFA_CAPTURE_REPORT' }, { timeoutMs: 30 })).timedOut, true);
});

test('page watchdog stops a run when the page goes silent', async () => {
  const window = loadPopup();
  const sendTabMessage = window.eval('sendTabMessage');
  const started = Date.now();
  await assert.rejects(sendTabMessage(7, { type: 'SFFA_FILL_FORM' }, { watchdogMs: 300 }), error => {
    assert.equal(error.name, 'PageTimeoutError');
    assert.match(error.message, /stopped responding/);
    return true;
  });
  assert.ok(Date.now() - started < 2500);
});

test('page watchdog keeps waiting while heartbeats keep arriving', async () => {
  let finish;
  const window = loadPopup({ tabReply: () => new Promise(resolve => { finish = resolve; }) });
  const sendTabMessage = window.eval('sendTabMessage');
  const notePageActivity = window.eval('notePageActivity');
  const run = sendTabMessage(7, { type: 'SFFA_FILL_FORM' }, { watchdogMs: 400 });
  const beat = setInterval(() => notePageActivity(7), 100);
  await new Promise(resolve => setTimeout(resolve, 1300)); // well past the watchdog window
  finish({ ok: true, summary: {} });
  clearInterval(beat);
  const reply = await run;
  assert.equal(reply.ok, true);
});

test('heartbeats from another tab do not keep a stalled run alive', async () => {
  const window = loadPopup();
  const sendTabMessage = window.eval('sendTabMessage');
  const notePageActivity = window.eval('notePageActivity');
  const beat = setInterval(() => notePageActivity(99), 50);
  await assert.rejects(sendTabMessage(7, { type: 'SFFA_FILL_FORM' }, { watchdogMs: 300 }), /stopped responding/);
  clearInterval(beat);
});

test('friendlyError gives a next step for stalled pages and an unresponsive background', () => {
  const friendlyError = loadPopup().eval('friendlyError');
  assert.match(friendlyError('Unable to fill the form: The page stopped responding (no activity for 30 seconds).'), /Reload the page and try again/);
  assert.match(friendlyError('The extension background did not respond within 10 seconds.'), /open it again/);
  assert.equal(friendlyError('Some unrelated message'), 'Some unrelated message');
});

test('ext.js runtime messages honour timeoutMs and resolve null', async () => {
  const window = loadWindow([]);
  window.chrome = { runtime: { id: 'test', sendMessage: () => new Promise(() => {}), getURL: p => `chrome-extension://test/${p}` } };
  window.eval(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'utils/ext.js'), 'utf8'));
  window.console.error = () => {};
  const started = Date.now();
  const reply = await window.SFFAExt.api.sendRuntimeMessage({ type: 'SFFA_PING' }, { timeoutMs: 80 });
  assert.equal(reply, null);
  assert.ok(Date.now() - started < 1000);
});

test('content scripts are injected with root-relative paths (Firefox resolves bare paths from popup/)', async () => {
  const window = loadWindow([]);
  let injected = null;
  window.chrome = {
    runtime: { id: 'test', getURL: p => `moz-extension://test/${p}` },
    scripting: { executeScript: async options => { injected = options.files; } },
    tabs: { sendMessage: async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); } }
  };
  window.eval(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'utils/ext.js'), 'utf8'));
  window.console.error = () => {};
  await window.SFFAExt.sendTabMessage(1, { type: 'SFFA_PING' }, ['utils/ext.js', '/content/runtime/core.js']).catch(() => {});
  assert.deepEqual([...injected], ['/utils/ext.js', '/content/runtime/core.js']);
});

test('every popup → page call has a time limit (timeoutMs or watchdogMs)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const espree = require('espree');
  const files = ['popup/main.js', 'popup/sections/ai.js', 'popup/sections/output.js', 'popup/sections/setup.js', 'popup/sections/test.js', 'popup/sections/files.js'];
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const ast = espree.parse(source, { ecmaVersion: 2023, loc: true });
    (function walk(node) {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'sendTabMessage') {
        const options = node.arguments[2];
        const limited = options?.type === 'ObjectExpression'
          && options.properties.some(p => ['timeoutMs', 'watchdogMs'].includes(p.key?.name));
        if (!limited) missing.push(`${file}:${node.loc.start.line} ${node.arguments[1]?.properties?.find(p => p.key?.name === 'type')?.value?.value || ''}`);
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value.type === 'string') walk(value);
      }
    })(ast);
  }
  assert.deepEqual(missing, [], `calls without a time limit:\n${missing.join('\n')}`);
});

test('cancelling the "send to AI provider" confirmation keeps the API key the user typed', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const window = loadWindow([]);
  window.document.body.innerHTML = `<button id="aiAskBtn">Ask AI</button><div id="aiResult" class="hidden"></div>
    <textarea id="aiPrompt">Check this form</textarea><input id="aiEndpoint" value="https://api.openai.com/v1/chat/completions">
    <input id="aiModel" value="m"><input id="aiApiKey" value="sk-test-123"><input type="checkbox" id="aiIncludePageContext">
    <details id="aiPayloadPreview" hidden><pre id="aiPayloadText"></pre></details>`;
  let sent = 0;
  window.SFFAExt = { hasExt: true, api: { sendRuntimeMessage: async () => { sent++; return { ok: true, answer: 'x' }; } }, permissions: { contains: async () => true, request: async () => true }, logError() {} };
  window.SFFADom = { h: () => window.document.createElement('div') };
  window.requestAnimationFrame = fn => setTimeout(fn, 0);
  window.confirm = () => false; // user cancels (native dialog, old behaviour)
  // Popup files share one global scope in the browser; evaluate them as one script so `let` state is shared.
  const source = ['popup/state.js', 'popup/ui.js', 'popup/sections/ai.js']
    .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n;\n');
  window.eval(`var CONTENT_SCRIPT_FILES = [];\n${source}\nwindow.__onAiAskClick = onAiAskClick;\nwindow.__setConfirm = fn => { confirmDialog = fn; };`);
  window.__setConfirm(async () => false); // user cancels (styled dialog, new behaviour)
  await window.__onAiAskClick();
  assert.equal(sent, 0, 'no request was sent');
  assert.equal(window.document.getElementById('aiApiKey').value, 'sk-test-123', 'API key kept after cancelling');
});
