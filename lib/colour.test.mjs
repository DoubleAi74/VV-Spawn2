import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  focusRingOn,
  getInfoPalette,
  getLuminance,
  hexToRgb,
  hexToRgba,
  lighten,
  mixHex,
  normalizeHex,
  readableInkOn,
} from './colour.js';

test('normalizeHex accepts what the pickers and the database actually hold', () => {
  assert.equal(normalizeHex('#2d3e50'), '#2d3e50');
  assert.equal(normalizeHex('2d3e50'), '#2d3e50');
  assert.equal(normalizeHex('  #2d3e50  '), '#2d3e50');
  // Case is preserved, not normalised — CSS does not care, and FND-2 was an
  // extraction that changed no behaviour.
  assert.equal(normalizeHex('#2D3E50'), '#2D3E50');
});

test('normalizeHex falls back rather than producing something unusable', () => {
  assert.equal(normalizeHex('', '#123456'), '#123456');
  assert.equal(normalizeHex(null, '#123456'), '#123456');
  assert.equal(normalizeHex(undefined, '#123456'), '#123456');
  assert.equal(normalizeHex('not a colour', '#123456'), '#123456');
  assert.equal(normalizeHex('#12345', '#123456'), '#123456');
});

test('hexToRgb and hexToRgba', () => {
  assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  assert.equal(hexToRgba('#2d3e50', 0.5), 'rgba(45, 62, 80, 0.5)');
  assert.equal(hexToRgba('#2d3e50'), 'rgba(45, 62, 80, 1)');
});

test('lighten moves towards white and clamps there', () => {
  assert.equal(lighten('#000000', 0), '#000000');
  assert.equal(lighten('#000000', 30), '#1e1e1e');
  assert.equal(lighten('#ffffff', 30), '#ffffff');
  // The old header rule: 245 on anything pale clamps to white, which is why
  // LNK-4 stopped using it to pick text colour.
  assert.equal(lighten('#e5e7eb', 245), '#ffffff');
});

test('mixHex interpolates and clamps its weight', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#000000', '#ffffff', -1), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 2), '#ffffff');
});

test('getLuminance matches the WCAG anchors', () => {
  assert.equal(getLuminance('#000000'), 0);
  assert.equal(getLuminance('#ffffff'), 1);
  assert.ok(getLuminance('#808080') > 0.2 && getLuminance('#808080') < 0.24);
  // Green dominates the coefficients.
  assert.ok(getLuminance('#00ff00') > getLuminance('#ff0000'));
  assert.ok(getLuminance('#ff0000') > getLuminance('#0000ff'));
});

test('contrastRatio matches the WCAG anchors', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  // Symmetric.
  assert.equal(contrastRatio('#2d3e50', '#ffffff'), contrastRatio('#ffffff', '#2d3e50'));
});

test('readableInkOn never leaves text invisible — the LNK-4 guarantee', () => {
  // The two extremes the plan names, plus a sweep of the whole grey ramp and
  // the primaries: every one must clear WCAG AA for body text.
  const backgrounds = [
    '#ffffff',
    '#000000',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#ffff00',
    '#2d3e50',
    '#e5e7eb',
    ...Array.from({ length: 18 }, (_, i) => {
      const channel = Math.round((i * 255) / 17)
        .toString(16)
        .padStart(2, '0');
      return `#${channel}${channel}${channel}`;
    }),
  ];

  for (const background of backgrounds) {
    const ink = readableInkOn(background);
    const ratio = contrastRatio(ink, background);
    assert.ok(
      ratio >= 4.5,
      `${ink} on ${background} is only ${ratio.toFixed(2)}:1`
    );
  }
});

test('a saturated background falls back to the pure ink rather than missing AA', () => {
  // The softened #111827 is only 4.44:1 on pure red; true black is 5.25:1.
  assert.equal(readableInkOn('#ff0000'), '#000000');
  assert.ok(contrastRatio(readableInkOn('#ff0000'), '#ff0000') >= 4.5);
  // A background where the soft pair is comfortable keeps the soft pair.
  assert.equal(readableInkOn('#ffffff'), '#111827');
  assert.equal(readableInkOn('#000000'), '#f8fafc');
});

test('readableInkOn picks the ink that is further away, not a fixed one', () => {
  assert.notEqual(readableInkOn('#ffffff'), readableInkOn('#000000'));
  assert.equal(readableInkOn('#ffffff'), readableInkOn('#f8fafc'));
  assert.equal(readableInkOn('#000000'), readableInkOn('#111111'));
});

test('focusRingOn clears the 3:1 needed for a non-text indicator', () => {
  for (const background of ['#ffffff', '#000000', '#2d3e50', '#e5e7eb', '#7f7f7f']) {
    const ratio = contrastRatio(focusRingOn(background), background);
    assert.ok(ratio >= 3, `ring on ${background} is only ${ratio.toFixed(2)}:1`);
  }
});

test('an unusable hex still yields a readable ink via the fallback', () => {
  assert.equal(readableInkOn('', '#ffffff'), readableInkOn('#ffffff'));
  assert.equal(readableInkOn(null, '#000000'), readableInkOn('#000000'));
});

test('getInfoPalette flips with the background', () => {
  const onDark = getInfoPalette('#111111');
  const onLight = getInfoPalette('#f8fafc');
  assert.notEqual(onDark.textColor, onLight.textColor);
  assert.notEqual(onDark.panelBackground, onLight.panelBackground);
  // Both branches must return the same shape, or one of them renders undefined.
  assert.deepEqual(Object.keys(onDark).sort(), Object.keys(onLight).sort());
});
