# Nufflizier Conversion Log

Purpose: append-only ledger of migration work from legacy BB Trainer coaching behavior to Nufflizier luck analysis behavior.

## How To Append New Entries
1. Never rewrite or delete prior entries.
2. Add a new section at the bottom using: `## YYYY-MM-DD - <short title>`.
3. Include all required fields exactly:
- Metadata: commit(s), scope, status (`converted`, `partial`, `legacy-kept`, `pending`, `blocked`)
- Converted items
- Remaining follow-ups
- Verification evidence
4. Reference concrete files and commands.

---

## 2026-02-07 - Structured replay extraction baseline
Metadata: commit(s) `60d50fe`, `9271c2f`; scope `Replay parser reliability`; status `partial`.

Converted items:
1. Expanded structured replay extraction and decoder support across demo fixtures.
2. Added replay baseline parity tests to compare parser output against independent extraction logic.
3. Added/updated replay investigation notes for observed BB3 tags and codes.

Remaining follow-ups:
1. Extend mapping depth for less common roll/action codes.
2. Increase fixture diversity for rare event families.

Verification evidence:
1. `tests/unit/replayImplementationBaseline.test.ts` added and used to enforce parity on demo fixtures.
2. `docs/REPLAY_INVESTIGATION.md` updated with observed code ranges.

## 2026-02-09 - Coaching pipeline hardening and one-shot stabilization
Metadata: commit(s) `0ad2c75`, `aa4baa9`, `547c876`, `ce97038`, `d62a44f`, `c45df09`, `bee98dc`; scope `Legacy coaching quality + parser attribution`; status `legacy-kept`.

Converted items:
1. Shifted legacy flow to one-shot upload/analysis UX.
2. Improved team/player attribution and team-scoped safety checks.
3. Expanded coaching heuristics, rule coverage, and parser diagnostics.

Remaining follow-ups:
1. Legacy coaching stack still exists and remains maintenance overhead.
2. Product messaging needed full pivot to Nufflizier (completed in later milestone).

Verification evidence:
1. Expanded unit tests for attribution, parser linking, team scoping, and structured replay analysis.
2. E2E smoke path for one-shot replay flow retained/passing during that phase.

## 2026-02-10 - Demo replay anonymization normalization
Metadata: commit(s) `a08d906`; scope `Fixture safety and consistency`; status `converted`.

Converted items:
1. Normalized demo replay player names to `Player N` format.
2. Preserved replay structure while improving fixture privacy consistency.

Remaining follow-ups:
1. Continue checking new fixtures for naming/identifier leakage.

Verification evidence:
1. Demo replay fixture files updated: `demo-replays/demo1.bbr`, `demo-replays/demo2.bbr`, `demo-replays/demo3.bbr`.

## 2026-02-11 - Nufflizier MVP runtime conversion
Metadata: commit(s) `dee6669`; scope `Primary product surface`; status `converted`.

Converted items:
1. Added Nufflizier domain (`src/domain/nufflizer/*`) for luck-event normalization, probability, and scoring.
2. Added primary API endpoint: `POST /api/nufflizier/analyze`.
3. Added primary UI route: `/nufflizier`; mapped `/upload` to the same Nufflizier analyzer component.
4. Added CLI flow: `nufflizier analyze <replay_file> --format json|text`.
5. Added Nufflizier-focused tests (probability, scoring, API, integration, updated e2e smoke).

Remaining follow-ups:
1. Probability fidelity still partially heuristic for some roll families.
2. Legacy coaching pipeline (`/api/replay`, `analyzeReplay`, coaching modules) remains in tree as `legacy-kept`.
3. Docs alignment for follow-up agents required (handled in next entry).

Verification evidence:
1. Validation run recorded during implementation session: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` all passed.
2. New test files: `tests/unit/nufflizierProbability.test.ts`, `tests/unit/nufflizierScoring.test.ts`, `tests/unit/nufflizierApi.test.ts`, `tests/unit/analyzeNufflizier.test.ts`.

## 2026-02-11 - Handoff documentation system refresh
Metadata: commit(s) `pending`; scope `Agent handoff clarity`; status `converted`.

Converted items:
1. Introduced project handoff docs:
- `docs/PROJECT_PLAN.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`
2. Refreshed stale core docs to Nufflizier context and linked handoff docs.

Remaining follow-ups:
1. Ensure each future implementation appends entries to both logs.
2. Keep status taxonomy consistent across docs (`converted`, `partial`, `legacy-kept`, `pending`, `blocked`).

Verification evidence:
1. Cross-reference links added in `AGENTS.md` and `docs/PROJECT_BLUEPRINT.md`.
2. Repository search confirms legacy BB Trainer wording removed from primary docs except explicitly marked historical references.

## 2026-02-11 - Transparency-first explanation requirement
Metadata: commit(s) `pending`; scope `Product explainability standards`; status `converted`.

Converted items:
1. Elevated transparency to an explicit product principle in planning docs.
2. Added non-statistics-user readability requirement for report explanations.
3. Clarified that weights/assumptions must be visible and that fallback uncertainty should be disclosed.

Remaining follow-ups:
1. Implement UI-level “How this was scored” affordances and plain-language helper text.
2. Add tests that validate explainability content presence, not only numeric correctness.

Verification evidence:
1. `docs/PROJECT_PLAN.md` now contains a dedicated “Transparency Principle” section and strengthened P2 criteria.
2. `docs/PROJECT_BLUEPRINT.md` and `AGENTS.md` now encode explainability as a required engineering constraint.
