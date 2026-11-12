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

## 2026-11-09 - Adversarial remediation backlog and contextual-luck roadmap
Metadata: commit(s) `uncommitted documentation change`; reviewed baseline `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`; scope `Planning and handoff correction after adversarial review`; status `partial`.

Converted items:
1. Added `docs/REMEDIATION_BACKLOG.md` with 28 permanent issue IDs, source locations, bounded reproduction seeds, dependencies, acceptance criteria, review-to-backlog crosswalk, and evidence-based closure requirements.
2. Replaced the active February priority order in `docs/PROJECT_PLAN.md` with safe ingestion, verified dice/ownership semantics, state reconstruction, contextual impact, and integrated acceptance milestones. Carried forward rare-family, legacy, explainability, and test commitments with explicit owners.
3. Linked the queue from `AGENTS.md`, `README.md`, and `docs/PROJECT_BLUEPRINT.md`; marked earlier readiness and mapping claims as historical/disputed in the blueprint, replay investigation, and roll-type documents.
4. Preserved historical status updates and append-only logs. No application, dependency, fixture, or scoring behavior changed.

Remaining follow-ups:
1. All NUF-001 through NUF-028 remain open. Start with NUF-001, NUF-004, and NUF-005, then follow the backlog dependency order.
2. Existing test passes do not resolve the independently reproduced semantic, coverage, parser, or safety failures.
3. Context-sensitive scoring and deployed validation remain implementation work, not completed capabilities.

Verification evidence:
1. `git diff --check` passed for the documentation changes.
2. A Python documentation consistency check verified 28 unique work packets/ledger rows, all-open status, an acyclic dependency graph, required packet fields, local Markdown link targets, and balanced code fences.
3. The preceding read-only review passed lint, typecheck, 79 unit tests, build, and one browser smoke test at the reviewed baseline; those checks were not rerun for this documentation-only change and are explicitly not game-semantic acceptance.
4. The documented reproduction command executed successfully for all five cases; follow-up checks confirmed the suggested execution order satisfies every dependency and both historical logs remain unchanged prefixes.

## 2026-11-09 - Safe ingestion and truthful report remediation
Metadata: commit(s) `not created; working-tree implementation`; baseline `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`; scope `November remediation groundwork`; status `partial overall`.

Converted items:
1. NUF-001–006 and NUF-025 now have local implementation/acceptance evidence. Added sanitized raw-message fragments with source-sequence provenance, original/current corpus inventories, independent numeric regressions, and runnable probes for still-open contextual defects.
2. Replaced formatting-sensitive message extraction with ordered XML parsing and stable source/sequence/step locators. Added bounded envelope/event validation, explicit root/version/team policies, strict nested encoding, DTD/entity refusal, safe text handling, streaming file/form limits, zlib output limits and XML/message/event budgets shared with retained compatibility paths.
3. Added a bundled worker execution boundary for HTTP and CLI with real deadline/cancellation termination and cleanup; disabled the legacy endpoint by default while retaining explicit, hardened compatibility opt-in.
4. Upgraded supported framework/parser/validation dependencies and their lockfile. CI now declares Node 22, frozen pnpm installs and a production dependency audit. No audit suppression was added; the PostCSS override installs a patched compatible major version.
5. Applied early truthfulness mitigations for NUF-007–015 and NUF-019–022: same-rule numeric probability/outcomes, no inferred die size, no cross-player four-event reroll lookahead, unnamed ownership/conflict evidence, visible unknown/unattributed/block/damage outcomes, explicit abstention, shared schema/model versions, additive unrounded dice contributions, full-evidence filters/paging and useful error handling.
6. Corrected active product copy. Block/damage/referee category mappings remain unverified and excluded. Raw numeric threshold contributions use provisional labels/weights; they are not tactical impact, calibrated win probability, or a defensible whole-match comparison.

Historical corrections and remaining work:
1. `ResultBlockRoll` has actual face data under `Die`; its historical "no dice/outcome-only summary" claim was wrong. Injury/casualty records cannot disappear from the random-outcome denominator merely because they have no binary threshold.
2. The old shape/adjacency promotion tests were replaced with raw-record preservation and independently derived arithmetic checks. Historical evidence JSON remains unchanged as dated artifacts; it is not treated as semantic acceptance. Existing contradictory synthetic outcome data and inferred missing die types no longer establish scoring correctness.
3. NUF-009 needs authoritative BB3 enum/skill/state mappings or independently annotated controlled captures. Block/damage/beneficiary/skill/reroll completeness, state reconstruction, counterfactual contextual values, causal accounting and calibration remain open. Safe exclusion does not close those requirements.
4. NUF-023 needs deployed Vercel acceptance; NUF-024 needs a configured deployment-wide quota/concurrency policy. A local aggregate quota is explicitly not a shared limiter. NUF-026/027/028 remain open for committed CI/final evidence and all predecessors.

Validation and exact acceptance evidence: see the matching 2026-11-09 implementation-log record, `tests/fixtures/remediation/`, and `docs/INGESTION_SAFETY.md`. No commit, deployment, publication, replay persistence or external message was created by this change.

## 2026-11-09 - Report contracts and independent engineering
Metadata: commit(s) `not created; working-tree changes`; scope `NUF-015/019/021–023/026/027 engineering independent of new game captures`; status `partial backlog implementation`.

Converted items:
1. Made the Zod report schema the single source for shared TypeScript report types. Service generation and browser consumption now validate version/model, abstaining verdict/headline, finite numeric fields, model weights, ownership, unique event/key-moment references and reconciled coverage/category/team totals.
2. Added bounded browser reads for success/error responses, cancellation cleanup, useful errors for malformed success JSON, incompatible or inconsistent reports, interrupted downloads and hosting-generated 413/429/504 responses. Invalid data cannot enable rendering/export.
3. Shared evidence-qualified presentation across UI/CLI: empty category sums display Not scored and empty team evidence is explicit. Numeric zero remains available when scored contributions actually sum to zero. Removed arbitrary magnitude thresholds from score colors; colors indicate sign only.
4. Moved HTTP report serialization under the worker's terminating deadline and byte cap, including legacy-wrapper headroom. Oversized reports return a typed 413 before large results are copied to the API thread. CLI retains its existing larger-output path. Worker heap-limit failures have an explicit resource-limit error.
5. Added `verify` for the full sequential quality pipeline. `test:e2e` now rebuilds the production application; CI avoids a redundant build and cannot silently exercise a stale UI artifact. Added report-consistency, body-boundary, output-cap and browser error/cancellation regressions.
6. Corrected the active handoff after the user clarified that no official replay enum source exists: NUF-009 is active reverse-engineering work, not an external official-documentation blocker. Controlled captures are useful corroboration; empirical investigation and independent engineering can proceed without them. No disputed game mappings were newly promoted by this change.

Remaining work:
1. Full acceptance for the owning report/context/operational IDs remains open; schema/arithmetic consistency is not proof of BB3 rule meaning, causal uniqueness or tactical consequences.
2. NUF-023/024 still require deployment configuration/access and shared controls; no Vercel deployment or shared backend was provisioned. NUF-026 awaits a committed candidate/CI evidence. The full backlog is not complete.
3. See the matching implementation record and `REPORT_CONTRACT.md` for validation and the distinction between runtime contract guarantees and game-semantic evidence.

## 2026-11-09 - Publish the remediation candidate to the tracked repository
Metadata: commit(s) `this commit; see Git history`; scope `User-requested commit and push`; status `partial backlog implementation`.

Prepared the reviewed runtime, fixture, dependency, CI and documentation changes for `nufflizer/master` (`Brandon-Born/nufflizer`). Preserved the append-only history and existing planning edits. The previously recorded 191 unit tests, four production-browser flows and complete local quality checks remain the validation evidence. No new runtime behavior changed during publication; remote CI/deployment and unfinished semantic/context requirements remain open.

## 2026-11-09 - Local replay evidence for action identification

Metadata: commit(s) `not created; working-tree changes`; scope `NUF-008/009 investigation`; status `partial; no semantic support promoted`.

Added a Git ignore rule for the user-supplied `replays/` folder and a standalone raw-message inventory script. Inspected 27 local files (35,121 step emissions, 41 source-tag/roll-type pairs) and compared 12 existing demos. Recorded movement/block and activation/skill counterexamples to historical labels with anonymous source locators in `docs/LOCAL_REPLAY_FINDINGS.md`. Source files and generated numeric-context reports remain ignored. One local file exceeds the product decoded cap and was inspected under an explicit larger offline cap; application limits remain unchanged.

No analyzer mappings, scores, verdicts or supported-family claims changed. NUF-009 remains in progress pending state-linked positive/negative rule evidence. Validation: both corpus inventories, the default-cap exclusion, source-locator/manual numeric checks, Git ignore coverage and `git diff --check`; see the implementation log for exact scope. Full application checks were not rerun for offline tooling/documentation changes.

## 2026-11-09 - UI-paired BB3 semantic evidence

Metadata: commit(s) `not created; working-tree changes`; scope `NUF-008–013/016/022 investigation`; status `partial; runtime contracts unchanged`.

Used Computer Use to finish a controlled Human/Black Orc hotseat match. No replay export or new saved BBR appeared, so its 18 observations remain UI-only and ignored. Then inspected two existing BBRs inside BB3 and paired 20 observations with 61 numeric source records in sanitized JSON evidence fixtures. Added a source-hash/extract verifier and `docs/REPLAY_UI_EVIDENCE.md`, identifying 15 roll-family labels and five block symbols in annotated contexts. Recorded critical Loner gating, pass outcome, movement-container and role-attribution counterexamples. Corrected the earlier unproven assertion that omitted BoardState fields necessarily mean unchanged state.

No runtime labels, probability/scoring contracts or backlog closures changed. Acceptance still needs held-out/version cases, fuller skill/damage/referee coverage and implementation tests. Source replay files remain Git-ignored. See the matching implementation entry for validation and environment limitations.

## 2026-11-09 - Continued mining and top-level dice events

Extended the BB3 UI/raw capture to 41 observations across five saved sources (129 verified step records and two direct event records), with 27 named roll families in scoped contexts. Added failed Bone Head/Foul Appearance, passing interference, Shadowing, modifier interactions, Dauntless, casualties, throw-team-mate/collision/landing chains, Unchannelled Fury, Projectile Vomit, Argue the Call and KO recovery. Source and arbitrary names remain private; committed evidence uses numeric IDs and hashes.

