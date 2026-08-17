# Progress

Branch: `hardening` (cut from `main` at `ea7624d`). Nothing pushed, nothing merged.

## Baseline (Stage 0) — 2026-08-17

Verification gate, run on the inherited working tree before any change:

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 9 pass, 0 fail |
| `npm run build` | ✔ compiled, all 26 routes listed, **first attempt, no `Failed to collect page data`** |
| `node scripts/normalize-order.mjs` | 0 page index, 0 post index, 0 count corrections |

First-load JS baseline (Stage 4 is measured against these):

| Route | Route size | First-load JS |
|---|---|---|
| `/[usernameTag]` | 10.3 kB | **208 kB** |
| `/[usernameTag]/[pageSlug]` | 19.9 kB | **218 kB** |
| shared by all | — | 103 kB |

Note: `IMPROVEMENTS.md` PERF-5 quotes 217 kB for the page route; the current build says
218 kB. Close enough to be the same figure — no discrepancy worth chasing.

### Browser harness — working

`playwright-core` installed **outside the project** (in the session scratchpad, so
`package.json` is untouched), driving the system Chrome. Auth.js session cookie minted
with the project's own `next-auth/jwt` `encode`, salt/name `authjs.session-token`.
Confirmed: dashboard renders 6 cards as the owner (email + Edit button visible), a page
renders 8 cards, edit mode toggles and shows the per-card controls.

Dev server: port **3000** (nothing else was listening; started by this run, killed at the end).

### Environment notes

- The inherited ordering fix (`lib/ordering.js`, `lib/data.js`, both reorder routes, both
  view clients) was **uncommitted on `main`**. It has been committed unchanged as the first
  commit on the `hardening` branch so that each stage's diff is reviewable on its own.
  See "Decisions and deviations".

## Stage 1 — Lock it down

- [x] **SEC-1 — stop shipping password hashes to the browser.** `getUserByUsernameTag`
  now projects away `passwordHash` and `firebaseUid`; new `toPublicUser(user, {isOwner})`
  in `lib/data.js` builds the only shape allowed to cross into a client component
  (`usernameTag`, `usernameTitle`, `dashboard.infoText`, and `email` **only** when
  `isOwner`). Both public routes pass that instead of `JSON.parse(JSON.stringify(user))`.
  **Verified against a production build** (`next build` + `next start`, port 3001),
  logged out, grepping the raw response body:

  | | `/adam-aldridge` before | after | `/adam-aldridge/web-projects` before | after |
  |---|---|---|---|---|
  | `passwordHash` | PRESENT | absent | PRESENT | absent |
  | `$2a$` (the bcrypt hash itself) | PRESENT | absent | PRESENT | absent |
  | `firebaseUid` | PRESENT | absent | PRESENT | absent |
  | owner's email address | PRESENT | absent | PRESENT | absent |

  Still renders: anonymous visitor sees 4 public cards and no email; owner sees all 6
  cards, own email, and 8 post cards on the page route.

  Worth knowing for later verification: **in `next dev` the full user document is still
  in the payload** even after this fix, because React's dev-only async debug info
  embeds the resolved value of the awaited `getUserByUsernameTag` promise. The bcrypt
  hash is gone from dev too (the projection removed it at the query level), but
  view-source checks of this kind must be run against a production build to mean
  anything.

- [x] **SEC-2 — ownership check on file deletion.** New `userOwnsFileUrl(userId, fileUrl)`
  in `lib/data.js` resolves a public URL back to a page thumbnail, or to the content or
  thumbnail of a post on one of the caller's pages (via the user's page ids, since `Post`
  has no `userId` until CLN-3). `app/api/storage/delete/route.js` returns **403** unless it
  matches. Verified two ways, neither of which destroys anything:
  - The helper itself, called directly against live data through an alias-resolving node
    loader (read-only, no writes): owner + own page thumbnail → true, owner + own post
    content → true, owner + own post thumbnail → true, **second account + victim's page
    thumbnail → false**, second account + victim's post content → false, owner + unknown
    URL → false, empty URL → false. 7/7.
  - The live endpoint: no session → 401; second account posting the victim's page
    thumbnail → **403**; second account posting the victim's post content → **403**;
    owner posting an unknown URL → 403; missing `fileUrl` → 400. `HEAD` on both victim
    URLs returned **200 before and 200 after**, so nothing was deleted.

- [x] **SEC-3 — lock down blur generation.** `/api/generate-blur` now requires a session,
  requires the URL's origin to equal `NEXT_PUBLIC_R2_DOMAIN`, has no raw-image fallback
  (it base64-encoded the whole original, which was neither a blur nor a sane payload), and
  retries 3× at 0.5s/1.0s instead of 5× at 1+2+3+4s — worst case ~1.5s instead of ~10s of
  held-open function per unauthenticated request. `fetchServerBlur` matches the 3-attempt
  budget and stops retrying on any 4xx (a verdict, not propagation lag). Verified live:

  | request | result |
  |---|---|
  | unauthenticated, our own image | **401** |
  | authed, `http://169.254.169.254/latest/meta-data/` | **400** |
  | authed, `https://example.com/cat.jpg` | **400** |
  | authed, `file:///etc/passwd` | **400** |
  | authed, garbage string | 400 |
  | authed, our own R2 image | **200**, `data:image/jpeg;base64,…` 3231 chars, 2.8s |

  *Not verified:* an actual HEIC upload, which would create a post (a database write this
  run is not authorised to make). The blur path that HEIC depends on is the 200 above.

- [x] **SEC-4 — derive upload paths server-side.** New `lib/uploadKeys.js` owns the key
  layout and a content-type allowlist. The client now sends `kind`
  (`photo` | `file` | `page-thumbnail`) and, for the first two, a `pageId` that is checked
  against `Page.findOne({ _id: pageId, userId })`; the key prefix is built from the session
  user and the verified page. All 5 modals (8 presign call sites incl. the batch) updated;
  the `folder` field no longer exists anywhere. Verified live:

  | request | result |
  |---|---|
  | `photo` + own pageId | 200 → `users/{userId}/pages/{pageId}/posts/…` |
  | `file` + own pageId | 200 → `users/{userId}/pages/{pageId}/files/…` |
  | `page-thumbnail` | 200 → `users/{userId}/page-thumbnails/…` |
  | `photo` + own pageId **+ a legacy `folder: '../../../evil'`** | 200, folder **ignored**, correct prefix |
  | `photo` + **another user's** pageId | **403** |
  | `photo` + missing / malformed pageId | 400 / 403 |
  | unknown `kind` | 400 |
  | `photo` with `text/html`; `file` with `application/x-msdownload` | 400 |
  | no session | 401 |
  | batch, own page / another user's page / bad type | 200 both keys under the prefix / **403** / 400 |

  Also a real round trip: presign → `PUT` a 1×1 PNG → the object was readable at the derived
  key (`200 image/png`), then deleted again from R2 by the harness (HEAD → 404). So the
  storage half of every modal path still works. *Not verified:* clicking through the five
  modals to completion, which would create posts and pages (database writes).

- [x] **SEC-5 — lock `/admin` to the owner.** Gated on `ADMIN_USER_IDS` (comma-separated
  user ids). No match → `notFound()`, so the route's existence is not advertised. An unset
  variable locks everyone out, which is the right default for a page listing every account.
  Also `robots: { index: false }` and the eyebrow no longer claims "Public Admin". Verified
  live: logged out → **404**; signed in as a different account → **404**; signed in as the
  configured id → **200** with the full table.

- [x] **SEC-6 — reserved usernames.** New `lib/reservedTags.js` (no imports, so the test can
  load it under plain node) holds `RESERVED_USERNAME_TAGS` and `isReservedUsernameTag`;
  `uniqueUsernameTag` treats a reserved tag exactly like a taken one and falls through to the
  existing numeric-suffix path. `lib/reservedTags.test.mjs` adds 4 tests (13 total, all pass).
  Verified by running the real `uniqueUsernameTag` against live data (read-only — it only
  queries): `"Admin" → admin-2`, `"Login" → login-2`, `"API" → api-2`, while
  `"Ada Lovelace" → ada-lovelace` is untouched.
  *Not verified:* an actual signup, which would create a user (database write).

- [x] **SEC-7 — password policy and one hashing cost.** New `lib/password.js` holds
  `MIN_PASSWORD_LENGTH = 8`, `BCRYPT_COST = 12` and `passwordProblem()`. Both server paths
  (signup, reset confirm) reject short passwords with the same message, and both now hash at
  12 — signup previously used 10, so a user's protection depended on which path they last
  used. The login page imports the same rule (`minLength`, a placeholder hint, and a JS guard
  before the request). Verified live: signup with a 1- and 7-character password → **400
  "Password must be at least 8 characters"**; with 8 characters → 409 (existing account, so
  validation passed and nothing was written); reset confirm with a short password → 400,
  with a valid-length one → 400 at the *token* check, i.e. past the password gate. In the
  browser the signup field carries `minlength=8`, shows "Password (at least 8 characters)",
  and a short entry is refused before any request is made.

  *Deviation:* the shared constants live in a new `lib/password.js` rather than `lib/auth.js`
  as `IMPROVEMENTS.md` suggested — `lib/auth.js` pulls in mongoose and the whole Auth.js
  config, and the login page is a client component that must not import it.

