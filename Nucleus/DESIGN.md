# DESIGN — volvox.works

---

## 1. System Behavior Overview

volvox.works is a two-level content hierarchy: a user owns **pages** (collections), and each page contains **posts** (items). The system is read-heavy; visitors browse profiles without logging in. Mutations (create, edit, delete, reorder, colour customise) are owner-only and are applied optimistically in the UI — the card or change appears immediately while the database write completes in the background. If the write fails, the optimistic change is rolled back.

All pages load scrolled to the top. The fixed header bar is always visible. Editing controls are conditionally rendered based on whether the authenticated user matches the profile owner.

---

## 2. UI/UX Flow Definitions

### 2.1 Authentication Flow (`/login`)

- The page presents two tabs: **Login** and **Sign Up**.
- **Sign Up tab**: fields for Display Name, Email, Password. On submit, account is created, JWT session issued, redirect to `/:usernameTag`.
- **Login tab**: fields for Email and Password, plus a "Send magic link" option.
  - Password login: validates credentials, issues JWT, redirects to dashboard.
  - Magic link: user enters email only, submits. System sends Resend email. Page shows confirmation message. User clicks link in email → authenticated, redirected to dashboard.
- **Forgot password**: link on Login tab. User enters email, receives Resend password-reset link. Link opens a password-reset form. On success, redirect to Login tab.
- All auth forms show inline field validation errors before submission and a general error message on failure.

### 2.2 Dashboard (`/:usernameTag`)

**Logged-out visitor state:**
- Fixed header bar: display name (left). Bottom-right action bar: `+ Create your collection` button and `Login` button.
- Body: rich-text info section (if set), page card grid (non-private pages only), optional second info section below grid.

**Logged-in owner state (view mode):**
- Fixed header bar: display name (left). Bottom-right: `Edit`, email display, logout button.
- Body: same as visitor state but shows all pages including private ones.

**Logged-in owner state (edit mode):**
- Fixed header bar: display name with inline-edit icon (clicking opens name edit input + URL preview + Save). Two colour swatches appear in the header area; clicking either opens a colour picker. Bottom-right: `+ New Page`, `Edit` (active), email, logout.
- Page cards gain edit controls: edit icon, delete icon, drag/reorder arrows.
- Info sections become editable (rich text editor activates).

### 2.3 Inline Display Name Edit
- Owner clicks the name or the edit icon next to it in the header.
- Header shows a text input pre-filled with current name, a preview line showing the resulting URL (`volvox.works/:new-slug`), and a Save button.
- On save: display name and `usernameTag` update; browser navigates to the new URL.

### 2.4 Colour Picker
- Two small coloured squares in the top-right of the header (header colour swatch, background colour swatch).
- Clicking a swatch opens a floating colour picker (HSB gradient + RGB input fields).
- Colour change is applied immediately to the page (optimistic). On close or after debounce, the value is persisted to the database.

### 2.5 Create Page Modal
- Fields: Page Title (required), Brief Subtitle (optional), Private Page checkbox, Thumbnail Image (required — file picker).
- Thumbnail image is uploaded to R2 before the page document is created.
- On Create: modal closes, new page card appears immediately in the grid (optimistic). Card shows a loading state until upload completes.
- On cancel: no changes.

### 2.6 Edit Page Modal
- Same fields as Create. Pre-filled with existing values.
- Thumbnail change triggers a new R2 upload; old thumbnail is deleted.
- On Update: modal closes, card updates immediately.

### 2.7 Page View (`/:usernameTag/:pageSlug`)

**Logged-out visitor state:**
- Fixed header bar: page title (left). Navigation back to dashboard (implied by clicking the title or a back element).
- Body: rich-text info section 1 (above grid), post card grid (all posts for non-private page), rich-text info section 2 (below grid).

**Logged-in owner (edit mode):**
- Bottom-right: `+ New Post`, `Edit` (active), email, logout.
- Post cards gain edit/delete icons and left/right reorder arrows.
- Info sections become editable.

### 2.8 Create Post Modal
Tabs: **Photo**, **URL**, **File**, **Close**.

**Photo tab:**
- Fields: Title (optional), Upload (single image file picker + "Multiple" toggle for bulk), Description (rich text).
- "Multiple" toggle switches to bulk upload mode (see 2.10).
- On Create: modal closes, post card appears immediately (optimistic with loading indicator on thumbnail).

**URL tab:**
- Fields: Title (optional), URL (required, string), Description (rich text).
- On Create: modal closes, post card appears with link icon thumbnail placeholder.

