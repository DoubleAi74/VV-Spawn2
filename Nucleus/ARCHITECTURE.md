# ARCHITECTURE — volvox.works

---

## 1. Technical Stack Summary

| Layer | Technology | Version / Notes |
|-------|-----------|----------------|
| Framework | Next.js (App Router) | Latest stable; no `src/` folder |
| Language | JavaScript + JSX | Vanilla JS; no TypeScript |
| Styling | Tailwind CSS | v3; `@tailwindcss/typography` plugin |
| Database | MongoDB + Mongoose | MongoDB Atlas (cloud-hosted) |
| Authentication | Auth.js (NextAuth v5) | JWT strategy; Credentials + Email providers |
| Email | Resend | Magic links and password reset |
| File Storage | Cloudflare R2 | S3-compatible; direct client uploads via presigned URLs |
| Image CDN | Cloudflare (vanilla) | No custom CDN transforms; static delivery from R2 domain |
| Deployment | Vercel | Standard Node.js runtime; required for Mongoose compatibility |
| AWS SDK | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Used for R2 presigned URL generation |
| Rich Text | react-quill-new | Editor for bio and info sections |
| Icons | lucide-react | SVG icon set |
| Dates | date-fns | Formatting and manipulation |
| Image conversion | heic2any | Client-side HEIC/HEIF to JPEG |
| Deployment | Vercel | Standard Node.js runtime; required for Mongoose compatibility |

---

## 2. Application Structure and Module Boundaries

```
/                          ← project root (no src/ folder)
├── app/                   ← Next.js App Router
│   ├── layout.js          ← Root layout: AuthProvider, ThemeProvider, global CSS
│   ├── page.js            ← Root: redirect to /login or /:usernameTag
│   ├── globals.css        ← Tailwind directives, animations, Quill overrides
│   ├── login/
│   │   ├── page.js        ← Login/Signup tab page (client component)
│   │   └── loading.js     ← Skeleton
│   ├── [usernameTag]/
│   │   ├── page.js        ← Dashboard server component (fetches user + pages)
│   │   ├── loading.js     ← Dashboard skeleton
│   │   └── [pageSlug]/
│   │       ├── page.js    ← Page view server component (fetches page + posts)
│   │       ├── loading.js ← Page skeleton
│   │       └── [postSlug]/
│   │           └── page.js ← Post detail (future; renders post metadata)
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.js  ← Auth.js catch-all handler
│       ├── storage/
│       │   ├── upload/route.js
│       │   ├── upload-batch/route.js
│       │   └── delete/route.js
│       └── generate-blur/route.js
├── components/
│   ├── dashboard/         ← Dashboard UI (client components)
│   │   ├── DashboardViewClient.js
│   │   ├── DashHeader.js
│   │   ├── DashboardInfoEditor.js
│   │   ├── CreatePageModal.js
│   │   ├── EditPageModal.js
│   │   ├── PageCard.js
│   │   └── TitleEdit.js
│   ├── page/              ← Page view UI (client components)
│   │   ├── PageViewClient.js
│   │   ├── PageInfoEditor.js
│   │   ├── CreatePostModal.js
│   │   ├── EditPostModal.js
│   │   ├── PostCard.js
│   │   ├── BulkUploadModal.js
│   │   ├── PhotoShowModal.js
│   │   ├── PostFileModal.js
│   │   └── RichTextEditor.js
│   ├── ActionButton.js
│   └── ImageWithLoader.js
├── context/
│   ├── AuthContext.js     ← Auth.js session wrapper; exposes useAuth()
│   └── ThemeContext.js    ← Theme colours + optimistic UI state
├── lib/
│   ├── db.js              ← Mongoose connection singleton (connection pooling)
│   ├── models/
│   │   ├── User.js        ← Mongoose User schema
│   │   ├── Page.js        ← Mongoose Page schema
│   │   └── Post.js        ← Mongoose Post schema
│   ├── data.js            ← All database access functions (server-side only)
│   ├── auth.js            ← Auth.js configuration (providers, callbacks, JWT)
│   ├── r2.js              ← R2 S3 client initialisation
│   ├── processImage.js    ← Client-side image resize, HEIC conversion, blur
│   ├── cloudflareLoader.js ← next/image custom loader pointing to R2 domain
│   └── useQueue.js        ← Operation queue hook (optimistic + rollback)
├── public/                ← Static assets (favicons, background images)
├── tailwind.config.js
├── next.config.mjs
├── jsconfig.json          ← Path alias: @/* → ./*
└── .env.local             ← Environment variables (never committed)
```

