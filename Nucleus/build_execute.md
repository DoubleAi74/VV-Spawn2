# Build Execution Protocol (Spec-First Rebuild)

## Goal
When an AI agent is prompted with "read `build_execute.md` and execute", it must implement or remake the application using specification files as the source of truth:

1. `PRD*.md`
2. `DESIGN*.md`
3. `ARCHITECTURE*.md`

**Directory layout:** This file (`build_execute.md`) and all specification files live in the `Nucleus/` subdirectory. The Next.js application code lives in the **project root** (the parent directory of `Nucleus/`). All implementation work — creating, modifying, and deleting source files — must target the project root. Do not create application code inside `Nucleus/`.

This protocol assumes those spec files already exist in `Nucleus/` and may have been manually edited to change product scope, features, or tech stack.

## Core Principle
Specifications are authoritative. Existing code is reference material only.

- If implementation conflicts with specs, update/replace implementation to match specs.
- Do not preserve incompatible legacy behavior just because it already exists.

## Input File Selection Rules
Spec files are located in the `Nucleus/` subdirectory. For each spec family (`PRD`, `DESIGN`, `ARCHITECTURE`):

1. If versioned files exist (`*_vN.md`), select the highest `N`.
2. Otherwise select the base file (`PRD.md`, `DESIGN.md`, `ARCHITECTURE.md`).
3. If multiple candidates are ambiguous, choose the highest version by number, not timestamp.

Block only if any of the three families is missing after selection.

## Spec Precedence Rules
When specs disagree, apply this deterministic precedence:

1. `PRD` controls product scope, outcomes, and acceptance criteria.
2. `DESIGN` controls behavior, user flows, data rules, and interface contracts.
3. `ARCHITECTURE` controls language/framework/library/runtime/module choices.

Interpretation rule:
- For feature scope conflicts: `PRD` wins.
- For behavior/API/UI conflicts: `DESIGN` wins.
- For tech-stack/implementation-style conflicts: `ARCHITECTURE` wins.

If unresolved conflict remains, choose the interpretation that preserves higher-precedence intent and record the assumption.

## Execution Workflow

### Session Start — Check for Existing Progress

Before doing anything else, check whether `Nucleus/progress.md` exists.

**If `progress.md` exists (resumed session):**
1. Re-read `Nucleus/progress.md` in full.
2. Re-read the active spec files listed in its `## Active Spec Set` section.
3. Determine resume point using this table:

| Condition | Resume Action |
|---|---|
| Spec Clarification marked incomplete | Resume Step 1 — ask next batch of clarifying questions |
| Spec Clarification done, no Task Board yet | Resume at Step 3 — Gap Assessment |
| Task Board exists, all tasks `todo` | Resume at Step 5 — begin first `todo` task |
| A task is `in_progress` | Resume at Step 5 for that task (re-run validation from scratch) |
| A task is `blocked` | Re-ask the recorded unblock question, then resume loop |
| All tasks `done`, final validation not yet passed | Resume at Step 6 — Final Validation Gate |
| All tasks `done`, final validation passed | Execution complete — produce final output report |

4. Announce the resumed state and the immediate next action before continuing.

**If no `progress.md` exists (fresh session):**
Proceed with Step 1 below.

---

### Step 1 — Spec Clarification (Before Any Implementation)

After loading the selected spec files, identify and resolve ambiguities before touching code.

1. Read all three active spec files in full.
2. Identify:
   - Missing or underspecified `REQ-*` items
   - Conflicting requirements across spec families
   - Unclear acceptance criteria or definition-of-done
   - Open questions or assumptions noted in the specs
   - Critical technical decisions not yet made in `ARCHITECTURE`
3. Ask the user questions in batches of 3–5. Wait for answers before asking the next batch. Do not proceed past this step until all critical ambiguities are resolved.
4. After each batch of answers, update the relevant spec file(s) to reflect the clarified decisions. Append a `## Clarification Log` section at the bottom of affected spec files recording what was asked and decided.
5. Once no critical ambiguities remain, announce the finalized spec set and proceed.

Do not ask about low-impact or easily assumed details. Focus on questions where the answer materially changes scope, behavior, data model, or tech stack.

---

### Step 2 — Load and Normalize Specs

- Extract all `REQ-*` identifiers and acceptance criteria from the finalized spec set.
- Build an internal implementation matrix: `REQ-* -> planned implementation + planned tests`.

### Step 3 — Gap Assessment

Compare current codebase against specs. Classify all work into:
- keep as-is
- modify
- replace
- create new
- remove obsolete

### Step 4 — Build Task Board and Create `progress.md`

Decompose the gap assessment into an ordered task list. For each task:
- Assign a Task ID (`T01`, `T02`, …)
- Map to one or more `REQ-*`
- Note dependencies on other tasks
- Define a concrete automated test plan and definition of done
- Set initial status to `todo`

Sequence tasks by dependency order: foundation → core flows → integrations → polish.

Present the task board to the user and wait for confirmation. Once confirmed, write `Nucleus/progress.md` using this structure:

