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
- API: `POST /api/nufflizier/analyze` (primary), `POST /api/replay` (legacy coaching pipeline).
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
| Probability/scoring engine | `partial` | Explicit calculators now implemented for `block`, `armor_break`, `injury`, `dodge`, `ball_handling`, and `argue_call` (`rollType=71`); unsupported argue-call variants remain fallback with explicit disclosure. | `src/domain/nufflizer/probability.ts`, `src/domain/nufflizer/constants.ts` |
| API: `/api/nufflizier/analyze` | `converted` | Main one-shot Nufflizier endpoint active. | `src/app/api/nufflizier/analyze/route.ts` |
| API: `/api/replay` | `legacy-kept` | Coaching endpoint retained; not primary product surface. | `src/app/api/replay/route.ts` |
| UI routes (`/nufflizier`, `/upload`) | `converted` | Upload + verdict + team cards + key moments + filters + JSON export. | `src/app/nufflizier/*`, `src/app/upload/page.tsx` |
| CLI entrypoint | `converted` | Text and JSON modes using shared report contract. | `src/cli/nufflizier.ts`, `bin/nufflizier` |
| Automated tests | `partial` | Nufflizier unit/api/e2e coverage now includes explicit-vs-fallback coverage and explainability assertions; legacy coaching tests still dominate total suite and should be rebalanced. | `tests/unit/*`, `tests/e2e/smoke.spec.ts` |
| Documentation system | `partial` | README is updated; handoff docs and blueprint/agent alignment introduced in this pass. | `README.md`, `docs/*`, `AGENTS.md` |

## Prioritized Backlog

### P0 - Probability Fidelity Hardening (Wave 2)
- Why it matters: Verdict trust depends on realistic probabilities for replay-visible action context.
- Concrete tasks:
1. Expand explicit argue-call support beyond `rollType=71` only if replay evidence proves deterministic semantics for additional variants (`42`, `70`).
2. Add fixtures for edge conditions (multi-die unusual types, reroll decisions, ambiguous outcomes).
3. Document supported/unsupported roll semantics in `docs/REPLAY_INVESTIGATION.md` and conversion logs.
- Acceptance criteria:
1. Probability calculator behavior is deterministic and unit-tested for each explicitly supported roll family.
2. No unsupported roll family silently reuses generic fallback without tagged note in report metadata/log.
3. Regression tests pass for all demo replays and sample fixture.
- Dependencies:
- Replay payload field consistency from `extractStructuredTurns`.
- Availability of representative replay fixtures.

### P1 - Legacy Surface Decision and Cleanup Plan
- Why it matters: Keeping both Nufflizier and coaching pipelines increases maintenance burden and ambiguity for new agents.
- Concrete tasks:
1. Decide whether `/api/replay` remains indefinitely or moves behind explicit legacy mode.
2. Add docs-level policy for legacy modules (`legacy-kept` vs scheduled removal).
3. If removal chosen, create deprecation checklist and test migration plan.
- Acceptance criteria:
1. One clear decision documented in `docs/PROJECT_PLAN.md` and `docs/PROJECT_BLUEPRINT.md`.
2. Legacy modules are either tagged with removal milestone or explicitly maintained with rationale.
3. No conflicting product messaging across docs/UI.
- Dependencies:
- Product owner decision on backward compatibility needs.

### P2 - Reporting Explainability and UX Calibration
- Why it matters: Users can only trust a for-fun analyzer if the “why” is transparent and understandable without statistics training.
- Concrete tasks:
1. Add optional detail expansion per key moment (inputs used for probability calculation).
2. Add confidence/coverage banner summarizing how much of replay was scored via explicit mappings vs fallback.
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
1. Add replay fixtures and unit cases covering argue-call edge variants (`rollType=42`, `70`) and keep unsupported variants explicitly fallback-tagged.
2. Expand plain-language explainability copy from baseline helper text into concise per-category examples (block/armor/injury/dodge/ball/argue).
3. Rebalance tests so Nufflizier-specific suite weight grows relative to legacy coaching tests, while preserving `legacy-kept` safety checks.

## Risks/Dependencies
1. Replay payload variability across BB3 versions may reduce mapping confidence for less common events.
2. Some event families (e.g., argue-the-call style signals) may remain under-specified until more fixtures are available.
3. Dual-pipeline maintenance risk persists while legacy coaching endpoints remain active.
4. Any scoring-weight changes can alter verdict narratives and require baseline snapshot/test updates.

## Definition of Done for Next Milestone
Milestone: “Probability Fidelity Hardening - Wave 2”.

Done means all are true:
1. Explicit calculators are implemented and tested for high-frequency non-combat families (`dodge`, `ball_handling`) with report-level method transparency.
2. Fallback usage remains measurable and disclosed in report metadata and UI/CLI explainability views.
3. Unit + integration + e2e checks pass in CI.
4. `docs/CONVERSION_LOG.md` and `docs/IMPLEMENTATION_LOG.md` contain append-only entries for all changes and verification outcomes.
