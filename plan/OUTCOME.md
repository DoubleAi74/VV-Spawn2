# Outcome — Volvox Works hardening

Branch `hardening`, cut from `main` at `ea7624d`. **Nothing pushed, nothing merged, no
pull request opened.** Twelve commits, 97 files, +10,144 / −2,430.

Nine stages plus one added out of band. Forty-four planned items: **43 shipped, 1
abandoned on its merits**, plus one new item raised and closed during the run.

`PROGRESS.md` is the detailed log — every item, with the evidence. This file is the
summary and the handover.

---

## What shipped

| Stage | Commit | Items |
|---|---|---|
| 1 — Lock it down | `a3ee791` | SEC-1 … SEC-10 |
| 2 — Make failure visible | `2b65182` | REL-1 … REL-6 |
| 3 — Shared foundations | `f4fed3d` | FND-1 … FND-4 |
| 4 — Cut the weight | `004d53d` | PERF-1 … PERF-5 |
| 5 — Uploads that survive a bad connection | `4f78e42` | UPL-1 … UPL-4 |
| **5b — Close the orphan race** | `4c763de` | **REL-7 (new)** |
| 6 — Motion | `aba4172` | MOT-1, MOT-2, MOT-3, MOT-5 · **MOT-4 abandoned** |
| 7 — Touch parity | `43473ec` | TCH-1 … TCH-5 |
| 8 — Links that work | `7a85156` | LNK-1 … LNK-5 |
| 9 — Cleanup and tests | `f8d1050` | CLN-1 … CLN-4 |

### Security (Stage 1)

Password hashes, `firebaseUid` and the owner's email address were readable in view-source
on **every public profile and page**; a `toPublicUser` projection is now the only shape of
a user that crosses into a client component. The storage delete endpoint accepted any URL
from any signed-in user — it resolves ownership first and answers 403 otherwise. The blur
endpoint was unauthenticated and, after five failed CDN attempts, fetched and returned
*any URL the server could reach* — it now needs a session and an origin match, and the raw
fallback is gone. Upload keys are derived server-side from the authenticated user and a
verified page rather than from a client-supplied `folder`. `/admin`, which listed every
account, is gated on `ADMIN_USER_IDS` and 404s for everyone else. Plus reserved usernames,
an 8-character minimum and one bcrypt cost across both password paths, rate limiting on
all four auth routes, URL-scheme validation on link posts, and security headers.

### Reliability (Stages 2 and 5b)

A rejected Mongo connection promise stayed cached forever, so one blip took the instance
down until redeploy. Every failed mutation used to roll back in silence — indistinguishable
from data loss — and now goes through a toast that says what failed and what happened to
the change. Error boundaries with a retry that actually re-runs the server component.
Page deletion batches its R2 deletes instead of making one round trip per file.

**REL-7**, raised during this run: deleting a page while a post create was in flight left
a post row with no page and an R2 object nothing would ever collect. Closed on both sides
— `deletePage` removes the parent row before the cascade, `createPost` re-reads its page
after the insert and undoes itself if the parent has gone, and the client queue holds
deletes until in-flight creates drain. `scripts/sweep-orphans.mjs` is the cleanup half.

### Performance (Stage 4)

Every grid card downloaded the full 1920px original. Two fixed width buckets — 960 for
cards, 1600 for the lightbox — cut mobile image transfer by about 60%. The theme endpoint
was polled every ten seconds by every visitor forever; it now runs only for the owner in
edit mode. The colour picker wrote on every drag frame. `sanitize-html` was in the
critical path of every public page view, re-checking content the server had already
cleaned.

### Uploads (Stage 5)

Real progress bars, three attempts with backoff on the failures worth retrying, four
parallel uploads in bulk, and a failure that keeps the modal open with the completed work
marked done.

### Motion, touch and links (Stages 6–8)

Reorder animates and coalesces a burst into one request. Modals fade and scale in and out.
Edit controls are usable on a phone: full opacity without hover, 44px hit targets, delete
arming that resets. Swipe in the lightbox, with the next photo already fetched. Every page
previews as itself when shared, renamed URLs keep working through a 308, and no theme
colour can make the title or the focus ring invisible.

---

## Reverted after delivery

**MOT-1 (reorder animation) and MOT-5 (reorder coalescing)** were backed out on 18 Aug
after the owner tested the merged result.

MOT-1 was a preference: the reflow animation was not wanted.

MOT-5 was a defect. The debounce held a single `pendingReorderRef` slot, so a second
move on a *different* card inside the 300 ms window overwrote the first — the earlier
card's request was never sent, and the later card's `toIndex` had been computed against
a local arrangement the server never received. The symptoms were cards snapping back to
their previous positions, or settling on intermediate ones. Per-click requests are
restored: chattier, and correct.