### Module Boundary Rules
- `lib/data.js` and `lib/models/` are **server-only**. They must never be imported by client components. Use `"use server"` functions or pass data through server component props.
- `lib/processImage.js` is **client-only**. It runs in the browser before any upload.
- `lib/useQueue.js` is a **client-only** React hook.
- `context/` files are **client-only** React contexts.
- API route handlers in `app/api/` run server-side only.

---

## 3. Runtime Architecture and Execution Model

### Server Components vs Client Components

| Component | Type | Reason |
|-----------|------|--------|
| `app/[usernameTag]/page.js` | Server | Fetches MongoDB data at request time; outputs serialised props |
| `app/[usernameTag]/[pageSlug]/page.js` | Server | Same |
| `app/[usernameTag]/[pageSlug]/[postSlug]/page.js` | Server | Same |
| `app/login/page.js` | Client | Interactive auth forms |
| All `components/dashboard/*` | Client | User interactions, modals, optimistic state |
| All `components/page/*` | Client | User interactions, modals, optimistic state |
| `app/layout.js` | Server wrapper + Client providers | Auth and theme providers require client context |

### Data Flow
1. **Initial page load**: Server component fetches from MongoDB via `lib/data.js`. Serialised data is passed as props to the Client component (`DashboardViewClient`, `PageViewClient`).
2. **Client-side mutations** (create, edit, delete, reorder, colour change): Client component calls `lib/data.js` functions exposed as Next.js Server Actions, or calls API route handlers.
3. **File uploads**: Client calls `/api/storage/upload` for presigned URL → uploads directly to R2 → saves resulting public URL via a data mutation.
4. **Optimistic updates**: ThemeContext and local component state are updated immediately; rollback occurs on confirmed failure.

### Rendering Strategy
- All data-bearing pages use **dynamic rendering** (no static generation); data is user-specific and changes frequently.
- Next.js `unstable_noStore()` or `dynamic = 'force-dynamic'` must be set on server components to prevent accidental caching of private data.
- No ISR or SSG for user content routes.
- The `/login` page is fully static (no server data fetch needed).

### Operation Queue (`useQueue`)
- A custom React hook manages a queue of create/update/delete operations.
- **Create operations**: parallelised (max 3 concurrent) to avoid rate-limiting.
- **Update and delete operations**: serialised (one at a time) to prevent ordering conflicts.
- Each queued operation carries an optional `onRollback` callback invoked on failure.
- The queue exposes `isSyncing: boolean` for UI indicators.

---

## 4. Data and Persistence Architecture

### MongoDB Connection
- Mongoose is used as the ODM (Object Document Mapper).
- A singleton connection module (`lib/db.js`) manages a single connection pool across serverless function invocations using a cached global variable to avoid exhausting connections on hot-reload or many simultaneous requests.
- Connection string stored in `MONGODB_URI` environment variable.
- Database name: `volvox` (or as configured in the URI).

### Mongoose Schemas

**User schema** (`lib/models/User.js`):
```
{
  email:          { type: String, required, unique, lowercase, trim }
  passwordHash:   { type: String, required }
  usernameTitle:  { type: String, required, trim, maxlength: 100 }
  usernameTag:    { type: String, required, unique, lowercase, trim, maxlength: 50 }
  pageCount:      { type: Number, default: 0 }
  dashboard: {
    infoText:     { type: String, default: '' }
    dashHex:      { type: String, default: '#2d3e50' }
    backHex:      { type: String, default: '#e5e7eb' }
  }
  createdAt:      { type: Date, default: Date.now }
}
```
Indexes: `email` (unique), `usernameTag` (unique).

**Page schema** (`lib/models/Page.js`):
```
{
  userId:         { type: ObjectId, ref: 'User', required }
  usernameTag:    { type: String, required }   // denormalised
  slug:           { type: String, required }
  title:          { type: String, required, maxlength: 200 }
  description:    { type: String, maxlength: 500 }
  thumbnail:      { type: String }             // R2 URL
  blurDataURL:    { type: String }             // base64
  isPrivate:      { type: Boolean, default: false }
  order_index:    { type: Number, required }
  postCount:      { type: Number, default: 0 }
  pageMetaData: {
    infoText1:    { type: String, default: '' }
    infoText2:    { type: String, default: '' }
  }
  createdAt:      { type: Date, default: Date.now }
}
```
Indexes: compound `{ userId, slug }` (unique), `{ userId, order_index }`.

