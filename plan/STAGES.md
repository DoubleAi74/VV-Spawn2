# Volvox Works — Staged Work Breakdown

The running order. Every item ID here (`SEC-1`, `REL-2`, …) is described in full in
`IMPROVEMENTS.md` — read the item there before implementing it.

Nine stages. Work them in order. Do not start a stage until the previous stage's
exit criteria are met and committed.

---

## How to use this document

- **One stage at a time.** Each stage ends at a green verification gate and a commit.
- **One item at a time within a stage**, unless the stage explicitly marks items as
  safe to parallelise.
- **Update `plan/PROGRESS.md` after every item** — create it on first use. One line
  per item: ID, status, date, and anything the next agent needs to know. This file
  is the handover if your context runs out.
- **If an item turns out to be wrong**, stop and say so rather than implementing
  something adjacent. The plan is a hypothesis about a codebase, not a contract.

### Why this order

Security first: those are live exposures and each fix is small and independent.
Reliability second, because the toast surface and error boundaries make every later
stage observable when it breaks — without them you are changing image loading and
caching behaviour blind. Shared foundations third, because Stages 4–8 would
otherwise edit the same duplicated code five times over. Then the user-facing work,
heaviest first. Cleanup last, because it is the least urgent and the most
disruptive to review alongside behavioural change.

### The verification gate

Run this after **every** stage. It must be fully green before you commit.

```bash
npx next lint                      # expect: no warnings or errors
node --test lib/*.test.mjs         # expect: all pass
npm run build                      # expect: compiles, all routes listed
node scripts/normalize-order.mjs   # expect: 0 corrections (dry run, no --commit)
```

If `npm run build` fails once with `Failed to collect page data`, retry it. That is
the `connectDB` bug in [REL-1] and is expected until Stage 2 lands. Note it in
`PROGRESS.md`; do not treat it as your regression.

Stages that change UI additionally need a browser check — see the recipe in
`AGENT.md` under "Driving the real app".

### Git protocol

- Work on a branch: `git checkout -b hardening` at the start.
- One commit per stage, message `Stage N: <title>` plus a bulleted body listing the
  item IDs.
- **Never push. Never force. Never commit to `main`.**
- If a stage produces a change you are unsure about, commit it anyway on the branch
  and flag it in `PROGRESS.md` — a reviewable commit is better than an unrecorded
  decision.

### Database protocol

- **Reads are free.** Query freely to understand real data shapes.
- **Any write goes through a script in `scripts/`, dry-run by default, `--commit` to
  apply.** Follow the shape of `scripts/normalize-order.mjs`.
- **Show the dry-run output and get confirmation before running with `--commit`.**
- Never write directly from an ad-hoc one-liner.
- If a test mutates data, snapshot the original state first and restore it at the
  end, even on failure.

---

## Stage 0 — Orientation

No code changes. Produces the shared understanding the rest depends on.

1. Read `AGENT.md`, then this file, then `IMPROVEMENTS.md` in full.
2. Read `IMPROVEMENTS.md` → "Context: what already happened". The page-ordering bug
   is **already fixed**. Do not redo it. Do not refactor `lib/ordering.js`,
   `movePageToIndex`, `movePostToIndex` or the reorder routes except where an item
   explicitly says to.
3. Run the verification gate to establish a clean baseline. Record the results in
   `PROGRESS.md`, including the current first-load JS numbers from `npm run build`
   for `/[usernameTag]` and `/[usernameTag]/[pageSlug]` — Stage 4 is measured
   against these.
4. Start the dev server and click through as an owner: dashboard, a page, edit mode,
   reorder a card, open the lightbox, open each modal. You are looking for anything
   that contradicts the plan.
5. Confirm you can drive the app in a browser using the recipe in `AGENT.md`. If you
   cannot, say so now — several stages depend on it.

**Exit:** baseline recorded in `PROGRESS.md`, browser harness working, no code changed.

---

## Stage 1 — Lock it down

**Items:** SEC-1 · SEC-2 · SEC-3 · SEC-4 · SEC-5 · SEC-6 · SEC-7 · SEC-8 · SEC-9 · SEC-10
**Depends on:** Stage 0.

The first three are live, exploitable, and independent. Do them first and in order.

1. **SEC-1** — Before changing anything, load a profile logged out and confirm
   `passwordHash` appears in view-source. Then add a projection so only public fields
   reach the client, with `email` gated on `isOwner`. Re-check view-source.
2. **SEC-2** — Add an ownership check to the storage delete route. Verify by
   attempting a cross-account delete; expect 403 and a surviving file.
