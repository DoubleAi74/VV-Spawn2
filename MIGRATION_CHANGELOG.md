# VV Migration Changelog (VV_Original -> VV-Spawn2)

Last updated: 2026-03-13

## 1) Current Comparison Snapshot

### Core similarities
- Same product model: user profile -> page collections -> post cards.
- Same key post types: photo, file, URL, text.
- Same media pipeline goals: thumbnails + blur placeholders + Cloudflare R2 storage.
- Same owner vs visitor behavior pattern (edit controls for owner only).
- Same colour personalization concept (header + background colours).

### Core differences
- Backend architecture changed from Firebase client-driven reads/writes to NextAuth + API routes + MongoDB/Mongoose.
- VV-Spawn2 is much leaner (major UI components are reduced by hundreds of lines).
- VV_Original used heavy scroll orchestration and loading overlays; VV-Spawn2 intentionally removed complex autoscroll logic.
- VV_Original visual language was darker, denser, and more layered; VV-Spawn2 is clean/light/minimal.
- VV_Original had extra routes (`/welcome`, `/secretsignup`, `/vv_sim`, deep post route); VV-Spawn2 focuses on login/dashboard/page flow.

## 2) Styling Features From VV_Original Worth Porting (Without Restoring Complex Autoscroll)

### Priority A (high impact, low behavioral risk)
- Reintroduce richer card surface styling:
  - stronger depth, edge treatment, hover states, and optimistic-state polish.
- Reintroduce richer loading visuals:
  - blur-backed skeleton cards instead of plain gray placeholders where data exists.
- Improve dashboard/page header visual identity:
  - layered colour tones and stronger title treatment while keeping current fixed-header logic.
- Improve edit-mode affordances:
  - clearer owner action states and better visible save/sync feedback labels.

### Priority B (medium impact)
- Reintroduce dual-layer text editor styling concepts:
  - better read/edit transitions for dashboard/page info sections.
- Reintroduce more expressive upload/loading feedback for media operations.
- Add subtle image/preload micro-optimizations for first-visible cards.

### Priority C (optional)
- Reintroduce selective “overlay loading” feel as a visual system only, without scroll locking/position manipulation.

## 3) Functional “Spirit” To Preserve (Fast + Responsive)

### Already good in VV-Spawn2
- Optimistic CRUD updates via `useQueue`.
- API-first auth and mutation boundaries.
- Server-validated ownership on mutating routes.
- Direct-to-R2 upload flow and batch upload support.

### Gaps to improve while keeping new architecture
- More resilient optimistic reconciliation and rollback UX details.
- Better perceived performance on route transitions (visual continuity from previous view).
- Sharper feedback loops for queued operations (sync state surfaced consistently).
- Stronger consistency rules for ordering/counter reconciliation edge-cases.

## 4) Proposed Implementation Track (for upcoming coding batches)

1. Visual foundation pass (tokens, card/header/loading styling primitives).
2. Dashboard styling parity pass (header, cards, info editor, edit mode states).
3. Page styling parity pass (post cards, info sections, media modal polish).
4. Loading continuity pass (skeleton overlays + optimistic continuity, no complex autoscroll).
5. Backend responsiveness pass (queue behavior, reconciliation edge-case hardening, perceived latency improvements).

## 5) Open Discussion Items

1. Visual direction choice:
   - Keep VV-Spawn2 light base and add selective “old depth”, or move back closer to VV_Original dark/neumorphic tone?
2. Info editors:
   - Prefer rich-text-first editing (current Quill pattern), or restore more direct dual-layer/plain-text editing feel?
3. Loading overlays:
   - Should overlays be always-on for dashboard/page transitions, or only when optimistic preview data is available?
4. Route scope:
   - Do you want to restore deep post URL route behavior (`/:usernameTag/:pageSlug/:postSlug`) in VV-Spawn2 later?

## 6) Discussion Log

### 2026-03-12 (initial audit)
- Completed side-by-side audit of `VV_Original` and `VV-Spawn2`.
- Confirmed VV-Spawn2 is functionally solid and significantly simplified.
- Identified high-value styling and UX continuity features to port without bringing back complex autoscroll.
- Next step: align on visual direction + first styling batch before code changes.

### 2026-03-12 (user direction lock)
- Visual target confirmed:
  - Make physical appearance of pages close to `VV_Original`.
  - Directly copy JSX styling patterns for key cards and key modals where possible.
  - Keep implementation simple/clean/fast; do not reintroduce complex autoscroll behavior.
- Editor direction confirmed:
  - Prefer simpler approach if quality remains high.
  - Must support HTML input/output as before.
- Performance direction confirmed:
  - Improve both frontend and backend responsiveness for seamless perceived loading.

## 7) Agreed Implementation Shape (No Complex Scroll)

### A) Direct style replication targets (primary)
- Cards:
  - `components/dashboard/PageCard.js`
  - `components/page/PostCard.js`
