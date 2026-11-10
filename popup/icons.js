/*
 * Local SVG icon set (24x24 grid, 1.5px stroke, round caps/joins). No icon fonts, no network.
 *
 * Two ways to use an icon:
 *  1. Declaratively: add data-icon="name" to any element. install() registers one CSS mask rule per
 *     icon, so the icon is drawn by ::before in currentColor and survives code that rewrites the
 *     element's textContent (many popup handlers relabel buttons while busy).
 *  2. Imperatively: SFFAIcons.svg('name') returns an <svg> element for places that need real nodes.
 */
(function (root) {
  const ICONS = {
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="11" cy="11" r="3.5"/><path d="m13.5 13.5 3 3"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    zap: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
    play: '<path d="M7 4.5v15l12-7.5L7 4.5Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    fill: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h6M7 13h10M7 17h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
    fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.75"/><path d="m21 16-5-5-9 9"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
    sparkles: '<path d="M12 3.5 13.6 8a3 3 0 0 0 2 2l4.4 1.5-4.4 1.6a3 3 0 0 0-2 2L12 19.5l-1.6-4.4a3 3 0 0 0-2-2L4 11.5 8.4 10a3 3 0 0 0 2-2L12 3.5Z"/><path d="M19 3v3M17.5 4.5h3"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    pointer: '<path d="m5 3 6.5 17 2.3-6.7L20.5 11 5 3Z"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8Z"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L3.5 9"/><path d="M3.5 4v5h5M4 13a8 8 0 0 0 14.5 4.5l2-2.5"/><path d="M20.5 20v-5h-5"/>',
    beaker: '<path d="M9 3h6M10 3v6l-5.5 9.2A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.8L14 9V3M7.5 15h9"/>',
    ruler: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 7v4M11 7v3M15 7v4M19 7v3"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    gauge: '<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="m12 13 4-4.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2.3-2.5 3.8M12 17h.01"/>',
    logo: '<path d="M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5l1-8Z"/>'
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Returns the SVG markup for one icon as a standalone document string. */
  function markup(name) {
    const body = ICONS[name];
    if (!body) return '';
    return `<svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="%23000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  /** Builds a decorative inline <svg> element for the named icon. */
  function svg(name, className = 'icon') {
    const element = document.createElementNS(SVG_NS, 'svg');
    element.setAttribute('viewBox', '0 0 24 24');
    element.setAttribute('fill', 'none');
    element.setAttribute('stroke', 'currentColor');
    element.setAttribute('stroke-width', '1.5');
    element.setAttribute('stroke-linecap', 'round');
    element.setAttribute('stroke-linejoin', 'round');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('focusable', 'false');
    if (className) element.setAttribute('class', className);
    // The icon bodies are static strings defined in this file, never page or user content.
    const template = document.createElementNS(SVG_NS, 'g');
    template.innerHTML = ICONS[name] || '';
    while (template.firstChild) element.appendChild(template.firstChild);
    return element;
  }

  /** Registers one mask rule per icon so [data-icon] elements render in currentColor. */
  function install(doc = document) {
    if (doc.__sffaIconsInstalled) return;
    doc.__sffaIconsInstalled = true;
    let rules = Object.keys(ICONS).map(name => {
      const url = `url("data:image/svg+xml;utf8,${markup(name).replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
      return `[data-icon="${name}"]::before{-webkit-mask-image:${url};mask-image:${url}}`;
    });
    // Disclosure chevrons on collapsible cards are drawn by summary::after.
    const chevron = rules[Object.keys(ICONS).indexOf('chevronDown')].replace('[data-icon="chevronDown"]::before', 'details.card>summary::after,.files-summary::after');
    rules.push(chevron);
    rules = rules.join('\n');
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(rules);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    } catch (_) {
      const style = doc.createElement('style');
      style.textContent = rules;
      doc.head.appendChild(style);
    }
  }

  root.SFFAIcons = { names: Object.keys(ICONS), svg, install, markup };
  if (typeof document !== 'undefined') install(document);
})(typeof window !== 'undefined' ? window : self);
