/**
 * scripts/normalize-order.mjs
 *
 * Repairs order_index drift: rewrites every user's pages and every page's
 * posts to a contiguous 1..n, and corrects the denormalised pageCount /
 * postCount fields.
 *
 * Ordering is preserved exactly as the app currently displays it, because the
 * read sort here matches SIBLING_SORT in lib/data.js ({ order_index, _id }).
 * Renumbering therefore never moves a card — it only makes the stored indexes
 * distinct so that reordering can work.
 *
 *   node scripts/normalize-order.mjs            # dry run, prints the plan
 *   node scripts/normalize-order.mjs --commit   # apply
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');
const SIBLING_SORT = { order_index: 1, _id: 1 };

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  const match = env.match(/^MONGODB_URI=(.*)$/m);
  if (!match) throw new Error('MONGODB_URI not found in environment or .env.local');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function planRenumber(items) {
  const ops = [];
  items.forEach((item, index) => {
    const desired = index + 1;
    if (item.order_index !== desired) {
      ops.push({ _id: item._id, from: item.order_index, to: desired, label: item.title });
    }
  });
  return ops;
}

async function main() {
  await mongoose.connect(loadMongoUri(), { bufferCommands: false });
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const pages = db.collection('pages');
  const posts = db.collection('posts');

  console.log(COMMIT ? '\n=== APPLYING CHANGES ===\n' : '\n=== DRY RUN (no writes) ===\n');

  let pageWrites = 0;
  let postWrites = 0;
  let countWrites = 0;

  for (const user of await users.find({}).sort({ usernameTag: 1 }).toArray()) {
    const userPages = await pages
      .find({ userId: user._id }, { projection: { title: 1, order_index: 1 } })
      .sort(SIBLING_SORT)
      .toArray();

    const pageOps = planRenumber(userPages);
    const countWrong = (user.pageCount ?? 0) !== userPages.length;

    if (pageOps.length || countWrong) {
      console.log(`@${user.usernameTag}  (${userPages.length} pages)`);
      for (const op of pageOps) {
        console.log(`   order_index ${op.from} -> ${op.to}   "${op.label}"`);
      }
      if (countWrong) {
        console.log(`   pageCount ${user.pageCount} -> ${userPages.length}`);
      }
    }

    if (COMMIT) {
      if (pageOps.length) {
        await pages.bulkWrite(
          pageOps.map((op) => ({
            updateOne: { filter: { _id: op._id }, update: { $set: { order_index: op.to } } },
          })),
          { ordered: false }
        );
        pageWrites += pageOps.length;
      }
      if (countWrong) {
        await users.updateOne({ _id: user._id }, { $set: { pageCount: userPages.length } });
        countWrites++;
      }
    } else {
      pageWrites += pageOps.length;
      if (countWrong) countWrites++;
    }

    // Posts, scoped per page
    for (const page of userPages) {
      const pagePosts = await posts
        .find({ pageId: page._id }, { projection: { title: 1, order_index: 1 } })
        .sort(SIBLING_SORT)
        .toArray();

      const postOps = planRenumber(pagePosts);
      const fullPage = await pages.findOne({ _id: page._id }, { projection: { postCount: 1 } });
      const postCountWrong = (fullPage.postCount ?? 0) !== pagePosts.length;

      if (postOps.length || postCountWrong) {
        console.log(`   ↳ "${page.title}" (${pagePosts.length} posts)`);
        for (const op of postOps) {
          console.log(`        order_index ${op.from} -> ${op.to}   "${op.label || '(untitled)'}"`);
        }
        if (postCountWrong) {
          console.log(`        postCount ${fullPage.postCount} -> ${pagePosts.length}`);
        }
      }

      if (COMMIT) {
        if (postOps.length) {
          await posts.bulkWrite(
            postOps.map((op) => ({
              updateOne: { filter: { _id: op._id }, update: { $set: { order_index: op.to } } },
            })),
            { ordered: false }
          );
          postWrites += postOps.length;
        }
        if (postCountWrong) {
          await pages.updateOne({ _id: page._id }, { $set: { postCount: pagePosts.length } });
          countWrites++;
        }
      } else {
        postWrites += postOps.length;
        if (postCountWrong) countWrites++;
      }
    }
  }

  console.log(
    `\n${COMMIT ? 'Applied' : 'Would apply'}: ` +
      `${pageWrites} page index, ${postWrites} post index, ${countWrites} count corrections.`
  );
  if (!COMMIT && pageWrites + postWrites + countWrites > 0) {
    console.log('Re-run with --commit to apply.\n');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
