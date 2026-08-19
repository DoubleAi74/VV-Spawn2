# Card actions and scroll — implementation brief

**Read this file in full before editing.** Work only in `VV-Main/` (not `VV-Main copy/`, not `old/`). Do not start coding until this plan is approved. Do not expand the scope.

This is a robustness pass on the owner grid. Arrow-only reordering is already correct. Mixed create / edit / delete / move still lets the list or the viewport jump after Saving has gone. The app should feel like a native client: what the owner just did stays put until they do something else.

---

## 0. Approval

This file is the plan. Do not implement until it is accepted.

If you depart from it, say so first. If a step is wrong on contact, stop and report rather than substituting a neighbouring rewrite (service worker, ISR, view transitions, “keep both screens mounted”).

---

## 1. What is already right

Do not redo the original ordering fix. Read `plan/IMPROVEMENTS.md` → “Context: what already happened” before touching anything that writes `order_index`.

That work established:

- Writes are **absolute placement**, not relative swaps. `movePageToIndex` / `movePostToIndex` read the sibling set, rearrange the array, rewrite `1..n`. Replaying a request is harmless.
- Reads and writes share `SIBLING_SORT = { order_index: 1, _id: 1 }`.
- The client `flushSync`s each local swap so a rapid second click sees the first result.
- A sequence guard drops **stale move responses** so a multi-place burst does not stagger backwards.
- MOT-5 (one shared debounce slot for all cards) was tried and **reverted**. A move of card A then card B inside the window dropped A’s request. Do not bring that back.
- Do **not** add a unique index on `{ userId, order_index }`. Renumbering passes through intermediate states where two rows share an index.

`lib/ordering.test.mjs` covers the pure swap / place / duplicate-index cases. Keep those tests green.

Arrow-only bursts are stable. The remaining failures are what happens when other actions share the same list and the same idle refresh.

---

## 2. What is still wrong

Two symptoms, one delayed event.

After a burst, `useQueue` hits idle and both view clients call `refreshWithScrollRestore()`: snapshot `window.scrollY`, then `router.refresh()`. When `initialPages` / `initialPosts` next changes, an effect merges the server list and `scrollTo`s the snapshot. In development that commit often lands **several seconds after Saving has cleared**.

### 2.1 List jumps (edit + delete + move)

The local grid is updated instantly. Later writers then rebuild it from a **stale photograph** of the whole list.

| Writer | What it does | Why it jumps |
|---|---|---|
| Edit save | Modal **always** sends `order_index`, even for a title-only save. Server calls `movePageToOrderIndex` / `movePostToOrderIndex`. Client then `reorderItemsByIndex(current, id, updated.order_index, updated)`. | Re-places that card at the index from when the modal opened, ignoring arrows and deletes that happened while the PATCH was in flight. Typical motion: snap back, then the last move response snaps forward. |
| Edit rollback | `setPages(previousPages)` / `setPosts(previousPosts)`. | Restores the entire pre-edit array and undoes every later move or delete. |
| Move response | If `seq === reorderSeqRef`, stamp that response’s indexes onto whatever is local now. | `reorderSeqRef` is only bumped by moves. A “latest” move snapshot can still include a card the owner has since deleted, or miss an edit placement. |
| Delete (local) | `filter` only. Does not compact `1..n`. | Server delete does `$inc: -1` on later siblings. The next `reorderItemsByIndex` (edit apply) sorts by leftover holes and can reshuffle. |
| Delete rollback | Reinserts the old row with its old index. | Collides with a list that `swapItemsByIds` has already compactified. |
| Idle `router.refresh()` | `mergeServerAndOptimistic` **replaces** local items with the server list. Only `_optimistic` creates survive. | If the owner has already started a new burst, or an earlier refresh is still in flight, the merge rewinds the grid. A create’s refresh can put a just-deleted card back; the delete’s refresh then takes it away again. |

A helper simulation using the real `swapItemsByIds` / `reorderItemsByIndex` / `mergeServerAndOptimistic` functions showed jumps in the mixed cases (title save then move that card; move then title save with a frozen index; idle refresh while the owner had already moved again). Pure arrow bursts did not jump.

### 2.2 Viewport jumps (create then delete is the easy reproduce)

This is **not** “Next scrolled to the top” and not “the document got shorter,” though it can feel like a height change.

Measured on create-then-delete, owner session, in-page clicks (Playwright’s locator `.click()` scrolls the target into view and will fake this):

