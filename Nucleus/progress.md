# Build Progress

## Current State
All 13 tasks complete. Full Next.js 15 (App Router) application built from scratch. Auth system (credentials + magic link + password reset), MongoDB/Mongoose data layer, Cloudflare R2 file storage, client-side image processing (HEIC, compression, blur), dashboard with page CRUD and colour theming, page view with post CRUD, bulk upload, lightbox, file modal, optimistic UI via useQueue. Lint clean, build passes (20 routes).

## Active Spec Set
- PRD: PRD.md
- DESIGN: DESIGN.md
- ARCHITECTURE: ARCHITECTURE.md

## Spec Clarification
- Status: complete
- Batches asked: 1

## Command Baseline
- Package manager: npm
- Install: npm install
- Lint: npm run lint
- Typecheck: N/A (JavaScript, no TypeScript)
- Test: N/A (no automated test suite; manual verification per ARCHITECTURE §9)
- Build: npm run build
- E2E: N/A

## Assumptions Log
| ID | Confidence | Statement | Impacted REQ IDs | Status |
|---|---|---|---|---|
| A-001 | High | No Auth.js adapter used. Custom VerificationToken MongoDB collection handles magic link tokens. Signup requires password. | REQ-F-001, REQ-F-002 | Open |
| A-002 | High | sanitize-html used for server-side rich text sanitisation | REQ-F-014, REQ-F-023, REQ-F-025 | Open |
| A-003 | High | React Compiler enabled (reactCompiler: true in next.config.mjs) | All | Open |
| A-004 | High | Green-field build — no existing R2 files or MongoDB data to preserve | All | Open |
| A-005 | High | Info sections hidden from visitors when empty; visible only to owner in edit mode | REQ-F-014, REQ-F-023, REQ-F-025 | Open |
| A-006 | High | PasswordResetToken stored in its own MongoDB collection | REQ-F-004 | Open |
| A-007 | Medium | No maximum on pages or posts per user | REQ-F-006 | Open |
| A-008 | High | Private pages return 404 to visitors (do not reveal existence) | REQ-F-010 | Open |

## Task Board
| Task ID | Title | REQ IDs | Depends On | Test Plan | Definition of Done | Status |
|---|---|---|---|---|---|---|
| T01 | Project scaffolding | — | — | npm install succeeds; next build scaffolding present | package.json, next.config.mjs, tailwind.config.js, jsconfig.json, postcss.config.js, .eslintrc.json present | done |
| T02 | Database layer | REQ-NF-008 | T01 | Files present; schema fields match spec | lib/db.js, lib/models/{User,Page,Post,VerificationToken,PasswordResetToken}.js created with correct schemas | done |
| T03 | Data access functions | REQ-F-006,F-008,F-012,F-015–F-019,F-021,F-024,F-026–F-030 | T02 | All exported functions present and match DESIGN §5 contracts | lib/data.js implements all functions from DESIGN §5 interface table | done |
| T04 | R2 storage API routes | REQ-F-036,F-038,REQ-NF-002,REQ-NF-007 | T01 | Routes respond; 100 MB check present; unauth → 401 | lib/r2.js + /api/storage/{upload,upload-batch,delete}/route.js | done |
| T05 | Image processing | REQ-F-034,F-035,F-037,REQ-NF-001,REQ-NF-004 | T01 | processImage.js exports compress/blur functions | lib/processImage.js + /api/generate-blur/route.js | done |
| T06 | Authentication system | REQ-F-001–F-007,REQ-NF-007 | T02,T03 | Auth routes present; JWT callbacks include userId/usernameTag/usernameTitle | lib/auth.js + /api/auth/[...nextauth] + signup + magic-link + reset routes | done |
| T07 | App shell | REQ-F-007,F-020,REQ-NF-005 | T06 | Build passes with layout present | app/layout.js, globals.css, page.js, AuthContext.js, ThemeContext.js, cloudflareLoader.js | done |
| T08 | Login page | REQ-F-001–F-005 | T06,T07 | Page renders; tabs present | app/login/page.js with Login + Sign Up tabs | done |
| T09 | useQueue hook | REQ-NF-003 | T01 | Hook exported; create/update/delete queues present | lib/useQueue.js | done |
| T10 | Dashboard | REQ-F-008–F-020,REQ-NF-001,REQ-NF-003,REQ-NF-005,REQ-NF-006 | T03,T07,T09 | npm run build passes; all dashboard components present | Server component + DashboardViewClient + all sub-components (header, name edit, colour picker, info editor, page CRUD, page cards) | done |
| T11 | Page view | REQ-F-021–F-033,REQ-NF-001,REQ-NF-002,REQ-NF-003,REQ-NF-006 | T03,T05,T07,T09,T10 | npm run build passes; all page components present | Server component + PageViewClient + all post components (info editors, post CRUD, bulk upload, lightbox, file modal, post cards) | done |
| T12 | 404 + error pages | REQ-F-009,F-010 | T07 | not-found.js present | app/not-found.js renders gracefully | done |
| T13 | Lint + build validation | All | T01–T12 | Both pass cleanly | npm run lint passes; npm run build succeeds | done |

## Blockers
| Blocker ID | Task ID | Cause | Attempts | Impact | Unblock Question | Status |
|---|---|---|---|---|---|---|
