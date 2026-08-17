# Agent Brief — Volvox Works Hardening

**Read this file first, in full, before touching anything.**

You are picking up a planned improvement programme on an existing, live Next.js
application. The plan was written by an agent that reviewed the whole codebase, fixed
a real bug in it, and verified the fix against the production database and a real
browser. The plan is specific and grounded. Treat it as well-informed, not as gospel
— but if you are about to depart from it, say so first.

---

## Read order

1. **This file** — how to work.
2. **`plan/STAGES.md`** — what to do, in order. This is your running order.
3. **`plan/IMPROVEMENTS.md`** — why each item matters and what "done" looks like.
   Read the relevant entry before implementing any item; do not work from the
   one-line summary in `STAGES.md` alone.
4. **`plan/PROGRESS.md`** — create it on first use. Your running log and the handover
   if your context runs out.

Background, optional: `Nucleus/PRD.md` and `Nucleus/ARCHITECTURE.md` describe the
product's intent. `MIGRATION_CHANGELOG.md` and `imp.md` are historical and may
describe code that no longer exists — do not trust them over the actual source.

---

## The app in one minute

A self-publishing platform for creative academics. Users have a **profile**
(`/{usernameTag}`) containing **pages** (`/{usernameTag}/{pageSlug}`), each
containing **posts** — photo, file, URL or text. Profiles are public by default;
individual pages can be private. Per-user colour theming on header and background.

- Next.js 15 App Router, React 19, JavaScript (no TypeScript), Tailwind.
- MongoDB via Mongoose. Auth.js v5 with a JWT session strategy and two credentials
  providers (password, and a magic-link handshake token).
- Files in Cloudflare R2, served through a custom `next/image` loader that uses
  `cdn-cgi/image` transforms.
- The two public routes are `export const dynamic = 'force-dynamic'`.
- Client state uses an optimistic-update queue (`lib/useQueue.js`) that reconciles
  against fresh server props after mutations settle.

**Data access rule the codebase already follows: `lib/data.js` is server-only.**
Client components must never import it.

---

## Already done — do not redo

A page-ordering bug was found and fixed before this plan was handed to you. Four
pages shared `order_index: 1`, so the old value-swapping reorder was a database
no-op while the UI appeared to work. Fixing it exposed two further bugs, also fixed.

The resulting design — absolute idempotent placement, one deterministic sibling
sort, `flushSync` plus a sequence guard on the client — is described in
`IMPROVEMENTS.md` → "Context: what already happened". **Read that section before
touching anything ordering-related.** It also explains why you must **not** add a
unique index on `{ userId, order_index }`.

Existing assets you inherit:

- `lib/ordering.test.mjs` — 9 tests, `node --test lib/ordering.test.mjs`.
- `scripts/normalize-order.mjs` — repairs `order_index` and counter drift. Dry-run by
  default, `--commit` to apply. **This is the template for every database script you
  write.**

---

## Non-negotiables

1. **Never push, never merge, never force-push, never commit to `main`.** Work on a
   branch. Stop before any deployment step.
2. **Never write to the database from an ad-hoc command.** Every write goes through a
   script in `scripts/` that is dry-run by default, prints exactly what it would
   change, and applies only with `--commit`. Show the dry-run output and get
   confirmation before committing a write.
3. **Never commit secrets.** `.env.local` is gitignored and must stay that way. If an
   item needs a new environment variable, document its *name and purpose* in
   `PROGRESS.md`, never its value.
4. **Never fail silently, in the code or in your reporting.** If a check fails, say
   so with the output. If you skipped something, say you skipped it. A green summary
   over a broken build is the worst possible outcome here.
5. **Do not implement anything in the "Deliberately out of scope" table** in
   `IMPROVEMENTS.md`. Those were considered and declined. If you think one has become
   necessary, raise it and wait.
6. **Do not expand scope.** If you notice a new problem, record it in `PROGRESS.md`
   under "Discovered, not actioned" and carry on.