Discovered that direct ReplayStep/EventRoll elements carry recovery checks outside encoded StepResults. Extended the offline inventory and verifier for those events: 184 type-13 and 67 still-unidentified type-92 emissions across the corpus, with weather/fan/kick-off events counted separately. The historical step inventory remains 35,121 steps / 41 message/type pairs. No runtime contracts, scoring or remediation closures changed. Additional source investigation continues.


Further checkpoint: UI-042–045 in source 013 add Jump up, Tentacles, Fireball hit and Bribe. Evidence now totals **45 cases / 149 step records / 2 top-level event records across six sources**, with 31 numeric roll-family names in observed contexts. All six source verifiers, numeric-only and ID-uniqueness checks, direct-event mutation rejection and Python compilation passed. No runtime behavior changed or backlog item closed; BB3 research remains active.


## 2026-11-09 - Rare actions and Pick me up from existing replays

Continued Computer Use mining of original saved BBRs rather than claiming a hotseat export. Added UI-046–058: Breathe fire failure/success, Pro replacement Block dice, bomb passes/catches/Explosion/Bomb damage, Ball & Chain direction, Animosity before hand-off, Chainsaw foul/Argue the Call success, failed Regeneration, Jump over failure/same-face reroll/success, and successful/failed Pick me up. Final checkpoint: 58 manually annotated cases, 192 verified step records and six direct events across ten sources; 41 named numeric roll families in scoped contexts. The six direct events include four rolls and two accompanying skill usages. All sources still declare version1-4-0-0; held-out/version acceptance remains open.

New counterexamples: pass Outcome0 includes Wildly Inaccurate; bomb log wording reuses ball/catch terms; successful type88/89 damage checks harm friendly subjects; Jump over Moved1 coexists with failure/damage; Ball & Chain direction is Neutral; Pick me up type92 occurs outside encoded steps, with omitted Outcome on failure despite Used1 skill usage. See REPLAY_UI_EVIDENCE.md and numeric fixtures for exact locators. Type9 return-to-pitch transition still lacks observed dice roles. Complete skill, injury/casualty/apothecary, referee, state/default and beneficiary policies remain incomplete. No runtime mappings/scoring changed or backlog item closed.

Validation: all ten source/extract verifiers passed; unique IDs, numeric-only projections and Python compilation passed; a deliberately modified direct-event die was rejected at ReplayStep287/child3. Original replay/capture/analysis paths remain Git-ignored and no replay source is tracked. Full application lint/type/unit/build/browser checks remain unrun for the previously documented Node/dependency limits; this change only adds research fixtures and documentation. BB3 is paused in saved replay005; the broader data-gathering goal is still active.

## 2026-11-09 - Decision and apothecary evidence checkpoint

Added UI-059–064 from existing saved replays: defender block-pool handoff without new dice, Dodge-adjusted three-die block, Sidestep controller handoff, ordinary Animal Savagery activation and two distinct apothecary paths. Evidence now totals64 cases /220 distinct step records /6 direct events across ten sources. The casualty-choice question can transform the original Outcome field; the Stunty injury intervention can report No Injury without another random roll. These strengthen the migration evidence for separate roll, decision, controller and damage records; no runtime contracts were promoted. NUF-009/012/013 remain incomplete.

All ten source verifiers, unique-ID/numeric-projection checks, direct-event mutation rejection and Python compilation passed. Application checks remain unrun for the documented environment constraints. Raw sources and local analysis stay ignored. See REPLAY_UI_EVIDENCE.md for scoped correspondences and open acceptance gaps.

## 2026-11-09 - Applied casualty choice and interference evaluation

Added source021/UI-065–067: an apothecary replacement can be rejected while retaining the original casualty, or accepted to change Dead to Serious Injury. Failed Loner and two-subject Both Down damage corroborated in another source; Horns skill15 and offered-versus-applied interference modifiers annotated. Evidence totals67 cases /242 step records /6 direct events across eleven files. All source verifiers and research integrity checks pass. No production semantic or scoring contract promoted; NUF-009/011/012/013 remain open acceptance work. Type9 dice roles, absent referee failures and further recovery policies still require evidence.

## 2026-11-09 - Recovery and interception-chain evidence

UI-068 adds successful Regeneration after an earlier removal emission. Source015/UI-069 adds Pass-skill replacement under Disturbing Presence and successful interference followed by a separate catch and possession confirmation. This strengthens the evidence for distinct damage/recovery states and separate interference/catch random checks. Checkpoint:69 cases /253 step records /6 direct events across twelve sources, with41 named roll families in scoped contexts. Nested-message inventory identifies another successful interference candidate but still no failed Bribe or die1 Argue. All twelve source verifiers, integrity checks and git diff --check pass. No production mapping/scoring changes or issue closures; full rule/state/held-out acceptance remains open.


Further checkpoint: UI-070 in source027 independently confirms successful interference followed by failed Catch, three-die scatter and bounce. It contrasts UI-069 possession after successful Catch, adds applied inaccurate-pass−2/Stunty+1 modifiers, and pairs PlayerStep/29 with interference in a second source. Raw counter[17,16] occurs during a UI turn16 chain; no actual seventeenth home turn is inferred. Loading screen confirms Goblin versus Underworld Denizens. Evidence totals70 cases /260 step records /6 direct events across twelve sources. All twelve source verifiers and integrity checks passed. No runtime contract or issue closure; BB3 is paused at source027 replay end with the expanded dice log visible. The full gather-missing-data-and-close-game goal remains active.

## 2026-11-09 - Brawler and Wrestle evidence from saved files

Added UI-071–074: Brawler skill96 selectively replaces a single block die, Grab skill37 follows selection, and Wrestle skill68 changes selected Both Down resolution without new dice. Wrestle is observed on both attacker and defender, with both players prone and the active turn continuing without damage checks in these chains. Evidence totals74 cases /278 step records /6 direct events across thirteen sources. All source verifiers and research integrity checks pass. Raw casualty modifier candidates remain available for corroboration. No production mapping/scoring contract promoted and no issue closed; raw sources and private analysis remain ignored.

## 2026-11-09 - Modified casualties and separate Frenzy attacks

UI-075–078 independently corroborate Decay skill81 and niggling Injury modifier31 as distinct casualty modifiers, plus Frenzy skill36 creating another attack with new positions/assists. Evidence totals78 cases /301 step records /6 direct events across fourteen saved sources. Both Down can cause two damage chains before turnover; enclosing turn counters can advance before those consequences finish. A raw-only throw-in model fits all16 endpoints but retains explicit origin, edge and independent-labelling gaps. All source verifiers and research integrity checks pass. No production semantic/scoring promotion or issue closure; full tables, policy and held-out acceptance remain open.

## 2026-11-10 - Secondary casualty result from existing replay

UI-079 independently pairs D16=14+D6=2 with Head Injury and raw Outcome6 in source005, following the armor/injury chain on defender47. Evidence totals79 cases /307 step records /6 direct events across fourteen sources. The nested-message scan finds secondary faces2–6 but no face1 in the searched representation; repeated apothecary questions are not new attempts. Additional raw candidates remain available for faces3/4. All source and integrity checks pass. No runtime contracts promoted or remediation issues closed; complete casualty tables and policies remain open.

## 2026-11-10 - Broken Arm and Smashed Knee corroboration

UI-080/081 add two independently read casualty pairs from saved sources006/026:14+4 Broken Arm (Outcome7) and14+3 Smashed Knee (Outcome5). Source026 also pairs the resulting ball bounce8 with endpoint[22,2]. The evidence now totals81 cases /320 step records /6 direct events across sixteen sources. The secondary casualty observations cover faces2–6 in scoped contexts; face1 and complete modified/apothecary policies remain open. All sixteen source verifiers and integrity checks pass. No production behavior changed or issue closed.

## 2026-11-10 - Installed gameplay enum definitions recovered

Static file inspection of the installed BB3 PE64 image recovered82 BoardData/NetGameplay reflected enum tables with1,428 explicit name/value pairs. The committed research snapshot records source SHA-256 and per-entry byte offsets; the bounded standard-library extractor verifies it exactly without process access or execution. Six independent synthetic PE probes and deliberate snapshot-value mutation rejection pass. The96-entry roll tables agree and corroborate41 observed roll families, including UI/identifier aliases; step, skill, modifier, casualty, status, phase and period names are now available. BoardData and NetGameplay differ in some entries and remain separate. Numeric naming uncertainty is materially reduced, but rules/probabilities, field roles, state defaults and version linkage remain open. No runtime mappings promoted or remediation issue closed. See INSTALLED_ENUM_EVIDENCE.md.

## 2026-11-10 - Prayer and overtime evidence from oversized replay

UI-082-084 add a direct Fouling Frenzy prayer/effect pair, another Horns/Block resolution and independently displayed Extra Time/home turn20 from source020. Dump Off usage/question records preceding the block remain raw context because the decision label was not clearly observed. Evidence totals84 cases /327 step records /10 direct records across seventeen sources, with41 UI-named roll families unchanged. Added an explicit15-32MiB offline verifier option for this previously inventoried oversized source; the default and all application limits remain unchanged. All seventeen source verifiers, nine independent research tests and installed enum snapshot verification pass. No production behavior or issue status changed.

## 2026-11-10 - Used Dump Off and direct skill rules

UI-085 independently confirms a defender's used Dump Off during away turn20: Quick pass5-2 Accurate, teammate Catch6-3 Success with possession, then the original attacker's resumed StandUp/Block and failed armor[2,1]. Ten records604-610 bring replay evidence to85 cases /337 step records /10 direct records across seventeen sources. The prior UI-083 decision remains unconfirmed. Added GAME_SKILL_REFERENCE.md with23 separately counted tooltip rule paraphrases, including natural6 exceptions, Loner spending, casualty recovery, modifier timing and skill interactions. Names/IDs match the installed enum snapshot; manual rule transcription is not automated semantic verification. All source verifiers, nine research tests, reference-linkage checks and git diff --check pass. No production behavior or issue status changed.

## 2026-11-10 - Existing corpus still supplies missing cases

Cross-corpus nested-message audit of27 private sources and12 demos finds secondary casualty face1 in a demo: dice[13,1], Outcome6, followed by successful Regeneration. This closes the scoped raw-candidate absence across both corpora, not independent semantic acceptance. Failed Bribe and die1 Argue remain absent from the searched representation. Added exact numeric locator/hash and remaining mining priorities to LOCAL_REPLAY_FINDINGS.md and PROJECT_PLAN.md. Raw inputs and audit output remain ignored; nine research tests and diff checks pass. No production mapping/scoring promotion or remediation closure.