**File tab:**
- Fields: Title (optional), Upload (file picker, 100 MB max), Description (rich text).
- On Create: modal closes, post card appears immediately (optimistic).

### 2.9 Edit Post Modal
- Same tabs as Create. Pre-filled. Shows current file URL as a link.
- Photo/File tabs offer separate "Change Image" and "Change File" controls.
- Order Index field shown for manual reordering override.
- On Update: post card updates immediately.

### 2.10 Bulk Upload Modal
- Activated by "Multiple" toggle in Create Post > Photo tab.
- Drag-and-drop or file picker accepts multiple image files.
- Preview grid shows selected images with names.
- Upload button reads "Upload N Images".
- Each image becomes a separate post with empty title and description.
- Posts appear in grid as they complete; no flicker on existing cards.

### 2.11 Photo Lightbox Modal
- Opens when any image post card is clicked (visitor or owner).
- Full-screen dark overlay.
- Shows image at maximum available size, post title, and action buttons: **Open** (new tab), **Download**, **Close**.
- Left/right navigation arrows cycle through all image posts on the current page in their display order.

### 2.12 File Viewer Modal
- Opens when a file post card is clicked.
- Shows post title, description, and action buttons: **Open** (new tab), **Download**, **Close**.
- No prev/next navigation.

### 2.13 URL Post Behavior
- Clicking a URL post card navigates to the external URL in a new tab.
- No modal is shown.

### 2.14 Post Card Grid Layout
- Responsive CSS grid; 4+ columns on wide screens, fewer on narrow.
- Each card: thumbnail (blur-up), title below.
- In edit mode: hover shows reorder arrows on left/right (or up/down), edit icon, delete icon.
- Thumbnail loading: blur placeholder shown until full image loads; no layout shift.

### 2.15 Page Card Grid Layout (Dashboard)
- Same responsive grid.
- Each card: thumbnail (blur-up), title, optional subtitle.
- Private pages shown to owner only, with a visual indicator (e.g. lock icon).

---

## 3. Screen / Route State Matrix

| Route | Auth State | Visible Content | Editable? |
|-------|-----------|----------------|-----------|
| `/login` | Any | Login/Signup tabs | N/A |
| `/:usernameTag` | Visitor | Non-private pages, info sections | No |
| `/:usernameTag` | Owner (view) | All pages, info sections | No |
| `/:usernameTag` | Owner (edit) | All pages, info sections, edit controls | Yes |
| `/:usernameTag/:pageSlug` (public) | Visitor | Posts, info sections | No |
| `/:usernameTag/:pageSlug` (private) | Visitor | 404 / not found | No |
| `/:usernameTag/:pageSlug` | Owner | Posts, info sections, edit controls | Yes |
| `/:usernameTag/:pageSlug/:postSlug` | Any | Post detail (future) | No |

### Loading States
- All data-fetching routes show a skeleton screen (shimmer cards) while server data loads.
- Skeletons match the expected layout (header + grid of cards at approximate card size).

### Error States
- Private page accessed by visitor → 404 page.
- Non-existent `usernameTag` → 404 page.
- Non-existent `pageSlug` → 404 page.
- Upload failure → optimistic card removed, error toast shown.
- Auth failure → redirect to `/login`.

---

## 4. Data Model and Validation Rules

### User

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | Auto-generated |
| `email` | String | Required, unique, valid email format |
| `passwordHash` | String | Required for password login; bcrypt hash |
| `usernameTitle` | String | Required, 1–100 chars, trimmed |
| `usernameTag` | String | Required, unique, lowercase, alphanumeric + hyphens only, 2–50 chars |
| `pageCount` | Number | Integer ≥ 0; incremented atomically on page create/delete |
| `dashboard.infoText` | String | Optional, HTML string from rich text editor, max 10,000 chars |
| `dashboard.dashHex` | String | Optional, valid hex colour (e.g. `#2d3e50`); default: `#2d3e50` |
| `dashboard.backHex` | String | Optional, valid hex colour; default: `#e5e7eb` |
| `createdAt` | Date | Set on creation |

### Page

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | Auto-generated |
| `userId` | ObjectId | Required, ref to User |
| `usernameTag` | String | Denormalised from User; required |
| `slug` | String | Required, unique per user, lowercase, alphanumeric + hyphens, 2–100 chars |
| `title` | String | Required, 1–200 chars |
| `description` | String | Optional, max 500 chars |
| `thumbnail` | String | Optional, R2 URL |
| `blurDataURL` | String | Optional, base64 data URL |
| `isPrivate` | Boolean | Required, default `false` |
| `order_index` | Number | Integer ≥ 1; unique per user |
| `postCount` | Number | Integer ≥ 0; incremented atomically |
| `pageMetaData.infoText1` | String | Optional, HTML, max 10,000 chars |
| `pageMetaData.infoText2` | String | Optional, HTML, max 10,000 chars |
| `createdAt` | Date | Set on creation |