---

## How to work: the loop

For every item:

1. **Read** the item in `IMPROVEMENTS.md` — the whole entry, including "Done when".
2. **Confirm the problem still exists.** The plan was written against a snapshot. If
   the described behaviour is not what you observe, stop and report rather than
   implementing a fix for a problem that is not there.
3. **Implement.** Match the surrounding code's style, naming and comment density.
   This codebase uses British spellings in user-facing strings (`Unauthorised`,
   `sanitise`) — follow that.
4. **Verify against "Done when"**, not against "the code compiles".
5. **Log** one line in `PROGRESS.md`.

At the end of each stage, run the full verification gate from `STAGES.md`, complete
the stage's specific checks, then commit.

### Verification is not optional

The most valuable thing the previous agent did was verify in a real browser. It
caught a bug that reasoning had missed entirely: the UI showed a card at position 5
while the database had it at position 3, because two rapid clicks computed the same
relative swap and the duplicate cancelled the first out. Nothing about the code
looked wrong, and clicking through by hand looked fine.

**Assert on observable state, not on the absence of errors.** Count the requests.
Read the database. Compare the rendered order to the stored order.

---

## Subagent workflow

Use subagents where they genuinely pay. Each fresh subagent starts cold and
re-derives context, so spawning one per trivial edit costs more than it saves.

**Recommended pattern, per stage:**

| Phase | Who | Why |
|---|---|---|
| **Recon** | `Explore` subagent | Fans out across the files a stage touches and returns a map. Read-only, keeps large file dumps out of your context. Worth it for Stages 1, 3, 5, 7. |
| **Implement** | You, directly | Coherence matters more than parallelism. A stage is a connected set of changes; splitting it across cold agents produces inconsistent choices. |
| **Review** | Fresh `general-purpose` subagent | Give it the stage's exit criteria from `STAGES.md` and the output of `git diff`. Ask for defects and missed criteria only. **The reviewer must not be the implementer** — that is the entire value. |

**Parallel implementation** is worthwhile only for the item groups `STAGES.md`
explicitly marks "Safe to parallelise" — those were chosen because their file sets are
disjoint. Anywhere else, sequential is faster than resolving the conflicts.

Two more options if available in your harness:

- The `/code-review` skill is a good substitute for the review phase.
- `isolation: "worktree"` gives a subagent its own checkout, which is the safe way to
  attempt something exploratory like **MOT-4** (view transitions) without polluting
  the working tree if it fails.

**Do not** spawn a subagent to run the verification gate. It is four deterministic
commands; run them yourself and read the output.

---

## Driving the real app

Several stages need a browser. The app cannot be meaningfully tested logged out, and
there is no test account, so you need a session. Here is the working recipe — it took
the previous agent several attempts to get right.

**Browser.** `playwright-core` plus the system Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Install
`playwright-core` outside the project so you do not add a dependency to
`package.json`.

**Authenticating.** Mint an Auth.js session cookie using the project's own library.
The cookie name for `http://localhost` is `authjs.session-token` (no `__Secure-`
prefix), and it is also the encryption salt:

