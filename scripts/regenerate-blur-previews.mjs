/**
 * Regenerate page/post previews from their stored source images.
 * The default stages a reviewed plan and backup without changing Mongo.
 *
 * node scripts/regenerate-blur-previews.mjs [--profile usernameTag] [--include-larger]
 * node scripts/regenerate-blur-previews.mjs --apply artifacts/blur-previews/PLAN.json
 * node scripts/regenerate-blur-previews.mjs --restore artifacts/blur-previews/PLAN.json
 *
 * Each write checks both the source URL and previous preview, so a concurrent
 * image replacement is skipped. Reapplying a completed plan is harmless.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import env from '@next/env';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { BLUR_PREVIEW_WIDTH, BLUR_PREVIEW_QUALITY, buildBlurPreviewUrl } from '../lib/blurPreview.js';
import { isRetryableStatus, runWithConcurrency } from '../lib/uploadPolicy.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bytesOf = value => Buffer.byteLength(value || '');

export async function isLargerPreview(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
  try {
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    const metadata = await sharp(buffer).metadata();
    if (metadata.width <= BLUR_PREVIEW_WIDTH) return false;
    await sharp(buffer).stats();
    return true;
  } catch {
    return false;
  }
}

export function previewWrite(entry, restore = false) {
  if (!['pages', 'posts'].includes(entry.collection) || !mongoose.isObjectIdOrHexString(entry.id)) {
    throw new TypeError('Invalid preview record');
  }
  if (typeof entry.thumbnail !== 'string' || typeof entry.next !== 'string' ||
      typeof entry.previous?.present !== 'boolean' ||
      (entry.previous.present && entry.previous.value !== null && typeof entry.previous.value !== 'string')) {
    throw new TypeError('Invalid preview values');
  }
  const old = entry.previous;
  const filter = {
    _id: new mongoose.Types.ObjectId(entry.id),
    thumbnail: entry.thumbnail,
    blurDataURL: restore ? entry.next : old.present
      ? { $exists: true, $eq: old.value }
      : { $exists: false },
  };
  const update = restore
    ? old.present ? { $set: { blurDataURL: old.value } } : { $unset: { blurDataURL: '' } }
    : { $set: { blurDataURL: entry.next } };
  return { filter, update };
}

async function validatePreview(dataUrl) {
  if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('Preview is not a JPEG data URL');
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (buffer.length > 64 * 1024) throw new Error('Preview exceeds 64 KiB');
  const metadata = await sharp(buffer).metadata();
  if (metadata.format !== 'jpeg' || metadata.width !== BLUR_PREVIEW_WIDTH || !metadata.height) {
    throw new Error(`Unexpected preview dimensions: ${metadata.width} x ${metadata.height}`);
  }
  await sharp(buffer).stats(); // Decode all pixels, not just the header.
  return { width: metadata.width, height: metadata.height };
}

async function fetchPreview(source, domain) {
  const url = buildBlurPreviewUrl(source, domain);
  for (let attempt = 1; attempt <= 3; attempt++) {
    let retryable = true;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        retryable = isRetryableStatus(response.status);
        throw new Error(`Image service returned HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      const dimensions = await validatePreview(dataUrl);
      return { dataUrl, dimensions };
    } catch (error) {
      if (!retryable || attempt === 3) throw error;
      await sleep(attempt * 500);
    }
  }
}

async function stage(db, options, domain) {
  let userId;
  if (options.profile) {
    const user = await db.collection('users').findOne({ usernameTag: options.profile }, { projection: { _id: 1 } });
    if (!user) throw new Error('Profile not found');
    userId = user._id;
  }
  const rows = [];
  for (const collection of ['pages', 'posts']) {
    const filter = { thumbnail: { $type: 'string', $ne: '' }, ...(userId ? { userId } : {}) };
    const records = await db.collection(collection).find(filter, {
      projection: { thumbnail: 1, blurDataURL: 1, title: 1 },
    }).sort({ _id: 1 }).toArray();
    rows.push(...records.map(record => ({ collection, record })));
  }
  console.log(`Staging ${rows.length} previews at ${BLUR_PREVIEW_WIDTH}px / quality ${BLUR_PREVIEW_QUALITY}; no database writes.`);
  const fetched = new Map();
  const skipped = [];
  let finished = 0;
  const results = await runWithConcurrency(rows.map(({ collection, record }) => async () => {
    try {
      if (!options['include-larger'] && await isLargerPreview(record.blurDataURL)) {
        skipped.push({ collection, id: String(record._id), reason: 'Existing preview is larger than 64px' });
        return null;
      }
      if (!fetched.has(record.thumbnail)) fetched.set(record.thumbnail, fetchPreview(record.thumbnail, domain));
      const preview = await fetched.get(record.thumbnail);
      return {
        collection, id: String(record._id), title: record.title || '', thumbnail: record.thumbnail,
        previous: { present: Object.hasOwn(record, 'blurDataURL'), value: record.blurDataURL ?? null },
        next: preview.dataUrl, dimensions: preview.dimensions,
      };
    } finally {
      finished++;
      if (finished % 10 === 0 || finished === rows.length) console.log(`Processed ${finished}/${rows.length}`);
    }
  }), 4);
  const entries = results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
  const failures = results.flatMap((result, index) => result.status === 'rejected' ? [{
    collection: rows[index].collection, id: String(rows[index].record._id), error: result.reason.message,
  }] : []);
  const plan = {
    version: 1, database: db.databaseName, domain, createdAt: new Date().toISOString(),
    width: BLUR_PREVIEW_WIDTH, quality: BLUR_PREVIEW_QUALITY, scope: options.profile || 'all profiles',
    entries, failures, skipped,
  };
  const filename = resolve(options.output || resolve(ROOT, 'artifacts/blur-previews', `previews-${Date.now()}.json`));
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({
    plan: filename, staged: entries.length, failed: failures.length, preservedLarger: skipped.length,
    oldDataUrlBytes: entries.reduce((sum, entry) => sum + bytesOf(entry.previous.value), 0),
    newDataUrlBytes: entries.reduce((sum, entry) => sum + bytesOf(entry.next), 0),
    failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

async function apply(db, filename, domain, restore) {
  const plan = JSON.parse(await readFile(filename, 'utf8'));
  if (plan.version !== 1 || plan.database !== db.databaseName || plan.domain !== domain ||
      plan.width !== BLUR_PREVIEW_WIDTH || plan.quality !== BLUR_PREVIEW_QUALITY ||
      !Array.isArray(plan.entries) || !Array.isArray(plan.failures) || plan.failures.length) {
    throw new Error('Plan is incomplete or does not match this database and preview configuration');
  }
  // Validate the entire file before the first database write.
  for (const entry of plan.entries) {
    previewWrite(entry, restore);
    buildBlurPreviewUrl(entry.thumbnail, domain);
    await validatePreview(entry.next);
  }
  const report = { operation: restore ? 'restore' : 'apply', updated: 0, alreadyCurrent: 0, conflicts: [] };
  for (const entry of plan.entries) {
    const { filter, update } = previewWrite(entry, restore);
    const result = await db.collection(entry.collection).updateOne(filter, update);
    if (result.matchedCount) {
      if (result.modifiedCount) report.updated++;
      else report.alreadyCurrent++;
    }
    else {
      const current = await db.collection(entry.collection).findOne({ _id: filter._id }, { projection: { thumbnail: 1, blurDataURL: 1 } });
      const matches = restore
        ? entry.previous.present ? Object.hasOwn(current || {}, 'blurDataURL') && current.blurDataURL === entry.previous.value
          : current && !Object.hasOwn(current, 'blurDataURL')
        : current?.blurDataURL === entry.next;
      if (current?.thumbnail === entry.thumbnail && matches) report.alreadyCurrent++;
      else report.conflicts.push({ collection: entry.collection, id: entry.id });
    }
  }
  // Check the stored result, including every record that was updated.
  report.verified = 0;
  for (const entry of plan.entries) {
    const current = await db.collection(entry.collection).findOne({ _id: new mongoose.Types.ObjectId(entry.id) }, { projection: { thumbnail: 1, blurDataURL: 1 } });
    const matches = restore
      ? entry.previous.present ? Object.hasOwn(current || {}, 'blurDataURL') && current.blurDataURL === entry.previous.value
        : current && !Object.hasOwn(current, 'blurDataURL')
      : current?.blurDataURL === entry.next;
    if (current?.thumbnail === entry.thumbnail && matches) report.verified++;
  }
  await writeFile(`${filename}.${report.operation}-${Date.now()}.json`, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (report.conflicts.length || report.verified !== plan.entries.length) process.exitCode = 1;
}

async function main() {
  const { values: options } = parseArgs({ options: {
    profile: { type: 'string' }, output: { type: 'string' },
    apply: { type: 'string' }, restore: { type: 'string' },
    'include-larger': { type: 'boolean', default: false },
  } });
  if ((options.apply && options.restore) || ((options.apply || options.restore) && (options.profile || options.output || options['include-larger']))) {
    throw new Error('Use stage options, --apply, or --restore separately');
  }
  env.loadEnvConfig(ROOT, true, { info() {}, error() {} });
  if (!process.env.MONGODB_URI || !process.env.NEXT_PUBLIC_R2_DOMAIN) throw new Error('Missing database or image configuration');
  const domain = new URL(process.env.NEXT_PUBLIC_R2_DOMAIN).origin;
  try {
    await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 15_000 });
    const db = mongoose.connection.db;
    if (options.apply || options.restore) await apply(db, resolve(options.apply || options.restore), domain, Boolean(options.restore));
    else await stage(db, options, domain);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