## 2026-11-10 - Demo playback fills secondary casualty face gap

Added UI-086 from a repository demo imported into BB3 and verified by hash. Its casualty[13,1] is independently displayed as Head Injury, followed by successful Regeneration; armor[3,5]+Mighty Blow1 succeeds against9+. Source evidence now totals86 cases /343 distinct steps /10 direct events across eighteen saved sources. Added Dirty Player1 and Pro tooltip references, bringing the separate rule-reference count to25. All source verifiers, nine research probes, reference name/ID checks and diff checks pass. The controlled research template gained Pro with unlimited template SPP. Recovered a hotseat settings navigation dead end by a verified menu quit/relaunch; no new match or replay export was generated. No production behavior or issue status changed; complete policies/state/version acceptance remain open.

## 2026-11-10 - Remaining-source mining priorities

Independently recounted13,004 raw step emissions in the ten local sources without positive UI fixtures. Direct-message triage retains37 targeted candidate emissions across Interception, Pro, FireballHit, Chainsaw, Loner, Animosity and BreatheFire. Four families supply both raw Outcome0 and1 branches. Added scoped counts and source-held-out limitations to findings and plan; private locators remain ignored. No new UI cases, production mappings, scoring changes or issue closures.

## 2026-11-10 - Controlled referee resource chain

Added HOTSEAT_EXPERIMENTS.md with ten separately scoped UI-only hotseat observations, including a failed Bribe1 followed by another selected successful Bribe4 on the same ejection, bribe counts3→2→1, a neutral Argue5 and direct Stunty Badly Hurt→ordinary apothecary→No Injury. Explicit timeout reasons are not relabeled as referee turnovers. The current match has not been exported, so raw mapping acceptance and paired fixture counts remain unchanged. Corrected current custom-team/template terminology; historical logs remain append-only. Eighteen source verifiers and nine research tests pass; no production behavior or remediation closure changed.


## 2026-11-10 - Trapdoor and KO mitigation observations

Extended HOTSEAT_EXPERIMENTS.md to HS-014. Second-half blue9 self-skull caused AV9+ [4,6], injury[5,4] KO; ordinary apothecary converted it to on-pitch Stunned while the original failed-action turnover remained. Red9 foul AV[5,5]/injury[4,1] ended in send-off and Failed action; no argument die was observed, so the late attempted Argue click is not accepted as Argue1 evidence.

Treacherous Trapdoor prayer D16=1/Half was observed. Blue lineman5 entered on turn10 (2+ die6 success), then re-entered three times in one turn11 activation (3 success,5 success,1 failure). Failure offered a team reroll; keeping1 removed the player and directly rolled injury[1,3] Stunned without a visible armor step. The turn remained active. Carrier/bounce behavior and exact off-pitch placement remain untested. These observations are UI-only and add no paired raw fixture or production mapping.

Ended both sides through turn16 and observed a normal0–0 result. Replay and Download stayed greyed out; a Download click caused no change. Saved/Replays still held28 files, newest write2026-11-09 19:19:53, checked2026-11-10 02:06:53 local. No controlled-match export was obtained. BB3 remains open on results; the full research-and-close-game goal is incomplete. No runtime change or remediation closure.

Validation: eighteen hashed source verifiers pass (86 paired observations /343 step records /10 direct events); deliberate numeric mutation rejected. Nine research tests pass; git diff --check passes and raw candidate audit remains Git-ignored. Full app lint/typecheck/build were not run for this documentation-only addition.


## 2026-11-10 - Source008 failed Pro and recruitment identity reuse

Classified the preceding goal turn as progress: it added controlled KO/trapdoor observations and verified normal hotseat completion without export. Reconnected to the live BB3 window and opened source008 through profile > History > Saved Replays. Its loading screen independently names Imperial Nobility/home and Norse/away. Sought away4, stepped to action1, then used normal playback to retain the full decision chain. Paused during following home4/action1 with the preceding log preserved.

Added UI-087: Chainsaw2+ die1, Pro3+ die1, repeated Chainsaw1, self-armor9+ [2,5]+Chainsaw3 Success and injury[2,1] Stunned; team rerolls remain2. Exact104/105/106 records show final Pro and Chainsaw NewRoll0, team-reroll Used0, intended target11 versus self-damage subject48 and modifier owner48. Added UI-088: following home block has identical two-die pool, defender-owned Block, Attacker Down, attacker armor8+ [1,5] Failure and TURNOVER. No new pool-symbol label is inferred solely from the raw face codes.

Investigated the mismatched visible star identity rather than assuming it names the final recruit. Raw ReplayStep7/1 buys ID48/type1455 at150000;7/3 supplies that Data;8/1 emits EventRemoveMercenary for48/type1455 with Validity0;9/1 buys ID48/type1121 at140000 and9/3 omits Data. Playback retains the earlier portrait/card while the action uses later Chainsaw/Pro behavior. Exact numeric recruitment events and both state snapshots are retained as chain context, without claiming the recruitment UI choices were independently observed or defining universal omission/removal semantics. The first roster occurrence or displayed portrait is insufficient for final identity.

New sanitized fixture bb3-ui-playback-008.json preserves nine step records and six direct context records. Totals:88 UI cases /352 distinct step records /16 direct records across nineteen sources, eighteen local originals plus one demo.41 named roll families unchanged. Nine local sources remain without positive fixtures; the earlier ten-source triage remains explicitly historical. Synchronized plan/backlog/findings/UI evidence. No production mappings, probabilities, scoring or issue statuses changed.

Validation: nineteen source verifiers passed before the five additional recruitment/state records; the changed source008 verifier then passed all nine steps/six direct records. Deliberate recruitment-type mutation rejected at7/1, alongside the earlier direct-event mutation rejection. Nine research unit tests pass; git diff --check passes; private raw/mutation artifacts are Git-ignored. Full application lint/typecheck/build were not run for research-fixture/documentation changes. BB3 remains open and paused at source008 home4/action1; the full evidence-and-close-game objective remains incomplete.


## 2026-11-10 - Source018 Fireball ownership and spell injury

Metadata: commit(s): uncommitted; scope: research evidence for NUF-008/009/011/013/016; status: partial.

Converted items: Added UI-089 and sanitized source018 fixture with three Fireball checks, explicitly observed home caster, away11/home12 boundary, damage to an away subject and Spell(+1) injury modifier. Retained four step and four direct context records. Corrected prior UI-044 prose: PlayerStep StepType19 is distinct from DamageStep Source3; saved raw extracts were already correct. Current evidence89 cases/356 distinct steps/20 direct records across twenty saved sources;41 UI-named families. Eight local original hashes lack positive fixtures.

Remaining follow-ups: General omitted-field policies, actor/subject/controller attribution, rule distributions, rerolls, state reconstruction and version acceptance remain open. No runtime semantics, migration status or issue closure is promoted. Controlled hotseat export remains unavailable; game remains open while the broader research objective is incomplete.

Verification evidence: all twenty hashed source verifiers pass; direct-event and new Fireball modifier mutations reject; nine Python research tests pass; git diff --check passes. Full application checks were not run for this research-only change.


## 2026-11-10 - Source011 breath branches and natural-six catch

Metadata: commit(s): uncommitted; scope: source-linked research for NUF-007–013/016; status: partial.

Converted items: Added UI-090–093 with20 exact step extracts from source011, independently loaded Chaos Dwarf versus Norse. Breathe Fire kept4−Strength1 misses without ending the turn, kept natural1 causes self-Prone/armor check, and die5 succeeds to opponent Prone without armor. Following Blitz/ball-return chain shows Catch1−5 Failure and natural6−4 Success against base4+, with raw Difficulty6 for both; this supplies direct catch-specific natural-six evidence and modifier-owner/roller separation. Current93 cases/376 distinct steps/20 direct records across twenty-one sources;41 UI-named families; seven local originals lack positive fixtures.

Remaining follow-ups: Precise Breathe Fire strength/natural-one rules, universal field/default and version policies, full reroll/state/attribution contracts and raw referee gaps remain open. No production mapping or scoring behavior changed; no remediation closure. BB3 remains open while the broader evidence-and-close-game objective remains incomplete.

Verification evidence: all twenty-one hashed source verifiers pass, direct-event and natural-six mutations reject, nine research tests pass, git diff --check passes and private analysis output is ignored. Full application checks were not run for fixture/documentation-only research.


## 2026-11-10 - Source025 pass chain and capture audit

Metadata: commit(s): uncommitted; scope: research evidence for NUF-007–013/016/022; status: partial.

Converted items: Added UI-094 with seven source-verified step records showing a Pass reroll, failed opposing interference and Catch reroll in one action chain. Kept controller/actor/receiver and modifier ownership separate. Current94 cases/383 step records/20 direct records across22 sources;41 named families. Added REPLAY_CAPTURE_GAPS to scope finite remaining collection independently of runtime implementation. Six originals without positive fixtures contain8,408 independently recounted step emissions;10 historical targeted candidates remain.

Verification evidence: all22 source verifiers pass, deliberate direct-event and interceptor-owner mutations reject, nine research tests pass. Full app checks were not run for this evidence/documentation change. Private replay corpus and analysis remain Git-ignored.

Remaining follow-ups: source-specific natural/role/reroll/state policies, raw failed Bribe and natural1 Argue, version and independent acceptance. No production semantics, scoring or issue closure changed. Hotseat export remains unavailable; BB3 stays open pending the full requested data objective.


## 2026-11-10 - State counterexamples and offline rule facts

Metadata: commit(s): uncommitted; scope: research for NUF-007–013/016/022; status: partial.

Converted items: UI-095/096 preserve15 steps/six direct records for crowd removal with off-pitch CanAct1/TackleZone1, and a carrier knockdown whose next BoardState omits Carrier/IsHeld while UI shows a loose ball. Current96 cases/398 steps/26 direct records across22 sources. Added bounded JSON-only offline archive extractor and178-row static evidence snapshot; all105 skill,11 casualty and five characteristic codes/names agree with executable enums. No game modules executed, no production mapping or issue closure.

Verification:22 replay source verifiers, deliberate board/possession mutations, exact offline snapshot comparison, changed casualty-code rejection, archive-cap/duplicate-member rejection and nine research tests pass. git diff --check passes. Full application checks were not run for research-only changes.

Remaining follow-ups: complete state/default/role/distribution policies, active offline-package/version linkage and missing referee raw branches. Private client-log snapshot corroborates Bribe1 Failure but has no serialized replay roll/step. The broader objective is incomplete; BB3 remains open and paused.


