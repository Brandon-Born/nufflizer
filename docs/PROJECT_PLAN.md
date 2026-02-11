# Nufflizier Project Plan

Last updated: 2026-02-11

## Mission
Nufflizier analyzes Blood Bowl 3 replay files (`.xml` and `.bbr`) and outputs a one-shot luck report that identifies:
1. Which team was luckier overall.
2. Where low-probability events succeeded and high-probability events failed.
3. Category-level luck contributions (block, armor break, injury, dodge, ball handling, argue-call style events).
4. A clear, plain-language “why” explanation so non-statistics users can understand how verdicts were produced.

## Transparency Principle
Nufflizier should optimize for explainability over mystery scoring.
1. Every top-level verdict must be traceable to visible event-level calculations.
2. Weights and probability assumptions must be documented and discoverable in both code and docs.
3. UI copy should explain outcomes in plain language intended for users without a statistics background.
4. Unknowns/fallbacks must be disclosed instead of hidden.

## Current System Snapshot
1. Product surface:
- Web UI: `/nufflizier` (primary) and `/upload` (alias).
- API: `POST /api/nufflizier/analyze` (primary), `POST /api/replay` (legacy coaching pipeline, deprecated + gateable).
- CLI: `pnpm nufflizier analyze <replay_file> --format json|text`.

2. Active Nufflizier flow:
- Replay upload -> decode/parse -> luck-event normalization -> probability/scoring -> verdict/key moments -> UI/JSON output.

3. Legacy stack still present:
- Coaching analysis pipeline under `src/domain/analysis/*`, `src/domain/coaching/*`, `src/server/services/analyzeReplay.ts`, and `/api/replay`.
- These components remain for backward compatibility and historical tests.

4. Validation baseline currently passing:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Conversion Status Matrix
Status taxonomy: `converted`, `partial`, `legacy-kept`, `pending`, `blocked`.

| Subsystem | Status | Notes | Source of Truth |
| --- | --- | --- | --- |
| Replay parsing core (`decodeReplay`, `parseXml`, `extractStructuredTurns`) | `converted` | Handles XML + BBR with structured turn extraction and attribution. | `src/domain/replay/*` |
| Luck normalization | `partial` | Roll-based mapping works for MVP categories; deeper event semantics still need expansion for edge cases. | `src/domain/nufflizer/analyzeLuck.ts` |
| Probability/scoring engine | `partial` | Refactored to deterministic scored-vs-excluded contract with context-aware roll classification; unsupported/ambiguous contexts are now excluded from luck totals instead of fallback-scored. | `src/domain/nufflizer/probability.ts`, `src/domain/nufflizer/classifyRollContext.ts`, `src/domain/nufflizer/analyzeLuck.ts` |
| API: `/api/nufflizier/analyze` | `converted` | Main one-shot Nufflizier endpoint active. | `src/app/api/nufflizier/analyze/route.ts` |
| API: `/api/replay` | `legacy-kept` | Coaching endpoint retained with deprecation headers and env-based gate (`NUFFLIZIER_LEGACY_REPLAY_API_MODE`). Not primary product surface. | `src/app/api/replay/route.ts` |
| UI routes (`/nufflizier`, `/upload`) | `converted` | Upload + verdict + team cards + key moments + filters + JSON export. | `src/app/nufflizier/*`, `src/app/upload/page.tsx` |
| CLI entrypoint | `converted` | Text and JSON modes using shared report contract. | `src/cli/nufflizier.ts`, `bin/nufflizier` |
| Automated tests | `partial` | Nufflizier unit/api/e2e coverage now includes explicit-vs-fallback coverage, normalization metadata assertions, CLI/API parity checks, argue-variant gate tests, and conversion residue inventory checks; legacy coaching tests still exist and are now split with dedicated scripts for targeted execution and include legacy API gate coverage. | `tests/unit/*`, `tests/e2e/smoke.spec.ts`, `package.json` |
| Documentation system | `partial` | README is updated; handoff docs and blueprint/agent alignment introduced in this pass. | `README.md`, `docs/*`, `AGENTS.md` |

## Prioritized Backlog

### P0 - Probability Fidelity Hardening (Wave 3)
- Why it matters: Verdict trust depends on realistic probabilities for replay-visible action context.
- Concrete tasks:
1. Expand deterministic scored-context mapping for additional roll families now excluded (special actions and unusual roll chains).
2. Add fixtures for edge conditions (multi-die unusual types, reroll decisions, ambiguous outcomes).
3. Document scored/excluded context matrix in `docs/REPLAY_INVESTIGATION.md` and conversion logs.
- Acceptance criteria:
1. Probability calculator behavior is deterministic and unit-tested for each explicitly supported roll family.
2. No unsupported roll family is scored with generic fallback odds; unsupported contexts must be explicitly excluded with reason tags.
3. Regression tests pass for all demo replays and sample fixture.
- Dependencies:
- Replay payload field consistency from `extractStructuredTurns`.
- Availability of representative replay fixtures.

