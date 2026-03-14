# Mutation Sync And Save-State Implementation Plan

## Status

Planning document only. No implementation is covered by this file.

## Problem Summary

Current symptom:

- A post can be created successfully.
- If the user leaves the page and returns through client-side navigation, the new post may be missing.
- A hard refresh shows the post again.

What this indicates:

- The database write is succeeding.
- The stale part is the client-side route state or cached route payload.
- `VV-Spawn2` keeps dynamic route payloads warm for a long time and also manually prefetches routes.
- The page view uses optimistic local state, but does not force a sync back to fresh server data after mutations finish.

## Goals

1. Keep the site feeling fast and responsive.
2. Preserve optimistic background saving.
3. Prevent newly created posts or pages from appearing to disappear after navigation.
4. Make save state visible and understandable in the UI.
5. Keep the implementation simple enough to maintain.

## Non-Goals

1. Do not add complex autoscroll behavior.
2. Do not globally block navigation while saves are in progress.
3. Do not solve this by weakening cache behavior across the entire app unless absolutely necessary.

## Chosen Strategy

Use a four-part strategy:

1. Keep optimistic UI for immediate responsiveness.
2. Revalidate affected routes on the server whenever a mutation succeeds.
3. Trigger one client-side route refresh when the local mutation queue becomes idle.
4. Reconcile client state from fresh server props when those props arrive.

This is the cleanest and most robust approach because:

- It keeps the instant feel of optimistic cards.
- It corrects stale App Router payloads after mutations.
- It matches the spirit of `VV_Original`, which refreshed after queue completion and reconciled local state from server data.
- It avoids relying on shorter global cache lifetimes as a workaround.

## Key Product Decisions

### 1. Saving should happen in the background

Decision:

- Yes, saving should remain a background process.
- The user should see immediate visual feedback via optimistic cards.

Reason:

- This keeps the app fast.
- Blocking the full page during uploads or writes will make the product feel heavy and fragile.

### 2. Do not block all page changes during saving

Decision:

- Do not globally prevent route changes while saving is in progress.

Reason:

- Internal navigation should stay responsive.
- Route invalidation plus queue-idle refresh is a cleaner solution than a navigation lock.
- A full route lock would make uploads feel stuck and would complicate the UX.

### 3. Saving items should be visually different and non-interactive

Decision:

- A saving post/page card should use a distinct visual state.
- A saving card should not be clickable, editable, deletable, or reorderable.

Reason:

- This gives users a clear signal that the item exists but is not final yet.
- It reduces accidental interactions against incomplete optimistic records.

### 4. Use route revalidation plus `router.refresh()`

Decision:

- Use both server-side revalidation and a queue-idle client refresh.

Reason:

- Revalidation makes future navigations fresh.
- `router.refresh()` corrects the current client tab after a mutation batch finishes.
- Using only one of the two is weaker:
  - revalidation alone does not fix the already-mounted stale page
  - refresh alone does not help other route entries that were prefetched earlier

## Architecture Summary

### Current Weak Points

1. `PageViewClient` seeds local `posts` from `initialPosts` once and then manages them independently.
2. There is no server revalidation after post/page mutations.
3. There is no queue-idle route refresh in `VV-Spawn2`.
4. Page and dashboard routes are prefetched and cached for a long time.

### Target State

1. Mutations still update the grid optimistically.
2. API routes revalidate all affected paths after success.
3. The queue exposes an idle callback.
4. Page/dashboard views call a scroll-safe `router.refresh()` when their queue drains.
5. Fresh `initialPosts` and `initialPages` are merged back into local client state.

## Detailed Implementation Plan

## Phase 1: Add Server Revalidation Helpers

### Objective

Centralize all route revalidation logic so mutation handlers can invalidate the correct dashboard and page paths without duplicating lookup logic.

### New Helper Module

Create:

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/lib/revalidation.js`

Responsibilities:

1. Resolve page context by `pageId`
   - fetch the page
   - fetch the owning user if needed
   - return:
     - `usernameTag`
     - `pageSlug`
     - `dashboardPath`
     - `pagePath`

2. Resolve page context by `postId`
   - fetch the post
   - fetch the parent page
   - derive the same route data

3. Provide revalidation functions:
   - `revalidateDashboardPath(usernameTag)`
   - `revalidatePagePath(usernameTag, pageSlug)`
   - `revalidatePageAndDashboardByPageId(pageId)`
   - `revalidatePageAndDashboardByPostId(postId)`

Implementation notes:

- Use `revalidatePath` from `next/cache`.
- Keep path construction in one place.
- Fail silently but log errors if revalidation lookup data is missing.

### Why this matters

- Mutation routes currently update the database but do not invalidate route caches.
- This helper ensures that the routes most likely to show stale data are always marked stale after a successful write.

## Phase 2: Revalidate Routes After All Relevant Mutations

### Objective

Ensure every post/page mutation updates server cache state immediately after success.

### Post Routes To Update

Files:

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/app/api/posts/route.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/app/api/posts/[postId]/route.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/app/api/posts/reorder/route.js`