## 2026-11-10 - Corpus action-team field and session provenance

Metadata: commit(s): uncommitted; scope: research for NUF-009/012/013/016/022; status: partial.

Converted items: Added a reproducible27-source action-team audit:6,342 ResultUseAction messages all explicitly TeamId0, including2,920 actors on initial roster index1. Preserved raw numeric/hash locators and unresolved initial memberships113. Added sanitized runtime registration evidence for the examined offline archive, retaining conflicting external/internal revision3/23 and import-precedence limits. Counts remain96 UI cases/398 steps/26 direct records. No primary/legacy runtime behavior or issue status changed.

Verification: exact corpus recount, invalid/default cap checks, deliberate aggregate mutation rejection, registration path/hash checks and nine research tests pass. New audit compiles, git diff --check passes and private artifacts stay ignored. Full app checks were not run for research-only work.

Remaining follow-ups: natural1 Argue, raw failed-Bribe linkage and complete supported role/state/distribution/version contracts. New hotseat preparation encountered missing Back navigation; Go Offline opened profile Connection. All game input stopped for manual connection. No second match or new dice observation occurred. BB3 remains open; full objective remains incomplete.


## 2026-11-10 - Natural-roll arithmetic review targets

Metadata: commit(s): uncommitted; scope: research for NUF-007/009/012/022; status: partial.

Converted items: Added scoped39-source single-D6 audit and exact numeric discrepancy snapshot.3,822 direct binary-result emissions across31 RollType IDs produce nine modified-sum disagreements (eight natural6, one Catch1 with+1). All selected outcomes agree with their recorded Difficulty and a2–6 clamped threshold relationship in this sample, without universal rule acceptance. Saved two precise further UI targets, including the Catch skill replacement after the natural1. Existing ProbaDescription enum names2 Success/3 Fail are now explicitly linked as naming evidence in UI-094 notes; field/version limits persist. No production mapping, probability/scoring or issue closure changed. Counts remain96 UI cases/398 steps/26 direct records.

Verification: exact audit regeneration matches the independent initial scan; raw-Outcome mutation and invalid caps reject; numeric privacy checks, note-only source025 verifier and nine research tests pass. Module compile and git diff --check pass; private artifacts remain ignored. Full application checks were not run for this research-only change.

Remaining follow-ups: complete supported natural/role/state/reroll/version contracts, raw failed Bribe and natural1 Argue. BB3 remains on the same offline Connection notice awaiting manual profile connection, revalidated without input. No second match or game closure occurred; full objective remains incomplete.

Cross-fixture reconciliation: two of the nine arithmetic discrepancy locators already have direct UI evidence, not just source011/UI-093. Source016351/1 is UI-049's bomb Catch4+6−3 Success before Explosion; source01154/8 is UI-093's ordinary-ball Catch4+6−4 Success. Seven other locators remain raw review targets. No new UI case is counted; avoid recapturing UI-049 as though it were unobserved.


## 2026-11-10 - Additional source-linked Catch evidence

Offline handoff follow-up (2026-11-10): the user connected the local profile manually. A fresh main-menu observation confirmed the handoff cleared. My Teams is disabled in offline hotseat setup; default rosters transition directly from Chaos Chosen to Chaos Renegades in the inspected portion, providing no Breathe Fire reference through that route. No match was started. Profile → History → Saved Replays remains available offline and successfully loads source025. UI-097 independently displays away16 Action2: Quick pass4+ die5 Accurate, Catch2+ die1+Diving Catch1 Failure, Catch skill replacement3+1 Success, then receiver possession. Reroll counters stay1/1. Three exact records444/0,5,6 bring totals to97 cases/401 steps/26 direct records across22 sources. This closes the UI-transcription gap for that specific arithmetic counterexample, not its broader supported rule contract or a production issue. Source016258/1 Pass6 under negative modifiers remains the next discriminating target; raw-linked failed-Bribe and natural1 Argue gaps remain open. The previous profile handoff is resolved; the game remains open with saved-replay analysis resumed.


## 2026-11-10 - Additional pass and failed-trait consequence evidence

Source016 follow-up (2026-11-10): UI-098 independently displays away8 Action9 Long pass4+ die6-4 Accurate, with Long pass-2 and grouped Disturbing Presence-2. Home interceptor10 then fails Interfere4+ die5-8 (accuracy-3, four tackle zones-4 and Disturbing Presence-1); Bounce2 lands at[6,9] and home8 starts. Four exact steps and five direct context records retain the pass/response, role ownership and held/intermediate/loose ball states. Intermediate309/5 retains Carrier46 after the pass while IsHeld is omitted and the ball coordinate differs from the passer's cell; Carrier alone is not sufficient held-possession evidence. UI-099 adds two separately selected Foul Appearance2+ die1 failures (away Actions5/6), followed by different teammates acting during the same turn. Five exact steps/four BoardState records preserve each actor's explicit CanAct1 to omission transition, subject-owned Skill10, unchanged cells and continued team turn. Omission is not promoted to a universal false/default rule. Current totals99 cases/410 distinct steps/35 direct records across22 saved sources; six original hashes remain unpaired. The source016 numeric verifier passes; deliberate pass-Outcome and intermediate-Carrier mutations reject; global ID/locator recount passes. No runtime mapping, rule contract or backlog issue is closed.


## 2026-11-10 - Offline hotseat capture limitation verified


Offline export follow-up (2026-11-10): HS-B used two default Black Orc teams in offline local hotseat, bought no inducements, and finished normally0–0 after both sides ended turn16. The results view exposed no Replay/Download control. At15:38:14Z the replay directory remained28 files with unchanged newest write/length. The temporary Hold→Toggle input test was restored to Hold; pitch selection remained unresolved while menu/End of Turn worked. See HOTSEAT_EXPERIMENTS for setup and limits. No new raw replay, paired case, runtime mapping or issue closure resulted. Raw-linked failed-Bribe/natural1 Argue remain blocked on a viable capture route; existing-file research remains possible. Current paired totals remain99 cases/410 steps/35 direct events across22 sources. The game is open and the full data-gathering objective remains incomplete.

## 2026-11-10 - Verified numeric check runtime contracts

Scope: NUF-007/009/012/013, still in progress; report schema 2.0/model dice-only-3. Applied independently observed Rush/Dodge/Pick up/Catch identities, Block/Blitz actions and movement/catch/pass containers. Really Stupid/Foul Appearance/Loner are named correctly but unscored. Numeric admission now requires replay 1-4-0-0, explicit fresh/status/target/outcome/one-D6 evidence and consistent base/modifier arithmetic. Catch-specific natural-one/six observations do not generalize to every family.

ResultUseAction.TeamId stays raw and no longer overrides roster ownership. A full team reroll requires valid failed original dice, matching action/roller/gamer/targets/modifiers and an explicit fresh replacement; skill or action interruptions invalidate that simple policy. Production parse/score regressions use exact sanitized UI fragments from three sources. Unsupported replacement, damage, block and referee evidence stays excluded; whole-match verdicts still abstain. This advances the dice pipeline without introducing contextual weights or closing broad semantic issues. Validation and provenance are recorded in the matching implementation-log entry. Research predecessor 34fc684 is independently verified on GitHub; runtime publication is tracked separately.


## 2026-11-10 - Observed board-state checkpoints

Scope: NUF-008/013/016; NUF-016 advances to in_progress, not done. The primary replay model now retains ordered compact numeric BoardState/InitialBoardState observations with original ReplayStep/child locators and an after-source-event boundary. The pure observer preserves omissions as unknown, distinct roster/team/gamer namespaces and off-pitch geometry independent of CanAct flags. Held possession requires explicit, consistent current-snapshot evidence. A strict last-observation lookup cannot read a post-event checkpoint as pre-event context. No intermediate state simulator, legal useful-activation count or contextual weight is introduced; report schema2.0/model dice-only-3 and existing random-event IDs/counts remain unchanged.

Thirteen new regressions exercise exact UI-095/096/098/099/084 event projections and adversarial omission/version/ordering/ownership/collection boundaries. Source016/020/025 numeric verifiers pass, with the oversized research source using its explicit offline cap. Lint/typecheck,228 unit tests in35 files, production build and four browser flows pass. See STATE_RECONSTRUCTION and the implementation log for contracts and remaining work. The game-dependent capture audit now distinguishes finite rule/state targets from offline engineering. Source009 sequence221 failed-Dodge/turn-ending chain is selected for held-out playback; a Windows Security prompt requires manual dismissal. No new UI case or completed game-collection claim is recorded.

## 2026-11-10 - Retained originals after declined team rerolls

Scope: NUF-007/012/014/021/022, all remain in progress. Pulled the configured `nufflizer/master` upstream from `654a85b` to `8cd5cb8` by fast-forward before implementation; `origin` remains the separate legacy repository. This follow-up is uncommitted.

The primary numeric pipeline now recovers an explicitly declined team's original failed check when its fresh question evidence and kept summary match exactly. UI-022's Pickup3+ die2 previously disappeared because the summary correctly says NewRoll0; it now scores once at2/3 success probability with original die/question provenance. Model advances to dice-only-4; schema2.0 and category weights stay unchanged. Same-step independently emitted originals and subsequent kept summaries do not add another contribution. Explicit matching gamer/step/target evidence is required; unknown messages and conditional skill/state/action interruptions invalidate the simple link. General skill, resource and causal-action policies remain unfinished.

Independent standard-library decode of demo1 identifies kept Pickup4+ die3 (question60/0/3 -> choice61/0/0 -> summary61/0/1) and Catch5+ die3 (question61/2/0 -> choice62/0/0 -> summary62/0/1). The production browser/export flow now checks11 supported ball-handling events, including those1/2 and1/3 probabilities and original dice. Unit/API/CLI/report checks, production build and four browser flows pass; see the implementation record for commands and the transient timeout observed during browser verification. No new private replay, UI observation, deployment, commit or push was created.

## 2026-11-10 - Retained-original implementation publication

The user requested committing and pushing the verified dice-only-4 retained-original implementation and its tests/handoff changes to `nufflizer/master`. This commit includes the previously uncommitted slice; see Git history and the implementation publication record. Semantic/contextual issue statuses and acceptance limits are unchanged. Generated artifacts and private replays remain excluded; remote confirmation is reported after the push.

## 2026-11-10 - Block, armor, context and shared quota checkpoint

