(function (root) {
  const columns = [
    ['srNo', 'Sr. No'], ['id', 'Test Case ID'], ['category', 'Category'],
    ['title', 'Test Case Description'], ['testData', 'Test Data'],
    ['precondition', 'Precondition'], ['steps', 'Steps Description'],
    ['expectedResult', 'Expected Result'], ['actualResult', 'Actual Result'], ['selectorStability', 'Selector Stability (0-100)'],
    ['priority', 'Priority'], ['sourceUrl', 'Page URL'], ['element', 'Element / Locator'],
    ['basis', 'Requirement Basis'], ['notes', 'Notes']
  ];
  /** Converts arrays to newline-separated text and other nullable values to strings. */
  const value = v => Array.isArray(v) ? v.join('\n') : String(v == null ? '' : v);
  /**
   * Text safe to place after `//` or `#` in generated source: every line terminator JavaScript or
   * Python recognises (\r, \n, U+2028, U+2029) becomes a space, so the text can never start a new
   * line of code, and `*\/` cannot close a block comment.
   */
  const commentText = v => value(v).replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\*\//g, '* /');
  /** Escapes a value for inclusion in one CSV cell. */
  function csvCell(v) {
    let text = value(v);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  /** Serializes generated cases as CSV text; it does not execute them. */
  function toCsv(cases) {
    return '\uFEFF' + [columns.map(c => c[1]), ...cases.map(tc => columns.map(([key]) => tc[key]))]
      .map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  /** Serializes generated cases as a Markdown table. */
  function toMarkdown(cases) {
    /** Escapes a value for a Markdown table cell and flattens line breaks. */
    const cell = v => value(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' / ');
    return ['| ' + columns.map(c => c[1]).join(' | ') + ' |', '| ' + columns.map(() => '---').join(' | ') + ' |',
      ...cases.map(tc => '| ' + columns.map(([key]) => cell(tc[key])).join(' | ') + ' |')].join('\n');
  }
  /** Produces a quoted JavaScript string literal from a nullable value. */
  function jsString(v) { return JSON.stringify(String(v == null ? '' : v)); }
  /** Selects the locator text used by generated Playwright examples. */
  function locatorFor(tc) {
    if (tc.locator) return String(tc.locator);
    const raw = String(tc.element || '');
    const marker = 'Locator: ';
    return raw.includes(marker) ? raw.slice(raw.indexOf(marker) + marker.length).replace(/^Page:\s*/, '') : '';
  }
  /** Returns a Playwright locator expression, preferring role/name and associated labels when available. */
  function playwrightLocatorFor(tc, python = false) {
    const preferred = python ? tc.playwrightPythonLocator : tc.playwrightLocator;
    if (preferred) return `page.${preferred}`;
    const locator = locatorFor(tc);
    return `page.locator(${JSON.stringify(locator)})`;
  }
  /** Builds JavaScript Playwright test source from the supplied generated cases. */
  function toPlaywright(cases) {
    const lines = ["import { test, expect } from '@playwright/test';", '', '// Generated from QA Kits test cases. Review locators and expected outcomes before execution.', ''];
    cases.forEach((tc, i) => {
      const title = String(tc.title || tc.id || `Generated test ${i + 1}`).replace(/\s+/g, ' ').trim();
      const locator = locatorFor(tc);
      lines.push(`test(${jsString(title)}, async ({ page }) => {`);
      const pageName = (() => { try { return new URL(tc.sourceUrl || '').hostname || 'page'; } catch (_) { return 'page'; } })();
      if (tc.sourceUrl && /^https?:\/\//i.test(tc.sourceUrl)) lines.push(`  // Page URL: ${commentText(tc.sourceUrl)}`, `  await page.goto(${jsString(tc.sourceUrl)});`);
      else lines.push(`  // Page URL: ${commentText(tc.sourceUrl || 'Configure the target URL before execution.')}`);
      lines.push(`  // Preconditions: ${commentText(tc.precondition)}`);
      if (locator && !/^Page$/i.test(locator)) {
        lines.push(`  const target = ${playwrightLocatorFor(tc)};`);
        lines.push('  await expect(target).toBeVisible();');
      } else lines.push('  // Page-level scenario: add the required target locator/action.');
      lines.push(`  // Steps: ${commentText(tc.steps)}`);
      lines.push(`  // Expected: ${commentText(tc.expectedResult)}`);
      lines.push(`  await page.screenshot({ path: ${jsString(`${pageName}-${tc.id}.png`)}, fullPage: true });`);
      lines.push('});', '');
    });
    return lines.join('\n');
  }
  /** Produces a quoted string literal compatible with the values emitted here for Python. */
  function pyString(v) { return JSON.stringify(String(v == null ? '' : v)); }
  /** Builds Python Playwright test source from the supplied generated cases. */
  function toPlaywrightPython(cases) {
    const lines = ['import re', 'from pathlib import Path', 'import pytest', 'from playwright.sync_api import Page, expect', '', '# Generated from QA Kits test cases. Review locators and expected outcomes before execution.', ''];
    cases.forEach((tc, i) => {
      const title = String(tc.title || tc.id || `generated_test_${i + 1}`).replace(/[^A-Za-z0-9_]+/g, '_').toLowerCase().trim() || `generated_test_${i + 1}`;
      const locator = locatorFor(tc);
      lines.push(`def test_${title.slice(0, 80)}(page: Page):`);
      if (tc.sourceUrl && /^https?:\/\//i.test(tc.sourceUrl)) lines.push(`    # Page URL: ${commentText(tc.sourceUrl)}`, `    page.goto(${pyString(tc.sourceUrl)})`);
      else lines.push(`    # Page URL: ${commentText(tc.sourceUrl || 'Configure the target URL before execution.')}`);
      lines.push(`    # Preconditions: ${commentText(tc.precondition)}`);
      if (locator && !/^Page$/i.test(locator)) lines.push(`    target = ${playwrightLocatorFor(tc, true)}`, '    expect(target).to_be_visible()');
      else lines.push('    # Page-level scenario: add the required target locator/action.');
      lines.push(`    # Steps: ${commentText(tc.steps)}`, `    # Expected: ${commentText(tc.expectedResult)}`, `    page.screenshot(path=${pyString(`screenshots/${tc.id}.png`)}, full_page=True)`, '');
    });
    return lines.join('\n');
  }
  root.SFFATestCaseExport = { columns, toCsv, toMarkdown, toPlaywright, toPlaywrightPython };
})(typeof window !== 'undefined' ? window : self);