**Post schema** (`lib/models/Post.js`):
```
{
  pageId:         { type: ObjectId, ref: 'Page', required }
  slug:           { type: String, required }
  title:          { type: String, maxlength: 200 }
  description:    { type: String }             // HTML
  content:        { type: String }             // URL or R2 URL
  content_type:   { type: String, enum: ['photo', 'file', 'url', 'text'], required }
  thumbnail:      { type: String }             // R2 URL
  blurDataURL:    { type: String }             // base64
  order_index:    { type: Number, required }
  createdAt:      { type: Date, default: Date.now }
}
```
Indexes: compound `{ pageId, slug }` (unique), `{ pageId, order_index }`.

### Atomic Counter Updates
- `pageCount` on User: use `findByIdAndUpdate` with `$inc: { pageCount: 1 }` on create and `$inc: { pageCount: -1 }` on delete.
- `postCount` on Page: same pattern.
- Reconciliation functions query child counts and correct the parent counter.

### Cascading Deletes
- Deleting a Page: (1) query all child Posts, (2) collect all R2 file URLs from `content` and `thumbnail` fields, (3) delete all R2 files, (4) delete all Post documents, (5) delete the Page document, (6) decrement `pageCount` on User.
- Deleting a Post: (1) collect R2 file URLs, (2) delete R2 files, (3) delete Post document, (4) decrement `postCount` on Page.
- These operations are not wrapped in a MongoDB transaction; partial failure is handled by logging and surface-level error messages to the user. A reconciliation function can fix count inconsistencies.

---

## 5. Authentication and Authorization Architecture

### Auth.js Configuration (`lib/auth.js`)

**Session strategy:** JWT (not database sessions). No session table in MongoDB.

**Providers:**
1. **Credentials provider** — accepts `email` + `password`. Validates against `passwordHash` in MongoDB using bcrypt. Returns user object on success.
2. **Email provider** — Auth.js built-in magic link provider. Uses Resend as the `sendVerificationRequest` transport. Generates a single-use token, stores it temporarily (using a lightweight adapter or custom token table in MongoDB), sends email, validates on callback.

**JWT callbacks:**
- `jwt` callback: on sign-in, embed `userId`, `usernameTag`, and `usernameTitle` into the JWT payload.
- `session` callback: expose `userId`, `usernameTag`, and `usernameTitle` on the session object for client use.

**Auth.js adapter:** A Mongoose adapter is required for the Email provider to store verification tokens. Use the official `@auth/mongodb-adapter` or a minimal custom adapter.

**Password hashing:** bcrypt with cost factor 12. Hashing occurs server-side in the signup route handler before the User document is created.

**Password reset flow:**
1. User submits email on reset form → custom API route generates a secure random token, stores `{ email, token, expiresAt }` in a `PasswordResetToken` collection, sends Resend email with link containing the token.
2. User clicks link → reset form shown. On submit, token is validated (existence, expiry, single-use), password is re-hashed, User document updated, token deleted.

### Authorization Checks
- **Server components**: Check `auth()` session from Auth.js. If the session `usernameTag` matches the route `usernameTag`, render edit controls; otherwise render read-only.
- **API route handlers**: Call `auth()` at the top of every mutation handler. Verify the session user owns the resource before executing any change.
- **Client components**: Mirror server-side ownership checks for UI rendering only. Never rely on client-side checks as the sole authorisation gate.

---

## 6. External Service Integration Architecture

### Cloudflare R2

**Purpose:** Persistent object storage for all user-uploaded files (images, PDFs, HTML, other files) and page/post thumbnails.

**Upload flow:**
1. Client requests a presigned PUT URL from `/api/storage/upload` (or batch variant).
2. Server generates presigned URL using `@aws-sdk/s3-request-presigner` pointed at the R2 S3-compatible endpoint.
3. Client uploads the file directly to R2 using the presigned URL (bypasses the Next.js server).
4. Client stores the `publicUrl` returned by the presign endpoint in the post/page document.

**File naming:** `{folder}/{timestamp}-{sanitised-filename}` where `folder` is e.g. `users/{userId}/pages/{pageId}/posts`.

**File deletion:** Via `/api/storage/delete`, which extracts the object key from the public URL and sends a `DeleteObjectCommand`.

**Cache-Control:** Uploaded files served with `public, max-age=7200` (2 hours). No complex CDN transforms.

**Public URL domain:** `https://files.volvox.works` (Cloudflare custom domain pointing at R2 bucket).

### Resend

**Purpose:** Transactional email for magic links and password reset.

**Integration:** Called server-side only from Auth.js `sendVerificationRequest` callback and the password reset API route. Uses the Resend Node SDK. API key stored in `RESEND_API_KEY` environment variable.

