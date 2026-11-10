/*
 * Viewport presets for responsive testing (Setup → Viewport).
 * Sizes are CSS pixels in portrait/natural orientation, as reported by the devices' browsers
 * (the same figures Chrome DevTools device mode uses). `mobile` + `touch` + `deviceScaleFactor`
 * make the page behave like the device: mobile layout viewport, touch input, pixel density.
 */
(function (root) {
  const GROUPS = ['Phones', 'Tablets', 'Laptops & desktops', 'CSS breakpoints'];

  /** Builds one preset record. */
  const device = (id, group, name, width, height, deviceScaleFactor, mobile, touch) =>
    Object.freeze({ id, group, name, width, height, deviceScaleFactor, mobile, touch });

  const PRESETS = Object.freeze([
    // Phones
    device('small-phone-320', 'Phones', 'Small phone (iPhone SE 1st gen)', 320, 568, 2, true, true),
    device('galaxy-s8', 'Phones', 'Samsung Galaxy S8 / S9', 360, 740, 3, true, true),
    device('galaxy-s20', 'Phones', 'Samsung Galaxy S20 / A-series', 360, 800, 3, true, true),
    device('iphone-se', 'Phones', 'iPhone SE (2nd/3rd gen)', 375, 667, 2, true, true),
    device('iphone-x', 'Phones', 'iPhone X / 11 Pro', 375, 812, 3, true, true),
    device('iphone-14', 'Phones', 'iPhone 12 / 13 / 14', 390, 844, 3, true, true),
    device('iphone-15-pro', 'Phones', 'iPhone 15 / 15 Pro / 16', 393, 852, 3, true, true),
    device('pixel-7', 'Phones', 'Google Pixel 7 / 8', 412, 915, 2.625, true, true),
    device('galaxy-s23-ultra', 'Phones', 'Samsung Galaxy S23 Ultra', 384, 824, 3.75, true, true),
    device('iphone-15-pro-max', 'Phones', 'iPhone 14/15 Plus & Pro Max', 430, 932, 3, true, true),
    // Tablets
    device('galaxy-tab-s7', 'Tablets', 'Samsung Galaxy Tab S7', 800, 1280, 2, true, true),
    device('ipad-mini', 'Tablets', 'iPad Mini / iPad (classic)', 768, 1024, 2, true, true),
    device('ipad-air', 'Tablets', 'iPad Air / iPad 10th gen', 820, 1180, 2, true, true),
    device('ipad-pro-11', 'Tablets', 'iPad Pro 11"', 834, 1194, 2, true, true),
    device('surface-pro', 'Tablets', 'Microsoft Surface Pro 7', 912, 1368, 2, false, true),
    device('ipad-pro-12', 'Tablets', 'iPad Pro 12.9"', 1024, 1366, 2, true, true),
    // Laptops & desktops
    device('laptop-1280', 'Laptops & desktops', 'Small laptop (1280 × 720)', 1280, 720, 1, false, false),
    device('laptop-1366', 'Laptops & desktops', 'HD laptop (1366 × 768, most common)', 1366, 768, 1, false, false),
    device('macbook-air', 'Laptops & desktops', 'MacBook Air (1440 × 900)', 1440, 900, 1, false, false),
    device('laptop-1536', 'Laptops & desktops', 'Windows laptop at 125% (1536 × 864)', 1536, 864, 1, false, false),
    device('desktop-1920', 'Laptops & desktops', 'Full HD desktop (1920 × 1080)', 1920, 1080, 1, false, false),
    device('desktop-2560', 'Laptops & desktops', 'QHD desktop (2560 × 1440)', 2560, 1440, 1, false, false),
    // Common CSS breakpoints (Bootstrap / Tailwind edges) for layout testing
    device('bp-576', 'CSS breakpoints', '576 px (small)', 576, 800, 1, false, false),
    device('bp-768', 'CSS breakpoints', '768 px (medium / tablet)', 768, 900, 1, false, false),
    device('bp-992', 'CSS breakpoints', '992 px (large)', 992, 900, 1, false, false),
    device('bp-1200', 'CSS breakpoints', '1200 px (extra large)', 1200, 900, 1, false, false),
    device('bp-1400', 'CSS breakpoints', '1400 px (extra extra large)', 1400, 900, 1, false, false)
  ]);

  /** Returns the preset with this id, or null. */
  function find(id) {
    return PRESETS.find(p => p.id === id) || null;
  }

  /**
   * Turns a preset (or a custom { width, height }) into the options sent to the debugger.
   * Custom sizes up to 600 px wide are treated as a touch phone at 2x, wider ones as a desktop.
   * `landscape` swaps width and height. Throws on values Chrome would reject.
   */
  function deviceOptions(spec, landscape = false) {
    let width = Number(spec?.width);
    let height = Number(spec?.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 200 || width > 3000 || height < 200 || height > 3000) {
      throw new Error('Width and height must be whole numbers from 200 to 3000 pixels.');
    }
    if (landscape) [width, height] = [height, width];
    const phoneLike = Number(spec.width) <= 600;
    const mobile = typeof spec.mobile === 'boolean' ? spec.mobile : phoneLike;
    const touch = typeof spec.touch === 'boolean' ? spec.touch : phoneLike;
    const deviceScaleFactor = spec.deviceScaleFactor === undefined ? (phoneLike ? 2 : 1) : Number(spec.deviceScaleFactor);
    if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 1 || deviceScaleFactor > 4) {
      throw new Error('Pixel density must be between 1 and 4.');
    }
    return { width, height, mobile, touch, deviceScaleFactor };
  }

  /** Short description, e.g. "390 × 844 · 3× · touch". */
  function describe(options) {
    const parts = [`${options.width} × ${options.height}`, `${options.deviceScaleFactor}×`];
    if (options.touch) parts.push('touch');
    if (options.mobile) parts.push('mobile layout');
    return parts.join(' · ');
  }

  root.SFFAViewportPresets = { presets: PRESETS, groups: GROUPS, find, deviceOptions, describe };
})(typeof window !== 'undefined' ? window : self);