- Modals:
  - `components/dashboard/CreatePageModal.js`
  - `components/dashboard/EditPageModal.js`
  - `components/page/CreatePostModal.js`
  - `components/page/EditPostModal.js`
  - `components/page/BulkUploadModal.js`
  - `components/page/PhotoShowModal.js`
  - `components/page/PostFileModal.js`

### B) Supporting visual parity targets (secondary)
- `components/dashboard/DashHeader.js`
- `components/ActionButton.js`
- `components/ImageWithLoader.js`
- Loading route UIs:
  - `app/[usernameTag]/loading.js`
  - `app/[usernameTag]/[pageSlug]/loading.js`

### C) Keep-simple editor strategy (HTML-capable)
- Preserve HTML-capable editing/rendering.
- Prefer cleaner implementation over high-complexity dual-layer logic unless needed for visible UX quality.
- Candidate files:
  - `components/dashboard/DashboardInfoEditor.js`
  - `components/page/PageInfoEditor.js`
  - `components/page/RichTextEditor.js`

### D) Responsiveness improvements (no behavioral complexity)
- Frontend:
  - Better optimistic continuity and loading placeholders.
  - Blur-backed skeletons where data is available.
  - More explicit sync status feedback during queued operations.
- Backend:
  - Tighten mutation-path latency patterns where feasible.
  - Keep auth/ownership checks strict while avoiding redundant data work.
  - Preserve atomic reorder/counter consistency and improve recovery UX where needed.

## 8) Planned Execution Batches

1. Batch 1 — Cards + shared visual primitives
   - PageCard/PostCard style parity and supporting button/image styles.
2. Batch 2 — Core modals parity
   - Create/Edit Page + Create/Edit Post + Bulk Upload visual parity.
3. Batch 3 — Media modals + loading surfaces
   - Photo/File modals + route loading UI parity.
4. Batch 4 — Editors + responsiveness polish
   - Simple HTML-capable editor refinement + queue/loading responsiveness polish.

## 9) Implementation Log

### Batch 1 — completed (2026-03-12)
- Updated card styling toward `VV_Original` parity:
  - `components/dashboard/PageCard.js`
  - `components/page/PostCard.js`
- Updated shared visual primitives:
  - `components/ImageWithLoader.js`
  - `components/ActionButton.js`
- Key outcomes:
  - Reintroduced darker layered card surfaces, blur-backed media presentation, and higher-contrast control overlays.
  - Added confirm-on-second-click delete affordance (`deletePrime`) on cards (matching old interaction feel).
  - Preserved current `VV-Spawn2` behavior contracts and no complex scroll logic.
- Validation:
  - `npm run lint` passed with no warnings/errors.
  - `npm run build` passed (all app routes compiled successfully).

### Batch 2/3/4 — completed (2026-03-12)
- Completed page editor stack parity:
  - `components/page/RichTextEditor.js`
  - `components/page/PageInfoEditor.js`
- Completed page modal parity:
  - `components/page/CreatePostModal.js`
  - `components/page/EditPostModal.js`
  - `components/page/BulkUploadModal.js`
  - `components/page/PhotoShowModal.js`
- Completed dashboard modal/editor parity:
  - `components/dashboard/CreatePageModal.js`
  - `components/dashboard/EditPageModal.js`
  - `components/dashboard/DashboardInfoEditor.js`
- Completed shell/header/title/color parity:
  - `components/page/PageViewClient.js`
  - `components/dashboard/DashboardViewClient.js`
  - `components/dashboard/DashHeader.js`
  - `components/dashboard/TitleEdit.js`
- Key outcomes:
  - Ported dark modal shells, control bars, tab/buttons, and old-style footer actions across page and dashboard flows.
  - Restored HTML-capable dashboard/page info editing with autosave status labels (`Saving`, `Saved`, `Unsaved`, `Failed`).
  - Reworked header/title/color edit surfaces to the old visual language while preserving `VV-Spawn2` API-driven architecture.
  - Kept behavior simplified (no complex autoscroll/body-lock orchestration reintroduced).
- Validation:
  - `npm run lint` passed with no warnings/errors.
  - `npm run build` passed (all app routes compiled successfully).

## 10) Visual Parity Task Board (Requested 2026-03-12)

Goal: port the appearance of original page/dashboard surfaces as close as possible while preserving `VV-Spawn2` architecture and avoiding complex autoscroll behavior.

### Task 1 — Scope lock and file mapping
- Status: completed
- Originals to mirror (page side):
  - `components/page/BulkUploadModal.js`
  - `components/page/CreatePostModal.js`
  - `components/page/EditPostModal.js`
  - `components/page/PageInfoEditor.js`
  - `components/page/PhotoShowModal.js`
  - `components/page/RichTextEditor.js`
  - `components/page/PageViewClient.js`
- Originals to mirror (dashboard side):
  - `components/dashboard/CreatePageModal.js`
  - `components/dashboard/EditPageModal.js`
  - `components/dashboard/DashboardInfoEditor.js`
  - `components/dashboard/DashboardViewClient.js`
  - `components/dashboard/DashHeader.js`
  - `components/dashboard/TitleEdit.js`