**Email templates:** Plain HTML emails. Magic link email contains a single call-to-action button/link. Password reset email contains a reset link.

### next/image with Cloudflare R2

**Custom loader** (`lib/cloudflareLoader.js`): returns the R2 public URL directly (no CDN width/quality parameters in the rebuilt version). Images are served as-is from R2.

**Blur placeholder:** Stored as a base64 data URL in the database and passed to `next/image` as `blurDataURL`. This approach avoids a runtime CDN blur request.

---

## 7. Build and Runtime Dependencies

### Production Dependencies

| Package | Purpose |
|---------|---------|
| `next` | Framework |
| `react`, `react-dom` | UI library |
| `next-auth` (Auth.js v5) | Authentication |
| `@auth/mongodb-adapter` | Auth.js adapter for token storage |
| `mongoose` | MongoDB ODM |
| `bcryptjs` | Password hashing (browser-safe alternative to `bcrypt`) |
| `resend` | Email delivery SDK |
| `@aws-sdk/client-s3` | R2 file operations |
| `@aws-sdk/s3-request-presigner` | Presigned URL generation |
| `react-quill-new` | Rich text editor |
| `lucide-react` | Icon library |
| `date-fns` | Date formatting |
| `heic2any` | HEIC image conversion (client-side) |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `tailwindcss` | CSS framework |
| `postcss` | CSS processing |
| `@tailwindcss/typography` | Prose styling for rich text output |
| `eslint`, `eslint-config-next` | Linting |

### Removed Dependencies (vs. current codebase)
- `firebase` — replaced by MongoDB + Auth.js
- `dotenv` — no longer needed (Next.js handles `.env.local` natively)
- `d3-random` — no use case in the rebuild; remove

---

## 8. Environment Configuration Contract

All secrets and configuration must be defined in `.env.local` (local) and equivalent production environment variables. **No secret may use the `NEXT_PUBLIC_` prefix.**

| Variable | Required | Purpose |
|----------|----------|---------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string (includes credentials) |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret (min 32 random bytes) |
| `NEXTAUTH_URL` | Yes | Canonical URL of the app (e.g. `https://volvox.works`) |
| `RESEND_API_KEY` | Yes | Resend transactional email API key |
| `RESEND_FROM_EMAIL` | Yes | Sender address (e.g. `no-reply@volvox.works`) |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `R2_BUCKET_NAME` | Yes | R2 bucket name (e.g. `volvox-works`) |
| `NEXT_PUBLIC_R2_DOMAIN` | Yes | Public URL base for R2 files (e.g. `https://files.volvox.works`) — safe to expose as it is just the CDN hostname |

---

## 9. Testing and Quality Strategy

### Linting
- ESLint with `eslint-config-next` enforces Next.js-specific rules and common JS best practices.
- Run as part of CI pre-merge check.

### Manual Test Coverage Areas
Given the absence of an automated test suite specification, the following areas must be manually verified before each release:

1. **Auth flows**: registration, password login, magic link login, password reset.
2. **Visibility rules**: private pages hidden from visitors; public pages visible without login.
3. **CRUD operations**: create/edit/delete page and post; confirm DB document and R2 file state.
4. **Optimistic UI**: create a post and confirm the card appears without flicker during upload.
5. **Image compression**: upload an image >2400px; confirm compressed dimensions on R2.
6. **HEIC upload**: upload a HEIC file; confirm it is converted and the blur placeholder is generated.
7. **Bulk upload**: upload 5+ images; confirm each becomes a separate post.
8. **Reorder**: reorder pages and posts; confirm order persists on reload.
9. **Colour theming**: change header/background colour; confirm persistence on reload.
10. **100 MB limit**: attempt to upload a file exceeding 100 MB; confirm rejection before presign.

### Future Testing Recommendation
- Unit tests for `lib/data.js` functions using an in-memory MongoDB instance (e.g. `mongodb-memory-server`).
- Integration tests for API routes using `supertest` or Next.js test utilities.

---

## 10. Requirement Traceability