### Post

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | Auto-generated |
| `pageId` | ObjectId | Required, ref to Page |
| `slug` | String | Required, unique per page, lowercase, alphanumeric + hyphens |
| `title` | String | Optional, max 200 chars |
| `description` | String | Optional, HTML from rich text editor, max 10,000 chars |
| `content` | String | URL or R2 file URL; required for photo/file/url types |
| `content_type` | Enum | Required; one of: `photo`, `file`, `url`, `text` |
| `thumbnail` | String | Optional, R2 URL (auto-set for photo type) |
| `blurDataURL` | String | Optional, base64 data URL |
| `order_index` | Number | Integer ≥ 1; unique per page |
| `createdAt` | Date | Set on creation |

### Slug Generation Rules
- Base slug: display name or title lowercased, spaces to hyphens, non-alphanumeric stripped.
- Uniqueness check: query MongoDB for matching slug within the same scope (user for pages, page for posts).
- Collision resolution: append `-2`, `-3`, … until unique.
- Bulk-upload posts: use a UUID-derived slug to bypass sequential uniqueness checks.

### Ordering Rules
- `order_index` is 1-based and must be unique within its scope.
- Reordering swaps two adjacent `order_index` values atomically.
- After delete, remaining items are not automatically reindexed (gaps are permitted; sort by `order_index` ascending).
- A reindex function normalises gaps when needed.

---

## 5. API / Interface Contracts

All API routes are under `/api/`. All mutation routes require an authenticated session; unauthenticated requests return HTTP 401.

### POST `/api/auth/[...nextauth]`
Auth.js catch-all handler. Handles credential login, magic link, session, and JWT callbacks.

---

### POST `/api/storage/upload`
**Auth:** Required

Request:
```
{
  filename: string,      // original filename
  contentType: string,   // MIME type
  folder: string         // e.g. "users/{uid}/pages/{pageId}/posts"
}
```
Response (200):
```
{
  signedUrl: string,     // presigned R2 upload URL (PUT, expires 15 min)
  publicUrl: string      // permanent R2 CDN URL for the file
}
```
Error (400): `{ error: "Missing required fields" }`
Error (401): `{ error: "Unauthorised" }`

---

### POST `/api/storage/upload-batch`
**Auth:** Required

Request:
```
{
  files: [
    { filename, contentType, folder, clientId }
    // max 50 items
  ]
}
```
Response (200):
```
{
  urls: [
    { clientId, signedUrl, publicUrl }
  ]
}
```
Error (400): `{ error: "Exceeds maximum batch size of 50" }`

---

### POST `/api/storage/delete`
**Auth:** Required

Request:
```
{ fileUrl: string }    // full public R2 URL of the file to delete
```
Response (200): `{ success: true }`
Error (404): `{ error: "File not found" }`

---

### POST `/api/generate-blur`
**Auth:** Not required (called server-side for HEIC fallback)

Request:
```
{ imageUrl: string }   // public R2 URL of the image
```
Response (200):
```
{ blurDataURL: string }  // base64 data URL
```
Error (500): `{ error: "Failed to generate blur" }`

---

### MongoDB Data Access (via Mongoose, server-side only)

All data access functions live in `lib/data.js`. No direct database calls from client components. Server components and API route handlers call these functions. Key function signatures:

| Function | Purpose |
|----------|---------|
| `getUserByUsernameTag(tag)` | Fetch user document by `usernameTag` |
| `getPagesByUser(userId, includePrivate)` | Fetch pages sorted by `order_index` |
| `getPageBySlug(userId, slug)` | Fetch single page |
| `createPage(userId, data)` | Create page, increment user `pageCount` |
| `updatePage(pageId, data)` | Update page fields |
| `deletePage(pageId)` | Delete page + all child posts + all R2 files |
| `getPostsByPage(pageId)` | Fetch posts sorted by `order_index` |
| `getPostBySlug(pageId, slug)` | Fetch single post |
| `createPost(pageId, data)` | Create post, increment page `postCount` |
| `updatePost(postId, data)` | Update post fields |
| `deletePost(postId)` | Delete post + R2 files |
| `updateUserColours(userId, dashHex, backHex)` | Persist theme colours |
| `updateUserDashboard(userId, infoText)` | Persist dashboard info text |
| `updatePageMeta(pageId, infoText1, infoText2)` | Persist page info sections |
| `swapPageOrder(pageId1, pageId2)` | Swap `order_index` of two pages |
| `swapPostOrder(postId1, postId2)` | Swap `order_index` of two posts |

