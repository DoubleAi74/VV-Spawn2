#!/usr/bin/env node
/**
 * migrate.mjs — One-off Firebase (VV_Original) → MongoDB (VV-Spawn2) migration.
 *
 * Migrates: users, pages, posts.
 * Does NOT migrate: passwords (set to a known placeholder), Firebase Auth tokens,
 *                   VerificationTokens, PasswordResetTokens, R2 files (unchanged).
 *
 * Run from the VV-Spawn2 directory:
 *   Dry run:  node --env-file=.env.local scripts/migrate.mjs --dry-run
 *   Live:     node --env-file=.env.local scripts/migrate.mjs
 *
 * Required env vars (in .env.local):
 *   MONGODB_URI                    — existing app variable
 *   FIREBASE_SERVICE_ACCOUNT_PATH  — path to Firebase service account JSON
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { connectDB } from '../lib/db.js';
import User from '../lib/models/User.js';
import Page from '../lib/models/Page.js';
import Post from '../lib/models/Post.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

// All migrated users get this password. They can reset it immediately via the
// app's forgot-password flow. It is intentionally not secret — it is a placeholder.
const MIGRATION_PASSWORD = 'Volvox74';

// ── Logging ───────────────────────────────────────────────────────────────────

const log  = (msg) => console.log(`[migrate]       ${msg}`);
const warn = (msg) => console.warn(`[migrate:WARN]  ${msg}`);
const err  = (msg, e) => console.error(`[migrate:ERROR] ${msg}`, e ? e.message || e : '');

// ── Env validation ────────────────────────────────────────────────────────────

function checkEnv() {
  const missing = [];
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH) missing.push('FIREBASE_SERVICE_ACCOUNT_PATH');
  if (missing.length) {
    err(`Missing required environment variable(s): ${missing.join(', ')}`);
    err('Make sure you are running with --env-file=.env.local from the VV-Spawn2 directory.');
    process.exit(1);
  }
}

// ── Firebase Admin init ───────────────────────────────────────────────────────

function initFirebase() {
  const saPath = resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
  } catch (e) {
    err(`Could not read Firebase service account at "${saPath}":`, e);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  log(`Firebase Admin initialised (project: ${serviceAccount.project_id}).`);
  return admin.firestore();
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

async function fetchCollection(firestore, name) {
  log(`Fetching Firestore "${name}" ...`);
  const snap = await firestore.collection(name).get();
  log(`  → ${snap.size} document(s) in "${name}".`);
  return snap.docs.map((doc) => ({ _firestoreId: doc.id, ...doc.data() }));
}

// Safely converts a Firestore Timestamp, JS Date, or null to a JS Date.
function toDate(value, fallback = new Date()) {
  if (!value) return fallback;
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

// ── content_type mapping ──────────────────────────────────────────────────────

const CONTENT_TYPE_MAP = {
  'photo-only': 'photo', // old enum value renamed in new schema
  photo:        'photo',
  url:          'url',
  file:         'file',
  text:         'text',
};

function mapContentType(raw, postId) {
  const mapped = CONTENT_TYPE_MAP[raw];
  if (!mapped) {
    throw new Error(
      `Post ${postId} has unknown content_type "${raw}". ` +
      `Valid values: ${Object.keys(CONTENT_TYPE_MAP).join(', ')}.`
    );
  }
  return mapped;
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function migrateUsers(firestoreUsers, passwordHash) {
  log('\n── Users ─────────────────────────────────────────');

  const stats = { upserted: 0, errors: 0 };
  // Firebase UID → new MongoDB _id. Built here, consumed by migratePages().
  const uidToMongoId = new Map();

  for (const src of firestoreUsers) {
    const firebaseUid = src._firestoreId;

    // Hard-fail on missing required fields so corrupt data does not silently slip in.
    if (!src.email) {
      err(`User ${firebaseUid}: missing "email" — skipping.`);
      stats.errors++;
      continue;
    }
    if (!src.usernameTag) {
      err(`User ${firebaseUid} (${src.email}): missing "usernameTag" — skipping.`);
      stats.errors++;
      continue;
    }
    if (!src.usernameTitle) {
      err(`User ${firebaseUid} (${src.email}): missing "usernameTitle" — skipping.`);
      stats.errors++;
      continue;
    }

    const email = src.email.toLowerCase().trim();
    const doc = {
      email,
      passwordHash,
      usernameTitle: src.usernameTitle.trim(),
      usernameTag:   src.usernameTag.toLowerCase().trim(),
      pageCount:     typeof src.pageCount === 'number' ? src.pageCount : 0,
      dashboard: {
        infoText: src.dashboard?.infoText ?? '',
        dashHex:  src.dashboard?.dashHex  ?? '#2d3e50',
        backHex:  src.dashboard?.backHex  ?? '#e5e7eb',
      },
      // dashboard.lastEditedAt has no equivalent field in the new schema — dropped.
      createdAt:   toDate(src.createdAt),
      firebaseUid,
    };

    log(`  user  ${email}  (firebaseUid: ${firebaseUid})`);

    if (DRY_RUN) {
      // Use a placeholder ID so the pages phase can build its own map in dry-run.
      uidToMongoId.set(firebaseUid, `dry-run:${firebaseUid}`);
      stats.upserted++;
      continue;
    }

    try {
      const result = await User.findOneAndUpdate(
        { email },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      uidToMongoId.set(firebaseUid, result._id);
      stats.upserted++;
    } catch (e) {
      err(`User ${email}: upsert failed.`, e);
      stats.errors++;
    }
  }

  log(`Users complete — upserted: ${stats.upserted}, errors: ${stats.errors}`);
  return { stats, uidToMongoId };
}

// ── Pages ─────────────────────────────────────────────────────────────────────

async function migratePages(firestorePages, uidToMongoId) {
  log('\n── Pages ─────────────────────────────────────────');

  const stats = { upserted: 0, errors: 0 };
  // Firestore page doc ID → new MongoDB _id. Built here, consumed by migratePosts().
  const pageIdToMongoId = new Map();

  for (const src of firestorePages) {
    const firestorePageId = src._firestoreId;
    const mongoUserId = uidToMongoId.get(src.userId);

    if (!mongoUserId) {
      err(`Page ${firestorePageId}: userId "${src.userId}" not found in migrated users — skipping.`);
      stats.errors++;
      continue;
    }
    if (!src.slug) {
      err(`Page ${firestorePageId}: missing "slug" — skipping.`);
      stats.errors++;
      continue;
    }
    if (!src.title) {
      err(`Page ${firestorePageId}: missing "title" — skipping.`);
      stats.errors++;
      continue;
    }

    // isPublic exists in the old schema but has no equivalent in the new Page model.
    // Log a warning so it is not silently swallowed; do not invent a field for it.
    if (src.isPublic !== undefined) {
      warn(
        `Page ${firestorePageId} ("${src.slug}"): "isPublic" (${src.isPublic}) has no ` +
        `equivalent in the new schema and will be dropped. ` +
        `Add an isPublic field to Page.js if the app needs it.`
      );
    }

    const doc = {
      userId:      mongoUserId,
      usernameTag: src.usernameTag ?? '',
      slug:        src.slug,
      title:       src.title,
      description: src.description ?? '',
      thumbnail:   src.thumbnail   ?? '',
      blurDataURL: src.blurDataURL ?? '',
      isPrivate:   src.isPrivate   ?? false,
      order_index: typeof src.order_index === 'number' ? src.order_index : 1,
      postCount:   typeof src.postCount   === 'number' ? src.postCount   : 0,
      pageMetaData: {
        infoText1: src.pageMetaData?.infoText1 ?? '',
        infoText2: src.pageMetaData?.infoText2 ?? '',
      },
      createdAt:      toDate(src.created_date),
      firebasePageId: firestorePageId,
    };

    log(`  page  "${doc.slug}"  user: ${src.userId}  (firestoreId: ${firestorePageId})`);

    if (DRY_RUN) {
      pageIdToMongoId.set(firestorePageId, `dry-run:${firestorePageId}`);
      stats.upserted++;
      continue;
    }

    try {
      const result = await Page.findOneAndUpdate(
        { userId: mongoUserId, slug: doc.slug },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      pageIdToMongoId.set(firestorePageId, result._id);
      stats.upserted++;
    } catch (e) {
      err(`Page "${doc.slug}" (${firestorePageId}): upsert failed.`, e);
      stats.errors++;
    }
  }

  log(`Pages complete — upserted: ${stats.upserted}, errors: ${stats.errors}`);
  return { stats, pageIdToMongoId };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

async function migratePosts(firestorePosts, pageIdToMongoId) {
  log('\n── Posts ─────────────────────────────────────────');

  const stats = { upserted: 0, errors: 0 };

  for (const src of firestorePosts) {
    const firestorePostId = src._firestoreId;
    const mongoPageId = pageIdToMongoId.get(src.page_id);

    if (!mongoPageId) {
      err(`Post ${firestorePostId}: page_id "${src.page_id}" not found in migrated pages — skipping.`);
      stats.errors++;
      continue;
    }
    if (!src.slug) {
      err(`Post ${firestorePostId}: missing "slug" — skipping.`);
      stats.errors++;
      continue;
    }

    let content_type;
    try {
      content_type = mapContentType(src.content_type, firestorePostId);
    } catch (e) {
      err(e.message + ' — skipping.');
      stats.errors++;
      continue;
    }

    const doc = {
      pageId:      mongoPageId,
      slug:        src.slug,
      title:       src.title       ?? '',
      description: src.description ?? '',
      content:     src.content     ?? '',
      content_type,
      thumbnail:   src.thumbnail   ?? '',
      blurDataURL: src.blurDataURL ?? '',
      order_index: typeof src.order_index === 'number' ? src.order_index : 1,
      createdAt:   toDate(src.created_date),
    };

    log(`  post  "${doc.slug}"  page: ${src.page_id}  type: ${content_type}`);

    if (DRY_RUN) {
      stats.upserted++;
      continue;
    }

    try {
      await Post.findOneAndUpdate(
        { pageId: mongoPageId, slug: doc.slug },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      stats.upserted++;
    } catch (e) {
      err(`Post "${doc.slug}" (${firestorePostId}): upsert failed.`, e);
      stats.errors++;
    }
  }

  log(`Posts complete — upserted: ${stats.upserted}, errors: ${stats.errors}`);
  return { stats };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  log('='.repeat(52));
  if (DRY_RUN) {
    log('DRY RUN — no data will be written to MongoDB.');
  } else {
    log('LIVE RUN — data WILL be written to MongoDB.');
  }
  log('='.repeat(52));
  console.log('');

  checkEnv();

  // ── 1. Firebase ──
  const firestore = initFirebase();

  // ── 2. MongoDB ──
  if (!DRY_RUN) {
    log('Connecting to MongoDB ...');
    await connectDB();
    log('MongoDB connected.');
  } else {
    log('[dry-run] Skipping MongoDB connection.');
  }

  // ── 3. Hash the migration password once (cost 12, same as the app) ──
  log(`Hashing migration password (cost 12) ...`);
  const passwordHash = await bcrypt.hash(MIGRATION_PASSWORD, 12);
  log('Password hashed.');

  // ── 4. Read all Firestore data before writing anything ──
  const [firestoreUsers, firestorePages, firestorePosts] = await Promise.all([
    fetchCollection(firestore, 'users'),
    fetchCollection(firestore, 'pages'),
    fetchCollection(firestore, 'posts'),
  ]);

  // ── 5. Migrate in dependency order: users → pages → posts ──
  const { stats: uStats, uidToMongoId }      = await migrateUsers(firestoreUsers, passwordHash);
  const { stats: pgStats, pageIdToMongoId }  = await migratePages(firestorePages, uidToMongoId);
  const { stats: ptStats }                   = await migratePosts(firestorePosts, pageIdToMongoId);

  // ── 6. Final summary ──
  const totalErrors = uStats.errors + pgStats.errors + ptStats.errors;
  console.log('');
  log('='.repeat(52));
  log('Summary');
  log('='.repeat(52));
  log(`Users : ${uStats.upserted}  upserted  /  ${uStats.errors}  errors`);
  log(`Pages : ${pgStats.upserted}  upserted  /  ${pgStats.errors}  errors`);
  log(`Posts : ${ptStats.upserted}  upserted  /  ${ptStats.errors}  errors`);
  log('-'.repeat(52));
  if (DRY_RUN) {
    log('Dry run complete — nothing written.');
  } else if (totalErrors > 0) {
    warn(`Migration finished with ${totalErrors} error(s). Review output above before going live.`);
    process.exit(1);
  } else {
    log('Migration complete. All records written successfully.');
    log('Next: run reconcilePageCount / reconcilePostCount if counts look off.');
  }
  console.log('');

  process.exit(0);
}

main().catch((e) => {
  err('Unhandled fatal error:', e);
  process.exit(1);
});