Dice-only-5 adds linked raw block symbol distributions and 2D6 armor from the affected player's perspective; injury/recovery and referee probabilities remain unscored. Mobility-possession-1 reports separate, bounded context estimates for verified non-carrier Dodge and open Pickup. The report still abstains from whole-match verdicts. Raw names and namespaces now match the installed evidence, including Land42, Throw a Rock70, Bribe21 and Argue30.

NUF-007 closes bounded arithmetic acceptance; the block/damage/action/state and final product gates stay open. The upload boundary now supports one atomic Redis gate across instances. The user restored CI and selected an isolated Vercel preview. See the implementation log for evidence and hosted verification status. No user replay storage or production deployment was added.

## 2026-11-10 - Hosted shared quota and primary parser cost

NUF-024 closes on independent Redis integration and isolated Vercel Preview quota/lease evidence. The shared gate fails closed when its temporary free Preview store expires. NUF-023 remains open after successful app/platform size checks and a real replay timeout. Primary analysis avoids allocating a second source-step tree when top-level metadata is available; 12 demo replay models agree with the full parse, and legacy fallback keeps the full tree. Execution/size limits and score contracts stay unchanged. See the implementation record for hosted measurements and the Linux reproduction.

## 2026-11-10 - Recorded skill rerolls and board parse projection

Dice-only-6 counts supported same-step Dodge, Catch and Sure Hands rerolls once, with original dice, choice and result provenance and explicit team cost. Conditional/mixed skills and broader action accounting stay open. Primary parsing skips unused snapshot fields without changing the ordered evidence or the legacy raw tree. Restored frozen CI passed on d669cd5; the previous Preview passed exact upload size boundaries but still timed out on larger real replays. See the implementation record for deployment and corpus evidence.

## 2026-11-10 - Hosted real replay verification and conditional recovery

The isolated Preview passed two representative large replay uploads after snapshot projection, and restored CI passed the exact deployed source. Redis stays scoped to Preview with temporary storage. Dice-only-7 separately scores verified post-casualty Regeneration from the injured player's perspective and preserves causal source links without treating removal as another roll. Ball and Bomb carrier observations no longer conflate their ownership or count as repeated turn-control evidence. No complete damage-state model or whole-match verdict is claimed.

## 2026-11-10 - Apothecary dice and observed decisions

Dice-only-8 inventories the original injury or casualty embedded in an Apothecary usage question and the fresh replacement in a casualty choice. Matching direct originals count once. Linked outcomes identify the injured roster and observed resource use. Injury and casualty distributions remain unscored.

## 2026-11-10 - Roll family coverage and roster conflicts

Dice-only-9 adds reconciled roll counts by roster and source family. Conflicting declarations and overlapping player IDs stay in the overall roll denominator under unresolved attribution.

## 2026-11-10 - Loner resource evidence and movement consistency

Dice-only-10 records a verified Loner gate and its team resource cost separately from replacement dice. Mobility-possession-2 clears board evidence after contradictory move dice or actor linkage and retains supported dice-only outcomes.

## 2026-11-10 - Direct KO recovery

Dice-only-11 scores the directly recorded unmodified KO recovery check for the affected player's verified roster. The direct failure shape omits Outcome. The contract keeps that omission and scores it only when the single die is below the recorded 4+ target.

## 2026-11-10 - Direct questions, results and ordered movement

Dice-only-12 retains direct questions and results alongside encoded action messages. Direct referee rolls add evidence coverage with unknown odds, and decision/removal records keep their order without adding dice. NUF-008 closes on ordered-source acceptance. Full state reconstruction remains NUF-016.

## 2026-11-10 - Damage step contribution accounting

Dice-only-13 exports ordered evidence and a reconciled subtotal per damage step when verified armor or Regeneration anchors it. A repeated removal summary supplies context and does not change the score. Ambiguous repeated armor dice remain unscored.

## 2026-11-10 - Direct evidence corpus check

The independent inventory now counts direct questions and results separately from encoded steps. The test suite checks all 12 sanitized demo reports against those per-source counts.

## 2026-11-10 - Direct KO recovery with Kegs

Dice-only-14 accepts a single independently corroborated Kegs +1 modifier on a direct KO check and uses its recorded 3+ target. Other modifier policies remain open.

## 2026-11-10 - Held-out movement context and fallout

Schema 2.1 links scoped Rush and Dodge failures to the same player's observed fall, damage and turnover. The group sums existing dice contributions and retains unknown injury odds and observed removals. Mobility-possession-3 preserves the activation through a verified ordinary stand-up and explains a verified move toward or away from an explicitly held ball. These observations add no tactical weights.

## 2026-11-10 - Team reroll outcomes in movement falls

The movement-fall report also links an ordered team-reroll decision when the terminal scored check independently matches that decision and its original question. The existing one- or two-attempt odds supply the movement part of the subtotal.

## 2026-11-10 - Skill-rerolled falls and scoring-move evidence

Dice-only-15 links a verified failed Dodge-skill replacement to the matching self-fall and turnover. Schema 2.2 and mobility-possession-4 carry a verified pickup through later movement and record a direct touchdown after a matched successful move. The report keeps the observed touchdown separate from pre-roll context and from the roll's dice contribution.

## 2026-11-10 - Final-turn scoring attempts and Pro observations

Schema 2.3 and mobility-possession-5 expose the carrier's recorded team-turn counter and end-zone attempt under verified standard geometry and explicit roster Side. Partial direct touchdown coordinates remain nullable. Pro gates show source-linked 3+ pass/fail observations and zero team reroll spend. The existing dice model remains dice-only-15.

## 2026-11-10 - Raw block and context-evidence contracts

Schema2.4 and dice-only-16 retain independently observed block pools when selection or applied outcome is unavailable. A verified Pro pass can link one explicitly eligible replacement die and its conditional raw distribution. Deterministic no-roll records and exact same-action kept summaries add no random outcome. Reports preserve source home/away order and expose reconciled context-field, calculated-impact and movement-consequence counts across JSON, UI and CLI. Whole-match verdicts still abstain.

## 2026-11-10 - Staff-question injury retention

Schema2.5 and dice-only-17 expose original injury dice embedded in staff-choice questions. Fourteen public-demo records reconcile against independently extracted numeric evidence and locators. They retain unknown expectations and add no score. Exact earlier direct originals can link copied questions without adding a random outcome. The production browser verifies the saved Stunty injury through upload, filtering, explanation and export.

## 2026-11-10 - Inspectable timeline identity and clock

Schema2.6 preserves explicitly historical initial-roster names on uniquely attributed events. UI and CLI share their label. Web controls search players and filter observed half, team turn and activation before ranking/pagination. All controls reset for another upload. No dice/context calculation or current-identity inference changes.

## 2026-11-10 - Pickup ball-chain evidence

Schema2.7 links scoped failed pickups to recorded standard-ball bounces and verified catches. Exact directions, source ordering, landing cells and retained-original decisions are checked. The grouped dice subtotal references existing contributions by team and adds no tactical weight. Unknown successor policies and possession/turn value stay explicit.

## 2026-11-10 - Current player-trait data

Schema2.8 retains numeric current-snapshot skill lists and player-type observations with separate actor/target roles and strict pre-roll provenance. Omitted lists, malformed data, ownership conflicts, recruitment/ID reuse and future observations cannot supply a fabricated complete trait set. Human-readable trait names describe recorded data without changing odds or implying eligibility. Complete persistence/mutation policies and trait-conditioned tactical models remain open.

## 2026-11-10 - Replacement purchase and actor ownership evidence

Schema2.9 records selected mercenary data separately for each purchase, with strict first-roster and replacement/removal links. Source008's reused ID48 no longer hides the distinction between selected types1455 and1121. Dice-only-18 can attribute an unnamed new actor from fresh unique roster membership while preserving explicit/initial conflicts and unknown current eligibility. No contextual value or complete identity-persistence rule is inferred.

## 2026-11-10 - Player activation loss in context state

Schema2.10 and mobility-possession-6 distinguish a confirmed ordinary-Block Foul Appearance activation loss from a team turnover. Later same-turn availability can exclude the spent player using explicit source links, while snapshots and missing flags remain unchanged. Known position and tackle zone persist. The loss itself keeps unknown tactical value; later scoped mobility estimates account for the reduced useful-move set. UI and CLI expose these consequences, with all comparative verdicts still abstaining.


## 2026-11-11 - Ordinary Move completion and terminal mental-trait state

Schema2.11/context mobility-possession-7 distinguish completed ordinary movement from terminal Bone Head/Really Stupid failure. Source-linked same-turn availability excludes ended players from later useful-move estimates. Ordinary completion preserves tackle zones; a verified trait effect removes them. Fresh, kept-original and successful Loner4+/replacement paths remain distinct, with original/replacement sources retained and unknown trait odds. Public-demo extracts are independently reproducible; the UI-007 complete-state continuation is synthetic. Cross-turn effects, general completion/reactivation and calibrated lost-action values remain open. Dice-only-18 and comparative abstention are unchanged.

## 2026-11-11 - Continuous activation-confirmation clocks

Strengthened the new and existing activation-loss paths to reject an intermediate clock change even if a later board returns to the same values. The bounded checkpoint pass retains pending-reroll states while refusing unknown/changed clock epochs. Foul Appearance now anchors its before-state strictly before declaration. Schema/model versions and accepted positive policies remain unchanged.


## 2026-11-11 - Current Confused effects and next-activation state

Schema2.12/context mobility-possession-8 derive current tackle-zone suppression from bounded positive effect44/provider31 or51 observations, including opponent turns, without carrying omissions or declaring a player spent in its next turn. Explicit effect ending removes the old effect without fabricating restored tackle zones. Matched fresh trait tests preserve supported movement or wait for new failure aftermath. A failed Loner4+ branch retains the original and one team resource spent. Independent public-source projections and complete-state synthetic pickup comparisons keep observed state, dice odds and provisional context units separate. Broad completion, duration/resource policies, calibration and all17 remaining issues stay open; dice-only-18 is unchanged.


## 2026-11-11 - Loner variants and explicit drive-end observations

Schema2.13/dice-only-19/context mobility-possession-9 admit source-backed3+/skill1008 gates alongside4+/skill44, retaining observed spend, failed original and separately verified conditional full block replacements. Fresh pools use fair conditional odds; the gate is unscored and copied pools add no random outcome. Explicit Confused ends before setup retain their first following on/off-pitch observations without turning setup flags into playable availability. Shared API/UI/CLI explanations, independent public extraction and full-source worker acceptance preserve the difference between dice, observed aftermath and provisional context. General trait/resource/drive policies, valid late failure value, held-out calibration and all17 remaining issues stay open. No new hosted acceptance is claimed.


