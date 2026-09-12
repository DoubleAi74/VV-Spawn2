import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildBlurPreviewUrl } from './blurPreview.js';
import { isLargerPreview, previewWrite } from '../scripts/regenerate-blur-previews.mjs';

test('the server preview uses 64px JPEG at 70 quality without additional blur', () => {
  assert.equal(buildBlurPreviewUrl('https://files.example.test/users/one/photo%20one.HEIC?w=960', 'https://files.example.test/'),
    'https://files.example.test/cdn-cgi/image/width=64,quality=70,format=jpeg/users/one/photo%20one.HEIC');
});

test('preview generation rejects sources outside the configured image origin', () => {
  for (const source of ['https://other.example.test/a.jpg', 'http://files.example.test/a.jpg', 'file:///etc/passwd', '/relative.jpg', 'invalid']) {
    assert.throws(() => buildBlurPreviewUrl(source, 'https://files.example.test'));
  }
});

test('regeneration changes only the preview and guards concurrent source or preview edits', () => {
  const entry = { collection: 'pages', id: '111111111111111111111111', thumbnail: 'https://files.example.test/a.jpg', previous: { present: true, value: 'old' }, next: 'new' };
  const { filter, update } = previewWrite(entry);
  assert.equal(String(filter._id), entry.id);
  assert.equal(filter.thumbnail, entry.thumbnail);
  assert.deepEqual(filter.blurDataURL, { $exists: true, $eq: 'old' });
  assert.deepEqual(update, { $set: { blurDataURL: 'new' } });
  const restore = previewWrite(entry, true);
  assert.equal(restore.filter.blurDataURL, 'new');
  assert.deepEqual(restore.update, { $set: { blurDataURL: 'old' } });
});

test('restoration distinguishes a missing preview from an explicit null', () => {
  const entry = { collection: 'posts', id: '222222222222222222222222', thumbnail: 'source', previous: { present: false, value: null }, next: 'new' };
  assert.deepEqual(previewWrite(entry).filter.blurDataURL, { $exists: false });
  assert.deepEqual(previewWrite(entry, true).update, { $unset: { blurDataURL: '' } });
  entry.previous.present = true;
  assert.deepEqual(previewWrite(entry).filter.blurDataURL, { $exists: true, $eq: null });
  assert.deepEqual(previewWrite(entry, true).update, { $set: { blurDataURL: null } });
  assert.throws(() => previewWrite({ ...entry, collection: 'users' }));
});

test('regeneration preserves valid larger previews and can replace small or broken ones', async () => {
  for (const width of [24, 64, 200]) {
    const buffer = await sharp({ create: { width, height: 40, channels: 3, background: '#91bacf' } }).jpeg().toBuffer();
    assert.equal(await isLargerPreview(`data:image/jpeg;base64,${buffer.toString('base64')}`), width > 64);
  }
  assert.equal(await isLargerPreview(null), false);
  assert.equal(await isLargerPreview('data:image/jpeg;base64,invalid'), false);
});
