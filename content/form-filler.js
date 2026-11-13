
(function (root) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  ).set;
  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype, 'value'
  ).set;
  const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'checked'
  ).set;

  /** Reads the current value or checked state used to verify a fill operation. */
  function readBack(el) {
    return el.isContentEditable || el.getAttribute('contenteditable') === 'true'
      || el.getAttribute('contenteditable') === '' ? el.textContent : el.value;
  }

  /** Checks whether the element is connected, enabled, and editable under the supplied options. */
  function canEdit(el, options = {}) {
    if (!el || !el.isConnected) return false;
    return !!options.allowNonEditable || (!el.matches(':disabled') && !el.readOnly && el.getAttribute('aria-disabled') !== 'true');
  }

  /** Creates an event of the requested type from the element's own window. */
  function createEventForElement(el, type) {
    const EventConstructor = el.ownerDocument?.defaultView?.Event || Event;
    return new EventConstructor(type, { bubbles: true });
  }

  /** Focuses a control without scrolling when the browser supports that focus option. */
  function focusElement(el) {
    if (el.ownerDocument?.activeElement === el) return;
    try { el.focus({ preventScroll: true }); }
    catch { try { el.focus(); } catch  { /* Best-effort fallback: failure is intentionally non-fatal. */ } }
  }

  /** Sets an input or textarea value through its native setter and dispatches edit events. */
  function setNativeValue(el, value, options = {}) {
    if (!canEdit(el, options)) return false;
    value = String(value);
    const contentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';
    const ownerWindow = el.ownerDocument?.defaultView || window;
    const setterPrototype = el.tagName === 'TEXTAREA' ? ownerWindow.HTMLTextAreaElement?.prototype : ownerWindow.HTMLInputElement?.prototype;
    const setter = Object.getOwnPropertyDescriptor(setterPrototype || {}, 'value')?.set
      || (el.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter);
    focusElement(el);
    /** Applies the selected text value through the element's native setter. */
    const write = () => {
      if (contentEditable) {
        el.textContent = value;
      } else if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(createEventForElement(el, 'input'));
      el.dispatchEvent(createEventForElement(el, 'change'));
      el.dispatchEvent(createEventForElement(el, 'blur'));
    };
    write();
    if (readBack(el) !== value) {
      write();
    }
    return el.isConnected && readBack(el) === value;
  }

  /** Selects matching options and dispatches events; reports selected values and success. */
  function setNativeSelectValue(selectEl, value, options = {}) {
    if (!canEdit(selectEl, options)) return false;
    value = String(value);
    if (!Array.from(selectEl.options).some(o => o.value === value && (options.allowPlaceholder || !looksLikePlaceholderOption(o)))) return false;
    const ownerWindow = selectEl.ownerDocument?.defaultView || window;
    const setter = Object.getOwnPropertyDescriptor(ownerWindow.HTMLSelectElement?.prototype || {}, 'value')?.set
      || nativeSelectValueSetter;
    focusElement(selectEl);
    /** Applies the selected option values through the native select setter. */
    const write = () => {
      if (setter) {
        setter.call(selectEl, value);
      } else {
        selectEl.value = value;
      }
      selectEl.dispatchEvent(createEventForElement(selectEl, 'input'));
      selectEl.dispatchEvent(createEventForElement(selectEl, 'change'));
      selectEl.dispatchEvent(createEventForElement(selectEl, 'blur'));
    };
    write();
    if (selectEl.value !== value) {
      write();
    }
    return selectEl.isConnected && selectEl.value === value;
  }

  /** Updates a checkbox/radio through its native checked setter and dispatches events. */
  function setNativeChecked(el, checked) {
    if (!canEdit(el)) return false;
    if (el.checked !== checked) el.click();
    return el.isConnected && el.checked === checked;
  }

  /** Applies a checked state when needed and returns whether the requested state was reached. */
  function setNativeCheckedState(el, checked, options = {}) {
    if (!canEdit(el, options)) return false;
    if (el.checked === checked) return true;
    focusElement(el);
    const ownerWindow = el.ownerDocument?.defaultView || window;
    const checkedSetter = Object.getOwnPropertyDescriptor(ownerWindow.HTMLInputElement?.prototype || {}, 'checked')?.set
      || nativeCheckedSetter;
    if (checkedSetter) checkedSetter.call(el, checked);
    else el.checked = checked;
    el.dispatchEvent(createEventForElement(el, 'input'));
    el.dispatchEvent(createEventForElement(el, 'change'));
    el.dispatchEvent(createEventForElement(el, 'blur'));
    return el.isConnected && el.checked === checked;
  }

  /** Resolves after the specified delay. */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Truncates a string to an input's positive maxLength when one is set. */
  function clampToMaxLength(el, value) {
    const max = el.maxLength;
    if (typeof max === 'number' && max > 0 && value.length > max) {
      return value.slice(0, max);
    }
    return value;
  }

  const DATE_INPUT_TYPES = ['date', 'month', 'week', 'datetime-local'];
  /** Checks whether the element's type or metadata indicates a date field. */
  function isDateLikeInput(el) {
    return el.tagName === 'INPUT' && DATE_INPUT_TYPES.includes((el.type || '').toLowerCase());
  }

  /** Converts a valid ISO calendar date into the input[type=week] year-week format. */
  function isoToWeekString(isoDateStr) {
    const d = new Date(`${isoDateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    const target = new Date(d.valueOf());
    const dayNr = (d.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(
      ((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /** Sets supported native date-like controls from an ISO date and dispatches edit events. */
  function setNativeDateValue(el, isoDateStr) {
    if (!isoDateStr) return false;
    const type = (el.type || '').toLowerCase();
    let value = isoDateStr;
    try {
      if (type === 'month') value = isoDateStr.slice(0, 7);
      else if (type === 'week') value = isoToWeekString(isoDateStr);
      else if (type === 'datetime-local') value = `${isoDateStr}T00:00`;
      if (el.min && value < el.min) value = el.min;
      if (el.max && value > el.max) value = el.max;
      return setNativeValue(el, value);
    } catch (e) {
      return false;
    }
  }

  /** Polls a predicate until truthy or timeout, returning false when the deadline expires. */
  async function waitFor(predicate, timeout = 3000, interval = 150) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = predicate();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  const GENERIC_RESPONSE_FALLBACK = [
    'Filled with test data for QA verification purposes.',
    'Sample response entered for testing this field.',
    'Test entry - please disregard.',
    'Placeholder response generated for form-testing purposes.'
  ];

  /** Selects a pool value by occurrence index while cycling through the available entries. */
  function uniquePoolValue(pool, n) {
    return pool[n % pool.length];
  }

  const SELECT_FILL_GAP_MS = 60;

  /** Checks whether a value matches the YYYY-MM-DD date shape. */
  function looksIsoDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  /** Rearranges an ISO date into a recognized placeholder mask, or returns the input unchanged. */
  function formatMaskedDate(isoDateStr, maskFormat) {
    if (!isoDateStr || !maskFormat) return isoDateStr;
    let [yyyy, mm, dd] = isoDateStr.split('-');
    if (!yyyy || !mm || !dd) return isoDateStr;
    // No real format hint: day = month, so the date reads the same as DD/MM and MM/DD.
    if (maskFormat.assumed) dd = mm;
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1] || mm;
    const map = { dd, mm, yyyy, yy: yyyy.slice(2), mon, 'dd,': `${dd},` };
    return maskFormat.tokens.map(t => map[t] ?? t).join(maskFormat.separator);
  }

  const EYE_CLASS_HINT = /\beye\b|eye-off|eye-slash|eye-invisible|show-password|hide-password|toggle-password|toggle-visibility|reveal-value|unmask/i;
  const EYE_ARIA_HINT = /show|reveal|unmask|view (password|number|value|details)/i;
  const VISIBILITY_TESTID_HINT = /visibility(-|_)?(off)?icon?$/i;
  const EYE_TEXT_HINT = /^(show|hide|view|reveal)$/i;
  const EYE_EMOJI = '👁';

  /** Heuristically recognizes a nearby control that toggles password visibility. */
  function elementLooksLikeEyeToggle(c) {
    const cls = (typeof c.className === 'string' ? c.className : (c.className && c.className.baseVal)) || '';
    const aria = (c.getAttribute && c.getAttribute('aria-label')) || '';
    const title = (c.getAttribute && c.getAttribute('title')) || '';
    const testAttr = (c.getAttribute && (c.getAttribute('data-testid') || c.getAttribute('data-test') || c.getAttribute('data-icon'))) || '';
    const text = (c.textContent || '').trim();
    if (EYE_CLASS_HINT.test(cls) || EYE_ARIA_HINT.test(`${aria} ${title}`)) return true;
    if (VISIBILITY_TESTID_HINT.test(testAttr)) return true;
    if (text.includes(EYE_EMOJI)) return true;
    if (text.length <= 6 && EYE_TEXT_HINT.test(text)) return true;
    return false;
  }

  const FIELD_CONTROL_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';

  /** True when a field's characters are hidden (password type or bullet-masked value). */
  function isMaskedField(el) {
    return !!el && (String(el.type).toLowerCase() === 'password' || /[•●*]{2,}/.test(el.value || ''));
  }

  /** True when `scope` holds a fillable field other than `el` (its toggle could belong to that field). */
  function scopeHasOtherField(scope, el) {
    for (const candidate of scope.querySelectorAll(FIELD_CONTROL_SELECTOR)) if (candidate !== el) return true;
    return false;
  }

  /** Searches the field's own container for a likely password-visibility toggle. */
  function findNearbyVisibilityToggle(el) {
    if (!el) return null;
    let scope = el.parentElement;
    for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
      // Never look in a container shared with another field: the toggle there may be that field's.
      if (depth > 0 && scopeHasOtherField(scope, el)) break;
      const candidates = scope.querySelectorAll('button, [role="button"], svg, i, span, a, input[type="checkbox"]');
      for (const c of candidates) {
        if (c === el || c.contains(el)) continue;
        if (elementLooksLikeEyeToggle(c)) {
          return c.closest('button, [role="button"], a, input[type="checkbox"]') || c;
        }
      }
      if (scope.tagName === 'FORM' || scope.tagName === 'BODY') break;
    }
    return null;
  }

  /** Temporarily activates a detected visibility toggle before filling a masked field. */
  async function revealMaskedFieldIfNeeded(element, log) {
    // Only masked fields need revealing; skipping the search for ordinary fields is also what keeps
    // large forms fast (it used to scan every icon in the form once per field).
    if (!isMaskedField(element)) return element;
    const toggle = findNearbyVisibilityToggle(element);
    if (!toggle) return element;

    const toggleCls = (typeof toggle.className === 'string' ? toggle.className : (toggle.className && toggle.className.baseVal)) || '';
    const toggleTestId = (toggle.getAttribute && (toggle.getAttribute('data-testid') || toggle.getAttribute('data-icon'))) || '';
    const ariaPressed = (toggle.getAttribute('aria-pressed') || toggle.getAttribute('aria-checked') || '').toLowerCase();
    const looksCurrentlyHidden =
      element.type === 'password' ||
      element.disabled ||
      element.readOnly ||
      /eye-off|eye-slash|eye-invisible|hidden|masked/i.test(toggleCls) ||
      /off$/i.test(toggleTestId) ||
      ariaPressed === 'false' ||
      (toggle.tagName === 'INPUT' && toggle.type === 'checkbox' && !toggle.checked) ||
      /[•●*]{2,}/.test(element.value || '');

    if (!looksCurrentlyHidden) return element;

    try {
      toggle.click();
      log('👁 Clicked a visibility toggle to reveal a masked field before filling', 'info');
      await sleep(250);
    } catch (e) {
      log(`⚠ Found a visibility toggle near a masked field but clicking it failed: ${e.message}`, 'warn');
      return element;
    }

    if (!element.isConnected) {
      const container = toggle.closest('div, label, fieldset, li') || toggle.parentElement;
      const fresh = container && container.querySelector('input, textarea');
      if (fresh) return fresh;
    }
    return element;
  }

  /** Adjusts a proposed string for the element's length, range, and pattern constraints. */
  function constrainValue(el, value) {
    if (el.type !== 'number') return value;
    let number = Number(value);
    const min = el.min !== '' && Number.isFinite(Number(el.min)) ? Number(el.min) : -Infinity;
    const max = el.max !== '' && Number.isFinite(Number(el.max)) ? Number(el.max) : Infinity;
    if (!Number.isFinite(number)) number = Number.isFinite(min) ? min : 1;
    number = Math.max(min, Math.min(max, number));
    const step = el.step === 'any' ? 0 : (Number(el.step) > 0 ? Number(el.step) : 1);
    if (step) {
      const base = Number.isFinite(min) ? min : Number(el.getAttribute('value') || 0);
      number = base + Math.round((number - base) / step) * step;
      if (number > max) number -= step;
      if (number < min) number += step;
      number = Number(number.toFixed(10));
    }
    return String(number);
  }

  /**
   * A value in the format of a sample shown in the placeholder or hint, e.g. "e.g. EMP-1234" →
   * "EMP-5821", "Format: AB12CD3456" → "AB47CD9012". Letters stay, digits change. Null when there is none.
   */
  function valueFromPlaceholderSample(el) {
    const hint = `${el?.placeholder || ''} ${el?.getAttribute?.('aria-label') || ''}`;
    const match = hint.match(/(?:e\.?g\.?|eg|example|for example|format|like|sample)\s*[:.-]?\s*([A-Za-z0-9][A-Za-z0-9/_.-]{2,30})/i)
      || (/^[A-Z]{1,6}[-/]?\d{2,}[A-Z0-9-]*$/.test((el?.placeholder || '').trim()) ? [null, el.placeholder.trim()] : null);
    if (!match) return null;
    const sample = match[1].replace(/[.,;]+$/, '');
    if (!/\d/.test(sample)) return null; // a word, not a code
    return sample.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));
  }

  /**
   * Types `text` one key at a time (keydown → keypress → value → input → keyup), for masked boxes
   * that ignore values not typed by a person. Returns true when the box ends up with a value.
   */
  async function typeLikeKeys(el, text) {
    if (!canEdit(el)) return false;
    const w = el.ownerDocument?.defaultView || window;
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement?.prototype || {}, 'value')?.set;
    focusElement(el);
    setter ? setter.call(el, '') : (el.value = '');
    for (const ch of String(text)) {
      const before = el.value;
      const keyInit = { key: ch, code: /\d/.test(ch) ? `Digit${ch}` : `Key${ch.toUpperCase()}`, bubbles: true, cancelable: true, composed: true };
      const down = el.dispatchEvent(new w.KeyboardEvent('keydown', keyInit));
      if (down) el.dispatchEvent(new w.KeyboardEvent('keypress', keyInit));
      // The mask handled the key itself, or the key was refused: do not add it again.
      if (down && el.value === before) {
        setter ? setter.call(el, before + ch) : (el.value = before + ch);
        el.dispatchEvent(new w.InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true, composed: true }));
      }
      el.dispatchEvent(new w.KeyboardEvent('keyup', keyInit));
      await sleep(10);
    }
    el.dispatchEvent(createEventForElement(el, 'change'));
    el.dispatchEvent(createEventForElement(el, 'blur'));
    return !!el.value;
  }

  /** Returns the usable suggestions of an input's <datalist> (non-empty, enabled, unique), or []. */
  function datalistValues(el) {
    const list = el?.list;
    if (!list || !list.options) return [];
    const values = [];
    for (const option of Array.from(list.options)) {
      const value = String(option.value ?? '').trim();
      if (value && !option.disabled && !values.includes(value)) values.push(value);
    }
    return values;
  }

  /** True when the element's own constraints reject its current value (empty/required is ignored). */
  function violatesConstraints(el) {
    const v = el.validity;
    if (!v) return false;
    return !!(v.patternMismatch || v.tooLong || v.tooShort || v.rangeOverflow || v.rangeUnderflow || v.stepMismatch || v.typeMismatch || v.badInput);
  }

  /**
   * Fills an input that has a <datalist> with one of its suggested options, the realistic choice
   * for fields such as city, country or product. Options the field itself would reject are skipped,
   * and repeated fields with the same list get different options. Returns a fill result, or null
   * when no option fits (the caller then uses its normal value).
   */
  function fillFromDatalist(field, log, cycleCounters) {
    const el = field.element;
    if (!el || el.tagName !== 'INPUT' || el.type === 'file') return null;
    const values = datalistValues(el);
    if (!values.length) return null;
    const key = `__datalist:${el.list.id || ''}`;
    const start = (cycleCounters[key] = (cycleCounters[key] || 0));
    cycleCounters[key]++;
    for (let i = 0; i < values.length; i++) {
      const value = values[(start + i) % values.length];
      const ok = isDateLikeInput(el) ? setNativeDateValue(el, value) : setNativeValue(el, value);
      if (ok && !violatesConstraints(el)) {
        log(`✓ Filled "${field.type || 'suggestion'}" with a suggested option from its list`, 'success');
        return { filled: true, type: field.type || 'datalist' };
      }
    }
    log(`⚠ None of the ${values.length} suggested option(s) fit this field's rules; using generated data instead`, 'warn');
    return null;
  }

  /** Chooses and writes a value for a detected text-like field, returning a fill result. */
  function fillTextField(field, testData, log, cycleCounters) {
    const { element, type, dateFormat } = field;
    const dateLike = isDateLikeInput(element);

    if (type && testData[type] !== undefined) {
      try {
        let value = testData[type];
        if (Array.isArray(value)) {
          const n = (cycleCounters[type] = (cycleCounters[type] || 0));
          cycleCounters[type]++;
          value = uniquePoolValue(value, n);
        }
        if (dateLike) {
          const ok = setNativeDateValue(element, String(value));
          if (!ok) {
            log(`⚠ Could not set date field ("${type}") - the site rejected the value/format`, 'warn');
            return { filled: false };
          }
          return { filled: true, type };
        }
        if (dateFormat && looksIsoDate(value)) {
          value = formatMaskedDate(value, dateFormat);
        }
        const ok = setNativeValue(element, constrainValue(element, clampToMaxLength(element, String(value))));
        if (!ok) {
          log(`⚠ "${type}" was written but the page reverted/rejected it - left unfilled rather than reporting a false success`, 'warn');
          return { filled: false };
        }
        return { filled: true, type };
      } catch (e) {
        log(`Could not fill field (${type}): ${e.message}`, 'warn');
        return { filled: false };
      }
    }

    if (!dateLike && dateFormat) {
      try {
        const fallbackIso = testData.genericDate || new Date().toISOString().slice(0, 10);
        const ok = setNativeValue(element, clampToMaxLength(element, formatMaskedDate(fallbackIso, dateFormat)));
        if (ok) return { filled: true, type: type || 'genericDate' };
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }

    if (dateLike) {
      try {
        const fallbackIso = testData.genericDate || new Date().toISOString().slice(0, 10);
        if (setNativeDateValue(element, fallbackIso)) {
          return { filled: true, type: type || 'genericDate' };
        }
      } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      log('⚠ Could not fill unclassified date field', 'warn');
      return { filled: false };
    }

    try {
      const n = (cycleCounters.__generic = (cycleCounters.__generic || 0));
      cycleCounters.__generic++;
      // A sample in the placeholder ("e.g. EMP-1234") shows the expected format: follow it.
      const value = valueFromPlaceholderSample(element) || uniquePoolValue(GENERIC_RESPONSE_FALLBACK, n);
      const ok = setNativeValue(element, constrainValue(element, clampToMaxLength(element, value)));
      if (!ok) {
        log('⚠ Unclassified field was written but the page reverted/rejected it', 'warn');
        return { filled: false };
      }
      return { filled: true, type: type || 'generic' };
    } catch (e) {
      log(`Could not fill unclassified field: ${e.message}`, 'warn');
      return { filled: false };
    }
  }

  /** Resolves an imported project value by field name, id, accessible label, or type. */
  function resolveFieldTestData(field, testData, settings) {
    const imported = settings?.importedTestData;
    // A box labelled Aadhaar is an "identity number"; give it a real 12-digit Aadhaar, not a random ID kind.
    if (field.type === 'identityNumber' && testData?.aadhaarNumber && field.element) {
      const el = field.element;
      const text = `${el.name || ''} ${el.id || ''} ${el.getAttribute?.('aria-label') || ''} ${el.placeholder || ''} ${Array.from(el.labels || []).map(l => l.textContent).join(' ')}`;
      if (/aadh?aa?r/i.test(text)) testData = { ...testData, identityNumber: testData.aadhaarNumber };
    }
    if (!imported || typeof imported !== 'object') return testData;
    const element = field.element;
    const keys = [element?.name, element?.id, root.SFFASelectorEngine?.accessibleName(element),
      Array.from(element?.labels || []).map(label => label.textContent).join(' '), field.type]
      .filter(Boolean).map(value => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const normalized = new Map(Object.entries(imported).map(([key, value]) => [String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
    for (const key of keys) if (normalized.has(key)) return field.type ? { ...testData, [field.type]: normalized.get(key) } : testData;
    return testData;
  }

  /** Selects the option best matching a desired value and dispatches select change events. */
  function selectDropdownOption(selectEl, desiredValue) {
    if (desiredValue === undefined || desiredValue === null || desiredValue === '') return false;
    const target = String(desiredValue).toLowerCase();
    const options = Array.from(selectEl.options).filter(o => !looksLikePlaceholderOption(o));
    let match = options.find(o => o.text.trim().toLowerCase() === target)
      || options.find(o => o.value.trim().toLowerCase() === target)
      || options.find(o => o.text.trim().toLowerCase().includes(target))
      || null;
    if (!match) return false;
    return setNativeSelectValue(selectEl, match.value);
  }

  /** Selects a non-placeholder option, varying the choice by its occurrence index. */
  function selectVariedRealOption(selectEl, occurrenceIndex) {
    const real = Array.from(selectEl.options).filter(o => !looksLikePlaceholderOption(o));
    if (real.length < 2) return false;
    const choice = real[occurrenceIndex % real.length];
    return setNativeSelectValue(selectEl, choice.value);
  }

  /** Checks whether an option appears to be a prompt or empty placeholder. */
  function looksLikePlaceholderOption(o) {
    const t = o.text.trim();
    // The first option saying "select / choose / pick …" (e.g. "Open this select menu") is a prompt, not a choice.
    const firstPrompt = o.index === 0 && /\b(select|choose|pick)\b/i.test(t) && t.split(/\s+/).length <= 6;
    return o.disabled || o.hidden || o.parentElement?.disabled || o.value.trim() === '' || firstPrompt
      || !t || /^(?:[-—–]+(?:\s|$)|(?:please\s+)?(?:select|choose)(?:\s|$)|loading(?:\s|\.|$))/i.test(t);
  }

  /** Detects select controls whose options indicate that dependent data is still loading. */
  function isSelectNotReadyYet(selectEl) {
    return !canEdit(selectEl) || selectEl.getAttribute('aria-busy') === 'true' || !Array.from(selectEl.options).some(o => !looksLikePlaceholderOption(o));
  }

  /** Serializes option values and labels to detect changes in a select's option list. */
  function getOptionsSignature(selectEl) {
    return Array.from(selectEl.options).map(o => `${o.value}::${o.text}`).join('|');
  }

  /** Waits for a dependent select's options signature to change before timeout. */
  async function waitUntilSelectReady(selectEl, initialSignature, timeout = 6000) {
    let waited = false;
    if (isSelectNotReadyYet(selectEl)) {
      await waitFor(() => !isSelectNotReadyYet(selectEl), timeout);
      await sleep(150);
      waited = true;
    }
    if (initialSignature !== undefined && getOptionsSignature(selectEl) === initialSignature) {
      const changed = await waitFor(() => getOptionsSignature(selectEl) !== initialSignature, 1200, 120);
      if (changed) {
        await sleep(150);
        waited = true;
      }
    }
    return waited;
  }

  /** Waits for custom dropdown options to appear or become available. */
  async function waitUntilCustomDropdownReady(el, timeout = 6000) {
    if (isCustomDropdownEnabled(el)) return false;
    await waitFor(() => isCustomDropdownEnabled(el), timeout);
    await sleep(200);
    return true;
  }

  /** Selects the enabled non-placeholder option with the largest numeric value. */
  function selectMaxNumericOption(selectEl) {
    const options = Array.from(selectEl.options).filter(o => !looksLikePlaceholderOption(o));
    let best = null;
    let bestVal = -Infinity;
    for (const o of options) {
      const n = parseFloat(o.text.trim());
      if (!Number.isNaN(n) && n > bestVal) {
        bestVal = n;
        best = o;
      }
    }
    if (!best) return false;
    return setNativeSelectValue(selectEl, best.value);
  }

  /** Selects and returns the first enabled option that is not a placeholder. */
  function selectFirstRealOption(selectEl) {
    const options = Array.from(selectEl.options).filter(o => !looksLikePlaceholderOption(o));
    const real = options.find(o => !looksLikePlaceholderOption(o));
    if (!real) return false;
    return setNativeSelectValue(selectEl, real.value);
  }

  /** Groups location-related native selects into an ordered dependency chain. */
  function findLocationChain(selects) {
    for (let j = 0; j < selects.length; j++) {
      if (selects[j].type !== 'district' || j === 0) continue;
      const stateIdx = j - 1;
      const cityIdx = (j + 1 < selects.length && selects[j + 1].type === 'city') ? j + 1 : -1;
      return { stateIdx, districtIdx: j, cityIdx };
    }
    for (let i = 0; i < selects.length; i++) {
      if (selects[i].type !== 'state') continue;
      let districtIdx = -1;
      let cityIdx = -1;
      for (let j = i + 1; j < selects.length; j++) {
        if (selects[j].type === 'state') break;
        if (selects[j].type === 'district' && districtIdx === -1) { districtIdx = j; continue; }
        if (selects[j].type === 'city' && districtIdx !== -1 && cityIdx === -1) { cityIdx = j; break; }
      }
      if (districtIdx !== -1) return { stateIdx: i, districtIdx, cityIdx };
    }
    return null;
  }

  /** Fills dependent native location selects and waits for their options to refresh. */
  async function fillLocationChain(chain, selects, testData, log) {
    const result = { ok: 0, skipped: [], filledTypes: [] };
    const stateField = selects[chain.stateIdx];
    const districtField = chain.districtIdx !== -1 ? selects[chain.districtIdx] : null;
    const cityField = chain.cityIdx !== -1 ? selects[chain.cityIdx] : null;

    let stateOk = selectDropdownOption(stateField.element, testData.state);
    if (!stateOk) stateOk = selectFirstRealOption(stateField.element);
    if (stateOk) {
      result.ok++;
      result.filledTypes.push('state');
      const chosen = stateField.element.options[stateField.element.selectedIndex]?.text?.trim();
      log(`✓ State selected: ${chosen || testData.state}`, 'success');
    } else {
      result.skipped.push('state');
      log('⚠ Could not select State', 'warn');
    }

    if (stateOk && districtField) {
      const beforeSignature = getOptionsSignature(districtField.element);
      await waitFor(() => (
        !districtField.element.disabled
        && getOptionsSignature(districtField.element) !== beforeSignature
      ), 8000);
      await sleep(200);
      let districtOk = selectDropdownOption(districtField.element, testData.district);
      if (!districtOk) districtOk = selectFirstRealOption(districtField.element);
      if (districtOk) {
        result.ok++;
        result.filledTypes.push('district');
        const chosen = districtField.element.options[districtField.element.selectedIndex]?.text?.trim();
        log(`✓ District selected: ${chosen || testData.district}`, 'success');
      } else {
        result.skipped.push('district');
        log('⚠ Could not select District (options may not have loaded)', 'warn');
      }

      if (districtOk && cityField) {
        const beforeCitySignature = getOptionsSignature(cityField.element);
        await waitFor(() => (
          !cityField.element.disabled
          && getOptionsSignature(cityField.element) !== beforeCitySignature
        ), 8000);
        await sleep(200);
        let cityOk = selectDropdownOption(cityField.element, testData.city);
        if (!cityOk) cityOk = selectFirstRealOption(cityField.element);
        if (cityOk) {
          result.ok++;
          result.filledTypes.push('city');
          const chosen = cityField.element.options[cityField.element.selectedIndex]?.text?.trim();
          log(`✓ City selected: ${chosen || testData.city}`, 'success');
        } else {
          result.skipped.push('city');
          log('⚠ Could not select City (options may not have loaded)', 'warn');
        }
      } else if (cityField) {
        result.skipped.push('city');
      }
    } else if (districtField) {
      result.skipped.push('district');
      if (cityField) result.skipped.push('city');
    }

    return result;
  }

  /** Checks whether option text resembles a choose/select prompt. */
  function looksLikePlaceholderOptionText(text) {
    const t = (text || '').trim().toLowerCase();
    return !t || /^(?:[-—–]+(?:\s|$)|(?:please\s+)?(?:select|choose)(?:\s|$)|loading(?:\s|\.|$))/i.test(t);
  }

  const GENERIC_OPTION_SELECTOR = '[role="option"], [role="listitem"], li[data-value], '
    + '.dropdown-item, .select-option, [data-radix-collection-item], '
    + '.ant-select-item, .rc-select-item-option, .MuiMenuItem-root, .MuiAutocomplete-option';

  /** Checks visibility through hidden ancestors, computed styles, and rendered dimensions. */
  function isElementVisible(el) {
    if (root.SFFAFormDetector && typeof root.SFFAFormDetector.isVisible === 'function') {
      return root.SFFAFormDetector.isVisible(el);
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Resolves a custom dropdown's options container from its ARIA ownership or nearby DOM. */
  function resolveOwnedOptionsContainer(triggerEl) {
    const inner = triggerEl.querySelectorAll ? Array.from(triggerEl.querySelectorAll('[aria-controls], [aria-owns]')) : [];
    const candidates = [triggerEl, ...inner];
    for (const candidate of candidates) {
      const ref = candidate.getAttribute
        && (candidate.getAttribute('aria-controls') || candidate.getAttribute('aria-owns'));
      if (!ref) continue;
      for (const id of ref.split(/\s+/).filter(Boolean)) {
        const el = document.getElementById(id);
        if (el) return el;
      }
    }
    return null;
  }

  /** Returns candidate option elements associated with a custom dropdown trigger. */
  function resolveOwnedOptions(triggerEl) {
    const container = resolveOwnedOptionsContainer(triggerEl);
    if (!container) return null;
    if (container.matches && container.matches(GENERIC_OPTION_SELECTOR) && isElementVisible(container)) return [container];
    const opts = Array.from(container.querySelectorAll(GENERIC_OPTION_SELECTOR)).filter(isElementVisible);
    return opts.length ? opts : null;
  }

  /** Opens and fills one custom dropdown using classified data or an available option. */
  async function fillCustomDropdown(field, testData, log, occurrenceIndex) {
    const { element, type } = field;
    const target = (type && testData[type] !== undefined) ? String(testData[type]).toLowerCase() : null;
    const before = new Set(Array.from(document.querySelectorAll(GENERIC_OPTION_SELECTOR)).filter(isElementVisible));
    let usedFallbackScan = false;
    if (!isCustomDropdownEnabled(element)) return { ok: false };

    try {
      element.click();

      let optionEls = await waitFor(() => {
        const owned = resolveOwnedOptions(element);
        if (owned && owned.length) return owned;

        const now = Array.from(document.querySelectorAll(GENERIC_OPTION_SELECTOR)).filter(isElementVisible);
        const fresh = now.filter(o => !before.has(o));
        if (fresh.length) return fresh;

        return null;
      }, 1500);

      if (!optionEls) {
        element.click();
        return { ok: false, chosenText: null };
      }

      optionEls = optionEls.filter(o => !o.disabled && o.getAttribute('aria-disabled') !== 'true' && !looksLikePlaceholderOptionText(o.textContent));
      if (usedFallbackScan) {
        log(`⚠ Custom dropdown "${type || 'unlabeled'}" - no aria-controls link found to confirm which options belong to it; matched from all visible options on the page (less reliable when several dropdowns are open/rendered at once)`, 'warn');
      }

      let match = target
        ? optionEls.find(o =>
            o.textContent.trim().toLowerCase() === target
            || o.textContent.trim().toLowerCase().includes(target))
        : null;

      if (occurrenceIndex > 0) {
        const real = optionEls.filter(o => !looksLikePlaceholderOptionText(o.textContent) && o.getAttribute('aria-disabled') !== 'true');
        if (real.length) match = real[occurrenceIndex % real.length];
      }

      if (!match) {
        match = optionEls.find(o => !looksLikePlaceholderOptionText(o.textContent) && o.getAttribute('aria-disabled') !== 'true');
      }

      if (match) {
        const chosenText = match.textContent.trim();
        match.click();

        const closed = await waitFor(() => element.getAttribute('aria-expanded') !== 'true', 800, 80);
        if (!closed) {
          document.body.click();
        }
        const selected = await waitFor(() => {
          const current = element.isConnected ? element : (element.id ? document.getElementById(element.id) : null);
          return match.getAttribute('aria-selected') === 'true'
            || (current && [current.value, current.textContent].some(v => v && String(v).trim().toLowerCase().includes(chosenText.toLowerCase())));
        }, 1000, 80);
        return { ok: !!selected, chosenText };
      }

      document.body.click();
      return { ok: false, chosenText: null };
    } catch (e) {
      log(`Custom dropdown fill failed: ${e.message}`, 'warn');
      return { ok: false, chosenText: null };
    }
  }

  /** Checks whether a custom dropdown is connected and not disabled or read-only. */
  function isCustomDropdownEnabled(el) {
    if (!el || !el.isConnected || el.matches(':disabled') || el.getAttribute('aria-busy') === 'true') return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el.disabled) return false;
    if (el.classList && (
      el.classList.contains('disabled')
      || el.classList.contains('ant-select-disabled')
      || el.classList.contains('is-disabled')
      || el.classList.contains('Mui-disabled')
    )) return false;
    return true;
  }

  /** Groups custom location dropdowns into a sequence based on their labels and relationships. */
  function findCustomLocationChain(customDropdowns) {
    for (let j = 0; j < customDropdowns.length; j++) {
      if (customDropdowns[j].type !== 'district' || j === 0) continue;
      const stateIdx = j - 1;
      const cityIdx = (j + 1 < customDropdowns.length && customDropdowns[j + 1].type === 'city') ? j + 1 : -1;
      return { stateIdx, districtIdx: j, cityIdx };
    }
    for (let i = 0; i < customDropdowns.length; i++) {
      if (customDropdowns[i].type !== 'state') continue;
      let districtIdx = -1;
      let cityIdx = -1;
      for (let j = i + 1; j < customDropdowns.length; j++) {
        if (customDropdowns[j].type === 'state') break;
        if (customDropdowns[j].type === 'district' && districtIdx === -1) { districtIdx = j; continue; }
        if (customDropdowns[j].type === 'city' && districtIdx !== -1 && cityIdx === -1) { cityIdx = j; break; }
      }
      if (districtIdx !== -1) return { stateIdx: i, districtIdx, cityIdx };
    }
    return null;
  }

  /** Fills related custom location dropdowns in order, allowing dependent options to update. */
  async function fillCustomLocationChain(chain, customDropdowns, testData, log) {
    const result = { ok: 0, skipped: [], filledTypes: [] };
    const stateField = customDropdowns[chain.stateIdx];
    const districtField = chain.districtIdx !== -1 ? customDropdowns[chain.districtIdx] : null;
    const cityField = chain.cityIdx !== -1 ? customDropdowns[chain.cityIdx] : null;

    const stateResult = await fillCustomDropdown(stateField, testData, log, 0);
    if (stateResult.ok) {
      result.ok++;
      result.filledTypes.push('state');
      log(`✓ State selected: ${stateResult.chosenText || testData.state || ''}`, 'success');
    } else {
      result.skipped.push('state');
      log('⚠ Could not select State', 'warn');
    }

    if (stateResult.ok && districtField) {
      await waitFor(() => isCustomDropdownEnabled(districtField.element), 8000);
      await sleep(250);
      const districtResult = await fillCustomDropdown(districtField, testData, log, 0);
      if (districtResult.ok) {
        result.ok++;
        result.filledTypes.push('district');
        log(`✓ District selected: ${districtResult.chosenText || testData.district || ''}`, 'success');
      } else {
        result.skipped.push('district');
        log('⚠ Could not select District (options may not have loaded)', 'warn');
      }

      if (districtResult.ok && cityField) {
        await waitFor(() => isCustomDropdownEnabled(cityField.element), 8000);
        await sleep(250);
        const cityResult = await fillCustomDropdown(cityField, testData, log, 0);
        if (cityResult.ok) {
          result.ok++;
          result.filledTypes.push('city');
          log(`✓ City selected: ${cityResult.chosenText || testData.city || ''}`, 'success');
        } else {
          result.skipped.push('city');
          log('⚠ Could not select City (options may not have loaded)', 'warn');
        }
      } else if (cityField) {
        result.skipped.push('city');
      }
    } else if (districtField) {
      result.skipped.push('district');
      if (cityField) result.skipped.push('city');
    }

    return result;
  }

  /** Selects one enabled radio in a group and returns a result describing the choice. */
  function fillRadioGroup(group, testData, log) {
    const { type, options } = group;
    const target = testData[type] !== undefined ? String(testData[type]).toLowerCase() : null;
    let toCheck = null;
    if (target) {
      toCheck = options.find(o => {
        const label = (o.value + ' ' + (o.labels?.[0]?.textContent || '')).toLowerCase();
        return label.includes(target);
      });
    }
    if (!toCheck) {
      toCheck = options.find(o => canEdit(o)) || null;
    }
    if (toCheck) {
      return el_checked_or_set(toCheck);
    }
    return false;
  }

  /** Returns the control's checked state, including supported ARIA checkbox states. */
  function el_checked_or_set(el) {
    if (el.checked) return true;
    return setNativeChecked(el, true);
  }

  /** Checks an eligible checkbox or ARIA toggle and reports whether it changed. */
  const CONSENT_RE = /agree|consent|accept|terms|confirm|declar|certif|acknowledg|authori[sz]|undertak|i understand|i hereby|attest|privacy policy|correct and accurate/;
  // Boxes that turn something off or do something drastic are never ticked automatically.
  const OPT_OUT_RE = /\b(do not|don't|dont|opt[- ]?out|unsubscribe|delete|remove|deactivate|close (my )?account)\b/;

  /** Text that describes a checkbox: its labels, ARIA name, or the text right next to it. */
  function checkboxLabelText(el) {
    const parts = [el.getAttribute('aria-label'), el.getAttribute('title')];
    const labels = new Set(Array.from(el.labels || []));
    const wrapping = el.closest('label');
    if (wrapping) labels.add(wrapping);
    for (const label of labels) parts.push(label.textContent);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) labelledBy.split(/\s+/).forEach(id => parts.push(el.ownerDocument.getElementById(id)?.textContent));
    if (!wrapping && !(el.labels && el.labels.length)) {
      // Unlabelled box: use the text of the nearest container that holds only this control.
      for (let node = el.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        if (node.querySelectorAll('input, select, textarea, button').length > 1) break;
        const text = (node.textContent || '').trim();
        if (text) { parts.push(text.slice(0, 400)); break; }
      }
    }
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Label text plus id/name, used to decide whether a box is a consent box. */
  function checkboxContext(el) {
    return `${el.id || ''} ${el.name || ''} ${checkboxLabelText(el)}`.toLowerCase();
  }

  /** Short readable name of a checkbox for the activity log. */
  function checkboxName(el) {
    const text = checkboxLabelText(el) || el.name || el.id || '';
    return text.length > 70 ? `${text.slice(0, 67)}…` : text || 'checkbox';
  }

  /**
   * Ticks a checkbox the form needs: required boxes and consent / declaration boxes
   * ("I agree", "I hereby certify…", "I consent…"). Optional preference boxes are left as they are,
   * and opt-out boxes ("do not contact me", "delete…") are never ticked. Returns
   * 'checked' | 'already' | 'optional' | 'failed'.
   */
  function fillCheckbox(checkboxField, log = () => {}) {
    const el = checkboxField.element;
    if (el.checked) return 'already';
    const context = checkboxContext(el);
    const looksLikeConsent = CONSENT_RE.test(context) && !OPT_OUT_RE.test(context);
    if (!el.required && !looksLikeConsent) return 'optional';
    if (el_checked_or_set(el)) {
      log(`✓ Ticked ${el.required ? 'required' : 'consent'} checkbox "${checkboxName(el)}"`, 'success');
      return 'checked';
    }
    log(`⚠ Could not tick checkbox "${checkboxName(el)}" — the page did not accept the click`, 'warn');
    return 'failed';
  }

  const FILE_UPLOAD_GAP_MS = 900;

  const UPLOAD_BUSY_WAIT_MS = 30000;

  /** Upload boxes that are disabled right now (many sites lock them until the current upload ends). */
  function lockedFileInputs() {
    const inputs = root.SFFADeepDOM?.queryAll('input[type="file"]') || Array.from(document.querySelectorAll('input[type="file"]'));
    return new Set(inputs.filter(el => el.isConnected && el.matches(':disabled')));
  }

  /**
   * Waits (up to 30 s) while `isLocked()` is true. Returns true when it ended in time.
   * Stops early when the run is cancelled.
   */
  async function waitForUploadUnlock(isLocked, checkCancelled) {
    const start = Date.now();
    while (Date.now() - start < UPLOAD_BUSY_WAIT_MS) {
      checkCancelled();
      if (!isLocked()) return true;
      await sleep(250);
    }
    return !isLocked();
  }

  /** Converts an internal upload category into a display label. */
  function friendlyFileTypeLabel(type) {
    if (!type) return 'unknown file field';
    const defs = root.SFFAFileTypes && root.SFFAFileTypes.FILE_TYPE_DEFINITIONS;
    const match = defs && defs.find(d => d.type === type);
    if (match) return match.label;
    return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  }

  /**
   * Finds a file input of the requested category after the page re-drew the old one. Inputs this fill
   * already used, or that already hold a file, are skipped: on pages with many boxes of one kind the
   * first box would otherwise get every file.
   */
  function findFreshFileInputByType(desiredType, touched) {
    if (!desiredType || !root.SFFAFormDetector || !root.SFFAFormDetector.classifyField) return null;
    const keywordMap = root.SFFAFormDetector.FILE_KEYWORDS || {};
    const candidates = (root.SFFADeepDOM?.queryAll('input[type="file"]') || Array.from(document.querySelectorAll('input[type="file"]')))
      .filter(el => el.isConnected && !el.matches(':disabled') && !touched?.has(el) && !el.files?.length);
    for (const el of candidates) {
      const classification = root.SFFAFormDetector.classifyField(el, keywordMap);
      if (classification && classification.type === desiredType) return el;
    }
    return null;
  }

  /** The page's file input that a "Browse Files" button uses: the nearest one walking up from it. */
  function nearestSharedFileInput(trigger) {
    const usable = (root.SFFADeepDOM?.queryAll('input[type="file"]') || Array.from(document.querySelectorAll('input[type="file"]')))
      .filter(el => el.isConnected && !el.matches(':disabled')
        && !el.closest('label, button, [role="button"]')?.matches?.('[aria-label*="eplace" i], [title*="eplace" i]'));
    for (let node = trigger?.parentElement; node; node = node.parentElement) {
      const found = usable.find(el => node.contains(el));
      if (found) return found;
    }
    return null;
  }

  /** Finds a card's "Browse Files" button again after the page re-rendered, by its card heading. */
  function findFreshTrigger(field) {
    if (field.trigger?.isConnected) return field.trigger;
    const wanted = String(field.label || '').trim().toLowerCase();
    if (!wanted) return null;
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, [role="heading"]'))
      .filter(h => h.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === wanted);
    for (const heading of headings) {
      for (let card = heading.parentElement, depth = 0; card && depth < 4; card = card.parentElement, depth++) {
        const button = Array.from(card.querySelectorAll('button, [role="button"]'))
          .find(b => /browse|upload|choose|select|attach|add/i.test(b.textContent || b.getAttribute('aria-label') || ''));
        if (button) return button;
      }
    }
    return null;
  }

  /**
   * Prepares an upload card that has only a "Browse Files" button: clicking it tells the website
   * which document comes next (the browser does not open a file dialog for a script click), then
   * returns the shared file input to attach the file to. Returns null when the card is gone.
   */
  async function armTriggerUpload(field, log) {
    const trigger = findFreshTrigger(field);
    if (!trigger) {
      log(`"${field.label || friendlyFileTypeLabel(field.type)}": its Browse button is no longer on the page (already uploaded?)`, 'warn');
      return null;
    }
    field.trigger = trigger;
    trigger.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    trigger.click();
    await sleep(250); // let the page record which document the shared input is for
    const input = field.element?.isConnected ? field.element : nearestSharedFileInput(trigger);
    if (input) field.element = input;
    return input;
  }

  /**
   * Picks the stored files for one upload field, in this order:
   *  1. files mapped to the field's document type,
   *  2. files mapped to "Other Document" (genericFile),
   *  3. stored files not mapped to any type,
   *  4. any stored file (even one mapped to other types).
   * Only files the input accepts (its accept="…" formats) and not already used are chosen.
   * Returns { records, source: 'mapped' | 'other' | 'unmapped' | 'anyStored' | null, rejectedFormat }.
   */
  function chooseFileRecords(type, element, files, mappings, consumedByType, settings) {
    const fits = record => !root.SFFAFileUploader?.recordFitsInput || root.SFFAFileUploader.recordFitsInput(record, element);
    const byIds = ids => Array.from(new Map((Array.isArray(ids) ? ids : [])
      .map(id => files.find(file => file.id === id)).filter(Boolean).map(file => [file.id, file])).values());
    const mapped = type ? byIds(mappings?.[type]) : [];
    const mappedIds = new Set(Object.values(mappings || {}).flat());
    const pick = reuse => {
      const usedFor = key => (reuse ? new Set() : (consumedByType.get(key) || new Set()));
      const usedAny = usedFor('__any');
      const unused = (list, key) => list.filter(file => !usedFor(key).has(file.id) && !usedAny.has(file.id));
      const mappedFit = unused(mapped, type).filter(fits);
      if (mappedFit.length) return { records: mappedFit, source: 'mapped' };
      const other = unused(byIds(mappings?.genericFile), 'genericFile').filter(fits);
      if (other.length) return { records: other.slice(0, 1), source: 'other' };
      const loose = unused(files.filter(file => !mappedIds.has(file.id)), '__any').filter(fits);
      if (loose.length) return { records: loose.slice(0, 1), source: 'unmapped' };
      // Last choice: a file mapped to other types. A box no mapping matches (e.g. "Upload Evidence")
      // must not stay empty just because every stored file is mapped somewhere else.
      const anyFit = unused(files, '__any').filter(fits);
      if (anyFit.length) return { records: anyFit.slice(0, 1), source: 'anyStored' };
      return null;
    };
    // Unused files first; when every fitting file was already used (a form with more upload boxes than
    // stored files), use one again rather than leave the box empty.
    const fresh = pick(settings?.reuseMappedFileAcrossFields === true);
    if (fresh) return fresh;
    const again = pick(true);
    if (again) return { ...again, records: again.records.slice(0, 1), reused: true };
    return { records: [], source: null, rejectedFormat: mapped.length > 0 && !mapped.some(fits) };
  }

  /** Assigns explicitly mapped files to detected file inputs and reports local attachment status. */
  async function fillFileInputs(fileFields, files, mappings, log, checkCancelled = () => {}, consumedByType = new Map(), options = {}) {
    const results = [];

    for (const field of fileFields) {
      checkCancelled();
      let { element, type, multiple } = field;
      // "Replace document" inputs would overwrite a file that is already uploaded (possibly signed).
      if (field.replacesExisting && options.settings?.replaceUploadedFiles !== true) {
        options.touchedFileInputs?.add(element);
        log(`Skipped "${friendlyFileTypeLabel(type)}": this input replaces a document that is already uploaded`, 'info');
        results.push({ type, success: false, reason: 'Replaces an already uploaded document (skipped)', status: (root.SFFAStatus && root.SFFAStatus.UPLOAD_STATUS.SKIPPED_NOT_MAPPED) || 'SKIPPED_NOT_MAPPED', skippedReplace: true });
        continue;
      }
      if (field.viaTrigger) {
        // Resolve a file first, so no button is clicked for a card we cannot fill.
        if (!chooseFileRecords(type, field.element, files, mappings, consumedByType, options.settings).records.length) {
          log(`? No file fits "${field.label || friendlyFileTypeLabel(type)}" — map a "${friendlyFileTypeLabel(type)}" file in the popup's Files list`, 'warn');
          results.push({ type, success: false, reason: 'No unused mapped file configured', status: (root.SFFAStatus && root.SFFAStatus.UPLOAD_STATUS.SKIPPED_NOT_MAPPED) || 'SKIPPED_NOT_MAPPED' });
          continue;
        }
        element = await armTriggerUpload(field, log);
        if (!element) {
          results.push({ type, success: false, reason: 'Upload button no longer on the page' });
          continue;
        }
      }
      if (!element.isConnected) {
        const fresh = findFreshFileInputByType(type, options.touchedFileInputs);
        if (fresh) {
          log(`? "${friendlyFileTypeLabel(type)}" field was re-rendered by the page ? recovered a matching field and retrying`, 'warn');
          element = fresh;
          field.element = fresh;
        }
      }

      const fieldName = field.label || (type ? friendlyFileTypeLabel(type) : 'upload field without a recognised document type');
      if (element.isConnected && element.matches(':disabled')) {
        // The page locks upload boxes while it sends the previous file to its server.
        log(`"${fieldName}" is locked while the page finishes another upload — waiting (up to 30 s)`, 'info');
        await waitForUploadUnlock(() => element.isConnected && element.matches(':disabled'), checkCancelled);
      }
      const lockedBefore = lockedFileInputs();
      const choice = chooseFileRecords(type, element, files, mappings, consumedByType, options.settings);
      const fileRecords = choice.records;
      const usedKey = choice.source === 'mapped' ? type : choice.source === 'other' ? 'genericFile' : '__any';
      const used = consumedByType.get(usedKey) || new Set();

      if (!fileRecords.length) {
        const accepts = element.getAttribute('accept');
        if (choice.rejectedFormat) {
          log(`? The file mapped to "${fieldName}" is the wrong format — this field only accepts ${accepts}. Add a file in one of those formats.`, 'warn');
        } else if (!files.length) {
          log(`? No test files are stored — add files in the popup's Files list to fill "${fieldName}"`, 'warn');
        } else {
          log(`? No unused file fits "${fieldName}"${accepts ? ` (accepts ${accepts})` : ''} — map one to ${type ? `"${friendlyFileTypeLabel(type)}"` : '"Other Document"'} in the popup's Files list`, 'warn');
        }
        results.push({ type, success: false, reason: choice.rejectedFormat ? `Mapped file format not accepted (${accepts})` : 'No unused mapped file configured', status: (root.SFFAStatus && root.SFFAStatus.UPLOAD_STATUS.SKIPPED_NOT_MAPPED) || 'SKIPPED_NOT_MAPPED' });
        continue;
      }
      if (choice.reused) {
        log(`"${fieldName}": every stored file that fits was already used, so "${fileRecords[0].name}" is used again`, 'info');
      } else if (choice.source !== 'mapped') {
        log(`"${fieldName}" has no file mapped to its type — using "${fileRecords[0].name}" (${choice.source === 'other' ? 'mapped to Other Document' : choice.source === 'anyStored' ? 'mapped to other types' : 'not mapped to any type'}) because it matches the accepted formats`, 'info');
      }

      const pageReaction = observeUploadPageReaction(element, fileRecords.map(record => record.name));
      const outcome = root.SFFAFileUploader.assignFilesToInput(element, fileRecords);
      if (outcome.success) options.touchedFileInputs?.add(element);
      const uploadStatus = root.SFFAStatus ? root.SFFAStatus.classifyUploadResult(outcome) : null;
      if (!outcome.success) {
        pageReaction.cancel();
        if (outcome.rejectedByAccept?.length) {
          log(`? ${outcome.rejectedByAccept.length} mapped file(s) do not match this field's accepted types for "${friendlyFileTypeLabel(type)}"`, 'warn');
        } else {
          log(`? ${outcome.reason} (field: ${friendlyFileTypeLabel(type)}${multiple ? ', accepts multiple' : ''})`, 'warn');
        }
        results.push({ type, success: false, reason: outcome.reason, status: uploadStatus });
        await sleep(FILE_UPLOAD_GAP_MS);
        continue;
      }

      if (outcome.rejectedByAccept?.length) {
        log(`? ${outcome.rejectedByAccept.length} mapped file(s) skipped because this field does not accept their types`, 'warn');
      }
      if (outcome.contentUnavailable?.length) {
        log(`? Stored content was unavailable for ${outcome.contentUnavailable.length} mapped file(s); available files were attached`, 'warn');
      }

      if (options.settings?.reuseMappedFileAcrossFields !== true) {
        for (const id of outcome.attachedRecordIds || []) used.add(id);
        consumedByType.set(usedKey, used);
        // Fallback files are shared by every field, so each one is used once across the whole fill.
        if (choice.source !== 'mapped') {
          const any = consumedByType.get('__any') || new Set();
          for (const id of outcome.attachedRecordIds || []) any.add(id);
          consumedByType.set('__any', any);
        }
      }
      if (!outcome.consumedByPage && (!element.isConnected || !element.files?.length)) {
        pageReaction.cancel();
        results.push({ type, success: false, reason: 'Attachment no longer visible; website upload cannot be verified' });
        log(`? Attachment for "${friendlyFileTypeLabel(type)}" cannot be verified`, 'warn');
      } else {
        const count = outcome.attached;
        const reacted = await pageReaction.promise;
        const responseStatus = reacted ? 'attached + page reacted' : 'attached, no page response detected';
        log(`${count} file(s) ${responseStatus} for "${friendlyFileTypeLabel(type)}"; server-side upload is unverified`, reacted ? 'info' : 'warn');
        log('The page received file input/change events and may start an automatic upload; server acceptance was not verified.', 'warn');
        const rejectedCount = outcome.rejectedByAccept?.length || 0;
        const unavailableCount = outcome.contentUnavailable?.length || 0;
        const notAttachedCount = outcome.skipped - rejectedCount - unavailableCount;
        if (notAttachedCount > 0) {
          log(`? ${notAttachedCount} extra mapped file(s) were not attached to this single-file field`, 'warn');
        }
        field.attachedOk = true;
        results.push({ type, success: true, count, status: uploadStatus, pageResponse: reacted ? 'reacted' : 'none', ...(field.viaTrigger ? { label: field.label } : {}) });
        // Let the page finish sending this file before the next one, when it locks its upload boxes meanwhile.
        const newlyLocked = () => Array.from(lockedFileInputs()).some(el => !lockedBefore.has(el));
        if (newlyLocked()) {
          log('Waiting for the page to finish this upload before the next one', 'info');
          if (!await waitForUploadUnlock(newlyLocked, checkCancelled)) log('⚠ The page still locks its upload boxes after 30 s — continuing', 'warn');
        }
      }
      await sleep(FILE_UPLOAD_GAP_MS);
    }
    return results;
  }

  /** Observes briefly for a new upload preview or success-like live message without reading file data. */
  function observeUploadPageReaction(input, fileNames = []) {
    const doc = input?.ownerDocument;
    const rootElement = doc?.documentElement;
    if (!rootElement || typeof MutationObserver === 'undefined') return { promise: Promise.resolve(false), cancel() {} };
    // Many pages list the chosen file's name under the upload box: that counts as the page reacting.
    const card = input.parentElement?.parentElement?.parentElement || input.parentElement || doc.body;
    const names = fileNames.filter(name => typeof name === 'string' && name.length >= 3);
    const namesBefore = names.filter(name => (card.textContent || '').includes(name)).length;
    const beforeImages = new Set(Array.from(doc.querySelectorAll('img')));
    const beforeStatus = new Map(Array.from(doc.querySelectorAll('[role="status"],[role="alert"],[aria-live]')).map(status => [status, status.textContent || '']));
    let observer, timer, settled = false, resolveResult;
    const promise = new Promise(resolve => { resolveResult = resolve; });
    const finish = reacted => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer?.disconnect();
      resolveResult(reacted);
    };
    const inspect = () => {
      if (names.length && card.isConnected && names.filter(name => (card.textContent || '').includes(name)).length > namesBefore) return finish(true);
      if (Array.from(doc.querySelectorAll('img')).some(image => !beforeImages.has(image))) return finish(true);
      for (const status of doc.querySelectorAll('[role="status"],[role="alert"],[aria-live]')) {
        const text = (status.textContent || '').toLowerCase();
        if (text !== beforeStatus.get(status) && /upload|attach|select|success|complete|added|received/.test(text)) return finish(true);
      }
    };
    observer = new MutationObserver(inspect);
    observer.observe(rootElement, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(() => finish(false), 1200);
    return { promise, cancel: () => finish(false) };
  }

  /** Fills detected controls, coordinates related fields, and returns per-field results. */
  async function fillEntireForm(detected, testData, storedFiles, mappings, log = () => {}, options = {}) {
    // Page order is the default; settings.fillOrder 'type' (or a nested dynamic pass) keeps the old order.
    const order = options.fillOrder || options.settings?.fillOrder || 'page';
    if (order !== 'type' && !options.dynamicDepth) return fillInPageOrder(detected, testData, storedFiles, mappings, log, options);
    // Setting "Keep values already in the form" (normal fills only; test runs must change values).
    if (options.settings?.keepExistingValues === true && options.isolatedMode !== true) {
      detected = withoutPrefilled(detected);
      const rescan = options.rescan;
      if (rescan) options = { ...options, rescan: () => withoutPrefilled(rescan()) };
    }
    /** Throws when the caller's fill operation has been cancelled. */
    const checkCancelled = () => {
      if (options.isCancelled?.()) throw new Error('Run cancelled');
    };
    checkCancelled();
    const consumedFilesByType = options.consumedFilesByType instanceof Map ? options.consumedFilesByType : new Map();
    const filledTextElements = new Set();
    const summary = {
      textFilled: 0,
      dropdownsFilled: 0,
      radiosFilled: 0,
      checkboxesFilled: 0,
      filesUploaded: 0,
      skipped: [],
      total: 0,
      filledTypes: []
    };

    const advancedElements = new Set();
    /** Fills one text field using the advanced strategy and records its result. */
    function fillAdvancedText(field) {
      const el = field.element;
      if (!root.SFFAAdvancedFiller || !el?.isConnected) return false;
      if (advancedElements.has(el)) return true;
      const native = ['time', 'range', 'color'].includes(el.type);
      if (!native && !el.pattern) return false;
      const fieldData = resolveFieldTestData(field, testData, options.settings);
      const proposed = fieldData[field.type] ?? (el.type === 'color' ? '#3366cc' : el.type === 'time' ? '10:00' : el.type === 'range' ? '50' : 'QA123');
      const value = root.SFFAAdvancedFiller.valueFor(el, proposed);
      const ok = root.SFFAAdvancedFiller.write(el, value);
      if (!native && !ok) return false;
      advancedElements.add(el);
      const type = field.type || (native ? el.type : 'pattern');
      summary.total++;
      if (ok) { summary.textFilled++; summary.filledTypes.push(type); }
      else summary.skipped.push(type);
      return true;
    }

    const cycleCounters = {};
    for (const field of detected.text) {
      // Inputs with a <datalist> get one of its suggestions, unless the user imported a value for them.
      const fieldData = resolveFieldTestData(field, testData, options.settings);
      const datalistResult = fieldData === testData && field.element?.isConnected ? fillFromDatalist(field, log, cycleCounters) : null;
      if (datalistResult) {
        checkCancelled();
        summary.total++;
        filledTextElements.add(field.element);
        summary.textFilled++;
        summary.filledTypes.push(datalistResult.type);
        continue;
      }
      if (fillAdvancedText(field)) continue;
      checkCancelled();
      summary.total++;
      const revealedElement = await revealMaskedFieldIfNeeded(field.element, log);
      const fieldToFill = revealedElement === field.element ? field : { ...field, element: revealedElement };
      field.element = fieldToFill.element;
      const result = fillTextField(fieldToFill, resolveFieldTestData(fieldToFill, testData, options.settings), log, cycleCounters);
      if (result.filled) filledTextElements.add(field.element);
      if (result.filled) {
        summary.textFilled++;
        summary.filledTypes.push(result.type);
        log(`✓ Filled "${result.type}"`, 'success');
      } else {
        summary.skipped.push(field.type || 'text');
      }
    }

    const scan = options.rescan || (() => root.SFFAFormDetector.detectFormFields());
    const dropdownResults = new Map();
    const attempts = new Map();
    const deadline = Date.now() + (options.timeoutMs || 180000);
    const dropdownOccurrences = new Map();
    const dropdownCounts = {};
    const processedDropdownKeys = new Set();
    let pendingSince = Date.now();
    let quietSince = Date.now();
    let firstDropdown = true;
    /** Builds a stable key for grouping detected field descriptors. */
    function fieldKey(field) {
      const el = field.element;
      if (el.id) return `id:${el.id}`;
      const parts = [];
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        parts.unshift(`${node.tagName}:${Array.from(node.parentElement?.children || []).indexOf(node)}`);
      }
      return parts.join('/');
    }
    /** Builds a signature used to avoid processing the same dropdown selection twice. */
    function selectionSignature(field) {
      const el = field.element;
      return el.tagName === 'SELECT' ? `${JSON.stringify(Array.from(el.selectedOptions, o => o.value))}|${getOptionsSignature(el)}`
        : `${el.value || ''}|${el.textContent || ''}`;
    }

    /** Marks dropdowns handled by a related-field fill routine as already processed. */
    function registerProcessedDropdowns(fields) {
      for (const field of fields) {
        const key = fieldKey(field);
        processedDropdownKeys.add(key);
        dropdownResults.set(key, { signature: selectionSignature(field), type: field.type });
      }
    }

    const locationChain = findLocationChain(detected.select || []);
    if (locationChain) {
      const chainFields = [locationChain.stateIdx, locationChain.districtIdx, locationChain.cityIdx]
        .filter(index => index >= 0)
        .map(index => detected.select[index])
        .filter(Boolean);
      if (chainFields.length) {
        await fillLocationChain(locationChain, detected.select, testData, log);
        registerProcessedDropdowns(chainFields);
      }
    }

    const customLocationChain = findCustomLocationChain(detected.customDropdowns || []);
    if (customLocationChain) {
      const chainFields = [customLocationChain.stateIdx, customLocationChain.districtIdx, customLocationChain.cityIdx]
        .filter(index => index >= 0)
        .map(index => detected.customDropdowns[index])
        .filter(Boolean);
      if (chainFields.length) {
        await fillCustomLocationChain(customLocationChain, detected.customDropdowns, testData, log);
        registerProcessedDropdowns(chainFields);
      }
    }

    while (Date.now() < deadline) {
      checkCancelled();
      const fresh = scan();
      detected.select = fresh.select;
      detected.customDropdowns = fresh.customDropdowns;
      const fields = [...fresh.select, ...fresh.customDropdowns].sort((a, b) =>
        a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1)
        .filter(field => !processedDropdownKeys.has(fieldKey(field)));
      const pending = fields.filter(field => {
        const previous = dropdownResults.get(fieldKey(field));
        return !previous || previous.signature !== selectionSignature(field);
      });
      if (!pending.length) {
        if (Date.now() - quietSince >= 1500) break;
        await sleep(100);
        continue;
      }
      quietSince = Date.now();
      const field = pending.find(f => (attempts.get(fieldKey(f)) || 0) < 3 &&
        (f.element.tagName === 'SELECT' ? !isSelectNotReadyYet(f.element) : isCustomDropdownEnabled(f.element)));
      if (!field) {
        if (Date.now() - pendingSince >= 8000) break;
        await sleep(100);
        continue;
      }
      const key = fieldKey(field);
      attempts.set(key, (attempts.get(key) || 0) + 1);
      if (!dropdownOccurrences.has(key)) {
        const type = field.type || '__generic';
        dropdownOccurrences.set(key, dropdownCounts[type] || 0);
        dropdownCounts[type] = (dropdownCounts[type] || 0) + 1;
      }
      const occurrence = dropdownOccurrences.get(key);
      const fieldData = resolveFieldTestData(field, testData, options.settings);
      let ok = false;
      try {
        if (field.element.tagName === 'SELECT' && field.element.multiple) {
          ok = !!root.SFFAAdvancedFiller?.chooseMany(field.element, fieldData[field.type], options.multiSelectCount || 2);
        } else if (field.element.tagName === 'SELECT') {
          ok = field.type === 'targetScore' ? selectMaxNumericOption(field.element)
            : (occurrence > 0 && selectVariedRealOption(field.element, occurrence)) || selectDropdownOption(field.element, fieldData[field.type]);
          if (!ok) ok = selectFirstRealOption(field.element);
        } else {
          const multi = field.element.getAttribute('aria-multiselectable') === 'true'
            || field.element.hasAttribute('data-multiple')
            || !!field.element.querySelector?.('[aria-multiselectable="true"]');
          const advanced = multi && root.SFFAAdvancedFiller.customChoice
            ? await root.SFFAAdvancedFiller.customChoice(field, fieldData, log, { multiSelectCount: options.multiSelectCount || 2 })
            : { ok: false };
          ok = advanced.ok || (await fillCustomDropdown(field, fieldData, log, occurrence)).ok;
        }
      } catch (error) { log(`Dropdown failed: ${error.message}`, 'warn'); }
      if (ok) {
        dropdownResults.set(key, { signature: selectionSignature(field), type: field.type });
        log(`✓ Dropdown "${field.type || field.element.id || 'unlabeled'}" selected`, 'success');
        pendingSince = Date.now();
      }
      await sleep(firstDropdown ? 1000 : 600);
      firstDropdown = false;
    }
    const latest = scan();
    detected.select = latest.select;
    detected.customDropdowns = latest.customDropdowns;
    for (const field of [...latest.select, ...latest.customDropdowns]) {
      if (processedDropdownKeys.has(fieldKey(field))) {
        const result = dropdownResults.get(fieldKey(field));
        if (result && result.signature === selectionSignature(field)) {
          summary.total++;
          summary.dropdownsFilled++;
          if (field.type) summary.filledTypes.push(field.type);
        } else {
          summary.total++;
          summary.skipped.push(field.type || field.element.id || 'dropdown');
          log(`⚠ Dropdown "${field.type || field.element.id || 'unlabeled'}" unavailable or unverified`, 'warn');
        }
        continue;
      }
      summary.total++;
      const result = dropdownResults.get(fieldKey(field));
      if (result && result.signature === selectionSignature(field)) {
        summary.dropdownsFilled++;
        if (field.type) summary.filledTypes.push(field.type);
      } else {
        summary.skipped.push(field.type || field.element.id || 'dropdown');
        log(`⚠ Dropdown "${field.type || field.element.id || 'unlabeled'}" unavailable or unverified`, 'warn');
      }
    }
    for (const field of latest.text) {
      if (filledTextElements.has(field.element) || fillAdvancedText(field)) continue;
      checkCancelled();
      summary.total++;
      const result = fillTextField(field, resolveFieldTestData(field, testData, options.settings), log, cycleCounters);
      if (result.filled) {
        summary.textFilled++;
        summary.filledTypes.push(result.type);
      } else summary.skipped.push(field.type || 'text');
    }
    detected.text = latest.text;
    detected.radioGroups = latest.radioGroups;
    detected.checkboxes = latest.checkboxes;
    detected.checkboxGroups = latest.checkboxGroups;
    detected.file = latest.file;

    for (const [name, group] of Object.entries(detected.radioGroups)) {
      summary.total++;
      const ok = fillRadioGroup(group, testData, log);
      if (ok) {
        summary.radiosFilled++;
        log(`✓ Radio group "${group.type || name}" selected`, 'success');
      } else {
        summary.skipped.push(group.type || name);
      }
    }

    const optionalBoxes = [];
    for (const field of detected.checkboxes) {
      summary.total++;
      const outcome = fillCheckbox(field, log);
      if (outcome === 'checked' || outcome === 'already') summary.checkboxesFilled++;
      else if (outcome === 'optional') optionalBoxes.push(checkboxName(field.element));
      else summary.skipped.push('checkbox');
    }
    if (optionalBoxes.length) {
      log(`Left ${optionalBoxes.length} optional checkbox(es) unticked (not required, not a consent box): ${optionalBoxes.slice(0, 3).map(n => `"${n}"`).join(', ')}${optionalBoxes.length > 3 ? '…' : ''}`, 'info');
    }

    for (const [name, group] of Object.entries(detected.checkboxGroups || {})) {
      summary.total++;
      const groupName = group.label || name;
      // "None of the above" / opt-out options contradict the others, so they are not ticked.
      const options = group.options.filter(el => !/\bnone( of (the|these) above)?\b|not applicable|\bn\/a\b/.test(checkboxContext(el)) && !OPT_OUT_RE.test(checkboxContext(el)));
      for (const el of options) {
        el_checked_or_set(el);
        await sleep(60); // React-style pages update state per click; give each tick time to land
      }
      // Re-tick any option a re-render cleared, once.
      for (const el of options) if (el.isConnected && !el.checked) { el_checked_or_set(el); await sleep(60); }
      const checkedCount = options.filter(el => el.isConnected && el.checked).length;
      if (checkedCount > 0) {
        summary.checkboxesFilled++;
        log(`✓ Checked ${checkedCount} option(s) in checkbox group "${groupName}"`, 'success');
        if (checkedCount < options.length) {
          log(`⚠ ${options.length - checkedCount} option(s) in checkbox group "${groupName}" did not stay checked`, 'warn');
        }
      } else {
        summary.skipped.push(groupName);
      }
    }

    checkCancelled();
    detected.file = scan().file;
    if (detected.file.length && options.hydrateFiles) await options.hydrateFiles(storedFiles);
    if (detected.file.length) {
      const fileResults = await fillFileInputs(detected.file, storedFiles, mappings, log, checkCancelled, consumedFilesByType, options);
      summary.total += fileResults.length;
      summary.filesUploaded = fileResults.filter(r => r.success).length;
      fileResults.filter(r => !r.success).forEach(r => summary.skipped.push(r.type || 'file'));
      // Uploading often re-renders the page and can clear (or only then show) consent boxes such
      // as "I confirm the uploaded documents are correct": tick required/consent boxes again.
      if (summary.filesUploaded) {
        await sleep(300);
        for (const field of scan().checkboxes || []) {
          if (field.element.checked) continue;
          if (fillCheckbox(field, log) === 'checked') summary.checkboxesFilled++;
        }
      }
    }

    if (root.SFFAAdvancedFiller && options.isolatedMode !== true) {
      const widgetResults = await root.SFFAAdvancedFiller.runWidgets(testData, options.settings || {}, { fieldScope: options.fieldScope }, options.isCancelled || (() => false));
      for (const r of widgetResults) { summary.total++; if (r.ok) summary.textFilled++; else summary.skipped.push(r.kind || 'widget'); }
      const credentialResults = await root.SFFAAdvancedFiller.credentials(options.settings || {}, { credentials: options.credentials || {}, fieldScope: options.fieldScope });
      for (const r of credentialResults) { summary.total++; if (r.ok) summary.textFilled++; else summary.skipped.push(r.kind || 'credential'); }
      const repeatResults = await root.SFFAAdvancedFiller.repeatRows(options, options.isCancelled || (() => false));
      for (const r of repeatResults) { summary.total++; if (r.ok) summary.textFilled++; else summary.skipped.push(r.kind || 'repeatRows'); }
    }

    summary.actualValues = {};
    for (const field of [...detected.text, ...detected.select, ...detected.customDropdowns]) {
      const el = field.element;
      if (!el.isConnected || !field.type || ['password','otp'].includes(field.type) || !summary.filledTypes.includes(field.type)) continue;
      if (el.tagName === 'SELECT' && (!el.selectedOptions[0] || looksLikePlaceholderOption(el.selectedOptions[0]))) continue;
      const value = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent?.trim() || '') : (el.value || el.textContent?.trim() || '');
      if (!value) continue;
      if (!(field.type in summary.actualValues)) summary.actualValues[field.type] = value;
      else {
        const previous = summary.actualValues[field.type];
        summary.actualValues[field.type] = [...(Array.isArray(previous) ? previous : [previous]), value];
      }
    }
    summary.filledTypes = Array.from(new Set(summary.filledTypes));
    const dynamicDepth = options.dynamicDepth || 0;
    const dynamicFileRescans = options.dynamicFileRescans || 0;
    if (dynamicDepth < 4 || dynamicFileRescans < 100) {
      const seen = new Set([
        ...detected.text, ...detected.select, ...detected.customDropdowns, ...detected.checkboxes, ...detected.file
      ].map(f => f.element));
      for (const group of [...Object.values(detected.radioGroups), ...Object.values(detected.checkboxGroups || {})]) {
        for (const el of group.options) seen.add(el);
      }
      /** Rescans for newly inserted file inputs after the page changes. */
      const unseenScan = () => {
        const fresh = scan();
        for (const key of ['text', 'select', 'customDropdowns', 'checkboxes', 'file']) fresh[key] = fresh[key].filter(f => !seen.has(f.element));
        for (const key of ['radioGroups', 'checkboxGroups']) {
          for (const [name, group] of Object.entries(fresh[key])) {
            group.options = group.options.filter(el => !seen.has(el));
            if (!group.options.length) delete fresh[key][name];
          }
        }
        return fresh;
      };
      const next = unseenScan();
      if (dynamicDepth >= 4) {
        next.text = [];
        next.select = [];
        next.customDropdowns = [];
        next.checkboxes = [];
        next.radioGroups = {};
        next.checkboxGroups = {};
      }
      if ([next.text, next.select, next.customDropdowns, next.checkboxes, next.file, Object.keys(next.radioGroups), Object.keys(next.checkboxGroups)].some(items => items.length)) {
        const more = await fillEntireForm(next, testData, storedFiles, mappings, log, {
          ...options,
          rescan: unseenScan,
          consumedFilesByType,
          dynamicDepth: Math.min(dynamicDepth + 1, 4),
          dynamicFileRescans: dynamicDepth >= 4 ? dynamicFileRescans + 1 : 0
        });
        for (const key of ['textFilled','dropdownsFilled','radiosFilled','checkboxesFilled','filesUploaded','total']) summary[key] += more[key];
        summary.skipped.push(...more.skipped);
        summary.filledTypes = Array.from(new Set([...summary.filledTypes, ...more.filledTypes]));
        Object.assign(summary.actualValues, more.actualValues);
        for (const key of ['text', 'select', 'customDropdowns', 'checkboxes', 'file']) detected[key].push(...next[key]);
        Object.assign(detected.radioGroups, next.radioGroups);
        Object.assign(detected.checkboxGroups, next.checkboxGroups);
      }
    }
    return summary;
  }

  // ---------------------------------------------------------------------------------------------
  // Page-order fill: top to bottom, like a person. Each field is filled at its own position; after a
  // field that can change the page (dropdown, radio, checkbox group, switch…) the form area is given a
  // moment to settle, and fields that appeared or became enabled are filled in place.
  // Files, consent boxes, saved credentials and repeat rows come last. "By field type" (settings
  // fillOrder: 'type') keeps the previous behaviour.
  // ---------------------------------------------------------------------------------------------

  const SAME_AS_RE = /\bsame as\b|\bsame address\b|\bcopy (from|of) (the )?(permanent|present|current|billing|shipping|communication|residential|registered)/i;
  const NO_RETRY_RE = /\botp\b|captcha|verification code|one.?time.?(password|code)|security code/i;
  const CONTROLLER_KINDS = new Set(['select', 'custom', 'chain', 'customChain', 'radio', 'checkboxGroup', 'widget']);
  const NEW_PASSWORD_RE = /(new|create|choose|set|confirm|re-?enter|retype|repeat|verify)/i;
  const OLD_PASSWORD_RE = /(current|old|existing)/i;

  /**
   * Password boxes of a sign-up / change-password form: only when the form has two or more password
   * boxes, or the label says New / Create / Confirm / Re-enter. A login form's single password box is
   * never filled (saved per-site credentials handle logins).
   */
  function signUpPasswordFields(classified = new Set()) {
    const shown = el => el.isConnected && !el.disabled && !el.readOnly && el.getClientRects().length > 0;
    // Masked data boxes (PAN, Aadhaar, account number…) are type="password" too; the detector classifies them.
    const boxes = Array.from(document.querySelectorAll('input[type="password"]')).filter(el => shown(el) && !classified.has(el));
    return boxes.filter(el => {
      const label = `${el.labels?.[0]?.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.name || ''} ${el.id || ''} ${el.getAttribute('autocomplete') || ''}`;
      if (OLD_PASSWORD_RE.test(label) || /current-password|one-time-code/.test(label) || NO_RETRY_RE.test(label)) return false;
      const sameForm = boxes.filter(other => (other.form || null) === (el.form || null)).length;
      return sameForm >= 2 || NEW_PASSWORD_RE.test(label) || /new-password/.test(label);
    });
  }

  /** A test password most password rules accept (upper, lower, digit, symbol, 12 characters). */
  function makeTestPassword() {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    return `Qa!Test${digits}x`;
  }
  const POS_FOLLOWING = 4;
  const POS_PRECEDING = 2;

  /** Chain of elements from the top page down to `el`, through shadow hosts and same-origin frames. */
  function anchorChain(el) {
    const chain = [];
    let node = el;
    while (node) {
      chain.unshift(node);
      const rootNode = node.getRootNode?.();
      if (rootNode && rootNode.host) { node = rootNode.host; continue; }
      let frame = null;
      try { frame = node.ownerDocument?.defaultView?.frameElement || null; } catch (_) { frame = null; }
      if (frame) { node = frame; continue; }
      break;
    }
    return chain;
  }

  /** Orders two elements as they appear on the page, also across iframes and shadow roots. */
  function comparePagePosition(a, b) {
    const ca = anchorChain(a);
    const cb = anchorChain(b);
    for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
      if (ca[i] === cb[i]) continue;
      const pos = ca[i].compareDocumentPosition(cb[i]);
      if (pos & POS_FOLLOWING) return -1;
      if (pos & POS_PRECEDING) return 1;
      return 0;
    }
    return ca.length - cb.length;
  }

  /** Stable identity for "already filled", also when the page re-renders the element. */
  function stableKey(el) {
    try { if (root.SFFADeepDOM?.key) return root.SFFADeepDOM.key(el); } catch (_) { /* fall back below */ }
    if (el.id) return `#${el.id}`;
    const parts = [];
    for (let node = el; node && node.parentElement; node = node.parentElement) {
      parts.unshift(`${node.tagName}:${Array.from(node.parentElement.children).indexOf(node)}`);
    }
    return parts.join('/');
  }

  /**
   * Waits until `target` stops changing (quiet for `quietMs`, at most `capMs`). Resolves true when it
   * changed. When nothing changes within the first 300 ms it stops early.
   */
  function waitForQuiet(target, quietMs = 200, capMs = 1000) {
    return new Promise(resolve => {
      const node = target || document.body;
      if (!node || typeof MutationObserver === 'undefined') { resolve(false); return; }
      let changed = false;
      let timer = null;
      const finish = () => { observer.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(changed); };
      const observer = new MutationObserver(() => {
        changed = true;
        clearTimeout(timer);
        timer = setTimeout(finish, quietMs);
      });
      observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style', 'class', 'aria-hidden', 'aria-disabled', 'aria-expanded'] });
      timer = setTimeout(finish, 300);
      const cap = setTimeout(finish, capMs);
    });
  }

  /**
   * Starts watching `target` for changes BEFORE a field is filled (pages often react synchronously).
   * `settle()` then resolves true when something changed, after the area has been quiet for `quietMs`
   * (at most `capMs`); with no change it waits up to 300 ms for a late reaction.
   */
  function watchChanges(target) {
    const node = target || document.body;
    let changed = false;
    let notify = null;
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { changed = true; notify?.(); });
    observer?.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style', 'class', 'aria-hidden', 'aria-disabled', 'aria-expanded'] });
    return {
      settle(quietMs = 200, capMs = 1000) {
        return new Promise(resolve => {
          if (!observer) { resolve(false); return; }
          let timer = null;
          const finish = () => { observer.disconnect(); clearTimeout(timer); clearTimeout(cap); notify = null; resolve(changed); };
          notify = () => { clearTimeout(timer); timer = setTimeout(finish, quietMs); };
          timer = setTimeout(finish, changed ? quietMs : 300);
          const cap = setTimeout(finish, capMs);
        });
      }
    };
  }

  /** The area of the page a field belongs to (its form, or the page). */
  const areaOf = el => el?.closest?.('form') || el?.ownerDocument?.body || document.body;

  /**
   * Opens closed sections that hide form fields: <details> blocks and accordion/tab buttons
   * (aria-expanded="false" with aria-controls pointing at fields), in page order. Never menus or pickers.
   */
  function openCollapsedSections(log) {
    let opened = 0;
    const hasFields = node => !!node?.querySelector?.('input:not([type="hidden"]), select, textarea, [contenteditable="true"], [role="combobox"]');
    for (const details of document.querySelectorAll('details:not([open])')) {
      if (hasFields(details)) { details.open = true; opened++; }
    }
    for (const button of document.querySelectorAll('[aria-expanded="false"][aria-controls]')) {
      if (button.matches('[role="combobox"], [aria-haspopup], select, input, textarea')) continue;
      const target = document.getElementById(button.getAttribute('aria-controls'));
      if (!hasFields(target)) continue;
      try { button.click(); opened++; } catch (_) { /* best effort */ }
    }
    if (opened) log(`✓ Opened ${opened} collapsed section(s) so their fields can be filled`, 'info');
    return opened;
  }

  /** Readable name of a field for the activity log and the final report. */
  function unitLabel(el) {
    const text = (el?.labels?.[0]?.textContent || el?.getAttribute?.('aria-label') || el?.getAttribute?.('placeholder') || el?.name || el?.id || 'field');
    return String(text).replace(/\s+/g, ' ').replace(/\s*[*:]+\s*$/, '').trim().slice(0, 60) || 'field';
  }

  /** True when the page or browser still reports a problem with this field after the fill. */
  function needsRetry(el) {
    if (!el?.isConnected) return false;
    if (el.validity && !el.validity.valid) return true;
    if (el.getAttribute?.('aria-invalid') === 'true') return true;
    const required = el.required || el.getAttribute?.('aria-required') === 'true';
    if (!required) return false;
    if (el.tagName === 'SELECT') return !el.value || looksLikePlaceholderOption(el.selectedOptions?.[0] || { value: '', text: '' });
    if (el.type === 'checkbox' || el.type === 'radio') return false;
    return !(el.value || el.textContent || '').trim();
  }

  /** True when a control already shows a value (typed by the user or set by the page). */
  function controlHasValue(el) {
    if (!el?.isConnected) return false;
    if (el.isContentEditable) return (el.textContent || '').trim() !== '';
    if (el.tagName === 'SELECT') {
      const option = el.selectedOptions?.[0];
      return !!option && !looksLikePlaceholderOption(option);
    }
    if (el.type === 'file') return (el.files?.length || 0) > 0;
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (['INPUT', 'TEXTAREA'].includes(el.tagName) && (el.value || '').trim() !== '') return true;
    // Custom dropdowns show their choice next to the input or inside the trigger.
    const box = el.tagName === 'INPUT' ? (el.closest('[class*="-container"], [class*="select"]') || el.parentElement) : el;
    return !!box?.querySelector?.('[class*="singleValue"], [class*="single-value"], [class*="multiValue"], [class*="multi-value"]');
  }

  /** Same as controlHasValue for a group of radio buttons or checkboxes: one is chosen. */
  const groupHasValue = group => (group?.options || []).some(option => (option.element || option).checked);

  /**
   * Setting "Keep values already in the form": removes fields that already show a value from a scan,
   * so a fill never changes them. Single checkboxes stay (a fill never unticks them).
   */
  function withoutPrefilled(detected) {
    const empty = field => !controlHasValue(field.element || field);
    const groups = map => Object.fromEntries(Object.entries(map || {}).filter(([, group]) => !groupHasValue(group)));
    return {
      ...detected,
      text: (detected.text || []).filter(empty),
      select: (detected.select || []).filter(empty),
      customDropdowns: (detected.customDropdowns || []).filter(empty),
      file: (detected.file || []).filter(field => field.viaTrigger || empty(field)),
      radioGroups: groups(detected.radioGroups),
      checkboxGroups: groups(detected.checkboxGroups)
    };
  }

  const DATE_HINT_RE = /\b(date|dob|birth|calendar|datepicker|date-picker|picker)\b|dd[\/.\s-]mm|mm[\/.\s-]dd|yyyy/i;
  const PLAIN_DROPDOWN_TEXT_RE = /^\s*(select|choose|pick)\b/i;
  const NOT_A_DROPDOWN_RE = /\b(file|files|photo|image|document|upload|all|none|date)\b/i;
  const isShown = el => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  /** Inputs of type-to-search dropdowns (react-select, aria-autocomplete lists): options appear after typing. */
  function isTypeaheadInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    return /^react-select-\d+-input$/.test(el.id || '') || ['list', 'both'].includes(el.getAttribute('aria-autocomplete'))
      || (el.getAttribute('role') === 'combobox' && !el.readOnly);
  }

  /**
   * Opens a type-to-search dropdown, typing a few letters when no options show, and picks an option
   * (two for multi-select boxes). True when the box shows a choice afterwards.
   */
  async function fillTypeahead(el, query, multiple, log) {
    // The whole widget (around its "control" box), not the tiny input wrapper, so a chosen value is visible to the check.
    const control = el.closest('[class*="control"]');
    const container = control?.parentElement || el.closest('[class*="container"]:not([class*="input-container"]), [class*="combobox"]') || el.parentElement?.parentElement || el.parentElement;
    const optionSelector = '[role="option"], [id*="-option-"], [class*="__option"], [class*="-option"], .ui-menu-item, .autocomplete-suggestion';
    const visibleOptions = () => Array.from(document.querySelectorAll(optionSelector))
      .filter(o => isShown(o) && (o.textContent || '').trim() && !/no options|no results|loading/i.test(o.textContent || '') && o.getAttribute('aria-disabled') !== 'true');
    const before = (container?.textContent || '').trim();
    const w = el.ownerDocument.defaultView;
    const open = () => { (control || container)?.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); el.focus(); el.click(); };
    let picked = 0;
    for (let round = 0; round < (multiple ? 2 : 1); round++) {
      open();
      let options = [];
      for (let waited = 0; waited < 500 && !options.length; waited += 100) { await sleep(100); options = visibleOptions(); }
      for (const q of [query, 'a', 'e', 'i', 'o', 'm'].filter(Boolean)) {
        if (options.length) break;
        setNativeValue(el, String(q).slice(0, 3));
        for (let waited = 0; waited < 900 && !options.length; waited += 150) { await sleep(150); options = visibleOptions(); }
      }
      if (!options.length) break;
      const choice = options[Math.min(round, options.length - 1)];
      choice.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
      choice.click();
      picked++;
      await sleep(250);
    }
    el.blur?.();
    const after = (container?.textContent || '').trim();
    const ok = picked > 0 && (after !== before || !!el.value);
    if (ok) log(`✓ Picked from the type-to-search box "${unitLabel(el)}"`, 'success');
    return ok;
  }

  /** Read-only boxes that look like date pickers (only a calendar click sets them). */
  function readonlyDateBoxes() {
    return Array.from(document.querySelectorAll('input[readonly]:not([type="hidden"]):not([disabled])')).filter(el => {
      if (!isShown(el) || el.value) return false;
      const hint = `${el.placeholder || ''} ${el.name || ''} ${el.id || ''} ${el.className || ''} ${el.labels?.[0]?.textContent || ''} ${el.getAttribute('aria-label') || ''}`;
      return DATE_HINT_RE.test(hint);
    });
  }

  /** Visible "day" cells of a calendar: short numbers in clickable cells. */
  function visibleDayCells() {
    return Array.from(document.querySelectorAll('button, td, a, [role="gridcell"], [data-date], [data-day], span, div'))
      .filter(c => isShown(c) && /^\s*\d{1,2}\s*$/.test(c.textContent || '') && c.children.length === 0 || (isShown(c) && c.hasAttribute('data-date') && c.tagName !== 'INPUT'))
      .filter(c => !c.matches(':disabled') && c.getAttribute('aria-disabled') !== 'true' && !/disabled|outside|other-month|unavailable/i.test(c.className || ''));
  }

  /** Opens a read-only date picker and clicks a date. True when the box got a value. */
  async function pickCalendarDate(el, log) {
    const before = new Set(visibleDayCells());
    el.focus?.();
    el.click();
    let cells = [];
    for (let waited = 0; waited < 1500; waited += 100) {
      cells = visibleDayCells().filter(c => !before.has(c));
      if (cells.length) break;
      await sleep(100);
    }
    if (!cells.length) return false;
    const day = cells[Math.floor(cells.length / 2)];
    day.click();
    await sleep(150);
    if (el.value) log(`✓ Picked a date in the calendar for "${unitLabel(el)}"`, 'success');
    return !!el.value;
  }

  /** "Select …" buttons that open a plain list (no ARIA roles), with the elements that hold their choice. */
  function plainDropdownTriggers(skip) {
    return Array.from(document.querySelectorAll('button, [role="button"], div, span, a')).filter(el => {
      if (skip.has(el) || !isShown(el) || el.closest('select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], label')) return false;
      if (el.querySelector('button, input, select, textarea, div, ul')) return false; // the trigger itself, not a wrapper
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return text.length < 40 && PLAIN_DROPDOWN_TEXT_RE.test(text) && !NOT_A_DROPDOWN_RE.test(text);
    });
  }

  /** Opens a plain dropdown and clicks its first real option. True when the choice changed. */
  async function pickPlainDropdown(trigger, log) {
    const container = trigger.parentElement?.parentElement || trigger.parentElement || document.body;
    const itemSelector = 'li, [role="option"], [class*="option"], [class*="item"], [data-value]';
    const before = new Set(Array.from(container.querySelectorAll(itemSelector)).filter(isShown));
    const startText = (trigger.textContent || '').trim();
    trigger.click();
    let items = [];
    for (let waited = 0; waited < 1200; waited += 100) {
      items = Array.from(container.querySelectorAll(itemSelector))
        .filter(i => isShown(i) && !before.has(i) && i !== trigger && !i.contains(trigger) && (i.textContent || '').trim()
          && !PLAIN_DROPDOWN_TEXT_RE.test(i.textContent || '') && i.getAttribute('aria-disabled') !== 'true' && !/disabled/i.test(i.className || ''));
      if (items.length) break;
      await sleep(100);
    }
    if (!items.length) { trigger.click(); return false; }
    const leaf = items.find(i => !i.querySelector(itemSelector)) || items[0];
    leaf.click();
    await sleep(150);
    const changed = (trigger.textContent || '').trim() !== startText
      || Array.from(container.querySelectorAll('input[type="hidden"]')).some(h => h.value);
    if (changed) log(`✓ Chose "${(leaf.textContent || '').trim().slice(0, 40)}" in "${startText}"`, 'success');
    return changed;
  }

  /** A text to type key by key into a masked box (dates follow the box's DD/MM/YYYY-style hint). */
  function maskedText(el, field, fieldData) {
    const hint = (el.placeholder || el.getAttribute('aria-label') || '').toUpperCase();
    const fmt = hint.match(/(DD|MM|YYYY|YY)([\/.\s-])(DD|MM)\2(YYYY|YY|DD)/);
    if (fmt || DATE_HINT_RE.test(`${field.type || ''} ${el.name || ''}`)) {
      const iso = [fieldData.dob, fieldData[field.type], fieldData.genericDate].find(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
        || new Date(Date.now() - 25 * 365 * 864e5).toISOString().slice(0, 10);
      return fmt ? formatMaskedDate(iso, { tokens: [fmt[1], fmt[3], fmt[4]].map(t => t.toLowerCase()), separator: fmt[2] }) : iso;
    }
    const value = fieldData[field.type];
    return Array.isArray(value) ? value[0] : (value ?? valueFromPlaceholderSample(el) ?? null);
  }

  /**
   * Fills the form in page order. Same arguments and summary shape as fillEntireForm, plus
   * summary.order = 'page', summary.stillFailing (labels) and summary.stoppedReason when the page moved.
   */
  async function fillInPageOrder(detected, testData, storedFiles, mappings, log = () => {}, options = {}) {
    const checkCancelled = () => { if (options.isCancelled?.()) throw new Error('Run cancelled'); };
    const settings = options.settings || {};
    const scan = options.rescan || (() => root.SFFAFormDetector.detectFormFields());
    const consumedFilesByType = options.consumedFilesByType instanceof Map ? options.consumedFilesByType : new Map();
    const summary = { textFilled: 0, dropdownsFilled: 0, radiosFilled: 0, checkboxesFilled: 0, filesUploaded: 0, skipped: [], total: 0, filledTypes: [], order: 'page', stillFailing: [] };
    const done = new Set();
    const cycleCounters = {};
    const dropdownCounts = {};
    const startUrl = location.href;
    const widgetGroups = new Set();
    let passwordValue = null;
    let filesHydrated = false;
    // Upload inputs this fill already gave a file (or left alone): a card's shared input is not filled again
    // on its own, and "Replace" inputs are not reported on every pass.
    const fileOptions = { ...options, touchedFileInputs: new WeakSet() };
    // Setting "Keep values already in the form" (normal fills only; test runs must change values).
    const keepExisting = settings.keepExistingValues === true && options.isolatedMode !== true;
    const kept = new Set();
    /** True when a fill unit already shows a value it did not get from this fill. */
    const unitHasValue = unit => {
      switch (unit.kind) {
        case 'radio': case 'checkboxGroup': return groupHasValue(unit.group);
        case 'chain': case 'customChain': return unit.members.some(member => controlHasValue(member.element));
        case 'file': return !unit.field?.viaTrigger && controlHasValue(unit.el);
        case 'text': case 'select': case 'custom': case 'password': case 'readonlyDate': return controlHasValue(unit.el);
        default: return false;
      }
    };

    const ok = (type, counter) => { summary.total++; summary[counter]++; if (type) summary.filledTypes.push(type); };
    const skip = type => { summary.total++; summary.skipped.push(type); };

    /** Builds the ordered list of fill units from a scan (single consent/required checkboxes are kept for the end). */
    function buildUnits(found) {
      const units = [];
      const chain = findLocationChain(found.select || []);
      const chainFields = chain ? [chain.stateIdx, chain.districtIdx, chain.cityIdx].filter(i => i >= 0).map(i => found.select[i]).filter(Boolean) : [];
      const customChain = findCustomLocationChain(found.customDropdowns || []);
      const customChainFields = customChain ? [customChain.stateIdx, customChain.districtIdx, customChain.cityIdx].filter(i => i >= 0).map(i => found.customDropdowns[i]).filter(Boolean) : [];
      const inChain = new Set([...chainFields, ...customChainFields].map(f => f.element));
      if (chainFields.length) {
        const first = [...chainFields].sort((a, b) => comparePagePosition(a.element, b.element))[0];
        units.push({ kind: 'chain', el: first.element, chain, members: chainFields, list: found.select });
      }
      if (customChainFields.length) {
        const first = [...customChainFields].sort((a, b) => comparePagePosition(a.element, b.element))[0];
        units.push({ kind: 'customChain', el: first.element, chain: customChain, members: customChainFields, list: found.customDropdowns });
      }
      for (const field of found.text || []) units.push({ kind: 'text', el: field.element, field });
      for (const field of found.select || []) if (!inChain.has(field.element)) units.push({ kind: 'select', el: field.element, field });
      for (const field of found.customDropdowns || []) if (!inChain.has(field.element)) units.push({ kind: 'custom', el: field.element, field });
      for (const [name, group] of Object.entries(found.radioGroups || {})) if (group.options?.[0]) units.push({ kind: 'radio', el: group.options[0], group, name });
      for (const [name, group] of Object.entries(found.checkboxGroups || {})) if (group.options?.[0]) units.push({ kind: 'checkboxGroup', el: group.options[0], group, name });
      // Uploads are filled where they are on the page, like every other field.
      for (const field of found.file || []) {
        if (field.element && !fileOptions.touchedFileInputs.has(field.element)) units.push({ kind: 'file', el: field.element, field });
      }
      // Test-and-restore runs (Full QA, Wrong data / Edge cases) only touch fields they can put back.
      if (options.isolatedMode === true) {
        // Calendar-only date boxes start empty, so they can be put back: the caller saves them first.
        for (const el of readonlyDateBoxes()) {
          if (typeof options.rememberBeforeFill === 'function') { options.rememberBeforeFill(el); units.push({ kind: 'readonlyDate', el }); }
        }
      } else {
        // Optional checkboxes that may reveal more fields ("I have a GST number").
        for (const field of found.checkboxes || []) {
          const el = field.element;
          const context = checkboxContext(el);
          if (el.checked || el.required || CONSENT_RE.test(context) || OPT_OUT_RE.test(context) || SAME_AS_RE.test(context)) continue;
          units.push({ kind: 'probe', el, field });
        }
        for (const el of readonlyDateBoxes()) units.push({ kind: 'readonlyDate', el });
        const known = new Set(units.map(u => u.el));
        for (const el of plainDropdownTriggers(known)) units.push({ kind: 'plainDropdown', el });
        const scope = options.fieldScope;
        const inScope = el => {
          if (!scope || (scope.includeRequired !== false && scope.includeOptional !== false)) return true;
          const required = el.required || el.getAttribute('aria-required') === 'true';
          return required ? scope.includeRequired !== false : scope.includeOptional !== false;
        };
        for (const el of signUpPasswordFields(new Set((found.text || []).map(f => f.element)))) if (inScope(el)) units.push({ kind: 'password', el });
      }
      if (root.SFFAAdvancedFiller?.widgetCandidates && options.isolatedMode !== true) {
        const native = new Set(units.map(u => u.el));
        for (const el of root.SFFAAdvancedFiller.widgetCandidates({ fieldScope: options.fieldScope })) {
          if (!native.has(el)) units.push({ kind: 'widget', el });
        }
      }
      return units.filter(u => u.el?.isConnected).sort((a, b) => comparePagePosition(a.el, b.el));
    }
    // Upload cards are often re-drawn after each upload, so the next card's button takes the same place:
    // its name tells them apart.
    const unitKey = unit => `${unit.kind}|${unit.kind === 'file' ? `${unit.field?.label || unit.field?.type || ''}|` : ''}${stableKey(unit.el)}`;

    /** Text-like field: datalist suggestion, pattern/time/range/colour, masked reveal, then the normal value. */
    async function fillText(field) {
      let el = field.element;
      if (!el?.isConnected) return;
      const fieldData = resolveFieldTestData(field, testData, settings);
      if (fieldData === testData) {
        const fromList = fillFromDatalist(field, log, cycleCounters);
        if (fromList) { ok(fromList.type, 'textFilled'); return; }
      }
      // Type-to-search dropdowns (react-select, autocomplete lists): open, type a little, pick an option.
      if (isTypeaheadInput(el)) {
        const value = fieldData[field.type];
        const multiple = el.closest('[class*="multi"], [aria-multiselectable="true"]') != null || /subject|skill|tag|interest/i.test(unitLabel(el));
        if (await fillTypeahead(el, Array.isArray(value) ? value[0] : value, multiple, log)) { ok(field.type || 'autocomplete', 'dropdownsFilled'); return; }
      }
      if (root.SFFAAdvancedFiller && (['time', 'range', 'color'].includes(el.type) || el.pattern)) {
        const proposed = fieldData[field.type] ?? (el.type === 'color' ? '#3366cc' : el.type === 'time' ? '10:00' : el.type === 'range' ? '50' : 'QA123');
        const value = root.SFFAAdvancedFiller.valueFor(el, proposed);
        if (root.SFFAAdvancedFiller.write(el, value)) { ok(field.type || el.type || 'pattern', 'textFilled'); return; }
      }
      el = await revealMaskedFieldIfNeeded(el, log);
      const result = fillTextField(el === field.element ? field : { ...field, element: el }, fieldData, log, cycleCounters);
      if (result.filled && el.value) {
        ok(result.type, 'textFilled');
        log(`✓ Filled "${result.type}"`, 'success');
        return;
      }
      // Masked boxes (DD/MM/YYYY, phone, card…) can wipe values that were not typed: type key by key.
      const text = maskedText(el, field, fieldData);
      if (text && await typeLikeKeys(el, text)) {
        ok(field.type || 'masked', 'textFilled');
        log(`✓ Typed "${unitLabel(el)}" key by key (masked box)`, 'success');
      } else skip(field.type || 'text');
    }

    /** Native or custom dropdown (single or multiple), waiting briefly for options that load late. */
    async function fillDropdown(field) {
      const el = field.element;
      if (!el?.isConnected) return;
      if (el.tagName === 'SELECT') {
        for (let waited = 0; isSelectNotReadyYet(el) && waited < 4000; waited += 150) await sleep(150);
      }
      const type = field.type || '__generic';
      const occurrence = dropdownCounts[type] || 0;
      dropdownCounts[type] = occurrence + 1;
      const fieldData = resolveFieldTestData(field, testData, settings);
      let filled = false;
      try {
        if (el.tagName === 'SELECT' && el.multiple) {
          filled = !!root.SFFAAdvancedFiller?.chooseMany(el, fieldData[field.type], options.multiSelectCount || 2);
        } else if (el.tagName === 'SELECT') {
          filled = field.type === 'targetScore' ? selectMaxNumericOption(el)
            : (occurrence > 0 && selectVariedRealOption(el, occurrence)) || selectDropdownOption(el, fieldData[field.type]);
          if (!filled) filled = selectFirstRealOption(el);
        } else {
          const multi = el.getAttribute('aria-multiselectable') === 'true' || el.hasAttribute('data-multiple') || !!el.querySelector?.('[aria-multiselectable="true"]');
          // Type-to-search dropdowns (react-select & co.): the input inside shows options only after typing.
          const searchBox = isTypeaheadInput(el) ? el : el.querySelector?.('input');
          if (searchBox && isTypeaheadInput(searchBox)) {
            const value = fieldData[field.type];
            filled = await fillTypeahead(searchBox, Array.isArray(value) ? value[0] : value, multi, log);
          }
          const advanced = !filled && multi && root.SFFAAdvancedFiller?.customChoice
            ? await root.SFFAAdvancedFiller.customChoice(field, fieldData, log, { multiSelectCount: options.multiSelectCount || 2 })
            : { ok: false };
          filled = filled || advanced.ok || (await fillCustomDropdown(field, fieldData, log, occurrence)).ok;
        }
      } catch (error) { log(`Dropdown failed: ${error.message}`, 'warn'); }
      if (filled) { ok(field.type, 'dropdownsFilled'); log(`✓ Dropdown "${field.type || el.id || 'unlabeled'}" selected`, 'success'); }
      else { skip(field.type || el.id || 'dropdown'); log(`⚠ Dropdown "${field.type || el.id || 'unlabeled'}" could not be selected`, 'warn'); }
    }

    /** Checkbox group: tick the real options (never "None of the above" or opt-outs). */
    async function fillGroup(group, name) {
      const groupName = group.label || name;
      const choices = group.options.filter(el => !/\bnone( of (the|these) above)?\b|not applicable|\bn\/a\b/.test(checkboxContext(el)) && !OPT_OUT_RE.test(checkboxContext(el)));
      for (const el of choices) { el_checked_or_set(el); await sleep(60); }
      for (const el of choices) if (el.isConnected && !el.checked) { el_checked_or_set(el); await sleep(60); }
      const checked = choices.filter(el => el.isConnected && el.checked).length;
      if (checked) { ok(null, 'checkboxesFilled'); log(`✓ Checked ${checked} option(s) in checkbox group "${groupName}"`, 'success'); }
      else skip(groupName);
    }

    /** Fills one unit with the existing per-type code. */
    async function fillUnit(unit) {
      switch (unit.kind) {
        case 'text': return fillText(unit.field);
        case 'select':
        case 'custom': return fillDropdown(unit.field);
        case 'chain': {
          await fillLocationChain(unit.chain, unit.list, testData, log);
          for (const member of unit.members) {
            const el = member.element;
            if (el.isConnected && el.value && !looksLikePlaceholderOption(el.selectedOptions?.[0] || { value: el.value, text: '' })) ok(member.type, 'dropdownsFilled');
            else skip(member.type || 'dropdown');
          }
          return;
        }
        case 'customChain': {
          await fillCustomLocationChain(unit.chain, unit.list, testData, log);
          for (const member of unit.members) ok(member.type, 'dropdownsFilled');
          return;
        }
        case 'radio':
          if (fillRadioGroup(unit.group, testData, log)) { ok(unit.group.type, 'radiosFilled'); log(`✓ Radio group "${unit.group.type || unit.name}" selected`, 'success'); }
          else skip(unit.group.type || unit.name);
          return;
        case 'checkboxGroup': return fillGroup(unit.group, unit.name);
        case 'file': {
          if (!filesHydrated) { filesHydrated = true; if (options.hydrateFiles && storedFiles?.length) await options.hydrateFiles(storedFiles); }
          const [result] = await fillFileInputs([unit.field], storedFiles, mappings, log, checkCancelled, consumedFilesByType, fileOptions);
          if (!result) return undefined;
          summary.total++;
          if (result.success) summary.filesUploaded++; else summary.skipped.push(result.type || 'file');
          return undefined;
        }
        case 'readonlyDate':
          if (await pickCalendarDate(unit.el, log)) ok('date', 'textFilled'); else skip('date picker');
          return undefined;
        case 'plainDropdown':
          if (await pickPlainDropdown(unit.el, log)) ok(null, 'dropdownsFilled'); else skip('dropdown');
          return undefined;
        case 'password': {
          // Sign-up: every new-password box (and its confirmation) gets the same test password.
          if (passwordValue === null) passwordValue = makeTestPassword();
          if (setNativeValue(unit.el, passwordValue)) { ok('password', 'textFilled'); log('✓ Filled a new-password box (same test password in every password box of this form)', 'success'); }
          else skip('password');
          return undefined;
        }
        case 'widget': {
          const result = await root.SFFAAdvancedFiller.fillWidget(unit.el, settings, widgetGroups);
          if (!result) return;
          if (result.ok) ok(result.kind, 'textFilled'); else summary.skipped.push(result.kind || 'widget');
          if (!result.ok) summary.total++;
          return;
        }
        default: return undefined;
      }
    }

    /** Fills every not-yet-done unit in page order, refreshing the list when the page changes. */
    async function fillPass() {
      let queue = buildUnits(scan()).filter(u => !done.has(unitKey(u)));
      let rescans = 0;
      while (queue.length) {
        checkCancelled();
        if (location.href !== startUrl) {
          summary.stoppedReason = 'The page moved to another address during the fill, so the fill stopped.';
          log(`⚠ ${summary.stoppedReason}`, 'warn');
          return false;
        }
        const unit = queue.shift();
        const key = unitKey(unit);
        if (done.has(key)) continue;
        if (!unit.el?.isConnected) {
          // The page re-drew this field (e.g. the whole card list after an upload): scan again and fill
          // the new copy, instead of dropping it or giving its file to another box.
          if (rescans++ < 500) queue = buildUnits(scan()).filter(u => !done.has(unitKey(u)));
          else if (unit.kind === 'file') { done.add(key); await fillUnit(unit); }
          continue;
        }
        done.add(key);
        if (keepExisting && unitHasValue(unit)) { kept.add(key); continue; }
        if (unit.kind === 'probe') {
          // Tick, and keep it only when new fields appear; otherwise put it back (optional boxes stay unticked).
          const before = new Set(buildUnits(scan()).map(unitKey));
          const watch = watchChanges(areaOf(unit.el));
          el_checked_or_set(unit.el);
          await watch.settle(200, 1000);
          const fresh = buildUnits(scan());
          const revealed = fresh.filter(u => !before.has(unitKey(u)) && u.kind !== 'probe');
          if (revealed.length && unit.el.checked) {
            summary.total++; summary.checkboxesFilled++;
            log(`✓ Ticked "${checkboxName(unit.el)}" because it shows ${revealed.length} more field(s)`, 'success');
            queue = fresh.filter(u => !done.has(unitKey(u)));
          } else if (unit.el.checked) {
            setNativeCheckedState(unit.el, false);
          }
          continue;
        }
        const watch = CONTROLLER_KINDS.has(unit.kind) ? watchChanges(areaOf(unit.el)) : null;
        await fillUnit(unit);
        if (watch && await watch.settle(200, 1000)) {
          // The page changed: new fields appear in place, newly enabled fields below are included,
          // fields that disappeared drop out.
          queue = buildUnits(scan()).filter(u => !done.has(unitKey(u)));
        } else if (queue.some(u => !u.el?.isConnected)) {
          // The page re-drew fields that are still to come (uploads too): scan again.
          queue = buildUnits(scan()).filter(u => !done.has(unitKey(u)));
        }
      }
      return true;
    }

    checkCancelled();
    if (options.isolatedMode !== true && openCollapsedSections(log)) await waitForQuiet(document.body, 200, 1000);
    let keepGoing = await fillPass();

    // Tabs: open each closed tab that holds fields, fill it, then go back to the tab that was open.
    if (keepGoing && options.isolatedMode !== true) {
      const hasFields = node => !!node?.querySelector?.('input:not([type="hidden"]), select, textarea, [contenteditable="true"], [role="combobox"]');
      const lists = new Map();
      for (const tab of document.querySelectorAll('[role="tab"]')) {
        const list = tab.closest('[role="tablist"]') || tab.parentElement;
        if (!lists.has(list)) lists.set(list, []);
        lists.get(list).push(tab);
      }
      for (const tabs of lists.values()) {
        const original = tabs.find(t => t.getAttribute('aria-selected') === 'true');
        let opened = 0;
        for (const tab of tabs) {
          if (tab === original || tab.getAttribute('aria-disabled') === 'true' || !isShown(tab)) continue;
          const panel = document.getElementById(tab.getAttribute('aria-controls') || '');
          if (panel && !hasFields(panel)) continue;
          const watch = watchChanges(document.body);
          tab.click();
          await watch.settle(200, 1000);
          opened++;
          keepGoing = await fillPass();
          if (!keepGoing) break;
        }
        if (opened && original && keepGoing) { original.click(); await waitForQuiet(document.body, 150, 600); }
        if (opened) log(`✓ Filled ${opened} more tab(s), then returned to "${(original?.textContent || '').trim() || 'the first tab'}"`, 'info');
        if (!keepGoing) break;
      }
    }

    // ----- Last: uploads that appeared late, then consent / required checkboxes, then saved credentials and repeat rows.
    if (keepGoing) {
      checkCancelled();
      const files = (scan().file || []).filter(field => field.element && !fileOptions.touchedFileInputs.has(field.element)
        && !done.has(unitKey({ kind: 'file', el: field.element, field })));
      if (files.length && options.hydrateFiles && !filesHydrated) await options.hydrateFiles(storedFiles);
      if (files.length) {
        const fileResults = await fillFileInputs(files, storedFiles, mappings, log, checkCancelled, consumedFilesByType, fileOptions);
        summary.total += fileResults.length;
        summary.filesUploaded += fileResults.filter(r => r.success).length;
        fileResults.filter(r => !r.success).forEach(r => summary.skipped.push(r.type || 'file'));
        if (summary.filesUploaded) await waitForQuiet(document.body, 300, 1500);
      }
      const optionalBoxes = [];
      for (const field of scan().checkboxes || []) {
        const el = field.element;
        if (SAME_AS_RE.test(checkboxContext(el)) && !settings.tickSameAsBoxes) {
          optionalBoxes.push(checkboxName(el));
          log(`Left "${checkboxName(el)}" unticked so the address you typed is kept (setting: Tick "Same as …" boxes)`, 'info');
          continue;
        }
        summary.total++;
        const outcome = fillCheckbox(field, log);
        if (outcome === 'checked' || outcome === 'already') summary.checkboxesFilled++;
        else if (outcome === 'optional') { summary.total--; optionalBoxes.push(checkboxName(el)); }
        else summary.skipped.push('checkbox');
      }
      if (optionalBoxes.length) log(`Left ${optionalBoxes.length} optional checkbox(es) unticked: ${optionalBoxes.slice(0, 3).map(n => `"${n}"`).join(', ')}${optionalBoxes.length > 3 ? '…' : ''}`, 'info');
      if (root.SFFAAdvancedFiller && options.isolatedMode !== true) {
        const credentialResults = await root.SFFAAdvancedFiller.credentials(settings, { credentials: options.credentials || {}, fieldScope: options.fieldScope });
        for (const r of credentialResults) { summary.total++; if (r.ok) summary.textFilled++; else summary.skipped.push(r.kind || 'credential'); }
        const repeatResults = await root.SFFAAdvancedFiller.repeatRows(options, options.isCancelled || (() => false));
        for (const r of repeatResults) { summary.total++; if (r.ok) summary.textFilled++; else summary.skipped.push(r.kind || 'repeatRows'); }
      }
      // Fields that appeared after uploads or ticks: one more pass in page order.
      keepGoing = await fillPass();
    }

    // ----- Final check: retry fields the page or browser still reports, once.
    if (keepGoing) {
      const retry = buildUnits(scan()).filter(u => ['text', 'select', 'custom'].includes(u.kind) && !kept.has(unitKey(u)) && needsRetry(u.el)
        && !NO_RETRY_RE.test(`${unitLabel(u.el)} ${u.el.name || ''} ${u.el.id || ''} ${u.el.getAttribute?.('autocomplete') || ''}`));
      for (const unit of retry) {
        checkCancelled();
        await fillUnit(unit);
        await waitForQuiet(areaOf(unit.el), 150, 600);
        if (needsRetry(unit.el)) summary.stillFailing.push(unitLabel(unit.el));
      }
      if (retry.length) log(`Retried ${retry.length} field(s) the page still reported; ${summary.stillFailing.length} still need attention`, summary.stillFailing.length ? 'warn' : 'info');
      if (summary.stillFailing.length) log(`⚠ Still not accepted: ${summary.stillFailing.map(l => `"${l}"`).join(', ')}`, 'warn');
    }
    summary.kept = kept.size;
    if (kept.size) log(`Kept ${kept.size} field(s) that already had a value (setting: Keep values already in the form)`, 'info');

    const latest = scan();
    summary.actualValues = {};
    for (const field of [...(latest.text || []), ...(latest.select || []), ...(latest.customDropdowns || [])]) {
      const el = field.element;
      if (!el.isConnected || !field.type || ['password', 'otp'].includes(field.type) || !summary.filledTypes.includes(field.type)) continue;
      if (el.tagName === 'SELECT' && (!el.selectedOptions[0] || looksLikePlaceholderOption(el.selectedOptions[0]))) continue;
      const value = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent?.trim() || '') : (el.value || el.textContent?.trim() || '');
      if (!value) continue;
      if (!(field.type in summary.actualValues)) summary.actualValues[field.type] = value;
      else {
        const previous = summary.actualValues[field.type];
        summary.actualValues[field.type] = [...(Array.isArray(previous) ? previous : [previous]), value];
      }
    }
    summary.filledTypes = Array.from(new Set(summary.filledTypes));
    // Keep the caller's view of the form current (verification reads it).
    for (const key of ['text', 'select', 'customDropdowns', 'checkboxes', 'file']) detected[key] = latest[key] || [];
    detected.radioGroups = latest.radioGroups || {};
    detected.checkboxGroups = latest.checkboxGroups || {};
    return summary;
  }

  root.SFFAFormFiller = {
    fillEntireForm,
    fillInPageOrder,
    comparePagePosition,
    setNativeValue,
    setNativeSelectValue,
    setNativeChecked,
    setNativeCheckedState,
    selectDropdownOption,
    selectMaxNumericOption,
    selectFirstRealOption,
    findLocationChain,
    findCustomLocationChain,
    isCustomDropdownEnabled,
    revealMaskedFieldIfNeeded,
    waitFor,
    sleep
  };
})(window);