---

## 6. Business Rules and Domain Logic

**BR-001** — A page's `slug` must be unique per user (not globally). The same slug may exist across different users' pages.

**BR-002** — A post's `slug` must be unique per page. The same slug may exist across different pages.

**BR-003** — Deleting a page cascades: all child posts are deleted, and all R2 files referenced by those posts are deleted.

**BR-004** — Deleting a post deletes its R2 files (content and thumbnail if separate).

**BR-005** — A page with `isPrivate: true` must not appear in the dashboard grid for non-authenticated visitors, and its direct URL must return a 404.

**BR-006** — Only the authenticated user whose `_id` matches the `userId` on a page or post may modify or delete it. This check must occur in the data layer, not only in the UI.

**BR-007** — The `usernameTag` must remain unique across all users. If a requested tag is taken, append `-2`, `-3`, etc.

**BR-008** — Changing `usernameTitle` also updates `usernameTag` (regenerated from the new title). All page and post `slug` values scoped to that user remain unchanged.

**BR-009** — `pageCount` on User and `postCount` on Page are denormalised counters incremented/decremented atomically. Reconciliation functions must be available to correct out-of-sync counts.

**BR-010** — Bulk-uploaded images each become independent posts. There is no parent-group relationship between them.

**BR-011** — The content type of a post (`photo`, `file`, `url`, `text`) is set at creation and must not change on edit (the edit modal opens to the appropriate tab automatically).

**BR-012** — Image compression (2400 px max, JPEG 0.9) is applied client-side before any upload request is made. The server never receives the raw full-size original.

---

## 7. Error Handling and Recovery Paths

### Upload Failure
- If a presigned URL request fails: show error message in modal; do not create the post document.
- If the R2 upload fails: show error message; remove the optimistic card from the UI (rollback).
- If the database write fails after a successful R2 upload: show error message; attempt to delete the orphaned R2 file; remove the optimistic card.

### Auth Errors
- Expired JWT: Auth.js transparently refreshes. If refresh fails, redirect to `/login`.
- Unauthenticated access to an owner-only action: return 401; client shows an error toast.

### Network Errors
- All API calls should time out after 30 seconds and show a user-visible error message.
- No automatic retry for failed mutations; the user must re-attempt manually.

### Not Found
- Unknown `usernameTag`: render a 404 page.
- Unknown `pageSlug`: render a 404 page.
- Private page accessed by visitor: render a 404 page (do not reveal existence).

### Form Validation Errors
- All required fields validated before submission.
- Inline error messages appear below the relevant field.
- File-size validation (100 MB) occurs client-side before requesting a presigned URL.

---

## 8. Security and Privacy Behaviors

**SEC-001** — Passwords must be hashed with bcrypt (cost factor ≥ 12) before storage. Plain-text passwords must never be stored.

**SEC-002** — Magic link tokens must be single-use and expire after 10 minutes.

**SEC-003** — Password reset tokens must be single-use and expire after 60 minutes.

**SEC-004** — JWT tokens must be signed with a secret of at least 32 random bytes. Token lifetime should be 30 days with sliding renewal.

**SEC-005** — All API mutation routes must verify that the authenticated user owns the resource being modified before executing the mutation.

**SEC-006** — Presigned R2 upload URLs must expire within 15 minutes of generation.

**SEC-007** — R2 bucket must not have public `PUT` or `DELETE` access; all writes must go through server-generated presigned URLs.

**SEC-008** — Private pages (`isPrivate: true`) must be excluded from all server-side queries executed for non-authenticated requests.

**SEC-009** — Environment variables containing secrets (MongoDB URI, JWT secret, R2 keys, Resend API key) must not be exposed to the browser (`NEXT_PUBLIC_` prefix must not be used for secrets).

**SEC-010** — Rich text input (Quill HTML) stored in the database must be sanitised server-side before storage to prevent XSS when rendered.

---

## 9. Requirement Traceability

