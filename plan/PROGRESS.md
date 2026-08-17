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

## Discovered, not actioned

## Decisions and deviations

- **Committed the inherited working tree first.** The page-ordering fix described in
  `IMPROVEMENTS.md` → "Context: what already happened" was present but uncommitted. It is
  now commit 1 on `hardening` (`Inherited: page ordering fix (uncommitted work from main)`),
  with no changes of my own mixed in, so `Stage 1:` and `Stage 2:` are clean diffs.

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