3. **SEC-3** — Require a session and an origin allowlist on `/api/generate-blur`;
   remove the raw fallback fetch; reduce the retry budget. Verify a HEIC upload still
   produces a blur placeholder.
4. **SEC-4** — Derive upload key prefixes server-side from the authenticated user and
   a verified page. Re-test all five upload paths.
5. **SEC-5** — Gate `/admin` on an env-configured identity; non-matching visitors get
   `notFound()`. Document the new environment variable in `PROGRESS.md`. Do not
   commit its value.
6. **SEC-6** — Reserved username list in `uniqueUsernameTag`, with a unit test.
7. **SEC-7** — Minimum password length on both server paths, one shared bcrypt cost
   constant, client-side hint.
8. **SEC-8** — Rate limiting: `lib/models/RateLimit.js` with a TTL index,
   `lib/rateLimit.js`, applied to the four auth routes, 429 surfaced in the login UI.
9. **SEC-9** — Scheme validation for URL posts.
10. **SEC-10** — Security headers in `next.config.mjs`. Verify the Quill editor and
    blur placeholders still work before adding a CSP; if CSP proves fiddly, ship the
    other headers and note CSP as outstanding.

**Safe to parallelise:** none. SEC-1 and SEC-6 both touch `lib/data.js`; SEC-2 and
SEC-4 both touch the storage routes; SEC-7 and SEC-8 both touch the auth routes.
Sequential is faster than resolving the conflicts.

**Verification.** Gate, plus:
- Logged-out view-source on a profile: no `passwordHash`, no `firebaseUid`, no email.
- Cross-account file delete: 403.
- Unauthenticated `/api/generate-blur`: 401. Off-origin URL when authenticated: 400.
- `/admin` logged out: 404. As the configured admin: renders.
- Sixth reset request for one address inside the window: 429, no email sent. (Written
  as "fourth" originally; the budget actually chosen in SEC-8 is 5 per address per 15
  minutes, so the sixth is the first refusal. Corrected to match what shipped.)
- Signup, login, magic link and password reset all still work end to end.

**Exit:** all six checks pass. Commit `Stage 1: Lock it down`.

---

## Stage 2 — Make failure visible

**Items:** REL-1 · REL-2 · REL-3 · REL-4 · REL-5 · REL-6
**Depends on:** Stage 1.

REL-2 is the most important change in the plan and a dependency of Stage 5. Build it
properly rather than quickly.

1. **REL-1** — Null out `cached.promise` on rejection; add serverless connection
   options. Verify recovery by pointing `MONGODB_URI` at an unreachable host, making
   a request, restoring it, and making another **without restarting the process**.
2. **REL-2** — `ToastContext` provider and stack; `onError` on `useQueue`; every
   `enqueue` call site passes a human-readable failure description. Accessibility:
   `role="alert"` for errors, `role="status"` for info, no focus trapping.
3. **REL-3** — `app/error.js` and `app/[usernameTag]/error.js` with working `reset()`.
4. **REL-4** — Fix the bulk upload object-URL revocation and the duplicated
   `makeUploadItem` on mount.
5. **REL-5** — Batch R2 deletes with `DeleteObjectsCommand`; delete DB rows first.
   **Test on a page you create for the purpose. Do not test this on real content.**
   (Done: the storage half in the Stage 2 run, the database cascade at the start of the
   Stage 3–5 run once scratch-page writes were authorised.)
6. **REL-6** — Stop treating `pageCount`/`postCount` as authoritative where
   correctness matters, or call the reconcile functions on the create-failure path.

**Safe to parallelise:** REL-3 and REL-4 are file-disjoint from everything else in
this stage and from each other.

**Verification.** Gate, plus:
- Kill the network mid-save (offline mode): a toast explains the failure and state
  rolls back correctly. Repeat for create, edit, delete and reorder on both grids.
- Force a server component throw: the custom error boundary renders and retry works.
- Bulk modal: select images, add more, all thumbnails remain visible.
- Delete a scratch page with several posts: completes promptly, records and files gone.
- `node scripts/normalize-order.mjs` reports 0 after a create/delete/failure sequence.

**Exit:** no mutation path anywhere reverts state without telling the user why.
Commit `Stage 2: Make failure visible`.

---

## Stage 3 — Shared foundations

**Items:** FND-1 · FND-2 · FND-3 · FND-4
**Depends on:** Stage 2.

Pure extraction. **No behaviour should change.** If something looks different
afterwards, you have introduced a bug.