1. Create finishes → queue idle → **capture `scrollY`** (often `0`, or wherever the owner was) → `router.refresh()`.
2. The owner scrolls to the new card and deletes it. Local list updates immediately.
3. The RSC can return in tens of milliseconds. The React commit of new `initialPages` is later.
4. The effect then runs `scrollTo({ top: savedY, behavior: "instant" })`.

Wrapped `window.scrollTo` and got the stack from `DashboardViewClient`’s `useEffect`, **4.7s after Saving cleared** — the same “about five seconds after Saving” timing.

In one run, create’s restore had captured `0`. After the owner (the test) had scrolled to `408` to reach the new card, that late `scrollTo(0)` fired. `scrollHeight` stayed `1208`. Card count stayed the same (the first delete clicks only armed). Only `scrollY` changed. The page lurched.

So the restore does not mean “keep current scroll.” It means “write back the number from when the queue last went idle,” whenever `initialPages` next changes, even if the owner has scrolled, created, or deleted since.

Two bursts (create, then delete) mean **two pending restores** that can fire in either order. Create’s old `y` applied after delete is the easy, reliable snap.

On a 4-column desktop, 6 vs 7 cards is still two rows, so height may not change. On two columns, create adds a row and delete removes it. Combined with a stale `scrollTo`, it feels like the page’s height or position lurched. The owner may describe that as a scroll-height change even when `document.scrollHeight` is unchanged.

A single arrow click often looks fine because the test (and the owner) did not scroll after idle, so restore wrote the same `y`.

### 2.3 Fragile restore (even if we keep a refresh)

Today the snapshot lives on a component ref. It is lost if `DashboardViewClient` / `PageViewClient` remounts.

Dashboard wraps the async body in `<Suspense fallback={<DashboardSkeleton />}>`. The page route has no inner Suspense; a slow `page.js` falls through to `[pageSlug]/loading.js`. Both fallbacks set `document.body.style.overflow = "hidden"`. Skeleton root is `min-h-[150vh]`; the live dashboard is `min-h-screen`. A same-route refresh that shows either fallback unmounts the live client, drops the ref, and can clamp or jump the viewport.

In Chrome 151 the fallback did not appear on a delayed RSC, so we could not force that remount. The late `scrollTo(savedY)` is enough to explain the bug without it. Safari / iOS were not tested; `Modal.js` also sets `overflow: hidden` without saving `scrollY`.

---

## 3. What we are building

Make the **on-screen list and the current viewport** the source of truth until the owner stops. Server responses patch facts (title, thumbnail, “this id is gone”). They must not rewind the array from an older photo, and they must not yank `scrollY` to a number captured before the owner’s last scroll.

Do this in this order. Keep the server running and re-check create → delete after anything that touches the queue, refresh, or the two view clients.

| # | Item | Feel |
|---|---|---|
| A | Edit is not a reorder unless the owner changed position in the modal | Title save cannot move a card |
| B | Responses patch one row; rollbacks restore one row | No full-list rewind |
| C | Stop applying reorder response bodies to local state | Optimistic swap is the UI |
| D | Compact on local delete; generation-guard any server merge | Create/delete/move commute |
| E | Do not `router.refresh()` after a burst whose local state is already right | Removes the delayed event |
| F | If a refresh remains: cancel restore on user scroll; never apply a stale `y` | Create-then-delete does not lurch |

That is the whole job.

---

## 4. Do not do these

- Do **not** change `lib/ordering.js` placement maths, `SIBLING_SORT`, or add a unique `{ userId, order_index }` index.
- Do **not** reintroduce MOT-5’s **single** pending debounce slot for every card. Per-card pending `toIndex` is allowed later; it is not required for this pass.
- Do **not** recreate `app/[usernameTag]/loading.js` or make `[pageSlug]/layout.js` async.
- Do **not** import `lib/data.js` from a client component.
- Do **not** sanitise info fields on save, or inject full HTML into the host with `dangerouslySetInnerHTML`.
- Do **not** use `waitUntil: 'networkidle'` in browser checks. `ThemeContext` polls. Port 3000 may already be the owner’s server; read the log for the real port, and kill only a server you started.
- Do **not** use Playwright locator `.click()` on a card that is off-screen when asserting scroll. It scrolls the target into view and will fake a jump. Use an in-page `element.click()` on a control that is already visible, or `click({ force: true })` after checking the box is in the viewport.
- Do **not** push, force-push, or commit to `main`.

---

## 5. Implementation

Match the surrounding code: JavaScript, British user-facing strings, short factual comments only where a constraint is non-obvious.

### A — Edit does not reorder by accident

**Files:** `components/dashboard/EditPageModal.js`, `components/page/EditPostModal.js`, both view clients, `lib/data.js` (`updatePage` / `updatePost` already no-op when `order_index` is omitted).