- [x] **SEC-8 — rate limit the auth endpoints.** New `lib/models/RateLimit.js` (unique `key`,
  `hits`, `expiresAt` + TTL index) and `lib/rateLimit.js` (fixed windows, short-circuiting
  multi-budget check, **fails open** if Mongo is unavailable — a limiter that locks people out
  during a database hiccup is worse than the problem). Applied to magic link, password-reset
  request, password-reset confirm, signup, and the credentials callback.

  Budgets (deliberately generous, per the run brief): 5 emails per address / 15 min, 20 emails
  per IP / 15 min, 10 signups per IP / 15 min, 20 logins per IP / 15 min, 20 reset confirms
  per IP / 15 min.

  Verified live, **without sending a single email** — every address used in the tests has no
  account, so the handler returns before it reaches Resend:
  - Requests 1–5 for one address → 200; **6th and 7th → 429** with `Retry-After: 885`.
  - Filling the per-IP budget with 20 further no-account addresses: first IP refusal lands
    exactly where the arithmetic says (the address-budget refusals short-circuit before
    consuming the IP budget, which is the intended behaviour).
  - With the IP budget spent, a request for the **real** account address → **429**, refused
    before the Resend call, so no mail was sent.
  - Login: attempts 1–20 pass through to Auth.js, **attempt 21 → 429**; in the browser the
    login form shows *"Too many attempts. Please wait a few minutes and try again."* rather
    than the generic wrong-password message.
  - `ratelimits` indexes confirmed: `{key:1}` unique and `{expiresAt:1}` TTL
    `expireAfterSeconds=0`.

  **Unlocking yourself:** `node scripts/clear-rate-limits.mjs` (dry run, lists every live
  window with time remaining), `--commit` to delete them, `--key <substring>` to target one
  action. Exercised end to end: dry run listed 24 windows → `--commit` deleted 24 → re-run
  reported 0 → the previously blocked reset address returned 200 and the login form went back
  to the ordinary wrong-password message. The collection was cleared again at the end, so
  nothing is throttled now.

  *Deviation:* `STAGES.md` says "fourth reset request → 429". With the generous budget the
  run brief asked for, the **sixth** is the first refusal. Same behaviour, higher threshold.

