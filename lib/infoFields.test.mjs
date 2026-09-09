import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_INFO_FIELDS, PAGE_INFO_FIELDS, infoFieldSet, parseInfoPatch } from './infoFields.js';
import { infoResponse } from './infoResponse.js';

for (const [prefix, fields] of [['dashboard', DASHBOARD_INFO_FIELDS], ['pageMetaData', PAGE_INFO_FIELDS]]) {
  test(`${prefix}: changing only HTML mode preserves both text fields and the other mode`, () => {
    assert.deepEqual(infoFieldSet({ infoMode1: 'html' }, fields, prefix), {
      [`${prefix}.infoMode1`]: 'html',
    });
  });
  test(`${prefix}: clearing text is explicit and cannot modify unrelated document fields`, () => {
    assert.deepEqual(infoFieldSet({ infoText1: '', userId: 'someone-else', isPrivate: false }, fields, prefix), {
      [`${prefix}.infoText1`]: '',
    });
    assert.throws(() => parseInfoPatch({ infoText1: null }, fields), /must be text/);
    assert.throws(() => parseInfoPatch({ infoMode1: 'javascript' }, fields), /text or html/);
    assert.throws(() => parseInfoPatch({}, fields), /No info fields/);
  });
}

test('conditional responses change when only the HTML toggle changes', async () => {
  const url = 'https://example.test/info';
  const values = { infoText1: '<h1>Hello</h1>', infoMode1: 'text' };
  const first = infoResponse(new Request(url), values);
  const request = new Request(url, { headers: { 'If-None-Match': first.headers.get('etag') } });
  const unchanged = infoResponse(request, values);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const changed = infoResponse(request, { ...values, infoMode1: 'html' });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).infoMode1, 'html');
  assert.equal(changed.headers.get('cache-control'), 'private, no-store');
});
