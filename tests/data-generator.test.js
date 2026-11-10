const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWindow } = require('./helpers');

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];

/** Independent Verhoeff validation: a valid number (with check digit) reduces to 0. */
function verhoeffValid(number) {
  let c = 0;
  [...number].reverse().forEach((digit, i) => { c = D[c][P[i % 8][Number(digit)]]; });
  return c === 0;
}

/** Independent Luhn validation. */
function luhnValid(number) {
  let sum = 0;
  [...number].reverse().forEach((ch, i) => {
    let digit = Number(ch);
    if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  });
  return sum % 10 === 0;
}

/** Independent GSTIN check-character validation. */
function gstinValid(gstin) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = alphabet.indexOf(gstin[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return alphabet[(36 - (sum % 36)) % 36] === gstin[14];
}

const gen = () => loadWindow(['utils/data-generator.js']).SFFADataGenerator;
const SAMPLES = 200;

test('Aadhaar-shaped values are 12 digits, never start with 0/1, and pass Verhoeff', () => {
  const g = gen();
  for (let i = 0; i < SAMPLES; i++) {
    const value = g.generateAadhaar();
    assert.match(value, /^[2-9]\d{11}$/);
    assert.ok(verhoeffValid(value), `Verhoeff failed for ${value}`);
  }
});

test('Verhoeff validator rejects a single-digit change (sanity check for the test itself)', () => {
  const value = gen().generateAadhaar();
  const tampered = value.slice(0, 11) + String((Number(value[11]) + 1) % 10);
  assert.equal(verhoeffValid(tampered), false);
});

test('PAN-shaped values follow AAAAA9999A', () => {
  const g = gen();
  for (let i = 0; i < SAMPLES; i++) assert.match(g.generateIdentityNumber('PAN'), /^[A-Z]{5}\d{4}[A-Z]$/);
});

test('GSTIN-shaped values have a state code, embedded PAN, 1Z marker, and a valid check character', () => {
  const g = gen();
  for (let i = 0; i < SAMPLES; i++) {
    const value = g.generateGstNumber();
    assert.equal(value.length, 15);
    assert.match(value, /^(10|27|29|33|07)[A-Z]{5}\d{4}[A-Z]1Z[0-9A-Z]$/);
    assert.ok(gstinValid(value), `GSTIN checksum failed for ${value}`);
  }
});

test('card-shaped values are 16-digit Visa test-range numbers that pass Luhn', () => {
  const g = gen();
  for (let i = 0; i < SAMPLES; i++) {
    const value = g.generateCreditCardNumber();
    assert.match(value, /^4\d{15}$/);
    assert.ok(luhnValid(value), `Luhn failed for ${value}`);
  }
});

test('IBAN-shaped values satisfy ISO 7064 mod-97', () => {
  const value = gen().generateIban();
  assert.match(value, /^GB\d{2}NWBK\d{14}$/);
  const rearranged = value.slice(4) + value.slice(0, 4);
  const numeric = [...rearranged].map(ch => (/[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch)).join('');
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  assert.equal(remainder, 1);
});

test('generated locations are consistent with the state/district/city table', () => {
  const g = gen();
  for (let i = 0; i < 50; i++) {
    const { state, district, city } = g.generateLocation();
    assert.ok(g.STATE_DISTRICT_CITY[state]?.[district]?.includes(city), `${state}/${district}/${city}`);
  }
});

test('same seed produces identical fresh test data; different seeds differ', async () => {
  const settings = { dataSeed: 'replay-42', dataLocale: 'IN', testPinCodes: [], firstNames: [], lastNames: [] };
  const strip = data => { const copy = { ...data }; delete copy.generatedAt; return JSON.stringify(copy); };
  const a = await gen().generateFreshTestData(settings);
  const b = await gen().generateFreshTestData(settings);
  const c = await gen().generateFreshTestData({ ...settings, dataSeed: 'other-seed' });
  assert.equal(a.seed, 'replay-42');
  assert.equal(strip(a), strip(b));
  assert.notEqual(strip(a), strip(c));
});

test('empty seed keeps random behaviour and reports no seed', async () => {
  const g = gen();
  const a = await g.generateFreshTestData({ dataSeed: '' });
  const b = await g.generateFreshTestData({ dataSeed: '   ' });
  assert.equal(a.seed, null);
  assert.equal(g.getSeed(), null);
  assert.notEqual(a.email + a.mobile + a.aadhaar, b.email + b.mobile + b.aadhaar);
});

test('seeded rand() is deterministic and stays within [0, 1)', () => {
  const g = gen();
  g.setSeed('abc');
  const first = Array.from({ length: 20 }, () => g.rand());
  g.setSeed('abc');
  const second = Array.from({ length: 20 }, () => g.rand());
  assert.deepEqual(first, second);
  assert.ok(first.every(n => n >= 0 && n < 1));
});