- Record the position when the modal opens.
- On submit, **omit** `order_index` unless the field changed.
- `parseRequestedOrderIndex` already treats missing as “do not move.” Do not send the frozen index “for completeness.”

Done when a title-only save does not call `movePageToOrderIndex` / `movePostToOrderIndex` and does not change any card’s place.

### B — Patch one row

**Files:** `DashboardViewClient.js`, `PageViewClient.js`.

On edit **success**, merge returned fields onto the existing row by `_id`. Do **not** call `reorderItemsByIndex` unless this save intentionally changed position, and not if a newer local generation has already moved that id.

On edit **rollback**, restore that row’s fields (or reinsert that one row at its last local index), never `previousPages` / `previousPosts`.

On delete **rollback**, put that row back and `normalizeOrderIndexes`. Do not sort solely by the stale stored index.

Done when a failed title save cannot undo a later arrow or delete of a different card.

### C — Trust the optimistic move

**Files:** both view clients (`moveByOffset`).

On reorder **success**, do not stamp the response’s `ordering` onto the local list. The `flushSync` swap is already the UI. The sequence guard exists because those bodies are mid-burst snapshots; applying even the “latest” one is wrong once delete or edit has changed membership.

On reorder **failure**, keep today’s “refresh from the server” rollback (`rollsBackLocally: false`).

Done when a move + delete of another card cannot apply a four-item server order onto a three-item local list.

### D — Compact delete + generation

**Files:** both view clients, `lib/optimisticMerge.js` (and tests).

- After a local delete, `normalizeOrderIndexes` so local and server share `1..n`.
- Keep a monotonic `generation` (ref) on the list. Bump it on every local move, delete, edit, and create.
- `mergeServerAndOptimistic` may still replace membership for idle reconciliation, but the view client must **skip** the merge when `generation` has advanced since the refresh was requested.
- Optional and small: if a merge does run, do not resurrect an id the local generation has deleted unless the delete request failed.

Done when: delete B, then move C, then a late create-refresh cannot put B back or reshuffle C.

### E — Stop refreshing this tab after a successful burst

**Files:** `lib/useQueue.js` (idle callback), both view clients.

Today every idle calls `router.refresh()`. That is the delayed event for both bugs. Instant navigation after an edit is supposed to come from the snapshot while a *navigation* refresh runs (`plan/NATIVE_NAV.md`), not from rebuilding the tab the owner is staring at.

- After a successful burst whose local state already matches what we wrote, **do not** `router.refresh()`.
- Still `revalidatePath` on the mutation routes (already done) so the **next** dashboard ↔ page hop is fresh.
- Keep a refresh on **failure** (rollback-to-server) and on cases where the client cannot know the server shape (treat this as the exception, not the default).

If a specific mutation still needs a same-tab refresh, it must go through F. Do not leave a blanket idle refresh “just in case.”

Done when create, delete, title save, and arrow leave the tab quiet after Saving clears: no RSC flight, no late `scrollTo`.

### F — Scroll restore, if any refresh remains

**Files:** both view clients. Possibly a tiny `lib/preserveScroll.js` so dashboard and page share one pending slot.

If E is complete, F is only for the failure path. Implement it anyway so a future refresh cannot regress.

- One **module-level** pending restore (survives remount), not only a component ref.
- Capture `{ y, generation, at }` when a refresh is actually started.
- On any user `wheel` / `touchmove` / `scroll`, **cancel** the pending restore.
- A newer burst overwrites or drops the pending restore. Create’s `y` must not apply after delete.
- Apply `scrollTo` only if the viewport was actually reset (e.g. current `y === 0` and saved `y > 0`), or if current `y` still equals the captured `y`. Never yank a different user-owned `y`.
- Prefer `useLayoutEffect` over a one-shot double `rAF`.
- Do not set `history.scrollRestoration = 'auto'` in a theme-effect cleanup in a way that races a pending restore.

**Modal (small, same pass if the file is already open):** `components/Modal.js` `lockBodyScroll` should remember `scrollY` (or use `position: fixed; top: -y`) and put it back on unlock. Chrome kept position; Safari often does not.

**Same-route refresh must not paint `DashboardSkeleton` or `[pageSlug]/loading.js`.** Those are for first navigation. Do not add a parent `loading.js` to “fix” this. If a refresh remains and it suspends, keep the current client tree visible (the App Router already did this in our Chrome tests). Do not teach the skeleton to be the refresh UI.

Done when: create a page, scroll to it, delete it, wait until Saving has been gone 10s. `scrollY` does not jump. `scrollHeight` may change **once**, immediately, when the card is removed — never seconds later.

