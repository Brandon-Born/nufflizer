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

## 2026-02-11 - Probability fidelity wave 1 + explainability coverage
Metadata: commit(s) `pending`; scope `Nufflizier scoring transparency and explicit calculators`; status `partial`.

Converted items:
1. Added explicit probability calculators for `block`, `armor_break`, and `injury` roll families.
2. Added event-level method tagging (`explicit`/`fallback`) and reason strings in report output.
3. Added report-level coverage telemetry (`explicitCount`, `fallbackCount`, `explicitRate`) and weight table output.
4. Added “How this was scored” summaries and explainability data to API/UI/CLI output paths.

Remaining follow-ups:
1. Extend explicit calculators to additional families (`dodge`, `ball_handling`) where replay data is sufficient.
2. Continue reducing fallback reliance and improve plain-language rationale depth for end users.
3. Finalize ADR for legacy `/api/replay` surface.

Verification evidence:
1. Updated tests: `tests/unit/nufflizierProbability.test.ts`, `tests/unit/nufflizierScoring.test.ts`, `tests/unit/nufflizierApi.test.ts`, `tests/unit/analyzeNufflizier.test.ts`, `tests/e2e/smoke.spec.ts`.
2. Validation commands passed: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

## 2026-02-11 - Probability fidelity wave 2 + explainability detail expansion
Metadata: commit(s) `pending`; scope `Explicit probability coverage and transparency UX`; status `partial`.

Converted items:
1. Added explicit probability calculators for `dodge` and `ball_handling` families in the core probability engine.
2. Expanded report explainability payload with per-event `formulaSummary` and `inputsSummary`.
3. Added report coverage breakdown by event family (`coverage.byType`) and surfaced it in UI and CLI output.
4. Added ADR decision to gate (not remove) legacy coaching surface while keeping Nufflizier as primary runtime path.

Remaining follow-ups:
1. `argue_call` remains fallback-first until replay evidence supports deterministic explicit mapping.
2. Continue plain-language copy calibration for non-statistics users.
3. Revisit legacy surface removal once gate period milestones are complete.

Verification evidence:
1. Validation commands passed: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. Updated runtime/test/docs files include `src/domain/nufflizer/*`, `src/app/nufflizier/NufflizierAnalyzer.tsx`, `src/cli/nufflizier.ts`, `tests/unit/*`, `tests/e2e/smoke.spec.ts`, and handoff docs under `docs/`.

## 2026-02-11 - Argue-call explicit mapping + readability helper
Metadata: commit(s) `pending`; scope `Probability completeness and transparency UX`; status `partial`.

Converted items:
1. Added explicit `argue_call` probability handling for deterministic replay evidence path (`rollType=71`).
2. Improved fallback reason strings to include roll type context when explicit mapping is unavailable.
3. Added a plain-language “How to read this report” UI helper block to improve non-statistics readability.
4. Updated docs to reflect that argue-call is now partially explicit (`71`) and partially fallback (`42`, `70`).

Remaining follow-ups:
1. Validate and map additional argue-call roll variants (`42`, `70`) only after deterministic fixture evidence is available.
2. Continue expanding plain-language examples per category for end-user clarity.

Verification evidence:
1. Full verification run passed: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. Updated tests cover explicit argue-call path and fallback roll-type reasoning.

## 2026-02-11 - Edge normalization + parity coverage hardening
Metadata: commit(s) `pending`; scope `Normalization transparency and test reliability`; status `partial`.

Converted items:
1. Added normalization metadata flags/notes in luck events for ambiguous attribution, missing targets, skill-only reroll inference, and incomplete dice metadata.
2. Added argue-call edge fixture coverage for `rollType=42` and `rollType=70` while keeping both fallback-tagged by design.
3. Added CLI/API parity test to verify stable verdict and aggregate consistency for the same replay input.
4. Expanded explainability copy in UI and CLI with category-level examples for non-statistics readability.

Remaining follow-ups:
1. Promote argue-call variants (`42`, `70`) to explicit only after deterministic replay evidence is proven.
2. Continue rebalancing suite emphasis toward Nufflizier while preserving legacy safety tests.

Verification evidence:
1. Validation commands passed: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. New tests/fixtures: `tests/unit/nufflizierNormalization.test.ts`, `tests/unit/nufflizierCliParity.test.ts`, `tests/fixtures/models/argue-edge-replay.json`.

## 2026-02-11 - Argue variant gate + copy centralization
Metadata: commit(s) `pending`; scope `Human-test readiness hardening`; status `partial`.

Converted items:
1. Added evidence fixtures for argue-call variants: `rollType=42` and `rollType=70`.
2. Kept `42`/`70` fallback and added explicit nondeterministic reason text in probability output.
3. Added centralized explainability copy module consumed by both UI and CLI for parity.
4. Added Nufflizier-focused variant, inventory, normalization, and CLI parity assertions; introduced split scripts (`test:nufflizier`, `test:legacy`).

Remaining follow-ups:
1. Promote `42` or `70` to explicit only after replay evidence satisfies deterministic gate criteria.
2. Continue reducing reliance on legacy-heavy tests as Nufflizier coverage grows.

Verification evidence:
1. Validation commands passed: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`, `corepack pnpm test:nufflizier`, `corepack pnpm test:legacy`.
2. New files include fixtures (`tests/fixtures/models/argue-rolltype-42.json`, `tests/fixtures/models/argue-rolltype-70.json`) and tests (`tests/unit/nufflizierArgueVariants.test.ts`, `tests/unit/nufflizierCoverageInventory.test.ts`).

## 2026-02-11 - Legacy API gate + fallback transparency hardening
Metadata: commit(s) `pending`; scope `Conversion residue cleanup and compatibility controls`; status `partial`.

Converted items:
1. Added deprecation-first gate controls for legacy `POST /api/replay` with environment-configurable mode and sunset metadata.
2. Added legacy endpoint deprecation headers (`Deprecation`, `Sunset`, successor `Link`) and explicit disabled-mode `410` response contract.
3. Extended `LuckReport.coverage` with fallback roll-type inventory and nondeterministic argue-call roll visibility.
4. Surfaced nondeterministic argue-call fallback disclosure in both UI and CLI text output.
5. Removed active-surface BB Trainer residue by renaming homepage logo asset references and added conversion-residue inventory tests.

Remaining follow-ups:
1. Keep monitoring legacy endpoint usage and switch default mode to disabled at/after sunset once compatibility consumers are migrated.
2. Keep argue-call `rollType=42` and `rollType=70` fallback until deterministic replay evidence supports explicit promotion.
3. Re-evaluate full legacy coaching module removal after gate milestones complete.

Verification evidence:
1. Added/updated tests include `tests/unit/legacyReplayApiRoute.test.ts`, `tests/unit/nufflizierApi.test.ts`, `tests/unit/nufflizierNormalization.test.ts`, `tests/unit/nufflizierArgueVariants.test.ts`, `tests/unit/nufflizierCliParity.test.ts`, `tests/unit/nufflizierConversionResidue.test.ts`.
2. Validation commands passed in this session: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`, `corepack pnpm test:nufflizier`, `corepack pnpm test:legacy`.
