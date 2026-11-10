(function (root) {
  const MAX_ELEMENTS = 5000;
  const MAX_DEPTH = 8;
  /** Collapses whitespace and trims a value for concise generated descriptions. */
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  /** Removes URL credentials, query strings, and fragments from exported testcase data. */
  function safeUrl(value) {
    try {
      const url = new URL(value, root.location.href);
      return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : `${url.protocol}[redacted]`;
    }
    catch (_) { return '[redacted URL]'; }
  }
  /** Escapes a value for a CSS identifier, with a fallback when CSS.escape is unavailable. */
  const escape = value => root.CSS?.escape ? root.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
  /** Derives concise identifying text from a control's labels and attributes. */
  function label(el) {
    const doc = el.ownerDocument;
    const ids = clean(el.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    return clean(el.getAttribute('aria-label') || ids.map(id => doc.getElementById(id)?.textContent || '').join(' ') ||
      Array.from(el.labels || []).map(l => l.textContent).join(' ') || el.getAttribute('alt') ||
      el.getAttribute('placeholder') || (el.matches('button, a, [role="button"], [role="link"], summary, [role="tab"]') ? el.textContent : '') ||
      el.name || el.id || el.getAttribute('title') || el.getAttribute('role') || el.tagName.toLowerCase()).slice(0, 140);
  }
  /** Builds a locator description used in the generated manual test cases. */
  function locator(el) {
    if (el.id && el.getRootNode().querySelectorAll('#' + escape(el.id)).length === 1) return '#' + escape(el.id);
    const parts = [];
    for (let node = el; node?.nodeType === 1; node = node.parentElement) {
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(n => n.tagName === node.tagName) : [node];
      parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''));
      if (parts.length >= 6 || !node.parentElement) break;
    }
    return parts.join(' > ');
  }
  /** Checks whether an element has a rendered box and is not hidden by its style. */
  function rendered(el) {
    if (el.matches('input[type="hidden"]')) return false;
    const win = el.ownerDocument.defaultView;
    for (let node = el; node; node = node.parentElement || node.getRootNode()?.host) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('inert')) return false;
      const style = win?.getComputedStyle(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    return !root.SFFAFormDetector || root.SFFAFormDetector.isVisible(el);
  }
  /** Builds manual scenarios from observed DOM controls and bounded page traversal. */
  function generateReport(detected) {
    const cases = [], seen = new Set(), elements = [], visited = new WeakSet();
    const coverage = { scope: 'Current rendered page, accessible frames and open shadow roots', scannedElements: 0, controls: 0, links: 0, buttons: 0, framesScanned: 0, shadowRootsScanned: 0, inaccessibleFrames: 0, truncated: false, warnings: [], categories: {} };
    const mainUrl = safeUrl(root.location.href);
    /** Scans one scope and reachable shadow roots/frames within configured limits. */
    function walk(scope, context = 'Page', depth = 0) {
      if (!scope || visited.has(scope)) return;
      if (depth > MAX_DEPTH) { coverage.truncated = true; return; }
      visited.add(scope);
      for (const el of scope.querySelectorAll('*')) {
        if (coverage.scannedElements >= MAX_ELEMENTS) { coverage.truncated = true; return; }
        coverage.scannedElements++;
        if (el.closest('[id^="__sffa_"]')) continue;
        if (rendered(el)) elements.push({ el, context, url: el.ownerDocument.URL === 'about:blank' ? mainUrl : safeUrl(el.ownerDocument.URL) });
        if (el.shadowRoot && rendered(el)) { coverage.shadowRootsScanned++; walk(el.shadowRoot, `${context} / shadow ${locator(el)}`, depth + 1); }
        if (el.tagName === 'IFRAME' && rendered(el)) {
          try {
            const doc = el.contentDocument;
            if (doc?.documentElement) { coverage.framesScanned++; walk(doc, `${context} / frame ${locator(el)}`, depth + 1); }
            else coverage.inaccessibleFrames++;
          } catch (_) { coverage.inaccessibleFrames++; }
        }
      }
    }
    walk(root.document);
    const wording = root.SFFATestCaseWording;
    const pageTitle = clean(root.document.title).slice(0, 60);
    const pageName = pageTitle ? `"${pageTitle}" page` : 'page';
    /** Text of the form's submit button (for steps such as 'Click the "Save" button'). */
    function submitFor(el) {
      const scope = el?.closest?.('form') || root.document;
      const button = scope.querySelector('button[type="submit"], input[type="submit"], button:not([type])')
        || Array.from(scope.querySelectorAll('button, [role="button"]')).find(b => /submit|save|continue|next|register|send|apply|sign up|create/i.test(b.textContent || b.value || ''));
      const text = button ? clean(button.textContent || button.value).slice(0, 40) : '';
      return text ? `the "${text}" button` : 'the Submit button';
    }
    /** What a person calls this kind of control. */
    function kindOf(el) {
      const tag = el.tagName, type = (el.type || '').toLowerCase(), role = el.getAttribute('role');
      if (el.matches('a[href], area[href], [role="link"]')) return 'link';
      if (el.matches('button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]')) return 'button';
      if (tag === 'SELECT' || role === 'combobox' || el.matches('[aria-haspopup="listbox"]')) return 'dropdown';
      if (tag === 'TEXTAREA') return 'text area';
      if (el.isContentEditable) return 'text editor';
      if (type === 'checkbox' || role === 'checkbox') return 'checkbox';
      if (role === 'switch') return 'switch';
      if (type === 'radio' || role === 'radio') return 'options';
      const byType = { email: 'email box', tel: 'phone number box', number: 'number box', password: 'password box', date: 'date picker', 'datetime-local': 'date and time picker', month: 'month picker', week: 'week picker', time: 'time picker', url: 'website address box', search: 'search box', color: 'colour picker', range: 'slider', file: 'file upload' };
      if (tag === 'INPUT') return byType[type] || 'text box';
      if (role === 'slider' || role === 'spinbutton') return 'slider';
      if (role === 'tab') return 'tab';
      if (role && role.startsWith('menuitem')) return 'menu option';
      if (tag === 'SUMMARY') return 'expandable section';
      if (tag === 'IMG') return 'image';
      if (el.matches('table, [role="grid"]')) return 'table';
      if (el.matches('dialog, [role="dialog"]')) return 'pop-up';
      if (tag === 'FORM') return 'form';
      if (el.matches('[role="progressbar"]')) return 'progress bar';
      if (el.matches('[role="tree"], [role="treegrid"]')) return 'tree list';
      if (tag === 'CANVAS') return 'signature box';
      return 'element';
    }
    /** Element name as people see it: '"Email" box', '"State" dropdown', '"Gender" options'. */
    function friendlyName(el) {
      const kind = kindOf(el);
      let text = '';
      if (kind === 'options') {
        const group = el.closest('fieldset, [role="radiogroup"]');
        text = clean(group?.querySelector('legend')?.textContent || group?.getAttribute('aria-label') || '');
        if (!text) text = clean(label(el));
      } else if (kind === 'form') {
        text = clean(el.getAttribute('aria-label') || el.querySelector('h1, h2, h3, legend')?.textContent || el.name || '');
      } else {
        // Label text without the text of controls inside it (a wrapping <label> also contains the dropdown's options).
        const labelEl = el.labels?.[0];
        if (labelEl && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
          const copy = labelEl.cloneNode(true);
          copy.querySelectorAll('select, option, input, textarea, button, datalist').forEach(n => n.remove());
          text = clean(copy.textContent);
        }
        if (!text) text = clean(label(el));
      }
      text = text.replace(/\s*[*:]+\s*$/, '').replace(/^\*\s*/, '').slice(0, 60);
      if (!text || text.toLowerCase() === el.tagName.toLowerCase()) return kind === 'form' ? 'form' : `unnamed ${kind}`;
      // '"Email" email box' → '"Email" box'; '"Date of birth" date picker' → '"Date of birth" picker'.
      const kindWord = kind.split(' ')[0];
      const shortKind = kind.includes(' ') && new RegExp(`\\b${kindWord}`, 'i').test(text) ? kind.split(' ').slice(-1)[0] : kind;
      return `"${text}" ${shortKind}`;
    }
    /** A value just below/above a min or max, for number and date fields. */
    function step(value, dir, el) {
      const n = Number(value);
      if (value !== '' && Number.isFinite(n)) {
        const s = Number(el.step) > 0 ? Number(el.step) : 1;
        return String(Number((n + dir * s).toFixed(6)));
      }
      const d = new Date(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(d.getTime())) { d.setDate(d.getDate() + dir); return d.toISOString().slice(0, 10); }
      return dir < 0 ? `a value just below ${value}` : `a value just above ${value}`;
    }
    /** A realistic correct example for a field, used in "accepts a correct value" cases. */
    function exampleFor(el, semantic) {
      const type = (el.type || '').toLowerCase();
      const sem = String(semantic || '').toLowerCase();
      if (type === 'email' || sem.includes('email')) return 'priya.sharma@example.com';
      if (type === 'tel' || /mobile|phone/.test(sem)) return '9876543210';
      if (type === 'url') return 'https://www.example.com';
      if (type === 'password') return 'Test@1234';
      if (type === 'date') return el.min || el.max || '2026-01-15';
      if (type === 'time') return '10:30';
      if (type === 'number' || type === 'range') {
        const min = Number(el.min), max = Number(el.max);
        if (Number.isFinite(min) && Number.isFinite(max) && el.min !== '' && el.max !== '') return String(Math.round((min + max) / 2));
        return el.min || '25';
      }
      if (/fullname|name/.test(sem)) return 'Priya Sharma';
      if (/pin|zip|postal/.test(sem)) return '411001';
      if (/city/.test(sem)) return 'Pune';
      if (/pan/.test(sem)) return 'ABCDE1234F';
      if (/aadhaar/.test(sem)) return '1234 5678 9012';
      if (el.tagName === 'TEXTAREA') return 'This is a sample message for testing.';
      return 'Test value 123';
    }
    /** Everything the plain-language wording needs about one element. */
    function contextFor(item) {
      const el = item?.el;
      const c = { P: pageName, submit: submitFor(el), el: el || root.document.body };
      if (!el) { c.N = pageName; return c; }
      c.N = friendlyName(el);
      c.example = exampleFor(el, semantics.get(el));
      c.min = el.min; c.max = el.max;
      if (el.min) { c.below = step(el.min, -1, el); c.minAbove = step(el.min, 1, el); }
      if (el.max) { c.above = step(el.max, 1, el); c.maxBelow = step(el.max, -1, el); }
      c.minLength = el.minLength; c.maxLength = el.maxLength;
      c.accept = el.accept ? el.accept.split(',').map(s => s.trim()).join(', ') : 'any allowed type';
      const hint = clean(el.closest('section, form, div')?.textContent || '').match(/(?:max(?:imum)?\.?\s*(?:file\s*)?size[^0-9]{0,15})(\d+(?:\.\d+)?\s*(?:MB|KB|GB))/i);
      c.sizeLimit = hint ? hint[1] : '';
      c.suggestions = el.list?.options ? Array.from(el.list.options).filter(o => o.value).length : 0;
      if (el.tagName === 'SELECT') {
        const opts = Array.from(el.options).filter(o => !o.disabled && o.value).map(o => clean(o.text));
        c.choices = opts.length ? opts.slice(0, 8).join(', ') + (opts.length > 8 ? ` (and ${opts.length - 8} more)` : '') : '';
      }
      return c;
    }
    /** Wording key for scenarios whose text includes a variable part. */
    const wordingKey = scenario => scenario.replace(/^Verify invalid (email|url|tel|password) format$/, 'Verify invalid $1 format');

    /** Appends a generated case with locator, expected result, and provenance metadata. */
    function add(item, category, scenario, expected, data = '', priority = 'Medium', basis = 'Observed DOM', notes = '', steps = null) {
      if (wording?.NOT_FOR_CLIENT.has(scenario)) return;
      const elementName = item ? label(item.el) : 'Current page';
      const elementType = item ? (item.el.getAttribute('role') || item.el.tagName.toLowerCase()) : 'page';
      const name = item ? `${elementName} (${elementType})` : elementName;
      const selectorInspection = item ? root.SFFASelectorEngine?.inspect(item.el) : null;
      const stableLocator = item ? (selectorInspection?.selector || locator(item.el)) : '';
      const key = `${item?.context || 'Page'}|${item ? locator(item.el) : ''}|${category}|${scenario}`;
      if (seen.has(key)) return;
      seen.add(key);
      const n = cases.length + 1;
      const url = item?.url || mainUrl;
      // Plain-language wording a client can read and run (falls back to the technical text).
      const plain = wording?.W[wordingKey(scenario)];
      let title = `${scenario}: ${name}`;
      let precondition = `Open ${url} in an authorized test environment. ${basis === 'Requires confirmation' ? 'Confirm the applicable requirement and test data before execution.' : 'Make the target element visible; satisfy documented prerequisites.'}`;
      let caseSteps = steps || [`Find the ${name}.`, scenario.endsWith('.') ? scenario : `${scenario}.`, `Check the result against: ${expected}`];
      let displayName = item ? name : 'Page-level check';
      if (plain) {
        const c = contextFor(item);
        title = plain.t(c);
        expected = plain.e(c);
        if (plain.d) data = plain.d(c);
        else if (/^(Empty value|Unchecked|No file)$/.test(data)) data = '';
        notes = plain.n ? plain.n(c) : (basis === 'Requires confirmation' ? 'Confirm with the requirement that this applies; mark it N/A if it does not.' : '');
        precondition = `The ${pageName} is open in the test environment (${url})${item ? '' : ', and you are logged in if the page needs it'}.`
          + (basis === 'Requires confirmation' ? ' Check the expected behaviour in the requirement before testing.' : '');
        caseSteps = [`Open the ${pageName}.`, ...plain.s(c)];
        displayName = item ? c.N : 'Whole page';
      }
      cases.push({ srNo: n, id: `TC${String(n).padStart(4, '0')}`, category,
        title, testData: data, precondition,
        steps: caseSteps,
        expectedResult: expected, actualResult: '', priority, sourceUrl: url,
        elementDisplay: displayName,
        element: item ? name : 'Page',
        locator: stableLocator, playwrightLocator: selectorInspection?.playwrightLocator || null,
        playwrightPythonLocator: selectorInspection?.playwrightPythonLocator || null,
        selectorStability: selectorInspection?.stabilityScore ?? null, basis, notes });
    }
    /** Adds a generated case marked as requiring manual confirmation. */
    const manual = (item, category, scenario, expected, data = '', priority = 'Medium', notes = '') => add(item, category, scenario, expected, data, priority, 'Requires confirmation', notes);
    const semantics = new Map([...(detected?.text || []), ...(detected?.select || []), ...(detected?.customDropdowns || []), ...(detected?.file || [])].map(f => [f.element, f.type]));
    /** Adds keyboard and accessibility checks where an observed control needs them. */
    function access(item) {
      add(item, 'Accessibility/usability', 'Verify accessible name and label association', 'The control exposes an understandable accessible name; its visible label identifies the same purpose.');
      if (item.el.matches(':disabled')) {
        add(item, 'Accessibility/usability', 'Verify disabled control keyboard behavior', 'The natively disabled control is not editable or activated through the normal tab sequence; its disabled purpose remains understandable.');
        return;
      }
      add(item, 'Accessibility/usability', 'Verify keyboard access and visible focus', 'The interactive control can be reached and operated using its native or documented keyboard interaction; focus is visible and not trapped.');
    }
    const groups = new Map();
    for (const item of elements) {
      const el = item.el, tag = el.tagName, role = el.getAttribute('role'), type = (el.type || '').toLowerCase();
      const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
      const required = !!el.required || el.getAttribute('aria-required') === 'true';
      if (el.matches('a[href], area[href], [role="link"]')) {
        coverage.links++;
        const raw = el.getAttribute('href'), target = el.getAttribute('target'), download = el.hasAttribute('download');
        let url = null; try { if (raw) url = new URL(raw, el.ownerDocument.baseURI); } catch (_) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
        access(item);
        if (disabled) add(item, 'Permission/role-based', 'Verify disabled link does not navigate', 'Activation does not navigate or execute a restricted action until the link is enabled.', '', 'High');
        else if (!url || /^javascript:/i.test(raw || '')) {
          manual(item, 'Navigation', 'Verify script-driven link action', 'The link performs its documented action exactly once; a missing or invalid destination is reported as a defect.', raw ? safeUrl(raw) : '(no href)', 'High');
        } else if (url.protocol === 'mailto:' || url.protocol === 'tel:') {
          add(item, 'Integration', `Verify ${url.protocol === 'mailto:' ? 'email' : 'telephone'} link handoff`, 'The browser offers the appropriate installed handler with the destination defined in the link; no unrelated destination is opened.', safeUrl(raw));
          manual(item, 'Error handling', 'Verify missing external handler behavior', 'When no handler is available, the application/browser handles the condition without corrupting page state.', 'Device without a configured handler');
        } else if (download) {
          add(item, 'Positive', 'Verify linked file download', 'The link initiates a download of the intended resource; the downloaded file can be opened and matches the documented content.', `URL: ${safeUrl(url.href)}; download attribute: ${el.getAttribute('download') || '(browser-defined filename)'}`, 'High');
          manual(item, 'Error handling', 'Verify unavailable download and retry', 'Unavailable or unauthorized downloads produce the documented error; retry does not create misleading empty or corrupt files.', 'Controlled unavailable or unauthorized download', 'High');
        } else if (raw.startsWith('#') || (url.hash && url.pathname === new URL(el.ownerDocument.baseURI).pathname && url.origin === new URL(el.ownerDocument.baseURI).origin)) {
          add(item, 'Navigation', 'Verify in-page anchor destination', 'Activation reaches the referenced section and does not navigate to an unintended page; missing targets are reported.', `Fragment: ${url.hash ? '[redacted]' : '[none]'}`);
        } else if (['http:', 'https:'].includes(url.protocol)) {
          add(item, 'Navigation', 'Verify link destination and page identity', 'The link resolves to the declared destination or a documented redirect; the resulting page matches the link purpose.', `Declared URL: ${safeUrl(url.href)}`, 'High');
          add(item, 'Negative', 'Verify link is not broken', 'The destination loads successfully for an authorized user; unexpected 4xx/5xx responses, redirect loops and browser errors are reported.', `Declared URL: ${safeUrl(url.href)}`, 'High');
          add(item, 'Navigation', 'Verify browser Back and Forward after navigation', 'Back/Forward returns to the expected history entries without unexpected resubmission or loss of state that the requirements say to preserve.');
          if (url.origin !== new URL(el.ownerDocument.baseURI).origin) manual(item, 'Security', 'Verify external destination trust and handoff', 'The external origin is approved and no unintended sensitive data is sent through the URL or referrer.', `External origin: ${url.origin}`, 'High');
        } else manual(item, 'Integration', 'Verify special-protocol link behavior', 'The documented protocol handler receives the intended destination; unsupported protocols fail clearly.', safeUrl(raw));
        if (target === '_blank') {
          add(item, 'Navigation', 'Verify new-tab link behavior', 'The destination opens in a new browsing context and the original page remains available.');
          add(item, 'Security', 'Verify new-tab opener isolation', 'The destination cannot use an unintended opener relationship to alter the original page; assess effective browser behavior, not only rel attributes.', '', 'High');
        } else if (!disabled && url) add(item, 'Navigation', 'Verify declared browsing-context target', 'Navigation uses the target declared by the link; absent a target, normal same-context navigation applies unless documented application behavior overrides it.', `target: ${target || '(not specified)'}`);
        continue;
      }
      if (el.matches('button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]') && !['combobox','tab','checkbox','switch','radio','slider','spinbutton'].includes(role) && !el.matches('[aria-haspopup="listbox"]')) {
        coverage.buttons++;access(item);
        const text = label(el), risky = /delete|remove|pay|purchase|terminate|deactivate|submit|confirm|send/i.test(text);
        if (disabled) add(item, 'Validation', 'Verify disabled button cannot execute an action', 'Mouse and keyboard activation do not run the button action until its documented prerequisites are met.', '', 'High');
        else {
          manual(item, 'Workflow', 'Verify button performs its intended action', 'The documented action occurs once and the resulting state is correct.', 'Approved test records', risky ? 'High' : 'Medium', risky ? 'Potentially state-changing action: execute only with approved test data.' : 'Confirm the intended action; button text alone is not a complete requirement.');
          manual(item, 'Negative', 'Verify rapid repeated activation', 'Repeated activation does not create duplicate operations, conflicting state or duplicate records.', 'Double-click and rapid repeated activation', 'High');
          if (/add|another|new row/i.test(text)) manual(item, 'Workflow', 'Verify repeatable row creation and independent values', 'Where the action adds a row, the new controls have distinct identities; editing/removing one row does not overwrite another row.', 'At least two rows with different values', 'High', 'Confirm whether this action adds repeatable fields.');
          if (/reset|clear/i.test(text) || type === 'reset') add(item, 'Workflow', 'Verify reset scope and resulting values', 'Only the intended form/section is reset to its defined defaults; unrelated forms remain unchanged.');
          if (/cancel|close/i.test(text)) manual(item, 'Navigation', 'Verify cancel or close behavior', 'The view closes or returns as documented; unsaved edits are handled according to the requirement.');
          if (el.hasAttribute('aria-expanded')) add(item, 'UI/UX', 'Verify expand/collapse state and controlled content', 'Activation toggles the intended content; aria-expanded matches the displayed state and unrelated sections are unchanged.');
        }
        continue;
      }
      if (el.matches('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], [contenteditable="true"]')) {
        if (el.matches('input[type="hidden"], input[type="submit"], input[type="button"], input[type="reset"]')) continue;
        if (el.closest('[role="combobox"]') && el.closest('[role="combobox"]') !== el) continue;
        coverage.controls++;access(item);
        if (disabled) {
          add(item, 'Permission/role-based', 'Verify disabled control cannot be edited', 'The control does not accept edits while disabled.', '', 'High');
          manual(item, 'Workflow', 'Verify prerequisites enable the dependent control', 'The control becomes available only after the documented prerequisite; its choices/data correspond to the current parent state.', 'Valid and invalid parent states', 'High', 'Dependency inferred from disabled state; confirm its parent and rules.');
        }
        if (el.readOnly) { add(item, 'Validation', 'Verify read-only value cannot be edited', 'Typing/pasting does not change the read-only value; navigation and copying remain usable.'); continue; }
        if (type === 'radio') {
          const key = `${item.context}|${el.form ? locator(el.form) : 'page'}|${el.name || locator(el)}`;
          if (!groups.has(key)) {
            groups.set(key,true);
            add(item, 'Positive', 'Verify radio-group mutual exclusion', 'Exactly one option in this group can be selected; other forms/groups are not changed.');
            if (required || Array.from(el.form?.elements || el.ownerDocument.querySelectorAll('input[type="radio"]')).some(n => n.type === 'radio' && n.name === el.name && n.required)) add(item, 'Validation', 'Verify required radio group with no selection', 'The form does not accept a missing required selection and identifies the group.', 'No option selected', 'High');
            manual(item, 'Workflow', 'Verify each radio choice and dependent content', 'Every available choice displays and validates the documented dependent fields, with no stale values from the previous choice.');
          }
          continue;
        }
        if (type === 'checkbox' || role === 'checkbox' || role === 'switch') {
          add(item, 'Positive', 'Verify checked and unchecked states', 'Mouse and keyboard toggling changes the intended checkbox once and reflects the resulting state.');
          if (required) add(item, 'Validation', 'Verify required checkbox remains unchecked', 'The form blocks acceptance until this required checkbox is checked.', 'Unchecked', 'High');
          manual(item, 'Workflow', 'Verify checkbox-dependent behavior and persistence', 'Related fields and persisted preference match the documented state after save/reopen.');
          continue;
        }
        if (tag === 'SELECT' || role === 'combobox' || el.matches('[aria-haspopup="listbox"]')) {
          const choices = tag === 'SELECT' ? Array.from(el.options).filter(o => !o.disabled && o.value).map(o => `${o.text}: ${o.value}`) : [];
          add(item, 'Positive', 'Verify available dropdown choices can be selected', 'Each enabled real choice can be selected and remains visible as the current choice.', choices.length ? choices.join('; ') : 'Each available enabled option');
          add(item, 'Negative', 'Verify disabled or unavailable dropdown options', 'Disabled/unavailable options cannot be selected through normal keyboard or pointer interaction.');
          if (required) add(item, 'Validation', 'Verify required dropdown with no real selection', 'An empty/placeholder selection does not satisfy the required field.', 'Placeholder / no selection', 'High');
          manual(item, 'Workflow', 'Verify dependent dropdown refresh and stale values', 'If this control has dependencies, changing its parent refreshes choices and clears incompatible selections; test the full documented chain.', 'Each parent choice; rapid parent changes', 'High', 'Dependency cannot be proven from DOM alone. Mark N/A if independent.');
          manual(item, 'Error handling', 'Verify delayed or failed option loading and retry', 'For remotely loaded options, loading, empty, failure and retry states are usable and do not select stale choices.', 'Slow/empty/failed option response', 'High', 'Applies only if choices are loaded asynchronously.');
          if (el.multiple) add(item, 'Positive', 'Verify multiple dropdown selection and deselection', 'Multiple enabled choices can be selected/deselected and the submitted set matches the selection.');
          continue;
        }
        if (type === 'file') {
          add(item, 'Positive', 'Verify supported file attachment', 'A permitted file attaches to the intended field; filename and final application upload state are correct.', `accept: ${el.accept || '(not declared; confirm allowed types)'}`, 'High');
          if (el.accept) add(item, 'Validation', 'Verify disallowed file extension or MIME', 'The application enforces its documented allowed file policy and presents a useful validation error.', `Disallowed file outside accept="${el.accept}"`, 'High', 'Requires confirmation', 'accept is a chooser hint; confirm the server-side file policy.');
          manual(item, 'Boundary value', 'Verify file-size boundaries', 'Files at the documented limit behave as specified; oversized files fail without partial or misleading success.', 'Limit − 1 byte, limit, limit + 1 byte', 'High', 'No file-size limit is inferred when absent from the page.');
          manual(item, 'Negative', 'Verify empty, corrupt and renamed files', 'The application applies the documented content-validation policy; unsafe or invalid files do not become valid merely by changing extension.', 'Zero-byte, corrupt and extension/MIME-mismatched files', 'High');
          add(item, 'Positive', 'Verify single versus multiple attachment behavior', el.multiple ? 'The field accepts the selected set of permitted files and represents each correctly.' : 'The field accepts one file; replacement does not leave an unintended extra attachment.', el.multiple ? 'Two permitted files' : 'First file, then replacement file');
          if (required) add(item, 'Validation', 'Verify missing required attachment', 'The application does not accept the form with the required file missing.', 'No file', 'High');
          manual(item, 'Error handling', 'Verify interrupted upload and retry', 'Failure is visible; retry does not duplicate attachments or falsely report server upload success.', 'Controlled network interruption', 'High');
          continue;
        }
        const semantic = semantics.get(el) || type || tag.toLowerCase();
        if (el.getAttribute('autocomplete') === 'one-time-code' || /\botp\b|verification code|one.time.password/i.test(label(el))) {
          manual(item, 'Security', 'Verify verification-code validity, expiry and reuse', 'Only the documented valid code is accepted within its expiry; invalid, expired and previously used codes fail according to the verification policy.', 'Approved valid/invalid/expired/reused test codes', 'High', 'Use a test verification service; this generator does not obtain or enter real OTPs.');
          manual(item, 'Validation', 'Verify verification-code length, paste and resend rules', 'Digit boxes, full-code paste, attempt limits and resend behavior follow the documented policy without mixing old/new codes.', 'Documented code length and resend/attempt limits', 'High');
        }
        if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
          manual(item, 'UI/UX', 'Verify rich-text formatting and paste behavior', 'Supported formatting, lists, links, undo/redo and plain/rich paste produce the documented saved content without corrupt markup.', 'Formatted and plain text; Unicode; line breaks');
        }
        if (type === 'color') add(item, 'Positive', 'Verify color picker selection and retained value', 'Selecting a supported color updates the field and displayed preview consistently; reopening preserves the accepted selection.', 'Supported color samples');
        add(item, 'Positive', 'Verify valid field input', 'The field accepts a value consistent with its declared type and documented business format.', `Valid ${semantic} value`, 'High');
        if (required) add(item, 'Validation', 'Verify mandatory field left empty', 'The empty required field prevents form acceptance and has an understandable error.', 'Empty value', 'High');
        else manual(item, 'Validation', 'Verify optional field left empty', 'If this field is optional under the applicable business rule, the form accepts it empty.', 'Empty value', 'Medium', 'DOM does not declare required; confirm application-level validation.');
        add(item, 'UI/UX', 'Verify copy, paste, editing and clearing', 'Editing affects only this field; pasted input is handled consistently and the caret/value remain usable.');
        manual(item, 'Negative', 'Verify whitespace and special-character handling', 'Whitespace and special characters are retained, normalized or rejected according to the documented field policy without corrupting adjacent data.', 'Leading/trailing spaces; whitespace only; quotes; Unicode');
        if (el.hasAttribute('minlength')) add(item, 'Boundary value', 'Verify minimum text length', `The declared minimum length of ${el.minLength} is enforced for non-empty input, consistent with the required/optional rule.`, `${Math.max(0,el.minLength-1)}, ${el.minLength}, ${el.minLength+1} characters`, 'High');
        if (el.hasAttribute('maxlength')) add(item, 'Boundary value', 'Verify maximum text length', `Input cannot be accepted beyond the declared maximum of ${el.maxLength} characters; typing and paste behave consistently.`, `${Math.max(0,el.maxLength-1)}, ${el.maxLength}, ${el.maxLength+1} characters`, 'High');
        if (el.pattern) add(item, 'Validation', 'Verify declared pattern validation', 'Matching non-empty input is accepted; mismatches fail the declared pattern without misleading success.', `pattern: ${el.pattern}`, 'High');
        if (['number','range','date','datetime-local','month','week','time'].includes(type)) {
          if (el.min) add(item, 'Boundary value', 'Verify lower value boundary', `Values below the declared minimum ${el.min} are not accepted; the boundary is handled consistently.`, `Immediately below, at and above ${el.min}`, 'High');
          if (el.max) add(item, 'Boundary value', 'Verify upper value boundary', `Values above the declared maximum ${el.max} are not accepted; the boundary is handled consistently.`, `Immediately below, at and above ${el.max}`, 'High');
          if (el.step && el.step !== 'any') add(item, 'Boundary value', 'Verify declared step interval', `Accepted values follow step ${el.step} from the control's declared step base.`, 'Aligned and misaligned values');
          add(item, 'Negative', 'Verify malformed numeric or date/time input', 'Invalid input cannot be accepted as a valid numeric/date/time value; browser rejection is distinguished from application validation.', 'Malformed value for '+type);
        }
        if (['email','url','tel','password'].includes(type)) {
          manual(item, 'Negative', `Verify invalid ${type} format`, 'Values that violate the documented format/policy are rejected with useful feedback.', type === 'email' ? 'Missing @; missing domain; spaces' : type === 'url' ? 'Malformed URL; disallowed scheme' : `Invalid ${type} samples`, 'High', type === 'tel' ? 'Telephone rules are application-specific; input type alone declares no format.' : 'Confirm business-specific rules beyond native format.');
        }
        if (type === 'password') {
          add(item, 'Security', 'Verify credential masking and non-disclosure', 'Password text is masked by default and not leaked in URLs, page messages, logs or generated reports.', 'Synthetic password only', 'High');
          manual(item, 'Validation', 'Verify password policy and confirmation mismatch', 'Documented length/complexity rules and confirmation matching are enforced without disclosing the password.', 'Policy boundaries and mismatching confirmation', 'High');
        }
        const suggestions = el.list && el.list.options ? Array.from(el.list.options).map(o => String(o.value || '').trim()).filter(Boolean) : [];
        if (suggestions.length) {
          const sample = suggestions.slice(0, 3).join('; ') + (suggestions.length > 3 ? '; …' : '');
          add(item, 'Positive', 'Verify choosing a suggested option', `The field offers its ${suggestions.length} suggestion(s) while typing, and choosing one fills the exact suggested value.`, sample, 'High');
          manual(item, 'Validation', 'Verify a value that is not in the suggestion list', 'Suggestions do not restrict input in HTML: free text is accepted, or rejected by the application with a clear message if only listed values are allowed.', 'A value not in the list', 'Medium', 'Confirm whether the application accepts free text for this field.');
        }
        if (type === 'search' || /search|filter/i.test(label(el))) {
          manual(item, 'Positive', 'Verify matching and no-result search/filter states', 'Matching input returns the documented subset; no-result input shows a clear empty state and clearing restores the expected data.', 'Exact, partial, case variants and no-match query');
        }
        continue;
      }
      if (role === 'radio') {
        access(item);
        add(item,'Positive','Verify custom radio selection and group state','Selecting an enabled option updates aria-checked and leaves exactly one selected option within the intended radiogroup.');
      }
      if (role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio') {
        access(item);
        manual(item,'Navigation','Verify menu-item action and menu dismissal','The item performs its documented action once; focus and menu dismissal follow the menu interaction pattern.');
      }
      if (role === 'slider' || role === 'spinbutton') {
        access(item);
        add(item,'Boundary value','Verify widget range, increments and keyboard changes','Pointer and keyboard changes respect the declared range and update aria-valuenow and the visible value consistently.',`Minimum: ${el.getAttribute('aria-valuemin') || 'not declared'}; maximum: ${el.getAttribute('aria-valuemax') || 'not declared'}`);
      }
      if (el.matches('canvas') && /signature|sign here/i.test(label(el) + ' ' + el.className)) manual(item,'Positive','Verify signature drawing, clear and saved result','An approved test signature can be drawn, cleared and saved with correct association and without altering another record.','Synthetic test signature','High');
      if (el.matches('[role="tree"], [role="treegrid"]')) manual(item,'Workflow','Verify hierarchical selection and expand/collapse','Documented parent/child selection, expansion, keyboard movement and retained selection are consistent.','Parent and leaf selections');
      if (el.matches('[role="progressbar"]')) add(item,'UI/UX','Verify progress state and completion feedback','Progress and accessible values reflect the operation; completion/error is not represented as ongoing progress.');
      if (role === 'checkbox' || role === 'switch') { access(item); add(item,'Positive','Verify custom toggle state','Pointer and keyboard interaction update aria-checked and the visible state consistently.'); }
      if (role === 'tab') { access(item); add(item,'Navigation','Verify tab and associated panel','Activating the tab shows its intended panel and updates aria-selected without displaying unrelated panels.'); }
      if (tag === 'SUMMARY') { access(item); add(item,'UI/UX','Verify disclosure opens and closes','The containing details section toggles with mouse and keyboard; its contents remain usable.'); }
      if (tag === 'IMG') add(item,'Accessibility/usability','Verify image rendering and text alternative','The image loads or has a usable fallback; meaningful images have suitable alternatives and decorative images are not announced as content.');
      if (el.matches('table, [role="grid"]')) {
        add(item,'UI/UX','Verify table/grid headers and cell relationships','Rows and columns align, headers describe data, and assistive technology can identify relationships.');
        manual(item,'Workflow','Verify available sorting, filtering and pagination','Where these features exist, each operates on the correct dataset and preserves documented state without missing or duplicate rows.','First/last page; no results; ascending/descending','Medium','Mark unsupported operations N/A.');
      }
      if (el.matches('dialog, [role="dialog"]')) add(item,'Accessibility/usability','Verify dialog focus and dismissal','Opening moves focus appropriately; modal focus is contained; supported dismissal restores focus to the initiating control.');
      if (tag === 'FORM') {
        manual(item,'Workflow','Verify valid form submission and saved data','A valid authorized submission produces the documented result once; saved/reopened values match the accepted data.','Complete valid dataset','High');
        add(item,'Validation','Verify form with invalid or missing required input','The form does not report successful acceptance while required/declared constraints are violated; errors identify affected fields.','Missing required fields and invalid declared formats','High');
        manual(item,'Error handling','Verify failed submission and safe retry','A controlled server/network failure is visible and retry follows the documented behavior without duplicate records.','Controlled failed response then recovery','High');
      }
    }
    const pageChecks = [
      ['Smoke/Sanity','Verify page loads and key controls are available','The authorized page loads with the intended title/content and its primary controls are usable.','Normal authorized session','High'],
      ['UI/UX','Verify responsive layout and readable content','At supported viewport sizes content remains legible, controls do not overlap, and essential actions remain reachable.','Supported desktop/mobile viewport sizes','Medium'],
      ['Accessibility/usability','Verify page keyboard order, headings and error announcements','Focus order follows the task; headings organize content; validation/status changes are communicated accessibly.','Keyboard and supported assistive technology','High'],
      ['Session handling','Verify session expiry during editing','Expiry follows the documented timeout; protected actions are blocked and reauthentication/unsaved edits are handled as specified.','Documented timeout; controlled expired session','High'],
      ['Session handling','Verify logout and browser Back behavior','Protected pages/actions remain inaccessible after logout, including after Back or refresh.','Authenticated test account then logout','High'],
      ['Session handling','Verify concurrent-session policy','Multiple sessions behave according to the documented allow/deny/invalidation policy.','Two authorized test sessions','Medium'],
      ['Permission/role-based','Verify role-based visibility and direct access','Each documented role can perform only allowed actions; changing the URL or hiding/showing UI does not bypass server authorization.','Documented role matrix','High'],
      ['Security','Verify untrusted input is rendered safely','Approved harmless security test strings are treated according to the output context and do not execute as code.','Approved non-destructive security fixtures','High'],
      ['Security','Verify protected state-changing request authorization','Where applicable, state-changing operations enforce documented authorization and request-forgery protections.','Approved security test environment','High'],
      ['Integration','Verify dependent service success, failure and recovery','Dependent services produce the documented UI states for success, empty results, errors and recovery.','Controlled service response fixtures','High'],
      ['Database/API validation','Verify request, response and persisted record consistency','Observed requests and saved records match the approved API/database contract; validation is enforced server-side.','Approved contract, test account and authorized data access','High'],
      ['Database/API validation','Verify duplicate record and concurrent update handling','Duplicate identities and conflicting updates follow documented uniqueness/concurrency rules without silent data loss.','Duplicate keys and two controlled updates','High'],
      ['Workflow','Verify audit/history for supported changes','Where auditing is required, approved create/update/delete actions record the expected actor, time and change details.','Approved test record; audit access','Medium'],
      ['Error handling','Verify offline, slow-network and recovery states','The application communicates pending/failure states without false success, uncontrolled retries or loss contrary to requirements.','Controlled offline/slow/recovered connection','High'],
      ['Regression','Verify supported browsers and repeated workflow execution','Core workflows remain consistent across the documented browser matrix and repeated runs.','Supported browsers; fresh and existing test data','High'],
      ['End-to-end','Verify complete documented user journey','The journey from entry through validated data entry, navigation, submission and confirmation completes with correct persisted state.','Approved end-to-end workflow and expected outcomes','High']
      ,['Performance','Verify initial page load performance','The page reaches the documented usable state within the agreed performance budget without blocking essential controls.','Performance budget and representative network profile','Medium']
      ,['Performance','Verify repeated scan does not degrade the page','Repeated scans do not duplicate overlays/listeners, leak memory or progressively slow the page.','Run scan 10 times','Medium']
      ,['Error handling','Verify retry does not duplicate records or requests','Retrying a failed operation produces one consistent result and does not create duplicate data.','Controlled failed request then retry','High']
      ,['Navigation','Verify refresh preserves or safely resets state','Refreshing at each workflow step follows documented state persistence and does not leave stale or misleading values.','Refresh at each step','Medium']
      ,['Compatibility','Verify zoom and high-DPI rendering','At supported zoom/DPI settings text, controls, dialogs and reports remain usable without clipping.','80%, 100%, 125%, 200% zoom','Medium']
      ,['Accessibility/usability','Verify reduced-motion and high-contrast behavior','The page remains understandable and usable when reduced motion or high-contrast preferences are enabled.','Browser accessibility preferences','Medium']
      ,['Security','Verify sensitive values are not exposed in downloads','Reports, exports, screenshots and generated scripts do not contain real passwords, OTPs, tokens or personal secrets.','Synthetic secret markers','High']
      ,['Integration','Verify browser back/forward does not duplicate actions','History navigation restores the correct state without repeating submissions or destructive operations.','Controlled multi-step workflow','High']
      ,['Boundary value','Verify maximum supported DOM size','Large forms/pages remain responsive and report coverage limits clearly without freezing the tab.','Representative large DOM','Medium']
      ,['Smoke/Sanity','Verify extension reload recovery','Reloading the extension does not corrupt stored mappings/files and reports a recoverable state.','Reload extension during idle and active page','High']
    ];
    for (const [category, scenario, expected, data, priority] of pageChecks) manual(null,category,scenario,expected,data,priority,'Manual checklist: confirm applicability from SRS/API/role/session requirements; mark N/A where unsupported.');
    if (coverage.inaccessibleFrames) coverage.warnings.push(`${coverage.inaccessibleFrames} iframe(s) could not be inspected; open those pages separately to generate their cases.`);
    if (coverage.truncated) coverage.warnings.push(`Scan limited to ${MAX_ELEMENTS} DOM elements and nesting depth ${MAX_DEPTH}; coverage is incomplete.`);
    coverage.warnings.push('These are test cases to run, not results: the "Actual result" column stays empty until a tester runs them.');
    coverage.warnings.push('Only what is visible on this page now is covered. Generate again on each page or step (for example after opening a pop-up or the next step), and check business rules with the requirement.');
    for (const tc of cases) coverage.categories[tc.category] = (coverage.categories[tc.category] || 0) + 1;
    coverage.generated = cases.length;
    coverage.observedCases = cases.filter(c => c.basis === 'Observed DOM').length;
    coverage.confirmationCases = cases.length - coverage.observedCases;
    return { schemaVersion: 2, pageUrl: mainUrl, generatedAt: new Date().toISOString(), cases, coverage };
  }
  root.SFFATestCases = { generateReport, generate: detected => generateReport(detected).cases };
})(window);
