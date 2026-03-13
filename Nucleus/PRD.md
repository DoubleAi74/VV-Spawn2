# PRD — volvox.works

---

## 1. Product Overview

volvox.works is a self-publishing platform for creative academics. Users create a public profile and organise their work into **pages** (collections) containing **posts** (individual items). Each post can be an image, a file (PDF, HTML, etc.), a URL, or text. Profiles are publicly accessible by default; individual pages may be set to private. The platform is designed around fast image loading, a clean grid-based layout, and per-user colour theming.

---

## 2. Problem Statement

Creative academics — researchers, artists, independent scholars — lack a simple, dedicated space to publish and organise their work publicly. General social platforms impose format restrictions, while academic repositories are too rigid for mixed-media portfolios. volvox.works provides a lightweight, self-managed publishing space with no editorial gatekeeping.

---

## 3. Target Users and Personas

**Primary persona — The Creative Academic**
- Works at the intersection of academic research and creative practice
- Wants to publish images, PDFs, HTML experiments, and other files under a single public URL
- Non-technical to moderately technical; expects a fast, clean UI with minimal friction
- Shares their profile URL with collaborators, institutions, or the public

**Secondary persona — The Visitor**
- A colleague, student, or member of the public browsing a user's profile
- Not logged in; can view all non-private pages and their posts
- May navigate directly to a deep link (e.g. a specific post)

---

## 4. Goals and Non-Goals

### Goals
- Allow any user to sign up, create a profile, and immediately begin publishing content
- Support images, files, URLs, and text as post types
- Make profiles publicly accessible without requiring login
- Provide per-user colour theming (header bar colour, background colour)
- Deliver fast perceived performance through image blur-up loading and optimistic UI
- Keep the UI minimal and focused — no social features, no feeds, no discovery layer

### Non-Goals
- Social features (follows, likes, comments, feeds)
- Content discovery or search across users
- Paid tiers or subscription billing
- Video hosting or streaming
- Content moderation tools
- Mobile-native app (web only)

---

## 5. Feature Catalog

| ID | Feature | Priority |
|----|---------|---------|
| FEAT-01 | User registration (email/password + magic link) | P0 |
| FEAT-02 | Login with email/password | P0 |
| FEAT-03 | Magic link (passwordless) login via email | P0 |
| FEAT-04 | Password reset via email | P0 |
| FEAT-05 | Public user dashboard at `/:usernameTag` | P0 |
| FEAT-06 | Page management (create, edit, delete, reorder) | P0 |
| FEAT-07 | Post management (create, edit, delete, reorder) | P0 |
| FEAT-08 | Image post upload with client-side compression | P0 |
| FEAT-09 | File post upload (PDF, HTML, other; 100 MB max) | P0 |
| FEAT-10 | URL post | P0 |
| FEAT-11 | Text post | P0 |
| FEAT-12 | Bulk image upload (multiple images → multiple posts) | P1 |
| FEAT-13 | Page privacy toggle (isPrivate) | P1 |
| FEAT-14 | Per-user header and background colour customisation | P1 |
| FEAT-15 | Inline display name editing | P1 |
| FEAT-16 | Dashboard rich-text info section (above page grid) | P1 |
| FEAT-17 | Page rich-text info sections (above and below post grid) | P1 |
| FEAT-18 | Photo lightbox modal (Open, Download, prev/next) | P1 |
| FEAT-19 | File viewer modal (Open, Download) | P1 |
| FEAT-20 | Image blur-up placeholder loading | P1 |
| FEAT-21 | Skeleton loading screens | P2 |
| FEAT-22 | Optimistic UI for post/page creation (no flicker) | P1 |

---

## 6. Functional Requirements

### Authentication

**REQ-F-001** — The system must allow a new user to register with an email address, a display name, and a password.

**REQ-F-002** — The system must provide magic-link (passwordless) login: the user enters their email and receives a single-use sign-in link via Resend; clicking it authenticates them.

**REQ-F-003** — The system must provide password-based login with email and password.

**REQ-F-004** — The system must provide a password reset flow: user requests reset via email, receives a Resend-delivered link, and sets a new password.

**REQ-F-005** — Login and signup must be presented as two tabs on a single page (`/login`).

**REQ-F-006** — On registration the system must auto-generate a `usernameTag` (lowercase, hyphen-separated) derived from the display name, ensuring uniqueness by appending an incrementing suffix if needed.

**REQ-F-007** — Sessions must be managed with JWT tokens via Auth.js. Tokens must be refreshed transparently.

### Profiles and Visibility

**REQ-F-008** — Each user must have a public profile accessible at `/:usernameTag`.

**REQ-F-009** — Non-authenticated visitors must be able to view any dashboard and any non-private page and its posts.

**REQ-F-010** — Non-authenticated visitors must not see pages marked `isPrivate: true`.

