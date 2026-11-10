(function (root) {
  const TEST_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-qa'];

  /** Escapes a value for use as a CSS identifier, with a fallback when CSS.escape is absent. */
  function escapeIdentifier(value) {
    if (root.CSS?.escape) return root.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  }

  /** Escapes backslashes, quotes, and line breaks for a quoted CSS attribute value. */
  function quoteAttribute(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ');
  }

  /** Returns the element's queryable root, falling back to its owner document. */
  function getScope(element) {
    const scope = element.getRootNode();
    return scope && typeof scope.querySelectorAll === 'function' ? scope : element.ownerDocument;
  }

  /** Checks whether a selector matches only the given element in the supplied scope. */
  function isUnique(element, selector, scope = getScope(element)) {
    try {
      const matches = scope.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch (_) {
      return false;
    }
  }

  /** Derives a display name from ARIA references, labels, text, value, or title. */
  function accessibleName(element) {
    const labelledBy = (element.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
    const referenced = labelledBy.map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim();
    const labelText = Array.from(element.labels || []).map(label => label.textContent || '').join(' ').trim();
    return (element.getAttribute('aria-label') || referenced || labelText || element.getAttribute('alt') ||
      (element.matches('button, a, [role="button"], [role="link"]') ? element.textContent : '') ||
      element.value || element.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  }

  /** Builds an ancestor CSS path and stops at the shortest selector unique in scope. */
  function stablePath(element, scope) {
    const parts = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter(sibling => sibling.tagName === node.tagName)
        : [node];
      parts.unshift(tag + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''));
      const selector = parts.join(' > ');
      if (isUnique(element, selector, scope)) return selector;
    }
    return parts.join(' > ');
  }

  /** Builds an absolute XPath using same-tag sibling positions where needed. */
  function xpathFor(element) {
    const parts = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter(sibling => sibling.tagName === node.tagName)
        : [node];
      parts.unshift(`${tag}${siblings.length > 1 ? `[${siblings.indexOf(node) + 1}]` : ''}`);
    }
    return '/' + parts.join('/');
  }

  /** Flags values matching common long hexadecimal or numeric dynamic-ID patterns. */
  function looksDynamic(value) {
    return /(?:^|[-_])[a-f0-9]{8,}(?:$|[-_])|^[0-9]{5,}$|\b(?:\d{10,}|[a-f0-9]{16,})\b/i.test(value || '');
  }

  /** Checks hidden/inert ancestors, computed visibility, and the element's rendered size. */
  function isVisible(element) {
    for (let node = element; node; node = node.parentElement || node.getRootNode()?.host) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('inert')) return false;
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  /** Produces CSS/XPath locator details and uniqueness, visibility, and stability indicators. */
  function inspect(element) {
    if (!element || element.nodeType !== 1) throw new TypeError('A DOM element is required');
    const scope = getScope(element);
    const candidates = [];
    for (const attribute of TEST_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value) candidates.push({ selector: `[${attribute}="${quoteAttribute(value)}"]`, strategy: attribute, value });
    }
    const role = element.getAttribute('role');
    const label = accessibleName(element);
    if (role && label && element.getAttribute('aria-label')) {
      candidates.push({
        selector: `[role="${quoteAttribute(role)}"][aria-label="${quoteAttribute(element.getAttribute('aria-label'))}"]`,
        strategy: 'role + accessible name',
        value: role + ' ' + label
      });
    }
    if (element.getAttribute('aria-label')) {
      candidates.push({
        selector: `${element.tagName.toLowerCase()}[aria-label="${quoteAttribute(element.getAttribute('aria-label'))}"]`,
        strategy: 'aria-label',
        value: element.getAttribute('aria-label')
      });
    }
    if (element.id) candidates.push({ selector: `[id="${quoteAttribute(element.id)}"]`, strategy: 'id', value: element.id });
    if (element.name) candidates.push({ selector: `${element.tagName.toLowerCase()}[name="${quoteAttribute(element.name)}"]`, strategy: 'name', value: element.name });

    let selected = candidates.find(candidate => isUnique(element, candidate.selector, scope));
    if (!selected) selected = { selector: stablePath(element, scope), strategy: 'CSS path', value: '' };
    const unique = isUnique(element, selected.selector, scope);
    const visible = isVisible(element);
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const interactable = visible && !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true' && style?.pointerEvents !== 'none';
    const dynamic = selected.value ? looksDynamic(selected.value) : /nth-of-type/.test(selected.selector);
    const labelText = accessibleName(element);
    const effectiveRole = role || (element.matches('button,input[type="button"],input[type="submit"]') ? 'button'
      : element.matches('a[href]') ? 'link'
      : element.matches('input[type="checkbox"]') ? 'checkbox'
      : element.matches('input[type="radio"]') ? 'radio'
      : element.matches('select') ? 'combobox'
      : element.matches('input,textarea,[contenteditable="true"]') ? 'textbox' : '');
    let playwrightLocator = `locator(${JSON.stringify(selected.selector)})`;
    let playwrightPythonLocator = `locator(${JSON.stringify(selected.selector)})`;
    if (selected.strategy === 'data-testid') {
      playwrightLocator = `getByTestId(${JSON.stringify(selected.value)})`;
      playwrightPythonLocator = `get_by_test_id(${JSON.stringify(selected.value)})`;
    } else if (effectiveRole && labelText && selected.strategy !== 'id' && selected.strategy !== 'CSS path') {
      playwrightLocator = `getByRole(${JSON.stringify(effectiveRole)}, { name: ${JSON.stringify(labelText)} })`;
      playwrightPythonLocator = `get_by_role(${JSON.stringify(effectiveRole)}, name=${JSON.stringify(labelText)})`;
    } else if (labelText && element.matches('input,select,textarea') && element.labels?.length) {
      playwrightLocator = `getByLabel(${JSON.stringify(labelText)})`;
      playwrightPythonLocator = `get_by_label(${JSON.stringify(labelText)})`;
    }
    const strategyScore = selected.strategy.startsWith('data-') ? 100
      : selected.strategy === 'role + accessible name' ? 90
      : selected.strategy === 'aria-label' ? 85
      : selected.strategy === 'id' ? 80
      : selected.strategy === 'name' ? 72 : 45;
    const stabilityScore = Math.max(0, strategyScore - (dynamic ? 30 : 0) - (!unique ? 45 : 0));
    return {
      selector: selected.selector,
      xpath: xpathFor(element),
      strategy: selected.strategy,
      unique,
      visible,
      interactable,
      dynamic,
      stable: unique && !dynamic,
      stabilityScore,
      playwrightLocator,
      playwrightPythonLocator,
      warning: !unique ? 'Selector is not unique.' : dynamic ? 'Selector uses a value or path that may change between page loads.' : ''
    };
  }

  root.SFFASelectorEngine = { inspect, accessibleName, isVisible };
})(window);