1. **FND-1** — `lib/sanitize.js`; replace all seven copies. Force `rel="noopener"` on
   anchors while consolidating.
2. **FND-2** — `lib/colour.js`; replace the duplicates in both info editors,
   `DashHeader` and both `loading.js` files.
3. **FND-3** — Export one slug function; delete the three client copies. Add tests
   covering punctuation, non-Latin input and very long titles.
4. **FND-4** — `components/Modal.js` owning scroll lock, focus trap, focus restore,
   Escape and backdrop click. Convert all five modals. Add `role="dialog"` and
   `aria-modal`.

**Safe to parallelise:** FND-1, FND-2 and FND-3 touch disjoint files and may be done
concurrently. FND-4 is large — do it alone, last.

**Verification.** Gate, plus:
- Screenshot the dashboard, a page, and each of the five modals before and after.
  They must be pixel-identical apart from the intended a11y attributes.
- Every modal: Tab stays inside, Escape closes, backdrop click closes, focus returns
  to the trigger.
- Slug preview in both page modals and the title editor matches the server's slug
  for a range of awkward inputs.

**Exit:** each shared constant and helper has exactly one definition; no visual
change. Commit `Stage 3: Shared foundations`.

---

## Stage 4 — Cut the weight

**Items:** PERF-1 · PERF-2 · PERF-3 · PERF-4 · PERF-5
**Depends on:** Stage 3.

Record before-and-after numbers for every item. "Feels faster" is not a result.

1. **PERF-1** — Two width buckets: 640 for cards, 1600 for the lightbox. Layer the
   cached 640 under the 1600 in the lightbox so opening stays visually instant.
   Measure dashboard image transfer on a mobile viewport before and after.
2. **PERF-2** — `priority={idx < 4}` from both grid loops.
3. **PERF-3** — Gate the theme poll on owner-and-edit-mode; project only the two
   colour fields; add `Cache-Control`. Confirm an idle tab issues no periodic
   requests, and that a colour change still propagates to a second tab.
4. **PERF-4** — Colour picker writes on commit, not every 280ms.
5. **PERF-5** — Remove `sanitize-html` from the client bundle. Compare first-load JS
   against the Stage 0 baseline.

**Safe to parallelise:** PERF-3 and PERF-4 are disjoint from PERF-1, PERF-2 and
PERF-5. PERF-1 and PERF-2 both touch the image components — do them together.

**Verification.** Gate, plus a measurements table in `PROGRESS.md`:

| Metric | Before | After |
|---|---|---|
| Dashboard image transfer, mobile viewport | | |
| First-load JS, `/[usernameTag]` | | |
| First-load JS, `/[usernameTag]/[pageSlug]` | | |
| Requests in 60s on an idle page | | |
| Requests from a 5s colour-picker drag | | |

Plus: the lightbox opens with no blank frame; rich text renders identically.

**Exit:** every row measurably improved, nothing visually regressed.
Commit `Stage 4: Cut the weight`.

---

## Stage 5 — Uploads that survive a bad connection

**Items:** UPL-1 · UPL-2 · UPL-3 · UPL-4
**Depends on:** Stage 2 (toasts), Stage 1 (SEC-4 changed the presign contract).

1. **UPL-1** — `lib/uploadFile.js` wrapping `XMLHttpRequest` with an `onProgress`
   callback, returning a promise. Convert all five call sites. Determinate per-file
   bar, aggregate bar for bulk.
2. **UPL-2** — Retry with exponential backoff, three attempts, on network errors and
   5xx only. Re-presign if the 15-minute URL window has passed. Final failure goes
   through the toast system with a retry affordance.
3. **UPL-3** — Concurrency-limited parallel bulk upload, 3–4 in flight. Keep per-file
   status accurate and isolate failures to the files that failed.
4. **UPL-4** — On failure, keep the modal open with state intact and completed
   uploads marked done, so a retry does not redo finished work.

**Safe to parallelise:** none — all four build on `lib/uploadFile.js`.

**Verification.** Gate, plus, using browser request interception or throttling:
- A large file shows a bar advancing smoothly to 100%.
- A failed request retries automatically and succeeds.
- A permanently failing request produces a clear, actionable toast.
- A 20-image bulk upload is substantially faster than before — record both times.
- Failing the third of five bulk uploads and retrying re-uploads only that file.
- All five upload paths still work: page create, page edit, post create, post edit, bulk.

**Exit:** no upload path can fail silently or lose completed work.
Commit `Stage 5: Uploads that survive a bad connection`.

---