- [x] **SEC-9 — validate URL-post schemes.** New `lib/postUrl.js` (`isHttpUrl`), enforced in
  `POST /api/posts` and in `PATCH /api/posts/[postId]` — the latter only when `content` is
  actually being written, so a title-only edit cannot fail on a stored value. Verified live
  as the owner: `javascript:`, `JavaScript:`, `data:`, `file:`, `ftp:`, a relative path, an
  empty string and a bare word are all **400 "Link must start with http:// or https://"**;
  a valid `https://` link with no thumbnail reaches the *next* check ("Thumbnail is
  required"), proving it passed the URL gate. The existing url post's stored content was
  byte-identical afterwards, and the page's post count was unchanged — no writes occurred.

- [x] **SEC-10 — security headers.** `next.config.mjs` now sets `poweredByHeader: false` and,
  on every route: `Content-Security-Policy: frame-ancestors 'self'`, `X-Frame-Options:
  SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`. Confirmed on the wire (`curl -I`), with no `X-Powered-By`.
  Both fragile things still work: the lightbox renders **3 elements carrying
  `background-image: url("data:image/jpeg;base64,…")`** blur placeholders, and the Quill
  editor in the New Post modal mounts with its toolbar and its two injected inline `<style>`
  blocks. Zero CSP/"Refused to" console errors, zero console errors of any kind.

  **Outstanding, deliberately:** a full CSP with `script-src`/`style-src`. The app renders
  user rich text through `dangerouslySetInnerHTML` in four places and Quill injects inline
  styles, so a real CSP needs `'unsafe-inline'` for styles at minimum and a nonce strategy
  for scripts — more than this stage should change blind. `frame-ancestors` is the part that
  carries no such risk, so that is what shipped.

### Stage 1 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 13 pass, 0 fail (9 ordering + 4 new reserved-tag) |
| `npm run build` | ✔ compiled first attempt, both times run; no `Failed to collect page data` |
| `node scripts/normalize-order.mjs` | 0 corrections |
| First-load JS | `/[usernameTag]` 208 kB, `/[usernameTag]/[pageSlug]` 218 kB — unchanged from baseline |

Stage 1 checks from `STAGES.md`: all six pass; see each item above for the evidence. The
sixth ("signup, login, magic link and password reset all still work end to end") is the one
qualified answer — every route was exercised and behaves correctly up to the point where it
would create an account or send mail, which this run is not authorised to do. Nothing
observed suggests any of them is broken; nothing observed proves the full round trip either.

## Stage 2 — Make failure visible

- [x] **REL-1 — clear the cached connection promise on failure.** `lib/db.js` now nulls
  `cached.promise` when the connect rejects, and passes `serverSelectionTimeoutMS: 10000` and
  `maxPoolSize: 10`. Verified **in one process, with no restart**, by importing the real
  `lib/db.js` through an alias-resolving node loader, pointing `MONGODB_URI` at an unreachable
  host, restoring it, and calling `connectDB()` again:

  | | before the fix | after the fix |
  |---|---|---|
  | 1. connect to unreachable host | rejected (`ECONNREFUSED`) | rejected (`ECONNREFUSED`) |
  | 2. connect again with the real URI | **STILL `ECONNREFUSED`** — the cached rejection | **recovered, `readyState = 1`** |
  | 3. query on the recovered connection | failed | ok, `users = 5` |

  The bug reproduced exactly as `IMPROVEMENTS.md` described before the change, which is the
  useful half of this verification.

- [x] **REL-2 — make failed mutations visible.** New `context/ToastContext.js`: provider,
  fixed bottom-centre stack, `error`/`info` tones, auto-dismiss (8s errors, 4s info), manual
  dismiss, `role="alert"` for errors and `role="status"` for info, `aria-live="polite"` on the
  stack, `pointer-events-none` except on the toasts themselves, and no focus management at all
  so nothing is trapped or stolen. Mounted in `app/layout.js` inside `AuthProvider`.
  `useQueue(onQueueIdle, onError)` now reports failures through an `onError(error, op)`
  channel, and all 8 `enqueue` call sites carry a human-readable `description`
  ("Couldn't delete \"Web projects\"").

  Verified in a real browser with `context.setOffline(true)` — and with the network proven
  dead first (an in-page `fetch` throws) so nothing could reach the database by accident:

  | grid | operation | toast | state | database |
  |---|---|---|---|---|
  | posts | delete | *Couldn't delete "Greenfield Build" — You appear to be offline…* | 8 cards → 8 | unchanged |
  | posts | reorder | *Couldn't save the new post order — …* | order reverts on reload | unchanged |
  | posts | create | *Couldn't save your new post — The change has been undone…* | 8 → 8, `postCount` 8 → 8 | unchanged |
  | pages | edit (modal save) | *Couldn't save your changes to that page — …* | title stays "Web projects" | unchanged |
  | pages | delete | *Couldn't delete "Web projects" — …* | 6 cards → 6 | unchanged |
  | pages | reorder | *Couldn't save the new page order — …* | — | unchanged |

  Screenshot evidence of the rendered toast: `rel2-visible.png` in the run's scratchpad.
  The create case was driven by aborting only `POST /api/posts` (so the R2 upload was real and
  the *queue* was the thing that failed); the orphaned R2 object was deleted afterwards.

  Two defects found and fixed while verifying — neither was in the plan:

  1. **The explanation was being destroyed by a navigation.** `onQueueIdle` calls
     `router.refresh()`. Offline, the RSC fetch fails and the App Router falls back to a full
     browser navigation, so the tab landed on Chrome's offline page and the toast went with
     it. `refreshWithScrollRestore` now returns early when `navigator.onLine === false` —
     nothing has changed server-side in that case anyway.
  2. **The toast had no styling at all.** `tailwind.config.js` scanned only `app/` and
     `components/`, so every class in `context/ToastContext.js` was dropped: the stack
     rendered at `x:0, y:1012` — off-screen, `z-index: auto`. Added `./context/**/*.{js,jsx}`
     to the content globs; the stack then measured `x:510, y:810` in a 1440×900 viewport and
     is visible in the screenshot.

  Also fixed while here: `handleSaveInfo` in `DashboardViewClient` ignored `res.ok`, so a
  failed dashboard-info save still displayed "Saved". It now throws, and the editor's existing
  status line reports it.

  *Honesty note on the reorder wording:* the reorder rollback resyncs from the server rather
  than restoring a snapshot, so offline it cannot undo the on-screen move. Rather than claim
  "the change has been undone", that toast says *"nothing was saved. Reload to see the saved
  order."* (`rollsBackLocally: false` on the op).

- [x] **REL-3 — error boundaries.** New `app/error.js` and `app/[usernameTag]/error.js`, both
  in the app's visual language (the `not-found.js` styling), both logging the error and both
  offering a working retry plus a way out (home / the profile). Verified by temporarily making
  a server component throw exactly once — armed by a flag file so a dev module reload could not
  re-arm it — then removing the temporary code (`git diff` on those two files is empty and
  `grep -rn "boom\|TEMPORARY" app/` returns nothing):

  | | result |
  |---|---|
  | `/adam-aldridge` while throwing | custom boundary rendered, no raw Next error screen |
  | click "Try again" | **recovered — the dashboard rendered its 4 public cards** |
  | `/` while throwing | root boundary rendered |
  | click "Try again" | recovered and redirected to `/login` |

  Worth knowing: **`reset()` on its own does not recover a thrown server component** — it
  re-renders the segment from the payload it already has, which is the same failure. The retry
  calls `router.refresh()` inside the same transition, which is what re-runs it on the server.
  The first attempt at this item shipped `onClick={reset}` and the retry visibly did nothing.

- [x] **REL-4 — fix bulk upload preview revocation.** The unmount cleanup now reads `files`
  through a ref with an empty dependency array, and the `[initialFiles]` effect no longer
  rebuilds items that the `useState` initialiser already built (it only rebuilds when the prop
  identity actually changes, revoking the old URLs as it does). Verified by selecting two
  images, then adding two more, and asking each `blob:` URL whether it is still alive:

  | | first batch's URLs after adding a second batch |
  |---|---|
  | before the fix | **dead** (`fetch` on the blob URL fails) |
  | after the fix | alive, all four thumbnails render |

  Nuance worth recording: the thumbnails do **not** visibly blank in current Chrome, because an
  `<img>` that has already decoded keeps its bitmap after the URL is revoked. The defect is
  real but latent — the URLs were dead, so any remount of those elements would have shown
  broken images. That is why the check asserts on the URL rather than on `naturalWidth`.

- [x] **REL-5 — batch R2 deletes on page cascade.** New `deleteR2Files(urls)` in `lib/r2.js`
  uses `DeleteObjectsCommand` in chunks of 1,000, de-duplicates keys, ignores URLs that are not
  ours, and reports `{ deleted, failed }` instead of throwing. `deletePage` and `deletePost`
  now collect the URLs, **delete the database rows first**, and then clean storage up as
  best-effort. Verified directly against R2: 5 throwaway objects uploaded (storage only — no
  database rows), then one `deleteR2Files` call with a deliberately noisy list (5 URLs + a
  duplicate + `''` + `null` + a foreign `https://example.com/...`) returned
  `{ deleted: 5, failed: 0 }` in 2.6s and all five `HEAD`s went 200 → **404**. Empty input is a
  no-op.

  **✔ Completed at the start of the Stage 3–5 run** (the cascade was authorised there). A
  scratch page was created through the real API with 5 uploaded R2 objects and 3 posts (photo,
  file, text), then deleted through `DELETE /api/pages/[pageId]`:

  | check | before delete | after delete |
  |---|---|---|
  | page row | exists | **gone** |
  | post rows for that page | 3 | **0** |
  | `page.postCount` | 3 | — |
  | `user.pageCount` | 7 | **6** (reconciled, not `$inc`-ed) |
  | the 5 R2 objects | all **200** | all **404** |
  | the 6 pre-existing pages' `order_index` | 1–6 | **1–6, unchanged** |

  The delete returned 200 in **8.2s** in dev (one batched `DeleteObjects` call, not five round
  trips). `node scripts/normalize-order.mjs` reported 0 corrections afterwards. Nothing
  pre-existing was touched: the scratch page was private, created and destroyed by the test.

- [x] **REL-6 — stop treating the counters as authoritative.** `createPage` no longer
  increments `pageCount` before the insert and no longer derives `order_index` from
  `max(lastPage + 1, pageCount)` — a drifted counter fed straight back into the ordering it
  was meant to describe. It now reads the actual last sibling for `order_index` and calls
  `reconcilePageCount` after a successful insert; `createPost` does the same with
  `reconcilePostCount`. `deletePage` and `deletePost` reconcile instead of `$inc`-ing down.
  The counter-unwinding failure paths are gone with the counter increment they existed to undo.
  Both reconcile functions now have callers.

  Verified: `node scripts/normalize-order.mjs` reports **0 corrections**, and the forced create
  failure from the REL-2 test (the create request aborted mid-flight) left `page.postCount` at
  8 with 8 posts on the page. *Not verified:* a full create/delete sequence, which would need
  database writes.

### Stage 2 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 13 pass, 0 fail |
| `npm run build` | ✔ compiled first attempt |
| `node scripts/normalize-order.mjs` | 0 corrections |
| First-load JS | `/[usernameTag]` 208 → **210 kB**, `/[usernameTag]/[pageSlug]` 218 → **219 kB** (the toast provider; Stage 4 takes this back and more) |

Stage 2 checks from `STAGES.md`:

- ✔ Kill the network mid-save on both grids: toast + rollback for create, edit, delete and
  reorder. Database confirmed unchanged after every one.
- ✔ Force a server component throw: custom boundary renders, retry recovers.
- ✔ Bulk modal: select images, add more, all thumbnails remain (and their object URLs stay
  alive, which is the sharper version of the same check).
- ✔ Delete a scratch page with several posts — **done retrospectively at the start of the
  Stage 3–5 run**, once it was authorised. See REL-5 above for the table.
- ✔ `normalize-order` reports 0 after the create-failure sequence that was exercised.

Also re-checked: a normal signed-in load of the dashboard and a page produces **zero console
errors**. The only warnings are the known deprecated `onLoadingComplete` ones, which CLN-2
removes in Stage 9.

## Stage 3 — Shared foundations

Pure extraction. Ten baseline screenshots (dashboard, dashboard in edit mode, a page, a page
in edit mode, and all six modals) were captured **before** any Stage 3 change and re-captured
after FND-4; see the FND-4 entry for the comparison.

- [x] **FND-1 — one sanitiser.** New `lib/sanitize.js` exports `SANITIZE_OPTIONS` and
  `sanitizeRichText(value)`. All seven copies are gone: `api/posts`, `api/posts/[postId]`,
  `api/pages/[pageId]/meta`, `api/user/dashboard`, `PageInfoEditor`, `DashboardInfoEditor` and
  the dead `PostFileModal`. `grep -rn "SANITIZE_OPTIONS\|sanitizeHtml\|sanitize-html" app
  components context` now returns nothing outside `lib/sanitize.js`.

  Anchors carrying `target` now get `rel="noopener"` appended (existing rel values preserved),
  which is the hole `IMPROVEMENTS.md` names. Verified two ways:

  1. **Function-level equivalence over an 18-case corpus** (headings, lists, blockquote,
     `pre`/`code`, entities, `javascript:` href, `<script>`, `<img onerror>`, inline `style`,
     unlisted tags, empty/whitespace): old options and new produce **byte-identical output in
     16 cases**, and differ in exactly the two intended ones —
     `target="_blank"` with no rel → `rel="noopener"` added; `target="_blank" rel="noreferrer"`
     → `rel="noreferrer noopener"`. An anchor that already has `noopener` is untouched.
  2. **In the running app**, on a scratch page created and deleted for the purpose (no real
     content touched): a corpus of every allowed tag was written through
     `PATCH /api/pages/[pageId]/meta` and the rendered `.page-content` innerHTML compared to
     what the *old* sanitiser produces from the stored value, normalised through the same DOM.
     **Identical, 512 characters.** The DOM's anchors read `-|-`, `_blank|noopener`, `-|-`,
     i.e. the fix is live and only touches targeted links. The lightbox description also still
     renders (`PhotoShowModal` goes through `lib/richText.js`, which FND-1 does not touch).

  *Not exercised:* `DashboardInfoEditor`'s sanitised branch. It only renders when the viewer is
  **not** in edit mode and the user's `dashboard.infoText` has visible content, and no account
  in the database has any — the owner's is whitespace-only, so the component returns `null`.
  Giving it content means writing to a real user document, which is outside this run's
  authorised writes. Its diff is the same two lines as `PageInfoEditor`'s, whose render is
  verified above.

- [x] **FND-2 — one colour module.** New `lib/colour.js` (no imports, so anything can use it)
  exports `normalizeHex`, `hexToRgb`, `hexToRgba`, `lighten`, `mixHex`, `getLuminance` and
  `getInfoPalette`. Six copies removed: `PageInfoEditor`, `DashboardInfoEditor`, `DashHeader`,
  **`ThemeContext`** (a fifth copy the plan did not list) and both `loading.js` files.
  `PageViewClient` imported `lighten`/`hexToRgba` *from `DashHeader`* — a component importing
  helpers out of another component — and now imports them from `lib/colour.js`, so `DashHeader`
  exports only its component again.

  The copies did not agree on the fallback colour when handed an unusable hex — `#000000` in
  `DashHeader`, `#e5e7eb` in the info editors, `#2d3e50` in `lighten` inside both `loading.js`
  files. The shared functions take the fallback as a trailing argument, and each call site
  passes the one its own copy used, so no reachable behaviour changes.

  Verified by **differential test against the pre-FND-2 implementations, copied verbatim**:
  18 hex inputs (valid, unprefixed, empty, `null`, `undefined`, malformed, whitespace-padded)
  × `normalizeHex` under three fallbacks, `lighten` at 5 amounts under both fallbacks,
  `hexToRgba` at 4 alphas under all three fallbacks, `getLuminance`, `mixHex` at 6 weights
  (including out-of-range) and the whole `getInfoPalette` object — **zero mismatches**.

  In the running app: the dashboard and page pixel-compare against their pre-Stage-3
  screenshots with **every header, rule, border, panel and text pixel identical** — the only
  differing pixels are inside lazily-loaded card images below the fold, which decode at
  different moments run to run (the screenshot script now waits for them). The loading skeleton
  was captured mid-navigation and its computed styles are exactly what the helpers predict:
  header `rgb(59, 59, 59)` = `#3b3b3b`, rule `rgb(89, 89, 89)` = `lighten('#3b3b3b', 30)`,
  page background `rgba(204, 204, 204, 0.5)` = `hexToRgba('#cccccc', 0.5)`.

- [x] **FND-3 — one slug function.** New `lib/slug.js` (no imports, so client components,
  `lib/data.js` and a plain-node test can all load it) exports `toBaseSlug` and
  `MAX_SLUG_LENGTH`. The three client copies are gone — `CreatePageModal`, `EditPageModal` and
  the inline one in `TitleEdit` — and `lib/data.js` imports it and re-exports it, because the
  signup and title routes have always imported `toBaseSlug` from there.

  One deliberate difference: `toBaseSlug` now coerces with `String(value ?? '')`. The old
  version called `.toLowerCase()` straight on its argument, so `createPost` with neither a
  title nor a `content_type` threw a `TypeError` inside the route rather than producing an
  empty base slug the caller already handles. Nothing else changes.

  `lib/slug.test.mjs` adds **8 tests** (21 total, all pass): punctuation, non-Latin scripts and
  emoji, whitespace collapsing, hyphen trimming, truncation at 50, the trailing hyphen that
  truncation can leave, empty/`null`/`undefined`, and idempotence.

  Verified in the running app that the preview matches the URL actually assigned:

  | input | CreatePageModal | EditPageModal | TitleEdit | server |
  |---|---|---|---|---|
  | `Adam's PhD (2024): notes!` | `adams-phd-2024-notes` | same | same | **`adams-phd-2024-notes`** |
  | `C++ / Rust & Go` | `c-rust-go` | same | same | — |
  | `  Spaced   Out  ` | `spaced-out` | same | same | — |
  | `Café Möbius` | `caf-mbius` | same | same | — |
  | `こんにちは world` | `world` | same | same | **`world`** |
  | `🎉 party 🎉` | `party` | same | — | — |
  | `--- dashes ---` | `dashes` | same | — | — |
  | 60 `A`s + ` tail` | 50 `a`s | same | — | **50 `a`s** |
  | `word ` × 20 | `word-…-word-` (50) | same | — | — |

  The three "server" rows are real scratch pages created by title alone through
  `POST /api/pages` and deleted again; `normalize-order` reports 0 corrections afterwards.

- [x] **FND-4 — one modal shell.** New `components/Modal.js` owns the backdrop, the body-scroll
  lock (with scrollbar-width compensation and a shared open-count, so one modal replacing
  another cannot unlock the page underneath it), Escape, backdrop click, `role="dialog"`,
  `aria-modal="true"`, the accessible name, focus-into-the-panel on open, a Tab/Shift-Tab trap
  that re-reads the focusable set on every keypress, and focus restore to the trigger on close.
  Each modal keeps its own backdrop and panel classes — the shell owns behaviour, not
  appearance. Six converted: `CreatePageModal`, `EditPageModal`, `CreatePostModal`,
  `EditPostModal`, `BulkUploadModal` and `PhotoShowModal`.

  Details worth knowing:
  - **Focus lands on the panel, not the first field.** Focusing the first input would put a
    focus ring on a control the user did not choose — a visible change. The panel takes
    `tabIndex={-1}` and `focus:outline-none`.
  - **A backdrop click only closes if the press *started* on the backdrop.** Otherwise dragging
    to select text inside the panel and releasing outside would dismiss the modal.
  - **The two post modals name themselves explicitly** rather than through their heading. The
    heading renders a short and a long form (`<span className="sm:hidden">Image</span>` +
    `<span className="hidden sm:inline">Post an image</span>`), and an accessible name computed
    from it concatenates both — a screen reader announced *"ImagePost an image"*. Caught by
    reading the computed name, not by looking at the code.
  - `PhotoShowModal` keeps its own arrow-key handler; only its Escape branch moved to the shell.

  **Behaviour verified in the browser, all six modals, 66 checks, all pass:** `role="dialog"`
  and `aria-modal="true"` present; a sensible accessible name (*Create New Page*, *Edit Page*,
  *Post an image*, *Edit file post*, *Upload multiple images*, *Image lightbox*); focus inside
  the dialog on open; Tab pressed (focusables + 3) times — up to 24 — never escapes; Shift+Tab
  stays inside; Escape closes; backdrop click closes; `document.body.style.overflow` is
  `hidden` while open and restored after; focus returns to the exact button that opened it.
  The lightbox's ArrowRight/ArrowLeft still move between posts.

  **`BulkUploadModal` had no Escape handler at all before this** — the only one of the six that
  could not be dismissed from the keyboard. Found by writing the screenshot script, which hung
  waiting for it to close.

  **No visual change.** Ten screenshots (dashboard, dashboard in edit mode, page, page in edit
  mode, all six modals) at 1440×900 @2x, pixel-compared before and after FND-4:

  | | differing pixels |
  |---|---|
  | 9 of 10 shots | **0** |
  | `04-modal-edit-page` | 2,265 px (0.044%), confined to the thumbnail preview image |

  The noise floor for this harness is 752 px (0.015%) — measured by running the *same* code
  twice — and the diff image shows the difference is a sliver at the top edge of a still-decoding
  thumbnail, not layout or colour.

### Stage 3 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | **21 pass, 0 fail** (13 + 8 new slug tests) |
| `npm run build` | ✔ compiled first attempt, all 26 routes listed |
| `node scripts/normalize-order.mjs` | 0 corrections |
| First-load JS | `/[usernameTag]` 210 kB (unchanged), `/[usernameTag]/[pageSlug]` 219 → **214 kB** — deduplicating the colour, sanitiser and slug copies took 5 kB out of the page route on its own |

Stage 3 checks from `STAGES.md`:

- ✔ Screenshots before and after: pixel-identical apart from image-decode noise; the only
  intended differences are attributes (`role`, `aria-modal`, `aria-label`), which do not render.
- ✔ Every modal: Tab stays inside, Escape closes, backdrop click closes, focus returns to the
  trigger.
- ✔ Slug preview in both page modals and the title editor matches the server's slug across
  punctuation, non-Latin input, emoji and over-length titles.

## Stage 4 — Cut the weight

- [x] **PERF-1 — image width buckets.** `lib/cloudflareLoader.js` now emits `width=` in the
  `cdn-cgi/image` path and exports `CARD_IMAGE_WIDTH`, `FULL_IMAGE_WIDTH`, `withImageBucket`
  and `buildImageUrl`. The bucket is chosen by the **call site**, not by the browser: it rides
  on the src as a `?w=` parameter, because `next/image` builds its own `srcset` from the
  device sizes and would otherwise pull in a third and fourth transform per image. Cards get
  the card bucket on every device; the lightbox asks for 1600 and layers the card's
  already-cached image underneath it.

  **The card bucket is 960, not the 640 the plan named — a product decision, taken with the
  run owner.** Cards are `object-cover` 4:3 crops, so a 16:9 source is cropped *and* scaled up:
  a 330 CSS-px card on a 2× display needs about 835px of source width. 640 is right for a
  phone and visibly soft on a retina desktop — small text inside a thumbnail stopped being
  legible. Measured on the real images:

  | card bucket | dashboard, mobile | page, mobile | desktop @2× |
  |---|---|---|---|
  | none (before) | 757.0 kB / 6 images | 530.4 kB / 8 images | reference |
  | 640 (as planned) | 165.5 kB (**−78%**) | 126.9 kB (−76%) | **visibly soft** |
  | **960 (shipped)** | **309.2 kB (−59%)** | **211.7 kB (−60%)** | no visible change |

  Verified in the browser: every card image requests `width=960`; the whole session produces
  exactly **two** distinct transforms, 960 and 1600; opening the lightbox issues **one** new
  request (the 1600) and re-requests nothing at 960, so the layer underneath comes from cache;
  at +120ms the lightbox already has the blur and the 960 painted at opacity 1 while the 1600
  is still pending — **no blank frame** — and at +4s the 1600 is loaded and visible.
  Pixel comparison against the pre-PERF-1 screenshots: 0.02–0.23% of pixels, all inside image
  content (at 640 it was 0.30–0.75%).

- [x] **PERF-2 — priority on the first row.** `priority={idx < 4}` from both grid loops, and
  from both `loading.js` skeleton grids too — they render the same URLs, and a lazy skeleton
  fetch competing with a prioritised real one is the wrong way round.

  `priority` alone was **not enough** in this Next version. In the App Router it only triggers
  a `ReactDOM.preload`, and that preload carries `fetchpriority` only if the caller passed
  `fetchPriority` explicitly — so the first row was preloaded but unprioritised, and the `<img>`
  had no hint at all. `ImageWithLoader` now passes `fetchPriority: 'high'` alongside `priority`.
  Verified in the DOM: on both routes the first four `<img>` carry `fetchpriority="high"` and
  no `loading="lazy"`, exactly four `<link rel="preload" as="image" fetchpriority="high">`
  appear, and every image after the fourth is still `loading="lazy"`.

- [x] **PERF-3 — gate the theme poll.** `ThemeContext` gained a `syncEnabled` switch and a
  `useThemeSync(enabled)` hook; both view clients call `useThemeSync(isOwner && isEditMode)`.
  The provider sits *above* the component that owns edit mode, so the consumer has to tell it
  — the poll cannot work this out for itself. The endpoint now uses a new `getUserTheme(tag)`
  that projects `{ 'dashboard.dashHex', 'dashboard.backHex' }` instead of fetching the whole
  user document for two hex strings, and answers with
  `Cache-Control: public, max-age=10, stale-while-revalidate=30`.

  | | before | after |
  |---|---|---|
  | anonymous visitor, idle 60s | **6** `/api/theme` requests | **0** |
  | owner in view mode, idle 60s | 5 | **0** |
  | owner in **edit mode**, idle 35s | 3 | **3** (unchanged — this is the case the poll is for) |
  | leaving edit mode, idle 30s | — | **0** |

  The "before" figures were taken by temporarily reverting `useThemeSync` to a no-op and the
  default to `true`, i.e. by running the old behaviour, not by reading the old code. Also
  verified: the endpoint still returns both hexes and **only** those two keys, and a colour
  change in one tab still reaches a second tab (`rgb(67, 10, 10)` → `rgb(18, 52, 86)`) through
  the existing `storage` listener, with no polling involved and no database write (the PATCH
  was intercepted).

- [x] **PERF-4 — the colour picker writes on commit, and says so when it fails.** `DashHeader`
  now debounces at **800ms** and flushes immediately on the input's native `change` event —
  a `ColourInput` subscribes to it directly, because React's `onChange` for a colour input is
  the `input` event and never the commit. A pending write is also flushed on unmount so
  navigating away mid-drag cannot lose it.

  | | before (280ms) | after (800ms + commit) |
  |---|---|---|
  | `PATCH /api/user/colours` from a 5s drag | **9** | **1** |

  The drag is simulated the way a hand actually moves — bursts of `input` events ~40ms apart
  with a ~350ms pause between bursts — because a metronome-steady stream never reaches *either*
  debounce and would have flattered the old code. Both numbers come from the same simulation,
  the "before" one measured against the previous commit's `DashHeader`. No request reached the
  database in either run: they were fulfilled at the network layer, and the stored colours are
  byte-identical afterwards.

  The failure path: `queuePersist` was a bare `await fetch(...).catch(() => {})` — the last
  silent mutation in the app. It now checks `res.ok` and reports through the REL-2 toast:
  *"Couldn't save your colours — They still look right here, but the change was not saved. Try
  again."* Verified with the endpoint forced to 500: the toast renders on screen (420×82 at
  510,794 in a 1440×900 viewport, screenshot `perf4-toast.png`), and the header and the picker
  both keep the colour the user chose, which is what the message claims.

  **A real race found while verifying this, and fixed.** `syncFromServer` checked the
  local-edit hold *before* its fetch but not after. In dev the request takes the best part of a
  second, so picking a colour while one was in flight meant the server's answer landed
  afterwards and silently discarded the pick — the header snapped back within 250ms of the
  click. PERF-3 made this easier to hit, because the poll now starts at the moment you enter
  edit mode, which is the moment you reach for the picker. The hold is now re-checked after the
  response arrives. Before the fix the colour reverted in 250ms; after it, it holds for the
  full 6s the test watches. This was only visible because the check asserted on the rendered
  colour rather than on the request count.

