import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRichText } from './sanitize.js';

test('sanitizeRichText still strips layout and CSS', () => {
  const out = sanitizeRichText(
    '<style>.x{color:red}</style><div class="x"><h1>Hi</h1></div><script>alert(1)</script>',
  );
  assert.equal(out.includes('<style>'), false);
  assert.equal(out.includes('<div'), false);
  assert.equal(out.includes('<script'), false);
  assert.equal(out.includes('<h1>Hi</h1>'), true);
});