## Stage 6 — Motion

**Items:** MOT-1 · MOT-2 · MOT-3 · MOT-4 · MOT-5
**Depends on:** Stage 3 (FND-4 for MOT-2).

Add the `prefers-reduced-motion` media query to `app/globals.css` **first**, and
honour it in every item below.

1. **MOT-1** — Animate the reorder reflow, ~200ms ease-out. FLIP is the safer choice.
   The existing `flushSync` in `moveByOffset` gives you the post-reorder geometry
   immediately, which makes the measurement straightforward.
2. **MOT-2** — Modal enter/exit transitions, implemented once in `components/Modal.js`.
3. **MOT-3** — Reduce the image reveal from 700ms to ~250–300ms; delete the unused
   `.image-loaded` rule and `blur-up` keyframes.
4. **MOT-5** — Coalesce reorder bursts: debounce the persist step ~300ms and send one
   request with the final absolute `toIndex`. No server change needed. **Preserve the
   sequence guard and the rollback-to-refresh behaviour** — re-read the context
   section of `IMPROVEMENTS.md` before touching this code.
5. **MOT-4** — View transitions on navigation. **Attempt last, and time-box it.** If
   it fights the App Router or degrades badly in Safari, drop it, revert cleanly, and
   record why in `PROGRESS.md`. This is the one item in the plan that is allowed to
   be abandoned on its merits.

**Safe to parallelise:** MOT-3 is disjoint from the rest.

**Verification.** Gate, plus browser checks:
- Move a card four places: it animates each step, no flicker, no layout jump, and the
  database matches the UI at rest.
- **MOT-5 specifically:** a four-place move issues exactly **one** reorder request
  with `toIndex` equal to the final position. Assert the request count, not just the
  outcome — this is how the previous staggering bug was caught.
- With `prefers-reduced-motion: reduce` emulated, all motion is instant or minimal.
- Modals open and close smoothly with no flash of unstyled content.

**Exit:** reordering, modals and image reveals all feel deliberate; reduced-motion is
honoured throughout. Commit `Stage 6: Motion`.

---

## Stage 7 — Touch parity

**Items:** TCH-1 · TCH-2 · TCH-3 · TCH-4 · TCH-5
**Depends on:** Stage 4 (PERF-1 determines the URL TCH-4 must preload).

Do this stage with a mobile viewport and touch emulation on, not by resizing a
desktop window.

1. **TCH-1** — `@media (hover: none)` so edit controls render at full opacity on
   coarse pointers. The codebase already uses this pattern in `RichTextEditor`.
2. **TCH-2** — Delete arming resets on timeout (~3s), outside tap, and scroll.
   `aria-label` reflects the armed state. **The two-click pattern stays** — this fixes
   the bug in it, it does not replace it.
3. **TCH-3** — Swipe navigation in the lightbox, with distance and velocity thresholds
   so vertical description scrolling is not misread. No gesture library.
4. **TCH-4** — Preload the previous and next lightbox images. **Match the URL PERF-1
   made the lightbox request**, or the preload is wasted — verify in the network panel
   that the preloaded request is reused rather than duplicated.
5. **TCH-5** — 44px minimum hit targets on coarse pointers, visual size unchanged.

**Safe to parallelise:** TCH-3 and TCH-4 (both `PhotoShowModal`) are disjoint from
TCH-1, TCH-2 and TCH-5 (both card components).

**Verification.** Gate, plus, in touch emulation:
- Edit mode: every control fully visible without hovering, all ≥44px.
- Arm delete, wait 3s → disarmed. Arm, scroll → disarmed. Arm, tap elsewhere → disarmed.
- Swipe left/right moves between posts; the description still scrolls vertically.
- On a throttled connection, moving to the next photo shows it with no blank frame,
  and the network panel shows the preload being reused.

**Exit:** edit mode and the lightbox are as usable on a phone as on a desktop.
Commit `Stage 7: Touch parity`.

---

## Stage 8 — Links that work

**Items:** LNK-1 · LNK-2 · LNK-3 · LNK-4 · LNK-5
**Depends on:** Stage 3 (FND-2 for LNK-4), Stage 1 (SEC-5 for LNK-2).

1. **LNK-1** — `generateMetadata` on both dynamic routes; OpenGraph and Twitter card
   images from the existing thumbnails; `noindex` for private pages.
2. **LNK-2** — `app/sitemap.ts` and `app/robots.ts`, excluding private pages, `/api`,
   `/admin` and `/login`.
