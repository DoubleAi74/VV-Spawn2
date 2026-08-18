# Native navigation — implementation brief

**Read this file in full before editing.** Work only in `VV-Main/` (not `VV-Main copy/`, not `old/`). Do not start coding until the context section is done. Do not expand the scope.

This is a targeted UX pass. The public routes already feel faster than they did: a card click shows a **page** skeleton in the right theme colours. The remaining work is (a) make the tap itself feel native, (b) make the skeleton look like the real grid when we already have the cards, (c) a few cheap payload/chrome fixes.

A long prior session found and fixed several navigation traps. Re-reading this file is cheaper than rediscovering them.

---

## 0. Build context first

Do this in order. Do not skim and start.

### Product and constraints

1. `plan/AGENT.md` — non-negotiables (no push, no `main` commits, no ad-hoc DB writes, `lib/data.js` is server-only).
2. This file.

You do **not** need to re-read `plan/STAGES.md` / `IMPROVEMENTS.md` / `OUTCOME.md` unless you are about to touch something they named (ordering, uploads, view transitions). Those programmes are finished.

### Navigation as it is now (read the source)

Read these files end to end, in this order. After each group, you should be able to answer the question in italics.

**Route tree**

- `app/[usernameTag]/layout.js`
- `app/[usernameTag]/page.js`
- `app/[usernameTag]/[pageSlug]/layout.js`
- `app/[usernameTag]/[pageSlug]/page.js`
- `app/[usernameTag]/[pageSlug]/loading.js`
- `lib/isDocumentRequest.js`

*Why is there no `app/[usernameTag]/loading.js`? What happens if you add one? Why must `[pageSlug]/layout.js` stay synchronous?*

**Client navigation**

- `lib/routeTransitionCache.js`
- `components/dashboard/DashboardViewClient.js` (snapshot write, prefetch, card click)
- `components/dashboard/PageCard.js`
- `components/page/PageViewClient.js` (snapshot write, back button ~line 379)
- `components/dashboard/DashboardSkeleton.js`
- `context/ThemeContext.js` (`readPersistedTheme`, `THEME_STORAGE_PREFIX`)

*Where do theme colours for the page skeleton come from on first click? On a repeat visit? What does the snapshot actually contain today?*

**The cheap items' current code**

- `app/globals.css` (page scrollbar is already hidden; do not restyle it visible)
- `app/layout.js` and `lib/metadata.js` (`buildMetadata`)
- `lib/processImage.js` (`BLUR_WIDTH = 200`)
- `app/api/generate-blur/route.js` (CDN `width=200`)

### Confirm the landmines in the running app

Start the existing `VV-Main` dev server if it is not up. As the owner, once:

1. Click a page card. First paint must be the **page** skeleton (header + theme colours), not the dashboard skeleton, not a dead dashboard.
2. Browser-back to the dashboard. Coloured dashboard, email/Edit already present if you are the owner.
3. Open a page, use the header **arrow**. Note that it `router.push`es the dashboard (history becomes dash → page → dash). That is one of the bugs you will fix.

If step 1 shows the dashboard skeleton first, stop. Something has already drifted from this brief; do not stack more navigation changes on top. Report and wait.

---

## 1. What you are building

Seven items. Do them in this order. One behaviour at a time; keep the server running and re-check the click after anything that touches routes or snapshots.

| # | Item | Feel |
|---|---|---|
| A | `:active` press on cards | Tap acknowledges in one frame |
| B | Cards are `<Link>`s; prefetch stays conservative | Real links; no grid-wide flight storm |
| C | Header arrow is **up**, not a new push | `back()` when we came from this profile; otherwise `push` |
| D | Snapshot *is* the page grid; persist it | Repeat visit: loading screen looks like the page |
| E | Cold first visit: empty tiles, not `/vv-grey.png` | Placeholder, not a logo |
| F | Smaller blur on **new** writes | Less base64 on future RSC payloads |
| G | `theme-color` from `dashHex` | Status bar matches the theme |

That is the whole job.

---

## 2. Do not do these