Verified with two browser scenarios asserting rendered order equals stored order — two
different cards 80 ms apart, and one card moved four places 40 ms apart. Both pass.

## What was abandoned

**MOT-4 — view transitions on navigation.** The only item the plan pre-authorised for
abandonment on its merits. Attempted, measured, reverted cleanly; `next.config.mjs` and
`DashboardViewClient.js` carry no trace of it. Four reasons, three of them observed:

1. **The morph it describes has no destination.** MOT-4 asks for a `view-transition-name`
   on the card thumbnail and "the destination page header image". The page view **never
   renders the page's own thumbnail** — `grep` for `page.thumbnail` across the page
   components and route returns nothing outside `loading.js`.
2. **`loading.js` renders a full skeleton in between**, so even a generic cross-fade would
   morph the card into a skeleton rather than the page.
3. **The framework path needs a React that is not installed.** `experimental.viewTransition`
   is accepted by Next 15.5.12 and the dev server starts with it on, but React 19.2.4
   stable exports no `unstable_ViewTransition` and Next ships no view-transition client
   module. Using it means moving a live application onto React's experimental channel.
4. **The manual path decouples the animation from the navigation.** With
   `document.startViewTransition(() => router.push(href))` instrumented and driven in
   Chrome: `ready` fired at **29 ms with the dashboard still on screen** and
   `finished` at **306 ms with the destination not yet rendered**. The transition animates
   the dashboard into the dashboard, and the real route change lands afterwards as an
   unanimated hard cut.

Making it work needs the transition callback resolved against the route commit, which is
framework support that does not exist in these versions. **What it would need first:** a
thumbnail rendered somewhere on the page route, and a decision about what `loading.js`
should show during a transition.

---

## Measurements, before and after

Every figure measured, not estimated. Where a "before" is quoted it was produced by
running the old code — usually by stashing the fix — not by reading it.

### Bundle size

| Route | Stage 0 | Final | Change |
|---|---|---|---|
| `/[usernameTag]` | 208 kB | **141 kB** | **−32%** |
| `/[usernameTag]/[pageSlug]` | 218 kB | **145 kB** | **−33%** |
| shared by all | 103 kB | 103 kB | — |

*A clean checkout of the branch builds at 140 kB / 144 kB — the shared chunk lands either
side of the 102.5 kB rounding boundary depending on the build path. Same source, ±1 kB.*

The trajectory: 208/218 at Stage 0 → 210/219 after the toast system → 210/214 after the
shared extractions → **136/140 after Stage 4** → 138/143 with the upload helper → 139/144
with motion → 141/145 with metadata and touch. Stage 4 did the work; everything since has
added about 5 kB of function back.

### Network and cost

| Metric | Before | After |
|---|---|---|
| Dashboard image transfer, mobile (390×844 @3×) | 757.0 kB / 6 requests | **309.2 kB** (−59%) |
| Page image transfer, mobile | 530.4 kB / 8 requests | **211.7 kB** (−60%) |
| `/api/theme` requests, 60s idle, anonymous | 6 | **0** |
| `/api/theme` requests, 60s idle, owner in view mode | 5 | **0** |
| `/api/theme` requests, 35s, owner in edit mode | 3 | 3 (deliberately unchanged) |
| `PATCH /api/user/colours` from a 5s picker drag | 9 | **1** |
| Reorder requests for a four-place move | 4 | **1** |
| Distinct Cloudflare transforms per image | 1 (the full original) | 2 (960 and 1600) |

### Speed

| Metric | Before | After |
|---|---|---|
| 8-image bulk upload, 300ms RTT | 10,842 ms | **4,989 ms** (2.2×) |
| 20-image bulk upload, 300ms RTT | 27,904 ms | **9,063 ms** (3.1×) |
| Peak concurrent uploads | 1 | 4 |
| Image reveal | 700 ms | **300 ms** |

### Correctness