### Task 2 — Page editor stack appearance port
- Status: completed
- Target files:
  - `components/page/RichTextEditor.js`
  - `components/page/PageInfoEditor.js`
- Output:
  - Near-identical editor styling and HTML-capable flow.

### Task 3 — Page modal appearance port
- Status: completed
- Target files:
  - `components/page/CreatePostModal.js`
  - `components/page/EditPostModal.js`
  - `components/page/BulkUploadModal.js`
  - `components/page/PhotoShowModal.js`
  - (styling alignment check in `components/page/PostFileModal.js`)

### Task 4 — Dashboard modal/editor appearance port
- Status: completed
- Target files:
  - `components/dashboard/CreatePageModal.js`
  - `components/dashboard/EditPageModal.js`
  - `components/dashboard/DashboardInfoEditor.js`

### Task 5 — Shell and header appearance port
- Status: completed
- Target files:
  - `components/page/PageViewClient.js`
  - `components/dashboard/DashboardViewClient.js`
  - `components/dashboard/DashHeader.js`
  - `components/dashboard/TitleEdit.js`
- Output:
  - Header/title/color edit appearance aligned to original style.

### Task 6 — Integration and quality pass
- Status: completed
- Focus:
  - Resolve style collisions and visual regressions.
  - Preserve existing owner/visitor behavior and API contracts.
  - Validate with lint/build and responsive checks.

## 11) Follow-up Layout Adjustment (2026-03-12)

User-requested refinement after parity pass:
- Move info editors below card grids (remove above-grid placement).
- Remove extra horizontal bars below main headers.
- Keep headers sticky and add one static lighter stripe at the bottom of the main header.

Files updated:
- `components/page/PageViewClient.js`
- `components/dashboard/DashboardViewClient.js`
- `components/dashboard/DashHeader.js`
- `components/page/PageInfoEditor.js`

Notes:
- Page info editing now surfaces only the below-grid info field in both view and edit mode.
- Dashboard info editor is now rendered below the page-card grid.
- Header stripe is now part of the main sticky header instead of separate floating bars.

Validation:
- `npm run lint` passed.

## 46) Public Admin Dashboard Route (2026-03-14)

User request:
- Add a simple admin dashboard with no login required that lists every user account with page and post counts, plus a link to that user's dashboard.

Files updated:
- `lib/data.js`
- `app/admin/page.js`

Changes:
- Added `getAdminUserSummaries()` to collect all users plus aggregate page/post totals from the `Page` collection.
- Added a new public server-rendered `/admin` route.
- Built a simple dark dashboard view that shows:
  - `usernameTitle`
  - `@usernameTag`
  - page count
  - post count
  - direct link to `/${usernameTag}`
- Included top-level totals for users, pages, and posts.

## 45) Styled Magic-Link And Reset Emails (2026-03-14)

User request:
- Make the magic-link email and password-reset email look more stylish and closer to the login page style.

Files updated:
- `lib/authEmailTemplate.js`
- `app/api/auth/magic-link/route.js`
- `app/api/auth/reset-password/route.js`

Changes:
- Added a shared auth email template with a dark Volvox Works visual style: centered card layout, muted black/zinc palette, branded heading, accent top strip, and stronger CTA button.
- Switched both the magic-link and password-reset flows to use the shared template so they stay visually consistent.
- Added plain-text versions alongside the HTML emails for better deliverability and client fallback behavior.

## 43) Stable Page Scroll Height When Toggling Edit Mode (2026-03-14)

User request:
- On pages, toggling edit mode at the bottom was moving the card grid up and down, unlike the dashboard.

Files updated:
- `components/page/PageViewClient.js`
- `components/page/PageInfoEditor.js`

Changes:
- Identified the page-only layout shift source: the bottom page info editor was adding/removing height when edit mode changed.
- Normalized the page info editor bottom spacing so its own margin no longer changes between view and edit mode.
- Added page-level bottom-space reservation when the owner is viewing a page with no visible info content, so toggling edit on/off no longer changes the total scroll height at the bottom of the page.
- Kept the reservation tied to the live info-content state, so once page info exists the page uses the normal layout.

Validation:
- `npm run lint` passed.

## 42) Smooth Crossfade Image Reveal Refinement (2026-03-14)

User follow-up:
- The first-load image reveal looked like a blur pulse rather than a smooth emergence from blurred to clear.

Files updated:
- `components/ImageWithLoader.js`

Changes:
- Removed the extra internal blur-overlay layer from the shared image component.
- Changed the first-load reveal for images with `blurDataURL` to a pure opacity crossfade over the existing blurred card background, so the initial blurred impression stays stable while the sharp image fades in.
- Kept a softer fallback blur+fade only for images that do not have a blur placeholder available.

Validation:
- `npm run lint` passed.

## 41) First-Load Image Reveal For Page And Dashboard Cards (2026-03-14)

