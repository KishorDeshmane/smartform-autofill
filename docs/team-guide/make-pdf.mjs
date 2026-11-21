// Prints guide.html to docs/QA-Kit-Team-Guide.pdf (npm run guide:pdf).
// Usage: node make-pdf.mjs <projectDir> <guideDir> <outPdf>. Edit guide.html, then run it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [project, guideDir, outPdf] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(project, 'node_modules', 'playwright', 'index.mjs')).href);
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(guideDir, 'guide.html')).href, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode().catch(() => {}))));
  const broken = await page.evaluate(() => [...document.images].filter(img => !img.naturalWidth).map(img => img.getAttribute('src')));
  if (broken.length) throw new Error(`Missing images: ${broken.join(', ')}`);
  await page.pdf({
    path: outPdf, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font:8px Segoe UI,sans-serif;color:#8a91a5;padding:0 16mm;display:flex;justify-content:space-between"><span>QA Kit — Team Guide</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' }
  });
  const stat = await fs.stat(outPdf);
  console.log('pdf', outPdf, stat.size, 'bytes');

} finally {
  await browser.close();
}
