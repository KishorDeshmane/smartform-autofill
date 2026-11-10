const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/**
 * Creates a jsdom window, gives every element a non-zero layout box (jsdom has no layout engine,
 * so the extension's visibility checks would otherwise treat everything as hidden), and evaluates
 * the given extension source files in order.
 */
function loadWindow(files = [], html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  window.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) };
  window.HTMLElement.prototype.getBoundingClientRect = function rect() {
    return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON() {} };
  };
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  for (const file of files) window.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  return window;
}

/** Records every event of the given types that reaches the element. */
function recordEvents(element, types = ['input', 'change']) {
  const seen = [];
  for (const type of types) element.addEventListener(type, () => seen.push(type));
  return seen;
}

/**
 * Installs an in-memory chrome.storage (local + session) and runtime on a jsdom window, then loads
 * the given files. Reads/writes are async like the real API. Returns { window, data } where `data`
 * is the backing object for chrome.storage.local.
 */
function loadWithChromeStorage(files = [], { storageHost = true, initial = {} } = {}) {
  const window = loadWindow([]);
  const data = JSON.parse(JSON.stringify(initial));
  const area = backing => ({
    get: async key => {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (key == null) return JSON.parse(JSON.stringify(backing));
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.filter(k => k in backing).map(k => [k, JSON.parse(JSON.stringify(backing[k]))]));
    },
    set: async items => { await new Promise(resolve => setTimeout(resolve, 0)); Object.assign(backing, JSON.parse(JSON.stringify(items))); },
    remove: async key => { for (const k of [].concat(key)) delete backing[k]; },
    clear: async () => { for (const k of Object.keys(backing)) delete backing[k]; }
  });
  window.chrome = {
    runtime: { id: 'test-extension', getURL: p => `chrome-extension://test-extension/${p}`, sendMessage: async () => undefined, onMessage: { addListener() {} } },
    storage: { local: area(data), session: area({}) }
  };
  if (storageHost) window.__SFFA_STORAGE_HOST__ = true;
  for (const file of files) window.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  window.console.error = () => {};
  return { window, data };
}

module.exports = { ROOT, loadWindow, recordEvents, loadWithChromeStorage };