User request:
- Prevent the jarring first-load image snap on dashboards and pages with a sleek fade-in from blur that only happens on first load.

Files updated:
- `components/ImageWithLoader.js`
- `app/[usernameTag]/loading.js`
- `app/[usernameTag]/[pageSlug]/loading.js`

Changes:
- Reused the existing in-session image cache in `ImageWithLoader` to detect images that have not been shown yet in the current client session.
- Added a first-load-only reveal animation on uncached images:
  - blurred/transparent image state while decoding,
  - smooth fade to sharp image on completion,
  - optional blur placeholder overlay using the stored `blurDataURL`.
- Applied the same shared image behavior to dashboard and page loading shells so route loading states and live cards reveal consistently.
- Kept the animation free of any scale transform to avoid the earlier jarring size-change effect.

Validation:
- `npm run lint` passed.

## 40) Rich-Text Dropdown Layering Fix (2026-03-14)

User follow-up:
- The rich-text font-size dropdown was being obscured by the editor content and should render on top.

Files updated:
- `components/page/RichTextEditor.js`

Changes:
- Removed the toolbar overflow behavior that was clipping the Quill picker menu after the single-line toolbar adjustment.
- Added explicit stacking order so the toolbar and its dropdown options render above the editor content area.
- Kept the toolbar controls on one row without reintroducing the wrapped `B I U` layout.

Validation:
- `npm run lint` passed.

## 39) Restore Rich-Text Expansion + Single-Line Toolbar (2026-03-13)

User follow-up:
- Keep the modal height stable, but restore the rich-text editor's normal expansion/scroll behavior.
- Keep the text size control and `B I U` options on one line.

Files updated:
- `components/page/RichTextEditor.js`
- `components/page/RichTextEditorFallback.js`
- `components/page/CreatePostModal.js`
- `components/page/EditPostModal.js`

Changes:
- Switched the editor frame back from a fixed height to a reserved minimum height so the empty-state modal remains stable but longer descriptions can expand and scroll as before.
- Kept the earlier single-step editor loading change, so the placeholder swap no longer happens in two phases.
- Updated the Quill toolbar layout to a no-wrap horizontal row with grouped controls held on one line and horizontal overflow suppressed visually.

Validation:
- `npm run lint` passed.

## 38) Remove Residual Rich-Text Height Shift (2026-03-13)

User follow-up:
- There was still a tiny modal height change when the description editor finished loading.

Files updated:
- `components/page/RichTextEditor.js`
- `components/page/RichTextEditorFallback.js`
- `components/page/CreatePostModal.js`
- `components/page/EditPostModal.js`

Changes:
- Removed the nested dynamic import inside `RichTextEditor` so the placeholder-to-editor swap happens in a single step.
- Locked the create/edit description editor to an exact frame height and made the Quill shell fill that frame instead of recalculating its own outer height on mount.
- Matched the fallback shell dimensions to the mounted toolbar/body split more precisely to eliminate the remaining 1-2px shift.

Validation:
- `npm run lint` passed.

## 31) Magic Link Form View + Shared Loading Chrome (2026-03-13)

User-requested follow-up:
- Clicking `sign in with magic link` should open a dedicated email-only form view.
- Preserve any email already typed into the main login form.
- Remove the duplicate login link on signup.
- Make `page.js` auth loading and `loading.js` use the same card dimensions so status changes do not cause visual shift.

Files updated:
- `app/login/page.js`
- `app/login/loading.js`
- `app/login/AuthChrome.js`

Changes:
- Added dedicated magic-link form state in login flow:
  - secondary button now opens a separate email-only form view,
  - email field is shared with the main login form so typed email is preserved,
  - success state remains inside the magic-link form view with a back-to-login action.
- Removed the extra duplicate `Already have an account? Log In` action from the signup form body and kept a single footer login link.
- Extracted shared auth chrome/loading components into `app/login/AuthChrome.js`:
  - shared `AuthShell`
  - shared `AuthLoadingCard`
- Updated `page.js` loading branch to use the same loading card component as `loading.js`.
- Added a stable minimum auth-card height so login, signup, and loading states stay visually aligned with less layout shift.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 32) Compact Reset/Magic Auth States (2026-03-13)

User-requested follow-up:
- Let the password-reset and magic-link boxes be smaller again.

Files updated:
- `app/login/AuthChrome.js`
- `app/login/page.js`

Changes:
- Made the auth card minimum height optional in `AuthShell`.
- Kept the larger fixed-height card only for the main login/signup/loading states.
- Restored compact sizing for:
  - magic-link form view
  - forgot-password view
  - reset-password view

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 33) Auth Card Stability + Tighter `or` Spacing (2026-03-13)

User-requested follow-up:
- Halve the margin above and below `or`.
- Make the grey auth card identical in dimension between login, signup, and loading.

Files updated:
- `app/login/AuthChrome.js`
- `app/login/page.js`

Changes:
- Changed the main non-compact auth shell from a minimum height to a fixed height so:
  - login
  - signup
  - loading
  all use the same card dimension.