## 2026-11-11 - Applied block skills and subject-specific aftermath

Schema2.14 separates a terminal block pool's recorded skill resolution from its raw-symbol target and links immediately adjacent ordinary block damage by victim. Block, defender Dodge, attacker Tackle and either participant's Wrestle have distinct source-backed explanations. Both-down damage retains each subject team's existing dice contribution; Wrestle-prone does not add knockdown armor or prove a turnover. Earlier rerolled pools remain separate. Web/CLI label block actuals Raw target met/missed so a negative raw-symbol result is not described as a failed applied block. Independent public Tackle extraction reconciles six supported and two unmodeled Sidestep/controller-wait chains. Dice-only-19/context mobility-possession-9, score weights, uncertainty and whole-match abstention remain unchanged. Full skill-conditioned distributions, current-trait legality, state successors and all17 open issues remain acceptance work.


## 2026-11-11 - Valid movement successors and bounded conditional context

Schema2.15/context mobility-possession-10 constructs the Dodge-success occupancy before valuing other ordinary standing moves. Fresh matched skill lists and explicitly empty Effects are required for known ordinary-move eligibility; omissions and unmodeled activation traits stay unknown. A committed own Dodge reroll now has a conditional terminal-die context component, separate from the unchanged dice-only-19 two-attempt score. Ten public-source checks expose possible-value ranges over incomplete availability, with no midpoint or point-total contribution. The Context range filter and shared CLI explanations expose stage, scope and uncertainty. Source observations, complete-state synthetic continuations and calibrated tactical value remain distinct. All17 broad issues remain open; this does not complete possession/resource/trait persistence or late-game value acceptance.


## 2026-11-11 - Active ordinary Move continuation

Schema2.16/context mobility-possession-11 adds one bounded continuation option for the already active ordinary Move after a committed Dodge replacement. Current budget, continuous declaration/clock provenance, success occupancy and opponent marking determine known0/1 or uncertain0–1. Unused-teammate eligibility remains strict. Public goblin6→4 movement corroborates the interpretation without future backfilling. Ten source ranges and zero point estimates remain; raw dice-only-19 and whole-match abstention are unchanged. Web/API/CLI share the proof and explanation. All17 broad issues remain open; actual skill-reroll state continuation remains a separate reconstruction dependency.


## 2026-11-11 - Actual movement after a committed Dodge replacement

Schema2.17/context mobility-possession-12 preserves actual ordinary Move state only after a verified adjacent original failure, own Dodge use, successful replacement and confirmed Dodge-only movement. The pending board remains unavailable until confirmation. Position/budget and a known carried ball then advance once; later ordinary movement and the existing completion policy can use this prefix. Unknown mutation/checkpoints, modifiers, extra summaries, pushbacks and failed terminal outcomes withhold the transition. Current trait state is preserved only within verified moves; fresh omissions do not inherit. Source-linked observations and shared web/CLI copy add no luck score. Dice-only-19, ten public ranges, zero public point estimates, comparative abstention and all17 open issues remain unchanged. The independent extractor now preserves actual empty Modifiers/Pushbacks fields rather than silently omitting them.


## 2026-11-11 - Eight-way pickup possession successors

Schema2.18/context mobility-possession-13 preserves all initial bounce alternatives after a committed Sure Hands replacement and exposes a bounded own-possession component separately from compound raw dice and team point totals. Occupied/off-pitch branches and unknown reaction traits/effects retain uncertainty. A current passive-trait/empty-effect guard also repairs the older pickup estimate; source flags and unused-player eligibility are not filled. Two independent public demo6 cases add two possession ranges to the existing ten movement ranges, with zero point-valued context estimates. API, CLI and Context range UI share the source-linked contract. All17 broad issues and calibrated/full tactical acceptance remain open.


## 2026-11-11 - Actual secured possession after Sure Hands

Schema2.19/context mobility-possession-14 resumes actual held-ball state only after a verified unmodified own Sure Hands replacement passes. The already spent movement point is not charged again; later verified moves advance player/ball with their own costs and source links. Failed/interrupted/checkpoint-separated chains stay unavailable and earlier omissions remain unknown. Source demo6 confirms6→4 across two moves and a successful pickup retaining4; later-move probes are explicitly synthetic. Observed possession and Dodge movement now contribute consequence coverage, without a new luck score. Twelve public component ranges and zero point-valued context estimates remain. Runtime4s limits are unchanged; real-worker HTTP acceptance now runs after parallel corpus tests to avoid unrelated timing contention. All17 broad issues remain open.


## 2026-11-11 - Missing-roster-ID qualification

Tightened schema2.19 pickup admission to reject conflicts between the two replay teams and current roster identities. An omitted actor-roster ID needs a distinct known opposing-roster ID; both missing or a third identity stays unsupported. Raw omissions and the twelve positive demo ranges/zero point-valued estimates remain unchanged. No score or schema-shape change.


## 2026-11-11 - Reproducible ephemeral CI tooling

Replaced CI's Ubuntu apt Redis acquisition after a confirmed mirror DNS failure with checksum-pinned Redis7.4.12 built in runner temporary storage. Chromium installation also avoids apt and still must launch/pass every production browser flow. Real Redis quota checks, Node22, frozen dependencies, runtime limits and report behavior are unchanged. This provisions no hosted service and claims no new hosted acceptance.


## 2026-11-11 - Fresh Catch continuation envelope

Schema2.20/context mobility-possession-15 adds a source-qualified first-bounce fresh successful Catch component. Its unknown failed-catch continuation remains an envelope instead of an invented reroll policy; the prior pickup/D8 and later dice stay separate. Demo3 contributes0–5/3 provisional units, outside point totals. Current missing traits/holder/clock remain unknown and no full board is restored. All12 demos now expose thirteen ranges and zero point-valued estimates; all17 broad issues remain open. API/UI/CLI share the explanation and filtering; the unknown-side stand-up/turn-end opportunity work remains independently actionable.

## 2026-11-11 - Role-qualified stand-up and observed pickup turnover

Schema2.21/context mobility-possession-16 qualifies demo11's actual stand-up through compatible current roster roles while leaving the missing active side/clock and stand-up cost timing unknown. Its fresh4+ Catch adds a0–1 own-possession envelope. The two qualified bounce/catch cases now also retain their immediately recorded team turn end. Demo3's other-player ordinary movement opportunities span0–10 under missing eligibility; demo11 supplies no count. These observed opportunities add no dice score, luck-value range or point contribution. Twelve demos expose fourteen ranges and zero point estimates; broader policies and all17 open issues remain. Shared UI/API/CLI copy explains both the opportunity bounds and unknowns. No hosted/service/account state changes are part of this migration.

## 2026-11-11 - Source-linked team reroll counters

Schema2.22/context mobility-possession-17 exposes explicit counter observations around compatible ordinary reroll offers and used/declined choices. Numeric use/decline and passed/failed Loner source pairs now trace the resource separately from replacement dice. Missing periods/counters, changed phases/controllers and later resets cannot fill the next observation; a mismatch remains visible. Waiting-counter observation does not certify playable availability, another reroll's legality or tactical resource cost. Offer/decision provenance adds no random outcome or luck points. Fourteen public ranges/zero point estimates and seventeen open broad issues remain. API/CLI/UI share the explanation; the next connected extension is attacker-selected Block offers.

## 2026-11-11 - Attacker-selected Block counter receipts

Schema2.23/context mobility-possession-18 extends counter evidence to compatible simple fresh attacker-selected Block offers and links each offer back to its recorded decision. Original and verified conditional replacement pools can explain the same resource observation without another dice charge. Defender-selected, retained and active optional-choice offers stay unsupported; a missing later zero/period remains unknown. The independent projection now preserves actual empty optional-choice fields, corroborated by the real full-goblin worker upload. Across12 demos,84 receipts include14 Block offers and19 matched counter changes, while fourteen component ranges/zero point estimates and all17 open broad issues remain. Full reroll eligibility, resource resets and tactical resource value are separate work.


## 2026-11-11 - Actual team-rerolled movement and checkpoint observations

Schema2.24/dice-only-20/context19 adds source-linked actual ordinary-Move continuity after committed unmodified successful team Rush/Dodge rerolls, including explicit carried-ball and immediately recorded touchdown evidence. Fresh waiting observations replace earlier traits/budgets; known Dodge budgets charge one step and unknown stays unknown. Deterministic proof rows add no outcome or point score. A repeated checkpoint Carrier no longer wrongly severs valid numeric reroll/retained-original linkage, while invalid boards, changed clock/controller/phase/ownership signatures, unknown messages and actual Carrier mutations remain barriers. Independent raw extraction reconciles37 used-team and12 retained-original outcomes at unchanged existing numeric formulas; original scored contributions are unchanged.

All twelve public transitions (eight Rush/four Dodge), thirteen source fragments including an excluded real Blitz, fourteen partial ranges/zero point estimates and comparative abstention remain traceable. Local973 unit/API tests/63 suites, real Redis quota, production build and final17-browser-flow rerun pass; logs describe the corrected browser assertion and exact source hashes. New original demo5/demo11 worker acceptance stays under4s. No legacy stack change, dependency/workflow change, new hosted acceptance or issue closure. Free Redis discovery remains read-only: initialization/terms action was rejected by automatic approval review and user approval is pending. See IMPLEMENTATION_LOG for limits and the final exact-commit CI gate.


## 2026-11-11 - Fixed-zone and reached-square possession consequences

Schema2.25/context20 extends actual ordinary-Move state through exact recorded opposing-zone Dodge penalties, compatible missing-side own-Dodge prefixes and an immediate successful Sure Hands pickup at the reached square. Unknown possession stays null. The pickup preserves the already charged movement budget and adds no score or counterfactual value. Shared schema validates marker/cell/source/budget facts and refuses fabricated component/point values. Dice-only-20 and every prior source-scored probability/contribution are unchanged.

Independent public extracts and full demo3 worker acceptance corroborate2→1 and1→0 Dodge costs and Carrier6/IsHeld1 after the reached-square pickup. Full12-demo reconciliation retains15 team moves/15 own-Dodge moves/one new pickup,14 partial ranges/zero point estimates and comparative abstention. All1025 unit/API tests, real Redis quota, production build and18 browser flows pass. No legacy/dependency/workflow change or broad issue closure. Current hosted authorization was clarified without rewriting the historical ledger: initialization remains denied/pending, prior free-store discussion is not fresh approval, and no hosted/account/terms/service action or repeated request occurred. See IMPLEMENTATION_LOG for source hashes, limits and final exact-commit CI.