- [x] **PERF-5 — `sanitize-html` out of the client bundle.** Both info editors rendered
  `sanitizeRichText(value)` on every render, which pulled the whole library into the critical
  path of every public page view to re-check content the route had already cleaned on write.

  The plan's first option — "trust write-time sanitisation" — is not safe here on its own:
  **four live pages still hold `<div style="…">` in `pageMetaData`**, written before the route
  sanitised, and display-time sanitisation is currently the only thing stripping them.
  So the plan's second option shipped instead: the **server** cleans on the way out.
  `toPublicUser` sanitises `dashboard.infoText`, and the page server component sanitises
  `pageMetaData.infoText1/2` where the client props are built. The editors render the string
  directly.

  The remaining gap was that the editor's local `value` after typing is not what the server
  stores. Both save routes now return the cleaned text and both editors adopt it — but only if
  nothing has been typed since the request went out, so the adoption cannot clobber later
  keystrokes.

  | | before | after |
  |---|---|---|
  | first-load JS, `/[usernameTag]` | 210 kB | **136 kB** (Stage 0 baseline: 208 kB) |
  | first-load JS, `/[usernameTag]/[pageSlug]` | 214 kB | **140 kB** (Stage 0 baseline: 218 kB) |
  | `sanitize-html` in `.next/static/chunks` | present | **absent** |

  The bundle check greps all 16 client chunks for five `sanitize-html` fingerprints
  (`allowedSchemes`, `nonTextTags`, `sanitize-html`, `allowedIframeHostnames`, `srcHandling`) —
  **0 chunks each** — with a control string from the app's own code ("Couldn't save your
  colours") found in a chunk, so the search is known to work.

  Verified in the running app on a scratch page: a deliberately legacy row written straight to
  the database as `<div style="color:red">legacy <b>markup</b></div><script>alert(1)</script><p>tail</p>`
  renders as `legacy <b>markup</b><p>tail</p>` — the script tag and the inline style are gone
  even though nothing in the browser sanitises any more. Typing
  `<p>kept</p><div style="color:red">stripped</div>` into the editor leaves the textarea, the
  status line and the database all reading exactly `<p>kept</p>stripped`. The rich-text
  rendering check from FND-1 still matches the old sanitiser byte for byte (512 characters).