- Left compact sizing in place for reset and magic-link subviews.
- Tightened the login alternative-action layout:
  - `or` now sits with `mt-2.5`
  - magic-link button now sits with `mt-2.5`
  which halves the previous top/bottom spacing around that divider.
- Mirrored the same tighter spacing in the shared loading ghost layout.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 34) Magic Link Button Vertical Alignment (2026-03-13)

User-requested follow-up:
- Make the `Send magic link` button line up with where `Log In` sits in the standard login form.

Files updated:
- `app/login/page.js`

Changes:
- Added an invisible spacer row in the magic-link form matching the password-field height.
- This preserves the compact magic-link view while aligning the primary CTA to the same vertical position as the login CTA.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 35) Compact Card Top-Alignment For Magic-Link Toggle (2026-03-13)

User-requested clarification:
- Keep the magic-link box compact.
- Keep the button in the same screen position as the login CTA when toggling between login and magic-link views.

Files updated:
- `app/login/AuthChrome.js`

Changes:
- Wrapped compact auth cards in a fixed-height slot matching the main login card height.
- Aligned compact cards to the top of that slot instead of vertically centering them.
- This preserves the smaller magic/reset box size while keeping the magic-link CTA anchored to the same baseline when toggling from the login form.

Validation:
- `npm run lint` passed.
- `npm run build` passed.
- `npm run build` passed.
- `npm run build` passed.

## 36) Full-Width Compact Card Offset For Magic-Link Alignment (2026-03-13)

User-requested correction:
- Keep the magic-link form box at its normal compact dimensions.
- Keep the `Send magic link` button on the same vertical baseline as `Log In`.
- Avoid horizontal shrinking and avoid adding a large gap between the email field and the button.

Files updated:
- `app/login/AuthChrome.js`
- `app/login/page.js`

Changes:
- Made compact auth cards full-width inside the shared auth shell again.
- Removed the internal invisible spacer between the magic-link email field and CTA.
- Offset the entire compact card downward inside the shared fixed-height slot instead of altering the internal form spacing.
- This keeps:
  - compact box width/size intact
  - normal email-to-button spacing
  - button baseline aligned with the login CTA.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 15) Image Load Jank Reduction (2026-03-13)

User-reported issue:
- Card images briefly flashed blur and showed occasional temporary scale jumps during load.

Files updated:
- `components/ImageWithLoader.js`

Changes:
- Reworked `ImageWithLoader` to avoid forced blur/fade reset paths that caused visual flashing.
- Added a bounded in-memory loaded-image cache so previously seen image URLs render without re-entering loading state on route transitions.
- Removed per-image loading overlay/spinner from card image loader to prevent additional flicker.
- Defaulted Next/Image placeholder behavior to `empty` (with optional blur placeholder only when explicitly requested), preventing blur-scale placeholder artifacts.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 12) Modal Behavior Fixes (2026-03-12)

User-reported issues:
1. `PHOTO`, `URL`, `FILE` tab buttons in post edit modal were non-functional.
2. `Multiple` in create post modal did not switch into bulk upload modal flow like `VV_Original`.

Files updated:
- `components/page/EditPostModal.js`
- `components/page/CreatePostModal.js`
- `components/page/BulkUploadModal.js`
- `components/page/PageViewClient.js`

Fixes applied:
- Reworked `EditPostModal` tab handling to use mutable `contentType` state and explicit tab switch actions.
- Ensured submit payload always carries `content_type` and validates required inputs when changing tab type.
- Added proper `CreatePostModal` -> bulk modal transition via `onToMultiple` to mirror original flow.
- Added `BulkUploadModal` optional back action to return to single-post modal.
- Updated `PageViewClient` modal state orchestration for reliable create/bulk modal switching.

Behavior outcome:
- Edit modal tab buttons now switch correctly between `photo`, `url`, and `file`.
- Clicking `Multiple` from create-post now opens bulk upload modal (instead of only triggering hidden file input).

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 14) Route Transition Smoothness Pass (2026-03-13)

Implemented selected options:
1. Loading shell parity.
2. Route prefetching on likely navigation paths.
3. Instant return cache for route transitions.

Files updated:
- `app/[usernameTag]/loading.js`
- `app/[usernameTag]/[pageSlug]/loading.js`
- `components/dashboard/DashboardViewClient.js`
- `components/dashboard/PageCard.js`
- `components/page/PageViewClient.js`
- `lib/routeTransitionCache.js`

Changes:
- Rebuilt dashboard/page `loading.js` to visually match their destination screens (header style, stripe, spacing, card skeleton language).
- Added client-side transition snapshots for dashboard and page views (`routeTransitionCache`) so loading states can reuse recent data for immediate visual continuity.
- Added route prefetch behavior:
  - Dashboard page cards prefetch target page routes on hover/focus/touch and warms top few routes.
  - Page back button prefetches dashboard route on mount and on hover/focus/touch.
- Added first-load fallback behavior for loading routes:
  - No card grid when no snapshot route data exists.
  - Neutral grayscale theme fallback when no color data exists.

