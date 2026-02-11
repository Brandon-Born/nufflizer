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

## 2026-02-11 - Deterministic scored/excluded scoring contract
Metadata: commit(s) `pending`; scope `Dice-fidelity normalization and probability contract refactor`; status `partial`.

Converted items:
1. Replaced explicit/fallback scoring model with deterministic `scored` versus `excluded` contract in report/event schemas.
2. Added context-aware roll classification (`sourceTag` + `stepType` + `rollType` + target presence) and excluded unsupported/ambiguous contexts from luck totals.
3. Removed synthetic parser dodge event injection and moved dodge detection to deterministic roll-context classification.
4. Reworked probability and outcome resolution to avoid generic fallback scoring for unsupported contexts.
5. Updated API/UI/CLI coverage/explainability rendering to scored/excluded telemetry and exclusion-reason inventory.
6. Added classification test coverage and updated normalization/argue/parity/e2e tests for the new contract.

Remaining follow-ups:
1. Expand deterministic scored coverage for currently excluded special-action roll families as fixture evidence grows.
2. Continue explainability copy refinement around exclusion reasons for non-statistics users.
3. Keep monitoring scored-rate shifts as new replay variants are introduced.

Verification evidence:
1. Validation commands passed: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. New/updated files include `src/domain/nufflizer/classifyRollContext.ts`, `src/domain/nufflizer/analyzeLuck.ts`, `src/domain/nufflizer/probability.ts`, `src/domain/nufflizer/types.ts`, `src/app/nufflizier/NufflizierAnalyzer.tsx`, `src/cli/nufflizier.ts`, and `tests/unit/nufflizierClassification.test.ts`.

## 2026-02-11 - Goblin replay gap closure (strict gates + block merge + dice-candidate coverage)
Metadata: commit(s) `pending`; scope `Goblin fixture fidelity hardening`; status `partial`.

Converted items:
1. Added strict roll-family gates so dodge and ball-handling are scored only when both step type and supported roll family match deterministic contracts.
2. Added block-chain merge pass linking `ResultBlockRoll` / `ResultBlockOutcome` / `ResultPushBack` events to nearby scored block anchors; merged members remain visible but excluded with merge metadata.
3. Upgraded coverage contract to dual metrics: primary `rollCandidates` and secondary `allEvents`, while retaining scored/excluded inventories by type and reason.
4. Added `LuckEventMetadata` diagnostics for `isRollCandidate` and `mergedBlockAnchorId`; normalized merged-block exclusion reason aggregation.
5. Added replay mapping label for `rollType=30` as `special_event_30` for explicit diagnostics.
6. Updated UI and CLI coverage presentation order to show dice-candidate coverage first and all-event coverage second.
7. Expanded unit/API/CLI/e2e tests, including goblin replay assertions for argue-call retention and unsupported ball-handling roll-family exclusions.

Remaining follow-ups:
1. Keep `rollType=42` and `rollType=70` excluded until deterministic evidence supports explicit promotion.
2. Continue collecting fixtures for additional special-action roll families before any scoring promotion.

Verification evidence:
1. Validation commands passed in this session: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. Targeted assertions passed for goblin fixture expectations (`tests/unit/analyzeNufflizier.test.ts`) and block-chain merge metadata (`tests/unit/nufflizierNormalization.test.ts`).

## 2026-02-11 - Roll-type evidence rebaseline + source-tag contracts
Metadata: commit(s) `pending`; scope `Replay semantics hardening for roll-family correctness`; status `partial`.