**REQ-F-011** — Editing controls (create, edit, delete, reorder) must only be visible to the authenticated owner of the profile.

### Dashboard

**REQ-F-012** — The dashboard must display the user's display name in the fixed header bar.

**REQ-F-013** — The owner must be able to edit their display name inline; the `usernameTag` (URL slug) updates to match and a preview of the resulting URL must be shown before saving.

**REQ-F-014** — The dashboard must display a rich-text info section above the page card grid.

**REQ-F-015** — The dashboard must display a grid of page cards, each showing a thumbnail and title.

**REQ-F-016** — The owner must be able to create a new page via a modal (title, subtitle, privacy toggle, thumbnail image).

**REQ-F-017** — The owner must be able to edit a page's title, subtitle, slug, thumbnail, and privacy setting.

**REQ-F-018** — The owner must be able to delete a page; all child posts and their stored files must be deleted.

**REQ-F-019** — The owner must be able to reorder pages using up/down arrow controls.

**REQ-F-020** — The header bar colour and background colour must each be independently customisable via a colour picker; selections must persist to the database.

### Page View

**REQ-F-021** — Each page must be accessible at `/:usernameTag/:pageSlug`.

**REQ-F-022** — The page view must display the page title in the fixed header bar.

**REQ-F-023** — The page view must display a rich-text info section above the post grid.

**REQ-F-024** — The page view must display a grid of post cards, each showing a thumbnail and title.

**REQ-F-025** — The page view must display a rich-text info section below the post grid.

**REQ-F-026** — The owner must be able to create a new post via a modal with tabs for Photo, URL, and File content types. All types accept a title and rich-text description. Photo and File types accept a file upload. URL type accepts a URL string.

**REQ-F-027** — The owner must be able to upload multiple images at once (bulk upload); each image becomes a separate post with an empty title and description.

**REQ-F-028** — The owner must be able to edit a post's title, description, content/file, and thumbnail.

**REQ-F-029** — The owner must be able to delete a post; its stored files must be deleted from R2.

**REQ-F-030** — The owner must be able to reorder posts using arrow controls.

### Post Display

**REQ-F-031** — Clicking an image post card must open a lightbox modal displaying the full image, the post title, and Open / Download / Close controls, with previous/next navigation between image posts on the page.

**REQ-F-032** — Clicking a file post card must open a file modal displaying the post title, description, and Open / Download / Close controls.

**REQ-F-033** — Clicking a URL post card must navigate to the external URL (new tab).

### File Handling

**REQ-F-034** — Before upload, the client must compress images to a maximum edge dimension of 2400 px and convert to JPEG.

**REQ-F-035** — The system must support HEIC/HEIF image input and convert it client-side before upload.

**REQ-F-036** — Files must be uploaded directly from the client to Cloudflare R2 using server-generated presigned URLs.

**REQ-F-037** — The system must generate a base64 blur-data placeholder for each image and store it with the post.

**REQ-F-038** — Batch presigned URLs must be available for bulk image uploads (up to 50 files per request).

---

## 7. Non-Functional Requirements

**REQ-NF-001** — Images must render with a blur-up placeholder immediately on load; the full image must replace the placeholder without layout shift. *(Measurable: zero layout shift (CLS = 0) for images with stored blur data.)*

**REQ-NF-002** — File upload limit must be enforced at 100 MB per file; uploads exceeding this must be rejected with a clear error message.

**REQ-NF-003** — Post cards must not flicker or disappear during an in-progress upload. Optimistic UI must show the new card immediately; rollback must occur only on confirmed failure. *(Measurable: no DOM removal event on the new card during a successful upload.)*

**REQ-NF-004** — Client-side image compression must reduce images larger than 2400 px on their longest edge before upload, targeting JPEG quality 0.9. *(Measurable: no uploaded image file exceeds 2400 px on its longest edge.)*

**REQ-NF-005** — Every page must load scrolled to the top (y = 0). No programmatic scroll manipulation may be applied on route transitions or data loads.

**REQ-NF-006** — All interactive elements must be keyboard-accessible and have visible focus indicators. Semantic HTML elements (`button`, `a`, `dialog`, `nav`) must be used for their appropriate roles.

**REQ-NF-007** — API route handlers that mutate data must reject unauthenticated requests with HTTP 401.

**REQ-NF-008** — MongoDB Atlas must be used as the database. Connection must use connection pooling appropriate for a serverless/edge deployment.

---

## 8. User Journey Definitions

### Journey 1 — New User Registration
1. User visits `/login` and selects the Sign Up tab.
2. User enters display name, email, and password.
3. System creates a MongoDB user document, generates `usernameTag`, issues a JWT session.
4. User is redirected to their dashboard at `/:usernameTag`.

