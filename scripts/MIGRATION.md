# Firebase → MongoDB Migration

One-off migration from the Firebase-based `VV_Original` app into this
(`VV-Spawn2`) Next.js / MongoDB app.

---

## What the script does

1. Reads all documents from three Firestore collections (`users`, `pages`,
   `posts`) using the Firebase Admin SDK.
2. Connects to MongoDB via the existing `lib/db.js` singleton.
3. Transforms each document to the target Mongoose schema.
4. **Upserts** each document (safe to re-run; will not create duplicates).
5. Prints a summary with counts and any errors.

---

## What is migrated

| Source (Firestore) | Target (MongoDB) | Notes |
|--------------------|-----------------|-------|
| `users` | `users` (User model) | Profile data only — see password note below |
| `pages` | `pages` (Page model) | Full field mapping |
| `posts` | `posts` (Post model) | `content_type: "photo-only"` renamed to `"photo"` |

### Field notes

- **`users.dashboard.lastEditedAt`** — dropped. No equivalent field in the new
  User schema.
- **`pages.isPublic`** — dropped with a warning. The new Page schema has only
  `isPrivate`. Add an `isPublic` field to `Page.js` if the app needs it.
- **`pages.created_date` / `posts.created_date`** — converted from Firestore
  `Timestamp` to JS `Date` and stored as `createdAt`.
- **`firebaseUid`** — stored on every migrated User document for traceability.
- **`firebasePageId`** — stored on every migrated Page document so that the
  post migration phase can resolve parent IDs correctly.

---

## What is NOT migrated

- **Passwords** — Firebase Auth password hashes are not accessible from
  Firestore and use an incompatible algorithm (Firebase scrypt). Every migrated
  user is given the placeholder password **`Volvox74`**. Users should be asked
  to reset their password after first login.
- **Firebase Auth tokens / sessions** — not applicable.
- **VerificationTokens / PasswordResetTokens** — these are ephemeral and should
  be created fresh by the new app.
- **R2 files** — both apps share the same Cloudflare R2 bucket
  (`files.volvox.works`). No file migration is needed. Thumbnail and
  `blurDataURL` values are copied verbatim.

---

## Requirements

- **Node.js 20.6+** (for the `--env-file` flag).
- `firebase-admin` installed (`npm install` after the `package.json` update).
- A Firebase **service account JSON** file. Obtain from:
  Firebase Console → Project Settings → Service accounts → Generate new private key.

---

## Environment variables

Add to `.env.local` in the `VV-Spawn2` directory:

```
# Already present:
MONGODB_URI=mongodb+srv://...

# Add for migration only:
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/or/relative/path/to/service-account.json
```

`FIREBASE_SERVICE_ACCOUNT_PATH` can be a path relative to the directory you
run the script from, or an absolute path. Keep the service account file out of
version control (add it to `.gitignore`).

---

## Install the new devDependency first

```bash
cd VV-Spawn2
npm install
```

---

## Running a dry run (safe — nothing written)

```bash
cd VV-Spawn2
node --env-file=.env.local scripts/migrate.mjs --dry-run
```

The dry run:
- connects to Firestore and reads all data
- builds the full ID-mapping in memory
- logs every record that *would* be written
- does **not** open a MongoDB connection
- does **not** write anything

Review the output carefully before running live.

---

## Running the real migration

```bash
cd VV-Spawn2
node --env-file=.env.local scripts/migrate.mjs
```

The script will exit with code `0` on success or `1` if any record failed.
Errors are printed inline; the rest of the migration continues.

---

## Idempotency

The script uses `findOneAndUpdate` with `{ upsert: true }` on the following
unique keys:

| Collection | Upsert key |
|------------|-----------|
| User | `email` |
| Page | `{ userId, slug }` |
| Post | `{ pageId, slug }` |

Re-running the script will update existing documents rather than creating
duplicates.

---

## Post-migration checklist

- [ ] **Verify counts** — log in to MongoDB Atlas and compare document counts
  to what the script reported.
- [ ] **Reconcile counters** — `User.pageCount` and `Page.postCount` are
  carried over from Firestore. If they look wrong, run the
  `reconcilePageCount` / `reconcilePostCount` helpers in `lib/data.js`.
- [ ] **Test a login** — sign in as a migrated user with password `Volvox74`
  to confirm the auth flow works end-to-end.
- [ ] **Communicate to users** — notify all users that they should reset their
  password. The app's existing forgot-password flow (Resend + PasswordResetToken)
  handles this with no extra code.
- [ ] **Remove service account file** — delete or move the Firebase service
  account JSON once the migration is verified. Do not commit it.
- [ ] **Optional cleanup** — once the migration is confirmed stable, the
  `firebaseUid` and `firebasePageId` fields can be dropped from the schemas
  and a migration run to `$unset` them. Not urgent.
