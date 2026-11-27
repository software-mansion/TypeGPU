# TypeGPU maintainer conventions (fork work only)

Use when working in this repo — writing a fix, opening a PR, or replying to
review. Canonical records in `~/Desktop/open-source/`:

- `docs/typegpu-pr-conventions.md` — canonical conventions (read first)
- `issues/typegpu/typegpu-3251*` — our #3251 fix record, red/green logs
- `issues/typegpu/typegpu-pr*` — PR #3389 record

## Structural facts

- No PR template (only `FUNDING.yml`, `dependabot.yml`, workflows in `.github/`).
- No CLA gate found (no CLA workflow, no CLA check on recent PRs).
- Body is free-form prose; headings optional.

## Hard gates (repo-enforced)

1. `pnpm test` must pass (types + style + unit-attest + built-unit +
   circular-deps) — `CONTRIBUTING.md` § Development.
2. `test:style` = `oxlint --max-warnings=0 --type-aware` + `prettier` +
   `oxfmt --check`. `test:types` = recursive `tsc`.
3. `test:circular-deps` = `dpdm -T` on `packages/**/src/index.ts`.
4. Unit tests: `pnpm vitest run --project='!browser' packages/typegpu`.
   Browser/GPU are separate workflows (`test-gpu.yml` etc.).
5. `pullfrog` is a bot reviewer that files PR findings; treat its findings as
   review items and reply with the fix commit, as maintainers close on them.

## Maintainer decisions that matter

- Issue #3251 (`Array to array conversion`): decision is **throw, not
  convert** — `iwoplaza` closed #3302 (convert) with "We want to throw in this
  case"; the abandoned convert PR was #3323 (author self-closed 2026-11-13).
- #3307 landed in the same file and closed #2708 — our fix must preserve its
  `abstract-cast` behavior.
- Merge method is squash everywhere (releases too); bots COMMENT forever,
  humans gate — 26/27 recent community merges had ≥1 human APPROVED, though
  #3265 merged with none. CHANGES_REQUESTED is not a hard block (#3168
  cieplypolar never re-approved; iwoplaza overrode and merged). Long tail is
  reviewer latency, not size; small root-cause PRs merge in <1 d.

## Our live work

- Fork: `stussysenik/TypeGPU`, branch `fix/array-type-mismatch`, commits
  `2a6d0e4` + `f878d81` + `28033e1`; PR #3389 open, awaiting maintainer. Body/title
  pattern followed: conventional title, `Fixes #3251`, `## Problem / ## Fix /
  ## Changes / ## Tests`, AI-assistance line.
- The permissive same-length array unification is intentional: `comptime.test.ts`
  reads nested same-length arrays of different element types as JS arrays, so
  always-throw breaks it. Enforcement belongs at `ArrayExpression[$resolve]`
  (WGSL emission), not in the conversion rank.

Untracked by design. Do not `git add` this file; it stays local.
