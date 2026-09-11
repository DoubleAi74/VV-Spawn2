import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeImage } from './decodeImage.js';

test('a complete download is not ready until decoding has finished', async () => {
  let finishDecode;
  let ready = false;
  const image = { complete: true, naturalWidth: 960, decode: () => new Promise(resolve => { finishDecode = resolve; }) };
  const result = decodeImage(image).then(value => { ready = value; });
  await Promise.resolve();
  assert.equal(ready, false);
  finishDecode();
  await result;
  assert.equal(ready, true);
});

test('missing, loading and broken images are not decoded or revealed', async () => {
  const decode = () => { throw new Error('Must not decode'); };
  assert.equal(await decodeImage(null), false);
  assert.equal(await decodeImage({ complete: false, naturalWidth: 960, decode }), false);
  assert.equal(await decodeImage({ complete: true, naturalWidth: 0, decode }), false);
  assert.equal(await decodeImage({ complete: true, naturalWidth: 960, decode }), false);
});

test('a replaced image is checked again when decoding resolves', async () => {
  const image = { complete: true, naturalWidth: 960, decode: async () => { image.complete = false; } };
  assert.equal(await decodeImage(image), false);
  assert.equal(await decodeImage({ complete: true, naturalWidth: 960 }), true);
});
