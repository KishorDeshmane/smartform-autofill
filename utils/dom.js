(function (root) {
  /** Creates an element, applies supported attributes/listeners, appends children, and returns it. */
  function h(tag, props, children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'checked' || key === 'disabled' || key === 'required') {
          if (value) el.setAttribute(key, '');
        } else if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          el.setAttribute(key, value);
        }
      }
    }
    (children || []).forEach((child) => {
      if (child === null || child === undefined) return;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return el;
  }

  root.SFFADom = { h };
})(window);
