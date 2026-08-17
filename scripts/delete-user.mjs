/**
 * scripts/delete-user.mjs
 *
 * Removes one account and everything it owns: its pages, those pages' posts,
 * and every file in R2 those records point at. Written for the LNK-3
 * verification, which needs a second account it can rename freely, but it is
 * the only way to remove an account at all — there is no UI for it.
 *
 * Deliberately narrow: it takes an email address, never a pattern, and it
 * refuses to run without one. Dry run by default, `--commit` to apply.
 *
 *   node scripts/delete-user.mjs --email someone@example.com
 *   node scripts/delete-user.mjs --email someone@example.com --commit
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');
const emailArg = process.argv.indexOf('--email');
const EMAIL = emailArg > -1 ? process.argv[emailArg + 1] : null;

if (!EMAIL) {
  console.error('Refusing to run without --email <address>.');
  process.exit(1);
}

function loadEnv() {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  const values = {};
  for (const line of env.split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
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
  const users = db.collection('users');
  const pagesCol = db.collection('pages');
  const postsCol = db.collection('posts');

  console.log(COMMIT ? '\n=== APPLYING CHANGES ===\n' : '\n=== DRY RUN (no writes) ===\n');

  const user = await users.findOne({ email: EMAIL.toLowerCase().trim() });
  if (!user) {
    console.log(`No account with email ${EMAIL}. Nothing to do.\n`);
    await mongoose.disconnect();
    return;
  }

  const pages = await pagesCol.find({ userId: user._id }).toArray();
  const posts = await postsCol
    .find({ pageId: { $in: pages.map((p) => p._id) } })
    .toArray();

  const domain = value('NEXT_PUBLIC_R2_DOMAIN');
  const keys = [
    ...new Set(
      [
        ...pages.map((p) => p.thumbnail),
        ...posts.flatMap((p) => [p.content, p.thumbnail]),
      ]
        .map((url) => toObjectKey(url, domain))
        .filter(Boolean)
    ),
  ];

  console.log(`account   @${user.usernameTag}  "${user.usernameTitle}"  <${user.email}>`);
  console.log(`          _id ${user._id}, created ${user.createdAt ? new Date(user.createdAt).toISOString() : 'unknown'}`);
  if (user.previousTags?.length) console.log(`          previous tags: ${user.previousTags.join(', ')}`);
  console.log(`pages     ${pages.length}${pages.length ? ': ' + pages.map((p) => p.slug).join(', ') : ''}`);
  console.log(`posts     ${posts.length}`);
  console.log(`files     ${keys.length}`);
  for (const key of keys) console.log(`            ${key}`);

  if (!COMMIT) {
    console.log('\nRe-run with --commit to apply.\n');
    await mongoose.disconnect();
    return;
  }

  if (keys.length > 0) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${value('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: value('R2_ACCESS_KEY_ID'),
        secretAccessKey: value('R2_SECRET_ACCESS_KEY'),
      },
    });
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: value('R2_BUCKET_NAME'),
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      })
    );
    const failed = result?.Errors?.length || 0;
    console.log(`\ndeleted ${keys.length - failed} of ${keys.length} file(s)`);
  }

  const deletedPosts = await postsCol.deleteMany({ pageId: { $in: pages.map((p) => p._id) } });
  const deletedPages = await pagesCol.deleteMany({ userId: user._id });
  const deletedUser = await users.deleteOne({ _id: user._id });
  console.log(`deleted ${deletedPosts.deletedCount} post(s), ${deletedPages.deletedCount} page(s), ${deletedUser.deletedCount} account`);

  const stillThere = await users.countDocuments({ _id: user._id });
  console.log(`account remaining: ${stillThere}\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
