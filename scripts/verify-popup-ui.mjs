import { chromium } from 'playwright';
import axe from 'axe-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const project = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const popupUrl = new URL(`file://${path.join(project, 'popup', 'popup.html').replaceAll('\\', '/')}`).href;
const outDir = path.join(project, 'screenshots', 'verification');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const states = ['blocked', 'ready', 'running', 'done', 'error'];
const violations = [];

for (const width of [360, 440]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 600 }, colorScheme: theme });
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem('sffaTheme', selectedTheme);
      globalThis.chrome = {
        runtime: { id: 'mock-extension-id', getURL: value => value, onMessage: { addListener() {} } },
        storage: { local: { get: async () => ({}), set: async () => {} }, session: { get: async () => ({}), set: async () => {} } },
        tabs: { query: async () => [{ id: 1, url: 'https://example.test/form', title: 'Example form' }], sendMessage: async () => null },
        permissions: { contains: async () => false, request: async () => false },
      };
    }, theme);
    await page.goto(popupUrl);

    for (const state of states) {
      await page.evaluate((stepState) => {
        const reasons = { blocked: 'Scan the page first', ready: 'The page is ready to fill.', running: 'The selected run is in progress.', done: 'Review results in Output.', error: 'See the Activity Log and retry.' };
        if (typeof globalThis.setWorkflowStep === 'function') globalThis.setWorkflowStep('fill', stepState, reasons[stepState]);
      }, state);
      await page.screenshot({ path: path.join(outDir, `after-${theme}-${width}-${state}.png`), fullPage: true });
    }

    await page.evaluate(axe.source);
    const result = await page.evaluate(async () => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
    for (const violation of result.violations) {
      violations.push({ theme, width, id: violation.id, impact: violation.impact, nodes: violation.nodes.length, message: violation.description, details: violation.nodes.map(node => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })) });
    }
    await page.close();
  }
}
await browser.close();

await fs.writeFile(path.join(outDir, 'contrast-report.json'), `${JSON.stringify(violations, null, 2)}\n`);
console.log(JSON.stringify({ screenshots: states.length * 4, violations }, null, 2));
if (violations.length) process.exitCode = 1;