### Stage 4 measurements

| Metric | Before | After |
|---|---|---|
| Dashboard image transfer, mobile viewport (390×844 @3×) | 757.0 kB / 6 requests | **309.2 kB** (−59%) |
| Page image transfer, mobile viewport | 530.4 kB / 8 requests | **211.7 kB** (−60%) |
| First-load JS, `/[usernameTag]` | 210 kB (Stage 0: 208 kB) | **136 kB** (−35%) |
| First-load JS, `/[usernameTag]/[pageSlug]` | 214 kB (Stage 0: 218 kB) | **140 kB** (−36%) |
| `/api/theme` requests in 60s on an idle page (anonymous) | 6 | **0** |
| `/api/theme` requests in 60s on an idle page (owner, view mode) | 5 | **0** |
| `/api/theme` requests in 35s, owner in edit mode | 3 | 3 (deliberately unchanged) |
| `PATCH /api/user/colours` from a 5s colour-picker drag | 9 | **1** |
| Distinct Cloudflare image transforms per image | 1 (the full original) | 2 (960 and 1600) |

### Stage 4 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 21 pass, 0 fail |
| `npm run build` | ✔ compiled first attempt, all 26 routes listed |
| `node scripts/normalize-order.mjs` | 0 corrections |

Stage 4 checks from `STAGES.md`:

- ✔ Every row of the measurements table improved, measured, not asserted.
- ✔ The lightbox opens with no blank frame — at +120ms the blur and the cached 960 are painted
  at opacity 1 while the 1600 is still in flight.
- ✔ Rich text renders identically (byte-for-byte against the previous sanitiser output).
- ✔ Nothing visually regressed: the ten-screenshot set differs from Stage 3 by 0–0.23% of
  pixels, all of it inside image content, none of it in any border, panel, text or colour.

## Stage 5 — Uploads that survive a bad connection

- [x] **UPL-1 — real upload progress.** New `lib/uploadFile.js` wraps `XMLHttpRequest` (which
  exposes `upload.onprogress`; `fetch` does not) in a promise, and owns presigning, retries and
  a concurrency pool. `uploadToStorage({ kind, pageId, body, filename, contentType,
  onProgress })` is what four of the five call sites now use — the presign request itself moved
  in here, so the SEC-4 contract is written once instead of eight times. New
  `components/UploadProgressBar.js` renders the determinate bar (`role="progressbar"`,
  `aria-valuenow`). All five modals converted; **no `signedUrl` or raw `PUT` is left anywhere
  outside `lib/uploadFile.js`**.

  Verified against real R2 with the upload throttled to 150 kB/s and a deliberately
  incompressible 6.26 MB image: **93 samples of `aria-valuenow`**, running
  `0 → 1 → 3 → 4 → … → 98 → 99 → 100`, monotonically non-decreasing, ending at exactly 100.
  The first attempt at this found the bar was **missing entirely from `CreatePageModal`** — the
  edit that added it to the other four had not matched there, and only sampling the DOM caught
  it.

- [x] **UPL-2 — retry with backoff.** Three attempts, 1s then 2s, on network errors and 5xx
  only. A 4xx is a verdict and is never retried (408 and 429 excepted — those status codes ask
  to be retried). A presigned URL is reused for retries inside its 15-minute life and
  re-presigned only past a 13-minute window. Final failure goes through the REL-2 toast, which
  gained an optional action button; a toast carrying an action does not auto-dismiss.

  Verified through the real modal with the R2 `PUT` intercepted:

  | scenario | PUTs | result |
  |---|---|---|
  | 500 on the first attempt only | **2**, 1,013ms apart | upload succeeded, post created |
  | 500 every time | **3**, gaps 1,011ms and 2,006ms | toast *"Couldn't create the post — The upload kept failing (500)"* with a **Try again** button; modal still open; **no post created** |
  | 403 every time | **1** | no retry at all |

- [x] **UPL-3 — parallel bulk upload, a size limit, and no silent drops.** Image processing
  stays sequential (canvas work is main-thread), and the upload phase runs through
  `runWithConcurrency` with 4 in flight. The batch presign route now enforces the **100 MB
  per-file limit** the single-upload route always had, and the modal enforces it client-side.

  | | before | after |
  |---|---|---|
  | 8-image bulk upload, 300ms RTT | 10,842 ms | **4,989 ms** (2.2×) |
  | **20-image** bulk upload, 300ms RTT | **27,904 ms** | **9,063 ms** (3.1×) |
  | peak concurrent PUTs | 1 | 4 |

  Both figures come from the same harness; the "before" was measured with
  `UPLOAD_CONCURRENCY = 1`, i.e. by running the sequential behaviour, not by reading the old
  code. Batch route limits verified directly: 1 KB → 200, 99 MB → 200, 101 MB → **400**, one
  oversize file in an otherwise valid batch → **400**, 51 files → 400, 50 files → 200.

  **Files past the cap are no longer dropped in silence.** Selecting 55 images keeps 50 and
  says *"Not added: 5 over the 50-image limit for one batch."* The message also covers
  non-images, files over 100 MB and duplicates.

  A real defect found here: the message was being built **inside a `setFiles` updater**, which
  React calls twice in development, so it read *"5 over the limit, 5 over the limit"* — and
  `makeUploadItem` was being called in there too, leaking a second object URL per file on every
  selection. That is the same class of bug REL-4 fixed. Both moved out of the updater.

- [x] **UPL-4 — completed work survives a failure.** `useUploadedOnce` caches uploads by the
  `File` object, so a retry after a failed save re-uploads nothing that already landed. The
  four single-file modals keep their form state and stay open on failure. The bulk modal marks
  each file done/failed, keeps a `deliveredRef` of the posts it has already handed over, and
  its submit button becomes **"Retry 1 image"**.

  Verified: failing the third of five bulk uploads leaves **4 marked done, 1 marked failed**,
  the modal open, and **4 posts created** — the successes were not lost. The first pass made 7
  PUTs (4 successes + 3 attempts on the failure). Pressing retry made **exactly 1 PUT** and left
  **5 posts in total**, so nothing was duplicated. In the single-post modal, a create that
  failed three times and was then retried made 1 further PUT and produced exactly one new post.

### All five upload paths, end to end against real R2

On a scratch page created and deleted for the purpose:

| path | result |
|---|---|
| **page create** | page created with thumbnail and blur; progress bar sampled 0 → 100 |
| **page edit** | thumbnail replaced, new file readable (200), **old file deleted (404)** |
| **post create** | photo post created, `content` and `thumbnail` both readable |
| **post edit** | photo post switched to a file post, `.txt` uploaded and readable |
| **bulk** | 3 images → 3 posts, joining the one already there |
| **cascade** | all 6 stored files 200 before the delete, **all 404 after**, all post rows gone |

### Stage 5 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 21 pass, 0 fail |
| `npm run build` | ✔ compiled successfully |
| `node scripts/normalize-order.mjs` | 0 corrections |
| First-load JS | `/[usernameTag]` 136 → **138 kB**, `/[usernameTag]/[pageSlug]` 140 → **143 kB** (the upload helper and progress bar; still 33% below the Stage 0 baseline) |
| Visual regression vs Stage 4 | 8 of 10 screenshots pixel-identical, 2 within the noise floor |