---

## 6. Files (expected)

| Area | Files |
|---|---|
| Edit payload | `components/dashboard/EditPageModal.js`, `components/page/EditPostModal.js` |
| List + scroll + queue idle | `components/dashboard/DashboardViewClient.js`, `components/page/PageViewClient.js` |
| Merge / generation | `lib/optimisticMerge.js`, `lib/optimisticMerge.test.mjs` |
| Optional shared restore | `lib/preserveScroll.js` (+ a small test if the helper is pure) |
| Modal lock | `components/Modal.js` |
| Queue idle | `lib/useQueue.js` only if the idle callback needs a “refresh or not” signal |

Do not touch `lib/ordering.js` except to import `normalizeOrderIndexes` from the view clients (already imported where needed).

New tests (required):

- Pure: title save must not include `order_index` when unchanged (extract a one-line helper if that keeps the test off React).
- Pure: edit apply + later move does not re-place from the edit index; refresh merge is skipped when generation advanced; create-then-delete does not apply create’s saved `y` after a user scroll.
- Browser, as owner, **in-page clicks** on visible controls:
  1. Title save, then immediately arrow that card — order never passes through the old slot.
  2. Create a private page, scroll to it, delete it (arm, wait, confirm). Assert `scrollY` from confirm through Saving-clear plus 10s. Allow one immediate height change on the local delete; forbid a later `scrollY` jump.
  3. Arrow a visible card on a long page, stay still, wait through Saving plus 10s — `scrollY` unchanged.
  4. Scroll after Saving clears, before any late commit — restore must not pull you back.

Wait for Saving to appear and then clear. Never `networkidle`. Snapshot any data you mutate and restore it, including on failure.

---

## 7. Verification (before calling it done)

On desktop and a narrow viewport, as the owner, once:

**List**

- Move one card several places quickly: one hop per click, no stagger back.
- Title-only edit, then immediately arrow that card and another card: no snap through the pre-edit slot.
- Delete one card, arrow a neighbour while Saving is up: neighbour stays where you put it.
- Create a page, delete it: it does not come back when a late refresh lands.

**Scroll**

- Create a page, scroll to the new card, delete it. Watch for 10s after Saving clears. Viewport does not lurch.
- Long page, scroll down, arrow a card that is already on screen. Same wait. `scrollY` holds.
- Open and close the edit modal while scrolled. Position holds (especially worth a Safari glance if available).

**Landmines**

- Still no `app/[usernameTag]/loading.js`.
- `[pageSlug]/layout.js` still synchronous.
- `node --test lib/*.test.mjs` passes.
- Do not leave a `__height_probe__` (or similar) page in the owner’s account.

Log one short section in `plan/PROGRESS.md`. Do not rewrite `OUTCOME.md`.

---

## 8. Suggested commits

On the current working branch (not `main`):

1. A–D — list authority (edit payload, patch-by-id, no move-body apply, generation + compact delete).
2. E–F — idle refresh and scroll restore.

One commit is fine if the diff stays small. Message in the repo’s existing style.

---

## 9. Out of scope

- Coalescing a four-place move into one request (MOT-5), unless you add a **per-card** pending `toIndex` and a test that moves two different cards inside the window.
- Unique indexes on `order_index`.
- View transitions, PWA, removing `force-dynamic`.
- Info-box HTML/text behaviour, empty-grid plus, card chrome insets.
- Safari-only modal scroll lock beyond the small `lockBodyScroll` change in F.

---

## 10. Evidence (so this is not folklore)

- Helper simulation (`swapItemsByIds` / `reorderItemsByIndex` / `mergeServerAndOptimistic`): mixed edit+move and idle-refresh-during-move jumped; arrow-only did not.
- Live owner session, localhost, Next 15.5, Chrome 151: `router.refresh()` after a quiet arrow often did **not** change `scrollY` if the owner stayed still.
- Live create-then-delete: late `scrollTo({ top: savedY, behavior: "instant" })` from `DashboardViewClient`’s `initialPages` effect, ~5s after Saving cleared. Create’s captured `0` applied after a scroll to `408` produced a jump with unchanged `scrollHeight`.
- Playwright locator `.click()` on the first card’s Move control scrolls that card into view and will look like a snap-to-top. That is not the product bug.

---

## 11. When to stop and ask

- An item would need a schema change.
- You think a same-tab refresh is still required after a successful write. Say why, and route it through F.
- Safari/iOS is the only remaining failure and you cannot run it. Report what Chrome showed and leave the modal lock in place.

When you stop, say what you found, what you tried, and the options. Finish unblocked items first.
