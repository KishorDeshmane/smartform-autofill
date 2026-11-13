
(function (root) {
  /** Queries reachable deep DOM scopes when available, falling back to the current document. */
  const queryAll = (selector) => root.SFFADeepDOM?.queryAll
    ? root.SFFADeepDOM.queryAll(selector)
    : Array.from(document.querySelectorAll(selector));
  const FIELD_KEYWORDS = {
    firstName: ['firstname', 'first_name', 'fname', 'first name', 'givenname', 'given name'],
    middleName: ['middlename', 'middle_name', 'mname', 'middle name'],
    lastName: ['lastname', 'last_name', 'lname', 'last name', 'surname', 'familyname'],
    fullName: ['fullname', 'full_name', 'full name', 'applicant name', 'name'],
    fatherName: ["father's name", 'father name', 'fathername', 'guardian name', "guardian's name"],
    motherName: ["mother's name", 'mother name', 'mothername'],
    spouseName: ['spouse name', 'spousename', "spouse's name"],
    email: ['email', 'emailaddress', 'email address', 'e-mail'],
    landline: ['landline', 'landline number', 'landline no', 'std code', 'telephone number', 'residence number'],
    mobile: ['mobile', 'phone', 'contact number', 'cell', 'telephone', 'mobileno', 'mobile number'],
    alternateMobile: ['alternate mobile', 'alternate phone', 'secondary phone', 'whatsapp number', 'whatsapp no', 'alt mobile', 'alternative contact'],
    website: ['website', 'web site', 'portfolio link', 'homepage'],
    organizationName: ['organization', 'organisation', 'company', 'company name', 'org name', 'firm'],
    designation: ['designation', 'job title', 'jobtitle', 'position held', 'position applied'],
    department: ['department', 'dept'],
    occupation: ['occupation', 'profession'],
    qualification: ['qualification', 'highest qualification', 'education level', 'educational qualification'],
    experience: ['years of experience', 'work experience', 'experience (years)', 'total experience'],
    cinNumber: ['registration number (cin)', 'corporate identification number', 'cin number', 'cin'],
    llpinNumber: ['registration number (llpin)', 'llp identification number', 'llpin'],
    registrationNumber: ['registrationnumber', 'registration number', 'regno', 'reg no', 'registration id'],
    referenceNumber: ['reference number', 'ref number', 'refno', 'reference no', 'reference id'],
    paymentReference: ['paymentreference', 'payment reference', 'transaction id', 'utr', 'payment ref'],
    bankAccountNumber: ['account number', 'bank account number', 'accountno', 'account no'],
    ifscCode: ['ifsc code', 'ifsc'],
    bankName: ['bank name', 'bankname'],
    gstNumber: ['gstin', 'gst number', 'gst no'],
    creditCardNumber: ['credit card', 'card number', 'cc number', 'payment card'],
    iban: ['iban', 'international bank account'],
    epfNumber: ['epf registration number', 'epf number', 'epf no', 'epfo number', 'provident fund number', 'pf number', 'pf registration number'],
    esiNumber: ['esi registration number', 'esi number', 'esi no', 'esic number', 'employee state insurance number'],
    vehicleNumber: ['vehicle number', 'vehicle no', 'vehicle registration'],
    country: ['country'],
    state: ['state', 'province'],
    district: ['district'],
    city: ['city', 'town'],
    pinCode: ['pincode', 'pin code', 'zip', 'zipcode', 'postal code', 'postalcode'],
    addressLine: ['address', 'street', 'addressline', 'address line', 'address line 1'],
    addressLine2: ['address line 2', 'addressline2', 'landmark', 'locality', 'apartment/suite'],
    panNumber: ['pan (permanent account number)', 'permanent account number', 'pan number', 'pan card number', 'pan'],
    identityType: ['identity type', 'id type', 'document type', 'proof type'],
    identityNumber: ['identity', 'id proof', 'idproof', 'aadhaar', 'aadhar', 'identity number'],
    gender: ['gender', 'sex'],
    age: ['age', 'your age'],
    dateOfBirth: ['dob', 'date of birth', 'birthdate', 'birth date'],
    validUntil: ['valid until', 'valid till', 'valid upto', 'valid up to', 'validity date', 'expiry date', 'expiration date'],
    issueDate: ['issue date', 'date of issue', 'issued on', 'issued date'],
    registrationDate: ['registration date', 'date of registration', 'reg date'],
    incorporationDate: ['date of incorporation', 'incorporation date', 'date of establishment', 'establishment date'],
    effectiveDate: ['effective date', 'effective from', 'commencement date'],
    startDate: ['start date', 'date from', 'from date', 'starting date'],
    endDate: ['end date', 'date to', 'to date', 'ending date', 'closing date'],
    maritalStatus: ['marital status'],
    nationality: ['nationality'],
    bloodGroup: ['blood group', 'bloodgroup'],
    emergencyContactName: ['emergency contact name', 'emergency contact person'],
    emergencyContactNumber: ['emergency contact number', 'emergency phone', 'emergency contact no'],
    nomineeName: ['nominee name', 'nomineename'],
    subject: ['subject'],
    message: ['message', 'comments', 'additional comments', 'feedback', 'description', 'additional information'],
    caption: ['caption', 'brief description'],
    observation: ['observation', 'record your observation', 'remarks', 'remark'],
    justification: ['justification', 'rationale', 'explain the rationale', 'reason for score', 'reason for the score', 'basis for score'],
    targetScore: ['target score', 'select target score'],
    designProvision: ['design provision', 'proposed plan', 'proposed measures'],
    supportingReference: ['supporting document reference', 'response / supporting document reference'],
    numberOfTowers: ['number of towers', 'no. of towers', 'no of towers', 'total towers'],
    totalFloors: ['total floors', 'number of floors', 'no. of floors', 'no of floors'],
    totalUnits: ['total units', 'number of units', 'no. of units', 'no of units'],
    totalPlotArea: ['total plot area', 'plot area (site area)', 'site area', 'plot area'],
    totalBuiltUpArea: ['total built-up area', 'built-up area', 'built up area', 'builtup area']
  };

  const TYPE_ATTRIBUTE_FALLBACK = {
    email: 'email',
    tel: 'mobile',
    url: 'website'
  };

  const DATE_INPUT_TYPES = ['date', 'month', 'week', 'datetime-local'];

  const DATE_SEMANTIC_TYPES = [
    'dateOfBirth', 'validUntil', 'issueDate', 'registrationDate',
    'incorporationDate', 'effectiveDate', 'startDate', 'endDate', 'genericDate'
  ];

  const FILE_KEYWORDS = (root.SFFAFileTypes && root.SFFAFileTypes.FILE_KEYWORDS) || (function () {
    console.warn('SFFAFileTypes not loaded before form-detector.js - falling back to an empty file-type list. Check manifest.json script order.');
    return {};
  })();

  /** Infers an upload category from the file input's accept attribute. */
  function inferFileTypeFromAccept(el) {
    const tokens = (el.getAttribute('accept') || '').toLowerCase().split(',').map(token => token.trim()).filter(Boolean);
    if (!tokens.length) return null;
    const imageTokens = tokens.map(token => token.startsWith('image/') || /^\.(?:jpe?g|png|webp|gif)$/.test(token));
    const documentTokens = tokens.map(token => /pdf|msword|wordprocessingml|excel|spreadsheet|text\/csv|text\/plain/.test(token)
      || /^\.(?:pdf|docx?|xlsx?|csv|txt)$/.test(token));
    if (imageTokens.every(Boolean)) return 'photo';
    if (documentTokens.every(Boolean)) return 'evidenceDocument';
    return 'genericFile';
  }

  /** Normalizes descriptive text for case-insensitive classification. */
  function normalize(str) {
    return (str || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /** Resolves an ARIA reference within the control's own document or shadow root. */
  function getRootElementById(el, id) {
    const scope = el.getRootNode();
    return scope.getElementById?.(id) || (scope === el.ownerDocument ? el.ownerDocument.getElementById(id) : null);
  }

  /** Collects label and ARIA-referenced text associated with a control. */
  function getLabelText(el) {
    let text = '';
    const scope = el.getRootNode();
    if (el.labels && el.labels.length) {
      text += ' ' + Array.from(el.labels).map(l => l.textContent).join(' ');
    }
    if (el.id) {
      const lbl = scope.querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) text += ' ' + lbl.textContent;
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(' ').forEach(id => {
        const ref = getRootElementById(el, id);
        if (ref) text += ' ' + ref.textContent;
      });
    }
    return text;
  }

  // Controls whose text belongs to *another* field. Text inside a container that holds one of these
  // is not evidence about the current field (it used to make every field in a form share one type).
  const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, [contenteditable="true"], [contenteditable=""]';
  const NEARBY_TEXT_LIMIT = 300;

  /** True when `candidate` is a different field (options of the same radio/checkbox group are not). */
  function isOtherControl(candidate, el) {
    if (candidate === el) return false;
    const groupType = (el.type || '').toLowerCase();
    if ((groupType === 'radio' || groupType === 'checkbox') && el.name && candidate.name === el.name && candidate.type === el.type) return false;
    return true;
  }

  // Per-detection-run cache of each container's controls. Many fields share the same large container,
  // so querying it once per run (instead of once per field) keeps detection roughly linear.
  let controlsCache = null;

  /** Returns the controls inside `node`, cached for the current detection run. */
  function controlsIn(node) {
    if (!controlsCache) return node.querySelectorAll(CONTROL_SELECTOR);
    let list = controlsCache.get(node);
    if (!list) { list = Array.from(node.querySelectorAll(CONTROL_SELECTOR)); controlsCache.set(node, list); }
    return list;
  }

  /** True when `node` contains a form control other than `el` (or other options of its own group). */
  function containsOtherControl(node, el) {
    for (const candidate of controlsIn(node)) {
      if (isOtherControl(candidate, el)) return true;
    }
    return false;
  }

  /** Reads up to `limit` characters of text under `node` without cloning the DOM. */
  function boundedText(node, limit = NEARBY_TEXT_LIMIT) {
    const walker = (node.ownerDocument || document).createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */);
    let text = '';
    for (let current = walker.nextNode(); current && text.length < limit; current = walker.nextNode()) {
      if (current.parentElement?.closest('select, option, textarea, script, style, noscript, template')) continue;
      text += ' ' + current.textContent;
    }
    return text.slice(0, limit);
  }

  /**
   * Collects text near a control as extra classification evidence:
   * - its own container, climbing at most 3 levels but stopping before any container that also holds
   *   another field (so the "Email" label of a neighbouring field is never used for this field), and
   * - the element just before the field (or before its container), e.g. <span>Email</span><input>,
   *   when that element is not itself another field.
   */
  function getNearbyText(el) {
    let scope = null;
    for (let node = el.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      if (containsOtherControl(node, el)) break;
      scope = node;
    }
    let text = scope ? boundedText(scope) : '';
    const previous = (scope || el).previousElementSibling;
    if (previous && !previous.matches(CONTROL_SELECTOR) && !containsOtherControl(previous, el)) {
      text += ' ' + boundedText(previous);
    }
    return text.slice(0, NEARBY_TEXT_LIMIT * 2);
  }

  /** Extracts nearby upload-card text while avoiding text shared by unrelated file inputs. */
  function getFileCardScopeText(el, allFileInputs) {
    let scopeNode = el.parentElement;
    let candidate = scopeNode ? scopeNode.parentElement : null;
    let guard = 0;
    while (candidate && guard < 12) {
      const containedCount = allFileInputs.filter(fi => candidate.contains(fi)).length;
      if (containedCount > 1) break;
      scopeNode = candidate;
      candidate = candidate.parentElement;
      guard++;
    }
    if (!scopeNode) return '';
    const clone = scopeNode.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, script, style').forEach(n => n.remove());
    return clone.textContent;
  }

  /** Builds a normalized signature from a control's labels and descriptive attributes. */
  function buildLabelSignature(el) {
    const parts = [getLabelText(el), el.getAttribute('aria-label')];
    return normalize(parts.filter(Boolean).join(' '));
  }

  /** Combines field metadata and surrounding text into a classification signature. */
  function buildFieldSignature(el) {
    const parts = [
      el.id, el.name, el.placeholder,
      el.getAttribute('autocomplete'), el.getAttribute('data-testid'),
      el.getAttribute('title'), el.getAttribute('data-cy'), el.getAttribute('data-qa'),
      el.getAttribute('data-field'), el.getAttribute('data-name'),
      el.getAttribute('data-test'), el.getAttribute('data-test-id'),
      el.getAttribute('data-automation-id'), el.getAttribute('data-qa-id'),
      el.getAttribute('data-e2e'), el.getAttribute('data-pw'),
      el.getAttribute('aria-describedby') && el.getAttribute('aria-describedby').split(/\s+/)
        .map(id => getRootElementById(el, id))
        .filter(Boolean).map(node => node.textContent).join(' ')
    ];
    return normalize(parts.filter(Boolean).join(' '));
  }

  // Compiled once per keyword; building a RegExp on every call dominated detection time.
  const KEYWORD_PATTERNS = new Map();

  /** Checks for a keyword as a bounded phrase in normalized text. */
  function keywordAppearsIn(text, keyword) {
    if (!text) return false;
    if (keyword.includes(' ')) return text.includes(keyword);
    if (!text.includes(keyword)) return false; // cheap pre-check before the boundary regex
    let pattern = KEYWORD_PATTERNS.get(keyword);
    if (!pattern) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
      KEYWORD_PATTERNS.set(keyword, pattern);
    }
    return pattern.test(text);
  }

  /** Scores candidate keywords against label, field, and nearby text signals. */
  function scoreKeywordMatch(labelSig, signature, nearbyText, keywords) {
    let best = 0;
    for (const kw of keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (keywordAppearsIn(labelSig, k)) {
        best = Math.max(best, 4);
      } else if (keywordAppearsIn(signature, k)) {
        best = Math.max(best, k.length >= 6 ? 3 : 2);
      } else if (keywordAppearsIn(nearbyText, k)) {
        best = Math.max(best, 1);
      }
    }
    return best;
  }

  /** Heuristically classifies a control from metadata, nearby text, and configured keywords. */
  function classifyField(el, keywordMap, nearbyTextOverride) {
    const labelSig = buildLabelSignature(el);
    const signature = buildFieldSignature(el);
    const nearbyText = normalize(nearbyTextOverride !== undefined ? nearbyTextOverride : getNearbyText(el));
    let bestType = null;
    let bestScore = 0;
    for (const [type, keywords] of Object.entries(keywordMap)) {
      const score = scoreKeywordMatch(labelSig, signature, nearbyText, keywords);
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    if (bestScore > 0) {
      const isDateEl = el.tagName === 'INPUT'
        && DATE_INPUT_TYPES.includes((el.getAttribute('type') || '').toLowerCase());
      if (!isDateEl || DATE_SEMANTIC_TYPES.includes(bestType)) {
        return { type: bestType, score: bestScore };
      }
    }

    if (el.tagName === 'INPUT' && el.type === 'file') {
      const acceptFallback = inferFileTypeFromAccept(el);
      return { type: acceptFallback || 'genericFile', score: acceptFallback ? 0.5 : 0.25 };
    } else if (el.tagName === 'INPUT' && DATE_INPUT_TYPES.includes((el.getAttribute('type') || '').toLowerCase())) {
      return { type: 'genericDate', score: 0.5 };
    } else {
      const typeFallback = TYPE_ATTRIBUTE_FALLBACK[(el.getAttribute('type') || '').toLowerCase()];
      if (typeFallback) return { type: typeFallback, score: 0.5 };

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const attrType = (el.getAttribute('type') || '').toLowerCase();
        const inputMode = (el.getAttribute('inputmode') || '').toLowerCase();
        const pattern = el.getAttribute('pattern') || '';
        const combinedText = `${signature} ${nearbyText}`;
        const isNumericAttr = attrType === 'number' || inputMode === 'numeric' || inputMode === 'decimal'
          || /^\^?\\?d/.test(pattern);
        const looksLikeCount = /\b(?:number|no\.?)\s*of\b/.test(combinedText)
          || /\btotal\b.{0,20}\b(?:towers?|floors?|storeys?|stories?|units?|rooms?|bedrooms?|bathrooms?|employees?|vehicles?|members?|occupants?)\b/.test(combinedText)
          || /\b(?:quantity|qty|no\.?\s*of\b)/.test(combinedText);
        if (isNumericAttr || looksLikeCount) {
          return { type: 'genericNumber', score: 0.5 };
        }
      }
    }
    return null;
  }

  /** Combines built-in upload keywords with user-provided keyword mappings. */
  function mergeFileKeywords(extra) {
    const merged = {};
    for (const [type, keywords] of Object.entries(FILE_KEYWORDS)) {
      merged[type] = [...keywords];
    }
    for (const [keyword, type] of Object.entries(extra)) {
      if (!merged[type]) merged[type] = [];
      merged[type].push(keyword);
    }
    return merged;
  }

  /** Infers a date format hint from the control's placeholder or related attributes. */
  function detectDatePlaceholderFormat(el) {
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return null;
    const attrType = (el.getAttribute('type') || '').toLowerCase();
    if (DATE_INPUT_TYPES.includes(attrType)) return null;
    const candidates = [
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-format')
    ].filter(Boolean).map(v => v.trim().toLowerCase());

    // A date already in the box shows the expected format, e.g. "11 Nov 2026" (React date pickers).
    const current = (el.value || '').trim();
    if (/^\d{1,2} [A-Za-z]{3} \d{4}$/.test(current)) return { tokens: ['dd', 'mon', 'yyyy'], separator: ' ' };
    if (/^[A-Za-z]{3} \d{1,2}, \d{4}$/.test(current)) return { tokens: ['mon', 'dd,', 'yyyy'], separator: ' ' };
    for (const ph of candidates) {
      let m = ph.match(/^(dd|mm|yyyy|yy)([/\-. :])(dd|mm|yyyy|yy)\2(dd|mm|yyyy|yy)$/);
      if (m) return { tokens: [m[1], m[3], m[4]], separator: m[2] };
      m = ph.match(/^(ddmmyyyy|mmddyyyy|yyyymmdd|ddmmyy|mmddyy)$/);
      if (m) {
        const tokenLen = { d: 2, m: 2, y: ph.includes('yyyy') ? 4 : 2 };
        const tokens = [];
        let rest = m[1];
        while (rest.length) {
          const c = rest[0];
          const len = c === 'y' ? tokenLen.y : 2;
          tokens.push(rest.slice(0, len) === 'dd' ? 'dd' : rest.slice(0, len) === 'mm' ? 'mm' : (len === 4 ? 'yyyy' : 'yy'));
          rest = rest.slice(len);
        }
        return { tokens, separator: '' };
      }
    }
    return null;
  }

  /** Field types that take one short value; a textarea is never one of these. */
  const SHORT_VALUE_TYPES = new Set(['landline', 'mobile', 'alternateMobile', 'emergencyContactNumber', 'pinCode', 'age',
    'cinNumber', 'llpinNumber', 'bankAccountNumber', 'ifscCode', 'gstNumber', 'creditCardNumber', 'iban', 'epfNumber', 'esiNumber',
    'vehicleNumber', 'panNumber', 'identityNumber', 'dateOfBirth', 'validUntil', 'issueDate', 'registrationDate', 'incorporationDate',
    'effectiveDate', 'startDate', 'endDate', 'numberOfTowers', 'totalFloors', 'totalUnits']);

  /** Pop-up calendars of date-picker libraries: their month/year boxes are not form fields. */
  const DATEPICKER_POPUP = '.react-datepicker__month-container, .react-datepicker-popper, .react-datepicker__header, .flatpickr-calendar, .ui-datepicker, .datepicker-dropdown, .pika-single, .daterangepicker, .mat-datepicker-content, .MuiPickersPopper-root';

  /** Checks visibility through ancestors, computed style, and the element's rendered box. */
  function isVisible(el) {
    if (!el) return false;
    const view = el.ownerDocument?.defaultView || window;
    for (let node = el; node; node = node.parentElement || node.getRootNode?.().host) {
      if (node.hidden || node.inert) return false;
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  /** Flags controls that appear hidden or otherwise likely to be honeypot fields. */
  function isHoneypot(el) {
    if (!el) return false;
    const marker = [el.id, el.name, el.className, el.getAttribute('data-testid'), el.getAttribute('aria-label')]
      .filter(value => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    return /(?:honey\s?-?pot|bot\s?-?trap|anti\s?-?bot|hp[-_ ]?field)/i.test(marker);
  }

  /** Excludes file inputs nested inside elements marked as honeypot traps. */
  const REPLACE_FILE_RE = /\b(replace|re-?upload|change (the )?(file|document))\b/i;
  const UPLOAD_TRIGGER_RE = /^(?:\+\s*)?(browse(?: files?)?|upload(?: (?:a |the )?(?:file|files|document|documents))?|choose (?:a )?files?|select (?:a )?files?|attach(?: (?:a )?files?)?|add (?:a )?(?:file|files|document))$/i;

  /** Accessible text of a control: aria-label, title, then visible text. */
  function controlText(el) {
    return String(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * True for a file input that replaces a document that is already uploaded (for example a hidden
   * input inside a "Replace document" label). Normal fills leave these alone so they never overwrite
   * a file the user already uploaded or signed.
   */
  function isReplaceFileInput(el) {
    for (let node = el.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      if (node.matches('label, button, [role="button"]') && REPLACE_FILE_RE.test(controlText(node))) return true;
    }
    return REPLACE_FILE_RE.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`);
  }

  /**
   * Upload cards that only have a "Browse Files" / "Upload" button and share one hidden file input
   * elsewhere on the page (common in React apps: the button remembers which document it is for,
   * then opens the shared input). Each such button becomes its own file field:
   * { element: sharedInput, trigger: button, type, label, viaTrigger: true }.
   * The ambiguous plain entry for the shared input is removed so it is not filled blindly.
   */
  function addTriggerFileFields(results, allFileInputEls, fileKeywordMap) {
    const usable = allFileInputEls.filter(el => !el.matches(':disabled') && !isFileUploadHoneypot(el) && !isReplaceFileInput(el));
    if (!usable.length) return;
    const triggers = queryAll('button, [role="button"], a, label').filter(el =>
      isVisible(el) && !el.matches(':disabled') && el.getAttribute('aria-disabled') !== 'true'
      && UPLOAD_TRIGGER_RE.test(controlText(el))
      && !el.querySelector('input[type="file"]')
      && !(el.tagName === 'LABEL' && (el.htmlFor || el.control))
      // Never a link that navigates away, or a submit button that would send the form.
      && !(el.tagName === 'A' && el.getAttribute('href') && !/^(#|javascript:)/i.test(el.getAttribute('href')))
      && !(el.tagName === 'BUTTON' && el.type === 'submit' && el.form));
    if (!triggers.length) return;
    // Page order (top to bottom), so documents are uploaded in the order the tester sees them.
    triggers.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
    const sharedInputs = new Set();
    for (const trigger of triggers) {
      // The trigger's card: the largest ancestor that holds no other trigger.
      let card = trigger;
      while (card.parentElement && card.parentElement !== document.body
        && !triggers.some(other => other !== trigger && card.parentElement.contains(other))) card = card.parentElement;
      if (usable.some(input => card.contains(input))) continue; // the card has its own input: handled above
      // The shared input: the nearest file input found while walking up from the card.
      let input = null;
      for (let node = card.parentElement; node && !input; node = node.parentElement) {
        input = usable.find(candidate => node.contains(candidate)) || null;
      }
      if (!input) continue;
      const heading = card.querySelector('h1, h2, h3, h4, h5, h6, legend, [role="heading"]');
      const label = (heading ? controlText(heading) : '').slice(0, 80);
      const clone = card.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, script, style, button').forEach(n => n.remove());
      const classification = classifyField(input, fileKeywordMap, `${label} ${clone.textContent}`);
      results.file.push({
        element: input,
        trigger,
        label: label || controlText(trigger),
        type: classification ? classification.type : null,
        score: classification ? classification.score : 0,
        multiple: !!input.multiple,
        viaTrigger: true
      });
      sharedInputs.add(input);
    }
    if (sharedInputs.size) results.file = results.file.filter(field => field.viaTrigger || !sharedInputs.has(field.element));
  }

  function isFileUploadHoneypot(el) {
    for (let node = el; node; node = node.parentElement || node.getRootNode?.().host) {
      if (isHoneypot(node)) return true;
    }
    return false;
  }

    /** Finds supported controls and returns descriptors classified with supplied settings. */
    /** Finds supported controls; caches container lookups for the duration of one run. */
    function detectFormFields(customSelectors, extraFileKeywords) {
      controlsCache = new WeakMap();
      try { return detectFormFieldsOnce(customSelectors, extraFileKeywords); }
      finally { controlsCache = null; }
    }

    function detectFormFieldsOnce(customSelectors, extraFileKeywords) {
    const fileKeywordMap = extraFileKeywords ? mergeFileKeywords(extraFileKeywords) : FILE_KEYWORDS;
    const results = {
      text: [],
      select: [],
      radioGroups: {},
      checkboxes: [],
      checkboxGroups: {},
      file: [],
      customDropdowns: []
    };

    const textSelectors = 'input[type="text"], input[type="email"], input[type="tel"], ' +
      'input[type="url"], input[type="number"], input[type="date"], input[type="month"], ' +
      'input[type="week"], input[type="datetime-local"], input[type="color"], input[type="range"], input[type="time"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]';

    queryAll(textSelectors).forEach(el => {
      if (!isVisible(el) || isHoneypot(el) || el.matches(':disabled') || el.readOnly || el.getAttribute('aria-disabled') === 'true') return;
      if (el.closest(DATEPICKER_POPUP)) return; // a calendar's own month/year boxes, not form fields
      let classification = classifyField(el, FIELD_KEYWORDS);
      // An email box whose placeholder is "name@example.com" must not become a name field.
      const emailHint = el.type === 'email' || /@/.test(el.getAttribute('placeholder') || '') || /e-?mail/i.test(`${el.id} ${el.name}`);
      if (emailHint && classification?.type !== 'email') classification = { type: 'email', score: Math.max(0.9, classification?.score || 0) };
      // A multi-line answer box is never a phone, PIN or ID box, even when its question says "mobile coverage".
      if (el.tagName === 'TEXTAREA' && SHORT_VALUE_TYPES.has(classification?.type)) classification = null;
      let dateFormat = detectDatePlaceholderFormat(el);
      // A text box called "date" with no format hint: use a day equal to the month, so DD/MM and MM/DD read the same.
      if (!dateFormat && !classification && el.tagName === 'INPUT' && /\bdate\b|datepicker|date-picker/i.test(`${el.id} ${el.name} ${el.className} ${(el.labels?.[0]?.textContent || '')}`)) {
        dateFormat = { tokens: ['dd', 'mm', 'yyyy'], separator: '/', assumed: true };
      }
      results.text.push({
        element: el,
        type: classification ? classification.type : (dateFormat ? 'genericDate' : null),
        score: classification ? classification.score : (dateFormat ? 0.5 : 0),
        dateFormat: dateFormat || undefined
      });
    });

    const SAFE_PASSWORD_SEMANTIC_TYPES = new Set([
      'panNumber', 'gstNumber', 'cinNumber', 'llpinNumber', 'registrationNumber',
      'referenceNumber', 'paymentReference', 'bankAccountNumber', 'ifscCode',
      'epfNumber', 'esiNumber', 'vehicleNumber', 'identityNumber',
      'mobile', 'alternateMobile', 'landline', 'email'
    ]);
    const CREDENTIAL_HINT_KEYWORDS = [
      'password', 'pwd', 'passcode', 'current password', 'new password',
      'confirm password', 'retype password', 'old password',
      'one time password', 'one-time password', 'otp',
      'security pin', 'transaction pin', 'login pin', 'atm pin', 'card pin'
    ];
    /** Heuristically checks field metadata for username, password, or login indicators. */
    function looksLikeCredentialField(el) {
      const haystack = normalize([buildLabelSignature(el), buildFieldSignature(el)].join(' '));
      return CREDENTIAL_HINT_KEYWORDS.some(k => keywordAppearsIn(haystack, normalize(k)));
    }

    queryAll('input[type="password"]').forEach(el => {
      if (!isVisible(el) || isHoneypot(el) || el.matches(':disabled') || el.readOnly) return;
      const classification = classifyField(el, FIELD_KEYWORDS);
      const type = classification ? classification.type : null;
      if (!type || !SAFE_PASSWORD_SEMANTIC_TYPES.has(type)) return;
      if (looksLikeCredentialField(el)) return;
      results.text.push({
        element: el,
        type,
        score: classification.score,
        maskedField: true
      });
    });

    queryAll('select').forEach(el => {
      if (el.closest(DATEPICKER_POPUP)) return;
      if (!isVisible(el) || isHoneypot(el)) return;
      const classification = classifyField(el, FIELD_KEYWORDS);
      results.select.push({
        element: el,
        type: classification ? classification.type : null,
        score: classification ? classification.score : 0
      });
    });

    queryAll('input[type="radio"]').forEach(el => {
      if (!isVisible(el) || isHoneypot(el) || el.matches(':disabled')) return;
      const scope = el.form ? Array.from(document.forms).indexOf(el.form) : 'page';
      const name = `${scope}:${el.name || '__unnamed_' + (el.id || Array.from(queryAll('input[type=radio]')).indexOf(el))}`;
      if (!results.radioGroups[name]) {
        const classification = classifyField(el, FIELD_KEYWORDS);
        results.radioGroups[name] = {
          type: classification ? classification.type : null,
          options: []
        };
      }
      results.radioGroups[name].options.push(el);
    });

    const visibleCheckboxes = [];
    queryAll('input[type="checkbox"]').forEach(el => {
      if (!isVisible(el) || isHoneypot(el) || el.matches(':disabled')) return;
      visibleCheckboxes.push(el);
    });

    const byName = new Map();
    const unnamed = [];
    visibleCheckboxes.forEach(el => {
      if (el.name) {
        const scope = el.form ? Array.from(document.forms).indexOf(el.form) : 'page';
        const key = `${scope}:${el.name}`;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(el);
      } else {
        unnamed.push(el);
      }
    });

    /** Finds a nearby container that also contains at least one supplied sibling control. */
    function nearestSharedContainer(el, siblingPool) {
      let node = el.parentElement;
      let depth = 0;
      while (node && depth < 4) {
        if (node.matches('fieldset, [role="group"], [role="radiogroup"]') && siblingPool.filter(c => node.contains(c)).length > 1) return node;
        if (node.matches('form, body')) return null;
        node = node.parentElement;
        depth++;
      }
      return null;
    }

    const grouped = new Set();
    let groupIndex = 0;
    for (const [name, els] of byName) {
      if (els.length > 1) {
        results.checkboxGroups[name] = { options: els };
        els.forEach(el => grouped.add(el));
      }
    }
    /**
     * Also a group: the nearest plain container (e.g. a flex-wrap <div> of <label><input> Telecom</label>
     * items) that holds several of these checkboxes and no other kind of input.
     */
    function nearestOptionList(el, siblingPool) {
      let node = el.parentElement;
      for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        if (node.matches('form, body')) return null;
        if (siblingPool.filter(c => node.contains(c)).length > 1) {
          return node.querySelector('input:not([type="checkbox"]):not([type="hidden"]), select, textarea') ? null : node;
        }
      }
      return null;
    }

    const containerGroups = new Map();
    unnamed.forEach(el => {
      const container = nearestSharedContainer(el, unnamed) || nearestOptionList(el, unnamed);
      if (!container) return;
      if (!containerGroups.has(container)) containerGroups.set(container, []);
      containerGroups.get(container).push(el);
    });
    for (const [container, els] of containerGroups) {
      if (els.length > 1) {
        // A readable group name for the log: legend, ARIA label, or the text just before the group.
        const legend = container.querySelector(':scope > legend')?.textContent
          || container.getAttribute('aria-label')
          || (container.getAttribute('aria-labelledby') && document.getElementById(container.getAttribute('aria-labelledby'))?.textContent)
          || container.previousElementSibling?.textContent || '';
        const label = legend.replace(/\s+/g, ' ').trim().slice(0, 60);
        results.checkboxGroups[`__group_${groupIndex++}`] = { options: els, ...(label ? { label } : {}) };
        els.forEach(el => grouped.add(el));
      }
    }

    visibleCheckboxes.forEach(el => {
      if (!grouped.has(el)) results.checkboxes.push({ element: el });
    });

    const allFileInputEls = Array.from(queryAll('input[type="file"]'));
    allFileInputEls.forEach(el => {
      if (el.matches(':disabled') || isFileUploadHoneypot(el)) return;
      const cardScopeText = getFileCardScopeText(el, allFileInputEls);
      const classification = classifyField(el, fileKeywordMap, cardScopeText);
      results.file.push({
        element: el,
        type: classification ? classification.type : null,
        score: classification ? classification.score : 0,
        multiple: !!el.multiple,
        replacesExisting: isReplaceFileInput(el)
      });
    });
    addTriggerFileFields(results, allFileInputEls, fileKeywordMap);

    queryAll('[role="combobox"], [role="listbox"], [aria-haspopup="listbox"]').forEach(el => {
      if (!isVisible(el) || isHoneypot(el) || el.tagName === 'SELECT') return;
      if (el.getAttribute('role') === 'listbox') return;
      if (el.parentElement?.closest('[role="combobox"], [aria-haspopup="listbox"]')) return;
      results.text = results.text.filter(f => f.element !== el && !el.contains(f.element));
      const classification = classifyField(el, FIELD_KEYWORDS);
      results.customDropdowns.push({
        element: el,
        type: classification ? classification.type : null,
        score: classification ? classification.score : 0
      });
    });

    if (customSelectors) {
      for (const [type, selector] of Object.entries(customSelectors)) {
        try {
          const scopedFileMatches = queryAll(selector).filter(el => el.matches('input[type="file"]'));
          for (const fileEl of scopedFileMatches) {
            if (fileEl.matches(':disabled') || isFileUploadHoneypot(fileEl)) continue;
            results.file = results.file.filter(field => field.element !== fileEl);
            results.file.push({ element: fileEl, type, score: 99, multiple: !!fileEl.multiple });
          }
          const el = document.querySelector(selector);
          if (el && !(el.matches('input[type="file"]') ? isFileUploadHoneypot(el) : isHoneypot(el))
            && (isVisible(el) || (el.tagName === 'INPUT' && el.type === 'file'))) {
            const kind = el.tagName === 'SELECT' ? 'select'
              : el.matches('input[type="file"]') ? 'file'
              : el.matches('[role="combobox"], [aria-haspopup="listbox"]') ? 'customDropdowns'
              : el.matches('input:not([type="radio"]):not([type="checkbox"]), textarea') ? 'text' : null;
            if (!kind) continue;
            if (kind === 'file' && results.file.some(field => field.element === el)) continue;
            for (const key of ['text', 'select', 'file', 'customDropdowns']) {
              results[key] = results[key].filter(f => f.element !== el);
            }
            results[kind].push({ element: el, type, score: 99, multiple: !!el.multiple });
          }
        } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
      }
    }

    for (const key of ['text', 'select', 'file', 'customDropdowns']) {
      // Browse-button cards share one input, so they are ordered by their button instead.
      results[key].sort((a, b) => {
        const x = a.trigger || a.element, y = b.trigger || b.element;
        if (x === y) return 0;
        return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
      });
    }
    return results;
  }

  root.SFFAFormDetector = {
    detectFormFields,
    classifyField,
    isVisible,
    isHoneypot,
    detectDatePlaceholderFormat,
    FIELD_KEYWORDS,
    FILE_KEYWORDS,
    normalize
  };
})(window);