Changes:

1. Post create:
   - After `createPost()` succeeds, revalidate:
     - page route
     - dashboard route

2. Post edit:
   - After update succeeds, revalidate:
     - page route
     - dashboard route

3. Post delete:
   - After delete succeeds, revalidate:
     - page route
     - dashboard route

4. Post reorder:
   - After reorder succeeds, revalidate:
     - page route
     - dashboard route

### Page Routes To Update

Files:

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/app/api/pages/route.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/app/api/pages/[pageId]/route.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/app/api/pages/reorder/route.js`

Changes:

1. Page create:
   - Revalidate dashboard route after success.

2. Page edit:
   - Revalidate dashboard route after success.
   - Revalidate page route too if page metadata, title, or slug-affecting fields changed.
   - If slug changes are possible, revalidate both old and new page paths.

3. Page delete:
   - Revalidate dashboard route after success.

4. Page reorder:
   - Revalidate dashboard route after success.

### Why this matters

- This protects against stale future navigations.
- If the user leaves the page before a queue-idle refresh happens, route revalidation still ensures the next navigation can fetch fresh data.

## Phase 3: Upgrade `useQueue` To Support Queue-Idle Sync

### Objective

Allow views to run one follow-up sync action only after all local mutations are finished.

### File

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/lib/useQueue.js`

### Changes

1. Add an optional `onQueueIdle` callback
   - Called once when all create and serial operations are done
   - Not called after every individual operation

2. Keep existing optimistic queue behavior
   - create operations remain concurrency-limited
   - update/delete operations remain serialized

3. Expose queue state more explicitly
   - keep `isSyncing`
   - optionally expose a `pendingCount` if useful for UI

4. Guard against duplicate idle callbacks
   - If multiple operations finish in quick succession, idle handling should still run once per drain cycle

5. Keep rollback behavior unchanged
   - failed optimistic operations should still revert local state

### Why this matters

- A queue-idle sync is the clean point at which the UI can reconcile with server truth.
- Refreshing on every mutation would be noisy and expensive.

## Phase 4: Add Queue-Idle Refresh To `PageViewClient`

### Objective

Once all pending page mutations complete, quietly refresh the current page route so the client stops relying on stale route payloads.

### File

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/page/PageViewClient.js`

### Changes

1. Switch queue usage from:
   - `const { enqueue } = useQueue();`
   to:
   - `const { enqueue, isSyncing } = useQueue(onQueueIdle);`

2. Add a scroll-safe refresh helper
   - capture `window.scrollY`
   - call `router.refresh()`
   - restore scroll position after refreshed content is rendered

3. Trigger that refresh only when the queue becomes idle
   - not on every successful request

4. Keep optimistic create/edit/delete/reorder as-is from the user’s point of view
   - cards still appear or update immediately
   - the sync step happens in the background

### Why this matters

- This is the main client-side correction step for stale route payloads.
- It is the closest equivalent to how `VV_Original` prevented client/server drift.

## Phase 5: Reconcile `posts` From Fresh `initialPosts`

### Objective

Make server data the source of truth whenever new props arrive, while preserving still-pending optimistic items.

### File

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/page/PageViewClient.js`

### Changes

Add a `useEffect` keyed on `initialPosts` that:

1. Starts from server posts as the base list.
2. Keeps still-pending optimistic posts that do not have a server replacement yet.
3. Removes optimistic items that have already been confirmed by the server.
4. Sorts the final list by `order_index`.

Behavior target:

- If the route refresh brings in new server data, local `posts` should update to match it.
- If a create is still pending, that optimistic card should remain visible until its server version lands.

### Notes

- This should be simpler than the original implementation unless extra cases appear.
- A full client correlation id is optional here because successful creates already replace the temporary post in local state while the page remains mounted.
- If further hardening is needed later, a `clientRequestId` can be added to post/page creation as a second pass.

### Why this matters

- `VV-Spawn2` currently treats `initialPosts` as one-time seed data.
- That leaves the page vulnerable to stale or drifting local state even after fresh props arrive.

## Phase 6: Add The Same Sync Pattern To `DashboardViewClient`

### Objective

Make page creation and editing on the dashboard follow the same robust mutation model as posts on a page.

### File

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/dashboard/DashboardViewClient.js`

### Changes

1. Use the upgraded queue with `onQueueIdle`.
2. Trigger a queue-idle `router.refresh()` for the dashboard.
3. Add `initialPages` reconciliation:
   - server pages become the source of truth
   - still-pending optimistic pages remain visible until confirmed
4. Keep dashboard prefetching behavior, but rely on revalidation to keep it fresh after mutation.

### Why this matters

- The same stale-cache pattern can affect newly created pages.
- Parity between page view and dashboard view keeps the behavior predictable.

## Phase 7: Improve Save-State UI

### Objective

Make saving state visible without blocking the app.

### Files

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/page/PostCard.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/dashboard/PageCard.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/page/PageViewClient.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/dashboard/DashboardViewClient.js`

