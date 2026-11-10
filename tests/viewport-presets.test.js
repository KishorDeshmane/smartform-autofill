const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow } = require('./helpers');

const load = () => loadWindow(['utils/viewport-presets.js']).SFFAViewportPresets;

test('presets: every device has a valid size, a unique id and a readable name', () => {
  const { presets } = load();
  assert.ok(presets.length >= 20, `only ${presets.length} presets`);
  const ids = new Set();
  for (const p of presets) {
    assert.ok(p.id && !ids.has(p.id), `duplicate or missing id: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name && p.group, `${p.id} needs a name and group`);
    for (const side of [p.width, p.height]) assert.ok(Number.isInteger(side) && side >= 200 && side <= 3000, `${p.id} size ${p.width}x${p.height}`);
    assert.ok(p.deviceScaleFactor >= 1 && p.deviceScaleFactor <= 4, `${p.id} dpr`);
  }
});

test('presets: groups cover phones, tablets, laptops/desktops and common CSS breakpoints', () => {
  const { presets, groups } = load();
  for (const group of ['Phones', 'Tablets', 'Laptops & desktops', 'CSS breakpoints']) {
    assert.ok(groups.includes(group), `group ${group}`);
    assert.ok(presets.some(p => p.group === group), `presets in ${group}`);
  }
});

test('presets: phones and tablets are touch/mobile with high pixel density; desktops are not', () => {
  const { presets } = load();
  for (const p of presets.filter(x => x.group === 'Phones')) {
    assert.equal(p.mobile, true, p.id); assert.equal(p.touch, true, p.id); assert.ok(p.deviceScaleFactor >= 2, p.id);
  }
  for (const p of presets.filter(x => x.group === 'Tablets')) { assert.equal(p.touch, true, p.id); assert.ok(p.deviceScaleFactor >= 2, p.id); }
  for (const p of presets.filter(x => x.group === 'Laptops & desktops')) {
    assert.equal(p.mobile, false, p.id); assert.equal(p.touch, false, p.id); assert.equal(p.deviceScaleFactor, 1, p.id);
  }
});

test('presets: the sizes testers rely on most are present', () => {
  const sizes = new Set(load().presets.map(p => `${p.width}x${p.height}`));
  for (const size of ['375x667', '390x844', '430x932', '412x915', '360x800', '768x1024', '820x1180', '1024x1366', '1366x768', '1440x900', '1920x1080']) {
    assert.ok(sizes.has(size), `missing ${size}`);
  }
});

test('device options: rotation swaps sides; custom sizes get sensible defaults; bad values are refused', () => {
  const { find, deviceOptions } = load();
  const phone = find('iphone-14');
  assert.deepEqual({ ...deviceOptions(phone, true) }, { width: 844, height: 390, mobile: true, touch: true, deviceScaleFactor: 3 });
  assert.deepEqual({ ...deviceOptions({ width: 500, height: 900 }) }, { width: 500, height: 900, mobile: true, touch: true, deviceScaleFactor: 2 });
  assert.deepEqual({ ...deviceOptions({ width: 1280, height: 800 }) }, { width: 1280, height: 800, mobile: false, touch: false, deviceScaleFactor: 1 });
  assert.throws(() => deviceOptions({ width: 100, height: 900 }), /200 to 3000/);
  assert.throws(() => deviceOptions({ width: 400, height: 900, deviceScaleFactor: 9 }), /pixel density/i);
});