- Do **not** recreate `app/[usernameTag]/loading.js`. A segment `loading.js` wraps **that page and every nested route**. It is why a card click used to flash the dashboard skeleton.
- Do **not** make `[pageSlug]/layout.js` `async` or have it `await` anything. An async layout in that segment suspends *outside* `loading.js`, and the parent catches it.
- Do **not** await Mongo in `[usernameTag]/layout.js` on RSC flights. Document requests only (`isDocumentRequest`). Unknown profiles still 404 on a typed URL.
- Do **not** import `lib/data.js` from a client component.
- Do **not** add a new public “list posts” API. First visit stays a shell; repeat visits use the snapshot. `router.prefetch` of the route is enough warming.
- Do **not** prefetch every visible card’s RSC. These routes are `force-dynamic`; that is one Mongo+auth hit per card.
- Do **not** add a service worker, a web app manifest, view transitions, or a page-header thumbnail “so we can morph.” View transitions were tried on this React 19 / Next 15 pair and abandoned (`plan/OUTCOME.md`, MOT-4).
- Do **not** remove `force-dynamic` or invent a cookie `isOwner` hint. Server `isOwner` is already passed into the view clients so email/Edit do not wait on `useSession`.
- Do **not** skip `revalidatePath` / `router.refresh()` after mutations. Instant navigation after an edit comes from showing the snapshot while the refresh runs, not from serving a stale RSC.
- Do **not** change `lib/ordering.js`, upload key derivation, or auth rate limits.
- Do **not** look at or copy from `VV-Main copy/` except to compare a specific behaviour if you are stuck. `VV-Main` is the source of truth.
- Do **not** push, force-push, or commit to `main`.

---

## 3. Implementation

### A — Press feedback

**Files:** `components/dashboard/PageCard.js`, `components/page/PostCard.js`.

On the tappable surface (the same element that will become the `<Link>` in B), add a short active state. Target: opacity or `scale-[0.99]` on `:active`, ~60ms, no bounce. Must fire on touch (`:active` is enough; do not wait for navigation). Do not break the existing hover styles or the 44px touch hit-targets (`.touch-target`).

### B — `<Link>`, conservative prefetch

**Files:** `PageCard.js`, `DashboardViewClient.js`. Possibly `PageViewClient.js` if a post card navigates (it should not; posts open the lightbox).

Today `PageCard` is a `<button>` whose `onClick` calls `router.push`. Replace the open-page surface with `next/link` `<Link href={/tag/slug}>`.

Keep:

- `cmd`-click / middle-click / open-in-new-tab (this is why it is a Link).
- Edit/delete/reorder controls as real `<button>`s that `stopPropagation` (they already do).
- The existing snapshot **seed on navigate** (title, colours, owner chrome). Move it to `Link` `onClick` / `onPointerDown` so it still runs before the flight. Do not drop it.

Prefetch policy (do not use default “prefetch everything in the viewport” if that would fire a flight per card):

- Keep the explicit `router.prefetch` helper.
- Warm the **first three** routes on dashboard mount (already there).
- Warm a card’s route on `hover` / `focus` / `touchstart` (already there).
- If `<Link prefetch>` would prefetch every in-view card, pass `prefetch={false}` and keep the hand-rolled warmer.

If you use `<Link>`, delete the now-dead `onClick={() => router.push(...)}` path so there is one navigator.

### C — Up-arrow

**File:** `components/page/PageViewClient.js` (the `ArrowLeft` control).

It currently `router.push(\`/${user.usernameTag}\`)`. That pushes a second dashboard onto the stack, so browser-back returns to the page.

The control means **up to this profile**, not “browser back no matter what.”

Specified behaviour:

1. When the user opens a page **from this profile’s dashboard in this tab**, the arrow calls `router.back()`.
2. When they landed on the page from a shared URL, a refresh, or another origin, the arrow `router.push`es `/${usernameTag}` so they are not thrown off the site.

`document.referrer` is empty on App Router client navigations. Do not use it as the only signal.

Recommended signal: when a dashboard card navigation starts (the same place you seed the page snapshot), write `sessionStorage` e.g. `volvox:up = /{usernameTag}`. The arrow reads it: if it equals this page’s dashboard href, `router.back()`; otherwise `push`. Refreshing a shared page in a new tab has no key → `push`. A key from another profile will not match → `push`.

Do not change the browser back button itself.

### D — Snapshot is the grid, and it survives refresh

**Files:** `lib/routeTransitionCache.js`, both view clients, `app/[usernameTag]/[pageSlug]/loading.js`, `components/dashboard/DashboardSkeleton.js`.

Today the cache is an in-memory `Map` (dies on reload). Page snapshots already store up to 30 posts with `title`, `thumbnail`, `blurDataURL`, `content_type`. The page `loading.js` already renders those posts when present. Two gaps:

