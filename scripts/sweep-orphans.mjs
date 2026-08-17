/**
 * scripts/sweep-orphans.mjs
 *
 * Collects posts whose page no longer exists, and the R2 objects they point
 * at. The race that produced them is closed in the app (see REL-7: deletePage
 * removes the parent row before the cascade, createPost re-reads its page
 * after the insert, and the client queue holds deletes until in-flight creates
 * drain). This is the cleanup half — for rows orphaned before that landed, and
 * as a standing check that nothing new is accumulating.
 *
 * An orphaned post is unreachable: it belongs to no page, so no route lists it
 * and nothing will ever delete its file. It is invisible cost, not corruption,
 * which is why this is a separate script rather than something the app does on
 * a timer.
 *
 *   node scripts/sweep-orphans.mjs            # dry run, prints what it found
 *   node scripts/sweep-orphans.mjs --commit   # delete the rows and the files
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

function loadEnv() {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  const values = {};
  for (const line of env.split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    // .env.local values are quoted; an unstripped quote makes the URI invalid.
    values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = loadEnv();
const value = (name) => process.env[name] || env[name];

function toObjectKey(publicUrl, domain) {
  if (!publicUrl || !domain) return null;
  const key = publicUrl.replace(`${domain}/`, '');
  if (!key || key === publicUrl) return null;
  return key;
}

async function main() {
  await mongoose.connect(value('MONGODB_URI'), { bufferCommands: false });
  const db = mongoose.connection.db;
  const pages = db.collection('pages');
  const posts = db.collection('posts');
  const users = db.collection('users');

  console.log(COMMIT ? '\n=== APPLYING CHANGES ===\n' : '\n=== DRY RUN (no writes) ===\n');

  const pageIds = new Set(
    (await pages.find({}, { projection: { _id: 1 } }).toArray()).map((page) => String(page._id))
  );
  const allPosts = await posts.find({}).toArray();
  const orphans = allPosts.filter((post) => !pageIds.has(String(post.pageId)));

  console.log(`${allPosts.length} posts across ${pageIds.size} pages.`);
  console.log(`${orphans.length} post(s) whose page no longer exists.\n`);

  const domain = value('NEXT_PUBLIC_R2_DOMAIN');
  const keys = new Set();

  for (const post of orphans) {
    // userId is denormalised onto Post by CLN-3, so rows written after that
    // still name their owner even once the page is gone. Older rows do not.
    const owner = post.userId
      ? (await users.findOne({ _id: post.userId }, { projection: { usernameTag: 1 } }))?.usernameTag
      : null;
    console.log(
      `post ${post._id}  slug=${post.slug}  type=${post.content_type}  ` +
        `created=${post.createdAt ? new Date(post.createdAt).toISOString() : 'unknown'}  ` +
        `owner=${owner ? '@' + owner : '(unknown — pre-CLN-3 row)'}`
    );
    for (const url of [post.content, post.thumbnail].filter(Boolean)) {
      const key = toObjectKey(url, domain);
      if (key) keys.add(key);
      const status = await fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then((res) => res.status)
        .catch(() => 'ERR');
      console.log(`   file ${status}  ${url}${key ? '' : '   (not ours — left alone)'}`);
    }
  }

  if (orphans.length === 0) {
    console.log('Nothing to sweep.\n');
    await mongoose.disconnect();
    return;
  }

  if (!COMMIT) {
    console.log(
      `\nWould delete ${orphans.length} post row(s) and ${keys.size} stored file(s).` +
        '\nRe-run with --commit to apply.\n'
    );
    await mongoose.disconnect();
    return;
  }

  if (keys.size > 0) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${value('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: value('R2_ACCESS_KEY_ID'),
        secretAccessKey: value('R2_SECRET_ACCESS_KEY'),
      },
    });
    const list = [...keys];
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: value('R2_BUCKET_NAME'),
        Delete: { Objects: list.map((Key) => ({ Key })), Quiet: true },
      })
    );
    const failed = result?.Errors?.length || 0;
    console.log(`\nDeleted ${list.length - failed} of ${list.length} stored file(s).`);
  }

  const deleted = await posts.deleteMany({ _id: { $in: orphans.map((post) => post._id) } });
  console.log(`Deleted ${deleted.deletedCount} post row(s).\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