Current decision note:
1. `rollType=42` and `rollType=70` are now excluded from scoring with explicit reasons; they are shown in report transparency data but do not affect luck totals.

### P1 - Legacy Surface Decision and Cleanup Plan
- Why it matters: Keeping both Nufflizier and coaching pipelines increases maintenance burden and ambiguity for new agents.
- Concrete tasks:
1. Apply the decided `gate` policy consistently in docs, tests, and contributor guidance.
2. Add explicit triggers/checklist for future removal re-evaluation.
3. Prevent new feature work from landing in legacy coaching modules unless explicitly requested.
- Acceptance criteria:
1. `gate` policy is consistently documented in `docs/PROJECT_PLAN.md`, `docs/PROJECT_BLUEPRINT.md`, and logs.
2. Legacy modules are tagged with re-evaluation criteria and rationale.
3. No conflicting product messaging across docs/UI.
- Dependencies:
- Product owner decision when re-evaluating removal milestone.

### P2 - Reporting Explainability and UX Calibration
- Why it matters: Users can only trust a for-fun analyzer if the “why” is transparent and understandable without statistics training.
- Concrete tasks:
1. Add optional detail expansion per key moment (inputs used for probability calculation).
2. Add confidence/coverage banner summarizing how much of replay was scored vs excluded.
3. Add plain-language UI copy for weight effects and score interpretation.
4. Add “How this was scored” helper text linking each verdict to underlying weighted deltas.
- Acceptance criteria:
1. Each key moment can show probability inputs without exposing raw parser internals.
2. Coverage metric is visible in report and backed by tests. (Implemented; continue refining)
3. A user unfamiliar with statistics can explain why a team was labeled luckier after reading the report page.
4. e2e smoke test validates primary verdict + explainability elements.
- Dependencies:
- Stable metadata contract from `LuckEvent`.

## Next 3 Agent Tasks
1. Collect additional replay evidence for excluded roll families (argue variants and special-action chains), then promote deterministic contexts to scored.
2. Continue test-suite rebalance by migrating more shared behavior checks to Nufflizier-named tests while keeping `test:legacy` safety coverage intact.
3. Refine explainability wording around exclusion reasons for non-statistics users.

## Risks/Dependencies
1. Replay payload variability across BB3 versions may reduce mapping confidence for less common events.
2. Some event families (e.g., argue-the-call style signals) may remain under-specified until more fixtures are available.
3. Dual-pipeline maintenance risk persists while legacy coaching endpoints remain active.
4. Any scoring-weight changes can alter verdict narratives and require baseline snapshot/test updates.

## Definition of Done for Next Milestone
Milestone: “Probability Fidelity Hardening - Wave 3”.

Done means all are true:
1. Context-aware deterministic scoring is implemented for supported roll contexts and tested for high-frequency families.
2. Excluded usage remains measurable and disclosed in report metadata and UI/CLI explainability views.
3. Unit + integration + e2e checks pass in CI.
4. `docs/CONVERSION_LOG.md` and `docs/IMPLEMENTATION_LOG.md` contain append-only entries for all changes and verification outcomes.
5. Legacy `gate` policy is reflected consistently across plan/blueprint/handoff docs.

## Status Update (2026-02-11)
1. Goblin gap-closure pass is implemented for deterministic dice scoring:
- Strict roll-family gating now blocks step-only promotion for unsupported dodge and ball-handling roll families.
- Block chain summary tags (`ResultBlockRoll`, `ResultBlockOutcome`, `ResultPushBack`) are merged into nearby scored block anchors when deterministic linkage exists.
- Coverage now reports both `rollCandidates` (primary trust metric) and `allEvents` (secondary visibility metric).
2. Current explicit exclusions remain intentional:
- `rollType=42` and `rollType=70` remain excluded until deterministic replay evidence is sufficient for promotion.
3. Updated near-term tasks:
1. Expand deterministic promotion coverage only when fixture evidence proves stable semantics for additional roll families.
2. Refine merge diagnostics/explainability copy so users can distinguish summary-chain merges from unsupported contexts at a glance.
3. Keep API/UI/CLI parity checks synchronized as coverage/exclusion telemetry evolves.