| Check | Before | After |
|---|---|---|
| Page delete racing a post create, 9 offsets | **4 of 9 orphaned a post** | **0 of 9** |
| Delete overtaking in-flight creates (client) | 3 creates still on the wire | **0** |
| `/{tag that never existed}` | **200** (soft 404) | **404** |
| `/{tag}/{slug that never existed}` | **200** | **404** |
| `/{renamed tag}` | **200**, wrong address | **308** to the new one |
| `/{tag}/{renamed slug}` | **200**, wrong address | **308** to the new one |
| `/{old tag}/{old slug}` | **200** | **308**, canonical, one hop |
| Delete arming on touch | could not be armed at all | arms; disarms on 3s, scroll, outside tap |
| Header title contrast, white on white | invisible | **17.74:1** |
| Header title contrast, black on black | invisible | **20.07:1** |
| Focus ring against a dark theme | invisible (`#2d3e50` hardcoded) | **20.07:1** |
| Edit-control hit target on touch | 32×32 | **44×44**, visual size unchanged |
| Edit controls on a coarse pointer | permanently at 70% opacity | **100%**, all 14 clusters |
| `sanitize-html` in the client bundle | present | **0 of 16 chunks** |
| Posts carrying `userId` | 0 of 67 | **67 of 67** |
| Unit tests | 9 | **61** |
| Console errors on a full click-through | — | **0 errors, 0 warnings** |

---

## Defects found by verification that the plan did not know about

Seven. Every one was found by driving the running application; none was visible by reading
the code, and several had been live for some time.

1. **`notFound()` and `permanentRedirect()` could not set a status.** `loading.js` opens a
   Suspense boundary, and React flushes the response shell — status line included — the
   moment anything inside suspends. Both public routes are `force-dynamic` and await a
   session and a database read, so they always suspend. **Every unknown profile answered
   200 with the not-found body.** Measured against a production build, isolated by
   comparison with an identical route outside the segment. Fixed by moving the decision
   above the boundary, into two new layouts, and turning the dashboard's `loading.js` into
   a Suspense fallback inside the page. This invalidated all of Stage 8 until it was fixed.
2. **Delete could not be armed on a touch device.** The plan says `onMouseLeave` "never
   fires on touch", so the armed state persists. Measured, with the event stream recorded:
   a tap fires the compatibility mouse sequence *and then* `mouseleave` the instant the
   finger lifts, so the card's `onMouseLeave` disarmed the button in the same commit that
   armed it. `aria-pressed` never sampled `true` across 25 polls. Fixed with
   `onPointerLeave` guarded on `pointerType`.
3. **A guard checked before an await but not after** in the theme sync, silently discarding
   a colour chosen mid-request. (Stage 4.)
4. **`priority` alone emits no `fetchpriority`** in this Next version — the first row was
   preloaded but unprioritised. (Stage 4.)
5. **A progress bar missing from one of five modals** — the edit that added it had not
   matched in `CreatePageModal`. Caught only by sampling the DOM. (Stage 5.)
6. **State built inside a `setState` updater**, which React's dev double-invoke ran twice:
   duplicated text and a leaked object URL per file. (Stage 5.)
7. **`readableInkOn` fell just short of WCAG AA on saturated backgrounds** — 4.44:1 on pure
   red, where true black is 5.25:1. Found by the new contrast sweep in Stage 9, which
   walks the whole grey ramp and the primaries.

Plus two from the previous run's own verification that this run inherited and closed:
the orphaned-post race (REL-7) and the `tailwind.config.js` content globs.

---

## The reserved field

**`pageMetaData.infoText1` is stored on 8 of the 13 live pages and rendered nowhere. This
is deliberate — the owner is reserving the field for a planned feature.**

It was previously recorded as a possible oversight. It is not one, and it is now written
down in three places so no future pass mistakes it for dead weight:

- `IMPROVEMENTS.md` → "Deliberately out of scope", alongside the other declined items.
- `STAGES.md` → under CLN-1, where a dead-code sweep would be most likely to reach for it.
- `PROGRESS.md` → the entry that previously flagged it, now corrected.

**Nothing about it was changed.** The schema field, `updatePageMeta`, the
`PATCH /api/pages/[pageId]/meta` route, the server-side sanitising in the page route, and
the prop passed into `PageInfoEditor` are all exactly as they were. Do not surface it,
migrate it, merge it into `infoText2`, or remove it.

---

## Environment variables

Two, both documented by name and purpose only. Neither value appears in any commit.

**`ADMIN_USER_IDS`** — **required in production.** A comma-separated list of MongoDB user
ids permitted to load `/admin`. Anyone else, signed in or not, gets a 404. **If it is
unset, `/admin` is closed to everyone** — the safe default, but it means you must set it
to keep your own access. The value is the `_id` of the account(s) to admit.

**`NEXT_PUBLIC_SITE_URL`** — **optional.** The site's public origin, used for absolute
OpenGraph and canonical URLs and for the `sitemap.xml` entries and the `Sitemap:` line in
`robots.txt`. It falls back to `NEXTAUTH_URL`, which is already the canonical origin for
the deployment, and then to `http://localhost:3000`. Set it only if the public origin ever
differs from `NEXTAUTH_URL`. A wrong value does not break the app; it makes every shared
link preview point at the wrong host.