## Stage 5b — Close the orphan race

Added out of band, after Stage 5 and before Stage 6, on the run owner's instruction.
The previous run recorded the defect under "Discovered, not actioned"; it is a real
correctness bug in normal use, so it is now **REL-7** in `IMPROVEMENTS.md` and a stage
of its own in `STAGES.md`.

- [x] **REL-7 — deleting a page must not orphan an in-flight post.** Prevented on both
  sides, then swept. **Prevention first: a sweep alone removes the evidence and leaves
  the mechanism.**

  Three changes, and the ordering between them is the whole fix:

  1. `deletePage` now removes the **`Page` row first**, then collects and deletes the
     posts. It used to clear the posts first, which widened the window rather than
     closing it — a create that had passed its ownership check could insert after the
     cascade had already swept.
  2. `createPost` **re-reads its page after the insert**. If the parent has gone it
     deletes the row it just wrote, deletes the files it was handed through
     `deleteR2Files`, and raises a distinguishable error (`PARENT_PAGE_MISSING`) that
     `POST /api/posts` turns into a **409** rather than an unhandled 500.
  3. `useQueue` **holds a delete until the in-flight creates have drained**. Creates
     run in parallel and deletes serially, in separate lanes, so a delete enqueued
     during an upload burst previously started alongside them rather than behind them.

  Every interleaving is now covered: a create that inserts before the page row goes is
  caught by the cascade; one that inserts after undoes itself; one that has not yet
  inserted fails its own pre-check. (3) stops the request being made at all in the
  common case; (1) and (2) are what hold when the delete comes from a different tab, or
  from a dashboard the user navigated back to while the upload was still running —
  which no client-side ordering can reach.

  **Verified by measuring the before case first**, against real R2 and the real
  database, on private scratch pages created and deleted for the purpose. A page delete
  was fired at nine offsets into an in-flight post create:

  | delete fired at | before the fix | after the fix |
  |---|---|---|
  | 0 ms | no orphan | no orphan |
  | 100 / 200 / 300 / 450 ms | **orphaned post row** (4 of 4) | no orphan |
  | 600 / 800 / 1100 / 1500 ms | no orphan | no orphan |
  | **offsets producing an orphan** | **4 of 9** | **0 of 9** |

  The "before" column is the previous commit's code, reached by stashing the fix, not
  by reading it. Those 4 orphans are the ones the sweep then removed (below).

  With a **real R2 object**, delete fired 300 ms into the create:

  | check | result |
  |---|---|
  | object before | `HEAD 200` |
  | create response | **409** `That page was deleted while the post was being created` |
  | delete response | 200 |
  | post rows left for that page | **0** |
  | object after | **`HEAD 404`** — collected, not merely unreferenced |

  **The client half, in the running app.** A bulk upload of three images on a scratch
  page (three files, so all three occupy create slots and the serial queue is empty),
  then a post delete clicked the moment the first `POST /api/posts` went out:

  | | before the fix | after the fix |
  |---|---|---|
  | delete clicked | 6,040 ms | 5,650 ms |
  | `DELETE` actually sent | 6,039 ms | **10,913 ms** |
  | held back after the click | −1 ms | **5,263 ms** |
  | **creates still in flight when the `DELETE` went out** | **3** | **0** |
  | posts on the page at rest | 4 | 4 |

  Both runs end with the same visible result, which is exactly why this needed the
  request timings rather than a look at the grid.

  **The cleanup half: `scripts/sweep-orphans.mjs`**, dry-run by default, `--commit` to
  apply, following the `normalize-order.mjs` shape. It lists every post whose page no
  longer exists with its stored files and their live HTTP status, and names the owner
  where `Post.userId` is present (CLN-3 adds that field; older rows print
  *"unknown — pre-CLN-3 row"*). Run end to end: dry run found the **4** rows the
  before-case test had just produced and nothing else — all `slug=racing`, all created
  inside the test window, 0 stored files between them — `--commit` deleted 4 rows, and
  the re-run reported **0 orphans across 67 posts and 13 pages**. No pre-existing
  content was touched.

  *Note:* the previous run's throwaway `clean-orphan.mjs` lived in its scratchpad, not
  in `scripts/`, so there was nothing committed to reuse. `scripts/sweep-orphans.mjs`
  is its successor and is now part of the repository.

### Stage 5b gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 21 pass, 0 fail |
| `npm run build` | ✔ compiled first attempt, all 26 routes listed |
| `node scripts/normalize-order.mjs` | 0 corrections |
| `node scripts/sweep-orphans.mjs` | 0 orphans |
| First-load JS | `/[usernameTag]` **138 kB**, `/[usernameTag]/[pageSlug]` **143 kB** — unchanged from Stage 5 |

## Stage 6 — Motion

`app/globals.css` gained the `prefers-reduced-motion: reduce` block first, as `STAGES.md`
requires. It shortens every animation and transition to 0.01ms rather than removing them,
so anything waiting on `animationend` or `transitionend` still fires. The reorder reflow
animates through the Web Animations API, which a CSS media query cannot reach, so
`lib/motion.js` reads the same query in JavaScript — one module owning both the durations
and the question of whether to move at all.

- [x] **MOT-1 — animate the reorder reflow.** New `lib/useFlipReorder.js`: measure, let
  React commit, measure again, animate each card from where it was to where it now is.
  200ms, `cubic-bezier(0.22, 1, 0.36, 1)`. The `flushSync` already in `moveByOffset` (a
  sequencing requirement, not a visual one) is what makes the second measurement available
  immediately. Cards are found by `data-flip-key` on their root element — an attribute
  rather than a wrapper div, so the grid layout it describes is not itself changed.

  Two details that matter: the "before" measurement deliberately includes any transform
  still running, so a card moved again mid-animation continues from where the eye last saw
  it; and running animations are cancelled **before** the "after" measurement, so that
  measurement is layout and not a position part-way through an old move.

- [x] **MOT-2 — modal enter and exit, written once.** `.modal-backdrop` / `.modal-panel` in
  `app/globals.css`, applied by `components/Modal.js`. Keyframes rather than transitions:
  a transition needs its "from" state painted before the class flips, which is a frame of
  guesswork with nothing to gain. Backdrop 150ms fade; panel 180ms fade and scale from 0.98.

  The exit needed more than the shell. The parent unmounts the modal, so `Modal` cannot
  defer its own removal — a new `useModalExit(onClose)` hook holds it for 140ms and each
  modal now closes through `requestClose` instead of calling `onClose` directly. Converted
  in all six. **Verifiable by grep:** `onClose` now appears in each of the six files exactly
  three times — the prop declaration, `useModalExit(onClose)`, and `onClose={requestClose}`
  handing the wrapped close to the shell — and nowhere else. Every button, every
  save-then-close, and the shell's own Escape and backdrop paths go through `requestClose`.

- [x] **MOT-3 — the image reveal is 300ms, not 700ms.** `duration-700` → `duration-300` in
  both branches of `ImageWithLoader`. The dead `.image-loaded` rule and `blur-up` keyframes
  are gone from `app/globals.css` (CLN-1 lists them; they were removed here, where the
  reveal was being tuned anyway).

- [x] **MOT-5 — one request per burst.** The persist step is debounced 300ms per grid and
  sends the final absolute `toIndex`. No server change.

  **The sequence number is bumped on the click, not when the debounce fires.** This is the
  trap the run brief warned about, and it is real: bumping at flush time leaves a window in
  which a response from an earlier burst is still the newest sequence and gets applied over
  state that already reflects later clicks — precisely the stagger the guard exists to
  prevent. The guard is now checked on **both sides of the request**: before it, because a
  newer click may have arrived while the op waited its turn in the queue (sending it would
  write an order nobody is looking at), and after it, because a newer click may have arrived
  while it was in flight. A pending move is also flushed on unmount, so navigating away
  inside the debounce window does not lose it.

  While the debounce is pending the header still reads "Saving…" — `isReorderPending` ORs
  into the queue's own flag, and `enqueue` sets that flag in the same tick the pending flag
  clears, so the indicator does not blink between the two.

### What the browser showed

**Four-place move, posts grid, on a private scratch page of six posts.** The burst runs
inside the page, not over the Playwright wire: four clicks driven from the harness add a
round trip each, which stretches a burst past the debounce and would have tested something
slower than a real one. `moveByOffset` commits with `flushSync`, so the next chevron is in
the DOM by the time `click()` returns.

| | 120ms between clicks | 250ms between clicks |
|---|---|---|
| burst span | 412 ms | 801 ms |
| **reorder requests issued** | **1** | **1** |
| **`toIndex` sent** | **5** (the final position) | **1** (the final position) |
| FLIP animations running after each click | 2, 3, 3, 3 | — |
| their durations | 200ms, every one | — |
| cards carrying a non-identity transform | 2, 3, 3, 3 | — |
| rendered order | `bravo charlie delta echo alpha foxtrot` | back to `alpha … foxtrot` |
| stored order | **identical to rendered** | **identical to rendered** |
| after a full page reload | unchanged | — |

The second burst is the same move in reverse, which returns the page to its starting order —
so the check is a round trip, not a one-way assertion.

**Four-place move, dashboard grid** — the second copy of the same mechanism, in a different
file. Five private scratch pages were appended at positions 7–11 and only moved among
themselves; the six real pages held `1–6` before and after, asserted explicitly. One request,
`toIndex: 7`, FLIP at 200ms on every click, rendered order equal to stored order, unchanged
after a reload. All five scratch pages deleted afterwards.

**Reduced motion** (`reducedMotion: 'reduce'` on the browser context, not a CSS override):

| | normal | reduced |
|---|---|---|
| FLIP animations per click | 2–3 | **0** |
| cards displaced mid-move | 2–3 | **0** |
| modal enter duration | 0.18s panel / 0.15s backdrop | **1e-05s** both |
| modal close | held 140ms, then unmounts | **unmounts immediately** |
| image reveal `transition-duration` | 0.3s | **1e-05s** |
| reorder requests / `toIndex` | 1 / 5 | **1 / 5 — unchanged** |