### Card-Level Changes

For optimistic cards:

1. Use a clearer saving treatment
   - slightly subdued opacity
   - spinner or small saving badge
   - stable styling that looks intentional rather than broken

2. Disable interaction
   - no open
   - no edit
   - no delete
   - no reorder

3. Keep layout identical to the final card
   - no size shift between saving and saved state

### View-Level Changes

Add a small sync indicator in page/dashboard headers:

1. Visible only when queue is busy
2. Text such as:
   - `Saving...`
   - or `Syncing changes...`
3. Visually subtle
4. Does not block the rest of the page

### Decision On Route Blocking

Do not:

- block the back button
- block route changes
- freeze the whole page

Reason:

- This would reduce responsiveness more than necessary.
- A clear per-card save state and a small global syncing indicator are enough.

### Optional Enhancement

If later needed:

- add a `beforeunload` warning only when there are pending mutations and the user is leaving the browser tab entirely
- do not use this for internal route navigation initially

## Phase 8: Keep Snapshot And Loading State Consistent

### Objective

Ensure loading shells remain visually aligned with the live state during route transitions.

### Files

- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/lib/routeTransitionCache.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/page/PageViewClient.js`
- `/Users/adamaldridge/Desktop/Volvox Spawn/VV-copy-session/VV-Spawn2/components/dashboard/DashboardViewClient.js`

### Changes

1. Keep snapshot writes based on the currently rendered merged state.
2. Do not treat snapshot cache as source of truth.
3. Do not add more snapshot complexity to fix disappearing posts.

### Why this matters

- Snapshots are useful for transition continuity.
- They should remain only a shell/preview mechanism.

## Phase 9: Validation And Edge Cases

### Functional Cases

1. Create one post, stay on page
   - optimistic card appears immediately
   - card becomes final after save
   - no disappear/reappear issue

2. Create one post, go to dashboard, return to page
   - post remains visible
   - no hard refresh needed

3. Create multiple posts in sequence
   - all appear immediately
   - all settle correctly
   - route refresh happens once after queue drain

4. Create post, navigate away before save completes, then come back
   - once the server write completes and routes are revalidated, later navigation should show the new post

5. Edit post
   - local change appears immediately
   - refreshed server state matches local result

6. Delete post
   - post disappears immediately
   - refreshed server state keeps it gone

7. Reorder posts
   - grid updates immediately
   - refreshed server order matches UI

8. Page create/edit/delete/reorder on dashboard
   - same expectations as above

### UX Cases

1. Saving card cannot be clicked
2. Saving card does not shift size
3. Header sync indicator appears only while queue is busy
4. Refresh with scroll restore does not jump the viewport

### Failure Cases

1. Failed create
   - optimistic card rolls back
   - no stale phantom state remains

2. Failed update/delete/reorder
   - rollback restores local list
   - subsequent refresh does not produce inconsistent state

3. Queue idle callback should not fire repeatedly
   - one drain cycle should produce one refresh

## Phase 10: Implementation Order

Recommended order:

1. Add `lib/revalidation.js`
2. Update post mutation routes
3. Update page mutation routes
4. Upgrade `useQueue`
5. Add page queue-idle refresh
6. Add page `initialPosts` reconciliation
7. Add dashboard queue-idle refresh
8. Add dashboard `initialPages` reconciliation
9. Add saving-state UI polish
10. Run validation scenarios and tune any edge behavior

## Risks And Mitigations

### Risk 1: Double refreshes

Mitigation:

- fire refresh only on queue drain, not per mutation
- guard idle callback execution carefully

### Risk 2: Scroll jump after refresh

Mitigation:

- capture and restore scroll position around `router.refresh()`
- use the same pattern the original app used

### Risk 3: Local/server merge bugs

Mitigation:

- always treat server props as base truth
- only preserve explicit optimistic items that are still pending
- always sort after merge

### Risk 4: Route invalidation missing an affected path

Mitigation:

- centralize route lookup and revalidation helpers in one module
- avoid duplicating path construction across handlers

### Risk 5: Overcomplicating the save-state UX

Mitigation:

- keep save state minimal:
  - non-interactive saving card
  - subtle spinner/badge
  - small header sync indicator

## Explicitly Rejected Alternatives

### 1. Lower global `staleTimes`

Rejected because:

- it reduces the fast warm-navigation behavior across the app
- it treats the symptom rather than the mutation-sync gap

### 2. Block all navigation while saving

Rejected because:

- it will make uploads feel slow and intrusive
- it is not necessary if route invalidation and queue-idle refresh are implemented correctly

### 3. Fix this only with loading snapshots

Rejected because:

- snapshots only affect transition shells
- they are not the final source of truth for the page

## Success Criteria

This plan is successful when all of the following are true:

1. A newly created post never appears to vanish after leaving and returning to the page.
2. The app still feels instant because optimistic cards appear immediately.
3. Saving state is visually clear but does not freeze the interface.
4. Page and dashboard behavior follow the same mutation model.
5. No global cache reduction is required to achieve correctness.