Expected result:
- Less visual jank between dashboard/page transitions.
- Faster-feeling navigation due to warmer route data/chunks.
- Loading UIs now align with actual page shells instead of generic gray placeholders.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 13) Overscroll + Horizontal Margin Parity (2026-03-12)

User-requested fixes:
1. Remove white area revealed on overscroll.
2. Remove overscroll bounce behavior (dashboard and page).
3. Match original horizontal spacing behavior:
   - Dashboard: no large side gutters.
   - Page: keep side margins.

Files updated:
- `app/globals.css`
- `app/layout.js`
- `components/dashboard/DashHeader.js`
- `components/dashboard/DashboardViewClient.js`
- `components/page/PageViewClient.js`

Changes:
- Added global non-white root surface (`html/body` black background) so overscroll never reveals white.
- Added global `overscroll-behavior: none` and `overscroll-behavior-y: none`.
- Set root layout `html/body` classes to black background for consistent fallback surface.
- Removed dashboard max-width wrapper and wide horizontal gutters so dashboard content spans like original.
- Removed dashboard header horizontal max-width wrapper (`DashHeader`) to keep edge-to-edge alignment.
- Added page-shell side margins on desktop (`md:px-6`) so the inset applies to both header and main body, matching original intent.
- Matched page-shell side-margin colour treatment to original by using a tinted outer shell (`hexToRgba(backHex, 0.5)`) with solid page body fill.
- Restored dashboard main-grid side spacing from full edge-to-edge back to the prior padded setting (`px-[8px] md:px-6`).

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 16) URL/FILE Thumbnail Support in Post Modals (2026-03-13)

User-requested issue:
- No thumbnail image selection path existed for `url` or `file` post types.

Files updated:
- `components/page/CreatePostModal.js`
- `components/page/EditPostModal.js`

Changes:
- Added thumbnail image selection support for `url` and `file` post flows in both create and edit modals.
- Split content-file upload handling from thumbnail-image upload handling so file posts can now carry:
  - content file (`content`)
  - optional thumbnail image (`thumbnail` + `blurDataURL`)
- Updated create modal submit payloads:
  - `url`: sends `content` and optional uploaded thumbnail metadata.
  - `file`: sends uploaded content file URL and optional uploaded thumbnail metadata.
- Updated edit modal submit payloads:
  - removed forced clearing of `thumbnail` / `blurDataURL` when editing `url` or `file`.
  - supports replacing thumbnail independently from content updates.
- Preserved existing `photo` behavior and existing required-field rules for URL/file content.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 17) Mandatory Thumbnails + Unified Post Modal Flow (2026-03-13)

User-requested follow-up:
1. Thumbnail must be mandatory for all post types.
2. `URL` and `FILE` posts should open through `PhotoShowModal` the same way photo posts do.

Files updated:
- `components/page/CreatePostModal.js`
- `components/page/EditPostModal.js`
- `components/page/PostCard.js`
- `components/page/PageViewClient.js`
- `components/page/PhotoShowModal.js`
- `app/api/posts/route.js`
- `app/api/posts/[postId]/route.js`
- `lib/data.js`

Changes:
- Enforced mandatory thumbnail requirement in create/edit post UI:
  - `url` create now requires URL + thumbnail.
  - `file` create now requires content file + thumbnail.
  - edit flow now blocks save for `photo`/`url`/`file` when no existing thumbnail and no new thumbnail is provided.
- Added backend validation to reject create/update for `photo`/`url`/`file` posts when thumbnail is missing.
- Updated update persistence to include `content_type` in `updatePost` so edit-tab type changes are saved.
- Unified post open behavior:
  - `PostCard` no longer opens URL posts directly in a new tab.
  - all non-optimistic posts now open the same `PhotoShowModal` flow.
  - removed separate file modal usage from page view routing.
- Updated `PhotoShowModal` to support all post types with type-aware actions:
  - `url`: Open Link button.
  - `file`: Open + Download buttons (targeting file content).
  - `photo`: Open + Download buttons (targeting image content).
  - modal display image now prioritizes `thumbnail` for consistent visual behavior.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 18) Extended Transition Cache Lifetime (2026-03-13)

User-reported issue:
- Page <-> dashboard transitions felt instant at first, but after ~5 minutes idle they regressed to cold-loading behavior.

Files updated:
- `next.config.mjs`
- `lib/routeTransitionCache.js`

Changes:
- Increased custom transition snapshot TTL from `45s` to `1h` so loading screens can still reuse recent page/dashboard visual data after longer idle periods.
- Enabled Next.js App Router client cache lifetime tuning via `experimental.staleTimes`:
  - `dynamic: 3600`
  - `static: 3600`
  (seconds)

Expected result:
- Prefetched dashboard/page route segments remain warm much longer.
- Snapshot-backed loading continuity persists beyond the prior 45-second window.
- Route switches should remain visually instant/smoother after several minutes of inactivity.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 19) Dashboard Padding Alignment Pass (2026-03-13)