1. **Persist.** Mirror the maps into `sessionStorage` (tab-scoped; do not use `localStorage` — that would leak private-page thumbnails across sessions on a shared machine). Bound the payload (existing 20 pages / 30 posts is fine). Invalid JSON → ignore, same as `readPersistedTheme`. Keep the in-memory map as the fast path; storage is a hydrate-on-load + write-through.

2. **Seed enough to look like the page.** On card navigate, merge into any existing snapshot (already done for posts). Also store `slug` on each dashboard page entry (missing today). After a page has been visited, the next click must show the **same grid of thumbs**, not an empty shell, then swap to the live `PageViewClient` when the RSC arrives. You should not need to invent a parallel page component: `loading.js` rendering the snapshot grid *is* that first paint.

Do not put password hashes, emails of other users, or full post HTML into the snapshot. Owner email is already there for the chrome; that is enough.

When the real page mounts, keep writing the snapshot from live `posts` (already done) so the next visit is warmer.

### E — Cold first visit

**File:** `app/[usernameTag]/[pageSlug]/loading.js`.

If `snapshot.posts` is empty, do **not** show the giant `/vv-grey.png`. Show a small grid of empty 4:3 tiles in the theme (pulse or shimmer is fine). First visit is allowed to look like a placeholder. It must not look like a branding screen.

### F — Smaller blur on new writes

**Files:** `lib/processImage.js`, `app/api/generate-blur/route.js`.

`BLUR_WIDTH = 200` at JPEG 0.6, base64, shipped in the RSC for every card. The CSS blur on the tile does not need 200px.

- Client: drop `BLUR_WIDTH` to **24**. Quality 0.5–0.6 is fine.
- Server fallback: the CDN transform uses `width=200` — match ~24.
- **Existing rows stay as they are.** Do not write a migration. Do not stretch this into a backfill unless the owner asks.

### G — `theme-color`

**Files:** `lib/metadata.js`, `app/[usernameTag]/page.js` `generateMetadata`, `app/[usernameTag]/[pageSlug]/page.js` `generateMetadata`.

Add `themeColor` (or `other: { 'theme-color': dashHex }`) from the profile’s `dashboard.dashHex`, normalised. Both public routes already load the user for metadata. Fallback: the same default header colour the app uses (`#2d3e50`). Private pages stay `noIndex`.

---

## 4. Verification

After each item, click through. After the whole set, do all of these on desktop and a narrow viewport.

**Tap / links**

- Card `:active` flashes before the route changes.
- `cmd`-click (or middle-click) a card opens a new tab to the page.
- Hovering a card still warms that one route; scrolling a large dashboard does not fire a prefetch per card.

**Forward**

- First visit to a page you have not opened this tab: **page** skeleton, correct colours, empty tiles (no dashboard skeleton, no grey logo).
- After visiting once, click the same card again: skeleton shows the **post thumbs**, then the live page replaces it with no obvious layout jump.
- Refresh the dashboard, click that card again: still thumbs (sessionStorage).

**Back / up**

- Dashboard → page → header arrow: one hop to the dashboard, and **browser back does not return you to that page**.
- Open `/{tag}/{slug}` in a new tab (shared URL). Header arrow goes to `/{tag}`, not off the site.

**Owner chrome**

- As owner, email + Edit are on the skeleton and on the live header; they do not pop in later.
- As a signed-out visitor, no owner chrome, no email.

**Other**

- Page scrollbar on the right stays hidden.
- A new photo upload still gets a blur placeholder; it is just smaller. Old images still show their existing blur.
- Mobile browser chrome / status bar picks up `theme-color` on the public routes (spot-check).
- `node --test lib/*.test.mjs` still passes. Add a small test if you extract snapshot persist or the up-arrow decision into a pure helper (preferred).

If a click ever shows the dashboard skeleton again, you have reintroduced a parent `loading.js` or an async `[pageSlug]` layout. Revert that first.

---

## 5. How to work

- Branch off whatever `VV-Main` is on. Do not commit to `main`. Do not push unless the owner asks.
- Prefer one commit for A–C (interaction) and one for D–E (snapshot) and one for F–G (payload/chrome), or a single commit if the diff stays small. Message in the repo’s existing style.
- If an item is wrong on contact, stop and say so. Do not substitute a neighbouring rewrite (PWA, ISR, view transitions, “keep both screens mounted”).
- When done, write a short note in `plan/PROGRESS.md` (create if missing) listing what shipped and what you verified. Do not rewrite `OUTCOME.md`.