## 2026-11-11 - Corrected negative source classification

Final raw-source audit corrected a mislabeled negative: demo2/97 is a declined retained failed Dodge, while demo1/207 is the independently decoded successful combined Rush/Dodge. Both are now separately preserved with direct raw summary/Used assertions. The current fixture has20 cases and reproduces at SHA2566ce1836e21da6b68acdd44cca9e0c679f66bb677d7234afeda79d161c395d2ff.1027 unit/API tests and typecheck pass; production behavior, prior18-flow browser/Redis/build acceptance and all measured value limits are unchanged. Final exact-candidate CI verifies the evidence correction with the implementation. The earlier19-case classification/hash remains historical and is superseded by this note.


## 2026-11-11 - Combined movement and linked failed-step consequences

Schema2.26/context21 adds3 source-qualified combined Rush/Dodge successes and2 actual failed-step/self-damage/turnover groups. Local partial coordinates stay unknown when a disjoint known axis suffices; unresolved activation and playable availability are not restored. Success advances actor/explicit held ball once; failure supplies no continued board or tactical value. Separate existing Rush/Dodge odds and all scored contributions remain unchanged. Failure subtotals reference existing dice once, including the honest positive raw-dice subtotal on a bad Blitz turnover.

Independent numeric source extraction,74 focused regressions and original-worker demo2/demo3 acceptance support the group. All1102 unit/API tests, real Redis quota, production build and19 browser flows pass locally. Prior15 team/15 own-Dodge receipts/one pickup,14 ranges/zero point estimates, comparison abstention and11 closed/17 open remain. No legacy/dependency/workflow/hosting/account/service change. Hosted initialization remains denied/pending and was not retried. See IMPLEMENTATION_LOG for exact source hash and the final exact-candidate CI gate.


## 2026-11-11 - Honest odds policy and unknown resource use

Schema2.27 replaces public rerollAvailable, an arithmetic switch, with the applied single_attempt/two_attempt/block_pool probability policy. Unknown unlinked rerollUsed stays absent; recorded choices/counters remain separate. An offered-but-declined source Dodge keeps5/6 odds without an unavailable-resource claim. Conditional Block pools remain conditional fair-pool odds and excluded gates/merged originals have no applied policy. Web/API/CLI share the contract and explanation; older responses are rejected by version rather than reinterpreted.

Thirteen new regressions, all1115 unit/API tests, real Redis quota, production build and19 browser flows pass. All12 source-scored outcomes/odds/contributions and measured14 ranges/zero point estimates are unchanged; dice-only-20/context21 and11 closed/17 open remain. Prior combined checkpoint cdb9169 passed exact CI43145826779. No legacy, dependency/workflow, hosted/account/service or spending change. Hosted initialization remains denied/pending and was not retried. See IMPLEMENTATION_LOG for source distinctions, local checks and final exact-candidate CI.



## 2026-11-11 - Free-store authorization and authentication status

The owner explicitly approved Stripe Projects initialization/terms for checking a free Upstash store after the prior automatic-review denial. The required CLI upgrade completed; initialization now waits for user browser sign-in and has no success receipt. No store, credentials, billing change or Preview was created. Current handoff docs distinguish this new approval from historical denials and from actual authentication/free-tier eligibility. Application schema2.27/dice-only-20/context21 and all code acceptance evidence remain unchanged.



## 2026-11-11 - Durable free Redis through Vercel

Left optional Stripe authentication incomplete after explaining its role. The owner accepted Upstash provider terms directly through Vercel, and an explicitly free store with automatic upgrades/production pack disabled was provisioned. Live provider inspection confirms Free; connection and both sensitive app quota variables are Preview-only. Production Lua passes against the real hosted store with independent handlers, concurrency/quota/TTL and isolated-key cleanup. No app dependency, production/legacy configuration, paid plan or billing change. The existing Vercel plan has included credit for bounded checks; exact-candidate deployed acceptance remains separate. See IMPLEMENTATION_LOG for the initial review block, safer verified command, owner confirmation and readback limits.



## 2026-11-11 - Streaming validation preserves the four-second hosted budget

A real current Preview upload exposed a typed4s timeout despite green local gates. Content-free parent-mediated timing isolated slow parsing. Pinned saxes6.0.0 now performs original-source streaming preflight before the existing fast-xml-parser trees. All byte/work limits, DTD rejection and opaque-name semantics remain, Unicode node/depth counting is stronger, and error text is bounded.32 new safety regressions and one actual-worker diagnostic regression accompany the change; all1148 tests, real Redis, production build and19 browser flows pass with zero known production advisories.

All12 supported source outcomes/odds/contributions and14 ranges/zero point estimates are identical. Three cold local comparisons show21.1% median parse improvement. Identified diagnostic Preview workers admit demo1/demo2/demo3 within the unchanged4s cap; clean committed-candidate deployed acceptance is recorded separately. No game-rule expansion, schema/model change, broad issue closure, paid plan/billing change or production/legacy deployment.



## 2026-11-11 - Independent message parsing with reused machinery

The clean streaming checkpoint still exposed a first-cold4s timeout, retained as a hosting limitation. Message parsing now reuses configured machinery only within one replay while returning fresh payloads, restoring entity policy and discarding failed validator state. All per-message/aggregate budgets remain.35 safety/reuse regressions and1151 total tests, Redis/build and19 browser flows pass with unchanged12-demo results. A separately identified reuse Preview's first real Chromium upload/export/reset passes with diagnostics off; final committed hosting is recorded separately. No cache of outcomes, cross-upload state, semantic promotion or broad issue closure.



## 2026-11-11 - Exact Preview acceptance qualified by the remaining large replay

Exact161760c passes CI43155581489 and is Ready on Node22 in the isolated Preview with the durable Free Redis store. Live source hashes/preflight behavior agree; full demo2/demo3 scores match frozen references, and demo2 passes real Chromium upload/export/reset. Current app/platform413 limits,503 BUSY and shared429 despite forwarding spoofing pass. The largest demo1 still returns typed504 TIMEOUT with no report, so hosted acceptance remains partial and NUF-023/other17 open issues are not closed. All1151 local tests, real Redis/build and19 browser flows remain green; fourteen ranges/zero points and comparative abstention are preserved. No paid plan/billing or production/legacy change. The final documentation-only receipt is separately verified in CI.


## 2026-11-11 - Exact XML values with less generic conversion

The primary replay parser bypasses generic numeric allocation only for exactly representable ordinary integers/Booleans and proven nonnumeric text, preserving upstream fallback and one-pass entity behavior.54 independent coercion regressions and complete12-demo model equality accompany9.1% median local parse improvement. All1205 tests, Redis/build and19 browser flows pass under unchanged limits. No semantic/schema expansion, context point value or broad issue closure. Exact committed Preview demo1 failure remains until separately retested; no Stripe, new resource, paid plan or production/legacy change.


## 2026-11-11 - Conditional team-Dodge teammate opportunities

The exact parser checkpoint1f1f7f7 passes public CI43162561925 and bounded Preview demo1/demo3 HTTP acceptance with unchanged4s worker limits and source scores. Earlier failures remain qualified evidence. Schema2.28/context22 separately adds four real-source partial teammate-move components at committed direct team-Dodge replacements. Compared waiting snapshots guard continuity without filling omitted fields or restoring playable stability. Conditional66.7% chance stays separate from compound88.9% dice; original failure, reroll cost, actor/ball/scoring value and later damage remain outside this component. Independent source extracts,21 new regressions, original demo11 worker/API and a twentieth rendered flow cover the change. Eighteen ranges/zero point estimates and11 closed/17 open remain; no broad closure, calibrated verdict, new resource, paid plan or production/legacy change. Final context hosting is not claimed by the earlier parser receipt.


## 2026-11-12 - Waiting actor origin guard

The conditional team-Dodge gate now also requires the waiting actor to remain at its reconstructed pre-offer origin, preserving already verified prefix movement while rejecting contradictory snapshots.22 focused cases and final1227 unit/API tests, real Redis/build and20 browser flows pass at unchanged budgets. All four public components,18 ranges/zero points and11 closed/17 open remain; no new hosted or broad semantic acceptance is claimed.


## 2026-11-12 - Current-roster ownership preserves completed Move cost

Schema2.29/context23 qualifies an unnamed actor from a fresh explicit roster only for deterministic ordinary Move/stand-up records, preserving original parser attribution and unknown skills. A strictly matched wait carries completion provenance to the next owned teammate declaration; new checkpoints, rolls, skills and contradictions terminate this scope. Independent extraction corroborates11 real chains across demo11/demo6. Known spent46 is now excluded from demo11/249's possible teammate moves, tightening−8/3–0 to−2–0 without changing any12-demo scored result/odds/contribution.34 new regressions, original demo11 worker/API and a twenty-first rendered explanation/export flow pass.18 partial ranges/zero points and11 closed/17 open remain. No new deployment, resource, paid/billing or broad calibrated acceptance.


## 2026-11-12 - Known-member deterministic completion across waits

Schema2.30/context24 extends the verified deterministic ordinary-Move wait path to initially mapped actors. No-roll prefixes and exact stable checkpoint/clock/cell/next-actor continuity admit360 additional completions, all corroborated by independent raw facts;29 further raw candidates stay outside current reducer guards. Numeric/skill choices and extra or contradictory observations do not enter this extension. Two demo7 component ranges narrow after already spent44/40/43 leave possible teammate sets. All12 scored dice values and18 ranges/zero points remain unchanged in scope.15 new regressions, original demo7 worker/API and a twenty-second rendered filter/explanation/export flow accompany1277 passing tests, Redis/build and unchanged4s limits. All original criteria and11 closed/17 open remain. No deployment, paid/billing/service or Stripe action.

## 2026-11-12 - Retained Catch failure before its original die

Schema2.31/context25 adds a physical first-bounce bridge for demo1's retained original Catch under its recorded decline policy, with a separate−2/3–0 own-possession envelope. Adjacent raw roles/dice/modifiers and identical observed non-ball checkpoints qualify the bridge; missing holder/side/clock/eligibility fields remain unknown. The kept summary adds no die, choice/resource price or point estimate, and prior/later dice are not charged twice.33 independent-source/counterexample/contract regressions, original worker/API and shared CLI/UI copy cover the new scope. Mobile evidence-table explanations receive a minimum readable width within their existing scroll container. There are19 partial ranges/zero source-backed points, with unchanged12-demo dice and11 closed/17 open. Current context hosting, calibration and original broader acceptance criteria remain open. No deployment, paid/billing/service or Stripe action.