```js
const { encode } = await import(`file://${ROOT}/node_modules/next-auth/jwt.js`);
const COOKIE = 'authjs.session-token';
const token = await encode({
  token: {
    sub: String(user._id),
    userId: String(user._id),          // the session callback reads these
    usernameTag: user.usernameTag,
    usernameTitle: user.usernameTitle,
  },
  secret: process.env.NEXTAUTH_SECRET,
  salt: COOKIE,
  maxAge: 900,
});
await ctx.addCookies([{ name: COOKIE, value: token, domain: 'localhost', path: '/', httpOnly: true }]);
```

**Counting requests** — the check that catches sequencing bugs:

```js
const calls = [];
page.on('request', (r) => {
  if (r.url().includes('/reorder')) calls.push(JSON.parse(r.postData() || '{}'));
});
```

**Always restore any data a test mutates**, snapshotting first and restoring at the
end even on failure.

---

## Known traps

Every one of these cost the previous agent real time. Read them now, not after.

1. **`waitUntil: 'networkidle'` never resolves.** `ThemeContext` polls
   `/api/theme/{tag}` every ten seconds, so the network is never idle. Use
   `domcontentloaded` plus an explicit `waitForSelector`. (Stage 4's **PERF-3** gates
   this poll, after which the trap partly goes away.)
2. **Port 3000 may already be taken** by the user's own dev server. Next silently
   falls back to 3001. **Read the dev server log for the actual port** before pointing
   anything at it — and when cleaning up, kill only the process you started.
3. **`.env.local` values are quoted.** Strip surrounding quotes when parsing, or your
   connection string will be rejected as an invalid scheme.
4. **The `@/` alias does not resolve under plain `node`.** In standalone scripts,
   import from `node_modules` by absolute `file://` URL rather than trying to load
   `lib/data.js` directly.
5. **Dev-mode API requests take 3–4 seconds each**, and the queue runs updates
   serially. A four-click burst takes ~15s to settle. **Never use a fixed sleep** in a
   browser test — wait for the "Saving…" indicator to appear and then clear. A test
   that closes the browser mid-queue produces a convincing-looking false failure.
6. **`npm run build` can fail transiently** with `Failed to collect page data`. That is
   the `connectDB` bug in **REL-1** — a rejected connection promise is cached forever.
   Retry once. After Stage 2 it should stop happening; if it does not, that is a real
   regression.
7. **`div.grid` matches more than the card grid.** `DashboardInfoEditor` renders one
   too. Scope card selectors to `main div.grid-cols-2 > div`.
8. **React state read from render scope goes stale under rapid interaction.** This
   caused one of the ordering bugs. Where the sequencing of successive interactions
   matters, `flushSync` the state commit so the next event reads the result.
9. **Two dev servers running at once** will give you contradictory results. Check
   before you start.

---

## Definition of done, per item

An item is done when **all** of these hold:

- The "Done when" clause in `IMPROVEMENTS.md` is satisfied and you have observed it,
  not inferred it.
- `npx next lint` is clean.
- `node --test lib/*.test.mjs` passes.
- `npm run build` compiles.
- `node scripts/normalize-order.mjs` reports zero corrections.
- Nothing visually regressed, for items that touch UI.
- `PROGRESS.md` has a line for it.

---

## When to stop and ask

Stop and ask rather than guessing when:

- The behaviour described in the plan does not match what you observe.
- An item requires a product decision the plan does not make.
- An item would need a schema change beyond the ones the plan names
  (`previousSlugs`, `previousTags`, `Post.userId`, `RateLimit`).
- A database write is needed and the dry-run output surprises you.
- You are about to abandon an item. **MOT-4 (view transitions) is the only item
  pre-authorised for abandonment** on its merits — for anything else, ask.
- Anything touches deployment, DNS, Cloudflare configuration or production
  environment variables.

When you stop, say precisely what you found, what you tried, and what the options
are. Do not stop with nothing delivered if other work in the stage is unblocked —
finish what you can, then report what is blocked and why.

---

## Reporting

Keep `plan/PROGRESS.md` current. Suggested shape:

```markdown
# Progress

## Baseline (Stage 0)
- first-load JS: /[usernameTag] = X kB, /[usernameTag]/[pageSlug] = Y kB
- verification gate: green / notes

## Stage 1 — Lock it down
- [x] SEC-1 — user projection. Verified: view-source clean logged out.
- [x] SEC-2 — ownership check. Verified: cross-account delete returns 403.
- [ ] SEC-3 — in progress

## Discovered, not actioned
- <anything new you found but did not fix>

## Decisions and deviations
- <where you departed from the plan, and why>
```

At the very end, write `plan/OUTCOME.md` as described at the foot of `STAGES.md`.