### Schema changes

Three fields, all additive, none required, all within the plan's stated limits:

- `Post.userId` — indexed, set on create, **backfilled: 67 of 67 rows, 0 modified**.
- `Page.previousSlugs: [String]` — indexed with `userId`, empty by default.
- `User.previousTags: [String]` — indexed, empty by default.

Two new indexes for the redirect lookups: `{ userId: 1, previousSlugs: 1 }` on `Page` and
`{ previousTags: 1 }` on `User`. Both will build on first connect.

### New scripts

All four follow the `normalize-order.mjs` pattern: dry run by default, `--commit` to apply.

| Script | Purpose |
|---|---|
| `scripts/sweep-orphans.mjs` | Posts whose page no longer exists, and their R2 objects. The cleanup half of REL-7. |
| `scripts/backfill-post-user.mjs` | Fills `Post.userId` from the page's owner. Purely additive; refuses to change a value that disagrees. |
| `scripts/delete-user.mjs` | Removes one account and everything it owns. Requires `--email`, never a pattern. The only way to delete an account at all. |
| `scripts/clear-rate-limits.mjs` | Inherited from Stage 1; unlocks a throttled address. |

---

## Deferred

Nothing was silently dropped. These are the things known to be outstanding.

**Carried from the plan's own "Deliberately out of scope" table** — considered and
declined, not forgotten: a unique index on `{ userId, order_index }`, media quality work
(the width/height `processImageForUpload` computes and throws away), delete confirmations
or undo, drag-to-reorder, pagination, a test framework, rewriting the optimistic queue,
`scripts/migrate.mjs`, and now `pageMetaData.infoText1`.

**Left outstanding deliberately during the run:**

- **A full Content-Security-Policy.** SEC-10 shipped `frame-ancestors`, `X-Frame-Options`,
  `nosniff` and `Referrer-Policy`. A real `script-src`/`style-src` policy needs
  `'unsafe-inline'` for styles at minimum (Quill injects them) and a nonce strategy for
  scripts, and the app renders user rich text through `dangerouslySetInnerHTML` in four
  places. More than that stage should have changed blind.
- **`getUserById` still returns the whole user document**, `passwordHash` included. Nothing
  passes its result to a client component today, so it is not an exposure — but SEC-1 only
  hardened the function that was leaking.
- **Three mutation paths still report failures inline rather than through the toast
  system:** the display-name editor and the two info editors. All three do show their own
  error state, so none is silent. The colour picker, which genuinely was silent, was fixed
  in PERF-4.
- **`DashboardInfoEditor`'s read-only branch is unreachable in the current data** — no
  account has visible `dashboard.infoText` — so no browser check in this run exercised it.
- **HEIC upload was never exercised end to end.** SEC-3 verified the blur path it depends
  on, but not an actual HEIC file.

---

## What I would do next

1. **Set `ADMIN_USER_IDS` in production before deploying.** Without it `/admin` is closed
   to everyone, including you.
2. **Watch `scripts/sweep-orphans.mjs`.** Run it once a week for a month. It should report
   zero every time; if it does not, the race has another door and the sweep will name the
   owner of every row it finds.
3. **Finish the CSP.** It is the one security item that shipped partial, and it is the
   second line behind the sanitiser on four `dangerouslySetInnerHTML` call sites. A nonce
   on the App Router plus `style-src 'unsafe-inline'` is the shape; the blocker was time
   to test it against Quill, not difficulty.
4. **Give the page route a header image.** It is the missing half of MOT-4, and it would
   also give the page's own OpenGraph card something better than the page thumbnail —
   two items unblocked by one small piece of design.
5. **Test something end to end that this run could not**: a real HEIC upload, and the
   magic-link and password-reset flows through actual delivered mail. Both were exercised
   to the point where they would send, and no further.
6. **Consider persisting the dimensions `processImageForUpload` already computes.** It is
   on the declined list, but it is the cheapest remaining quality win: all five call sites
   compute width and height and throw them away, and having them would let the grid drop
   its fixed `aspect-[4/3]` crop.

---

## Final verification

Run from a **clean `git clone` of the branch**, not the working tree:

| Check | Result |
|---|---|
| `npx next lint` | ✔ No ESLint warnings or errors |
| `npm test` | **61 pass, 0 fail** |
| `npm run build` | ✔ compiled first attempt, all 27 routes listed |
| `node scripts/normalize-order.mjs` | 0 corrections |
| `node scripts/sweep-orphans.mjs` | 0 orphans |
| `node scripts/backfill-post-user.mjs` | 0 remaining |

The working tree is clean and every stage is committed. **Nothing has been pushed, merged,
or opened as a pull request.**
