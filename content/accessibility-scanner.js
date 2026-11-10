(function (root) {
  const MAX_ELEMENTS = 10000;
  const INTERACTIVE_ROLES = new Set([
    'button', 'checkbox', 'combobox', 'link', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'radio', 'searchbox', 'slider', 'spinbutton',
    'switch', 'tab', 'textbox'
  ]);
  const NATIVE_INTERACTIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]';

  /** Collects elements matching a selector from each supplied document or shadow scope. */
  function elementsBySelector(scopes, selector) {
    return scopes.flatMap(scope => Array.from(scope.querySelectorAll(selector)));
  }

  /** Builds a short selector used to identify an element in a scan finding. */
  function selectorFor(element) {
    try {
      return root.SFFASelectorEngine?.inspect(element).selector || element.tagName.toLowerCase();
    } catch (_) {
      return element.tagName.toLowerCase();
    }
  }

  /** Runs bounded DOM checks for common accessibility issues and returns findings. */
  function scan() {
    const scopes = root.SFFADeepDOM?.scopes?.() || [root.document];
    const elements = [];
    const findings = [];
    const seen = new Set();
    let count = 0;

    for (const scope of scopes) {
      for (const element of scope.querySelectorAll('*')) {
        if (count++ >= MAX_ELEMENTS) break;
        elements.push(element);
      }
      if (count >= MAX_ELEMENTS) break;
    }

    /** Adds one finding with its selector and remediation guidance. */
    function add(element, id, title, severity, recommendation, confidence = 'Medium') {
      const selector = element ? selectorFor(element) : '(document)';
      const key = `${id}|${selector}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({
        id,
        title,
        severity,
        confidence,
        element: element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}` : 'Page',
        selector,
        recommendation
      });
    }

    const idsByScope = new Map();
    for (const element of elements) {
      if (element.id) {
        const scope = element.getRootNode();
        if (!idsByScope.has(scope)) idsByScope.set(scope, new Map());
        const ids = idsByScope.get(scope);
        if (ids.has(element.id)) add(element, 'duplicate-id', 'Duplicate ID', 'High', `Use a unique id; another ${element.tagName.toLowerCase()} has the same id="${element.id}".`);
        else ids.set(element.id, element);
      }
    }

    for (const [scope, ids] of idsByScope) {
      for (const element of scope.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
        for (const attribute of ['aria-labelledby', 'aria-describedby']) {
          const value = element.getAttribute(attribute);
          if (!value) continue;
          const missing = value.trim().split(/\s+/).filter(id => !ids.has(id));
          if (missing.length) add(element, `broken-${attribute}`, `Broken ${attribute} reference`, 'Medium', `Provide existing element id(s) for: ${missing.join(', ')}.`);
        }
      }
    }

    const controls = elements.filter(element => element.matches(
      'input:not([type="hidden"]), select, textarea, button, [role="button"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"], [role="switch"], [contenteditable="true"]'
    ));
    for (const element of controls) {
      const name = root.SFFASelectorEngine?.accessibleName(element) || '';
      if (!name) {
        const isFormControl = element.matches('input, select, textarea');
        add(element, 'missing-accessible-name', isFormControl ? 'Form control has no accessible name' : 'Interactive control has no accessible name', isFormControl ? 'High' : 'Medium', 'Add a visible associated label, aria-label, or aria-labelledby that describes this control.');
      }

      const required = element.required || element.getAttribute('aria-required') === 'true';
      if (required) {
        const labelText = Array.from(element.labels || []).map(label => label.textContent || '').join(' ');
        const explicitlyMarked = /\*|\brequired\b/i.test(labelText) || element.getAttribute('aria-required') === 'true';
        if (!explicitlyMarked) add(element, 'required-indicator', 'Required state may lack a visible indicator', 'Low', 'Show a visible required indicator and keep the programmatic required state; confirm this rule with the product design.');
      }

      if (element.getAttribute('aria-invalid') === 'true' && !element.getAttribute('aria-describedby')) {
        add(element, 'invalid-without-description', 'Invalid field has no described error', 'Medium', 'Associate the validation message using aria-describedby and ensure it is announced when the field is invalid.');
      }
    }

    for (const element of elements) {
      const role = (element.getAttribute('role') || '').trim().toLowerCase();
      if (INTERACTIVE_ROLES.has(role) && !element.matches(NATIVE_INTERACTIVE)) {
        const tabIndex = element.getAttribute('tabindex');
        if (tabIndex === null || Number(tabIndex) < 0) {
          add(element, 'custom-control-not-keyboard-focusable', 'Custom interactive control is not keyboard-focusable', 'High', 'Use a native interactive element or provide tabindex="0" and implement the expected keyboard interaction.');
        }
      }

      if (element.hasAttribute('onclick') && !element.matches(NATIVE_INTERACTIVE) && !role) {
        add(element, 'click-handler-nonsemantic', 'Click handler on a non-interactive element', 'Medium', 'Use a native button/link, or provide an appropriate role, keyboard support, and focus behavior.');
      }

      if (element.tagName === 'IMG' && !element.hasAttribute('alt') && element.getAttribute('role') !== 'presentation' && element.getAttribute('aria-hidden') !== 'true') {
        add(element, 'image-missing-alt', 'Image has no text alternative', 'Medium', 'Add concise alt text for meaningful images, or alt="" for decorative images.');
      }
      const tabIndex = Number(element.getAttribute('tabindex'));
      if (element.hasAttribute('tabindex') && tabIndex > 0) {
        add(element, 'positive-tabindex', 'Positive tabindex may disrupt focus order', 'Medium', 'Use tabindex="0" or native source order instead of a positive tabindex.', 'Medium');
      }
    }

    /** Converts computed rgb/rgba text to channels for a rough contrast estimate. */
    const rgb = text => {
      const match = String(text).match(/^rgba?\(([^)]+)\)$/i);
      if (!match) return null;
      const channels = match[1].split(',').map(value => Number.parseFloat(value.trim()));
      if (channels.length < 3 || channels.some(value => !Number.isFinite(value))) return null;
      if (channels.length > 3 && channels[3] < 1) return null;
      return channels.slice(0, 3);
    };
    const luminance = channels => channels.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    for (const element of elements.filter(node => node.children.length === 0 && (node.textContent || '').trim())) {
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      const foreground = rgb(style.color), background = rgb(style.backgroundColor);
      if (!foreground || !background) continue;
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      const ratio = (light + 0.05) / (dark + 0.05);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const large = fontSize >= 24 || (fontSize >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
      if (ratio < (large ? 3 : 4.5)) add(element, 'contrast-approximation', 'Possible low text contrast', 'Medium', `Direct foreground/background estimate is ${ratio.toFixed(2)}:1; inherited backgrounds and visual effects are not included. Verify with a rendered contrast checker.`, 'Low');
    }

    const headings = elements.filter(element => /^H[1-6]$/.test(element.tagName));
    let previousLevel = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      if (previousLevel && level > previousLevel + 1) {
        add(heading, 'heading-level-skip', 'Heading levels skip a step', 'Low', `Use a heading level between h${previousLevel} and h${level} to keep the document outline understandable.`);
      }
      previousLevel = level;
    }
    if (!elements.some(element => element.tagName === 'MAIN' || element.getAttribute('role') === 'main')) {
      add(null, 'missing-main-landmark', 'No main landmark found', 'Low', 'Mark the primary page content with <main> or role="main" so assistive-technology users can navigate to it directly.');
    }

    return {
      findings,
      scannedElements: elements.length,
      truncated: count >= MAX_ELEMENTS,
      status: findings.length ? 'ISSUES_FOUND' : 'NO_STATIC_ISSUES_FOUND',
      limitations: [
      'Colour contrast results are estimates: they compare each text colour with its own background only. Backgrounds from images, overlays or parent elements, visible focus outlines, tab order, keyboard use and what a screen reader announces still need a manual check.'
      ]
    };
  }

  root.SFFAA11yScanner = { scan };
})(window);
