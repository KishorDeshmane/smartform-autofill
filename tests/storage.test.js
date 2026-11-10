const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithChromeStorage } = require('./helpers');

const FILES = ['utils/ext.js', 'utils/storage.js'];
const load = options => loadWithChromeStorage(FILES, options);

test('settings: missing keys come from defaults; saved values win', async () => {
  const { window } = load({ initial: { sffa_settings: { dataLocale: 'US', linkCheckLimit: 5 } } });
  const settings = await window.SFFAStorage.getSettings();
  assert.equal(settings.dataLocale, 'US');
  assert.equal(settings.linkCheckLimit, 5);
  assert.equal(settings.dryRunPageActions, true, 'safety default applied');
  assert.equal(settings.multiSelectCount, 2);
});

test('settings: empty or junk name/PIN lists fall back to the built-in samples', async () => {
  const { window } = load({ initial: { sffa_settings: { firstNames: ['', '  ', 42], lastNames: [' Rao '], testPinCodes: 'not-a-list' } } });
  const settings = await window.SFFAStorage.getSettings();
  assert.ok(settings.firstNames.length > 3 && settings.firstNames.every(name => typeof name === 'string' && name.trim()));
  assert.deepEqual([...settings.lastNames], ['Rao']);
  assert.ok(Array.isArray(settings.testPinCodes) && settings.testPinCodes.length > 0);
});

test('updateSettings merges a patch without dropping other saved settings', async () => {
  const { window, data } = load({ initial: { sffa_settings: { dataLocale: 'UK', linkCheckLimit: 9 } } });
  await window.SFFAStorage.updateSettings({ dataSeed: 'abc' });
  assert.equal(data.sffa_settings.dataSeed, 'abc');
  assert.equal(data.sffa_settings.dataLocale, 'UK');
  assert.equal(data.sffa_settings.linkCheckLimit, 9);
});

test('parallel settings updates are not lost (mutations are queued)', async () => {
  const { window, data } = load();
  await Promise.all([
    window.SFFAStorage.updateSettings({ dataSeed: 'one' }),
    window.SFFAStorage.updateSettings({ dataLocale: 'US' }),
    window.SFFAStorage.updateSettings({ linkCheckLimit: 3 }),
    window.SFFAStorage.updateSettings({ multiSelectCount: 4 })
  ]);
  assert.equal(data.sffa_settings.dataSeed, 'one');
  assert.equal(data.sffa_settings.dataLocale, 'US');
  assert.equal(data.sffa_settings.linkCheckLimit, 3);
  assert.equal(data.sffa_settings.multiSelectCount, 4);
});

test('used email/mobile history keeps every parallel write and is capped at 500', async () => {
  const { window, data } = load();
  await Promise.all(Array.from({ length: 40 }, (_, i) => window.SFFAStorage.addUsed('email', `user${i}@example.com`)));
  assert.equal(data.sffa_used_emails.length, 40, 'no lost updates');
  for (let i = 0; i < 520; i++) await window.SFFAStorage.addUsed('mobile', String(9000000000 + i));
  assert.equal(data.sffa_used_mobiles.length, 500);
  assert.equal(data.sffa_used_mobiles[0], String(9000000000 + 20), 'oldest entries are dropped first');
});

test('file mappings: add, de-duplicate, remove', async () => {
  const { window } = load();
  await window.SFFAStorage.addMappingFile('photo', 'f1');
  await window.SFFAStorage.addMappingFile('photo', 'f1');
  await window.SFFAStorage.addMappingFile('photo', 'f2');
  assert.deepEqual([...await window.SFFAStorage.getMappedFileIds('photo')], ['f1', 'f2']);
  await window.SFFAStorage.removeMappingFile('photo', 'f1');
  assert.deepEqual([...await window.SFFAStorage.getMappedFileIds('photo')], ['f2']);
});

test('clearCredentials removes only credentials', async () => {
  const { window, data } = load({ initial: { sffa_settings: { credentialsBySite: { 'a.test': { testPassword: 'x' } }, dataLocale: 'UK' } } });
  await window.SFFAStorage.clearCredentials();
  assert.deepEqual({ ...data.sffa_settings.credentialsBySite }, {});
  assert.equal(data.sffa_settings.dataLocale, 'UK');
});

test('clearAllData wipes everything but keeps the auto-clear interval', async () => {
  const { window, data } = load({ initial: { sffa_settings: { autoClearAfterDays: 7, dataLocale: 'UK' }, sffa_logs: ['x'], sffa_used_emails: ['a@b.c'] } });
  await window.SFFAStorage.clearAllData();
  assert.equal(data.sffa_logs, undefined);
  assert.equal(data.sffa_used_emails, undefined);
  assert.equal(data.sffa_settings.autoClearAfterDays, 7);
  assert.equal(data.sffa_settings.dataLocale, 'IN', 'other settings reset to defaults');
});

test('auto-clear deletes stored data after the configured days without activity', async () => {
  const eightDaysAgo = Date.now() - 8 * 86400000;
  const { window, data } = load({ initial: { sffa_settings: { autoClearAfterDays: 7 }, sffa_last_activity: eightDaysAgo, sffa_used_emails: ['old@example.com'] } });
  await window.SFFAStorage.getSettings();
  assert.equal(data.sffa_used_emails, undefined, 'stale data removed');
});

test('auto-clear keeps data that was used recently, and is off by default', async () => {
  const yesterday = Date.now() - 86400000;
  const recent = load({ initial: { sffa_settings: { autoClearAfterDays: 7 }, sffa_last_activity: yesterday, sffa_used_emails: ['keep@example.com'] } });
  await recent.window.SFFAStorage.getSettings();
  assert.deepEqual([...recent.data.sffa_used_emails], ['keep@example.com']);
  const off = load({ initial: { sffa_last_activity: 0, sffa_used_emails: ['keep@example.com'] } });
  await off.window.SFFAStorage.getSettings();
  assert.deepEqual([...off.data.sffa_used_emails], ['keep@example.com']);
});

test('outside the background, storage writes are routed to the background with a time limit', async () => {
  const { window } = load({ storageHost: false });
  const sent = [];
  window.SFFAExt.api.sendRuntimeMessage = async (message, options) => { sent.push({ message, options }); return { ok: true, value: 'stored' }; };
  const value = await window.SFFAStorage.addUsed('email', 'x@example.com');
  assert.equal(value, 'stored');
  assert.equal(sent[0].message.type, 'SFFA_STORAGE_MUTATION');
  assert.equal(sent[0].message.name, 'addUsed');
  assert.equal(sent[0].options.timeoutMs, 10000);
});