| REQ-ID | Design Element |
|--------|---------------|
| REQ-F-001 | Section 2.1 Sign Up tab |
| REQ-F-002 | Section 2.1 Magic link flow |
| REQ-F-003 | Section 2.1 Password login |
| REQ-F-004 | Section 2.1 Forgot password flow |
| REQ-F-005 | Section 2.1 tabs on `/login` |
| REQ-F-006 | Section 4 User model — `usernameTag` generation; BR-007 |
| REQ-F-007 | Section 5 Auth.js handler; SEC-004 |
| REQ-F-008 | Section 3 Route state matrix — visitor visibility |
| REQ-F-009 | Section 3 — visitor sees non-private pages; BR-005 |
| REQ-F-010 | Section 3 — private pages return 404; SEC-008 |
| REQ-F-011 | Section 2.2 — edit controls conditional on ownership |
| REQ-F-012 | Section 2.2 — header with display name |
| REQ-F-013 | Section 2.3 Inline Display Name Edit |
| REQ-F-014 | Section 2.2 — dashboard info text above grid |
| REQ-F-015 | Section 2.14 Page Card Grid |
| REQ-F-016 | Section 2.5 Create Page Modal |
| REQ-F-017 | Section 2.6 Edit Page Modal |
| REQ-F-018 | Section 2.2 — delete page; BR-003 |
| REQ-F-019 | Section 2.14 — reorder arrows on cards |
| REQ-F-020 | Section 2.4 Colour Picker |
| REQ-F-021 | Section 3 — page route |
| REQ-F-022 | Section 2.7 — page title in header |
| REQ-F-023 | Section 2.7 — info section 1 above grid |
| REQ-F-024 | Section 2.14 Post Card Grid |
| REQ-F-025 | Section 2.7 — info section 2 below grid |
| REQ-F-026 | Section 2.8 Create Post Modal |
| REQ-F-027 | Section 2.10 Bulk Upload Modal |
| REQ-F-028 | Section 2.9 Edit Post Modal |
| REQ-F-029 | Section 2.7 — delete post; BR-004 |
| REQ-F-030 | Section 2.7 — reorder arrows on post cards |
| REQ-F-031 | Section 2.11 Photo Lightbox Modal |
| REQ-F-032 | Section 2.12 File Viewer Modal |
| REQ-F-033 | Section 2.13 URL Post Behavior |
| REQ-F-034 | Section 6 BR-012 |
| REQ-F-035 | Section 6 — HEIC client-side conversion |
| REQ-F-036 | Section 5 `/api/storage/upload` |
| REQ-F-037 | Section 4 Post model — `blurDataURL` field |
| REQ-F-038 | Section 5 `/api/storage/upload-batch` |
| REQ-NF-001 | Section 2.14 — blur-up placeholder behavior |
| REQ-NF-002 | Section 7 Upload Failure; Section 2.8 file size validation |
| REQ-NF-003 | Section 2.8 — optimistic card; Section 7 Upload Failure rollback |
| REQ-NF-004 | BR-012 |
| REQ-NF-005 | No scroll manipulation anywhere in the codebase |
| REQ-NF-006 | Semantic HTML elements in all interactive components |
| REQ-NF-007 | Section 5 — all mutation routes require auth; SEC-005 |
| REQ-NF-008 | Section 4 Data Model |

---

## 10. Assumptions

| ID | Assumption | Confidence |
|----|-----------|-----------|
| A-01 | The colour picker is a floating popover component; no third-party picker library is specified. A custom or minimal picker built with a colour input and RGB fields is sufficient. | Medium |
| A-02 | Rich text sanitisation is done with a server-side HTML sanitiser (e.g. DOMPurify equivalent in Node). | High |
| A-03 | The bottom action bar is a fixed-position element rendered within each page's layout, not a global footer. | High |
| A-04 | Post cards in the grid are uniform size regardless of content type; the thumbnail area is used for all types. | High |
| A-05 | Prev/next navigation in the lightbox is limited to posts of type `photo` on the same page, ordered by `order_index`. | High |
| A-06 | The `usernameTag` change updates the URL immediately; Auth.js session is updated to reflect the new tag. | Medium |

---

## 11. Open Questions

| ID | Question |
|----|---------|
| OQ-01 | **Resolved:** URL post card opens in new tab. |
| OQ-02 | **Resolved:** Info sections are hidden from visitors when empty. Visible only to the owner in edit mode. |
| OQ-03 | **Resolved:** Lightbox supports both keyboard (arrow keys) and click-based prev/next navigation. |
| OQ-04 | **Resolved:** 50-character max enforced in UI (matches `usernameTag` schema maxlength). |
| OQ-05 | **Resolved:** Login page uses platform default styling (no user theme colour applied). |