User-requested refinements:
1. Increase dashboard card-grid area padding by roughly 30%.
2. Fix live dashboard header horizontal padding so it matches dashboard `loading.js`.

Files updated:
- `components/dashboard/DashboardViewClient.js`
- `components/dashboard/DashHeader.js`
- `app/[usernameTag]/loading.js`

Changes:
- Increased dashboard main content horizontal padding:
  - from `px-[8px] md:px-6`
  - to `px-[10px] md:px-8`
- Applied same padding increase to dashboard loading view so live/loading layouts stay consistent.
- Updated live dashboard header wrapper from `px-0` to `px-6 sm:px-8`, matching loading header bar horizontal spacing.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 20) Header Tone + Stripe Position Adjustment (2026-03-13)

User-requested refinements:
1. Make dashboard header base tone match page header.
2. Move the lighter stripe up so a small darker band remains below it (~5px).

Files updated:
- `components/dashboard/DashHeader.js`
- `components/page/PageViewClient.js`
- `app/[usernameTag]/loading.js`
- `app/[usernameTag]/[pageSlug]/loading.js`

Changes:
- Updated live dashboard header fill from translucent (`rgba`) to solid `dashHex` to match page header tone.
- Reworked both dashboard and page header stripe blocks (live + loading) so:
  - light stripe remains present,
  - a `5px` dark band is now rendered below the stripe.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 21) Grid Top Spacing + Info Editor Surface Parity (2026-03-13)

User-requested edits:
1. Add ~60% more padding above card grids on dashboard and page.
2. Make non-edit info text look like edit-mode shell (with subtler background and slight spacing adjustment), and make edit mode background slightly lighter.

Files updated:
- `components/dashboard/DashboardViewClient.js`
- `components/page/PageViewClient.js`
- `app/[usernameTag]/loading.js`
- `app/[usernameTag]/[pageSlug]/loading.js`
- `components/dashboard/DashboardInfoEditor.js`
- `components/page/PageInfoEditor.js`

Changes:
- Increased top spacing above grids from `pt-4` to `pt-[1.6rem]` (60% increase) on:
  - live dashboard/page views
  - dashboard/page loading shells (to preserve alignment).
- Updated dashboard/page info editor surfaces:
  - non-edit mode now uses boxed editor-like shell instead of transparent/plain rendering.
  - non-edit shell is intentionally subtle (`bg-neutral-100/40`) with adjusted spacing (`px-3.5 py-[8px]`) and reduced bottom margin (`mb-5`).
  - edit mode keeps the same shell but with slightly lighter background (`bg-neutral-100/56`) and autosave status badge visible.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 22) Info Surface Follow-up Fix (2026-03-13)

User-reported follow-up:
- Dashboard info surface changes were visible, but page info surface still looked like the previous plain non-edit rendering.

Files updated:
- `components/page/PageInfoEditor.js`
- `components/dashboard/DashboardInfoEditor.js`

Changes:
- Removed old non-edit early-return render path from `PageInfoEditor` that bypassed the new boxed editor shell.
- Forced both page/dashboard info areas through the same shell component path in non-edit mode.
- Increased visual contrast between normal and edit backgrounds so edit mode is clearly lighter:
  - non-edit: `bg-neutral-100/34`
  - edit: `bg-neutral-100/64`

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 23) Info Surface Intensity Revert (2026-03-13)

User-requested adjustment:
- Revert the most recent `DashboardInfoEditor` intensity tweak and make `PageInfoEditor` match that reverted style.

Files updated:
- `components/dashboard/DashboardInfoEditor.js`
- `components/page/PageInfoEditor.js`

Changes:
- Reverted editor/view surface values from:
  - edit: `bg-neutral-100/64`, view: `bg-neutral-100/34`
- Back to:
  - edit: `bg-neutral-100/56`, view: `bg-neutral-100/40`
- Applied the same values to both dashboard and page info editors for exact visual parity.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 24) Theme Sync Consistency Across Dashboard/Page (2026-03-13)

User-reported issue:
- After changing dashboard colors, page colors were intermittently stale/inconsistent.

Likely cause:
- Route prefetch/cache can serve older server payloads, while theme state was being re-initialized per route only from server props.

Files updated:
- `context/ThemeContext.js`
- `app/[usernameTag]/page.js`
- `app/[usernameTag]/[pageSlug]/page.js`

Changes:
- Added per-user client theme persistence in `ThemeProvider` via localStorage (`volvox_theme_<usernameTag>`):
  - loads latest saved theme for that user on mount,
  - persists every color change (`dashHex`, `backHex`) with timestamp.
- Added `storageKey={user.usernameTag}` to both dashboard and page route `ThemeProvider` usage so both routes share the same per-user client theme source.

Expected result:
- Dashboard color picks now stay consistent when navigating to pages, even if route payloads are temporarily stale due caching/prefetch timing.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 25) Page Body Full-Height Fix (2026-03-13)