Reduced motion changes how it looks and nothing about what it does.

**All six modals, sampled on their first DOM mutation** — before the browser has painted a
frame, because a sample taken later cannot tell an animation from a static style:

| check | result |
|---|---|
| panel runs `modal-panel-in` | 6/6 |
| backdrop runs `modal-backdrop-in` | 6/6 |
| panel enter 180ms, backdrop 150ms | 6/6 |
| panel starts at `opacity 0` and `scale(0.98)` | 6/6 |
| **no flash of unstyled content** — panel already carries its own background at first paint | 6/6 |
| focus inside the dialog immediately | 6/6 |
| panel accepts pointer events and is hit-testable immediately | 6/6 |
| on Escape: `data-closing="true"`, `modal-panel-out` + `modal-backdrop-out` running | 6/6 |
| a closing modal takes no further clicks (`pointer-events: none`) | 6/6 |
| unmounted after the exit animation | 6/6 |

**No regression in FND-4.** The Stage 3 modal suite — 66 checks across dialog semantics, the
Tab and Shift-Tab trap, Escape, backdrop click, the body scroll lock, focus restore to the
trigger, and the lightbox's arrow keys — was re-run unchanged against the Stage 6 code and
reports `ALL MODAL CHECKS PASSED`.

- [ ] **MOT-4 — view transitions on navigation. ABANDONED**, on the merits, which
  `STAGES.md` and the run brief both pre-authorise for this item alone. Reverted cleanly:
  `git diff` shows no trace of the attempt in `next.config.mjs` or
  `DashboardViewClient.js`.

  Four findings, three of them observed rather than reasoned:

  1. **The morph this item describes has no destination.** MOT-4 asks for
     `view-transition-name` on the card thumbnail and "the destination page header image".
     `grep` for `page.thumbnail` across `components/page/` and the page route returns
     nothing outside `loading.js`: **the page view never renders the page's own thumbnail
     at all.** There is no element for the card to morph into.
  2. **`loading.js` renders a full skeleton in between**, driven by `routeTransitionCache`.
     Even a generic cross-fade would morph the card into the skeleton rather than the page.
     The plan half-anticipated this — "the existing `routeTransitionCache` snapshots feeding
     `loading.js` already do much of this job".
  3. **The framework path needs a React that is not installed.** `next.config.mjs` accepts
     `experimental.viewTransition: true` and the dev server starts with it enabled, but
     React 19.2.4 stable exports no `unstable_ViewTransition` (`Object.keys(React)` matching
     `/ViewTransition/i` is empty) and Next 15.5.12 ships no view-transition client module.
     Using it means moving a live application onto React's experimental channel.
  4. **The manual path decouples the animation from the navigation.** A real attempt was
     built — `document.startViewTransition(() => router.push(href))` on the card click, with
     `ready` and `finished` instrumented — and driven in Chrome:

     | callback | fired at | `location.pathname` | cards on screen |
     |---|---|---|---|
     | `transition.ready` | **29 ms** | **`/adam-aldridge`** — still the dashboard | 6 (the dashboard's) |
     | `transition.finished` | **306 ms** | `/adam-aldridge/web-projects` | **0** — the page had not rendered its grid |

     `router.push` is asynchronous and the callback returns nothing, so the browser captured
     its "after" snapshot 29ms in, while the dashboard was still on screen. The transition
     animates the dashboard into the dashboard — 300ms of nothing — and the real route change
     lands after it has finished, as an unanimated hard cut. That is the definition of
     fighting the App Router.

  Making this work would mean resolving the transition callback against the route commit,
  which needs framework support that does not exist in these versions. It stays unbuilt, and
  the reasons are recorded so the next attempt starts from the measurement rather than from
  the idea. **The two things it would have needed first** are a thumbnail rendered on the
  page route, and a decision about what `loading.js` should do during a transition.

### Stage 6 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 21 pass, 0 fail |
| `npm run build` | ✔ compiled first attempt, all 26 routes listed |
| `node scripts/normalize-order.mjs` | 0 corrections |
| `node scripts/sweep-orphans.mjs` | 0 orphans |

**First-load JS, re-measured because motion adds JavaScript:**

| Route | Stage 4 | Stage 5 | **Stage 6** | vs Stage 0 |
|---|---|---|---|---|
| `/[usernameTag]` | 136 kB | 138 kB | **139 kB** | 208 kB → −33% |
| `/[usernameTag]/[pageSlug]` | 140 kB | 143 kB | **144 kB** | 218 kB → −34% |

**+1 kB per route** for `lib/motion.js` and `lib/useFlipReorder.js`. The modal transition
and the image reveal cost nothing — both are CSS. Abandoning MOT-4 also avoided the
`experimental.viewTransition` runtime.

Stage 6 checks from `STAGES.md`:

- ✔ Move a card four places: it animates each step (2–3 cards in motion per click, 200ms
  each), no flicker, no layout jump, and the database matches the UI at rest — asserted
  against the stored `order_index`, and again after a full reload.
- ✔ **MOT-5 specifically:** a four-place move issues **exactly one** reorder request with
  `toIndex` equal to the final position. Asserted on the request count and the request body,
  on both grids, in both directions.
- ✔ With `prefers-reduced-motion: reduce` emulated, all motion is instant: zero FLIP
  animations, 1e-05s on every CSS animation and transition, and modals close without the
  140ms hold.
- ✔ Modals open and close smoothly with no flash of unstyled content — the panel already
  carries its own background on its first DOM mutation, in all six.

## Stage 7 — Touch parity

Driven on a real mobile context — 390×844 at 3×, `isMobile`, `hasTouch`, iPhone user
agent — with the browser confirming `(hover: none)` and `(pointer: coarse)` and
`maxTouchPoints = 1`, not a narrow desktop window. Gestures go through CDP
`Input.dispatchTouchEvent`, so they are browser-level touch input rather than
synthesised DOM events. Everything runs on a private scratch page created and deleted
for the purpose.

- [x] **TCH-1 — edit controls at full opacity on a coarse pointer.** A `.touch-controls`
  class on the three control clusters in each card, with `@media (hover: none)` in
  `app/globals.css`. Written as plain CSS rather than a Tailwind variant because it has
  to beat `opacity-70` regardless of the order Tailwind emits its utilities in: the
  doubled class name gives specificity (0,2,0) against a utility's (0,1,0), which wins
  outright without reaching for `!important`.

  **14 control clusters on the page, every one at `opacity: 1`.** On a mouse they are
  still `0.7` and still rise to `1` on hover.

- [x] **TCH-2 — delete arming that resets.** New `lib/useArmedDelete.js`, shared by both
  cards. Disarms on a 3-second timeout, on a pointer down anywhere outside the button,
  and on scroll; the button itself is excluded from the outside-tap rule, or the second
  tap would disarm the state it is meant to act on. The accessible name changes with the
  state, so the second tap's consequence is announced and not merely coloured:
  *"Confirm deleting this post: Doomed"*, and on the dashboard *"Confirm deleting
  "…" and everything in it"*. `aria-pressed` carries the state too.

  **A real defect found here, and it is not the one the plan describes.**
  `IMPROVEMENTS.md` says `onMouseLeave` "never fires on touch", so the armed state
  persists. Measured, with the event stream recorded: in Chrome with touch emulation a
  tap fires `pointerdown(touch) → pointerup(touch) → mousedown → mouseup → click(touch)`
  and then, the instant the finger lifts, `mouseout` and `mouseleave` on the card. So
  the card's `onMouseLeave` disarmed the button **in the same commit that armed it** —
  `aria-pressed` never sampled `true` at all across 25 polls at 30ms. On touch the
  delete could not be armed, ever.

  | | tap | mouse click |
  |---|---|---|
  | `aria-pressed` after the interaction | **`false`** — 25 consecutive samples | `true` |
  | events on the card | … `click(touch)`, `mouseout`, **`mouseleave`** | `click(mouse)`, no leave |

  The fix is to make it a *pointer* event: `onPointerLeave` with a
  `pointerType === 'mouse'` guard. A real mouse leaving the card still disarms; a lifted
  finger does not. Both readings of the original bug are now covered — the plan's
  (armed forever) by the timeout and the two taps, and this one by the guard.

  Verified end to end on touch: one tap arms; it disarms itself after 3s; **it disarms
  on scroll** (asserted only after confirming the document was genuinely 344px taller
  than the viewport and a scroll event actually fired — the first attempt "passed"
  against a page that could not scroll, which proves nothing); it disarms on a tap
  elsewhere; and two taps still delete, `4 posts → 3`.

- [x] **TCH-3 — swipe in the lightbox.** Pointer events on the image area, no gesture
  library. A drag must be clearly horizontal (`|dx| ≥ 1.2 × |dy|`) and then either
  deliberate (≥ 60px) or a flick (≥ 0.35 px/ms and ≥ 24px). `touch-action: pan-y` on
  the image, so vertical panning still belongs to the description scroller underneath.
  A mouse drag is ignored — that is far more likely to be a text selection, and a mouse
  already has the chevrons and the arrow keys. The gesture resolves on a `window`
  listener, so a swipe that ends outside the image still counts.

  | gesture | result |
  |---|---|
  | swipe left across the image | Red one → **Green two** |
  | swipe right | Green two → **Red one**, and on to Blue three and back |
  | a 15px jab | **nothing** — not a swipe |
  | a vertical drag with 18px of sideways drift | **does not navigate**, and scrolls the description `scrollTop 0 → 350` |

- [x] **TCH-4 — the neighbours are already fetched.** An off-screen `Image` at
  `fetchPriority: 'low'` for the previous and next post, keyed on a set so a URL is
  never requested twice. Chosen over `<link rel="preload">`: it populates the same HTTP
  cache, costs nothing in the document head, and does not log *"preloaded but not
  used"* when the lightbox is closed straight away.

  **It asks for exactly what the lightbox will ask for.** The rule for which image a
  post shows is now a single `displayImageFor(item)` helper used by both the current
  post and the preload, and the URL is `buildImageUrl(src, FULL_IMAGE_WIDTH)` — 1600,
  the bucket PERF-1 actually shipped, read from `lib/cloudflareLoader.js` rather than
  rebuilt by hand.

  Verified on a throttled connection (400 kbps, 300ms latency) with **byte-level
  accounting through CDP**, because `performance.getEntriesByName` cannot answer this:
  the images are cross-origin without `Timing-Allow-Origin`, so `transferSize` reads 0
  for everything, cache hit or not. The first attempt at this check was measuring
  nothing.

  | | result |
  |---|---|
  | `width=1600` requests while photo 1 is on screen | **2** — the current photo and its one neighbour |
  | requests for photo 2's URL, total | 2 |
  | of those, going to the network | **1** (489 bytes) |
  | the other | **0 bytes** — the preload, reused |
  | photo 2 when it appeared | `complete`, `naturalWidth 64`, `opacity 1` — **no blank frame** |

- [x] **TCH-5 — 44px hit targets, nothing drawn differently.** A `.touch-target` class
  with a transparent `::after` under `@media (pointer: coarse)`, sized
  `max(100%, 44px)` so a control already larger than 44px keeps its own size. The
  pseudo-element belongs to the button, so a tap inside it is a tap on the button.

  | | on touch | on a mouse |
  |---|---|---|
  | controls measured | 14 | 14 |
  | drawn size | **32×32** | **32×32** — unchanged |
  | hit area | **44px × 44px** | `::after` content is `none` — the rule does not apply |
  | a tap 21px off-centre, in each of 4 directions | **lands on the control, 4/4, every control** | — |

### Stage 7 gate

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `node --test lib/*.test.mjs` | 21 pass, 0 fail |
| `npm run build` | ✔ compiled first attempt |
| `node scripts/normalize-order.mjs` | 0 corrections |
| `node scripts/sweep-orphans.mjs` | 0 orphans |
| First-load JS | `/[usernameTag]` **139 kB** (unchanged), `/[usernameTag]/[pageSlug]` 144 → **145 kB** (the swipe and preload logic) |

Stage 7 checks from `STAGES.md`:

- ✔ Edit mode: every control fully visible without hovering, all ≥44px — measured, both.
- ✔ Arm delete, wait 3s → disarmed. Arm, scroll → disarmed. Arm, tap elsewhere →
  disarmed. And two taps still delete.
- ✔ Swipe left/right moves between posts; the description still scrolls vertically.
- ✔ On a throttled connection, moving to the next photo shows it with no blank frame,
  and the preload is reused rather than duplicated — proven in bytes, not in timings.

**Desktop regression check**, separately: controls still hover-revealed at `0.7`, still
drawn 32×32, no hit-target pseudo element, a mouse click still arms, moving the mouse off
the card still disarms, and hovering still brings the controls to full opacity.

## Discovered, not actioned

- **`tailwind.config.js` did not scan `context/`** — found via REL-2, fixed there because the
  toast was unstyled without it. Flagging it because it silently drops classes rather than
  failing: any future component under `context/` would have hit the same wall.
- **Three mutation paths still report failures only inline, not through the toast system:**
  the display-name editor (`TitleEdit` → `/api/user/title`), the colour pickers
  (`DashHeader` → `/api/user/colours`, which ignores the response entirely), and the two info
  editors (`/api/pages/[pageId]/meta`, `/api/user/dashboard`). The info editors and `TitleEdit`
  do show their own error state, so they are not silent; **the colour picker genuinely is** —
  `await fetch(...)` with no status check and no error path. Out of REL-2's stated scope
  (`useQueue` call sites), so left alone. PERF-4 touches that exact function in Stage 4 and
  would be the natural place to fix it.
- **`app/api/storage/upload-batch` has no `fileSize` check**, unlike the single-upload route.
  Fifty files of any size can be presigned. Not in any item's scope; UPL-3 is the natural place.
- **The bulk upload modal ignores `MAX_BATCH`** beyond slicing to 50 — files 51+ are silently
  dropped from the batch with no message. Adjacent to UPL-3/UPL-4.
- **`getUserById` still returns the whole user document** including `passwordHash`. Nothing
  currently passes its result to a client component, so it is not an exposure today; SEC-1
  only hardened `getUserByUsernameTag`, which was the one that leaked.
- ~~**`PageInfoEditor` renders only `infoText2`.**~~ **Resolved — not a defect.** The run
  owner has confirmed `pageMetaData.infoText1` is **reserved for a planned feature**. It is
  stored on 8 of the 13 live pages and rendered nowhere on purpose. The field, its route and
  data-layer plumbing, and its stored values stay exactly as they are: not surfaced, not
  migrated, not merged into `infoText2`, not removed. Recorded in the "Deliberately out of
  scope" table in `IMPROVEMENTS.md` and called out in `STAGES.md` under CLN-1 so a future
  dead-code pass does not mistake it for an oversight.
- **The dashboard info editor's read-only branch is unreachable in the current data.** It only
  renders when the viewer is not in edit mode *and* `dashboard.infoText` has visible content,
  and no account has any. Noted because it means that code path is untested by any browser
  check in this run.
- ~~**Deleting a page while creates are still in flight can orphan a post.**~~ **Actioned —
  this is now REL-7, done in Stage 5b above.** Raised as a real defect in normal use rather
  than a test artefact, and closed by preventing the race on both the client and the server
  rather than by sweeping after it. The sweep exists as the cleanup half only.
- **`javascript-creations` holds 30 posts** — the largest page in the database and a useful
  target for the PERF-1 measurement if it is repeated later; the pages measured in Stage 4 have
  6–8.

## Decisions and deviations

- **PERF-1's card bucket is 960, not 640.** `IMPROVEMENTS.md` names 640; measurement showed it
  is visibly soft on a retina desktop because the cards are `object-cover` 4:3 crops of 16:9
  sources. Raised with the run owner with both sets of numbers and 960 was chosen. Still two
  buckets, still fixed, still chosen by the call site — only the number changed. See PERF-1.
- **PERF-5 sanitises on the server rather than trusting write-time sanitisation alone**, which
  is the second of the two options `IMPROVEMENTS.md` offers. Four live rows predate the route's
  sanitiser and display-time cleaning is currently the only thing stripping them.
- **PERF-2 also sets `fetchPriority: 'high'`**, not just `priority`. In this version of Next
  `priority` alone yields a preload with no priority hint at all; the item's "Done when" asks
  for `fetchpriority="high"`, which needs the explicit prop.

- **Committed the inherited working tree first.** The page-ordering fix described in
  `IMPROVEMENTS.md` → "Context: what already happened" was present but uncommitted. It is
  now commit 1 on `hardening` (`Inherited: page ordering fix (uncommitted work from main)`),
  with no changes of my own mixed in, so `Stage 1:` and `Stage 2:` are clean diffs.

## For Stages 6–9 — what the plan should say differently

Written at the end of the Stage 3–5 run, for whoever picks up Stage 6.

- **MOT-2 has its shell.** `components/Modal.js` owns the backdrop and the panel, and every
  modal now passes its classes in. The enter/exit transition goes in that one file, and the
  `prefers-reduced-motion` guard with it.
- **MOT-3's target has moved.** The 700ms reveal is still in `ImageWithLoader`, but the images
  it reveals are now 960-wide transforms rather than full originals, so they decode faster and
  the reveal is a larger share of the perceived delay than the plan assumed.
- **TCH-4 must preload `buildImageUrl(src, FULL_IMAGE_WIDTH)`** — the exact URL
  `PhotoShowModal` requests. `lib/cloudflareLoader.js` exports it; do not rebuild the URL by
  hand or the preload will miss.
- **TCH-5 (44px hit targets) will touch `ColourInput`** in `DashHeader`, which is now a
  component rather than two inline `<input type="color">` pairs.
- **LNK-4 has its luminance helper**: `getLuminance`, `mixHex` and `normalizeHex` are exported
  from `lib/colour.js`, with `FALLBACK_HEX` and `DEFAULT_INFO_BACKGROUND_HEX` named.
- **LNK-1's OpenGraph image should ask for a specific bucket.** Social scrapers want roughly
  1200px; `FULL_IMAGE_WIDTH` (1600) is the closer of the two, and adding a third bucket for
  OpenGraph is a real cost decision, not a detail.
- **CLN-1 must not delete `lib/sanitize.js`'s only client consumer without checking**:
  `PostFileModal` is still the dead file the plan says it is, and nothing imports it, so it is
  safe to delete — but it is now the *only* thing that would pull `sanitize-html` back into the
  client bundle, so deleting it protects PERF-5.
- **CLN-3 is worth more than the plan implies.** `userId` on `Post` would let an orphan sweep
  exist at all; see the orphaned-post race under "Discovered, not actioned".
- **CLN-4 should cover `lib/uploadFile.js`.** `isRetryableStatus` and `runWithConcurrency` are
  pure and testable under plain node, and the retry policy is the kind of rule that decays
  silently.
- **STAGES.md's Stage 4 measurements table has been filled in above** with real numbers, and
  its "fourth reset request" line has been corrected to "sixth" to match the budgets SEC-8
  actually shipped.

## Verification limits accepted in this run

The run brief restricts database writes to two pre-authorised operations
(`scripts/normalize-order.mjs --commit`, and clearing the rate-limit collection). Items
whose textbook verification would create or delete real records are verified as far as
that allows; each is recorded explicitly against its item below rather than being claimed
as fully done.

## New environment variables

(Names and purposes only — never values. Set these in production.)

- **`ADMIN_USER_IDS`** — comma-separated list of MongoDB user ids allowed to load `/admin`.
  Anyone else, signed in or not, gets a 404. **If it is unset in production, `/admin` is
  closed to everyone**, which is the safe default but means you must set it to keep your own
  access. The value is the `_id` of the account(s) you want to admit; it is set in the
  gitignored `.env.local` for local verification and is not recorded here or in any commit.