3. **LNK-3** — Slug history. Schema fields on `Page` and `User`, appended on change;
   route handlers check them before `notFound()` and issue a 308. **Uniqueness checks
   must consider previous slugs**, so a new page cannot claim an address that still
   redirects elsewhere. No backfill needed — existing pages simply have empty history.
4. **LNK-4** — Contrast guard from the luminance helper for header text and focus ring.
5. **LNK-5** — `min-h-screen` instead of `min-h-[150vh]`; stop hiding scrollbars globally.

**Safe to parallelise:** LNK-4 and LNK-5 are disjoint from LNK-1, LNK-2 and LNK-3.

**Verification.** Gate, plus:
- A page URL in a link-preview tool shows that page's own title, description and image.
- Private page: `noindex`. `/admin` and `/login`: excluded from the sitemap.
- Rename a page → the old URL 308s to the new one. Rename a display name → the old
  profile URL 308s. Verify with fresh requests, not cached ones.
- Extremes on the theme picker — white on white, black on black — leave the title and
  focus ring visible.
- A two-page dashboard does not scroll; a long page shows a scrollbar.

**Exit:** no shared link can be broken by a rename; every page previews as itself.
Commit `Stage 8: Links that work`.

---

## Stage 9 — Cleanup and tests

**Items:** CLN-1 · CLN-2 · CLN-3 · CLN-4
**Depends on:** all previous stages.

Last because it is the least urgent and the most disruptive to review alongside
behavioural change.

1. **CLN-1** — Delete `PostFileModal.js`, `ActionButton.js`, the `heic2any`
   dependency, the two `.swp` files, and the now-dead `.quill-output`, `.image-loaded`
   and `blur-up` CSS. **Re-grep for each before deleting** — earlier stages may have
   started using something.
2. **CLN-2** — `onLoadingComplete` → `onLoad`.
3. **CLN-3** — `userId` on `Post`, set in `createPost`, backfilled by a new dry-run
   script following the `normalize-order.mjs` pattern; then simplify the ownership
   checks in the post routes.
4. **CLN-4** — Extend tests to cover `mergeServerAndOptimistic`, the shared slug
   function, the reserved username list, the colour and contrast helpers, and the rate
   limit window. Add `"test": "node --test lib/*.test.mjs"` to `package.json`.

**Safe to parallelise:** CLN-1 and CLN-2 are disjoint from CLN-3.

**Verification.** Gate, plus:
- `npm test` green and covering each area listed in CLN-4.
- The backfill dry-run reports zero remaining rows after `--commit`.
- Full click-through: dashboard, page, edit mode, reorder, lightbox, all five modals,
  all five upload paths, signup, login, magic link, password reset.

**Exit:** one definition per shared helper, tests green, no dead code.
Commit `Stage 9: Cleanup and tests`.

---

## Final handover

After Stage 9:

1. Run the full verification gate one final time from a clean checkout of the branch.
2. Write `plan/OUTCOME.md`: what shipped, what was abandoned and why (MOT-4 in
   particular), the before-and-after measurements table, anything deferred, and any
   new environment variables that need setting in production.
3. Summarise the branch's commits and stop. **Do not push, do not merge, do not open
   a pull request** unless explicitly asked.

---

## Dependency map

```
Stage 1 (security)
    └── Stage 2 (reliability) ── REL-2 toasts ──┐
            └── Stage 3 (foundations)           │
                    ├── FND-4 modal ──┐         │
                    ├── FND-2 colour ─┼───┐     │
                    └── Stage 4 (perf)│   │     │
                            │ PERF-1 ─┼─┐ │     │
                            │         │ │ │     │
                            ├── Stage 5 (uploads) ◄┘
                            ├── Stage 6 (motion) ◄┘ (MOT-2 needs FND-4)
                            ├── Stage 7 (touch) ◄─┘ (TCH-4 needs PERF-1)
                            └── Stage 8 (links) ◄───┘ (LNK-4 needs FND-2)
                                    └── Stage 9 (cleanup)
```

Hard dependencies, restated plainly:

| Item | Needs | Why |
|---|---|---|
| UPL-1, UPL-2 | REL-2 | Failures are reported through the toast system |
| UPL-1 | SEC-4 | The presign request contract changes |
| MOT-2 | FND-4 | The transition is written once, in the shared shell |
| LNK-4 | FND-2 | Needs the luminance helper outside the info editors |
| TCH-4 | PERF-1 | The preloaded URL must match what the lightbox requests |
| CLN-3 | Stage 1 | Ownership checks are rewritten by SEC-2 and SEC-4 first |
