# Volvox Works — Improvement Reference

This is the **what and why** document. It describes every improvement in full, with
the current behaviour, the target behaviour, the files involved, and how to tell
when it is done.

It is a reference, not a running order. The running order is in `STAGES.md`, which
refers to the IDs below. Read this file when you need to understand *why* a change
matters or *what* the finished state should look like. Read `STAGES.md` when you
need to know what to do next.

---

## Contents

- [Context: what already happened](#context-what-already-happened)
- [Guiding intent](#guiding-intent)
- [SEC — Security and access control](#sec--security-and-access-control)
- [REL — Reliability](#rel--reliability)
- [FND — Shared foundations](#fnd--shared-foundations)
- [PERF — Performance and cost](#perf--performance-and-cost)
- [UPL — Upload experience](#upl--upload-experience)
- [MOT — Motion and transitions](#mot--motion-and-transitions)
- [TCH — Touch and mobile parity](#tch--touch-and-mobile-parity)
- [LNK — Links, metadata and discoverability](#lnk--links-metadata-and-discoverability)
- [CLN — Cleanup and test coverage](#cln--cleanup-and-test-coverage)
- [Deliberately out of scope](#deliberately-out-of-scope)

---

## Context: what already happened

**A page-ordering bug was found and fixed before this plan was written. Do not redo
it, and do not "improve" the ordering code without reading this section first.**

Four pages on one account all had `order_index: 1`. The old `swapPageOrder`
reordered by exchanging two `order_index` values, so swapping 1 with 1 wrote 1 and
1 — a database no-op — while the client reordered its local array and appeared to
work. The card moved, then snapped back on the next refresh.

Fixing that surfaced two further bugs, both now fixed:

1. Applying each server response to local state made a multi-place move stagger
   backwards, because an early response describes the server's state *at that point
   in the burst* while local state already reflects later clicks.
2. Reading `pages` from render scope meant rapid clicks could compute the *same*
   relative swap twice, and applying an identical swap twice cancels it out — the
   UI advanced while the database silently did not.

The resulting design, which the rest of this plan assumes:

- **Ordering writes are absolute, not relative.** `movePageToIndex(pageId, toIndex)`
  and `movePostToIndex(postId, toIndex)` in `lib/data.js` read the whole sibling
  set, rearrange it as an array, and rewrite `order_index` as `1..n`. This is
  idempotent — replaying a request is harmless — and self-healing against any
  existing drift.
- **Reads and writes share one deterministic sort**, `SIBLING_SORT = { order_index: 1, _id: 1 }`,
  so client and server never disagree on position even when indexes tie.
- **The client uses `flushSync`** around the local reorder so a rapid second click
  reads the first one's result, and a sequence guard so only the newest server
  response is adopted.
- **`scripts/normalize-order.mjs`** repairs `order_index` drift and count drift. It
  is dry-run by default and takes `--commit` to apply. It has been run; the data is
  currently clean.
- **`lib/ordering.test.mjs`** covers the pure logic, including the exact regression.
  Run with `node --test lib/ordering.test.mjs`.

Two consequences to carry forward:

- **Do not add a unique index on `{ userId, order_index }`.** It looks like the
  right guard, but the renumbering write passes through intermediate states where
  two documents briefly share an index, so a unique constraint would make
  legitimate reorders fail.
- A four-place move currently makes four serial requests. Correct, but chatty.
  Coalescing is listed as [MOT-5](#mot-5--coalesce-reorder-bursts-into-one-request).

---

## Guiding intent

Three words, in priority order when they conflict:

1. **Reliable** — the app never silently loses or reverts a user's work.
2. **Smooth** — state changes are explained and animated, not abrupt.
3. **Fast** — measured in bytes and perceived latency, not benchmarks.

Two standing rules that apply to every item below:

- **Never fail silently.** If an operation fails, the user is told what failed and
  what happens next. A silent rollback is worse than an error message, because it
  looks like data loss.
- **Prefer the change that removes a class of bug over the change that fixes one
  instance.** The ordering fix above is the model: absolute placement removed the
  entire category, rather than patching the one path that broke.

---

## SEC — Security and access control

### SEC-1 — Stop shipping password hashes to the browser

**Severity: critical.**

`getUserByUsernameTag` returns the entire Mongo user document. Both public routes
pass it to a client component:

```js
// app/[usernameTag]/page.js
const serialisedUser = JSON.parse(JSON.stringify(user));
<DashboardViewClient user={serialisedUser} initialPages={serialisedPages} />
```

Next.js serialises client-component props into the RSC payload embedded in the page
HTML. So `passwordHash`, `email` and `firebaseUid` are readable in view-source on
**every public profile and page**, by anyone.

Verify the problem before fixing: load any profile, view source, search for
`passwordHash`.

**Target.** Build an explicit public-user object in the route and pass only that.
The components read `usernameTag`, `usernameTitle`, `email` and
`dashboard.infoText`. Include `email` only when `isOwner` is true — it is shown
only to the owner in the UI, so it should not be in the payload for anyone else.

**Files.** `app/[usernameTag]/page.js`, `app/[usernameTag]/[pageSlug]/page.js`,
`lib/data.js` (`getUserByUsernameTag`).

**Done when.** View-source on a logged-out profile contains no `passwordHash`, no
`firebaseUid`, and no email address. The dashboard and page still render correctly
for both the owner and an anonymous visitor.

---

### SEC-2 — Ownership check on file deletion

**Severity: critical.**

`app/api/storage/delete/route.js` verifies a session exists, then calls
`deleteR2File(fileUrl)` on whatever URL it is given. It never checks that the file
belongs to the caller. Every image URL on the site is public, so one authenticated
user can enumerate another user's pages and delete their images.

**Target.** Before deleting, resolve the URL to a `Post` or `Page` owned by
`session.user.userId`. Refuse with 403 otherwise. Match on `content` or `thumbnail`.

**Files.** `app/api/storage/delete/route.js`, possibly a helper in `lib/data.js`.

**Done when.** A second account cannot delete a file belonging to the first. Verify
by signing in as one user and posting another user's image URL to the endpoint —
expect 403 and the file to survive.

---

### SEC-3 — Lock down blur generation

**Severity: critical.**

`app/api/generate-blur/route.js` is unauthenticated. Its comment claims it is
"called server-side only", but it is a public route handler and the client calls it
directly from `fetchServerBlur`. After five CDN attempts fail it runs a raw
`fetch(imageUrl)` on the caller-supplied URL and returns the body base64-encoded —
a read primitive against anything the server can reach that the internet cannot.

It also sleeps `1+2+3+4` seconds across retries, so each unauthenticated request
holds a function open for roughly ten seconds.

**Target.** Require a session. Validate that the URL's origin equals
`NEXT_PUBLIC_R2_DOMAIN` before *either* fetch. Remove the raw fallback, or point it
at the same origin-checked URL. Reduce the retry budget — the CDN propagation delay
this guards against is real but does not need ten seconds.

**Files.** `app/api/generate-blur/route.js`, `lib/processImage.js` (`fetchServerBlur`).

**Done when.** An unauthenticated request returns 401. An authenticated request with
an off-origin URL returns 400. HEIC upload still produces a blur placeholder.

---

### SEC-4 — Derive upload paths server-side

The presign routes sanitise the filename but put the client-supplied `folder`
straight into the object key:

```js
const key = `${folder}/${Date.now()}-${sanitisedFilename}`;
```

Any authenticated user can therefore write into any prefix in the bucket, including
another user's page folder. There is also no allowlist on `contentType`.

**Target.** Take a `pageId` (or nothing, for page thumbnails) from the client,
verify ownership server-side, and construct the key from the authenticated user and
the verified page. Allowlist `contentType` to the types actually served.

**Files.** `app/api/storage/upload/route.js`, `app/api/storage/upload-batch/route.js`,
and the five call sites in the modals.

**Done when.** The client can no longer influence the key prefix. Uploads still work
from every modal: page create, page edit, post create, post edit, bulk.

---

### SEC-5 — Lock `/admin` to the owner

`app/admin/page.js` is unauthenticated and indexable. It lists every account with
page and post counts and links to each dashboard.

**Decision taken: this should not be public.**

**Target.** Add an ownership check. There is no role system, so gate on a specific
identity — an `ADMIN_USER_IDS` or `ADMIN_EMAILS` environment variable is the
simplest approach that does not require a schema change. Non-matching visitors get
`notFound()` rather than a 403, so the route's existence is not advertised.

**Files.** `app/admin/page.js`, `.env.local` (document the new variable in the
plan's progress notes; do not commit secrets).

**Done when.** Logged out, `/admin` 404s. Signed in as a non-admin, it 404s. Signed
in as the configured admin, it renders as before.

---

### SEC-6 — Reserved usernames

`uniqueUsernameTag` in `lib/data.js` slugifies a display name into `usernameTag`,
which becomes the top-level route segment. Someone signing up as "Admin" or "Login"
gets a tag that collides with a static route. The static route wins, so their
profile is permanently unreachable and they are given no explanation.

**Target.** Reserve a list — at minimum `admin`, `login`, `api`, `_next`,
`favicon.ico`, `robots.txt`, `sitemap.xml` — and append a numeric suffix as the
function already does for collisions.

**Files.** `lib/data.js`.

**Done when.** Signing up as "Admin" produces a working profile at a
non-conflicting tag. A unit test covers the reserved list.

---

### SEC-7 — Password policy and a single hashing cost

Signup accepts a one-character password; there is no length check on the client or
the server. Signup hashes at 10 rounds (`app/api/auth/signup/route.js`) while reset
hashes at 12 (`app/api/auth/reset-password/route.js`), so a user's security silently
changes depending on which path they last used.

**Target.** Enforce a minimum length server-side in both handlers, with a matching
client-side hint so the failure is not a surprise. Pull the cost factor into one
shared constant.

**Files.** `app/api/auth/signup/route.js`, `app/api/auth/reset-password/route.js`,
`app/login/page.js`, `lib/auth.js`.

**Done when.** A short password is rejected with a clear message on both paths, and
one constant governs the hashing cost.

---

### SEC-8 — Rate limit the auth endpoints

Nothing throttles magic-link, password-reset, signup or credential login. Anyone can
post someone else's address in a loop and send them unlimited email through your
Resend account — a direct bill and a fast route to a damaged sending reputation.

**Decision taken: implement with a Mongo collection and a TTL index**, reusing the
pattern already established by `VerificationToken`. No new infrastructure.

**Target.** A small `RateLimit` model keyed by action plus identifier (email and IP
separately), with a TTL index for automatic expiry. Suggested budget: 3 emails per
address per 15 minutes, 10 login attempts per IP per 15 minutes. Return 429 with a
message the UI can display, not a silent failure.

**Files.** new `lib/models/RateLimit.js`, new `lib/rateLimit.js`, the four auth
routes, `app/login/page.js` for the 429 message.

**Done when.** The fourth reset request for the same address inside the window
returns 429 and sends no email. Normal use is unaffected.

---

### SEC-9 — Validate URL-post schemes

`updatePost` and `createPost` let `content` through unchecked, and it lands in an
`href` in the lightbox. React blocks `javascript:` URLs at render, so this is not
currently exploitable, but relying on a framework guard for input validation is a
thin margin.

**Target.** Parse and require `http:` or `https:` in the posts routes, where the
description is already sanitised.

**Files.** `app/api/posts/route.js`, `app/api/posts/[postId]/route.js`.

**Done when.** A post with a `javascript:` or `data:` content URL is rejected with
400. Normal links still work.

---

### SEC-10 — Security headers

No CSP, `X-Frame-Options`, `Referrer-Policy` or `X-Content-Type-Options`, and
`poweredByHeader` is left on. The app renders user-supplied HTML through
`dangerouslySetInnerHTML` in four places, so a CSP is worth having as a second line
behind sanitisation.

**Target.** A `headers()` block in `next.config.mjs`. Start with `frame-ancestors`,
`Referrer-Policy: strict-origin-when-cross-origin` and `nosniff`, plus
`poweredByHeader: false`. Add a CSP only after checking it against the Quill
editor's inline styles and the `blurDataURL` `data:` URIs — both will need explicit
allowances.

**Files.** `next.config.mjs`.

**Done when.** Headers are present in the response. The rich text editor still works
and blur placeholders still render — verify both before considering CSP done.

---

## REL — Reliability

### REL-1 — Clear the cached connection promise on failure

**Severity: critical.**

`lib/db.js` caches the connection *promise* and only ever checks whether it exists:

```js
if (!cached.promise) { cached.promise = mongoose.connect(...).then(m => m); }
cached.conn = await cached.promise;
```

If that connect rejects — a transient blip, an Atlas failover, a cold start racing a
paused cluster — the rejected promise stays cached and every subsequent request
awaits the same rejection. The instance never recovers without a redeploy.

This is not theoretical: a `next build` during this plan's preparation failed with
`Failed to collect page data for /api/pages/[pageId]/meta` and succeeded on retry,
which is exactly this failure mode.

**Target.** On rejection, null out `cached.promise` before rethrowing so the next
request retries. Add `serverSelectionTimeoutMS` and `maxPoolSize` appropriate to
serverless while you are there.

**Files.** `lib/db.js`.

**Done when.** Forcing a connection failure (temporarily point `MONGODB_URI` at an
unreachable host, make a request, restore it) recovers on the next request without
restarting the process.

---

### REL-2 — Make failed mutations visible

**Severity: critical. This is the single most important change in the plan.**

Every queued create, update and delete that throws is handled with `console.error`
plus a silent state rollback (`lib/useQueue.js`). The user sees their new post
appear and then vanish, with no message. For an app whose job is holding someone's
work, silently reverting an edit is the worst available failure mode — it is
indistinguishable from data loss.

**Target.** A toast surface and an error channel through the queue.

- A `ToastProvider` context with a fixed-position stack, rendered from
  `app/layout.js` or each view client. Support at minimum `error` and `info`, an
  auto-dismiss timer, and manual dismissal.
- `useQueue` gains an `onError(error, op)` callback alongside `onQueueIdle`.
- Every `enqueue` call site passes a human-readable description of what failed
  ("Couldn't save your new page"), not the raw error.
- Toasts must be accessible: `role="status"` for info, `role="alert"` for errors,
  and they must not trap focus.

This provider is a dependency of [UPL-1](#upl-1--real-upload-progress) and
[UPL-2](#upl-2--retry-failed-uploads). Build it first.

**Files.** new `context/ToastContext.js`, `lib/useQueue.js`,
`components/dashboard/DashboardViewClient.js`, `components/page/PageViewClient.js`,
`app/layout.js`.

**Done when.** Killing the network mid-save produces a visible, accurate message and
a correct rollback. No mutation path anywhere reverts state without saying why.

---

### REL-3 — Error boundaries

There are `loading.js` files and a `not-found.js`, but nothing catches a thrown
server component. If Mongo is unreachable, a visitor gets Next's raw error screen.

**Target.** `app/error.js` and `app/[usernameTag]/error.js`, each with a working
retry that calls `reset()`. Match the app's visual language rather than using a bare
default.

**Files.** new `app/error.js`, new `app/[usernameTag]/error.js`.

**Done when.** Forcing a server component to throw shows the custom boundary, and
the retry button recovers once the underlying problem is resolved.

---

### REL-4 — Fix bulk upload preview revocation

`components/page/BulkUploadModal.js`:

```js
useEffect(() => () => {
  files.forEach((item) => URL.revokeObjectURL(item.preview));
}, [files]);
```

The cleanup depends on `files`, so it runs on *every* change to that array —
revoking the object URLs of the previous array, which still contains most of the
items in the new one. Add a second batch of images and the first batch's thumbnails
go blank.

Related: the `useState` initialiser and the `[initialFiles]` effect both call
`makeUploadItem` on mount, so the first set of object URLs is created and
immediately orphaned.

**Target.** Revoke per item at the point of removal — `removeFile` already does this
correctly — plus once on unmount, reading from a ref so the effect can have an empty
dependency array.

**Files.** `components/page/BulkUploadModal.js`.

**Done when.** Selecting images, then adding more, leaves every thumbnail visible.

---

### REL-5 — Batch R2 deletes on page cascade

`deletePage` in `lib/data.js` loops over every child post and awaits an individual
R2 delete per URL before it touches the database. A page with 200 photos is 200
sequential round trips to Cloudflare. On a serverless function that exceeds the
execution limit, leaving the page deleted and the files orphaned, or the whole
operation half-done.

**Target.** Collect the keys and use `DeleteObjectsCommand`, which accepts up to
1,000 per call. Delete the database rows *first* so the user's view is correct
immediately, and treat storage cleanup as best-effort — an orphaned file is a much
smaller problem than a half-deleted page.

**Files.** `lib/data.js` (`deletePage`, `deletePost`), `lib/r2.js`.

**Done when.** Deleting a page with many posts completes promptly and removes both
the records and the files. Test on a page you create for the purpose, not real data.

---

### REL-6 — Wire up counter reconciliation

`reconcilePageCount` and `reconcilePostCount` exist in `lib/data.js` and **nothing
calls either one**. Meanwhile `createPage` increments `user.pageCount` before the
insert and decrements it in a catch, and derives `order_index` from
`max(lastPage.order_index + 1, pageCount)` — so a drifted counter feeds directly
back into ordering.

`scripts/normalize-order.mjs` already repairs both counters and can be re-run at any
time.

**Target.** Call the reconcile functions on the create-failure path, or stop
treating the stored counts as authoritative and derive them with `countDocuments`
where correctness matters. Prefer the latter — it removes the class of bug.

**Files.** `lib/data.js`.

**Done when.** `node scripts/normalize-order.mjs` reports zero corrections after a
sequence of creates, deletes and a forced create failure.

---

## FND — Shared foundations

These are extractions. They change no behaviour, and they are scheduled **before**
the phases that would otherwise edit the same code five times over.

### FND-1 — `lib/sanitize.js`

`SANITIZE_OPTIONS` is declared verbatim in seven places: four route handlers
(`api/posts`, `api/posts/[postId]`, `api/pages/[pageId]/meta`, `api/user/dashboard`)
and three components (`PageInfoEditor`, `DashboardInfoEditor`, `PostFileModal`).

**Target.** One exported constant, plus a `sanitizeRichText(value)` helper. Note that
`allowedAttributes` permits `target` on anchors without forcing `rel="noopener"` —
fix that while consolidating.

**Done when.** One definition exists. Rich text still renders identically in the
lightbox, both info editors, and the page metadata fields.

---

### FND-2 — `lib/colour.js`

`normalizeHex`, `hexToRgb`, `hexToRgba`, `mixHex`, `getLuminance` and
`getInfoPalette` are duplicated between `PageInfoEditor` and `DashboardInfoEditor`,
with partial copies in `DashHeader` and both `loading.js` files — roughly 250 lines
of exact duplication.

**Target.** One module. This is a prerequisite for [LNK-4](#lnk-4--contrast-guard-on-the-theme-picker),
which needs the luminance logic outside the info editors.

**Done when.** One definition exists and the info editor palettes, header colours and
loading skeletons are visually unchanged.

---

### FND-3 — One slug function

Four copies of the same algorithm: `toBaseSlug` in `lib/data.js`, and
`toSlugPreview` in `CreatePageModal`, `EditPageModal` and (inline) `TitleEdit`.

This is the duplication with real teeth: if the copies drift, the slug preview shown
to the user stops matching the URL they actually get.

**Target.** Export `toBaseSlug` for client use and delete the copies. Add it to
`lib/ordering.test.mjs` or a new `lib/slug.test.mjs`.

**Done when.** One definition exists, and the preview in both page modals and the
title editor matches the slug the server assigns for a range of inputs including
punctuation, non-Latin characters and very long titles.

---

### FND-4 — One modal shell

Five modals repeat the same structure: body-scroll lock with scrollbar-width
compensation, Escape handler, fixed backdrop, panel. None carries `role="dialog"` or
`aria-modal`. None traps focus, so tabbing walks straight out into the page behind.
None restores focus to the trigger on close. Backdrop-click-to-close works only in
`PostFileModal`, which is dead code.

**Target.** A `<Modal>` component owning the shell, the scroll lock, focus trapping,
focus restore, Escape and backdrop click. The five modals become content only.

This must land **before** [MOT-2](#mot-2--modal-transitions), so the transition is
written once.

**Files.** new `components/Modal.js`, `CreatePostModal`, `EditPostModal`,
`CreatePageModal`, `EditPageModal`, `BulkUploadModal`, `PhotoShowModal`.

**Done when.** All modals are keyboard-navigable, trap focus, restore it on close,
close on Escape and backdrop click, and are announced correctly by a screen reader.
No visual regression.

---

## PERF — Performance and cost

### PERF-1 — Image width buckets

**The largest single win in the plan.**

`lib/cloudflareLoader.js` deliberately ignores the `width` argument so that
`PostCard` and `PhotoShowModal` produce identical URLs and the lightbox opens from
cache. The cost is that every card in the grid downloads the full 1920px original.
`next/image` still emits a `srcset` from the `sizes` prop, but every entry resolves
to the same URL, so the browser has no smaller option. A four-column grid of 20
pages is several megabytes where a few hundred kilobytes would do.

**Decision taken: two fixed width buckets** — `640` for grid cards, `1600` for the
lightbox. Fixed buckets rather than a full responsive `srcset` because Cloudflare
bills per unique image transform, and two variants per image is predictable.

**Target.** The loader honours a bucket parameter. Cards request 640; the lightbox
requests 1600. To preserve the instant-open feel, the lightbox renders the cached
640 first and fades the 1600 in over it — `PhotoShowModal` already layers
`blurDataURL` under the full image, so this is an extension of an existing pattern
rather than a new one.

**Files.** `lib/cloudflareLoader.js`, `components/ImageWithLoader.js`,
`components/page/PostCard.js`, `components/dashboard/PageCard.js`,
`components/page/PhotoShowModal.js`.

**Done when.** A dashboard's image transfer drops by roughly an order of magnitude,
measured in the network panel on a mobile viewport. The lightbox still opens without
a visible blank frame.

---

### PERF-2 — Priority on the first row

`ImageWithLoader` accepts `priority` and defaults it to false. Neither `PostCard`
nor `PageCard` ever passes it, so the largest above-the-fold image is lazy-loaded.

**Target.** Pass `priority={idx < 4}` from both grid loops.

**Done when.** The first row of images carries `fetchpriority="high"` and is not
lazy-loaded.

---

### PERF-3 — Gate the theme poll

`context/ThemeContext.js` polls `/api/theme/[usernameTag]` **every ten seconds**, for
owners and anonymous visitors alike, on every page, for the whole session. The
endpoint is unauthenticated and uncached, and calls `getUserByUsernameTag`, which
fetches the entire user document to read two hex strings. A visitor idling for an
hour costs 360 full document reads.

This machinery exists to propagate colour changes, which only the owner can make and
only while in edit mode.

Side effect worth knowing: because the network is never idle, Playwright's
`networkidle` wait never resolves against this app. Use explicit selector waits.

**Target.** Run the interval only when the viewer is the owner *and* in edit mode.
The existing `storage` event listener already handles cross-tab sync. Project just
the two colour fields in the endpoint and add a short `Cache-Control`.

**Files.** `context/ThemeContext.js`, `app/api/theme/[usernameTag]/route.js`,
`lib/data.js`.

**Done when.** An idle tab issues no periodic requests. Changing a colour still
propagates to a second tab.

---

### PERF-4 — Debounce the colour picker

`DashHeader` debounces colour persistence at 280ms, which during a native colour
picker drag means a continuous stream of PATCHes. Each one runs `updateUserColours`
and then `revalidateAllUserThemePaths`, which does a `Page.find` and calls
`revalidatePath` once per page the user owns.

**Target.** Keep local state on `input` for immediate feedback, but write on commit
— either the `change` event or a much longer debounce, around 800ms.

**Files.** `components/dashboard/DashHeader.js`.

**Done when.** Dragging the picker for five seconds produces one write, not twenty.

---

### PERF-5 — Take `sanitize-html` out of the client bundle

`PageInfoEditor` and `DashboardInfoEditor` statically import `sanitize-html` and run
it at render time. The same content was already sanitised server-side on write. It
is a substantial library in the critical path of every public page view for a second
pass that changes nothing. The page route is currently 217 kB first-load JS against
103 kB shared.

**Target.** Trust write-time sanitisation for display, as `PhotoShowModal` already
does. If belt-and-braces is wanted, sanitise in the server component and pass the
clean string down.

**Files.** `components/page/PageInfoEditor.js`,
`components/dashboard/DashboardInfoEditor.js`, and their server routes.

**Done when.** `sanitize-html` no longer appears in the client bundle, first-load JS
for `/[usernameTag]/[pageSlug]` is materially below 217 kB, and rich text renders
identically. Record the before and after numbers.

---

## UPL — Upload experience

### UPL-1 — Real upload progress

Uploads go to R2 through `fetch` with a `PUT`, which provides no progress events.
The UI shows an indeterminate "Uploading…" regardless of whether a file is 40 KB or
the permitted 100 MB. On a phone connection a large upload looks indistinguishable
from a hang, and the natural response is to close the modal and lose the work.

**Target.** Replace the `PUT` with `XMLHttpRequest`, which exposes
`upload.onprogress`, wrapped in a promise-returning helper so call sites stay `async`.
Show a real determinate bar per file, and an aggregate for bulk.

**Files.** new `lib/uploadFile.js`, `CreatePostModal`, `EditPostModal`,
`CreatePageModal`, `EditPageModal`, `BulkUploadModal`.

**Done when.** Uploading a large file shows a bar that advances smoothly to 100%.
Every existing upload path still works.

---

### UPL-2 — Retry failed uploads

A single failed `PUT` loses the whole post with no retry and, currently, no message.
Mobile connections drop routinely.

**Target.** Retry with exponential backoff — three attempts, roughly 1s/2s/4s — on
network errors and 5xx responses, but not on 4xx, which will not succeed on retry.
Presigned URLs last 15 minutes, so a retry inside that window can reuse the same
URL; beyond it, re-presign. Surface the final failure through the toast system from
[REL-2](#rel-2--make-failed-mutations-visible) with a retry affordance.

**Files.** `lib/uploadFile.js`, the five upload call sites.

**Done when.** Simulating a failed request (offline mode, or a blocked request rule)
results in a visible retry and eventual success, or a clear error the user can act on.

---

### UPL-3 — Parallel bulk upload

`BulkUploadModal.handleUpload` processes *and* uploads one image at a time:

```js
for (const item of batch) { ... await processImageForUpload(item.file) ... }
...
for (const { item, compressed } of processed) { ... await fetch(urlInfo.signedUrl, ...) ... }
```

Fifty images is fifty sequential client-side canvas operations followed by fifty
sequential uploads.

**Target.** A concurrency-limited pool — 3 to 4 in flight, matching
`MAX_CONCURRENT_CREATES` in `lib/useQueue.js`. Keep per-file progress accurate.
Image processing is main-thread canvas work, so parallelising it has limits; the
upload phase is where the real gain is.

**Files.** `components/page/BulkUploadModal.js`, `lib/uploadFile.js`.

**Done when.** A twenty-image bulk upload completes substantially faster than the
sequential version, with per-file status still correct and failures isolated to the
files that failed.

---

### UPL-4 — Preserve work when an upload fails

If any part of a create fails after files have already uploaded, the modal closes or
the state resets and the user re-selects everything.

**Target.** On failure, keep the modal open with its state intact and the already
uploaded files marked as done, so a retry does not redo completed work.

**Files.** the five upload call sites.

**Done when.** Failing the third of five bulk uploads and retrying only re-uploads
the failed file.

---

## MOT — Motion and transitions

All motion in this section must respect `prefers-reduced-motion: reduce` by
disabling or substantially shortening the animation. Add the media query once, in
`app/globals.css`, and honour it everywhere.

### MOT-1 — Animate the reorder reflow

Cards snap instantly to their new positions when reordered. The ordering logic is
now correct; this is the half that makes it *feel* correct. Watching a card glide to
its new position also confirms to the user that the move registered — which is
exactly the feedback that was missing when the ordering bug was live.

**Target.** Either a FLIP transition (measure, reorder, invert, play) or per-card
`view-transition-name` with `document.startViewTransition`. FLIP is more portable
and does not depend on browser support for view transitions. Keep it short, around
200ms, with an ease-out curve.

Note this interacts with `flushSync` in `moveByOffset` — the synchronous commit is
what makes a FLIP measurement straightforward, since the "after" geometry is
available immediately.

**Files.** `components/dashboard/DashboardViewClient.js`,
`components/page/PageViewClient.js`, possibly a new `lib/useFlipReorder.js`.

**Done when.** Moving a card several places animates smoothly each step, with no
flicker and no layout jump, and is instant under `prefers-reduced-motion`.

---

### MOT-2 — Modal transitions

Modals appear and disappear instantly. A short fade with a slight scale on the panel
reads as considered rather than abrupt.

Depends on [FND-4](#fnd-4--one-modal-shell) — implement in the shared shell so it is
written once.

**Target.** ~150ms fade on the backdrop, ~180ms fade and scale from 0.98 on the
panel. Exit animation must not delay the state update; use a transition on unmount
or accept an instant close if that proves fiddly.

**Done when.** All five modals open and close smoothly, with no flash of unstyled
content and no delay before the modal becomes interactive.

---

### MOT-3 — Tune the blur-up reveal

`components/ImageWithLoader.js` reveals images with `duration-700`. Seven hundred
milliseconds reads as sluggish, especially on a grid where twenty images are
revealing at once.

Note also that `app/globals.css` defines an `.image-loaded` class with a `blur-up`
keyframe animation that **nothing uses** — the component does the reveal with
Tailwind transition classes instead. Remove the dead rule.

**Target.** Reduce to roughly 250–300ms. Keep the two-track behaviour (opacity when a
`blurDataURL` exists, opacity plus blur when it does not).

**Files.** `components/ImageWithLoader.js`, `app/globals.css`.

**Done when.** Grid images resolve promptly without feeling abrupt, and the dead CSS
is gone.

---

### MOT-4 — View transitions on navigation

Clicking a page card navigates with a hard cut. A thumbnail that morphs into the
page it opens makes the app feel like one continuous surface.

**Target.** `view-transition-name` on the card thumbnail and the destination page
header image, driven by the browser's View Transitions API. Next 15 exposes this
behind an experimental flag; the CSS-only cross-document form is also an option.
**This is the most speculative item in the plan** — if it fights the App Router or
degrades badly in Safari, drop it and say so rather than forcing it. The existing
`routeTransitionCache` snapshots feeding `loading.js` already do much of this job.

**Done when.** Navigation between dashboard and page is visually continuous in a
supporting browser, and cleanly falls back to the current behaviour elsewhere.

---

### MOT-5 — Coalesce reorder bursts into one request

Moving a card four places currently issues four serial requests. Each is correct and
idempotent, but it is chatty, and in development each takes several seconds, so the
"Saving…" indicator lingers well after the UI has settled.

**Target.** Debounce the persist step per item — roughly 300ms — sending only the
final absolute target index. The endpoint already takes an absolute `toIndex`, so
this needs no server change. Preserve the sequence guard and the rollback-to-refresh
behaviour.

**Files.** `components/dashboard/DashboardViewClient.js`,
`components/page/PageViewClient.js`.

**Done when.** A four-place move issues **one** request with `toIndex` equal to the
final position, the UI does not stagger, and the database matches the UI. Extend the
Playwright check described in `STAGES.md` to assert the request count.

---

## TCH — Touch and mobile parity

### TCH-1 — Edit controls that work without hover

The edit affordances are hover-designed. `PostCard` and `PageCard` render their
controls at `opacity-70` with `group-hover:opacity-100`, so on a touch device they
sit permanently dimmed and never reach full contrast. Combined with small icon
buttons, edit mode is noticeably worse on a phone than on a desktop.

**Target.** Detect coarse pointers with `@media (hover: none)` — the codebase
already uses this pattern in `RichTextEditor` — and render the controls at full
opacity there. Do not rely on JavaScript device detection.

**Files.** `components/page/PostCard.js`, `components/dashboard/PageCard.js`.

**Done when.** In edit mode on a touch device or an emulated one, every control is
fully visible without hovering.

---

### TCH-2 — Delete arming that resets on touch

`deletePrime` is reset by `onMouseLeave`, which never fires on touch. On mobile the
armed state persists indefinitely, so a stray tap on that icon minutes later deletes
the item. Deleting a page cascades to every post and file inside it.

**Decision taken: the two-click prime pattern stays** — this item fixes the bug in
it, it does not replace it with a confirmation dialog.

**Target.** Reset the armed state on a timeout (around 3 seconds), on a tap
elsewhere in the document, and on scroll. Make the armed state visually
unmistakable, not just a colour shift — the icon already changes from a bin to an X,
but it should also carry an accessible label change so the second tap's consequence
is announced.

**Files.** `components/page/PostCard.js`, `components/dashboard/PageCard.js`.

**Done when.** Arming delete and waiting, scrolling, or tapping elsewhere disarms it.
The `aria-label` reflects the armed state.

---

### TCH-3 — Swipe navigation in the lightbox

`PhotoShowModal` supports arrow keys and on-screen chevrons but no swipe. For a
photo-centric app viewed largely on phones, that is the primary expected gesture.

**Target.** Horizontal swipe to move between posts, with a distance and velocity
threshold so a vertical scroll on the description is not misread as a swipe. Do not
introduce a gesture library for this.

**Files.** `components/page/PhotoShowModal.js`.

**Done when.** Swiping left and right moves between posts, scrolling the description
still works, and the existing keyboard and chevron paths are unaffected.

---

### TCH-4 — Preload adjacent lightbox images

`PhotoShowModal` renders only the current post, so every arrow press or swipe waits
on the network. On a page of large photographs, browsing feels slow even though
nothing is wrong.

**Target.** Preload the previous and next post's display image whenever the current
post changes — a hidden `<link rel="prefetch">` or an off-screen `Image` is enough.
Coordinate with [PERF-1](#perf-1--image-width-buckets) so the preloaded URL matches
the one the lightbox will actually request, otherwise the preload is wasted.

**Files.** `components/page/PhotoShowModal.js`.

**Done when.** Moving to the next photo shows it immediately, with no blank or blur
frame, on a throttled connection.

---

### TCH-5 — Tap target sizing

The reorder chevrons use `p-[2px]` and the edit and delete buttons `p-2`, giving tap
targets well under the ~44px generally recommended for touch.

**Target.** Increase the hit area on coarse pointers without changing the visual size
— padding, or a pseudo-element extending the target.

**Files.** `components/page/PostCard.js`, `components/dashboard/PageCard.js`.

**Done when.** Every interactive control in edit mode has at least a 44px hit target
on touch, with the visual design unchanged.

---

## LNK — Links, metadata and discoverability

### LNK-1 — Per-page metadata and OpenGraph

Both public routes inherit the root metadata, so a link to any profile or any page
previews as "Volvox Works — Collect your works" with no image. For a platform whose
entire purpose is people sharing a URL to their work, this is the largest gap
between what the app does and what it appears to do.

**Target.** `generateMetadata` on both dynamic routes: title from the page or user,
description from the page description or dashboard info text, and the existing
thumbnail as the OpenGraph and Twitter card image. Set `robots: { index: false }` for
private pages.

**Files.** `app/[usernameTag]/page.js`, `app/[usernameTag]/[pageSlug]/page.js`.

**Done when.** Pasting a page URL into a link-preview tool shows that page's own
title, description and image. Private pages are marked `noindex`.

---

### LNK-2 — `robots.txt` and `sitemap.ts`

Neither exists. `/admin` is currently indexable (see
[SEC-5](#sec-5--lock-admin-to-the-owner), which locks it).

**Target.** A `sitemap.ts` listing public profiles and non-private pages, and a
`robots.ts` disallowing `/api`, `/admin` and `/login`.

**Files.** new `app/sitemap.ts`, new `app/robots.ts`.

**Done when.** Both routes render correctly and exclude private pages and `/admin`.

---

### LNK-3 — Slug history with permanent redirects

Editing a page title with no explicit slug auto-derives a new slug
(`updatePage` in `lib/data.js`), and editing a display name regenerates
`usernameTag` — which is the user's entire public URL. Nothing warns them, and
nothing redirects the old address. Someone correcting a typo in their own name
discovers later that every link they have circulated is dead.

**Decision taken: keep every previous slug**, indefinitely. Reuse conflicts are rare
and the failure mode of dropping history is worse.

**Target.** `previousSlugs: [String]` on `Page` and `previousTags: [String]` on
`User`, appended on change. Route handlers check them before calling `notFound()`
and issue a permanent redirect. Uniqueness checks must consider previous slugs too,
so a new page cannot claim an address that still redirects elsewhere.

**Files.** `lib/models/Page.js`, `lib/models/User.js`, `lib/data.js`,
`app/[usernameTag]/page.js`, `app/[usernameTag]/[pageSlug]/page.js`.

**Done when.** Renaming a page leaves the old URL working via a 308. Renaming a
display name leaves the old profile URL working. Verify with a real rename and a
fresh request.

---

### LNK-4 — Contrast guard on the theme picker

Both colour pickers accept any value, and the header title colour is computed as
`lighten(dashHex, 245)` — which for any light header clamps to near-white on
near-white. Pick a pale header and your own name disappears. The global
`:focus-visible` ring is hardcoded to `#2d3e50`, which vanishes against a dark
custom theme.

The fix already exists in the codebase: `getInfoPalette` computes relative luminance
and flips the whole palette. It is simply not applied to the header. Depends on
[FND-2](#fnd-2--libcolourjs).

**Target.** Choose header text colour and focus ring from the luminance helper
rather than a fixed lighten amount.

**Files.** `components/dashboard/DashHeader.js`, `components/page/PageViewClient.js`,
`app/globals.css`.

**Done when.** No combination of header and background colours makes the title or
the focus ring invisible. Test the extremes: white on white, black on black.

---

### LNK-5 — Dashboard height and scrollbars

`DashboardViewClient` uses `min-h-[150vh]`, forcing one and a half screens of empty
background even for a user with two pages — so a new account's first action is
scrolling through nothing.

Separately, `app/globals.css` sets `scrollbar-width: none` on `html` and `body`,
removing the main affordance telling a visitor there is more content below.

**Target.** `min-h-screen` with the existing bottom padding. Keep the styled thin
scrollbar already defined lower in the same file and drop the hiding rules, or hide
only inside modals where the height is controlled.

**Files.** `components/dashboard/DashboardViewClient.js`, `app/globals.css`.

**Done when.** A two-page dashboard does not scroll. Long pages show a scrollbar.

---

## CLN — Cleanup and test coverage

### CLN-1 — Delete dead code

- `components/page/PostFileModal.js` (80 lines) — imported nowhere.
- `components/ActionButton.js` (38 lines) — imported nowhere.
- `heic2any` in `package.json` — never imported; HEIC is handled by native decode
  plus the CDN in `lib/processImage.js`.
- `app/.layout.js.swp`, `app/login/.page.js.swp` — vim swap files, gitignored but
  present on disk.
- `.quill-output` in `app/globals.css` — used only by `PostFileModal`, so dead once
  that is removed.
- `.image-loaded` and the `blur-up` keyframes in `app/globals.css` — used by nothing
  (see [MOT-3](#mot-3--tune-the-blur-up-reveal)).

**Done when.** All removed, and `next build` and `next lint` still pass.

---

### CLN-2 — `onLoadingComplete` → `onLoad`

`components/ImageWithLoader.js` uses `onLoadingComplete`, deprecated in Next 15 and
scheduled for removal. It works today and logs a warning in development.

**Done when.** Renamed, images still reveal correctly, no deprecation warning.

---

### CLN-3 — Denormalise `userId` onto `Post`

Every post authorisation check loads the post, then loads its page, then compares
`page.userId`. `app/api/posts/[postId]/route.js` does this on every request. The
codebase already accepts denormalisation — `Page` carries `usernameTag` for exactly
this reason.

**Target.** Add `userId` to the `Post` schema, set it in `createPost`, backfill
existing rows with a script following the `scripts/normalize-order.mjs` pattern
(dry-run by default), then simplify the ownership checks.

**Done when.** Every post has `userId`, ownership checks are single-query, and the
backfill script reports zero remaining rows.

---

### CLN-4 — Extend test coverage

`lib/ordering.test.mjs` exists and runs under `node --test` with no dependencies.

**Target.** Add coverage for: `mergeServerAndOptimistic` (`lib/optimisticMerge.js`),
the shared slug function from [FND-3](#fnd-3--one-slug-function), the reserved
username list from [SEC-6](#sec-6--reserved-usernames), the luminance and contrast
helpers from [FND-2](#fnd-2--libcolourjs), and the rate limit window logic from
[SEC-8](#sec-8--rate-limit-the-auth-endpoints).

Add `"test": "node --test lib/*.test.mjs"` to `package.json` scripts.

**Done when.** `npm test` runs green and covers each of the above.

---

## Deliberately out of scope

Do not implement these. They were considered and declined; if you believe one has
become necessary, raise it rather than building it.

| Item | Why not |
|---|---|
| **Unique index on `{ userId, order_index }`** | The renumbering write passes through intermediate states where two documents briefly share an index, so a unique constraint would make legitimate reorders fail. The self-healing normalise is the correct protection. |
| **Media quality work** — persisting the `width`/`height` that `processImageForUpload` already computes and discards, replacing the fixed `aspect-[4/3]` `object-cover` crops with real aspect ratios | Declined for this round. Worth revisiting later; the dimensions are genuinely being computed and thrown away by all five call sites. |
| **Delete confirmations or undo** | Declined. The two-click prime pattern stays as-is. [TCH-2](#tch-2--delete-arming-that-resets-on-touch) fixes the touch bug within that pattern and does not change the interaction model. |
| **Drag-to-reorder** | Not in this round. The server already supports arbitrary index moves, so a drag handler would only need to send a target index — it stays cheap to add later. |
| **Pagination** | At current page sizes [PERF-1](#perf-1--image-width-buckets) delivers far more for less risk. Revisit if any page passes a few hundred posts. |
| **A test framework (Vitest, Jest)** | Node's built-in runner covers the pure logic with no dependencies. Only worth revisiting for component tests. |
| **Rewriting the optimistic queue** | The architecture is sound. It needs error reporting ([REL-2](#rel-2--make-failed-mutations-visible)), not replacement. |
| **`scripts/migrate.mjs`** | A one-off Firebase migration that has already run. Leave it untouched. |
