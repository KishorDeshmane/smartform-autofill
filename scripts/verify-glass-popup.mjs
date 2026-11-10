import { chromium } from 'playwright';
import axe from 'axe-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const project = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const popupUrl = new URL(`file://${path.join(project, 'popup', 'popup.html').replaceAll('\\', '/')}`).href;
const outDir = path.join(project, 'screenshots', 'glass-verification');
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const widths = [320, 360, 380, 440, 800, 880, 1018];
const tabs = [['test', '#tabTestButton'], ['output', '#tabOutputButton'], ['setup', '#tabSetupButton']];
const states = ['no-tab', 'cannot-read', 'ready', 'running', 'done', 'error', 'blocked'];
const violations = [];
const assertions = [];

for (const width of widths) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 600 }, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem('sffaTheme', selectedTheme);
      globalThis.chrome = {
        runtime: { id: 'mock-extension-id', getURL: value => value, onMessage: { addListener() {} }, sendMessage: async () => null },
        storage: { local: { get: async () => ({}), set: async () => {} }, session: { get: async () => ({}), set: async () => {} } },
        tabs: { query: async () => [{ id: 1, url: 'https://example.test/form', title: 'Example form' }], sendMessage: async () => null, onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
        permissions: { contains: async () => false, request: async () => false },
      };
    }, theme);
    await page.goto(popupUrl);
    await page.waitForTimeout(100);

    for (const [tabName, selector] of tabs) {
      await page.click(selector);
      for (const state of states) {
        await page.evaluate((stepState) => {
          const banner = document.getElementById('extensionContextBanner');
          const message = document.getElementById('extensionContextMessage');
          banner?.classList.toggle('hidden', stepState === 'ready');
          if (stepState === 'no-tab') {
            message.textContent = 'Open a regular web page, then reopen this panel';
            document.getElementById('selectTabBanner')?.removeAttribute('hidden');
            document.getElementById('selectTabBanner').textContent = 'Choose tab';
          } else if (stepState === 'cannot-read') {
            message.textContent = 'Could not read this page';
            document.getElementById('selectTabBanner')?.removeAttribute('hidden');
            document.getElementById('selectTabBanner').textContent = 'Reload tab & retry';
          }
          if (typeof globalThis.setWorkflowStep === 'function') {
            const map = { ready: ['ready', 'The page is ready.'], running: ['running', 'The selected run is in progress.'], done: ['done', 'Review results in Output.'], error: ['error', 'See the Activity Log and retry.'], blocked: ['blocked', 'Scan the page first'] };
            if (map[stepState]) globalThis.setWorkflowStep('fill', map[stepState][0], map[stepState][1]);
          }
        }, state);
        await page.screenshot({ path: path.join(outDir, `${theme}-${width}-${tabName}-${state}.png`), fullPage: true, animations: 'disabled' });
        const layout = await page.evaluate(() => {
          const body = document.body.getBoundingClientRect();
          const header = document.querySelector('.header')?.getBoundingClientRect();
          const footer = document.querySelector('.sticky-fill-bar')?.getBoundingClientRect();
          const scroll = document.querySelector('.app-scroll')?.getBoundingClientRect();
          const last = document.querySelector('.tab-panel:not([hidden]) > :last-child')?.getBoundingClientRect();
          return { bodyWidth: document.body.getBoundingClientRect().width, bodyScrollWidth: document.body.scrollWidth, documentScrollWidth: document.documentElement.scrollWidth, headerWidth: header?.width, footerWidth: footer?.width, viewportWidth: window.innerWidth, footerHidden: getComputedStyle(document.querySelector('.sticky-fill-bar')).display === 'none', footerTop: footer?.top, scrollBottom: scroll?.bottom, lastBottom: last?.bottom };
        });
        assertions.push({ theme, width, tabName, state, layoutOk: layout.bodyWidth === layout.viewportWidth && layout.headerWidth === layout.viewportWidth && (layout.footerHidden || layout.footerWidth === layout.viewportWidth) && layout.bodyScrollWidth <= layout.viewportWidth && layout.documentScrollWidth <= layout.viewportWidth, scrollOk: layout.footerHidden || !layout.lastBottom || layout.lastBottom <= layout.footerTop || layout.scrollBottom <= layout.footerTop });
      }
    }
    await page.evaluate(axe.source);
    const result = await page.evaluate(async () => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
    for (const violation of result.violations) violations.push({ theme, width, id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) });
    await context.close();
  }
}

const probeContext = await browser.newContext({ viewport: { width: 440, height: 600 }, colorScheme: 'dark', forcedColors: 'active', reducedMotion: 'reduce' });
const probe = await probeContext.newPage();
await probe.addInitScript(() => { localStorage.setItem('sffaTheme', 'dark'); globalThis.chrome = { runtime: { id: 'mock', getURL: value => value, onMessage: { addListener() {} } }, storage: { local: { get: async () => ({}) }, session: { get: async () => ({}) } }, tabs: { query: async () => [] }, permissions: { request: async () => false } }; });
await probe.goto(popupUrl);
await probe.screenshot({ path: path.join(outDir, 'forced-colors-reduced-motion.png'), fullPage: true });
await probe.addStyleTag({ content: '.header,.section-tabs,.sticky-fill-bar,.workflow-stepper,.card{backdrop-filter:none;-webkit-backdrop-filter:none}' });
await probe.screenshot({ path: path.join(outDir, 'backdrop-filter-disabled.png'), fullPage: true });
await probeContext.close();
await browser.close();

const popupCss = await fs.readFile(path.join(project, 'popup', 'popup.css'), 'utf8');
const cssLines = popupCss.split(/\r?\n/);
const rawColorOutsideTokens = cssLines.slice(18).filter(line => /#[0-9a-f]{3,8}|\b(rgb|rgba|white|black)\s*\(/i.test(line));
const importantLines = cssLines.filter(line => line.includes('!important'));
const cssAudit = { importantLines, rawColorOutsideTokens };
await fs.writeFile(path.join(outDir, 'glass-report.json'), `${JSON.stringify({ assertions, axeViolations: violations, cssAudit }, null, 2)}\n`);
console.log(JSON.stringify({ screenshots: widths.length * 2 * tabs.length * states.length + 2, assertionsFailed: assertions.filter(item => !item.layoutOk || !item.scrollOk).length, axeViolations: violations.length, importantLines: importantLines.length, rawColorOutsideTokens: rawColorOutsideTokens.length }, null, 2));
if (assertions.some(item => !item.layoutOk || !item.scrollOk) || violations.length || importantLines.length || rawColorOutsideTokens.length) process.exitCode = 1;
