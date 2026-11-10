(function (root) {
  /** Queries the document and reachable deep DOM scopes when the helper is available. */
  const deepQueryAll = (selector) => root.SFFADeepDOM?.queryAll
    ? root.SFFADeepDOM.queryAll(selector)
    : Array.from(document.querySelectorAll(selector));

  const COMMON_WORDS = new Set(('the and for with this that from your are was were have has not all page form field select choose enter name email phone address city state country date please next submit save cancel login logout search required password number text value option user account registration checkout dashboard').split(' '));
  const COMMON_TYPOS = new Map(Object.entries({recieve:'receive',adress:'address',seperate:'separate',occured:'occurred',sucess:'success',succesful:'successful',avilable:'available',calender:'calendar',definately:'definitely', recieve:'receive', enviroment:'environment', responsiblity:'responsibility', accomodate:'accommodate', goverment:'government', existance:'existence', occured:'occurred', requirment:'requirement', adresss:'address', passwrod:'password', emial:'email', phne:'phone', counrty:'country', dropdownn:'dropdown', submti:'submit', logn:'login', registartion:'registration', validaton:'validation', messsage:'message', disbaled:'disabled', readonlly:'readonly', placehoder:'placeholder', chekbox:'checkbox', radiao:'radio', uplod:'upload', succesfuly:'successfully', erro:'error', laoding:'loading', speling:'spelling', accesibility:'accessibility', explortory:'exploratory', tesing:'testing', functonality:'functionality', navigaton:'navigation', requred:'required', opton:'option', defualt:'default', dependecy:'dependency', verfication:'verification', authentcation:'authentication', notifcation:'notification', respons:'response', submision:'submission', serach:'search', dashbord:'dashboard', passowrd:'password', contcat:'contact', mobil:'mobile', numbr:'number', dat:'date', timee:'time', chek:'check', lable:'label', titlle:'title', heder:'header', footr:'footer', buton:'button', cancle:'cancel', delet:'delete', confrm:'confirm', updat:'update', creat:'create', editng:'editing', filtter:'filter', paginaton:'pagination', sortng:'sorting', sesson:'session', securty:'security', privcy:'privacy', permision:'permission', authorizaton:'authorization', integraton:'integration', regresion:'regression', boundry:'boundary', negtive:'negative', positve:'positive', scenrio:'scenario', expeced:'expected', reslt:'result', preconditon:'precondition', descripton:'description', attchment:'attachment', documnt:'document', imag:'image', lnk:'link', hrefh:'href', iframee:'iframe', shadw:'shadow', widgt:'widget', richtext:'rich text', credntial:'credential', onee:'one'}));
  for (const [misspelling, correction] of Object.entries({
    accomodation:'accommodation', acheive:'achieve', apparent:'apparent', begining:'beginning', beleive:'believe', calulate:'calculate', comming:'coming', compatable:'compatible', concious:'conscious', dissapear:'disappear', embarass:'embarrass', familar:'familiar', finaly:'finally', freind:'friend', happend:'happened', independant:'independent', knowlege:'knowledge', lisence:'license', mispell:'misspell', neccessary:'necessary', occassion:'occasion', occured:'occurred', persue:'pursue', recieve:'receive', recomend:'recommend', refered:'referred', relevent:'relevant', seperate:'separate', succes:'success', sucess:'success', succesful:'successful', tommorow:'tomorrow', transfered:'transferred', untill:'until', wierd:'weird', wich:'which', writting:'writing', adress:'address', adressing:'addressing', arguement:'argument', goverment:'government', maintenence:'maintenance', occurrance:'occurrence', priviledge:'privilege', pronounciation:'pronunciation', publically:'publicly', responsibile:'responsible', seperate:'separate', supercede:'supersede', thier:'their', truely:'truly', useage:'usage', vaccuum:'vacuum', wether:'whether', acheivement:'achievement', accomodate:'accommodate', calender:'calendar', definately:'definitely', enviroment:'environment', existance:'existence', occured:'occurred', seperate:'separate'
  })) COMMON_TYPOS.set(misspelling, correction);
  /** Redacts sensitive URL components for inclusion in the QA report. */
  function reportUrl(value) {
    try { const u = new URL(value, location.href); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : u.protocol + '[redacted]'; }
    catch (_) { return '[invalid URL]'; }
  }
  /** Produces a bounded description of a link for exploratory page checks. */
  function describeLink(a, index) {
    const raw = a.getAttribute('href');
    const text = (a.getAttribute('aria-label') || a.textContent || a.querySelector('img[alt]')?.alt || a.title || '').trim();
    const reasons = [];
    if (raw === null || !raw.trim()) reasons.push('Missing or empty href');
    else if (raw.trim() === '#') reasons.push('Placeholder destination (#)');
    else if (/^javascript:/i.test(raw.trim())) reasons.push('JavaScript destination; navigation requires manual review');
    if (!text) reasons.push('Missing accessible link name');
    return { text: text || '(unnamed link)', href: raw === null || !raw.trim() ? '(empty href)' : reportUrl(a.href), locator: `a (page order ${index + 1})`, reasons };
  }
  /** Returns heuristic page-level checks based on visible links, forms, and content. */
  function exploratoryChecks(settings = {}) {
    const visibleText = Array.from(document.body?.querySelectorAll('*') || [])
      .filter(el => el.children.length === 0 && isVisible(el)).map(el => el.textContent.trim()).filter(Boolean).join(' ');
    const spelling = [];
    const ignoredWords = new Set((settings.spellingIgnoreList || []).map(word => String(word).toLowerCase()));
    const customWords = new Set((settings.spellingDictionary || []).map(word => String(word).toLowerCase()));
    for (const word of visibleText.match(/[A-Za-z]{4,}/g) || []) {
      const lower = word.toLowerCase();
      if (ignoredWords.has(lower) || customWords.has(lower)) continue;
      if (COMMON_TYPOS.has(lower)) spelling.push({ word, suggestion: COMMON_TYPOS.get(lower), reason: 'Common spelling mistake', severity: 'Low', confidence: 'Medium' });
      else if (/([a-z])\1\1/.test(lower) && !COMMON_WORDS.has(lower)) spelling.push({ word, reason: 'Repeated character; review possible typo', severity: 'Low', confidence: 'Low' });

    }
    const links = Array.from(document.querySelectorAll('a')).map(describeLink);
    const images = Array.from(document.images).map((img, index) => ({src:reportUrl(img.currentSrc||img.src), text:img.alt || '(unnamed image)', locator:`img (page order ${index + 1})`, loaded:img.complete && img.naturalWidth>0, pending:!img.complete}));
    return { spelling, links, invalidLinks: links.filter(x => x.reasons.length), brokenImages: images.filter(x => !x.loaded && !x.pending), pendingImages: images.filter(x => x.pending), linkStatus: 'HTTP status checks require page/network permission and are not assumed successful' };
  }

  /** Fetches a bounded number of same-origin links and records basic response outcomes. */
  async function checkSameOriginLinks(timeoutMs=2000, maxChecks=25, budgetMs=12000, onProgress=null) {
    const deadline=Date.now()+Math.max(1000,budgetMs);
    let completed=0;
    const links=Array.from(document.querySelectorAll('a[href]')).map(a=>a.href).filter(Boolean);
    const unique=[...new Set(links)];
    const out=new Array(unique.length);
    const sameOrigin=[];
    const origin=location.origin;
    for(let index=0;index<unique.length;index++) {
      const href=unique[index];
      let u; try { u=new URL(href); } catch (_) { out[index]={href,status:'unverified',reason:'invalid URL'}; continue; }
      if(u.origin!==origin) out[index]={href,status:'unverified',reason:'cross-origin'};
      else sameOrigin.push({index,href:u.href});
    }
    const checks=sameOrigin.slice(0,Math.max(0,maxChecks));
    for(const {index,href} of sameOrigin.slice(checks.length)) {
      out[index]={href,status:'unverified',reason:`scan limit reached (${maxChecks} same-origin URLs)`};
    }
    let next=0;
    /** Processes the next queued link until the scan limit or deadline is reached. */
    async function checkNext() {
      while(next<checks.length) {
        const {index,href}=checks[next++];
        if (Date.now()>deadline) {
          out[index]={href,status:'unverified',reason:'not checked (scan time limit reached)'};
          completed++; try { onProgress?.(completed, checks.length); } catch (_) { /* Progress is optional. */ }
          continue;
        }
        const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeoutMs);
        try {
          let response=await fetch(href,{method:'HEAD',credentials:'same-origin',signal:ctl.signal});
          let method='HEAD';
          if ([403,405,501].includes(response.status)) {
            response=await fetch(href,{method:'GET',headers:{Range:'bytes=0-0'},credentials:'same-origin',signal:ctl.signal});
            method='GET (HEAD unsupported)';
          }
          out[index]={href,status:response.status,ok:response.ok,method};
        }
        catch(e) {
          if (e.name==='AbortError') out[index]={href,status:'unavailable',reason:'timeout'};
          else {
            try {
              const retryController=new AbortController();
              const retryTimer=setTimeout(()=>retryController.abort(),timeoutMs);
              const response=await fetch(href,{method:'HEAD',credentials:'same-origin',signal:retryController.signal});
              clearTimeout(retryTimer);
              out[index]={href,status:response.status,ok:response.ok,method:'HEAD (retry)'};
            } catch (_) { out[index]={href,status:'unavailable',reason:'Network check unavailable after one retry'}; }
          }
        }
        finally { clearTimeout(timer); completed++; try { onProgress?.(completed, checks.length); } catch (_) { /* Progress is optional. */ } }
      }
    }
    await Promise.all(Array.from({length:Math.min(5,checks.length)},()=>checkNext()));
    return out.filter(Boolean).map(item => {
      const link = Array.from(document.querySelectorAll('a[href]')).find(a => a.href === item.href);
      return {...item, text:link ? describeLink(link, 0).text : '(link destination)', href:reportUrl(item.href)};
    });
  }
  /** Summarizes page metadata and visible form context for QA results. */
  function detectPageContext() {
    const text = `${document.title} ${document.body?.innerText || ''}`.toLowerCase();
    if (/checkout|cart|payment|billing/.test(text)) return 'checkout';
    if (/sign in|login|log in/.test(text)) return 'login';
    if (/register|sign up|create account|registration/.test(text)) return 'registration';
    if (/dashboard|analytics|reports/.test(text)) return 'dashboard';
    if (/search|filter results/.test(text)) return 'search';
    return 'general';
  }
  /** Identifies page signals such as sensitive fields and external form actions. */
  function detectSecurityBoundaries() {
    const text = `${document.title} ${document.body?.innerText || ''}`.toLowerCase();
    const captcha = !!document.querySelector('[name*="captcha" i], [id*="captcha" i], iframe[src*="captcha" i], iframe[src*="recaptcha" i]') || /captcha|i am not a robot|verify you are human/.test(text);
    const mfa = !!document.querySelector('input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i]') || /two-factor|multi-factor|verification code|one-time password/.test(text);
    const frames = Array.from(document.querySelectorAll('iframe'));
    const inaccessibleFrames = frames.filter(frame => { try { return !frame.contentDocument; } catch (_) { return true; } }).length;
    const openShadowHosts = Array.from(document.querySelectorAll('*')).filter(el => !!el.shadowRoot).length;
    return { captcha, mfa, inaccessibleFrames, openShadowHosts, backendValidation: 'unverified — API/business rules require site-specific evidence' };
  }
  /** Converts a numeric confidence score to the engine's confidence label. */
  function scoreToConfidence(score) {
    if (score === 99) return { percent: 99, tier: 'HIGH' };
    if (score >= 4) return { percent: 95, tier: 'HIGH' };
    if (score === 3) return { percent: 82, tier: 'HIGH' };
    if (score === 2) return { percent: 68, tier: 'MEDIUM' };
    if (score === 1) return { percent: 50, tier: 'MEDIUM' };
    if (score === 0.5) return { percent: 38, tier: 'LOW' };
    if (score === 0.25) return { percent: 22, tier: 'LOW' };
    return { percent: 0, tier: 'NONE' };
  }

  const MAX_FIELD_LIST = 200;

  /** Stable per-page key shared by the scan list and post-fill verification (no field values). */
  function fieldKey(el) {
    if (!el) return '';
    try { return root.SFFADeepDOM?.key ? root.SFFADeepDOM.key(el) : (el.id ? `#${el.id}` : `${el.tagName}:${el.name || ''}`); }
    catch (_) { return `${el.tagName}:${el.name || el.id || ''}`; }
  }

  /** Best-effort CSS selector for display and test export. */
  function fieldSelector(el) {
    try { return root.SFFASelectorEngine?.inspect(el)?.selector || ''; } catch (_) { return ''; }
  }

  /**
   * Flattens detected controls into a bounded list for the popup:
   * { key, label, type, kind, required, selector, confidence }. Field values are never included.
   */
  function listDetectedFields(detected) {
    const out = [];
    /** Adds one control to the list until the cap is reached. */
    const add = (el, kind, type, score, labelOverride) => {
      if (!el || out.length >= MAX_FIELD_LIST) return;
      const confidence = type ? scoreToConfidence(score).tier : 'NONE';
      out.push({
        key: fieldKey(el),
        label: String(labelOverride || fieldLabel({ element: el, type })).slice(0, 120),
        type: type || '',
        kind,
        required: isRequired(el),
        selector: fieldSelector(el),
        confidence: confidence === 'NONE' ? 'LOW' : confidence
      });
    };
    for (const field of detected.text || []) {
      const el = field.element;
      const kind = el?.tagName === 'TEXTAREA' ? 'textarea' : el?.isContentEditable ? 'richtext' : (el?.type || 'text');
      add(el, kind, field.type, field.score);
    }
    for (const field of detected.select || []) add(field.element, 'select', field.type, field.score);
    for (const field of detected.customDropdowns || []) add(field.element, 'select', field.type, field.score);
    for (const [name, group] of Object.entries(detected.radioGroups || {})) add(group.options?.[0], 'radio', group.type, group.type ? 2 : 0, group.type || name.split(':').pop());
    for (const field of detected.checkboxes || []) add(field.element, 'checkbox', field.type, field.score ?? 1);
    for (const [name, group] of Object.entries(detected.checkboxGroups || {})) add(group.options?.[0], 'checkbox', group.type, 1, name.split(':').pop());
    for (const field of detected.file || []) {
      // Cards with only a Browse button share one input: list each card by its button and heading.
      if (field.viaTrigger) add(field.trigger, 'file', field.type, field.score ?? 1, field.label);
      else add(field.element, 'file', field.type, field.score ?? 1, field.replacesExisting ? `${fieldLabel(field)} (replace — skipped)` : undefined);
    }
    const total = (detected.text || []).length + (detected.select || []).length + (detected.customDropdowns || []).length
      + Object.keys(detected.radioGroups || {}).length + (detected.checkboxes || []).length
      + Object.keys(detected.checkboxGroups || {}).length + (detected.file || []).length;
    return { fields: out, total, truncated: total > out.length };
  }

  /** Text of a <label> that wraps the control, excluding the text of nested controls/options. */
  function wrappingLabelText(el) {
    const label = el.closest?.('label');
    if (!label) return '';
    let text = '';
    const walker = label.ownerDocument.createTreeWalker(label, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('select, option, button, textarea')) continue;
      text += ` ${node.textContent}`;
    }
    return text.replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  }

  /** Text referenced by aria-labelledby, if any. */
  function labelledByText(el) {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const scope = el.getRootNode?.() || el.ownerDocument;
    return ids.map(id => (scope.getElementById?.(id) || el.ownerDocument.getElementById(id))?.textContent?.trim() || '').filter(Boolean).join(' ');
  }

  /** Resolves display text for a detected field from its label and metadata. */
  function fieldLabel(field) {
    if (field.viaTrigger && field.label) return String(field.label).slice(0, 80);
    const el = field.element;
    if (!el) return field.type || '(unknown field)';
    const explicit = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text = (explicit && explicit.textContent.trim())
      || wrappingLabelText(el)
      || el.getAttribute('aria-label')
      || labelledByText(el)
      || el.placeholder
      || el.name
      || el.id
      || field.type
      || el.tagName.toLowerCase();
    return (text || '').toString().trim().slice(0, 80) || (field.type || 'unnamed field');
  }

  /** Checks a field's rendered visibility, including hidden ancestors. */
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  /** Checks native and ARIA indicators that mark a control as required. */
  function isRequired(el) {
    return !!(el.required || el.getAttribute('aria-required') === 'true');
  }

  /** Creates an identity key used to match an element across DOM state changes. */
  function stateIdentity(element) {
    const ownerDocument = element.ownerDocument || document;
    const frameUrl = ownerDocument.defaultView?.location?.href || '';
    if (element.id) return { key: `${frameUrl}::id:${element.id}`, id: element.id, ownerDocument };
    const signature = {
      frameUrl,
      tagName: element.tagName,
      type: element.type || '',
      name: element.name || '',
      autocomplete: element.getAttribute('autocomplete') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      placeholder: element.getAttribute('placeholder') || ''
    };
    const peers = Array.from(ownerDocument.querySelectorAll(signature.tagName)).filter(peer =>
      (peer.type || '') === signature.type && (peer.name || '') === signature.name
      && (peer.getAttribute('autocomplete') || '') === signature.autocomplete
      && (peer.getAttribute('aria-label') || '') === signature.ariaLabel
      && (peer.getAttribute('placeholder') || '') === signature.placeholder
    );
    signature.occurrence = Math.max(0, peers.indexOf(element));
    return { key: JSON.stringify(signature), signature, ownerDocument };
  }

  /** Resolves a saved state descriptor back to its current DOM element when possible. */
  function resolveStateElement(item) {
    if (item.element?.isConnected) return item.element;
    const ownerDocument = item.identity?.ownerDocument || document;
    if (item.identity?.id) return ownerDocument.getElementById(item.identity.id);
    const signature = item.identity?.signature;
    if (!signature) return null;
    const peers = Array.from(ownerDocument.querySelectorAll(signature.tagName)).filter(peer =>
      (peer.type || '') === signature.type && (peer.name || '') === signature.name
      && (peer.getAttribute('autocomplete') || '') === signature.autocomplete
      && (peer.getAttribute('aria-label') || '') === signature.ariaLabel
      && (peer.getAttribute('placeholder') || '') === signature.placeholder
    );
    return peers[signature.occurrence] || null;
  }

  /** Captures current values and states for detected fields before a QA scenario runs. */
  function captureDetectedState(detected) {
    const fields = [
      ...(detected.text || []), ...(detected.select || []),
      ...(detected.checkboxes || []), ...(detected.file || [])
    ];
    for (const group of Object.values(detected.radioGroups || {})) fields.push(...(group.options || []));
    for (const group of Object.values(detected.checkboxGroups || {})) fields.push(...(group.options || []));

    const seen = new Set();
    const state = [];
    const skipped = [];
    for (const field of fields) {
      const element = field?.element || field;
      if (!element || seen.has(element)) continue;
      seen.add(element);
      const identity = stateIdentity(element);
      if (!element.isConnected) {
        skipped.push(fieldLabel(field.element ? field : { element }));
        continue;
      }
      if (element.matches?.('input[type="file"]')) {
        skipped.push(`${fieldLabel(field.element ? field : { element })} (file selection cannot be restored)`);
        continue;
      }
      if (element.matches?.('[contenteditable="true"], [contenteditable=""]')) {
        state.push({ element, identity, kind: 'textContent', value: element.textContent || '' });
      } else if (element.matches?.('input, textarea, select')) {
        const kind = element.matches('select') ? 'select'
          : element.matches('input[type="checkbox"], input[type="radio"]') ? 'checked' : 'value';
        state.push({ element, identity, kind, value: element.value, checked: !!element.checked,
          selectedIndices: kind === 'select' ? Array.from(element.options).flatMap((option, index) => option.selected ? [index] : []) : null });
      } else {
        skipped.push(`${fieldLabel(field.element ? field : { element })} (custom widget state is not safely reversible)`);
      }
    }
    return { state, skipped };
  }

  /** Filters detected fields to those whose captured state can be safely restored. */
  function getRestorableDetectedFields(detected, includeFiles = false) {
    /** Checks whether a field element matches the supplied native-control selector. */
    const isNative = (field, selector) => !!field?.element?.matches?.(selector);
    const result = { ...detected, skippedForIsolation: [] };
    result.text = (detected.text || []).filter(field => {
      const supported = isNative(field, 'input:not([type="file"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"], [contenteditable=""]');
      if (!supported) result.skippedForIsolation.push(fieldLabel(field));
      return supported;
    });
    result.select = (detected.select || []).filter(field => {
      const supported = isNative(field, 'select');
      if (!supported) result.skippedForIsolation.push(fieldLabel(field));
      return supported;
    });
    result.customDropdowns = [];
    (detected.customDropdowns || []).forEach(field => result.skippedForIsolation.push(fieldLabel(field)));
    result.file = includeFiles ? [...(detected.file || [])] : [];
    if (!includeFiles) (detected.file || []).forEach(field => result.skippedForIsolation.push(`${fieldLabel(field)} (file cases run only in the positive phase)`));

    result.checkboxes = (detected.checkboxes || []).filter(field => {
      const supported = isNative(field, 'input[type="checkbox"]');
      if (!supported) result.skippedForIsolation.push(fieldLabel(field));
      return supported;
    });
    /** Filters option groups to supported native controls and records excluded groups. */
    const filterGroups = (groups, selector) => Object.fromEntries(Object.entries(groups || {}).flatMap(([name, group]) => {
      const options = (group.options || []).filter(option => option?.matches?.(selector));
      if (options.length !== (group.options || []).length) result.skippedForIsolation.push(name);
      return options.length ? [[name, { ...group, options }]] : [];
    }));
    result.radioGroups = filterGroups(detected.radioGroups, 'input[type="radio"]');
    result.checkboxGroups = filterGroups(detected.checkboxGroups, 'input[type="checkbox"]');
    return result;
  }

  /** Restores captured field values and states, reporting failures through the logger. */
  async function restoreDetectedState(snapshot, log = () => {}) {
    const filler = root.SFFAFormFiller;
    const restored = [];
    const skipped = [...(snapshot?.skipped || [])];
    for (const item of snapshot?.state || []) {
      const element = resolveStateElement(item);
      if (!element?.isConnected) {
        skipped.push(`Could not resolve field ${item.identity?.key || '(unknown)'} after rerender`);
        continue;
      }

      let ok = false;
      if (item.kind === 'checked') {
        ok = filler.setNativeCheckedState(element, item.checked, { allowNonEditable: true });
      } else if (item.kind === 'select' && element.multiple) {
        const selected = new Set(item.selectedIndices || []);
        Array.from(element.options).forEach((option, index) => { option.selected = selected.has(index); });
        const EventConstructor = element.ownerDocument?.defaultView?.Event || Event;
        element.dispatchEvent(new EventConstructor('input', { bubbles: true }));
        element.dispatchEvent(new EventConstructor('change', { bubbles: true }));
        ok = (item.selectedIndices || []).every(index => element.options[index]?.selected)
          && Array.from(element.options).every((option, index) => option.selected === selected.has(index));
      } else if (item.kind === 'select') {
        ok = filler.setNativeSelectValue(element, item.value, { allowPlaceholder: true, allowNonEditable: true });
      } else if (item.kind === 'textContent') {
        ok = filler.setNativeValue(element, item.value, { allowNonEditable: true });
      } else {
        ok = filler.setNativeValue(element, item.value, { allowNonEditable: true });
      }

      if (ok) restored.push(element);
      else skipped.push(fieldLabel({ element }));
    }
    if (skipped.length) log(`⚠ ${skipped.length} field state(s) could not be fully restored`, 'warn');
    return { restored: restored.length, skipped };
  }

  /** Filters detected fields according to required/optional scope settings. */
  function filterDetectedFieldsByScope(detected, scope) {
    // Normal fill passes `null` (no scope). A default parameter only covers `undefined`, so guard explicitly.
    scope = scope || {};
    const includeRequired = scope.includeRequired !== false;
    const includeOptional = scope.includeOptional !== false;
    if (includeRequired && includeOptional) return detected;

    /** Adds an eligible field to the scan collection with its scope context. */
    const include = field => {
      const elements = field?.options || (field?.element ? [field.element] : []);
      const required = field?.required === true || elements.some(el => {
        const group = el?.closest?.('[role="group"], [role="radiogroup"], fieldset');
        return !!el?.required || el?.getAttribute?.('aria-required') === 'true'
          || group?.getAttribute?.('aria-required') === 'true';
      });
      return required ? includeRequired : includeOptional;
    };
    const filtered = { ...detected };

    for (const key of ['text', 'select', 'customDropdowns', 'checkboxes', 'file']) {
      if (Array.isArray(detected[key])) filtered[key] = detected[key].filter(include);
    }
    for (const key of ['radioGroups', 'checkboxGroups']) {
      if (detected[key] && typeof detected[key] === 'object') {
        filtered[key] = Object.fromEntries(Object.entries(detected[key]).filter(([, group]) => include(group)));
      }
    }

    return filtered;
  }

  /** Collects accessible iframe document scopes while skipping cross-origin access failures. */
  function scanIframes() {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    let accessible = 0, inaccessible = 0;
    for (const f of iframes) {
      try {
        if (f.contentDocument) accessible++; else inaccessible++;
      } catch (e) {
        inaccessible++;
      }
    }
    return { total: iframes.length, accessible, inaccessible };
  }

  /** Collects reachable open shadow-root scopes for the QA scan. */
  function scanShadowDom() {
    let hosts = 0, fieldsInside = 0;
    /** Traverses a collected scope and its eligible nested roots within scan limits. */
    const walk = (root) => {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          hosts++;
          fieldsInside += el.shadowRoot.querySelectorAll('input, select, textarea').length;
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);
    return { openShadowHosts: hosts, fieldsInsideOpenShadow: fieldsInside };
  }

  /** Finds visible controls whose labels suggest submit, purchase, delete, or other risky actions. */
  function findRiskyButtons() {
    const RISKY_WORDS = ['submit', 'confirm', 'delete', 'remove', 'cancel', 'logout', 'log out', 'deactivate',
      'reject', 'pay', 'purchase', 'checkout', 'place order', 'confirm payment', 'unsubscribe', 'terminate'];
    const candidates = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a');
    const found = [];
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase();
      if (!text) continue;
      const hit = RISKY_WORDS.find(w => text.includes(w));
      if (hit) found.push({ label: text.slice(0, 60), matchedKeyword: hit });

    }
    return found;
  }

  /** Runs page scans and returns heuristic findings, context, field data, and coverage metadata. */
  function scanPage(customSelectors, extraFileKeywords, settings = {}, precomputedDetection = null) {
    const t0 = performance.now();
    // Callers that already detected fields pass the result in, so one scan detects only once.
    const detected = precomputedDetection || root.SFFAFormDetector.detectFormFields(customSelectors, extraFileKeywords);

    const allInputs = deepQueryAll('input, select, textarea');
    const required = allInputs.filter(isRequired).length;
    const disabled = allInputs.filter(el => el.disabled).length;
    const readonly = allInputs.filter(el => el.readOnly).length;
    const hidden = allInputs.filter(el => el.type === 'hidden' || !isVisible(el)).length;

    const radioNames = new Set(deepQueryAll('input[type="radio"]').map(r => r.name || r.id));
    const forms = deepQueryAll('form').length;

    const allDetectedFields = [
      ...detected.text,
      ...detected.select,
      ...detected.customDropdowns,
      ...detected.file
    ];
    const withConfidence = allDetectedFields.map(f => {
      const c = scoreToConfidence(f.score || 0);
      return {
        label: fieldLabel(f),
        type: f.type || null,
        tier: c.tier,
        confidence: c.percent,
        required: f.element ? isRequired(f.element) : false,
        disabled: f.element ? !!f.element.disabled : false,
        readonly: f.element ? !!f.element.readOnly : false
      };
    });

    const lowConfidence = withConfidence.filter(f => f.tier === 'LOW' || f.tier === 'NONE');
    const recognizedElements = new Set(allDetectedFields.map(f => f.element).filter(Boolean));
    const requiredUnrecognized = allInputs.filter(el =>
      isRequired(el) && el.type !== 'hidden' && isVisible(el) && !recognizedElements.has(el)
    );

    const iframeInfo = scanIframes();
    const shadowInfo = scanShadowDom();
    const riskyButtons = findRiskyButtons();

    const potentialIssues = [];
    if (lowConfidence.length) {
      potentialIssues.push(`${lowConfidence.length} field(s) detected with LOW confidence - review before relying on auto-fill`);
    }
    if (requiredUnrecognized.length) {
      potentialIssues.push(`${requiredUnrecognized.length} required field(s) could not be semantically classified and may be skipped`);
    }
    if (iframeInfo.inaccessible) {
      potentialIssues.push(`${iframeInfo.inaccessible} iframe(s) are cross-origin and cannot be scanned (browser security boundary)`);
    }
    if (riskyButtons.length) {
      potentialIssues.push(`${riskyButtons.length} potentially destructive button(s) found on the page (e.g. Delete/Cancel/Pay) - these are never auto-clicked`);
    }

    const exploratory = exploratoryChecks(settings);
    if (exploratory.spelling.length) potentialIssues.push(`${exploratory.spelling.length} possible spelling issue(s) found`);
    if (exploratory.invalidLinks.length) potentialIssues.push(`${exploratory.invalidLinks.length} invalid/empty link(s) found`);
    if (exploratory.brokenImages.length) potentialIssues.push(`${exploratory.brokenImages.length} image(s) failed to load`);
    const securityBoundaries = detectSecurityBoundaries();
    if (securityBoundaries.captcha) potentialIssues.push('CAPTCHA detected — manual completion required; automatic bypass is disabled');
    if (securityBoundaries.mfa) potentialIssues.push('MFA/OTP flow detected — manual verification may be required');
    if (securityBoundaries.inaccessibleFrames) potentialIssues.push(`${securityBoundaries.inaccessibleFrames} iframe(s) are inaccessible and remain unverified`);
    const issueDetails = [
      ...lowConfidence.map(f => ({text:f.label, reason:'Low-confidence field classification; review before autofill', status:'Warning'})),
      ...requiredUnrecognized.map(el => ({text:fieldLabel({element:el}), reason:'Required field not recognized', status:'Warning'})),
      ...riskyButtons.map(b => ({text:b.label, reason:'Potentially destructive action: '+b.matchedKeyword, status:'Review'})),
      ...exploratory.invalidLinks.map(x => ({...x, reason:x.reasons.join('; '), status:'Warning'})),
      ...exploratory.brokenImages.map(x => ({...x, reason:'Image completed without decoded image data', status:'Failed'})),
      ...exploratory.spelling.map(x => ({text:x.word, reason:x.reason+(x.suggestion?' → '+x.suggestion:''), status:'Review'}))
    ];
    if (iframeInfo.inaccessible) issueDetails.push({text:'Inaccessible iframes',reason:`${iframeInfo.inaccessible} frame(s) could not be inspected`,status:'Unverified'});
    if (securityBoundaries.captcha) issueDetails.push({text:'CAPTCHA',reason:'Manual completion required',status:'Unverified'});
    if (securityBoundaries.mfa) issueDetails.push({text:'MFA / OTP',reason:'Manual verification may be required',status:'Unverified'});
    return {
      durationMs: Math.round(performance.now() - t0),
      forms,
      inputs: allInputs.filter(el => el.type !== 'hidden').length,
      textareas: deepQueryAll('textarea').length,
      dropdowns: detected.select.length,
      customDropdowns: detected.customDropdowns.length,
      radioGroups: radioNames.size,
      checkboxes: deepQueryAll('input[type="checkbox"]').length,
      fileUploads: detected.file.length,
      required,
      disabled,
      readonly,
      hidden,
      iframes: iframeInfo,
      shadowDom: shadowInfo,
      riskyButtons,
      potentialIssues,
      issueDetails,
      exploratory,
      pageContext: detectPageContext(),
      securityBoundaries,
      lowConfidenceFields: lowConfidence,
      fieldCount: withConfidence.length
    };
  }

  /** Maps a detected field descriptor to a scenario category used by QA generation. */
  function classifyCategory(field) {
    const el = field?.element;
    if (!el) return 'text';
    if (el.tagName === 'INPUT' && el.type === 'file') return 'file';
    if (el.tagName === 'TEXTAREA') return 'longtext';
    if (el.tagName === 'INPUT' && ['date', 'month', 'week', 'datetime-local', 'time'].includes(el.type)) return 'date';
    const t = (field.type || '').toLowerCase();
    if (el.tagName === 'INPUT' && el.type === 'password') return 'password';
    if (t === 'email') return 'email';
    if (t === 'pannumber' || /\bpan\b/.test(t)) return 'pan';
    if (t === 'ifsccode' || /ifsc/.test(t)) return 'ifsc';
    if (t === 'gstnumber' || /gst/.test(t)) return 'gst';
    if (t === 'pincode' || /pin.?code|postal|zip/.test(t)) return 'pincode';
    if (/aadhaar|aadhar/.test(t) || /aadhaar|aadhar/i.test(`${el.name || ''} ${el.id || ''} ${fieldLabel(field)}`)) return 'aadhaar';
    if (t === 'website' || (el.tagName === 'INPUT' && el.type === 'url')) return 'url';
    if (/^(firstname|middlename|lastname|fullname|fathername|mothername|spousename|nomineename|emergencycontactname)$/.test(t)) return 'name';
    if (/mobile|phone|landline|whatsapp/.test(t)) return 'mobile';
    if (/date/.test(t)) return 'date';
    if (el.tagName === 'INPUT' && (['number', 'range'].includes(el.type) || /^(numeric|decimal)$/.test(el.getAttribute('inputmode') || ''))) return 'number';
    if (/pincode|age|experience|amount|count|score/.test(t)) return 'number';
    return 'text';
  }

  const NEGATIVE_SCENARIOS = {
    email: ['invalid-email', 'abc@', '@test.com', 'test@@gmail.com'],
    mobile: ['12345', '123456789', 'abcdefghij', '0000000000'],
    text: ['', '   ', '<script>alert(1)</script>', "' OR '1'='1", 'A'.repeat(10000)],
    longtext: ['', '   ', '<script>alert(1)</script>', "' OR '1'='1", 'A'.repeat(10000)],
    number: ['-1', '0', 'abcXYZ', '!@#$%', '999999999999999'],
    date: ['31-31-9999', '2099-12-31', '1800-01-01', '31/02/2024'],
    password: ['abc', '12345678', 'password', 'Password', '        '],
    url: ['example', 'htp://example.com', 'http//example.com', 'https://exa mple.com', 'javascript:alert(1)'],
    name: ['12345', '@#$%&', 'A', '   ', '<b>Priya</b>'],
    pincode: ['12345', '1234567', 'abcdef', '000000', '41 1001'],
    pan: ['ABCDE1234', 'ABCDE12345', '12345ABCDE', 'ABCD@1234F', 'abcde1234f'],
    aadhaar: ['12345678901', '1234567890123', 'abcdefghijkl', '000000000000'],
    gst: ['27ABCDE1234F1Z', '27ABCDE1234F1Z55', 'ABCDE1234F1Z527', '27abcde1234f1z5'],
    ifsc: ['SBIN012345', 'SBIN1234567', '1234SBIN567', 'SBIN0@12345']
  };
  const NEGATIVE_LABELS = {
    email: ['missing @/domain', 'incomplete domain', 'missing local part', 'double @'],
    mobile: ['too short', 'too long', 'non-numeric', 'all zeros'],
    text: ['empty (required-field check)', 'spaces only', 'inert HTML-like text', 'inert SQL-like text', 'oversized text'],
    longtext: ['empty (required-field check)', 'spaces only', 'inert HTML-like text', 'inert SQL-like text', 'oversized text'],
    number: ['negative', 'zero', 'alphabetic', 'special characters', 'very large number'],
    date: ['invalid date', 'future date', 'far-past date', 'wrong format'],
    password: ['too short', 'digits only', 'common word', 'no number or symbol', 'spaces only'],
    url: ['no scheme or domain ending', 'misspelt scheme', 'missing colon', 'space inside', 'script link'],
    name: ['digits only', 'symbols only', 'single letter', 'spaces only (required-field check)', 'HTML-like text'],
    pincode: ['5 digits', '7 digits', 'letters', 'all zeros', 'space inside'],
    pan: ['too short', 'digit instead of last letter', 'wrong order', 'special character', 'lowercase letters'],
    aadhaar: ['11 digits', '13 digits', 'letters', 'all zeros'],
    gst: ['too short', 'too long', 'wrong order', 'lowercase letters'],
    ifsc: ['too short', '5th character not 0', 'wrong order', 'special character']
  };

  /** Generates candidate boundary values from the field type and declared constraints. */
  function boundaryValuesFor(field) {
    const el = field.element;
    const category = classifyCategory(field);
    const declaredMaxLength = el && el.maxLength > 0 ? el.maxLength : null;
    const maxLen = declaredMaxLength ? Math.min(declaredMaxLength, 10000) : null;
    const minLen = el && el.minLength > 0 ? el.minLength : null;
    const min = el && el.min !== '' && Number.isFinite(Number(el.min)) ? Number(el.min) : null;
    const max = el && el.max !== '' && Number.isFinite(Number(el.max)) ? Number(el.max) : null;

    if (category === 'number') {
      const type = (el?.type || '').toLowerCase();
      const stepText = el?.step || '1';
      const step = stepText === 'any' ? 1 : Number(stepText);
      const delta = Number.isFinite(step) && step > 0 ? step : 1;
      const lower = min ?? 0;
      const upper = max ?? (type === 'range' ? 100 : 999999);
      /** Formats numeric boundary samples without unnecessary decimal places. */
      const format = value => String(Number(value.toFixed(8)));
      const values = [
        { label: 'minimum - 1', value: format(lower - 1) },
        { label: 'minimum allowed value', value: format(lower) },
        { label: 'minimum + 1', value: format(lower + 1) },
        { label: 'maximum - 1', value: format(upper - 1) },
        { label: 'maximum allowed value', value: format(upper) },
        { label: 'maximum + 1', value: format(upper + 1) },
        { label: 'one step below minimum', value: format(lower - delta) },
        { label: 'one step above minimum', value: format(lower + delta) },
        { label: 'one step below maximum', value: format(upper - delta) },
        { label: 'one step above maximum', value: format(upper + delta) },
        { label: 'step misalignment', value: format(lower + delta / 2) }
      ];
      if (type === 'range' || el?.step !== 'any') values.push({ label: 'step-aligned value', value: format(lower + delta * 2) });
      return values;
    }
    if (category === 'date') {
      const type = (el?.type || '').toLowerCase();
      if (type === 'time') {
        /** Converts an HH:MM string to minutes after midnight, or null when invalid. */
        const toMinutes = value => {
          const match = String(value || '').match(/^(\d{2}):(\d{2})/);
          return match ? Number(match[1]) * 60 + Number(match[2]) : null;
        };
        /** Formats a minute offset as a wrapped HH:MM time. */
        const fromMinutes = value => `${String(Math.floor(((value % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((value % 1440) + 1440) % 60).padStart(2, '0')}`;
        const minMinutes = toMinutes(el?.min) ?? 0;
        const maxMinutes = toMinutes(el?.max) ?? 1439;
        return [
          { label: 'minimum - 1 minute', value: fromMinutes(minMinutes - 1) },
          { label: 'minimum allowed time', value: fromMinutes(minMinutes) },
          { label: 'minimum + 1 minute', value: fromMinutes(minMinutes + 1) },
          { label: 'maximum - 1 minute', value: fromMinutes(maxMinutes - 1) },
          { label: 'maximum allowed time', value: fromMinutes(maxMinutes) },
          { label: 'maximum + 1 minute', value: fromMinutes(maxMinutes + 1) }
        ];
      }
      /** Adds whole UTC calendar days to an ISO date and returns the date string. */
      const addUtcDays = (value, days) => {
        const date = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) return value;
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
      };
      const dateMin = el?.min || '1900-01-01';
      const dateMax = el?.max || '2099-12-31';
      if (type === 'date') return [
        { label: 'minimum - 1 day', value: addUtcDays(dateMin, -1) },
        { label: 'minimum allowed date', value: dateMin },
        { label: 'minimum + 1 day', value: addUtcDays(dateMin, 1) },
        { label: 'maximum - 1 day', value: addUtcDays(dateMax, -1) },
        { label: 'maximum allowed date', value: dateMax },
        { label: 'maximum + 1 day', value: addUtcDays(dateMax, 1) }
      ];
      if (type === 'month') {
        /** Adds calendar months to a YYYY-MM value using UTC date arithmetic. */
        const addMonths = (value, months) => {
          const [year, month] = String(value || '').split('-').map(Number);
          const date = new Date(Date.UTC(year || 1900, (month || 1) - 1 + months, 1));
          return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        };
        const monthMin = el?.min || '1900-01';
        const monthMax = el?.max || '2099-12';
        return [
          { label: 'minimum - 1 month', value: addMonths(monthMin, -1) },
          { label: 'minimum allowed month', value: monthMin },
          { label: 'minimum + 1 month', value: addMonths(monthMin, 1) },
          { label: 'maximum - 1 month', value: addMonths(monthMax, -1) },
          { label: 'maximum allowed month', value: monthMax },
          { label: 'maximum + 1 month', value: addMonths(monthMax, 1) }
        ];
      }
      if (type === 'week') {
        /** Parses an ISO week value and returns its corresponding UTC Thursday. */
        const parseWeek = value => {
          const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
          if (!match) return null;
          const thursday = new Date(Date.UTC(Number(match[1]), 0, 4));
          thursday.setUTCDate(thursday.getUTCDate() + (Number(match[2]) - 1) * 7);
          return thursday;
        };
        /** Formats a date as its ISO week-year and week number. */
        const formatWeek = date => {
          const thursday = new Date(date);
          thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
          const weekYear = thursday.getUTCFullYear();
          const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
          const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
          return `${weekYear}-W${String(week).padStart(2, '0')}`;
        };
        /** Adds weeks to a valid ISO week value and formats the result. */
        const addWeeks = (value, amount) => {
          const date = parseWeek(value);
          if (!date) return value;
          date.setUTCDate(date.getUTCDate() + amount * 7);
          return formatWeek(date);
        };
        const weekMin = el?.min || '1900-W01';
        const weekMax = el?.max || '2099-W52';
        return [
          { label: 'minimum - 1 week', value: addWeeks(weekMin, -1) },
          { label: 'minimum allowed week', value: weekMin },
          { label: 'minimum + 1 week', value: addWeeks(weekMin, 1) },
          { label: 'maximum - 1 week', value: addWeeks(weekMax, -1) },
          { label: 'maximum allowed week', value: weekMax },
          { label: 'maximum + 1 week', value: addWeeks(weekMax, 1) }
        ];
      }
      const dateTimeMin = el?.min || '1900-01-01T00:00';
      const dateTimeMax = el?.max || '2099-12-31T23:59';
      /** Adds minutes to a date-time string using UTC arithmetic. */
      const addDateTimeMinutes = (value, minutes) => {
        const date = new Date(`${String(value).slice(0, 16)}:00Z`);
        if (Number.isNaN(date.getTime())) return value;
        date.setUTCMinutes(date.getUTCMinutes() + minutes);
        return date.toISOString().slice(0, 16);
      };
      return [
        { label: 'minimum - 1 minute', value: addDateTimeMinutes(dateTimeMin, -1) },
        { label: 'minimum allowed value', value: dateTimeMin },
        { label: 'minimum + 1 minute', value: addDateTimeMinutes(dateTimeMin, 1) },
        { label: 'maximum - 1 minute', value: addDateTimeMinutes(dateTimeMax, -1) },
        { label: 'maximum allowed value', value: dateTimeMax },
        { label: 'maximum + 1 minute', value: addDateTimeMinutes(dateTimeMax, 1) }
      ];
    }
    /** Repeats a character n times for generated boundary samples. */
    const repeat = (ch, n) => new Array(n).fill(ch).join('');
    const minL = minLen || 1;
    const maxL = maxLen || 255;
    const values = [
      { label: `minimum - 1 length (${Math.max(0, minL - 1)})`, value: repeat('A', Math.max(0, minL - 1)) },
      { label: `minimum length (${minL})`, value: repeat('A', minL) },
      { label: `minimum + 1 length (${minL + 1})`, value: repeat('A', minL + 1) },
      { label: `maximum - 1 length (${Math.max(0, maxL - 1)})`, value: repeat('A', Math.max(0, maxL - 1)) },
      { label: `maximum length (${maxL})`, value: repeat('A', maxL) },
      { label: `maximum + 1 length (${maxL + 1})`, value: repeat('A', maxL + 1) },
      { label: 'empty', value: '' },
      { label: 'spaces only', value: repeat(' ', Math.max(minL, 3)) },
      { label: 'special characters', value: '!@#$%^&*()_+-=[]{}|;:,.<>?' },
      { label: 'unicode', value: 'Ünïçödé — 测试 — テスト' },
      { label: 'emoji', value: '😀🔥🚀✅' },
      { label: 'very long string', value: repeat('A', (maxLen ? maxLen * 2 : 1000)) }
    ];
    if (declaredMaxLength > 10000) values.push({ label: `maxlength cap (${declaredMaxLength} declared; 10000 generated)`, value: repeat('A', 10000) });
    if (el?.pattern) values.push(
      { label: 'pattern candidate (heuristic)', value: /\\d|\[0-9/.test(el.pattern) ? '1' : /\[A-Z/.test(el.pattern) ? 'A' : 'test' },
      { label: 'pattern mismatch candidate', value: '!@#' }
    );
    return values;
  }

  /** Selects scenario data for a field based on the requested mode and index. */
  function scenarioValueFor(mode, field, index) {
    const category = classifyCategory(field);
    if (mode === 'boundary') {
      const values = boundaryValuesFor(field);
      const v = values[index % values.length];
      return { value: v.value, label: v.label, category };
    }
    const set = NEGATIVE_SCENARIOS[category] || NEGATIVE_SCENARIOS.text;
    const labels = NEGATIVE_LABELS[category] || NEGATIVE_LABELS.text;
    const i = index % set.length;
    return { value: set[i], label: labels[i], category };
  }

  /** Number of values a field has in a mode (used to give each field each value once). */
  function scenarioCountFor(mode, field) {
    return mode === 'boundary' ? boundaryValuesFor(field).length : (NEGATIVE_SCENARIOS[classifyCategory(field)] || NEGATIVE_SCENARIOS.text).length;
  }

  /** What should happen for a case: 'reject' (an error), 'accept' (no error) or 'any' (judge manually). */
  function caseExpectation(c) {
    const s = String(c.scenario || '').toLowerCase();
    const el = c.element;
    if (c.value === '' || /no option selected|none selected|^unchecked|cleared/.test(s)) return c.required ? 'reject' : 'accept';
    if (/spaces only/.test(s)) return c.required ? 'reject' : 'any';
    if (c.mode === 'negative') {
      if (/html-like|sql-like|oversized|future date|far-past|common word|no number or symbol|lowercase/.test(s)) return 'any';
      return 'reject';
    }
    if (/pattern candidate/.test(s)) return 'any';
    // Length checks use plain letters: on a field with a format rule (email, PAN, a pattern, …) they also
    // break the format, and a length the field never declared is a guess — both need a manual look.
    if (/length \(|very long string|maxlength cap/.test(s)) {
      const formatField = !!el?.pattern || ['email', 'url', 'tel'].includes(el?.type)
        || ['email', 'url', 'pan', 'gst', 'ifsc', 'pincode', 'aadhaar', 'mobile'].includes(c.category);
      const declared = /minimum/.test(s) ? el?.minLength > 0 : el?.maxLength > 0;
      if (formatField || !declared) return 'any';
    }
    if (/minimum - 1|maximum \+ 1|one step below minimum|one step above maximum|step misalignment|pattern mismatch/.test(s)) return 'reject';
    if (/unicode|emoji|special characters|^checked|^option|selected$/.test(s)) return 'any';
    return 'accept';
  }

  /** True with a message when the page shows an error for this control (browser, ARIA or nearby text). */
  function fieldShowsError(el) {
    if (!el?.isConnected) return { shown: false };
    if (el.validity && !el.validity.valid) return { shown: true, message: el.validationMessage || 'Marked invalid by the browser' };
    const text = node => (node && isVisible(node) ? (node.textContent || '').replace(/\s+/g, ' ').trim() : '');
    const errorWords = /required|invalid|must|(enter|select|choose|provide|use) a valid|please (enter|select|choose|provide)|not valid|incorrect|error|allowed|format|too (short|long)|at least|at most|cannot|can't/i;
    const ids = `${el.getAttribute('aria-describedby') || ''} ${el.getAttribute('aria-errormessage') || ''}`.split(/\s+/).filter(Boolean);
    const described = ids.map(id => text(el.ownerDocument.getElementById(id))).filter(Boolean);
    const errorText = described.find(message => errorWords.test(message));
    if (errorText) return { shown: true, message: errorText.slice(0, 120) };
    if (el.getAttribute('aria-invalid') === 'true') return { shown: true, message: (described[0] || 'Marked invalid by the page').slice(0, 120) };
    // A message right next to the field: walk up while the container holds only this control (or its radio group).
    const sameGroup = n => n === el || (el.type === 'radio' && n.type === 'radio' && n.name === el.name) || (el.type === 'checkbox' && n.type === 'checkbox');
    for (let node = el.parentElement, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
      if (Array.from(node.querySelectorAll('input, select, textarea')).some(n => !sameGroup(n) && n.type !== 'hidden')) break;
      for (const candidate of node.querySelectorAll('.error, .invalid, .is-invalid, .has-error, .field-error, .invalid-feedback, .help-block, .text-danger, .text-red-500, .text-red-600, [role="alert"], [aria-live]')) {
        const message = text(candidate);
        if (message && message.length < 200) return { shown: true, message: message.slice(0, 120) };
      }
      for (const candidate of node.querySelectorAll('p, span, small, div')) {
        if (candidate.querySelector('input, select, textarea, label') || candidate.contains(el)) continue;
        const message = text(candidate);
        if (message && message.length < 160 && errorWords.test(message) && !/^\*?$/.test(message)) return { shown: true, message: message.slice(0, 120) };
      }
    }
    return { shown: false };
  }

  /**
   * Judges each case after the page has reacted. Results (plain data):
   * { field, scenario, value, expected, result: 'pass' | 'warn' | 'fail' | 'info', note }.
   */
  function evaluateScenarioCases(cases) {
    return cases.map(c => {
      const expected = caseExpectation(c);
      const base = { field: c.field, scenario: c.scenario, value: c.value, category: c.category, expected };
      if (c.outcome === 'blocked') {
        return expected === 'accept'
          ? { ...base, result: 'fail', note: 'The browser refused a value that should be allowed' }
          : { ...base, result: 'pass', note: 'Browser blocked this value' };
      }
      if (c.outcome === 'limited') return { ...base, result: 'pass', note: 'Field stops at its maximum length' };
      const { shown, message } = fieldShowsError(c.element);
      if (expected === 'reject') {
        const save = c.submit;
        if (shown) return { ...base, result: 'pass', note: `Error shown${save?.clicked ? ` after clicking "${save.label}"` : ''}: ${message}` };
        if (save?.disabled) return { ...base, result: 'pass', note: `"${save.label}" stays disabled, so the form cannot be sent` };
        if (save?.urlChanged) return { ...base, result: 'fail', note: `The form accepted this value: "${save.label}" moved on to another screen` };
        if (save?.submitted) return { ...base, result: 'fail', note: `The form accepted this value: "${save.label}" sent it without any error` };
        if (save?.clicked) return { ...base, result: 'warn', note: `Clicked "${save.label}": no error shown next to this field and nothing was sent — check the page` };
        if (save && !save.clicked && save.reason) return { ...base, result: 'warn', note: `No error shown, and ${save.reason}` };
        return { ...base, result: 'warn', note: 'No error shown yet (the form may check only when it is submitted — turn on "Click Save / Submit")' };
      }
      if (expected === 'accept') {
        return shown ? { ...base, result: 'fail', note: `Rejected a value that should be allowed: ${message}` }
          : { ...base, result: 'pass', note: 'Accepted' };
      }
      return { ...base, result: 'info', note: shown ? `Error shown: ${message}` : 'Accepted (check it is saved and shown safely)' };
    });
  }

  /** Determines how many scenarios the selected QA mode should run for detected fields. */
  function scenarioPassCount(mode, detected) {
    const counts = (detected?.text || []).map(field => mode === 'boundary'
      ? boundaryValuesFor(field).length
      : (NEGATIVE_SCENARIOS[classifyCategory(field)] || NEGATIVE_SCENARIOS.text).length);
    if (mode === 'boundary') {
      counts.push(...Object.values(detected?.radioGroups || {}).map(group => (group.options || []).length));
      counts.push(...Object.values(detected?.checkboxGroups || {}).map(() => 3));
      if (detected?.checkboxes?.length) counts.push(2);
    }
    return Math.max(1, ...counts);
  }

  /** Runs scenario fills, captures outcomes, and restores eligible original field states. */
  async function fillWithScenarioData(detected, mode, log, options = {}) {
    /** Throws when the provided cancellation callback reports that the QA run stopped. */
    const checkCancelled = () => { if (options.isCancelled?.()) throw new Error('Run cancelled'); };
    const { setNativeValue, setNativeSelectValue, setNativeCheckedState, revealMaskedFieldIfNeeded, sleep } = root.SFFAFormFiller;
    const summary = { total: 0, applied: 0, blocked: 0, limited: 0, skipped: [], scenarios: [] };
    // Cases keep element references for judging the page's reaction; not enumerable, so never sent to the popup.
    const cases = [];
    Object.defineProperty(summary, 'cases', { value: cases, enumerable: false });
    const offset = Number.isInteger(options.scenarioOffset) ? options.scenarioOffset : 0;
    // eachValueOnce: round N gives every field its Nth value (single Wrong data / Edge cases runs);
    // otherwise values are spread across fields (Full QA).
    const each = options.eachValueOnce === true;
    const short = value => { const text = String(value ?? ''); return text.length > 40 ? `${text.slice(0, 37)}… (${text.length} characters)` : text; };
    const addCase = (field, element, category, scenario, value, outcome) => {
      summary.scenarios.push({ label: fieldLabel(field), category, scenario, value: short(value), outcome });
      cases.push({ field: fieldLabel(field), element, category, scenario, value: short(value), outcome, required: isRequired(element), mode });
    };
    let fieldOrdinal = 0;

    for (const field of detected.text) {
      checkCancelled();
      const scenarioIndex = fieldOrdinal++;
      if (each && offset >= scenarioCountFor(mode, field)) continue; // this field has no more values
      summary.total++;
      let el = field.element;
      if (el && (el.disabled || el.readOnly) && revealMaskedFieldIfNeeded) {
        el = await revealMaskedFieldIfNeeded(el, log);
      }
      if (!el || el.disabled || el.readOnly) { summary.skipped.push(fieldLabel(field)); continue; }
      const s = scenarioValueFor(mode, field, each ? offset : offset + scenarioIndex);
      let value = String(s.value ?? '');
      // A user cannot type past maxlength (a script can): enter what a user would end up with.
      let limitedTo = 0;
      if (el.maxLength > 0 && value.length > el.maxLength) { value = value.slice(0, el.maxLength); limitedTo = el.maxLength; }
      if (!setNativeValue(el, value)) {
        // Typed fields (number, date, …) refuse impossible values: the browser itself blocked the bad input.
        summary.applied++;
        summary.blocked++;
        addCase(field, el, s.category, s.label, s.value, 'blocked');
        log(`✓ "${fieldLabel(field)}": the browser blocked "${short(s.value)}" (${s.label})`, 'info');
        continue;
      }
      summary.applied++;
      if (limitedTo) summary.limited++;
      addCase(field, el, s.category, limitedTo ? `${s.label} — stops at ${limitedTo} characters` : s.label, s.value, limitedTo ? 'limited' : 'entered');
      log(`🧪 ${mode === 'negative' ? 'Negative' : 'Boundary'} case applied to "${fieldLabel(field)}": ${s.label}`, 'info');
      await sleep(15);
    }

    for (const field of [...(detected.select || []), ...(detected.customDropdowns || [])]) {
      if (each && offset > 0) break;
      summary.total++;
      checkCancelled();
      const el = field.element;
      if (!el || el.tagName !== 'SELECT') {
        summary.skipped.push(fieldLabel(field));
        summary.scenarios.push({ label: fieldLabel(field), category: 'custom-widget', scenario: 'skipped because widget state is not safely reversible', value: null });
        continue;
      }
      if (el.multiple) {
        Array.from(el.options).forEach(option => { option.selected = false; });
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        summary.applied++;
        addCase(field, el, 'dropdown', 'cleared all options (selection validation)', '(none)', 'entered');
        continue;
      }
      const placeholder = el.tagName === 'SELECT' && Array.from(el.options).find(o => !o.value || /^(?:please\s+)?(?:select|choose)(?:\s|$)/i.test(o.text));
      if (placeholder && setNativeSelectValue(el, placeholder.value, { allowPlaceholder: true })) {
        summary.applied++;
        addCase(field, el, 'dropdown', 'cleared to placeholder (mandatory-field check)', placeholder.text || '(empty)', 'entered');
      } else {
        summary.skipped.push(fieldLabel(field));
        summary.scenarios.push({ label: fieldLabel(field), category: 'dropdown', scenario: 'not changed; requires manual clearing', value: null });
      }
    }

    for (const [name, group] of Object.entries(detected.radioGroups || {})) {
      checkCancelled();
      const radioOptions = (group.options || []).filter(option => option?.isConnected && !option.disabled);
      if (each && (mode === 'negative' ? offset > 0 : offset >= radioOptions.length)) continue;
      summary.total++;
      const selectedIndex = mode === 'boundary' && radioOptions.length
        ? (Number.isInteger(options.scenarioOffset) ? options.scenarioOffset : 0) % radioOptions.length
        : -1;
      const changed = radioOptions.map((option, index) => setNativeCheckedState(option, index === selectedIndex));
      if (radioOptions.length && changed.every(Boolean)) {
        summary.applied++;
        const radioField = { element: radioOptions[0], type: group.type };
        addCase(radioField, radioOptions[0], 'radio-group', mode === 'negative' ? 'no option selected' : `option ${selectedIndex + 1} selected`, selectedIndex < 0 ? '(none)' : (radioOptions[selectedIndex].value || selectedIndex + 1), 'entered');
        cases[cases.length - 1].field = fieldLabel(group) || name;
        summary.scenarios[summary.scenarios.length - 1].label = fieldLabel(group) || name;
      } else summary.skipped.push(name);
    }

    for (const [name, group] of Object.entries(detected.checkboxGroups || {})) {
      checkCancelled();
      const checkboxOptions = (group.options || []).filter(option => option?.isConnected && !option.disabled);
      if (each && (mode === 'negative' ? offset > 0 : offset >= 3)) continue;
      summary.total++;
      const selectedCount = mode === 'negative' ? 0 : offset % 3 === 0 ? 0 : offset % 3 === 1 ? Math.min(1, checkboxOptions.length) : checkboxOptions.length;
      let selectedIndex = 0;
      const changed = checkboxOptions.map(option => setNativeCheckedState(option, selectedIndex++ < selectedCount));
      if (checkboxOptions.length && changed.every(Boolean)) {
        summary.applied++;
        addCase({ element: checkboxOptions[0] }, checkboxOptions[0], 'checkbox-group', mode === 'negative' ? 'none selected' : `${selectedCount} selected`, selectedCount, 'entered');
        cases[cases.length - 1].field = group.label || name;
        summary.scenarios[summary.scenarios.length - 1].label = group.label || name;
      } else summary.skipped.push(name);
    }

    for (const field of detected.checkboxes || []) {
      checkCancelled();
      if (each && offset >= (mode === 'negative' ? 1 : 2)) continue;
      summary.total++;
      const el = field.element;
      if (!el?.isConnected || el.disabled) { summary.skipped.push(fieldLabel(field)); continue; }
      const checked = mode === 'boundary' && (Number.isInteger(options.scenarioOffset) ? options.scenarioOffset : 0) % 2 === 1;
      if (setNativeCheckedState(el, checked)) {
        summary.applied++;
        addCase(field, el, 'checkbox', checked ? 'checked' : 'unchecked', checked ? 'ticked' : 'not ticked', 'entered');
      } else summary.skipped.push(fieldLabel(field));
    }

    for (const field of detected.file || []) {
      if (each && offset > 0) break;
      checkCancelled();
      summary.total++;
      summary.skipped.push(fieldLabel(field));
      summary.scenarios.push({ label: fieldLabel(field), category: 'file', scenario: 'skipped to preserve original file selection', reason: 'FileList cannot be restored by the browser' });
      log(`⚠ Negative file scenario skipped for "${fieldLabel(field)}" because its original selection cannot be restored`, 'warn');
    }

    return summary;
  }

  /** Collects visible browser and page validation messages from current form controls. */
  function detectValidationErrors() {
    const errors = [];
    const seen = new Set();
    /** Adds a unique non-empty validation message to the error list. */
    const push = (message, source) => {
      const key = source + ':' + message;
      if (message && !seen.has(key)) { seen.add(key); errors.push({ message: message.trim().slice(0, 200), source }); }
    };

    document.querySelectorAll('[aria-invalid="true"]').forEach(el => {
      push(`${fieldLabelFromElement(el)} is marked invalid (aria-invalid)`, 'aria-invalid');
    });

    const ERROR_SELECTOR = '.error, .invalid, .is-invalid, .has-error, .field-error, .invalid-feedback, [role="alert"]';
    document.querySelectorAll(ERROR_SELECTOR).forEach(el => {
      if (!isVisible(el)) return;
      const text = (el.textContent || '').trim();
      if (text && text.length < 200) push(text, 'error-class');
    });

    document.querySelectorAll('[class*="toast"], [class*="snackbar"], [role="status"]').forEach(el => {
      if (!isVisible(el)) return;
      const text = (el.textContent || '').trim();
      if (text && /error|invalid|required|failed|fail/i.test(text) && text.length < 200) push(text, 'toast');
    });

    return errors.slice(0, 30);
  }

  /** Derives readable label text for a validation message's associated element. */
  function fieldLabelFromElement(el) {
    if (!el) return 'Field';
    const explicit = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return (explicit && explicit.textContent.trim())
      || el.getAttribute('aria-label') || el.placeholder || el.name || el.id || 'Field';
  }

  /** Compares detected controls with their expected state and returns verification results. */
  function verifyFilledFields(detected) {
    const S = (root.SFFAStatus && root.SFFAStatus.FIELD_STATUS) || { PASSED: 'PASSED', UNABLE_TO_VERIFY: 'UNABLE_TO_VERIFY', FAILED: 'FAILED' };
    const LEGACY = (root.SFFAStatus && root.SFFAStatus.FIELD_STATUS_TO_LEGACY) || { PASSED: 'pass', UNABLE_TO_VERIFY: 'warn', FAILED: 'fail' };
    const results = { pass: 0, warn: 0, fail: 0, details: [], fields: [] };
    // Element currently being verified; lets every outcome be matched to the scan list by key.
    let current = null;
    /** Updates verification counts and keeps details for outcomes that need attention. */
    const record = (fieldStatus, label, expectedNote, actualNote) => {
      const legacy = LEGACY[fieldStatus] || 'warn';
      results[legacy]++;
      if (current && results.fields.length < 400) {
        results.fields.push({ key: fieldKey(current), label: String(label).slice(0, 120), status: legacy, note: legacy === 'pass' ? '' : String(actualNote || '').slice(0, 160) });
      }
      if (legacy !== 'pass') {
        results.details.push({ status: legacy, fieldStatus, label, expected: expectedNote, actual: actualNote });
      }
    };
    const LEGACY_TO_STATUS = { pass: S.PASSED, warn: S.UNABLE_TO_VERIFY, fail: S.FAILED };
    /** Normalizes legacy status names and delegates to the verification recorder. */
    const recordLegacyOrStatus = (statusOrLegacy, label, expectedNote, actualNote) => {
      const fieldStatus = LEGACY_TO_STATUS[statusOrLegacy] || statusOrLegacy;
      record(fieldStatus, label, expectedNote, actualNote);
    };

    for (const field of detected.text) {
      const el = field.element;
      if (!el) continue;
      const label = fieldLabel(field);
      current = el;
      if (!el.isConnected) { recordLegacyOrStatus('warn', label, 'connected control', 'control was replaced; verification unavailable'); continue; }
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') { recordLegacyOrStatus('warn', label, 'enabled control', 'control is disabled'); continue; }
      const value = (el.value || '').trim();
      const invalid = (el.validity && !el.validity.valid) || el.getAttribute('aria-invalid') === 'true' || el.classList.contains('error') || el.classList.contains('invalid');
      if (isRequired(el) && !value) recordLegacyOrStatus('fail', label, 'a non-empty value', 'empty after fill');
      else if (invalid) recordLegacyOrStatus('fail', label, 'accepted value', `value set ("${value.slice(0, 40)}") but page still flags it invalid`);
      else if (!value && el.type !== 'hidden') recordLegacyOrStatus('warn', label, 'a value', 'still empty (field may not have been recognized)');
      else recordLegacyOrStatus('pass', label);
    }
    for (const field of detected.select) {
      const el = field.element;
      if (!el) continue;
      const label = fieldLabel(field);
      current = el;
      if (!el.isConnected) { recordLegacyOrStatus('warn', label, 'connected control', 'control was replaced; verification unavailable'); continue; }
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') { recordLegacyOrStatus('warn', label, 'enabled control', 'control is disabled'); continue; }
      const opt = el.options[el.selectedIndex];
      const placeholderish = !opt || !opt.value || opt.disabled || /^(?:[-—–]+(?:\s|$)|(?:please\s+)?(?:select|choose)(?:\s|$))/i.test(opt.text || '');
      if (isRequired(el) && placeholderish) recordLegacyOrStatus('fail', label, 'a real option selected', 'still on placeholder option');
      else if (placeholderish) recordLegacyOrStatus('warn', label, 'a real option selected', 'still on placeholder option');
      else recordLegacyOrStatus('pass', label);
    }
    for (const field of detected.file) {
      const el = field.element;
      if (!el) continue;
      const label = fieldLabel(field);
      current = el;
      if (field.replacesExisting) continue; // left alone on purpose: it would replace an uploaded document
      if (field.viaTrigger) {
        // The shared input holds only the last file; the filler records each card's own result.
        if (field.attachedOk) recordLegacyOrStatus('pass', label);
        else recordLegacyOrStatus('warn', label, 'a file attached', 'no file attached (map a file of this type, or upload it manually)');
        continue;
      }
      if (!el.isConnected) { recordLegacyOrStatus('warn', label, 'connected control', 'control was replaced; verification unavailable'); continue; }
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') { recordLegacyOrStatus('warn', label, 'enabled control', 'control is disabled'); continue; }
      if (!el.files || el.files.length === 0) recordLegacyOrStatus('warn', label, 'a file attached', 'no file present (upload requires manual selection or was skipped)');
      else recordLegacyOrStatus('pass', label);
    }

    for (const field of detected.customDropdowns || []) {
      const el = field.element;
      if (!el) continue;
      const label = fieldLabel(field);
      current = el;
      if (!el.isConnected) { recordLegacyOrStatus('warn', label, 'connected control', 'control was replaced; verification unavailable'); continue; }
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') { recordLegacyOrStatus('warn', label, 'enabled control', 'control is disabled'); continue; }
      const displayedText = (el.value || el.textContent || '').trim();
      const placeholderish = !displayedText || /^(select|choose|--|—)/i.test(displayedText);
      if (isRequired(el) && placeholderish) recordLegacyOrStatus('fail', label, 'a real option selected', 'still showing placeholder text');
      else if (placeholderish) recordLegacyOrStatus('warn', label, 'a real option selected', 'still showing placeholder text');
      else recordLegacyOrStatus('pass', label);
    }

    for (const [name, group] of Object.entries(detected.radioGroups || {})) {
      const label = group.type || name;
      current = group.options?.[0] || null;
      const anyChecked = (group.options || []).some(el => el.checked);
      const anyRequired = (group.options || []).some(el => isRequired(el));
      if (!anyChecked) recordLegacyOrStatus(anyRequired ? 'fail' : 'warn', label, 'one option selected', 'no option in the group is checked');
      else recordLegacyOrStatus('pass', label);
    }

    for (const field of detected.checkboxes || []) {
      const el = field.element;
      if (!el) continue;
      const label = fieldLabel(field);
      current = el;
      if (!el.isConnected) { recordLegacyOrStatus('warn', label, 'connected control', 'control was replaced; verification unavailable'); continue; }
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') { recordLegacyOrStatus('warn', label, 'enabled control', 'control is disabled'); continue; }
      const context = (el.id + ' ' + el.name + ' ' + (el.closest('label')?.textContent || '')).toLowerCase();
      const shouldBeChecked = el.required || /agree|consent|accept|terms|confirm|declare/.test(context);
      if (shouldBeChecked && !el.checked) recordLegacyOrStatus(el.required ? 'fail' : 'warn', label, 'checked', 'still unchecked after fill');
      else recordLegacyOrStatus('pass', label);
    }

    for (const [name, group] of Object.entries(detected.checkboxGroups || {})) {
      current = group.options?.[0] || null;
      const uncheckedCount = (group.options || []).filter(el => !el.checked).length;
      if (uncheckedCount === group.options.length) recordLegacyOrStatus('warn', name, 'options checked', 'none of the options are checked');
      else if (uncheckedCount > 0) recordLegacyOrStatus('warn', name, 'all options checked', `${uncheckedCount} option(s) did not stay checked`);
      else recordLegacyOrStatus('pass', name);
    }

    return results;
  }

  /** Generates test-case records from detected fields and current page observations. */
  function generateTestCases(detected) {
    if (!root.SFFATestCases) throw new Error('Test-case generator is missing. Reload the extension and refresh the page.');
    return root.SFFATestCases.generate(detected);
  }
  /** Returns the generated test cases with their source-page and coverage metadata. */
  function generateTestCaseReport(detected) {
    if (!root.SFFATestCases) throw new Error('Test-case generator is missing. Reload the extension and refresh the page.');
    return root.SFFATestCases.generateReport(detected);
  }
  /** Delegates test-case CSV formatting to the shared export utility. */
  const testCasesToCsv = cases => root.SFFATestCaseExport.toCsv(cases);
  /** Delegates Markdown test-case formatting to the shared export utility. */
  const testCasesToMarkdown = cases => root.SFFATestCaseExport.toMarkdown(cases);

  root.SFFAQAEngine = {
    scoreToConfidence,
    scenarioCountFor,
    caseExpectation,
    evaluateScenarioCases,
    fieldShowsError,
    listDetectedFields,
    fieldKey,
    scanPage,
    fillWithScenarioData,
    filterDetectedFieldsByScope,
    getRestorableDetectedFields,
    boundaryValuesFor,
    scenarioPassCount,
    scenarioValueFor,
    captureDetectedState,
    restoreDetectedState,
    detectValidationErrors,
    verifyFilledFields,
    generateTestCases,
    generateTestCaseReport,
    checkSameOriginLinks,
    testCasesToCsv,
    testCasesToMarkdown,
    findRiskyButtons,
    classifyCategory
  };
})(window);
