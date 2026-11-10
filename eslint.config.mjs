import fs from 'node:fs';
import path from 'node:path';

// The popup is split into ordered classic scripts that share one global scope (see popup/popup.html).
// Collect each file's top-level declarations so no-undef still catches typos across the split.
const POPUP_SCRIPTS = ['popup/icons.js', 'popup/state.js', 'popup/ui.js', 'popup/sections/ai.js', 'popup/sections/files.js',
  'popup/sections/test.js', 'popup/sections/output.js', 'popup/sections/setup.js', 'popup/main.js'];
const popupGlobals = {};
for (const file of POPUP_SCRIPTS) {
  const source = fs.readFileSync(path.join(import.meta.dirname, file), 'utf8');
  for (const match of source.matchAll(/^(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
    popupGlobals[match[1] || match[2]] = match[2] && /^let\s/.test(match[0]) ? 'writable' : 'readonly';
  }
}

export default [
  { ignores: ['node_modules/**', 'dist/**', 'chrome-screenshot-profile/**', '**/*.min.js'] },
  { files: ['eslint.config.mjs', 'scripts/**/*.mjs', 'tests/**/*.js', 'tests-e2e/**/*.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { require: 'readonly', __dirname: 'readonly', module: 'readonly', Buffer: 'readonly' } } },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', self: 'readonly', document: 'readonly', chrome: 'readonly', browser: 'readonly',
        URL: 'readonly', Blob: 'readonly', MutationObserver: 'readonly', AbortController: 'readonly',
        fetch: 'readonly', FormData: 'readonly', File: 'readonly', Node: 'readonly', Event: 'readonly',
        console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', confirm: 'readonly', alert: 'readonly', process: 'readonly',
        navigator: 'readonly', location: 'readonly', indexedDB: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLButtonElement: 'readonly',
        HTMLSelectElement: 'readonly', HTMLTextAreaElement: 'readonly', localStorage: 'readonly', performance: 'readonly', CSS: 'readonly',
        getComputedStyle: 'readonly', requestAnimationFrame: 'readonly', createImageBitmap: 'readonly', OffscreenCanvas: 'readonly',
        atob: 'readonly', btoa: 'readonly', prompt: 'readonly', importScripts: 'readonly', SFFAExt: 'readonly', SFFAStorage: 'readonly',
        SFFALogger: 'readonly', SFFASelectorEngine: 'readonly', SFFAFormDetector: 'readonly', SFFADataGenerator: 'readonly',
        SFFAReportCapture: 'readonly', SFFAQAReport: 'readonly', SFFADeepDOM: 'readonly', SFFAFiller: 'readonly',
        lastPageActionScan: 'writable', IntersectionObserver: 'readonly', requestIdleCallback: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-unreachable': 'error',
      'no-constant-condition': 'warn'
    }
  },
  {
    files: POPUP_SCRIPTS,
    languageOptions: {
      sourceType: 'script',
      globals: { ...popupGlobals, SFFATestCaseExport: 'readonly', SFFADom: 'readonly', SFFAFileTypes: 'readonly', SFFAShortcuts: 'readonly', SFFAIcons: 'readonly', CSSStyleSheet: 'readonly' }
    },
    rules: { 'no-redeclare': ['error', { builtinGlobals: false }] }
  }
];