## 2026-11-12 - Direct crowd-push aftermath and conditional unscored injury

Schema2.32/context26 links a supported block's direct defender crowd push to two removal stages, one unscored Source2 injury without armor and a confirming off-pitch checkpoint. UI-095 and four independently extracted full-demo chains establish scope; missing coordinates, chain pushes, mixed summaries and contradictory state remain excluded. Current off-pitch flags/posture stay observed/unknown and are not playable availability. The damage summary references the existing injury once, leaves its distribution unverified and omits a fake neutral victim contribution.45 regressions, the original demo11 worker/API, shared CLI and a twenty-fourth desktop/mobile browser flow accompany1356 passing tests, Redis/build and unchanged4s/resource limits. All12 dice/teams/verdicts and19 ranges/zero points are preserved. The acceptance audit is current and readable; original criteria and11 closed/17 open remain. No deployment, paid/billing/service or Stripe action.

## 2026-11-12 - Recorded injury outcome is separate from luck odds

Schema2.33/context27 adds source-qualified Stunned/KO/Casualty observations while retaining null odds/binary outcomes, excluded score status and unknown final availability. Direct and embedded KO namespaces are distinct; pending Apothecary code1/original Badly Hurt and direct code3 remain outside scope.249 independently decoded emissions and12 prior paired rows support231 full-demo labels; these are evidence records, not new probability or unique-outcome coverage. The UI displays known Actual results alongside Unknown Expected and Not scored contributions, and CLI/JSON share the distinction.41 regressions, original demo11 worker/API and25 browser flows accompany1397 passing tests, real Redis/build and unchanged4s/resource limits. All12 dice/teams/verdicts/damage summaries and19 ranges/zero points remain. Original criteria and11 closed/17 open remain; no deployment, paid/billing/security/service or Stripe action.

## 2026-11-12 - Partial context components reconcile without invented point totals

Schema2.34/context28 exposes separate arithmetic subtotals for existing supported component intervals/points by event membership, category, recorded source action and owned team. Independent exact rational inputs cover19 existing ranges across12 hashed demos; literal mixed cases establish additivity, non-dilution, duplicate invariance and null-versus-known-zero behavior. No new state, odds, point estimate, full-match bound or calibrated comparison is claimed. UI/CLI/JSON share the scope and keep range-only Context points unscored.49 new regressions, original demo11 worker/API assertions and26 Chromium flows accompany1446 passing unit/API tests, real Redis/build and unchanged4s/resource/quota guards. All12 prior report values,19 ranges/zero source-backed points and11 closed/17 open remain. Broader successor policies, calibration, integrated acceptance and current context hosting are still open. No deployment, provider/account/Stripe or paid/billing/security action.

## 2026-11-12 - Conditional ordinary Rush teammate component

Schema2.35/context29 adds four source-qualified successful ordinary Rush replacement ranges at conditional5/6, separate from unchanged35/36 compound dice and all earlier/resource/ball/active-continuation/damage values. Strict owned original/wait/choice/direct-movement continuity preserves unknown eligibility and budgets. Independent XML/geometry/completion facts and exact arithmetic establish possible teammate counts5/6/9/8, while shortened fragments correctly retain missing completion uncertainty. A genuine declined-original terminal Rush failure is retained as a different policy; failed committed replacement admission still requires its own accepted full chain.39 new regressions, original demo2 real-worker/API and27 Chromium flows accompany1485 unit/API tests, Redis/build and unchanged4s/resource/quota limits. All12 prior scored/team/verdict/damage values and19 earlier ranges remain; totals are23 partial ranges/zero source-backed points and11 closed/17 open. No complete contextual comparison, calibration, new deployment or paid/provider/Stripe action is claimed.

## 2026-11-12 - Original Rush failure under fixed decline policy

Schema2.36/context30 links demo2's ordinary Move/deterministic prefix and prior fresh Rush to the next retained original Rush failure, with a separate[−15/2,0] teammate-opportunity envelope. The original die stays at5/6, zero team resources are spent, prior success/damage dice remain separate, and unknown eligibility/general activation state stay unknown. Independent five-frame/raw/hash/role/geometry and exact arithmetic facts support full-file and labeled fragment acceptance; missing completion evidence widens uncertainty. Two excluded movement receipts add no roll candidate.51 new regressions, original demo2 worker/API and28 Chromium flows accompany1536 passing unit/API tests, Redis/build and unchanged4s/resource/quota limits. All12 prior dice/point/verdict/damage values and23 earlier terms remain; totals are24 ranges/zero source-backed points and11 closed/17 open. Failed committed Used1 evidence remains a distinct missing criterion, and historical private originals are absent from this checkout. No complete contextual comparison, calibration, deployment or paid/provider/Stripe action is claimed.

## 2026-11-12 — retained original Dodge ranges and local source recovery

Schema2.37/context31 adds three partial teammate-move ranges at unmodified ordinary non-carrier original Dodge failures under their fixed recorded decline policy. The original die remains at2/3, Used0 spends nothing, and missing eligibility/completion history stays uncertain. Pure source qualification adds no state restoration, point estimate or duplicate damage/resource/dice value. Independent numeric/raw/hash/completion/geometry and Fraction fixtures support full-source and explicitly labeled fragment acceptance. The source recovery audit checked known local BBR locations and242 ZIP directories, found9 raw files/3 historical hash joins, and preserves the separate missing failed committed ordinary Rush criterion. Private originals/member paths remain outside Git. All prior24 terms/dice/point/damage/verdict values are unchanged; totals become27 ranges/zero source-backed points and11 closed/17 open. Full local/CI evidence is recorded in the execution log; current-context hosting, broader successors/traits and quantitative calibration remain open. No deployment/provider/account/Stripe or paid action occurred.

## 2026-11-12 — continued intrinsic traits and fixed-policy block distribution

Schema2.38/context32 adds a pure source-linked intrinsic-trait ledger without restoring raw preRoll fields or movement eligibility. Complete seeds, corroborating same-instance partial refreshes, current roster/effect observations and earlier explicit empty prayer evidence have separate provenance. Unknown transitions and effects, unsupported transformations and broken/reused identities invalidate continuity.21 public pool records retain trait evidence,3 admit a separate single-pool knockdown-balance distribution and18 keep an explicit unsupported-model state. Independent raw witnesses/Fraction arithmetic cover source boundaries and1024 pool/skill/chooser/policy combinations. UI/CLI/JSON distinguish that conditional model from actual coach choices, raw-symbol scores and full tactical impact. Existing27 ranges/zero points, dice/point/damage totals and verdicts remain unchanged; no broad issue is closed by the prerequisite. Current full local and remote verification is recorded in the execution ledger. No deployment, paid resource/account/billing/security or Stripe action occurred.

## 2026-11-12 — raw event dice census and observed reroll identity

Schema2.39 adds dice-evidence-1 alongside unchanged dice-only-20/context32. A bounded pre-support census exposes nested/unknown/malformed fields separately from policy-event coverage, linking known block/treatment/kept copies and exact no-roll placeholders. Independent stdlib extraction joins all5,112 public event-payload fields and74 previously hidden outer dice groups; repeated snapshot last-roll fields have a separate audit. Eight star and one Pass reroll plus thirteen unsupported team/gate transactions retain observed choice/dice identity without accepting probability, tactical value or resource legality. A used6→6 star replacement remains a new draw despite NewRoll0. UI/CLI/export expose the denominator and unknowns. Existing scored events/team values,27 ranges/zero source-backed points and comparative abstention are preserved. Three identities and broader NUF-014 requirements stay open;11 broad issues remain closed/17 open. Full local/remote gates and limitations are recorded in the execution ledger. No Stripe, store/account, billing/security, deployment, production/legacy, merge or release action is part of this change.

## 2026-11-12 — preserve unknown snapshot/root dice and reconcile final copies

Schema2.40/dice-evidence-2 fixes a concrete1-of-101 false-100%-support reproduction caused by board projection and unrecognized root containers. The pre-admission inventory now retains13,329 snapshot groups plus5,112 event fields, all independently joined across12 hashes. End-state copies stay outside playable checkpoints; only exact scalar customization locations are configuration. Unknown/malformed source evidence remains visible or receives a typed structural rejection, with separate family quality counts and no fabricated point/whole-match verdict. Independent Source7 casualty and retained accuracy witnesses resolve the prior three identity gaps without widening treatment or probability policies. Prior scored event/team values,27 ranges and zero source-backed points remain unchanged. Core coverage acceptance advances, but NUF-014's original NUF-009–013 dependencies and all other open criteria are preserved:11 closed/17 open. Full verification and exact pushed CI are recorded in the execution ledger/chat. No deployment/provider/account/Stripe, billing/security or paid action occurred.


## 2026-11-12 — isolate real CLI worker tests from corpus load

Exact d6759d5 CI failed two real CLI success checks while the CPU-heavy corpus suite ran concurrently. The standard test command now schedules pure corpus cases, serial marked CLI cases and isolated HTTP acceptance as three mandatory gates. Existing assertions and the production4s worker deadline are unchanged. Independent test inventory conserves1,781 cases exactly once (1,749+22+10); full local lint/typecheck/unit/API/Redis/build and32 Chromium flows pass. This is verification scheduling only, with no product/schema/model/dependency change or new hosted/semantic acceptance. Eleven broad issues remain closed/seventeen open, and the complete backlog objective remains active. Exact replacement CI evidence is recorded separately in the execution ledger/chat.


## 2026-11-12 — conditional injury distribution with current-trait provenance

Schema2.41 adds separate fixed-unmodified ordinary/Stunty and Thick Skull categorical injury tables, supported by the published2020 reference, existing in-game/paired UI observations and independent numeric/triangular arithmetic. Six public trait receipts admit four source-backed models; two unsupported lists and missing current knowledge withhold models. No raw field inheritance, binary success score, treatment/final availability, scored-coverage promotion or tactical value is invented. Every prior scored/team/coverage/range/verdict field across12 demos is preserved;27 partial ranges/zero source-backed context points and11 closed/17 open remain. Local1,816 unit/API cases, real Redis/build and33 desktop/mobile Chromium flows pass; original demo5 worker and demo8 CLI retain the public model. Full semantic/casualty/mitigation/context/calibration/current-hosting acceptance remains open. Exact pushed CI is recorded separately in the execution ledger/chat. No deployment/provider/account/Stripe or spending/billing/security action occurred.