```md
# Build Progress

## Current State
[2–4 sentence summary of what has been built so far. Update after each task.]

## Active Spec Set
- PRD: [filename]
- DESIGN: [filename]
- ARCHITECTURE: [filename]

## Spec Clarification
- Status: complete / in_progress
- Batches asked: [N]

## Command Baseline
- Package manager: [npm / pnpm / yarn / bun / etc.]
- Install: [command or N/A]
- Lint: [command or N/A]
- Typecheck: [command or N/A]
- Test: [command or N/A]
- Build: [command or N/A]
- E2E: [command or N/A]

## Assumptions Log
| ID | Confidence | Statement | Impacted REQ IDs | Status |
|---|---|---|---|---|
| A-001 | Medium | [assumption] | REQ-F-001 | Open |

## Task Board
| Task ID | Title | REQ IDs | Depends On | Test Plan | Definition of Done | Status |
|---|---|---|---|---|---|---|
| T01 | [task] | REQ-F-001 | — | [automated checks] | [observable completion] | todo |

## Blockers
| Blocker ID | Task ID | Cause | Attempts | Impact | Unblock Question | Status |
|---|---|---|---|---|---|---|
```

Keep `Nucleus/progress.md` current at all times. It is the execution ledger for this build.

---

### Step 5 — Implementation Loop

Run through tasks in dependency order until all are `done` or a true blocker is reached.

#### For Each Task:

**5a. Mark In Progress**
- Update the task's status to `in_progress` in `Nucleus/progress.md`.
- Announce the task and its expected outcome before writing any code.

**5b. Implement Within Scope**
Implement only what is required for the task's `REQ-*` coverage and definition of done. Do not implement scope belonging to future tasks.

If a new assumption is made during implementation, add it immediately to the `## Assumptions Log` in `Nucleus/progress.md`.

**5c. Automated Validation Loop**
Run in this order:
1. Task-focused tests from the task's own test plan.
2. Fast regression suite (broader safety net covering unchanged paths).
3. Lint/typecheck/build checks, if the task touches shared or core systems.

If anything fails: debug, fix, rerun. Repeat until passing or until a genuine blocker is reached.

Minimum pass condition before marking a task done:
- All task-focused tests pass.
- At least one broader automated signal passes (regression subset, lint subset, or targeted integration test).

**5d. Mark Done and Continue**
When validation passes:
- Update the task's status to `done` in `Nucleus/progress.md`.
- Update `## Current State` in `Nucleus/progress.md` with a brief summary of what was just completed.
- Update `REQ-*` coverage notes in the task row.
- Move immediately to the next eligible `todo` task. Do not pause for user sign-off between tasks.

#### Blocker Protocol

If genuinely blocked:
1. Update the task's status to `blocked` in `Nucleus/progress.md`.
2. Add a row to `## Blockers` in `Nucleus/progress.md` with: cause, attempted fixes, impact on `REQ-*`, and one precise unblock question.
3. Ask that single unblock question to the user.
4. After the user responds, update the blocker row status and resume the loop.

Only stop autonomous execution for genuine blockers — missing information, external dependencies, or irresolvable spec conflicts.

---

### Step 6 — Final Validation Gate

After all tasks are `done`, run full project validation in this order:
1. Install dependencies via detected package manager.
2. Lint (if configured).
3. Type check (if configured).
4. Unit/integration tests.
5. Build command (must pass).
6. E2E critical-path tests (if configured).

Fix and rerun until fully passing, or document blockers explicitly. No manual verification steps — all validation must be automated.

## Next.js-Specific Implementation Rules (When Applicable)
If specs target a Next.js app, implementation must align with specified:

- Routing model and route tree
- Server/client component boundaries
- Rendering/data strategy (SSR/SSG/ISR/dynamic/caching/revalidation)
- API route handlers/server actions
- Middleware and route protection
- Auth/session behavior
- Form flows and validation
- Error/loading/not-found behaviors
- State management boundaries

## Testing and Quality Requirements
Automated tests are required.

At minimum, run all applicable project checks:

1. Install dependencies via detected package manager.
2. Lint (if configured).
3. Type check (if configured).
4. Unit/integration tests (if configured).
5. Build command (must pass).

For Node/Next.js projects, detect and use available scripts from package manifest(s) rather than guessing command names.

If no automated tests exist, add minimal high-value tests for critical paths from `PRD` acceptance criteria.

## Assumptions and Unknowns
- Proceed with reasonable assumptions when specs leave gaps.
- Record assumptions with confidence (`High`, `Medium`, `Low`) and impacted `REQ-*`.
- Do not stop for non-blocking ambiguity.

## Allowed Changes
- You may create, modify, move, and delete code/config files required to satisfy specs.
- You may introduce or remove dependencies when required by `ARCHITECTURE`.
- You may add migrations, seeds, or supporting scripts when needed by the designed data model.

## Non-Negotiable Constraints
- Do not edit spec files outside of the Spec Clarification step, unless explicitly asked by the user.
- Do not ignore failing tests/build checks.
- Do not mark work complete while required `REQ-*` remain unimplemented.
- Do not silently skip critical flows from `PRD`/`DESIGN`.

## Completion Criteria
Execution is complete only when all are true:

1. Selected spec set is fully implemented.
2. Build succeeds.
3. Automated tests/checks pass (or blockers are explicitly documented).
4. All `REQ-*` have implementation status and verification status.
5. No unresolved high-impact conflicts remain undocumented.

## Required Final Output (Agent Response)
Return a concise execution report containing:

- Spec files used (exact filenames selected)
- Summary of implemented scope
- `REQ-*` coverage summary (implemented/total)
- Tests/checks executed and pass/fail status
- Build status
- Assumptions and blockers (if any)

