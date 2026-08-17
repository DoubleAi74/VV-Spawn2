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
