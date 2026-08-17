/**
 * scripts/backfill-post-user.mjs
 *
 * Sets `Post.userId` on rows written before CLN-3 added the field, copying it
 * from the post's own page. Purely additive: it only ever fills a `userId`
 * that is missing, and it never touches one that is already set — if a stored
 * value disagrees with the page's owner the script reports it and changes
 * nothing, because that would be a different problem than this one.
 *
 * Dry run by default, `--commit` to apply.
 *
 *   node scripts/backfill-post-user.mjs
 *   node scripts/backfill-post-user.mjs --commit
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  const match = env.match(/^MONGODB_URI=(.*)$/m);
  if (!match) throw new Error('MONGODB_URI not found in environment or .env.local');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

async function counts(posts) {
  const total = await posts.countDocuments({});
  const withUserId = await posts.countDocuments({ userId: { $exists: true, $ne: null } });
  return { total, withUserId, without: total - withUserId };
}

async function main() {
  await mongoose.connect(loadMongoUri(), { bufferCommands: false });
  const db = mongoose.connection.db;
  const pagesCol = db.collection('pages');
  const postsCol = db.collection('posts');

  console.log(COMMIT ? '\n=== APPLYING CHANGES ===\n' : '\n=== DRY RUN (no writes) ===\n');

  const before = await counts(postsCol);
  console.log(`before:  ${before.total} posts, ${before.withUserId} with userId, ${before.without} without`);

  const pageOwner = new Map(
    (await pagesCol.find({}, { projection: { userId: 1 } }).toArray()).map((page) => [
      String(page._id),
      page.userId,
    ])
  );

  const missing = await postsCol
    .find({ $or: [{ userId: { $exists: false } }, { userId: null }] })
    .toArray();

  const plan = [];
  const unparented = [];
  for (const post of missing) {
    const owner = pageOwner.get(String(post.pageId));
    if (!owner) {
      unparented.push(post);
      continue;
    }
    plan.push({ _id: post._id, userId: owner });
  }

  // Rows whose userId disagrees with their page's owner: reported, never changed.
  const disagreements = [];
  for (const post of await postsCol
    .find({ userId: { $exists: true, $ne: null } }, { projection: { userId: 1, pageId: 1, slug: 1 } })
    .toArray()) {
    const owner = pageOwner.get(String(post.pageId));
    if (owner && String(owner) !== String(post.userId)) disagreements.push(post);
  }

  console.log(`\nwould set userId on ${plan.length} post(s)`);
  if (unparented.length) {
    console.log(
      `${unparented.length} post(s) have no page and so no owner to copy — ` +
        'run scripts/sweep-orphans.mjs, these are orphans (REL-7)'
    );
    for (const post of unparented) console.log(`   orphan ${post._id}  pageId=${post.pageId}`);
  }
  if (disagreements.length) {
    console.log(`\n${disagreements.length} post(s) already carry a userId that differs from their page's owner:`);
    for (const post of disagreements) {
      console.log(`   post ${post._id} slug=${post.slug} userId=${post.userId}`);
    }
    console.log('NOT modified — this script only fills in what is missing. Investigate separately.');
  }

  if (!COMMIT) {
    console.log(`\nafter (projected): ${before.total} posts, ${before.withUserId + plan.length} with userId, ` +
      `${before.without - plan.length} without`);
    if (plan.length) console.log('Re-run with --commit to apply.');
    console.log('');
    await mongoose.disconnect();
    return;
  }

  if (plan.length > 0) {
    const result = await postsCol.bulkWrite(
      plan.map((entry) => ({
        updateOne: { filter: { _id: entry._id }, update: { $set: { userId: entry.userId } } },
      })),
      { ordered: false }
    );
    console.log(`\nmatched ${result.matchedCount}, modified ${result.modifiedCount}`);
  }

  const after = await counts(postsCol);
  console.log(`after:   ${after.total} posts, ${after.withUserId} with userId, ${after.without} without`);
  console.log(`total post count unchanged: ${before.total === after.total ? 'yes' : 'NO — investigate'}\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