### Journey 2 — Magic Link Login
1. User visits `/login`, selects Login tab, chooses magic link option, enters email.
2. System sends a sign-in link via Resend.
3. User clicks link in email; Auth.js validates the token.
4. User is redirected to their dashboard.

### Journey 3 — Publishing a Page
1. Owner visits their dashboard, clicks `+ New Page` in the bottom action bar.
2. Owner fills in title, optional subtitle, privacy toggle, and optional thumbnail.
3. System creates the page document; a new card appears immediately (optimistic).
4. Owner clicks the card to enter the page view.

### Journey 4 — Publishing Posts
1. Owner is on a page view, clicks `+ New Post`.
2. Owner selects content type (Photo / URL / File), fills in title, uploads or pastes content.
3. System creates the post optimistically; card appears in the grid without flicker.
4. Upload completes in background; final URLs are saved to the database.

### Journey 5 — Visitor Browsing
1. Visitor navigates to `/:usernameTag` — no login required.
2. Visitor sees the public dashboard with non-private page cards.
3. Visitor clicks a page card, browses posts, clicks an image post to open the lightbox.

### Journey 6 — Colour Customisation
1. Owner is on their dashboard in edit mode.
2. Owner clicks a colour swatch in the header area.
3. Colour picker opens; owner selects a colour.
4. Header bar and/or background colour updates immediately (optimistic).
5. Selection is persisted to the database.

---

## 9. Acceptance Criteria

**AC-001 (REQ-F-001, REQ-F-007)** — Given a new email and valid password, when the user submits the signup form, then a user document is created in MongoDB, a JWT session is issued, and the user is on their dashboard within 3 seconds.

**AC-002 (REQ-F-002)** — Given a registered email, when the user requests a magic link, then an email arrives containing a single-use link that authenticates the user on click and expires after 10 minutes.

**AC-003 (REQ-F-009, REQ-F-010)** — Given a non-authenticated visitor, when they navigate to a page with `isPrivate: false`, then all posts are visible. When they navigate to a page with `isPrivate: true`, then the page is not found (404 or redirect).

**AC-004 (REQ-F-031, REQ-NF-003)** — Given the owner uploads a new image post, when the upload begins, then a post card with a loading indicator appears immediately. When the upload completes, the card updates with the real thumbnail without being removed from the DOM.

**AC-005 (REQ-NF-001)** — Given a page with image posts, when the page loads, then each image card shows a blurred placeholder immediately, which resolves to the full image without the card changing height or position.

**AC-006 (REQ-F-034)** — Given an image file larger than 2400 px on its longest edge, when the user selects it for upload, then the client resizes it to 2400 px max before the upload begins.

**AC-007 (REQ-NF-002)** — Given a file larger than 100 MB, when the user attempts to upload it, then the system rejects the file before requesting a presigned URL and shows a clear error message.

**AC-008 (REQ-F-020)** — Given the owner is on their dashboard, when they change the header colour using the colour picker, then the header bar updates immediately and the colour persists after a page reload.

**AC-009 (REQ-NF-005)** — Given any route navigation, when the new page renders, then `window.scrollY` must equal 0 without any programmatic scroll reset.

**AC-010 (REQ-F-013)** — Given the owner edits their display name inline, when they save, then the URL preview updates to reflect the new `usernameTag`, and navigating to the new URL loads their dashboard.

---

## 10. Assumptions

| ID | Assumption | Confidence |
|----|-----------|-----------|
| A-01 | A single user account maps to a single public profile; there are no organisation or team accounts. | High |
| A-02 | There is no admin panel or moderation interface in the initial build. | High |
| A-03 | `usernameTag` changes are allowed but old URLs are not redirected. | Medium |
| A-04 | Magic link tokens expire after 10 minutes; this is a reasonable default for the target audience. | Medium |
| A-05 | The platform will operate at small-to-medium scale (hundreds to low thousands of users) in its initial form; MongoDB Atlas free/shared tier or M10 is sufficient. | Medium |
| A-06 | Text post type stores its content as plain or rich text in the database; no external storage needed. | High |
| A-07 | The display name and `usernameTag` are always in sync (changing one updates the other). | High |
| A-08 | There is no email verification step on signup; the user is immediately active after registration. | Medium |

---

## 11. Open Questions

| ID | Question |
|----|---------|
| OQ-01 | **Resolved:** Changing `usernameTag` breaks old links — no redirect. (PRD A-03) |
| OQ-02 | **Resolved:** No email verification on signup in this build; user is immediately active. (PRD A-08) |
| OQ-03 | **Resolved:** Uploading an HTML file is sufficient; no iframe embed type. |
| OQ-04 | **Resolved:** Private pages return 404 (do not reveal existence). |
| OQ-05 | **Resolved:** No hard maximum on pages or posts per user in this build. |