User-reported issue:
- On pages with few posts, scrolling down revealed the end of the main body area and exposed outer shell background.

Files updated:
- `components/page/PageViewClient.js`
- `app/[usernameTag]/[pageSlug]/loading.js`

Changes:
- Reworked page shell and loading shell to use a flex-column full-height layout:
  - outer wrapper: `min-h-screen` + `flex flex-col`
  - main area: `flex-1`
- Removed the previous mismatch where outer wrapper was taller (`min-h-[150vh]`) than the solid page body (`min-h-screen`).

Expected result:
- Main page body surface now extends to the bottom of the viewport on sparse pages without exposing a bottom edge.
- Loading shell remains visually aligned with live page shell.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 26) Bottom Scroll Buffer Increase (2026-03-13)

User-requested adjustment:
- Increase blank scroll space at the bottom by about 100%.

Files updated:
- `components/dashboard/DashboardViewClient.js`
- `components/page/PageViewClient.js`
- `app/[usernameTag]/loading.js`
- `app/[usernameTag]/[pageSlug]/loading.js`

Changes:
- Doubled bottom spacing in main content shells:
  - `pb-36` -> `pb-72`
- Applied consistently across live dashboard/page and matching loading shells.

Validation:
- `npm run lint` passed.
- `npm run build` passed.

## 27) Login/Signup Theme Port From VV_Original (2026-03-13)

User request:
- Copy the `VV_Original` login/signup visual theme and appearance into `VV-Spawn2`.
- Keep Spawn2 auth behaviors and preserve the extra login link behavior.

Files updated:
- `app/login/page.js`
- `app/login/loading.js`

Changes:
- Replaced Spawn2 auth page shell with the original dark visual language:
  - full-screen background image treatment using `/public/background-800.webp` and `/public/background-1920.webp`,
  - dark translucent auth card (`bg-black/60`, subtle border, low blur),
  - original typography/spacing pattern (`Volvox Works`, centered stacked layout).
- Restyled all auth form controls to match original input/button appearance:
  - dark field surfaces with white text and muted placeholders,
  - light neutral primary button style and disabled state matching original feel,
  - compact uppercase status/error treatment.
- Kept Spawn2 functionality intact inside the new shell:
  - password login, magic-link login, signup, forgot password, reset password, token URL handling, and session redirect.
- Preserved login path/link behavior:
  - retained back-to-login actions and explicit signup->login link.
- Updated `app/login/loading.js` to visually match the same shell so loading and loaded states align.

Validation:
- `npm run lint` passed.

## 28) Login Flow Simplification + Loading Box Dimension Match (2026-03-13)

User-requested follow-up:
- Remove login/signup top toggle.
- Replace “join waitlist” footer text with signup link.
- Ensure `app/login/loading.js` middle box dimensions match loaded login card.

Files updated:
- `app/login/page.js`
- `app/login/loading.js`

Changes:
- Removed the top login/signup segmented toggle from the auth card.
- Switched mode selection to link-driven routing:
  - login view footer link -> `/login?mode=signup`
  - signup view footer/login action -> `/login`
- Replaced waitlist footer copy with direct auth links:
  - `Don&apos;t have an account? Sign Up`
  - `Already have an account? Log In`
- Added mode-change state reset effect so forgot/magic/transient state does not leak when changing between login and signup modes.
- Adjusted loading shell card dimensions to match live auth card:
  - `py-[38px]` -> `py-10`
  - mirrored login-mode ghost layout (mode row + fields + actions + footer) so center-box height/width stays aligned during loading.

Validation:
- `npm run lint` passed.

## 37) Stable Description Editor Height In Post Modals (2026-03-13)

User request:
- Remove the visible height snap in the create-post modal when the description editor hydrates.

Files updated:
- `components/page/CreatePostModal.js`
- `components/page/EditPostModal.js`
- `components/page/RichTextEditorFallback.js`

Changes:
- Moved the modal-level rich-text editor import to `next/dynamic` with SSR disabled, matching the original pattern more closely.
- Added a shared `RichTextEditorFallback` shell that reserves the full toolbar + editor height immediately on modal open.
- Wrapped the description editor slot in a matching minimum-height frame so the modal box height stays stable while the Quill bundle hydrates.
- Applied the same behavior to both create and edit post modals to keep their interaction identical.

Validation:
- `npm run lint` passed.

## 44) Bulk Upload Post Slug Collision Fix (2026-03-14)

User issue:
- Parallel image uploads could fail with Mongo duplicate-key errors on the `(pageId, slug)` post index.

Files updated:
- `lib/data.js`

Changes:
- Identified the root cause in `createPost()`: multiple concurrent creates were all resolving the same base slug (for example `photo`) before insert, then colliding on the unique index.
- Changed post creation to reserve `postCount` atomically up front, which also gives each concurrent post a stable unique `order_index`.
- Added duplicate-key retry logic for post slug creation so concurrent inserts fall back to a new unique slug instead of returning a 500.
- Added rollback of the reserved `postCount` if post creation fails after reservation.
