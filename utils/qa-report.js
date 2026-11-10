(function (root) {
  const SENSITIVE_KEY = /password|passwd|token|secret|cookie|authorization|credential|api[-_]?key|otp|email|phone|mobile|address|ssn/i;
  const SENSITIVE_QUERY = /([?&](?:access_token|auth|authorization|code|email|key|password|phone|session|token)=)[^&#\s]*/gi;
  const BEARER = /\bBearer\s+[^\s,;]+/gi;

  /** Converts a value to bounded plain text for report output. */
  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(SENSITIVE_QUERY, '$1[REDACTED]')
      .replace(BEARER, 'Bearer [REDACTED]');
  }

  /** Removes credentials, query values, and fragments from URL fields in reports. */
  function sanitizeUrl(value) {
    try {
      const url = new URL(String(value));
      return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : `${url.protocol}[redacted]`;
    } catch (_) {
      return String(value).replace(/[?#].*$/, '');
    }
  }

  /** Removes unsafe or cyclic report data and bounds nested values for serialization. */
  function sanitize(value, key = '', seen = new WeakSet()) {
    if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return /(?:url|href)$/i.test(key) ? sanitizeUrl(value) : cleanText(value);
    if (Array.isArray(value)) return value.map(item => sanitize(item, '', seen));
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) result[childKey] = sanitize(childValue, childKey, seen);
    seen.delete(value);
    return result;
  }

  /** Escapes special characters before inserting text into generated HTML. */
  function escapeHtml(value) {
    return cleanText(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  /** Normalizes a scalar or array into a bounded array of report-safe items. */
  function asList(value) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
  }

  /** Converts report sections into rows for the downloadable HTML summary. */
  function rowsFor(report) {
    const cases = asList(report.cases || report.testCases);
    const findings = asList(report.findings || report.issues || report.validationErrorDetails);
    const testRows = cases.map(item => `<article class="case"><h3>${escapeHtml(item.id || 'Test case')} · ${escapeHtml(item.title || item.name || '')}</h3>
      <dl><dt>Type / Category</dt><dd>${escapeHtml(item.type || item.category || '')}</dd>
      <dt>Priority</dt><dd>${escapeHtml(item.priority || '')}</dd>
      <dt>Precondition</dt><dd>${escapeHtml(item.precondition || '')}</dd>
      <dt>Test data</dt><dd>${escapeHtml(item.testData || '')}</dd>
      <dt>Steps</dt><dd>${asList(item.steps).map(step => escapeHtml(step)).join('<br>')}</dd>
      <dt>Expected</dt><dd>${escapeHtml(item.expectedResult || '')}</dd>
      <dt>Actual</dt><dd>${escapeHtml(item.actualResult || 'Not executed')}</dd>
      <dt>Element</dt><dd>${escapeHtml(item.element || '')}</dd></dl></article>`);
    const issueRows = findings.map(item => {
      const issue = typeof item === 'string' ? { description: item } : item;
      return `<li><strong>${escapeHtml(issue.severity || 'Review')} · ${escapeHtml(issue.title || issue.message || issue.text || 'Finding')}</strong><p>Confidence: ${escapeHtml(issue.confidence || 'Not rated')}</p>
        <p>${escapeHtml(issue.description || issue.recommendation || issue.message || '')}</p>
        <code>${escapeHtml(issue.selector || issue.locator || '')}</code></li>`;
    });
    return { cases, findings, testRows, issueRows };
  }

  /** Sanitizes a report and returns a self-contained HTML document string. */
  function toHtml(source) {
    const report = sanitize(source || {});
    const { cases, findings, testRows, issueRows } = rowsFor(report);
    const generated = report.generatedAt || report.timestamp || new Date().toISOString();
    const pageUrl = report.pageUrl || report.url || '';
    const summary = report.summary || report.scanSummary || {};
    const metrics = Object.entries(summary).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value));
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Report</title><style>
*{box-sizing:border-box}body{margin:0;color:#17212b;background:#f3f6f7;font:15px/1.5 system-ui,sans-serif}main{max-width:980px;margin:0 auto;padding:32px 20px}header{border-bottom:3px solid #0b756e;padding:12px 0 20px}h1{margin:0;font-size:28px}h2{margin:28px 0 12px;font-size:20px}h3{margin:0 0 12px;font-size:17px}p{overflow-wrap:anywhere}.meta,.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.meta div,.metric,.case,.finding{background:#fff;border:1px solid #d7e0e3;border-radius:6px;padding:14px}.label,dt{color:#53636a;font-size:12px;font-weight:700;text-transform:uppercase}.metric strong{display:block;font-size:22px}dl{display:grid;grid-template-columns:150px 1fr;gap:8px;margin:0}dd{margin:0;overflow-wrap:anywhere}article{margin:12px 0}li{margin:10px 0}code{overflow-wrap:anywhere}@media print{body{background:#fff}main{max-width:none;padding:0}.case,.finding,.metric{break-inside:avoid;border-color:#aaa}header{border-color:#000}a{color:inherit}}
</style></head><body><main><header><h1>QA Report</h1><p>Generated ${escapeHtml(generated)}</p></header>
<section class="meta"><div><div class="label">Page URL</div><div>${escapeHtml(pageUrl || 'Not available')}</div></div><div><div class="label">Mode</div><div>${escapeHtml(report.mode || 'Exploratory')}</div></div><div><div class="label">Duration</div><div>${escapeHtml(report.duration || 'Not recorded')}</div></div>${report.dataSeed ? `<div><div class="label">Data seed</div><div><code>${escapeHtml(report.dataSeed)}</code></div></div>` : ''}</section>
<section><h2>Summary</h2><div class="metrics">${metrics.length ? metrics.map(([key, value]) => `<div class="metric"><div class="label">${escapeHtml(key)}</div><strong>${escapeHtml(value)}</strong></div>`).join('') : `<div class="metric"><div class="label">Test cases</div><strong>${cases.length}</strong></div><div class="metric"><div class="label">Findings</div><strong>${findings.length}</strong></div>`}</div></section>
<section><h2>Findings (${findings.length})</h2>${issueRows.length ? `<ul>${issueRows.join('')}</ul>` : '<p>No findings were supplied to this report.</p>'}</section>
<section><h2>Test cases (${cases.length})</h2>${testRows.length ? testRows.join('') : '<p>No test cases were supplied to this report.</p>'}</section>
<footer><p>Sensitive fields and recognized credential patterns are redacted. Print this page and choose “Save as PDF” to create a PDF copy.</p></footer></main></body></html>`;
  }

  root.SFFAQAReport = { toHtml, sanitize, sanitizeUrl };
})(typeof window !== 'undefined' ? window : self);