| REQ-ID | Architecture Decision |
|--------|----------------------|
| REQ-F-001 | Section 5 — Credentials provider with bcryptjs |
| REQ-F-002 | Section 5 — Email provider with Resend |
| REQ-F-003 | Section 5 — Credentials provider password validation |
| REQ-F-004 | Section 5 — Custom password reset flow; PasswordResetToken collection |
| REQ-F-005 | Section 3 — `/login` is a static client page |
| REQ-F-006 | Section 4 — User schema `usernameTag` with unique index |
| REQ-F-007 | Section 5 — JWT strategy in Auth.js config |
| REQ-F-008 | Section 2 — `/:usernameTag` server component; public route |
| REQ-F-009, F-010 | Section 4 — Page schema `isPrivate`; server component visibility check |
| REQ-F-011 | Section 5 — Session-based ownership check in server components and API routes |
| REQ-F-012–F-020 | Section 2 — `DashboardViewClient`, `DashHeader` components |
| REQ-F-021–F-030 | Section 2 — `PageViewClient`, page-level components |
| REQ-F-031 | Section 2 — `PhotoShowModal` |
| REQ-F-032 | Section 2 — `PostFileModal` |
| REQ-F-033 | Section 2 — URL post click handler (no modal) |
| REQ-F-034, F-035 | Section 6 — `processImage.js` client-side pipeline; `heic2any` dependency |
| REQ-F-036, F-038 | Section 6 — R2 presigned URL flow; `@aws-sdk` dependencies |
| REQ-F-037 | Section 4 — `blurDataURL` field on Post and Page schemas |
| REQ-NF-001 | Section 6 — base64 blur stored in DB; passed to `next/image` `blurDataURL` prop |
| REQ-NF-002 | Section 6 — 100 MB check in `/api/storage/upload` request body validation |
| REQ-NF-003 | Section 3 — `useQueue` hook with optimistic state and rollback |
| REQ-NF-004 | Section 6 — `processImage.js` resize to 2400 px max |
| REQ-NF-005 | Section 3 — No `router.refresh()` calls; no scroll manipulation code |
| REQ-NF-006 | Section 2 — Semantic HTML (`button`, `dialog`, `nav`) in all components |
| REQ-NF-007 | Section 5 — `auth()` check at top of every mutation API handler |
| REQ-NF-008 | Section 4 — MongoDB Atlas; Mongoose singleton connection pool |

---

## 11. Assumptions

| ID | Assumption | Confidence |
|----|-----------|-----------|
| A-01 | Auth.js v5 (beta) is used; its API differs from v4. The `auth()` helper for server components is available and stable. | High |
| A-02 | **Resolved:** No adapter is used. A minimal custom `VerificationToken` MongoDB collection handles magic link tokens. User creation is fully manual via a custom signup API route. | High |
| A-03 | `bcryptjs` is used instead of `bcrypt` to avoid native module compilation issues in serverless environments. | High |
| A-04 | Mongoose connection pooling in a serverless context uses a module-level cached connection (`global._mongooseConnection`) to prevent connection exhaustion across Lambda/edge invocations. | High |
| A-05 | The R2 bucket is configured with a Cloudflare custom domain (`files.volvox.works`) for public file serving. The bucket itself is not publicly listed. | High |
| A-06 | No video or audio file types are supported; R2 upload and display logic is not designed for streaming media. | High |
| A-07 | **Resolved:** `sanitize-html` is used for server-side rich text sanitisation. | High |
| A-08 | **Resolved:** React Compiler is enabled (`reactCompiler: true` in `next.config.mjs`). | High |

---

## 12. Open Questions

| ID | Question |
|----|---------|
| OQ-01 | ~~Deployment target~~ **Resolved:** Next.js app deploys to Vercel (standard Node.js runtime). Cloudflare is used only for R2 file storage and the `files.volvox.works` CDN domain. No Cloudflare Workers or Cloudflare Pages. |
| OQ-02 | **Resolved:** `PasswordResetToken` stored in its own MongoDB collection (custom flow, no adapter). |
| OQ-03 | **Resolved:** React Compiler enabled. |
| OQ-04 | **Resolved:** `@tailwindcss/typography` prose styles apply to rich-text Quill output. |
| OQ-05 | **Resolved:** Green-field rebuild — no existing data to preserve. |

---

## Clarification Log

### Batch 1 — 2026-03-08

**Q: Auth.js adapter scope — use full `@auth/mongodb-adapter` or custom VerificationToken?**
Decision: No adapter. Custom `VerificationToken` collection for magic links. All user creation is manual via a custom signup API route. Signup requires password.

**Q: Rich text sanitisation package?**
Decision: `sanitize-html`.

**Q: React Compiler — enable or disable?**
Decision: Enabled (`reactCompiler: true` in `next.config.mjs`).

**Q: Green-field build confirmation?**
Decision: Confirmed. No existing R2 files or MongoDB documents to preserve.

**Q: Info sections empty state?**
Decision: Info sections are hidden from visitors when empty. Shown only to the owner in edit mode.