Converted items:
1. Added evidence-first roll-family inventory and code coverage crosswalk docs:
- `docs/ROLL_TYPE_EVIDENCE_MATRIX.md`
- `docs/ROLL_TYPE_CODE_COVERAGE.md`
2. Introduced source-tag-aware roll contracts in `src/domain/replay/rollTypeContracts.ts` covering every observed demo `sourceTag|rollType` pair.
3. Updated replay extraction to resolve roll labels via source-tag-aware contracts before fallback map labels.
4. Rebased deterministic scoring to high-confidence families:
- promoted `ResultRoll|10` to scored armor-like checks,
- retained `2`, `34`, `4`, `37`, `71` scored paths,
- demoted uncertain deterministic families (including `ResultRoll|1`) to explicit excluded status.
5. Excluded randomizer families from roll-candidate denominator while preserving all-event transparency.
6. Added guardrail tests to enforce evidence/coverage completeness for observed roll pairs.
7. Updated replay mapping diagnostics to reduce misleading legacy labels (notably roll families `3`, `10`, `25`, `26`, `87`).

Remaining follow-ups:
1. Resolve highest-impact ambiguous deterministic families (`ResultRoll|1`, `ResultRoll|67`) with additional replay evidence.
2. Re-evaluate step-type labels separately from roll-family contracts as more fixtures arrive.
3. Continue keeping new observed `sourceTag|rollType` pairs blocked from silent fallback via matrix tests.

Verification evidence:
1. Validation commands passed in this session: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. Added/updated tests include:
- `tests/unit/rollTypeEvidenceMatrix.test.ts`
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/replayMappings.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`

## 2026-02-11 - RollType 1 promotion to movement-risk scoring
Metadata: commit(s) `pending`; scope `Roll-family semantic resolution and scoring integration`; status `partial`.

Converted items:
1. Promoted `ResultRoll|1` from `excluded_deterministic` to `scored_deterministic` with scoring category `movement_risk`.
2. Added new `movement_risk` category across core domain types, weight table, coverage maps, UI filters/cards, and explainability copy.
3. Added strict evidence gating for rollType 1 with expanded fixture coverage (`demo1` through `demo11` plus `demo-goblins1`).
4. Added machine-readable evidence artifacts and gate thresholds:
- `tests/fixtures/evidence/rolltype1-expanded-summary.json`
- `tests/fixtures/evidence/rolltype1-gate.json`
5. Added rollType 1 evidence test suite enforcing deterministic invariants and snapshot parity:
- `tests/unit/rollType1Evidence.test.ts`

Remaining follow-ups:
1. Resolve remaining high-impact excluded deterministic family `ResultRoll|67`.
2. Continue semantic resolution for medium-frequency families (`7`, `33`, `88`) before promotion.
3. Keep argue-call variants `42` and `70` excluded until deterministic evidence improves.

Verification evidence:
1. Validation commands passed in this session: `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. Evidence summary in expanded fixture set confirms deterministic rollType 1 invariants (single die, target 2+, zero modifier sum, zero outcome-threshold mismatches).

## 2026-02-11 - RollType 7 promotion to pickup ball-handling scoring
Metadata: commit(s) `pending`; scope `Roll-family semantic resolution and scoring integration`; status `partial`.

Converted items:
1. Promoted `ResultRoll|7` from `excluded_deterministic` to `scored_deterministic` with scoring category `ball_handling` and pickup semantics.
2. Updated contract/category wiring so `ball_handling` is accepted by the deterministic roll classifier and surfaced in roll-type constants.
3. Added expanded-fixture evidence artifacts and strict gate assertions for rollType 7:
- `tests/fixtures/evidence/rolltype7-expanded-summary.json`
- `tests/fixtures/evidence/rolltype7-gate.json`
- `tests/unit/rollType7Evidence.test.ts`
4. Updated test expectations and inventory coverage for scored pickup behavior:
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
5. Updated roll-type coverage/evidence/investigation/project-plan docs to reflect scored pickup mapping and revised unresolved-priority counts.

Remaining follow-ups:
1. Resolve next highest-impact excluded deterministic families (`ResultRoll|33`, `ResultRoll|88`, `ResultRoll|67`).
2. Continue collecting expanded replay evidence before promoting low-frequency deterministic families.
3. Revisit ball-handling weight calibration only after broader corpus validation.

Verification evidence:
1. Validation commands passed in this session: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`.
2. rollType 7 evidence gate confirms: 58 observed samples, all scored as `ball_handling`, zero threshold mismatches, zero `7->7` chains, and non-`25` followups present.
