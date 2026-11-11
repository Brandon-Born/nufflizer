# Nufflizier Implementation Log

Purpose: append-only execution ledger for engineering sessions so follow-up agents can continue without re-discovery.

## Entry Template (Mandatory)
Use exactly this structure for new entries:

```md
## YYYY-MM-DD HH:MM - <workstream>
Goal:
1. ...

Changes made (files):
1. `path`

Commands run + outcomes:
1. `command` -> outcome

Regressions/known gaps:
1. ...

Explicit handoff next steps:
1. ...
```

---

## 2026-02-11 10:14 - Nufflizier MVP runtime conversion
Goal:
1. Convert primary product flow from coaching guidance to luck-analysis reporting while preserving one-shot processing.

Changes made (files):
1. Added Nufflizier domain logic:
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/probability.ts`
- `src/domain/nufflizer/constants.ts`
- `src/domain/nufflizer/types.ts`
2. Added service/API/UI/CLI surfaces:
- `src/server/services/analyzeNufflizer.ts`
- `src/app/api/nufflizier/analyze/route.ts`
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/app/nufflizier/page.tsx`
- `src/app/upload/page.tsx`
- `src/cli/nufflizier.ts`
- `bin/nufflizier`
3. Updated parser surface and app docs:
- `src/domain/replay/extractStructuredTurns.ts`
- `src/domain/replay/types.ts`
- `README.md`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/report/[id]/page.tsx`
4. Added/updated tests:
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/nufflizierApi.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/e2e/smoke.spec.ts`

Commands run + outcomes:
1. `pnpm install` -> dependency install successful.
2. `pnpm typecheck` -> passed.
3. `pnpm lint` -> passed.
4. `pnpm test` -> passed (full suite).
5. `pnpm build` -> passed.
6. `pnpm test:e2e` -> passed.
7. `pnpm nufflizier analyze tests/fixtures/replays/sample-basic.xml --format text` -> CLI executed successfully.

Regressions/known gaps:
1. Probability modeling is partially heuristic for some roll families.
2. Legacy coaching pipeline remains in repo (`legacy-kept`), increasing maintenance surface.

Explicit handoff next steps:
1. Harden explicit roll-family probability calculators for high-impact events.
2. Add coverage telemetry for explicit-vs-fallback probability paths.
3. Decide whether legacy `/api/replay` remains supported or is deprecated.

## 2026-02-11 10:35 - Handoff documentation refresh
Goal:
1. Establish low-friction agent handoff docs and align stale core documentation to Nufflizier runtime reality.

Changes made (files):
1. Added new handoff docs:
- `docs/PROJECT_PLAN.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`
2. Refreshed stale core docs:
- `AGENTS.md`
- `docs/PROJECT_BLUEPRINT.md`

Commands run + outcomes:
1. `git log --oneline -n 12` -> used for conversion milestones.
2. `git show --name-only ...` on key commits -> used to seed converted scope entries.
3. `rg -n "BB Trainer|coaching|/api/replay|nufflizier" ...` -> used to identify stale wording and legacy surfaces.

Regressions/known gaps:
1. No runtime code changed in this session; docs-only pass.
2. `docs/REPLAY_INVESTIGATION.md` remains replay-centric and valid but should be extended as probability mapping depth increases.

Explicit handoff next steps:
1. Keep logs append-only; never rewrite historical entries.
2. For each future implementation, append one conversion entry and one implementation entry with command outcomes.
3. Update `docs/PROJECT_PLAN.md` backlog statuses when milestones move from `partial/pending` to `converted`.

## 2026-02-11 10:46 - Transparency principle documentation update
Goal:
1. Encode a clear product requirement that Nufflizier must explain “why” in plain language for users without statistics training.

Changes made (files):
1. Updated planning and standards docs:
- `docs/PROJECT_PLAN.md`
- `docs/PROJECT_BLUEPRINT.md`
- `AGENTS.md`
2. Appended migration/execution trace:
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `sed -n ... docs/PROJECT_PLAN.md docs/PROJECT_BLUEPRINT.md docs/CONVERSION_LOG.md docs/IMPLEMENTATION_LOG.md` -> reviewed current doc baselines.
2. `rg -n \"BB Trainer|coaching|/api/replay|nufflizier\" ...` -> validated stale wording and located transparency insertion points.
3. `date '+%Y-%m-%d %H:%M'` -> captured timestamp for append-only log entry.

Regressions/known gaps:
1. This pass is documentation-only; runtime UI still needs explicit “how scored” affordances.
2. Explainability validation in tests is not yet implemented.

Explicit handoff next steps:
1. Add UI elements that surface scoring rationale and weight impact in plain language.
2. Add tests that assert presence of explainability content in report output.
3. Keep transparency requirement treated as blocking acceptance criteria for future scoring changes.

## 2026-02-11 10:53 - Probability fidelity wave 1 execution
Goal:
1. Execute probability-fidelity and explainability plan with explicit-vs-fallback transparency across API/UI/CLI.

Changes made (files):
1. Scoring and probability core:
- `src/domain/nufflizer/probability.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/types.ts`
2. Presentation surfaces:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/cli/nufflizier.ts`
3. Tests:
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/nufflizierApi.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/e2e/smoke.spec.ts`
4. Handoff docs and investigation notes:
- `docs/PROJECT_PLAN.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `pnpm typecheck` -> passed.
2. `pnpm lint` -> passed.
3. `pnpm test` -> initially failed one scoring assertion, then passed after fixture adjustment.
4. `pnpm build` -> passed.
5. `pnpm test:e2e` -> initially failed due to strict locator ambiguity, then passed after selector update.
6. `pnpm nufflizier analyze tests/fixtures/replays/sample-basic.xml --format text` -> passed and now prints coverage + explainability summary.

Regressions/known gaps:
1. Explicit calculators currently cover only `block`, `armor_break`, `injury`; remaining categories still use disclosed fallback.
2. Legacy coaching pipeline remains `legacy-kept` and unresolved.

Explicit handoff next steps:
1. Implement explicit probability handling for additional families (`dodge`, `ball_handling`) where replay context allows.
2. Continue refining plain-language explanation text for non-statistics users.
3. Produce legacy-surface ADR (`/api/replay` retain/gate/remove) and update docs accordingly.

## 2026-02-11 11:10 - Probability wave 2 implementation + explainability contract expansion
Goal:
1. Implement next-step Wave 2 work: explicit probability for `dodge` and `ball_handling`, richer event explainability, and by-type coverage visibility across API/UI/CLI.

Changes made (files):
1. Probability and scoring domain:
- `src/domain/nufflizer/probability.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/types.ts`
2. Presentation surfaces:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/cli/nufflizier.ts`
3. Tests:
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/nufflizierApi.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/e2e/smoke.spec.ts`
4. Handoff/blueprint docs:
- `docs/PROJECT_PLAN.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm typecheck` -> passed.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm test` -> initially failed (2 assertions), then passed after test expectation updates.
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> initially failed on hidden-details assertion, then passed after smoke assertion adjustment.

Regressions/known gaps:
1. `argue_call` still relies on fallback probability logic by design.
2. Legacy coaching pipeline remains in repository under gated `legacy-kept` policy.

Explicit handoff next steps:
1. Add explicit `argue_call` mapping only if replay fixtures provide deterministic thresholds/outcomes.
2. Run plain-language UX copy pass for non-statistics readability on key moment explanations.
3. Continue appending conversion/implementation logs for each milestone and keep plan matrix status current.

## 2026-02-11 11:20 - Argue-call explicit odds and readability pass
Goal:
1. Implement explicit argue-call probability where replay semantics are deterministic and improve plain-language explainability visibility.

Changes made (files):
1. Probability domain:
- `src/domain/nufflizer/probability.ts`
2. UI:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
3. Tests:
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/e2e/smoke.spec.ts`
4. Handoff docs:
- `docs/PROJECT_PLAN.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm typecheck` -> passed.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm test` -> passed.
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> passed.

Regressions/known gaps:
1. `argue_call` variants `rollType=42` and `rollType=70` remain fallback by design until deterministic semantics are verified.
2. Legacy coaching pipeline remains gated (`legacy-kept`).

Explicit handoff next steps:
1. Add fixture coverage for roll types `42` and `70` and only promote to explicit when deterministic thresholds are proven.
2. Expand helper copy with concise per-category examples to improve novice readability.
3. Continue append-only logging for each implementation milestone.

## 2026-02-11 11:29 - Normalization hardening and parity checks
Goal:
1. Implement remaining plan slice for normalization transparency, argue-edge coverage, and cross-surface parity confidence.

Changes made (files):
1. Domain + types:
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/types.ts`
2. CLI/UI explainability:
- `src/cli/nufflizier.ts`
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
3. Tests + fixtures:
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/nufflizierNormalization.test.ts`
- `tests/unit/nufflizierCliParity.test.ts`
- `tests/e2e/smoke.spec.ts`
- `tests/fixtures/models/argue-edge-replay.json`
4. Docs/handoff:
- `docs/PROJECT_PLAN.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm typecheck` -> passed.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm test` -> passed (17 files, 55 tests).
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> passed.

Regressions/known gaps:
1. `argue_call` variants `rollType=42` and `rollType=70` remain fallback until deterministic semantics are confirmed.
2. Legacy coaching stack remains `legacy-kept` under `gate` policy.

Explicit handoff next steps:
1. Gather replay evidence for `rollType=42` and `70` to decide explicit promotion.
2. Continue test-suite rebalance toward Nufflizier-first coverage.
3. Keep append-only handoff logs current with each implementation milestone.

## 2026-02-11 11:43 - Remaining-3-items completion pass
Goal:
1. Execute the remaining human-test readiness items: argue variant evidence gate, test rebalance scaffolding, and shared explainability copy across UI/CLI.

Changes made (files):
1. Domain and copy:
- `src/domain/nufflizer/probability.ts`
- `src/domain/nufflizer/explainabilityCopy.ts`
2. UI and CLI:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/cli/nufflizier.ts`
3. Config/scripts:
- `package.json`
4. Fixtures and tests:
- `tests/fixtures/models/argue-rolltype-42.json`
- `tests/fixtures/models/argue-rolltype-70.json`
- `tests/unit/nufflizierArgueVariants.test.ts`
- `tests/unit/nufflizierNormalization.test.ts`
- `tests/unit/nufflizierCliParity.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
- `tests/unit/nufflizierProbability.test.ts`
- `tests/e2e/smoke.spec.ts`
5. Docs/handoff:
- `docs/PROJECT_PLAN.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm typecheck` -> passed.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm test` -> passed (19 files, 61 tests).
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> passed.
6. `corepack pnpm test:nufflizier` -> passed.
7. `corepack pnpm test:legacy` -> passed.

Regressions/known gaps:
1. `argue_call` `rollType=42` and `rollType=70` remain fallback by design until deterministic evidence improves.
2. Legacy coaching stack remains `legacy-kept` under gated policy.

Explicit handoff next steps:
1. Gather additional replay evidence for `42` and `70` and re-run explicit promotion gate.
2. Continue migrating shared behavior checks toward Nufflizier-first suites while retaining legacy safety net.
3. Use human-test feedback to tune wording in shared explainability copy.

## 2026-02-11 12:05 - Legacy gate and conversion residue remediation
Goal:
1. Implement remediation plan to deprecate+gate legacy replay API, improve fallback transparency for nondeterministic argue variants, and remove active BB Trainer residue.

Changes made (files):
1. Config and legacy API route:
- `src/lib/config.ts`
- `src/app/api/replay/route.ts`
2. Nufflizier reporting and presentation:
- `src/domain/nufflizer/types.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/cli/nufflizier.ts`
3. Residue cleanup:
- `src/app/page.tsx`
- `src/app/nufflizier-logo.png` (renamed from `src/app/bb-trainer-logo.png`)
4. Tests:
- `tests/unit/legacyReplayApiRoute.test.ts`
- `tests/unit/nufflizierApi.test.ts`
- `tests/unit/nufflizierNormalization.test.ts`
- `tests/unit/nufflizierArgueVariants.test.ts`
- `tests/unit/nufflizierCliParity.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
- `tests/unit/nufflizierConversionResidue.test.ts`
- `package.json` (`test:legacy` includes legacy API gate test)
5. Docs:
- `README.md`
- `docs/PROJECT_PLAN.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm -s nufflizier analyze demo-replays/demo1.bbr --format json | rg '"rollType": (42|70)' -n` -> no matches in demo1.
2. `corepack pnpm -s nufflizier analyze demo-replays/demo2.bbr --format json | rg '"rollType": (42|70)' -n` -> no matches in demo2.
3. `corepack pnpm -s nufflizier analyze demo-replays/demo3.bbr --format json | rg '"rollType": (42|70)' -n` -> no matches in demo3.
4. `corepack pnpm lint` -> pending in final validation block.
5. `corepack pnpm typecheck` -> pending in final validation block.
6. `corepack pnpm test` -> pending in final validation block.
7. `corepack pnpm build` -> pending in final validation block.
8. `corepack pnpm test:e2e` -> pending in final validation block.
9. `corepack pnpm test:nufflizier` -> pending in final validation block.
10. `corepack pnpm test:legacy` -> pending in final validation block.

Regressions/known gaps:
1. Argue-call `rollType=42` and `rollType=70` remain fallback-scored by design until deterministic semantics are proven.
2. Legacy coaching modules remain in repository under gated compatibility policy.

Explicit handoff next steps:
1. Monitor `/api/replay` usage logs and plan default mode flip to `disabled` near sunset.
2. Continue gathering replay evidence for `42`/`70` promotion gate.
3. Revisit full legacy module removal once compatibility window ends.

## 2026-02-11 12:10 - Remediation verification completion
Goal:
1. Complete full post-change verification sequence for legacy gate and transparency remediation.

Changes made (files):
1. `docs/IMPLEMENTATION_LOG.md` (append-only verification entry)

Commands run + outcomes:
1. `corepack pnpm lint` -> passed.
2. `corepack pnpm typecheck` -> passed.
3. `corepack pnpm test` -> passed (21 files, 64 tests).
4. `corepack pnpm build` -> first parallel run failed with transient `/ _document` page lookup conflict while Playwright web server was also running; sequential rerun passed.
5. `corepack pnpm test:e2e` -> passed.
6. `corepack pnpm test:nufflizier` -> passed.
7. `corepack pnpm test:legacy` -> passed (6 files, 23 tests).

Regressions/known gaps:
1. No new regressions detected beyond known intentional fallback behavior for argue-call `42`/`70`.

Explicit handoff next steps:
1. Monitor legacy `/api/replay` usage and decide sunset-mode default flip timing.
2. Continue evidence gathering for deterministic argue-call variant promotion.

## 2026-02-11 12:30 - Deterministic scored/excluded refactor
Goal:
1. Execute planned dice-fidelity refactor: context-aware roll classification, no generic fallback scoring, and breaking scored/excluded contract across domain/API/UI/CLI/tests.

Changes made (files):
1. Nufflizier domain:
- `src/domain/nufflizer/classifyRollContext.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/probability.ts`
- `src/domain/nufflizer/types.ts`
- `src/domain/nufflizer/explainabilityCopy.ts`
2. Replay extraction:
- `src/domain/replay/extractStructuredTurns.ts`
3. Presentation surfaces:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/cli/nufflizier.ts`
4. Tests:
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/nufflizierNormalization.test.ts`
- `tests/unit/nufflizierArgueVariants.test.ts`
- `tests/unit/nufflizierApi.test.ts`
- `tests/unit/nufflizierCliParity.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/replayImplementationBaseline.test.ts`
- `tests/unit/demoReplayStructured.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
- `tests/e2e/smoke.spec.ts`
5. Docs:
- `docs/PROJECT_PLAN.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm typecheck` -> passed.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm test` -> initially failed (legacy expectations for synthetic dodge + argue variant categorization), then passed after test and classifier updates.
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> initially failed (smoke assertion expected old `Method` header), then passed after smoke assertion update.

Regressions/known gaps:
1. Some roll contexts are intentionally excluded from scoring pending deterministic fixture evidence.
2. Report/API contract is intentionally breaking (`scored`/`excluded`) and no backward shim was added.

Explicit handoff next steps:
1. Add deterministic mappings for currently excluded special-action contexts once replay evidence is stable.
2. Consider adding optional contract versioning only if external consumers require backward compatibility.
3. Continue monitoring scored-rate and exclusion-reason trends across new replay fixtures.

## 2026-02-11 13:15 - Goblin gap-closure implementation and verification
Goal:
1. Implement goblin replay gap-closure plan: strict dodge/ball-handling family gates, block-chain merge context, and dice-candidate-first coverage reporting.

Changes made (files):
1. Domain logic and schema:
- `src/domain/nufflizer/classifyRollContext.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/types.ts`
2. Replay diagnostics:
- `src/domain/replay/mappings.ts`
3. Presentation:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/cli/nufflizier.ts`
4. Tests:
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/nufflizierNormalization.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/nufflizierApi.test.ts`
- `tests/unit/nufflizierCliParity.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/replayMappings.test.ts`
- `tests/e2e/smoke.spec.ts`
5. Documentation:
- `docs/PROJECT_PLAN.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm lint` -> passed.
2. `corepack pnpm typecheck` -> passed.
3. `corepack pnpm test` -> passed (22 files, 70 tests).
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> passed (1 test).

Regressions/known gaps:
1. No regressions detected in this verification run.
2. `rollType=42` and `rollType=70` remain intentionally excluded pending deterministic evidence.

Explicit handoff next steps:
1. Validate block-chain merge heuristics against additional non-goblin fixtures to confirm window/link preference robustness.
2. Continue expanding deterministic roll-family allowlists only when replay evidence supports stable semantics.

## 2026-02-11 14:15 - Roll-type evidence rebaseline execution
Goal:
1. Execute evidence-first roll-family rebaseline: document observed `sourceTag|rollType` behavior, explicitly map code coverage status, and apply high-confidence scoring fixes.

Changes made (files):
1. Replay contracts/mappings:
- `src/domain/replay/rollTypeContracts.ts` (new)
- `src/domain/replay/mappings.ts`
- `src/domain/replay/extractStructuredTurns.ts`
2. Nufflizier scoring flow:
- `src/domain/nufflizer/classifyRollContext.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/constants.ts`
3. Tests:
- `tests/unit/rollTypeEvidenceMatrix.test.ts` (new)
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/replayMappings.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
4. Documentation:
- `docs/ROLL_TYPE_EVIDENCE_MATRIX.md` (new)
- `docs/ROLL_TYPE_CODE_COVERAGE.md` (new)
- `docs/REPLAY_INVESTIGATION.md`
- `docs/PROJECT_PLAN.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm test` -> initially failed on `tests/unit/nufflizierScoring.test.ts` (shaftaroonie expectation after roll-family remap), then passed after fixture adjustment.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm typecheck` -> passed.
4. `corepack pnpm test` -> passed (23 files, 73 tests).
5. `corepack pnpm build` -> passed.
6. `corepack pnpm test:e2e` -> passed (1 test).

Regressions/known gaps:
1. Uncertain deterministic families remain excluded by design (`1,5,6,7,31,33,41,43,45,67,73,74,88`).
2. Randomizer families remain explicitly non-candidate by design (`8,9,25,26,30,87`).

Explicit handoff next steps:
1. Prioritize semantic resolution for high-volume ambiguous families: `ResultRoll|1` and `ResultRoll|67`.
2. Add additional replay fixtures covering special-action and bomb/chainsaw chains to lift medium-confidence families.

## 2026-02-11 15:14 - RollType 1 movement-risk promotion
Goal:
1. Use expanded demo fixture evidence to resolve `ResultRoll|1` semantics and integrate it as scored luck context with strict validation gates.

Changes made (files):
1. Domain scoring contracts/types:
- `src/domain/replay/rollTypeContracts.ts`
- `src/domain/nufflizer/types.ts`
- `src/domain/nufflizer/constants.ts`
- `src/domain/nufflizer/classifyRollContext.ts`
- `src/domain/nufflizer/probability.ts`
- `src/domain/nufflizer/analyzeLuck.ts`
- `src/domain/nufflizer/explainabilityCopy.ts`
2. UI/content surfaces:
- `src/app/nufflizier/NufflizierAnalyzer.tsx`
- `src/app/page.tsx`
3. Tests and fixtures:
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/nufflizierProbability.test.ts`
- `tests/unit/nufflizierScoring.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
- `tests/unit/rollType1Evidence.test.ts` (new)
- `tests/fixtures/evidence/rolltype1-expanded-summary.json` (new)
- `tests/fixtures/evidence/rolltype1-gate.json` (new)
4. Handoff docs:
- `docs/ROLL_TYPE_CODE_COVERAGE.md`
- `docs/ROLL_TYPE_EVIDENCE_MATRIX.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/PROJECT_PLAN.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm typecheck` -> initially failed on strict typing in `tests/unit/rollType1Evidence.test.ts`; passed after payload-shape narrowing fix.
2. `corepack pnpm test` -> passed (24 files, 76 tests).
3. `corepack pnpm lint` -> passed.
4. `corepack pnpm build` -> passed.
5. `corepack pnpm test:e2e` -> passed (1 test).

Regressions/known gaps:
1. `ResultRoll|67` remains unresolved and excluded deterministic.
2. Argue variants `rollType=42` and `rollType=70` remain intentionally excluded pending deterministic evidence.

Explicit handoff next steps:
1. Run the same evidence-gate workflow for `ResultRoll|67` with expanded fixtures before any promotion.
2. Decide whether `movement_risk` weight needs recalibration after larger replay corpus analysis.
3. Keep roll-type evidence docs synchronized whenever demo fixture corpus changes.

## 2026-02-11 16:41 - RollType 7 pickup promotion and evidence gate
Goal:
1. Promote `ResultRoll|7` to scored deterministic pickup behavior under `ball_handling` and lock it with expanded-fixture evidence gates.

Changes made (files):
1. Domain scoring contracts/classification/constants:
- `src/domain/replay/rollTypeContracts.ts`
- `src/domain/nufflizer/classifyRollContext.ts`
- `src/domain/nufflizer/constants.ts`
- `src/domain/nufflizer/explainabilityCopy.ts`
2. Tests and evidence artifacts:
- `tests/unit/rollType7Evidence.test.ts` (new)
- `tests/fixtures/evidence/rolltype7-expanded-summary.json` (new)
- `tests/fixtures/evidence/rolltype7-gate.json` (new)
- `tests/unit/nufflizierClassification.test.ts`
- `tests/unit/analyzeNufflizier.test.ts`
- `tests/unit/nufflizierCoverageInventory.test.ts`
3. Documentation and handoff updates:
- `docs/ROLL_TYPE_CODE_COVERAGE.md`
- `docs/ROLL_TYPE_EVIDENCE_MATRIX.md`
- `docs/REPLAY_INVESTIGATION.md`
- `docs/PROJECT_PLAN.md`
- `docs/CONVERSION_LOG.md`
- `docs/IMPLEMENTATION_LOG.md`

Commands run + outcomes:
1. `corepack pnpm test tests/unit/nufflizierClassification.test.ts tests/unit/analyzeNufflizier.test.ts tests/unit/nufflizierCoverageInventory.test.ts tests/unit/rollType7Evidence.test.ts` -> passed.
2. `corepack pnpm lint` -> passed.
3. `corepack pnpm typecheck` -> passed.
4. `corepack pnpm test` -> passed (25 files, 79 tests).
5. `corepack pnpm build` -> passed.
6. `corepack pnpm test:e2e` -> passed (1 test).

Regressions/known gaps:
1. Remaining excluded deterministic families are unchanged (`33`, `88`, `67`, and lower-frequency one-offs).
2. Argue-call variants `rollType=42` and `rollType=70` remain intentionally excluded pending deterministic evidence.

Explicit handoff next steps:
1. Prioritize rollType evidence-gate execution for `ResultRoll|33` (highest remaining impact).
2. Keep roll-type docs and evidence artifacts synchronized whenever demo fixture corpus changes.
3. Re-run full validation after the next roll-family promotion.

## 2026-11-09 15:35 - Adversarial remediation backlog and agent handoff
Goal:
1. Turn the complete adversarial review and requested consequence-sensitive luck system into an actionable backlog discoverable by a follow-up coding agent.

Changes made (files):
1. `docs/REMEDIATION_BACKLOG.md`: 28 stable IDs, priority/dependency/status ledger, reproduction evidence and runnable probe, source locations, work packets, acceptance criteria, execution instructions, review crosswalk, and closure template.
2. `docs/PROJECT_PLAN.md`: current trust limits, subsystem status, milestones, next three issues, and retained historical updates; old active commitments mapped to new owner IDs.
3. `AGENTS.md`, `README.md`, `docs/PROJECT_BLUEPRINT.md`: entry-point links, context-sensitive product goal, and corrected readiness framing.
4. `docs/REPLAY_INVESTIGATION.md`, `docs/ROLL_TYPE_EVIDENCE_MATRIX.md`, `docs/ROLL_TYPE_CODE_COVERAGE.md`: historical-evidence notices directing semantic revalidation to the backlog.
5. `docs/CONVERSION_LOG.md`, `docs/IMPLEMENTATION_LOG.md`: append-only planning/change records.

Commands run + outcomes:
1. `git status --short`, `git rev-parse HEAD`, targeted document reads, and `git diff --stat` -> inspected clean starting tree and reviewed baseline `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`.
2. `git diff --check` -> passed.
3. Python documentation consistency check -> passed: 28 unique packet/ledger IDs, all issues open, no dependency cycles, required Find/Work/Acceptance fields, existing local Markdown targets, and balanced fenced blocks.
4. Runtime test/build suite not rerun for this documentation-only change. The preceding review's successful checks and their correctness limitations are recorded in the backlog as dated baseline evidence.
5. Executed the backlog's bounded reproduction command -> all five cases reported successfully. Additional checks -> suggested issue order satisfies all dependencies; both historical logs preserved byte-for-byte as prefixes.

Regressions/known gaps:
1. No runtime remediation was performed; every backlog item remains open.
2. Confirmed defects and unresolved semantic mappings must be reproduced/revalidated against the implementing agent's current checkout.
3. Dependency findings/platform limits need refresh during remediation; no deployed Vercel result was obtained in the review.

Explicit handoff next steps:
1. Read `docs/REMEDIATION_BACKLOG.md` and execute NUF-001 to preserve independently expected reproductions.
2. Address NUF-004 dependency/entity safety and NUF-005 bounded ingestion, then continue in dependency order.
3. Keep IDs and acceptance criteria stable, assign new IDs to newly found defects, update the ledger, and append closure evidence to both logs as appropriate.

## 2026-11-09 - Safe ingestion and truthful report remediation

Issue(s): NUF-001–006, NUF-025 (done); NUF-007/008/012–015/019–022/026/027 (in progress); NUF-009/023/024 (blocked); NUF-010/011/016–018/028 (open).
State: partial backlog implementation; seven locally verified closures, 21 incomplete items. No final semantic/product acceptance is claimed.
Baseline: `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`. Pre-existing planning/documentation changes were preserved. Commit: not created; changes are in the working tree.

Baseline reproduction and independently expected behavior:
1. Before runtime edits, `scripts/remediation-probe.ts` captured all five supplied review probes plus a twelve-demo corpus inventory in `tests/fixtures/remediation/review-baseline.jsonl`. Declaration/format variants yielded zero scored events or empty reports; junk and the zero-event fixture yielded even verdicts. Baseline demo1 coverage was 168/178 despite excluded real block/injury records.
2. Added `annotations.json` with ownership IDs, raw facts, explicit null unknown fields, independent arithmetic/XML expectations and rule-evidence status. `scripts/extract-review-fixtures.ts` preserves minimal reroll, self-damage and block/injury source fragments; `fragments-provenance.json` locates the original one-based sequences. No sensitive identifiers were introduced beyond already sanitized source payloads.
3. Numeric reference expectations are independently enumerated: any-die `[2,2]` at 4+ fails with 3/4 success probability; every 2D6 threshold is checked against 36 outcomes; a chosen full independent team reroll at 2+ has 35/36 success probability. These are arithmetic contracts, not proof of BB3 enum/skill meanings.
4. `scripts/context-review-probe.ts` seeds the still-open source-position/context/additivity reproductions. It makes the absence of board/counterfactual support explicit; its observations are not promoted into tests that endorse the defective context-invariant behavior.

Changes and source/test paths:
- `src/domain/replay/{decodeReplay,safeXml,limits,parseXml,extractStructuredTurns,types,attribution,rollTypeContracts}.ts`: safe, bounded, ordered source decoding; explicit team/version/envelope/event policies; stable locators; unknown messages; unnamed ownership/conflict evidence.
- `src/server/{analysisWorker,runAnalysis}.ts`, `src/server/upload/*`, `scripts/build-analyzer.mjs`, both API routes, CLI and Next tracing: bounded multipart streaming, response guard, terminating workers with cancellation/cleanup, local concurrency and aggregate quota, default-disabled compatibility.
- `package.json`, `pnpm-lock.yaml`, CI: supported framework/parser/validation upgrades, compatible patched PostCSS override, Node 22/pnpm 9/frozen install/audit. Generated worker bundles remain ignored and are prepared automatically.
- `src/domain/nufflizer/*`, UI/CLI copy and landing page: bounded numeric probability/outcome parity, contradiction/missing-type exclusion, explicit linked rerolls/original dice, visible unknowns, abstention, versioned shared types, additive unrounded numeric totals, full-event filtering before bounded paging/reset and useful errors.
- `tests/unit/remediation{Ingestion,Execution,Evidence,BoundaryParity,Fragments}.test.ts`, existing affected suites, `tests/helpers/*`, and real `.bbr` browser coverage. Historical shape/adjacency promotion assertions were replaced by raw-fact preservation/arithmetic invariants; historical evidence JSON was not silently regenerated as new truth. Incorrect contradictory synthetic examples were corrected while keeping contradiction-specific rejection tests.

Acceptance criteria verified for closed issues:

| Issue | Criterion evidence / result |
| --- | --- |
| NUF-001 | Runnable review/corpus/context probes, independent annotations and three minimal source fragments cover the review observations; baseline predates semantic edits. Missing independent rule/context evidence remains explicitly owned by NUF-009/016/017. Fixed probes are passing regressions; no permanent skipped tests were introduced. |
| NUF-002 | Original/declaration/comment/CRLF/pretty/attribute/empty-element and wrapped-base64 variants preserve teams, order, odds and scores. Both supported roots are exercised; unsupported roots and malformed outer/embedded XML reject visibly instead of disappearing. Real demo1 original/declaration/whitespace reports agree in `current-observations.jsonl`. |
| NUF-003 | Junk, missing dice, malformed embedded base64/XML, invalid numeric roll fields, missing/duplicate teams and unsupported versions have explicit errors. Seven invalid cases return HTTP 400 `INVALID_REPLAY` and nonzero CLI exit with no JSON verdict. Recognizable incomplete data yields an explicitly insufficient/partial report. Decoder/parser limits apply to direct service input as well as transfer entry points. |
| NUF-004 | Refreshed production audit: original 44 advisories → zero after framework/parser/Zod/transitive patches and compatible PostCSS override. Both XML parsers disable custom entities and reject DTD declarations before tree parsing. Bounded outer/embedded entity, numeric-text and normal safe-text regressions pass. Build and production browser checks pass; CI audits dependencies without suppression. |
| NUF-005 | Stream reading enforces total bytes independently of content length; extra/duplicate multipart parts reject. Exact file limit accepted, one extra byte rejected. zlib output bound is enforced during expansion. Depth (including quoted delimiter bypass), node, embedded-message and event limits reject within bounded tests. All twelve demos parse. A representative worker observation records timing/RSS/response size; RSS is an observation, not a peak-memory guarantee. |
| NUF-006 | A real demo parse is terminated on a 100ms test deadline; the parent remains responsive and a concurrent small request succeeds. Client cancellation terminates work, awaits cleanup and releases concurrency; pre-aborted work never starts. HTTP/CLI use the worker boundary. Next production output traces include `.generated/analysis-worker.cjs`, and browser uploads exercise it. Vercel-specific deployment acceptance remains NUF-023. |
| NUF-025 | Missing/invalid/disabled config returns HTTP 410 and successor metadata without parsing uploads. Explicit enabled compatibility returns its payload using the hardened reader/worker. Deprecation, HTTP-date Sunset and successor Link headers agree with README; no modules/tests were deleted and primary API/CLI remain functional. |

Validation commands/results (Node v22.17.1, pnpm 9.0.0, Next 15.5.29, parser 5.12.0, Zod 4.6.7; report schema 2.0/model dice-only-2):
1. `corepack pnpm audit --prod --json` (refreshed after final lockfile changes) → zero info/low/moderate/high/critical advisories. Registry access required the normal sandbox network escalation; no automatic approval rejection occurred.
2. `CI=true corepack pnpm install --frozen-lockfile` → passed. A fresh source copy under `/tmp/nufflizier-fresh-xzpjiemp` installed 503 packages from the frozen lockfile. Deliberately changing the manifest's Zod spec in a separate temporary directory caused `ERR_PNPM_OUTDATED_LOCKFILE`; no silent resolution was permitted.
3. Fresh-copy `corepack pnpm lint` → passed; `corepack pnpm typecheck` → passed; `corepack pnpm test` → **134/134 tests in 30 files passed**, including legacy/shared-parser checks and every new regression suite. `test:nufflizier` now runs the full unit suite rather than silently omitting differently named security/parser cases.
4. Fresh-copy `corepack pnpm build` → passed. Build ran before the production browser server. Traced API artifacts include the bundled worker. No remote CI run or committed candidate was created; NUF-026 remains in progress for that evidence.
5. `PLAYWRIGHT_BROWSERS_PATH=/tmp/nufflizier-remediation-browsers corepack pnpm test:e2e` against the production build → two flows passed. Browser plugin unavailable; repository Playwright was used. Flow: `/nufflizier` → real `demo1.bbr` upload → partial report → all four ball-handling events → evidence detail → JSON export → excluded-block filter → reset → zero-evidence report. A second flow checks junk replay and hosting-generated HTML 413 errors. Desktop 1280×720 and mobile 390×844 screenshots were inspected; meaningful content, page identity, no framework overlay, no page/console errors in the real upload flow, and interaction assertions passed. Screenshot evidence: `/tmp/nufflizier-evidence-desktop.png`, `/tmp/nufflizier-evidence-mobile.png` (temporary QA artifacts, not required dependencies).
6. Representative local `demo1.bbr` worker: 1,787ms, 677,098-byte serialized report, 613 reported records, 30/443 scored random-outcome candidates (6.77%), four ball-handling events and an abstaining partial verdict. Process RSS before/after was 89,030,656/133,824,512 bytes; this is not peak RSS or a cross-machine benchmark. `tests/fixtures/remediation/execution-observation.json` records the observation.
7. `scripts/remediation-probe.ts` → all twelve demos analyzed without unexplained crashes; original/declaration/whitespace variants agree; junk rejects; zero-event smoke returns insufficient evidence. Current observations are separate from historical baseline evidence. `git diff --check` and document checks for 28 stable packets/ledger rows, status values, local link targets and balanced fences passed.

Remaining limitations / blockers:
1. NUF-009: available sanitized demos and documents do not independently prove BB3 roll/step/action/skill/face/status namespace semantics. Requested another authoritative/local evidence route from the user; none has been supplied in this run. BB2 mappings were not substituted for BB3 evidence. NUF-010/011/016–018 remain open, and partial progress in NUF-007/008/012–015/019–022 does not close their unmet acceptance criteria.
2. In particular, disputed block/damage/referee events are retained but excluded; self-damage is safely prevented from awarding positive luck, not yet correctly valued as negative damage luck. A full skill/Pro reroll policy, status-flag deduplication, resource accounting, orphan outcomes and causal coverage reconciliation are still required. No tactical state, contextual counterfactuals, calibrated strength labels, supported-analysis/even comparison or win probabilities are claimed.
3. NUF-023: no configured Vercel deployment/account access is present. Near-limit request/response, cancellation/timeout and actual platform worker smoke remain unverified despite local tracing/browser success.
4. NUF-024: no configured shared quota/concurrency backend or verified platform edge policy exists. The bounded one-bucket local safeguard ignores attacker-controlled forwarding headers but does not meet the multiple-instance acceptance criterion. Eventual backend metadata privacy/retention and failure policy remain required.
5. NUF-026/027/028 remain incomplete for a committed, remotely tested candidate, final rule/context/operational reconciliation and all predecessor evidence. No deployment, publication or final backlog completion is claimed.

Next ready issue: obtain NUF-009 independent semantic evidence and NUF-024/023 deployment configuration; then complete the dependency graph with the existing permanent criteria intact.

## 2026-11-09 - Report contracts and independent engineering

Issue(s): NUF-015/019/021/022/023/026/027 (independent engineering advanced); NUF-006 (response execution boundary strengthened); NUF-009 (status corrected to in_progress).
State: in_progress for the full owning backlog items. Seven prior local closures remain; no new whole-item closure or full semantic acceptance is claimed.
Commit: not created; all work remains in the shared working tree. Existing implementation/planning changes were preserved.

User clarification and scope:
1. The user confirmed that the original replay mappings were reverse-engineered and no official source exists, then asked whether other work can continue without PC/game captures. Official enum documentation is not required by the backlog. NUF-009 is now active empirical investigation; controlled captures can strengthen confidence but are not a prerequisite for independent software work.
2. This change deliberately implements report, response, execution and verification guarantees that can be tested without inferring another game-rule ID. Existing mapping/category uncertainty and contextual acceptance criteria remain intact.

Baseline reproductions / independently expected behavior:
1. UI previously cast any successful JSON body to LuckReport. Contradictory totals or malformed success bodies could reach rendering; only TypeScript definitions were shared. A report contract must reject inconsistent values independently of whether the underlying game mapping is correct.
2. Unknown category/team contributions were shown numerically in some UI/CLI text, despite having no scored evidence. An empty mathematical sum must be distinguishable from measured zero luck contribution.
3. HTTP JSON serialization occurred on the API thread after worker completion. The same terminating budget should encompass report serialization, with a byte cap before copying the result to the parent. Exact output-cap/one-byte-overflow cases are independent numeric references.
4. `test:e2e` started an existing production build without rebuilding it; a browser test could silently use stale UI code. The public test command now rebuilds the worker/app and CI runs that production build/browser step once.
5. During final contract review, a bounded probe changed an insufficient report's headline to “Home was decisively luckier.” The first schema accepted it even though structured verdict fields abstained. The final schema binds the headline to shared, status-specific model text; a dedicated tampering regression rejects this contradiction.

Changes and paths:
- `src/domain/nufflizer/reportSchema.ts`: strict versioned Zod schema, structural/arithmetic conservation checks, model-weight checks and evidence-qualified verdict/headline constraints. `types.ts` now derives every report type from the executable schema.
- `src/server/services/analyzeNufflizer.ts`: validates generated primary reports before returning them from the worker.
- `src/lib/readAnalysisResponse.ts`: streaming success-body cap of 4,000,000 bytes, bounded 4 KiB error bodies, cancellation on declared/actual overflow, schema validation before consumption, and distinct messages for incompatible data, network interruption, cancellation and hosting errors.
- `src/domain/nufflizer/presentation.ts`, `explainabilityCopy.ts`, `analyzeLuck.ts`, UI and CLI: shared evidence-qualified numeric formatting and status-specific headlines; measured zero is distinct from Not scored. Supported numeric values/weights/game classifications are not retuned.
- `src/server/{analysisWorker,runAnalysis}.ts`, `src/server/upload/analyzeUpload.ts`: worker-side HTTP serialization/output cap, 11-byte legacy-envelope headroom, typed REPORT_TOO_LARGE/RESOURCE_LIMIT results and cleanup. The API thread only parses/constructs bounded JSON; the final response guard remains. CLI output is not restricted by the HTTP response cap.
- `package.json`, CI: `verify` runs lint→typecheck→unit tests→production build→browser. `test:e2e` always prepares/rebuilds production artifacts; CI no longer separately repeats that build.
- New `reportContract.test.ts`, `readAnalysisResponse.test.ts`, `reportPresentation.test.ts`; extended execution and browser suites. `docs/REPORT_CONTRACT.md`, ingestion contract, README, plan and ledger explain guarantees/limitations and the corrected reverse-engineering route.

Acceptance evidence for the implemented portions:
1. Contract tests accept existing truthful partial/insufficient reports and a real demo round-trip. They reject unsupported versions; nonfinite/out-of-range values; fabricated verdict fields/headlines; changed weights; missing outcome/ownership/evidence; duplicate IDs; altered key moments; and inconsistent coverage, exclusion counts, categories, team totals/counts and gap. These tests establish report consistency, not game semantics.
2. Response tests reject malformed successful JSON/HTML, non-string error fields, overlarge success streams with missing/false content lengths and oversized error pages. Declared overlarge bodies and actual overflows cancel their streams. AbortError is preserved, while network interruption remains distinguishable from size failure.
3. Presentation tests distinguish zero scored records (“Not scored”) from a genuine zero sum with scored evidence. Per-team/category counts exclude unsupported records and other teams. UI/CLI use the same helper; report JSON preserves mathematical sums and explicit evidence status.
4. Real workers reject oversized serialized reports, accept the exact byte cap and reject a cap one byte below the generated size. Invalid cap configuration does not allocate a worker. Cleanup releases worker slots after success/rejection. Existing deadline, client-cancellation, concurrent-parent responsiveness, API/CLI invalid-input and legacy tests still pass.
5. Browser coverage validates a real `.bbr`, all four ball-handling records, JSON export, full filters/reset and zero-evidence presentation. New flows reject inconsistent HTTP-200 reports without rendering them, show an HTML-504 timeout clearly, and cancel pending uploads back to an enabled idle form with no fabricated report.

Commands/results:
1. Fresh source copy `/tmp/nufflizier-contract-fresh-4eokv_9_`: `CI=true corepack pnpm install --frozen-lockfile` passed; lockfile resolution was skipped and all 503 packages installed from the existing dependency set. No dependency versions changed in this follow-up.
2. Fresh-copy `PLAYWRIGHT_BROWSERS_PATH=/tmp/nufflizier-remediation-browsers corepack pnpm verify` passed: lint, typecheck, **191/191 unit tests in 33 files**, production Next.js build, and **4/4 Playwright flows**. The production build preceded the browser server, using current source. Final tightening of the headline check was included in this full verification.
3. Focused contract/response/execution/parity suites passed during implementation, including the exact response-budget boundaries. No existing semantic evidence snapshot was regenerated to manufacture acceptance.
4. Browser plugin unavailable; repository Playwright tested the production app at `http://127.0.0.1:3000/nufflizier`, desktop 1280×720 and mobile 390×844. Page identity/content, no framework overlay, no real-upload page/console errors, interaction flow and screenshots were checked. Screenshots inspected: `/tmp/nufflizier-contract-desktop.png`, `/tmp/nufflizier-contract-mobile.png`; temporary artifacts only. No Windows PC was accessed or game played.
5. `git diff --check` and the stable-ID/status/link documentation checks passed. No commit, push, deployment, publication, remote message or replay persistence was created.

Remaining limitations / next ready work:
- NUF-009 is not blocked on official documentation. Continue annotated empirical contracts from raw replay facts, checkpoints, cross-fixture counterexamples and independent rule arithmetic; optional controlled gameplay captures can corroborate those inferences.
- NUF-021 still needs completed contextual explanations after state/value work. Report consistency cannot establish correct roll/skill/beneficiary meanings or causal deduplication, so semantic/context IDs and final golden-corpus acceptance remain open.
- NUF-023 deployed smoke, NUF-024 shared quota/concurrency configuration and NUF-026 committed/CI evidence remain outstanding. Local verification does not establish platform-wide controls or Vercel behavior.

## 2026-11-09 - Commit and push of the remediation candidate

User request: commit and push the reviewed implementation and handoff changes.
Target: current branch `master`, tracked upstream `nufflizer/master` at `https://github.com/Brandon-Born/nufflizer.git`. The separate `origin` remote remains the legacy `bb-trainer` repository and is not the publication target.
Commit: this commit (see Git history); baseline `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`.

Pre-publication evidence:
1. Refreshed `nufflizer/master`; reviewed the tracked/untracked file inventory, dependency/CI changes, fixture sizes and whitespace checks. Generated worker/build outputs, local environment files and temporary browser artifacts remain ignored.
2. The final source was already validated from a clean frozen install: lint, typecheck, 191 unit tests in 33 files, production build and four browser flows passed. The workspace production build also passed. No runtime changes were made for the commit/push step; this entry and the plan only record publication state.
3. Seven prior local closures remain; NUF-009 is active reverse-engineering work. Remote CI evidence, deployed validation, shared abuse controls and full semantic/context acceptance remain outstanding. Committing/pushing does not mark these requirements complete.

## 2026-11-09 - User-supplied local replay action inventory

User request: ignore the newly supplied replay folder and use it to investigate move/action identification.

Changes:
1. Added root-anchored `/replays/` to `.gitignore`. All 27 source BBR files and generated analysis reports remain local; no source files were tracked, uploaded or committed.
2. Added `scripts/inventory-replay-actions.py`, a dependency-free offline raw XML/message inventory that does not import disputed application mappings. Outputs use source hashes, sequence/step/message locators and numeric payload projections. Per-file counters merge only after successful processing.
3. Inspected all 27 local files with an explicit 32 MiB offline cap: 35,121 step emissions and 41 source-tag/type pairs. Compared all 12 demo files: 14,272 steps and 33 pairs. Source file hashes do not overlap. Recorded raw movement/block/damage/skill co-occurrence and source-linked counterexamples in `docs/LOCAL_REPLAY_FINDINGS.md`.
4. One local file expands to 16,510,562 bytes and is excluded by the product/default inventory 15 MiB cap. The default-cap run reproduced that exclusion (26 processed files, 33,060 steps). Product limits remain unchanged.
5. Linked the investigation from the plan and backlog. NUF-009 remains in progress; no source-code scoring or rule-contract changes, semantic promotions, or issue closures were made.

Validation:
- Both expanded-corpus and demo inventories completed without errors at their stated caps; default-cap local inventory explicitly recorded the single size exclusion.
- Manually inspected decoded numeric step/message examples and source locators for movement, block questions/results, type-4 replacement emissions and activation/skill checks. Aggregate counts are source emissions, not unique rolls or independent rules evidence.
- `git diff --check` passed. `git ls-files -- replays` returned no tracked files; all 27 sources and three generated reports matched Git ignore rules.
- Removed temporary Python bytecode. Full app lint/type/unit/build/browser checks were not run: this change adds offline research tooling, ignore configuration and documentation without changing application behavior.

Next: validate type-2 movement/dodge, type-4 movement-associated ball handling, type-7 receipt, activation traits and reroll-policy hypotheses using state transitions, roster/skill evidence and independent arithmetic. Sparse BoardState updates require explicit unchanged-versus-cleared field handling. See the findings document; raw reports remain in ignored `replays/.analysis/`.

## 2026-11-09 - Hotseat experiment and UI-paired replay evidence

User request: control BB3 locally in single-player hotseat, create scenarios, obtain a replay and determine definitive move/action mappings. Computer Use access initially failed, then worked after the user enabled the app and requested continuation.

Execution and results:
1. Completed a local default Human versus Black Orc match, controlling both teams, ending 0–0 after 16 turns per team. Recorded 18 observations covering common checks, rerolls, traits and damage. No new BBR appeared in Saved/Replays and no downloadable hotseat match appeared in profile history. Rechecked the saved directory: the 27 original sources remained. Updated the ignored session plan to `hotseat_completed_no_replay_available`. No raw mapping is claimed from this unavailable capture.
2. Loaded two existing saved BBRs through the BB3 UI. Manually observed labels/dice/thresholds/modifiers/resources, matched roster IDs and exact raw sequence/step/message records without importing Nufflizier's labels, and preserved 20 cases in `tests/fixtures/evidence/bb3-ui-playback-001.json` and `bb3-ui-playback-002.json`.
3. Added `scripts/verify-replay-evidence.py` to verify original source hashes, replay versions and all numeric extracts. The two source files declare ReplayVersion 1-4-0-0. Fixtures omit source filenames, match/coach/team/player names, account identifiers and arbitrary text. Original sources, raw inventories, hotseat notes and local assembly scripts remain under ignored `replays/`.
4. Documented direct correspondences for 15 roll families, seven skill IDs and five block symbols in `docs/REPLAY_UI_EVIDENCE.md`. Included ordinary movement without checks; pickup versus catch; hand-off initiator versus recipient; foul initiator versus victim; failed-Rush self-damage; defender-owned Foul Appearance; Bone Head and Animal Savagery; successful and failed Loner gates.
5. Counterexamples: a failed Loner spends a resource and re-emits block RollStatus 2 without fresh pool dice; two type-5 Outcome-0 records are visibly Fumbled and Inaccurate; distinct block faces [4,3] both produce adjusted DiceOutcomes 6 against the same target. These require separate face/outcome/attempt and actor/subject/skill-owner contracts.
6. Linked the findings from the plan/backlog and corrected an earlier unsupported assertion about omitted BoardState fields. No runtime mappings or scores changed, and no remediation issue was closed. This is scoped empirical evidence, not complete semantic support.

Validation:
- Both source verifiers passed: 16 cases / 50 numeric records and 4 cases / 11 numeric records, respectively. Verification checks extract identity, not manual semantic transcription; no separate human review is claimed.
- Additional numeric-only projection, locator uniqueness, mutation-rejection and independent arithmetic checks are recorded with the final verification below.
- `corepack pnpm --version` failed before package execution: the sandbox denied creating the default Corepack cache (`EPERM`). This checkout has no node_modules, and the available global Node is 24.15.0 while the project requires Node 22. No app lint/type/unit/build/browser success is claimed for this research-only change. Production code was not modified.

Outstanding: held-out/source-version acceptance, remaining positive/negative trait and skill policies, full injury/casualty/recovery/referee chains, state/default semantics and runtime implementation. NUF-009 remains in progress; see the evidence document for exact missing cases.

Follow-up within this capture session: added UI-021 (failed Animal Savagery, kept original die, friendly victim selection) and UI-022 (second-source Dodge/Rush/pickup/bounce with declined reroll). Final evidence is **22 cases / 68 raw records**: source 001 has 16/50, source 002 has 6/18. Renamed the fixture's UI counter field to `displayedActionNumber`: its activation semantics are unproven, and the game counter can advance during continuing chains. Friendly victim damage dice were not visually read and are not claimed as independently annotated.

Final research verification: both source verifiers passed at those final counts; all observation IDs are unique and all raw step/message leaves are numeric or null; a deliberately changed die was rejected at sequence 3 / step 0; exact Fraction arithmetic confirmed 8/9 and 65/72 examples; both Python scripts compiled without bytecode output; `git diff --check` passed. Git ignore checks cover source/capture/analysis files and `git ls-files -- replays` remains empty. Full application checks remain unrun for the environment reasons above; no production files were changed. BB3 was left paused in saved replay playback.

## 2026-11-09 - Further saved-replay mining and direct-event capture

Continued the user's active BB3 research request with the Computer Use skill. Observations UI-023–041 extend the prior fixtures and add sources 003, 004 and 007. Checkpoint: 41 cases across five files, 129 distinct encoded step records plus two direct ReplayStep/EventRoll records, all source verified. New game-label matches include Interfere, Deviate, Shadowing, Dauntless, Casualty, Throw Team-Mate, Always Hungry, Unchannelled Fury, Projectile Vomit, Land, Argue the Call and KO recovery; 27 named roll families total in annotated contexts.

Material counterexamples: type-25 movement can concern a thrown player rather than the ball; type 26 is used for kicks and thrown players; a declared Block can resolve as Projectile Vomit without block dice; active side can differ from the roller/skill owner; thrower, thrown player, collision victims and damage subject require separate roles; Argue the Call Outcome 2 is Neutral and its visible die has NewRoll 0. Failed recovery omits Outcome. No universal omitted-field defaults are claimed.

Extended inventory with separate top-level event counts, preserving historical step counts. Across 27 files: 184 EventRoll/13, 67 unidentified EventRoll/92, 116 kick-off-table, 43 weather and 27 fan-factor event emissions. Extended the verifier with optional eventRecords located by one-based ReplayStep / zero-based child index. All five source verifiers passed; a deliberately mutated direct-event die was rejected at ReplayStep 287 / child 3; unique IDs, numeric-only projections and Python compilation passed. `git diff --check` passed. A temporary validation script assumed the last case held direct events; corrected it to select UI-040 by ID and reran successfully.

No production code changed and no backlog item closed. Full app checks remain unrun for the Node/dependency limitations documented above. The explicit research goal remains active and BB3 remains open while additional rare-event sources are inspected.


Further checkpoint: UI-042–045 in source 013 add Jump up, Tentacles, Fireball hit and Bribe. Evidence now totals **45 cases / 149 step records / 2 top-level event records across six sources**, with 31 numeric roll-family names in observed contexts. All six source verifiers, numeric-only and ID-uniqueness checks, direct-event mutation rejection and Python compilation passed. No runtime behavior changed or backlog item closed; BB3 research remains active.


## 2026-11-09 - Rare actions and Pick me up from existing replays

Continued Computer Use mining of original saved BBRs rather than claiming a hotseat export. Added UI-046–058: Breathe fire failure/success, Pro replacement Block dice, bomb passes/catches/Explosion/Bomb damage, Ball & Chain direction, Animosity before hand-off, Chainsaw foul/Argue the Call success, failed Regeneration, Jump over failure/same-face reroll/success, and successful/failed Pick me up. Final checkpoint: 58 manually annotated cases, 192 verified step records and six direct events across ten sources; 41 named numeric roll families in scoped contexts. The six direct events include four rolls and two accompanying skill usages. All sources still declare version1-4-0-0; held-out/version acceptance remains open.

New counterexamples: pass Outcome0 includes Wildly Inaccurate; bomb log wording reuses ball/catch terms; successful type88/89 damage checks harm friendly subjects; Jump over Moved1 coexists with failure/damage; Ball & Chain direction is Neutral; Pick me up type92 occurs outside encoded steps, with omitted Outcome on failure despite Used1 skill usage. See REPLAY_UI_EVIDENCE.md and numeric fixtures for exact locators. Type9 return-to-pitch transition still lacks observed dice roles. Complete skill, injury/casualty/apothecary, referee, state/default and beneficiary policies remain incomplete. No runtime mappings/scoring changed or backlog item closed.

Validation: all ten source/extract verifiers passed; unique IDs, numeric-only projections and Python compilation passed; a deliberately modified direct-event die was rejected at ReplayStep287/child3. Original replay/capture/analysis paths remain Git-ignored and no replay source is tracked. Full application lint/type/unit/build/browser checks remain unrun for the previously documented Node/dependency limits; this change only adds research fixtures and documentation. BB3 is paused in saved replay005; the broader data-gathering goal is still active.

## 2026-11-09 - Existing-corpus decision and apothecary evidence

Continued the authorized Computer Use investigation of existing BBRs. Added UI-059–064 across sources005,002,001. Checkpoint: 64 manually annotated cases, 220 distinct source-verified step records and six direct events across ten sources; still41 named numeric roll families. Raw corpus scans found37 apothecary usage questions,16 casualty-choice questions and16 type9 return-to-pitch emissions. Private scan scripts/results remain under ignored replays/.analysis/; emission counts do not establish independent attempts or complete rule policies.

UI-059 demonstrates a repeated block pool handed to the defender without fresh dice or resource use, despite NewRoll1 in the later selected result. UI-060 follows Seriously Hurt D16=8 through an apothecary replacement D16=1 No Injury; the later choice question transforms the original Outcome field, so preserve the original casualty record. UI-061 shows a three-die pool and Dodge-adjusted Push; corrected an initially misread Both Down icon before accepting the annotation. UI-062 adds Sidestep skill56 and distinct block/push controllers. UI-063 contrasts an unmodified Animal Savagery4+ stand-up activation with earlier attack bonuses. UI-064 revisits the failed-Rush Stunty injury from UI-009: apothecary use yields No Injury with no new casualty dice or choice question, contrasting UI-060.

Updated plan, backlog and evidence document. All ten source/extract verifiers passed at64/220/6; IDs are unique, projections numeric-only, deliberately changed direct-event dice rejected, and research Python scripts compile. Full app checks remain unrun for the previously recorded Node/dependency limitations. No production mapping or scoring code changed, and no remediation issue closed. The broader research goal remains active; BB3 is paused in source001 after the observed apothecary result.

## 2026-11-09 - Retained versus replacement casualty decisions

Prior goal turn classified as progress: it added six UI cases and verified source records. This continuation inspected current BB3 state and added source021 (Skaven versus Chaos Chosen), observations UI-065–067. Current checkpoint:67 cases /242 distinct step records /6 direct events across eleven source files, all version1-4-0-0. No extra numeric family name is claimed;41 remain identified in scoped contexts.

UI-065 independently reads Dislocated Shoulder D16=13+D6=6, replacement Dead D16=15, and final retention of Dislocated Shoulder. Also corroborates failed Loner retaining the original Both Down pool and separate damage to both teams. UI-066 reads Dead D16=16 replaced by Serious Injury D16=10, with the replacement applied. Horns skill15 is visible on that Blitz. UI-067 adds Wildly Inaccurate short pass, interference and pitch return: an offered interceptor evaluation differs from the actual applied modifiers. Its raw Difficulty6 cannot be recovered by blindly adding printed modifiers to the base threshold. The log still omits type9 dice roles.

Raw-only referee/recovery scan across27 originals found one successful Bribe, successful/neutral Argue results, and successful/failed Regeneration candidates. No direct failed Bribe or die1 Argue roll was found by that scan. The next available corroboration is successful Regeneration at source001:259/1; current observed regeneration evidence only covers failure. Local scan tools/results remain ignored. Source021 fixture omits identifying text and records its SHA256.

Validation: all eleven source verifiers passed at67/242/6; unique observation IDs, numeric-only projection checks, mutated-direct-event rejection and public Python compilation passed. No application code changed; app checks remain unrun for the previously documented environment constraints. Plan/backlog/evidence totals updated. NUF-009/011/012/013 remain incomplete. BB3 remains paused in source021 after UI-067; the full research-and-close-game goal remains active.

## 2026-11-09 - Successful recovery and interference from the existing corpus

Previous goal turn made progress by adding successful Regeneration UI-068; this continuation verified and documented it, then added UI-069 in source015 (Nurgle versus Orc). Checkpoint:69 manually annotated cases /253 distinct step records /6 direct events across twelve sources. All source ReplayVersion fields remain1-4-0-0. No new numeric family name or completed runtime contract is claimed.

UI-068 pairs Badly Hurt D16=3 with Regeneration4+ die6 Success, skill19/type46. The original removal precedes successful recovery within one damage step, so it cannot safely establish final unavailability. UI-069 follows Animosity success, Quick pass natural1 fumble, Pass skill47 replacement4 under four Disturbing Presence penalties, Wildly Inaccurate deviation, Interfere4-1 success and separate Catch5-1 success. The UI explicitly reports home possession after Catch and the away turn ending for a failed action. Skill33/type27 modifiers match Disturbing Presence in this context. An interference success alone must not stand in for the subsequent catch outcome. Offered evaluation and applied interference modifiers differ here too.

Expanded the private scan to nested decoded message nodes across27 originals: ten dice-bearing type6 emissions (eight failed/two successful), fourteen type6 evaluations without dice, one successful type21 Bribe, six type30 Argue emissions (two success/four Neutral) and thirteen type46 Regeneration emissions (seven success/six failure). No failed Bribe or die1 Argue was found in these messages; this is representation-scoped absence, not proof that all unrecognized formats are absent. The second successful interference at source027:457 is an additional corroboration candidate. A brief history inspection found the latest listed own match already represented in the original corpus; no new replay export was obtained.

Validation: all twelve source/extract verifiers passed at69/253/6. Unique IDs, numeric-only projections, deliberate direct-event mutation rejection and public Python compilation passed. git diff --check passed; private analysis/replays remain ignored with no replay source tracked. Full application checks remain unrun for the previously recorded Node/dependency constraints; production code is unchanged. Updated evidence, plan and backlog without closing NUF-009/011/012/013. BB3 is paused in source015 at second-half setup after reviewing the first-half turn8 log. The broader gather-missing-data-and-close-game goal remains active.


Further checkpoint: UI-070 in source027 independently confirms successful interference followed by failed Catch, three-die scatter and bounce. It contrasts UI-069 possession after successful Catch, adds applied inaccurate-pass−2/Stunty+1 modifiers, and pairs PlayerStep/29 with interference in a second source. Raw counter[17,16] occurs during a UI turn16 chain; no actual seventeenth home turn is inferred. Loading screen confirms Goblin versus Underworld Denizens. Evidence totals70 cases /260 step records /6 direct events across twelve sources. All twelve source verifiers and integrity checks passed. No runtime contract or issue closure; BB3 is paused at source027 replay end with the expanded dice log visible. The full gather-missing-data-and-close-game goal remains active.

## 2026-11-09 - Selective dice replacement and Wrestle decisions

Continued mining the existing corpus through the Computer Use skill. UI-071/072 in source007 identify Brawler skill96 and Grab skill37: one Both Down die is rerolled while another pool die is retained, including a distinguishable Push. UI-073/074 in source012 (Norse versus Imperial Nobility) identify Wrestle skill68 on attacking and defending player42. Both select Both Down, resolve as Players are wrestling, leave both players prone and continue the active team's turn without an intervening armor/damage step. The face remains1 while Outcome changes1 to2 with NewRoll0. Opponent skill decisions must not be attributed automatically to the attacker.

Checkpoint:74 UI cases /278 source-verified step records /6 direct event records across thirteen sources;41 named numeric roll families remain scoped correspondences, not complete support. A private scan found64 direct casualty-roll emissions and recorded modifier counterexamples for source014:154/1,268/1;015:186/2;017:434/1. These are raw-only candidates, not UI-confirmed names or rule tables. Existing files still offer useful casualty/skill/state evidence; no failed Bribe or die1 Argue was found by the previously scoped message scan.

Validation: all thirteen source/extract verifiers passed; IDs unique, numeric-only projections checked, deliberate direct-event mutation rejected and public Python scripts compiled. git diff --check and ignored-source checks passed. No runtime changes or remediation closures; full app checks remain unrun for the previously recorded environment limits. BB3 remains paused in source012, home turn5/action10, following defensive Wrestle. The broader data-gathering goal is incomplete; the game has not yet been closed.

## 2026-11-09 - Casualty modifiers, Frenzy and throw-in geometry

Previous goal turn made progress by adding attacking/defending Wrestle and synchronized evidence. This continuation used Computer Use to add UI-075–078 from saved sources014/015. Source014 loading labels independently confirm Khorne versus Nurgle. Decay skill81/type27/+1 changes D16=14 to Dead and D16=6 to Seriously Hurt. Source015 independently names modifier type31/+1 as niggling Injury, with no player/skill ID on that modifier. Its selected Both Down causes distinct damage rolls for both teams and then a home turnover, even though enclosing counters already read[5,5]. UI-077 identifies Frenzy skill36 between two separate blocks, with new positions/assists; it is not a reroll of the first block.

Checkpoint:78 manually annotated cases /301 distinct source-verified step records /6 top-level event records across fourteen source files, all declaring1-4-0-0; still41 named roll families in scoped contexts. No runtime contracts or backlog items closed. Complete rule tables and state/beneficiary policies remain incomplete.

The private throw-in geometry audit decoded all27 originals with the explicit offline32MiB cap and checked all16 type9 emissions. First D6 as paired direction, remaining two as summed distance, last inbound origin and interruption/restart at another edge fit16/16 endpoints. The fixed alternatives using the second/third die as direction fit2/16 and5/16. It accounts for the source018 carrier surf and source026 chained return. No west-edge example; two distant-pass origins remain clamp inferences. This is raw-model corroboration, not independent die-role labelling or additional UI annotations. Scripts/results remain ignored under replays/.analysis/.

Validation: all fourteen source/extract verifiers passed at78/301/6; IDs unique, numeric-only projections checked, deliberately changed direct-event die rejected and public Python scripts compiled. git diff --check and replay ignore/tracking checks passed. Full application checks remain unrun for previously documented environment limits; application code unchanged. BB3 is paused in source015 after home turn5/action9 damage, at away turn5 start. The broader research-and-close-game goal remains active and incomplete.

## 2026-11-10 - Existing-corpus secondary casualty checkpoint

Continued with the Computer Use skill in existing saved source005. Normal playback of first-half home turn3/action2 independently displays Catcher3 versus Norse Raider Lineman47, Defender Down/Both Down, defender knocked down, armor8+ [6,4] Success, injury[5,6] Casualty, casualty D16=14+D6=2 Head Injury, then Injured. UI-079 preserves six numeric source records94/0–97/1 and links ResultCasualtyRoll Outcome6 to that label. Action seeking cleared intermediate log entries; replaying the action normally retained the damage chain. No printed jersey number is used as a raw player ID.

Private nested-message scan across27 originals found16 two-die type12 emissions, secondary faces2:2,3:3,4:1,5:4,6:6, no1. Counts include repeated/transformed apothecary question records and cannot be treated as independent attempts. Remaining raw candidates for secondary3/4 are documented without assumed names. Scan and output stay ignored under replays/.analysis/.

Validation: all fourteen source verifiers passed at79 cases /307 step records /6 direct events; unique IDs, numeric projections, deliberate direct-event mutation rejection and public Python compilation passed. Full app checks remain unrun for previously documented environment limits; application code unchanged. Plan, backlog and research docs updated without issue closure or production mapping promotion. BB3 remains paused at source005, home turn3/action2, with Head Injury visible in the expanded log. The full research-and-close-game goal remains active and incomplete.

## 2026-11-10 - Two further secondary casualty labels

The previous goal turn progressed by saving UI-079 Head Injury and documenting the representation-scoped face1 gap. This continuation used Computer Use to load two existing saved files and independently read their loading factions:006 Khorne versus Norse;026 Shambling Undead versus Underworld Denizens.

UI-080: first-half home turn6/action2, Khorngor5 blocks Norse Raider Lineman44; Both Down/Defender Stumbles, defender knocked down, AV8+[6,6], injury[5,6] Casualty, D16=14+D6=4 Broken Arm and Injured. Six source records120/0–123/1 preserve the chain; raw casualty Outcome7, no casualty modifiers. UI-081: second-half home turn12/action11, Ghoul Runner10 blocks Skaven Thrower46; single Defender Down, AV8+[3,6], injury[5,5] Casualty, D16=14+D6=3 Smashed Knee and Injured; ball Bounce8 to[22,2]. Seven source records384/0–387/2 preserve the chain; raw casualty Outcome5, no casualty modifiers. Normal playback retained intermediate log entries that action seeking clears.

Validation: all sixteen source verifiers passed at81 cases /320 step records /6 direct events; IDs unique, numeric-only projections checked, deliberate direct-event mutation rejected and public Python scripts compiled. No runtime or scoring code changed; full app checks remain unrun for the previously documented environment limits. Updated evidence, plan and backlog without closing any issue. BB3 remains paused in source026 at home turn12/action11 with Smashed Knee and Bounce visible. The broader research-and-close-game goal remains active and incomplete; secondary face1, complete tables and additional policy/state evidence remain open.

## 2026-11-10 - Direct installed-image naming evidence

After UI-080/081, read the installed game's executable as a static file and found explicit enum-name pointers followed by numeric values. Added scripts/extract-bb3-enums.py and tests/fixtures/evidence/bb3-installed-enums.json:82 reflected tables /1,428 entries in BoardData and NetGameplay namespaces. Source SHA-256590787b522ad4404b2e8a7570993375114a794fa4288d88a8595ab9dfbd7d6ae,110,167,040 bytes. The extractor validates bounded PE32+ headers/sections, exact ASCII names, unique pointer/value pairings, contiguous stride16 arrays and unique values, preserving name/entry offsets. It neither executes the game image nor reads process memory. Installation bytes were not modified or committed.

Installed snapshot verification passed. Six synthetic standard-library probes passed: nonsequential numeric IDs and offsets, malformed/truncated image rejection, missing pair, ambiguous reference, noncontiguous array and duplicate values. Deliberately changing one saved enum value caused CLI snapshot verification to reject. These checks validate extraction, not complete game-rule behavior. The39 UI table roll rows plus direct-event13/92 observations correspond to compiled names; the two96-entry roll tables agree. UI names such as Rush/Interfere/Projectile Vomit remain distinct from compiled GFI/Interception/VomitAccuracy identifiers. Source020 period2 can now be read as the ExtraTime identifier, pending direct playback corroboration.

The snapshot also exposes namespace differences: NetGameplay StepType34 Bite, SequenceType19 Bite and PitchRemoval5 FriendlyFans are absent in the corresponding BoardData tables; BoardData PlayerStatus8 Invalid is absent in NetGameplay; Weather10 is BoardData COUNT versus NetGameplay DazzlingSun. No global numeric namespace is safe. Added INSTALLED_ENUM_EVIDENCE.md and linked it from the plan, backlog and replay findings. No runtime semantic/scoring changes or issue closures; full application checks remain unrun for the previously documented environment constraints. BB3 remains open at the source026 result screen after leaving playback; the overall research-and-close-game objective is still incomplete.

## 2026-11-10 - Extra Time and direct prayer source verification

The preceding goal turn answered a corpus-mining question but made no authoritative research change. Revalidated the live BB3 window and continued through the Computer Use skill in saved source020. UI-082 preserves the earlier observed Prayers to Nuffle13 / Fouling Frenzy / Drive popup as EventPrayerTable5/6 plus EventAddEffect5/7. No RollType or team identifier is fabricated. UI-083 independently reads away turn11/action9 Pestigor38 versus Runner8: Horns, Both Down/Both Down, attacker Block, Defender Down, AV8+ [1,5] Failure, Prone and Bounce2 to[22,14]. Earlier Skill29 Used1/QuestionDumpOff followed by Used0 remains explicitly raw context: no clearly observed Dump Off decision label is claimed.

UI-084 uses the next-period control to read EXTRA TIME with17-24 buttons, then seeks home20 and waits for its settled log: away end of turn19 / Failed action followed by home Turn nb20, score2-1. BoardState813 is preserved as a complete numeric projection (Period2, GameTurn20/19, CurrentPhase5), with EventEndTurn812 Reason2. Unlike previously observed prematurely advanced counters, this is an actual displayed twentieth home turn. Missing fields are not interpreted as defaults.

The initial source verifier rejected020 at its default15MiB decoded cap, matching the documented oversized-corpus finding. Added an explicit bounded research-only --max-decoded-mib15-32 option, default15; the private checker opts into32 only for020. Three independent probes cover default rejection/explicit acceptance, invalid/unbounded override rejection and exact BoardState mutation detection. All seventeen verifiers now pass at84 cases /327 distinct step records /10 direct records; numeric-only projections, unique IDs and the earlier deliberate direct-die mutation rejection pass. Nine Python research tests and the82-table/1,428-entry installed snapshot verification pass. Full app checks remain unrun for the previously documented environment constraints; no application code changed.

Updated evidence, plan and backlog without promoting runtime mappings or closing issues. Raw sources/private analysis remain ignored. BB3 remains open and paused at source020 home turn20 in Extra Time. The full data-gathering-and-close-game objective is still incomplete; complete policies, missing negative cases, state defaults and held-out acceptance remain outstanding.

## 2026-11-10 - Defender reaction attribution and skill tooltip evidence

The preceding goal turn made authoritative progress with UI-082-084 and a bounded offline verifier option. Revalidated the live game at source020 Extra Time/home20, sought away20 and advanced one observed action at a time. Action6 displays USE DUMP-OFF? for home8 during away46's Blitz. Playback displays home8 using Dump-off, Quick pass3+ die5-2 Accurate (opponent tackle zone-1, Disturbing Presence-1), home6 Catch2+ die6-3 Success (tackle zones-2, Disturbing Presence-1), and home6 has the Ball. Away46 then stands and resumes the block, selects Defender Down from Defender Down/Both Down, knocks home8 down and fails AV8+ [2,1], leaving him prone. Counter6 to7 occurs within this reaction. UI-085 preserves all ten step records604-610, explicitly separating turn owner, initiator, skill owner, passer, receiver and damage subject. The earlier UI-083 decision is not retrospectively labeled.

Exited saved playback and inspected a Nurgle roster read-only. Clicking skill icons exposes persistent text tooltips. Added GAME_SKILL_REFERENCE.md with23 manual paraphrases (GR-001-023): Really Stupid, Disturbing Presence, Foul Appearance, Loner4, Mighty Blow1, Regeneration, Tentacles, Guard, Multiple Block, Thick Skull, Plague Ridden, Block, Horns, Decay, Diving Tackle, Strip Ball, Sure Hands, Tackle, Dodge, Dauntless, Shadowing, Claws and Wrestle. IDs derive separately from EBB3BoardDataSkill; every pair matches the installed snapshot. This route supplies rule conditions absent from sampled rolls, including natural6 for Tentacles/Shadowing, strict greater-than for Dauntless, ST/MA differences, state exceptions and distinct Stunty injury behavior. Short tooltips do not prove full precedence or unspecified consequence policies. No roster/resource changes were made.

All seventeen source verifiers pass at85 cases /337 distinct step records /10 direct records;41 UI-named roll families unchanged. Unique IDs/numeric projections and deliberate direct-event mutation rejection pass. Nine independent Python research tests pass; all23 manual reference IDs are unique and names/values match the compiled table. git diff --check and ignored/untracked raw-source checks pass. Full app checks remain unrun for the previously documented environment constraints; application code unchanged. Updated current plan/backlog/evidence and append-only logs without issue closure.

BB3 remains open on Teams > Templates (currently empty). The full gather-missing-data-and-close-game objective is incomplete. Other skill tooltips, full injury/casualty/referee tables, missing negative cases and source/version/state acceptance remain open. Templates may provide access to remaining skill descriptions; this has not yet been established.

## 2026-11-10 - Existing replay mining and cross-corpus gap audit

In response to the user's question about remaining value in existing files, rescanned all27 private replays and12 demos for direct/nested dice-bearing nodes under decoded sequence StringMessages. Found the previously missing secondary casualty face1 in demo source hash7bef0a74bff43ae56da5edf6abed7d8cb182da85a4da591acb78943afebcbcaf, sequence376/step1/message4: type12 dice[13,1], Outcome6, after modified armor[3,5] and injury[6,5], followed by removal and Regeneration die4/Outcome1. Installed enum6 is HeadInjury; this is raw/compiled evidence awaiting independent UI annotation, not a new UI case. All six secondary faces now have raw examples across the two corpora. Earlier absence statements remain scoped to the27 local files.

Scoped referee search finds two Bribe emissions, both die2/Outcome1; nine Argue emissions with faces2/4/5/6. No failed Bribe or die1 Argue found. Questions/summaries may repeat rolls; counts are emissions and the search excludes top-level events. Private script/results remain ignored. Updated findings and next-ready plan with remaining state/decision/held-out mining priorities. Nine Python research tests and git diff --check pass; ignored audit output verified. No app behavior, issue status or UI evidence counts changed. Full application checks were not run for this research/documentation change. The broader game-data-gathering objective remains incomplete; no game-close action was taken in this turn.

## 2026-11-10 - Demo casualty face1 independently confirmed

The preceding goal turn made authoritative progress by discovering a raw demo casualty face1 and documenting the cross-corpus scan. Revalidated the running game through Computer Use on the new Human research template. Read Dirty Player(+1), then added Pro using6 of its unlimited template SPP and read the owned-skill tooltip. Added GR-024/025: foul armor-or-injury+1 and a Pro3+ gate excluding armor/injury/casualty. Experimental player is level2/value70,000/Pro; pre-existing competitive rosters were not edited. Catalogue hover/drag attempts did not reliably expose descriptions, so do not reuse them as a guaranteed tooltip method.

Hotseat match settings opened before selecting teams exposed no Back control; mouse-back, BackSpace and scrolling did not return to setup. No match started or settings were changed. Quit through the menu, verified the BB3 window absent, relaunched the pre-existing executable and recovered the main menu after startup. The displayed build string was bb3-1-steam-57968; this does not prove equality to replay serialization version. To validate the new raw casualty case, copied the repository demo into the game's local replay folder without overwrite (scoped filesystem write approved), verified SHA-256, then opened it through Saved Replays. This provides a working import route for the repository demos.

UI-086 independently confirms home13/action6 Renegade Ogre versus Zombie Lineman: Bone Head2+ die2 succeeds, Push/Defender Down pool, defender knocked down, Mighty Blow(+1) makes armor9+ [3,5] succeed, injury[6,5] Casualty, casualty[13,1] Head Injury and Regeneration4+ die4 success. Six exact numeric records373-376 retain actor2/damage subject43. A sanitized UI alias is not the raw player ID. Loading faction labels were not captured. Normal playback preserved the full chain; the pause reached action7 with action6 log still visible. Added bb3-ui-demo-009.json and synchronized findings/plan/backlog/UI evidence. All secondary faces1-6 now have separately observed examples across the original corpus and demo; complete distributions/policies remain open.

Validation: all eighteen hashed source verifiers pass at86 UI cases /343 distinct step records /10 direct events, with deliberate direct-event mutation rejected. Nine research unit probes pass. All25 manual skill reference name/ID pairs agree with the compiled snapshot, IDs unique; git diff --check and ignored-audit checks pass. No runtime/scoring code changed or remediation issue closed. Full app checks were not run for this evidence/documentation change. BB3 remains open and paused at the imported demo's home13/action7, expanded log showing Head Injury and successful Regeneration. The full research-and-close-game objective remains active and incomplete; no final closure is claimed by the recovery restart.

## 2026-11-10 - Quantified remaining value in existing files

Answered the user's existing-replay mining question by joining inventory hashes against the seventeen local positive UI fixtures. Independently decoded the ten unmatched source hashes and verified every stored step count:13,004 StepResult emissions total. A direct StringMessage scan preserves37 targeted candidate emissions with private numeric locators. FireballHit48 has Outcome0/1 counts4/4; Chainsaw67 has1/8; Loner71 has5/4; BreatheFire97 has3/5. Interception6 has one Outcome0, Pro15 one Outcome0 and Animosity74 one Outcome1. These are raw emissions under compiled identifiers, not new semantic annotations or deduplicated attempts. The files are source-held-out from positive fixtures, not a pristine blind test set.

Updated findings and plan. Generated held-out-source-inventory.json and held-out-target-candidates.json remain under ignored replays/.analysis/. No application code, UI evidence totals or issue status changed. Full application checks were not run for this documentation/private-triage change. No Computer Use action or game-close action was taken; the broader research objective remains incomplete.

## 2026-11-10 - Controlled failed-bribe and mitigation observations

The preceding goal turn answered the user's corpus-mining question without an authoritative research change. Revalidated the live BB3 window through Computer Use and continued the actual mirrored Human custom-team hotseat match. Blue turn3 AV7+ [3,3] failed but triggered the referee; Bribe2 succeeded, consumed one of three bribes, preserved the player and continued that turn. Blue turn4 Stunty injury[5,4] directly produced Badly Hurt; red's ordinary apothecary changed it to No Injury and was consumed. No casualty-table dice or reroll-choice UI appeared in that branch. Blue turn5's later Stunty injury[4,6] instead proceeded to a separate D16=4 Badly Hurt casualty. The paths must remain distinct.

Red turn7 AV9+ [2,2] failed and triggered the referee. Selected Argue the Call produced die5 Neutral, disabled a further argument for that decision and left bribery available. Bribe1 Failure consumed3 to2 and offered another bribe for the same ejection. The separately selected second Bribe4 Success consumed2 to1 and kept the player. Subsequent turn-end was explicitly Time out, not evidence for a referee-induced turnover. The next red-turn8 foul AV9+ [2,5] failed without an ejection. HOTSEAT_EXPERIMENTS.md preserves HS-001–010, distinguishing the preceding session's setup/fouls from freshly observed cases. No exported replay exists yet for this match; HS references do not increase the86 paired UI cases.

Corrected the active skill reference's description of the Human research roster: it is a custom team under Teams with unlimited game resources, not a saved template. Historical template wording in earlier log entries is retained as history and superseded by this correction. The preceding session recruited eleven more players and configured two rerolls, one apothecary and three bribes in both mirrored match copies; no real-money purchases were made. Read bribe/Argue action descriptions and preserved them separately from empirical outcomes and installed numeric namespaces.

Validation: eighteen hashed source verifiers still pass at86 cases /343 distinct steps /10 direct events, including deliberate mutation rejection. All nine independent Python research probes pass. git diff --check passes; private replay-analysis output remains ignored. No runtime code, numeric replay mapping, scoring contract or issue status changed. Full app checks were not run for this documentation/manual-observation change. Game is paused in first-half red turn8 after HS-010; export, natural1 Argue and the broader data-gathering/close-game objective remain incomplete.


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


## 2026-11-10 02:25 - Source018 Fireball ownership and spell injury
Goal:
1. Mine a previously unpaired local replay for directly observed role, boundary and modifier evidence.

Changes made (files):
1. `tests/fixtures/evidence/bb3-ui-playback-018.json`: UI-089, independently loaded Amazon/home versus Nurgle/away; Fireball4+6 Success/1 Failure/2 Failure, AV10+[6,4] Success and injury[6,2]+Spell1 KO. Preserved four complete numeric steps282/0–3 and four direct events386/1,386/4,388/1,388/3. Visible caster is home; raw PlayerId denotes away victims. Individual hit lines have no subject names and remain ordered raw context. The cast precedes logged away11 End of Turn/home12; top Action9 persists and is not an activation ID.
2. `tests/fixtures/evidence/bb3-ui-playback-013.json`: corrected UI-044 prose that conflated StepType19 with DamageStep Source3. Existing numeric extracts are unchanged. `docs/REPLAY_UI_EVIDENCE.md` makes this correction explicit and documents the new case.
3. Synchronized `docs/PROJECT_PLAN.md`, `docs/REMEDIATION_BACKLOG.md`, `docs/LOCAL_REPLAY_FINDINGS.md`:89 cases/356 distinct step records/20 direct context records across twenty sources (nineteen originals plus one demo);41 named roll families unchanged. Eight originals lack positive UI fixtures. Preserved historical checkpoint counts as historical. No production mapping, scoring contract or issue closure.

Commands run + outcomes:
1. `python -X utf8 replays/.analysis/check-evidence.py` -> all twenty source verifiers pass, globally unique case IDs and numeric-only payloads;89/356/20. Existing direct-event mutation rejected.
2. `python -m unittest discover -s tests/research -p 'test_*.py'` -> nine tests pass.
3. Source018 injury ModifierType21 mutated to19 -> rejected at282/3. Source013 reverified after prose correction ->20 steps pass.
4. `git diff --check` -> passes (line-ending notices only); private mutation artifact is Git-ignored. Full application lint/typecheck/build were not run for research-fixture/documentation-only changes.

Regressions/known gaps:
1. UI transcriptions remain manual; exact extraction verification does not validate their semantics. EventActiveGamerChanged/card events omit GamerId; universal default/ownership policies remain unresolved. No newly generated hotseat replay export exists. The broader data-gathering/close-game objective is incomplete; BB3 remains open and paused at the source018 away11/home12 boundary.

Explicit handoff next steps:
1. Mine source011 Breathe Fire failed branches with changed Difficulty, source019 held-out Fireball threshold face4 and source025 failed interference. Continue policy/state/namespace acceptance, prioritizing data that changes contracts over duplicate examples. Natural1 Argue and raw failed Bribe remain missing.


## 2026-11-10 02:36 - Source011 breath branches and natural-six catch
Goal:
1. Continue gathering missing game/replay evidence; the preceding turn was progress through UI-089 and corrected Fireball namespace prose.

Changes made (files):
1. `tests/fixtures/evidence/bb3-ui-playback-011.json`: added UI-090–093,20 complete numeric steps from a newly paired source. Loading independently confirms Chaos Dwarf/home and Norse/away. Home3/Action9 Flamesmith7 ST3 targets Yhetee37 ST5; kept Breathe fire4+4−Strength1 fails and next home activation10 proceeds. Final Used0/NewRoll0 retains original4; team rerolls stay3. Home5/Action8 actor8 keeps1, becomes Prone, takes own AV10+[6,2] Failure and playback advances away6. Exact end-turn reason remains untranscribed. Successful home2/Action4 breath5 places39 Prone without an armor emission.
2. The next home2/Action5 Blitz supplies an independently visible natural6 Catch: attacker Block converts selected Both Down to defender-only knockdown; armor fails, carrier loses possession, bounces exit and return to pitch, away38 Catch1−5 fails, then home3 Catch6−4 succeeds against base4+ and gains possession. Raw Difficulty6 for both catches is bounded despite different negative sums. Do not impose a modified-sum-only contract or universalize the catch exception across families. Throw-in dice roles are raw geometric context, not independently visible labels.
3. Updated `docs/REPLAY_UI_EVIDENCE.md`, `docs/LOCAL_REPLAY_FINDINGS.md`, `docs/PROJECT_PLAN.md`, `docs/REMEDIATION_BACKLOG.md`: current93 cases/376 distinct steps/20 direct context records across twenty-one saved sources (twenty originals and one demo);41 UI-named families unchanged. Seven originals lack positive UI fixtures. No runtime logic, probability contract or issue closure.

Commands run + outcomes:
1. `python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-011.json` ->4 cases/20 steps pass.
2. `python -X utf8 replays/.analysis/check-evidence.py` -> all twenty-one hashed source verifiers pass; global unique IDs and numeric-only projections;93/376/20; deliberate top-event mutation rejected.
3. `python -m unittest discover -s tests/research -p 'test_*.py'` -> nine tests pass. Deliberate final Catch6→5 mutation rejects at54/8.
4. `git diff --check` -> passes; private raw/mutation artifacts remain Git-ignored. Full application lint/typecheck/build were not run for fixture/documentation-only research.

Regressions/known gaps:
1. Transcriptions remain manual; verifiers prove exact extraction, not semantic correctness. Breathe Fire strength formula, exact natural-one turnover reason, complete natural-roll contracts, state omission/defaults and field/version acceptance remain incomplete. A skill-icon click in playback produced no tooltip; no new rule reference is claimed. Controlled hotseat export remains unavailable. Game remains open and paused at source011 home2/Action5 after the caught return; the full data-and-close-game objective is not complete.

Explicit handoff next steps:
1. Mine source025 failed interference with large modifiers, source019 Fireball face4 if it changes a remaining contract, and the remaining original source hashes. Read Breathe Fire's actual tooltip through Teams if accessible to establish its precise strength and natural-one rules. Continue a finite requirements audit separating missing game evidence from implementation/deployment acceptance.


## 2026-11-10 - Source025 pass chain and finite capture audit
Goal:
1. Mine existing replay files for missing semantic evidence and identify concrete further capture requirements.

Changes made (files):
1. `tests/fixtures/evidence/bb3-ui-playback-025.json`: UI-094, seven complete numeric steps. Independently loaded Elven Union/home versus Skaven/away. Home passer5 picks up6, fumbles Long pass1 with net−1, uses Pass47 and throws Accurate6; away45 fails interference4−4; home4 fails Catch1 and uses Catch6 to replace it with4 Success. Team rerolls stay4/3. Preserved distinct initiator, roller, decision controller, modifier owners and receiver. QuestionInterceptors probability Description2/3 remains unassigned.
2. Updated UI evidence, local findings, plan and backlog:94 cases/383 distinct step records/20 direct records across22 sources (21 originals plus one demo);41 named families unchanged. No runtime contracts or issue closures.
3. Added `docs/REPLAY_CAPTURE_GAPS.md`: separates further game data from engineering/deployment acceptance and prioritizes discriminating cases over duplicate footage. Fresh independent decode recount of six original hashes without positive fixtures finds8,408 StepResult emissions; filtered historical targeted scan retains10 candidates (six Loner, three FireballHit, one Animosity). Private report remains ignored.
4. Breathe Fire reference attempt exposed no Chaos Dwarf among14 creation-menu choices; no team created or currency spent. This does not establish DLC ownership or exhaust reference routes.

Commands run + outcomes:
1. `python -X utf8 replays/.analysis/check-evidence.py` -> all22 source verifiers pass, globally unique observation IDs and numeric-only payloads;94/383/20. Existing deliberate direct-event mutation rejected.
2. Source025 QuestionInterceptors GamerId1→0 mutation -> rejected at293/0.
3. `python -m unittest discover -s tests/research -p 'test_*.py'` -> nine tests pass.
4. Full application lint/typecheck/build were not run for research-fixture/documentation-only changes.

Regressions/known gaps:
1. Exact extraction verification does not validate manual UI labels or prove complete policies. Raw failed Bribe and natural1 Argue remain absent from the scoped corpus scan; hotseat export remains unavailable. State/namespace/version and contract acceptance remain incomplete. BB3 remains open and paused after source025's pass chain; the full data-and-close-game request is incomplete.

Explicit handoff next steps:
1. Use REPLAY_CAPTURE_GAPS to select further cases that change a contract, especially state omission/possession/activation rules. Review the six remaining original hashes for held-out acceptance. Establish a viable raw export route before repeating hotseat-only gap experiments.


## 2026-11-10 - Availability, possession and installed offline data
Goal:
1. Continue the missing-data/game-close objective. Prior turn was progress: UI-094 verified, current-source recount and finite capture audit saved.

Changes made (files):
1. `tests/fixtures/evidence/bb3-ui-playback-025.json`: UI-095/096 add15 complete steps and six direct context records. Crowd removal on Defender Down skips armor, rolls injury[1,4] Stunned and leaves40 off-pitch Cell[-1,-1]/Situation1 despite CanAct1/TackleZone1. A separate away48 Blitz changes Push to Both Down through a team reroll4→3; both armor checks fail and the carrier loses the ball to[4,9]. Before-state Carrier5/IsHeld1 becomes omitted in the after-state; UI independently shows the loose ball. Blanket carry-forward would be wrong. No universal omission policy is asserted. ResultUseAction TeamId0 is not sufficient to identify this away actor's roster.
2. New `scripts/extract-bb3-offline-data.py`, `tests/fixtures/evidence/bb3-offline-rule-data.json`, `docs/OFFLINE_RULE_DATA_EVIDENCE.md`: read two JSON members from the installed rules-engine archive without executing modules. Six static tables/178 rows include105 skills,11 casualty names/effects, five characteristics and46 skill relationships. All121 name/code rows agree with BoardData executable enums after punctuation/case normalization. Archive and member hashes retained; package revision23 is not claimed as replay/client version. Overlapping opaque compiled modules exist in bb3.zip; active load precedence remains unresolved. No mechanics algorithm is inferred from their names.
3. Preserved the existing client log privately under ignored replays/controlled, SHA-25639e452d2ea14e72abd5f2b7bdf31c70baa6b0a0b482293d5141e86a562918857. Four selected UI-log entries corroborate hotseat Bribe2 Success, Argue5 Neutral, Bribe1 Failure, Bribe4 Success. There are no serialized replay dice/step records in that context. Existing QuickSaveSlot predates the experiment; settings/statistics do not establish a matching replay. No save loaded/modified.
4. Updated UI evidence, capture gaps, local findings, hotseat notes, installed enum evidence, plan and backlog:96 cases/398 distinct step records/26 direct records across22 saved sources;41 named families unchanged; six original sources without positive fixtures. No production mappings/scoring or issue closures.

Commands run + outcomes:
1. All22 hashed UI source verifiers pass; global unique IDs/numeric-only projections;96/398/26. Deliberate direct-event, off-pitch CanAct and omitted Carrier mutations reject; changed source025 verifies22 steps/six direct records.
2. Offline-data --verify passes; deliberately changed casualty code rejects. Independent oversized-archive and duplicate-required-member probes reject. Exact121-row enum comparison finds no mismatch.
3. Nine Python research unit tests pass. git diff --check passes; private log and mutation artifacts are Git-ignored. Full application lint/typecheck/build were not run for research-only tooling/fixtures/docs.

Regressions/known gaps:
1. UI transcriptions remain manual. Snapshot checks prove extraction, not semantic completeness. Static effect fields and skill constraints are not probability/action-policy proofs. Failed-Bribe raw replay, natural1 Argue, version/package precedence and supported state/reroll/distribution policies remain incomplete.
2. BB3 remains open and paused at source025 home11 after away10's Both Down/loose-ball chain. The full data-and-close-game objective remains active and incomplete.

Explicit handoff next steps:
1. Use installed JSON casualty effects and exact namespaces to narrow acceptance requirements. Establish active offline package provenance if possible. Mine remaining state/default and role cases that distinguish competing contracts; avoid interpreting CanAct or TackleZone without situation/cell. Preserve the client-log snapshot as UI-only corroboration, not fabricated raw replay linkage.


## 2026-11-10 - Action ownership field audit and hotseat navigation recovery
Goal:
1. Continue gathering missing evidence and then close BB3. Prior goal turn was progress through UI-095/096 and installed static JSON facts. This turn adds corpus attribution evidence and startup provenance; no new gameplay case.

Changes made (files):
1. Added `scripts/audit-bb3-action-team.py` and `tests/fixtures/evidence/bb3-action-team-audit.json`. Directly decoded all27 originals, without app maps:6,342 ResultUseAction emissions all explicitly have TeamId0. Actors map to initial roster index0/1 in3,309/2,920 cases;113 initial memberships are unresolved. Per-source hashes/version/counts and numeric example locators retained. Initial membership is not dynamic recruitment reconstruction; counts are emissions. UI-096 independently supplies an away actor. TeamId alone cannot discriminate sides in this corpus. No substitute attribution heuristic promoted.
2. Added `tests/fixtures/evidence/bb3-offline-package-registration.json`: saved hotseat client-log lines979/980 find and register the examined installed rules archive; path equality, line hashes and archive identity checked. External manifest130 bytes/hash532476cced3f29f5ec19eb78388f6d95e5d9e93a63b4f7eced45c82c132c7642 declares rules revision3; internal manifest declares23. Both retained without equating either to ReplayVersion/client build. This proves discovery/registration, not every import or complete path precedence.
3. Inspected General/Gameplay and skill-display settings without applying settings changes; no replay-recording option found in inspected screens, no Breathe Fire entry between Break Tackle/Cannoneer. Replay player-card icon produced no new description; temporary stadium display toggle restored. Static patch SQL members also proved opaque to a small read; no code/SQL executed or mechanics algorithm claimed.
4. Prepared a new natural1 Argue trial through Friendly Match/Hotseat. Before selecting teams, Match Settings changed to Unlimited time, No Kick-off Event and No Prayers to Nuffle. Its Back control was absent; right-click, Backspace, B and window reflow did not recover navigation. Restored fullscreen. Go Offline recovered the menu but opened the Connection screen and mode-progress notice. Stopped all game input for manual profile connection under Computer Use authentication guidance; async handoff requested. No second match started, no roster selected, no new dice observation. Online/offline team availability/settings must be revalidated after handoff.
5. Updated plan, backlog, capture gaps, UI evidence, local findings, offline-data and hotseat docs. Counts remain96 paired cases/398 steps/26 direct records across22 saved sources; no production changes or issue closure.

Commands run + outcomes:
1. New action-team audit regenerated and exactly matched all27 source counts. Explicit32MiB offline cap needed; default15MiB rejects oversized source, bool/out-of-range caps reject. Deliberate aggregate TeamId0→1 mutation rejected by --verify.
2. Registration log paths, source log hash and two line hashes checked; static external/internal manifest declarations preserved.
3. Nine Python research tests pass; new audit module compiles; git diff --check passes; private corpus/log/mutations remain Git-ignored. Full application lint/typecheck/build were not run for research-only changes.

Regressions/known gaps:
1. Natural1 Argue and raw failed-Bribe linkage remain missing; ownership/state/rule/version acceptance is incomplete. The archive registration is not per-module execution proof. No live process hook, game-code execution or account authentication was automated.
2. BB3 remains running at the offline Connection notice. Manual profile connection is pending. This is a new UI handoff, not a three-turn impasse audit; independent file research progressed. Goal remains active and incomplete, and the requested final game closure has not occurred.

Explicit handoff next steps:
1. After the user completes the profile connection, inspect the actual main menu and roster availability. Continue the natural1 Argue trial; configure teams before reopening Match Settings if needed, and recheck clock/prayer settings. If no handoff yet, continue independent corpus/contract analysis without UI input to the Connection screen.


## 2026-11-10 - Scoped natural-roll arithmetic audit
Goal:
1. Continue the full data-and-close-game objective. The preceding goal turn was progress:27-source action-team audit and startup registration evidence. The profile handoff condition persists for a second consecutive goal turn; this turn completes independent file analysis.

Changes made (files):
1. Added `scripts/audit-bb3-thresholds.py` and `tests/fixtures/evidence/bb3-threshold-model-audit.json`. Independently scanned27 originals plus12 demos for direct ResultRoll records with one explicit DieType0 die, explicit Requirement and binary Outcome0/1, retaining complete direct modifiers.3,822 raw emissions across31 RollType identifiers qualify; questions/nested/top-level/neutral and other dice types are excluded. No deduplication or semantic acceptance implied.
2. Nine exact numeric message projections disagree with die+modifiers>=Requirement: eight natural6 (seven Catch/type7 and one Pass/type5) and one Catch1 with+1. Recorded Difficulty agrees with all3,822 binary outcomes and fits max(2,min(6,Requirement−modifierSum)) in this sample. This is a fitted relationship; it cannot establish every family's natural rule where alternatives remain indistinguishable. UI-093 independently covers one of these records; remaining locators are raw review targets.
3. Preserved specific next UI targets: source016258/1 actor46 Pass6−4 against Requirement4 (also offers an opposing interceptor), source025444/6 receiver40 Catch1+1 against Requirement2 followed by Catch skill6 replacement3 Success in the same step. Raw source025 clock fields show both team turns16; no new UI turn/action label or game-deciding consequence is claimed.
4. Existing executable tables independently name ProbaDescription2 Success/3 Fail, distinct from RollOutcome0 Failed/1 Succeeded/2 Neutral. Added a naming follow-up to UI-094 notes and installed-enum/UI evidence docs, retaining field-binding/version limits. No numeric extract changed and no additional enum table claimed. Updated capture gaps, local findings, plan/backlog. Paired counts remain96/398/26 across22 saved sources.

Commands run + outcomes:
1. New39-source audit regenerates and --verify matches. A separate initial private scanner agrees on3,822 emissions, nine discrepancy locators and their full numeric projections. All selected Difficulty fields present; zero binary/difficulty or clamped-threshold disagreements.
2. Deliberate raw Outcome1→0 mutation is rejected by --verify; bool/out-of-range offline caps reject. Numeric-only projection checks pass; sources deduplicate to39 unique hashes.
3. Source025 UI fixture reverified after note-only change:3 observations/22 exact steps/six direct records pass. Nine existing research tests pass. New module compiles and git diff --check passes; private audit/mutation files are ignored. Full app lint/typecheck/build were not run for research-only changes.

Regressions/known gaps:
1. No new game input was sent: read-only snapshot confirms the same offline Connection/mode notice. Manual profile connection is still pending; the previous handoff request remains unanswered. No new trial, Argue1, exported replay or game closure. The goal remains active and incomplete.
2. Further targeted UI/rule review is needed before accepting the hypotheses. Neutral/binary-only selection, unobserved branch distinctions, source/version limits, ownership/state policies and raw referee gaps remain explicit.

Explicit handoff next steps:
1. Revalidate the pending profile handoff before game input. After manual connection, inspect actual roster/settings availability and continue the natural1 Argue trial or the two targeted natural-roll replay cases. Do not operate the Connection screen or count a raw candidate as a new GUI observation. If the same handoff remains and meaningful independent research is exhausted, apply the goal's three-turn blocked audit rather than repeating status-only turns.

Cross-fixture reconciliation: two of the nine arithmetic discrepancy locators already have direct UI evidence, not just source011/UI-093. Source016351/1 is UI-049's bomb Catch4+6−3 Success before Explosion; source01154/8 is UI-093's ordinary-ball Catch4+6−4 Success. Seven other locators remain raw review targets. No new UI case is counted; avoid recapturing UI-049 as though it were unobserved.

## 2026-11-10 - Revalidated profile-connection blocker

Goal continuation audit: the preceding turn reproduced existing research audits and nine research tests but added no semantic evidence. A fresh Computer Use window inventory and screenshot confirm BB3 remains running at the Connection screen, with the Online/Offline progress notice over the offline profile controls. The pending manual profile-connection handoff has persisted for at least three consecutive goal turns. Computer Use guidance explicitly forbids automating user authentication dialogs. No input was sent to the connection screen, no new trial was started, and the game was not closed because the requested data collection remains incomplete. The goal is blocked pending the user dismissing the notice and connecting the profile to reach the main menu. Existing raw-linked failed-Bribe/natural-one Argue gaps and precise natural-roll UI targets remain open; rerunning existing audits does not satisfy them.


## 2026-11-10 - Offline saved replay and natural-one Catch observation

Offline handoff follow-up (2026-11-10): the user connected the local profile manually. A fresh main-menu observation confirmed the handoff cleared. My Teams is disabled in offline hotseat setup; default rosters transition directly from Chaos Chosen to Chaos Renegades in the inspected portion, providing no Breathe Fire reference through that route. No match was started. Profile → History → Saved Replays remains available offline and successfully loads source025. UI-097 independently displays away16 Action2: Quick pass4+ die5 Accurate, Catch2+ die1+Diving Catch1 Failure, Catch skill replacement3+1 Success, then receiver possession. Reroll counters stay1/1. Three exact records444/0,5,6 bring totals to97 cases/401 steps/26 direct records across22 sources. This closes the UI-transcription gap for that specific arithmetic counterexample, not its broader supported rule contract or a production issue. Source016258/1 Pass6 under negative modifiers remains the next discriminating target; raw-linked failed-Bribe and natural1 Argue gaps remain open. The previous profile handoff is resolved; the game remains open with saved-replay analysis resumed.


## 2026-11-10 - Natural-six Pass and activation-loss state evidence

Source016 follow-up (2026-11-10): UI-098 independently displays away8 Action9 Long pass4+ die6-4 Accurate, with Long pass-2 and grouped Disturbing Presence-2. Home interceptor10 then fails Interfere4+ die5-8 (accuracy-3, four tackle zones-4 and Disturbing Presence-1); Bounce2 lands at[6,9] and home8 starts. Four exact steps and five direct context records retain the pass/response, role ownership and held/intermediate/loose ball states. Intermediate309/5 retains Carrier46 after the pass while IsHeld is omitted and the ball coordinate differs from the passer's cell; Carrier alone is not sufficient held-possession evidence. UI-099 adds two separately selected Foul Appearance2+ die1 failures (away Actions5/6), followed by different teammates acting during the same turn. Five exact steps/four BoardState records preserve each actor's explicit CanAct1 to omission transition, subject-owned Skill10, unchanged cells and continued team turn. Omission is not promoted to a universal false/default rule. Current totals99 cases/410 distinct steps/35 direct records across22 saved sources; six original hashes remain unpaired. The source016 numeric verifier passes; deliberate pass-Outcome and intermediate-Carrier mutations reject; global ID/locator recount passes. No runtime mapping, rule contract or backlog issue is closed.


## 2026-11-10 - Completed offline hotseat export probe


Offline export follow-up (2026-11-10): HS-B used two default Black Orc teams in offline local hotseat, bought no inducements, and finished normally0–0 after both sides ended turn16. The results view exposed no Replay/Download control. At15:38:14Z the replay directory remained28 files with unchanged newest write/length. The temporary Hold→Toggle input test was restored to Hold; pitch selection remained unresolved while menu/End of Turn worked. See HOTSEAT_EXPERIMENTS for setup and limits. No new raw replay, paired case, runtime mapping or issue closure resulted. Raw-linked failed-Bribe/natural1 Argue remain blocked on a viable capture route; existing-file research remains possible. Current paired totals remain99 cases/410 steps/35 direct events across22 sources. The game is open and the full data-gathering objective remains incomplete.


## 2026-11-10 - Research backup checkpoint

User requested the replay findings be committed and pushed to preserve the work. Checkpoint scope: ignored-corpus policy, sanitized numeric/UI/installed-data artifacts, six bounded research tools, research tests, and accumulated handoff/experiment documentation. Raw replays, client logs, executable/archive files, generated toolchain/dependencies and in-progress runtime changes remain local. All22 source verifiers pass (99 cases/410 steps/35 direct events); nine research tests pass. Fresh action-team and threshold audits reproduce27 sources/6,342 action records and39 sources/3,822 eligible threshold emissions/nine arithmetic disagreements. Installed-image82-enum/1,428-entry and static JSON178-row verifiers pass. Sanitized JSON privacy scan checks27 files for account/name/GUID fields; no raw original replay filename or credential appears in the selected research docs/tools. Git origin is the intended Brandon-Born/nufflizer repository; fetched master matches the local parent654a85b. Runtime semantic edits are intentionally excluded from this checkpoint because validation is still underway. This backup does not close the analyzer goal or any open semantic issue.


## 2026-11-10 - Verified numeric check runtime contracts

Issue(s): NUF-007/009/012/013 remain in_progress; no issue closed. Research parent: `34fc68421a1371bb66e14f072160b33fedca26b0`, independently verified on GitHub master by a fresh fetch after the authorized Mac transport. No unfinished runtime edits were included in that research push.

Implemented model `dice-only-3` (schema remains 2.0):

1. Core ResultRoll identities/categories now agree with playback and installed naming evidence: Rush1, Dodge2, Pick up4 and Catch7. Corrected action2 Block/action3 Blitz and movement/catch/pass containers. Really Stupid34/Foul Appearance37/Loner71 are correctly named but remain excluded policies. Other historical labels are not globally accepted.
2. Numeric admission is restricted to replay1-4-0-0, explicit NewRoll1, initial Status1 (or a verified team replacement), effective Difficulty2..6, explicit binary Outcome, one explicit type0 D6 and resolved ownership. Contradictory faces/outcomes/targets, malformed dice and unmodeled replacements do not supply odds. Base Requirement and integer modifiers must reconcile when present. Catch-only natural-one/six edges are backed by UI-097/UI-093; the equivalent outside-range generalization is excluded for other families.
3. ResultUseAction.TeamId stays in the raw payload but no longer supplies actor ownership: the 27-source audit has6,342 zeros across both rosters, including2,920 actors on roster1. UI-006 exact raw fragments now retain away ownership without a fabricated conflict.
4. Full team reroll linkage requires matching actor/step/target/family/gamer/targets/modifiers, explicit available/used choice, valid failed original D6/Status1/NewRoll1/Outcome0, and a fresh Status2 replacement. Skill usage/new declarations interrupt that simple policy. The question die is retained. UI-014 recipient Catch has8/9 odds exactly once. Loner/Pro/skill policies and resource consumption remain incomplete.
5. Added24 independent numeric regression cases using exact sanitized replay projections through the production parser/scorer, across sources001/011/025. Cover Rush success/failure separate from Dodge/self-damage, Titchy Dodge, Pickup/Sure Hands exclusion, recipient team-rerolled Catch, Catch natural1/+1 and natural6/-4, replay versions, freshness, malformed originals, conditional gates and contradictory thresholds. Updated obsolete mapping assertions. CLI parity invokes the actual Node/tsx CLI entry directly so Windows command-shim lookup does not fail before the CLI starts.

Validation: workspace-local SHA-verified Node22.23.4, pnpm9.0.0, frozen lockfile install; no package/lockfile changes. Lint and typecheck pass. Final full unit run:215 tests/34 files pass (49.06s), including shared-parser legacy suites and CLI/API parity. Nine Python research tests pass. Production worker/Next build passes. Four Chromium Playwright flows pass (7.6s), including real BBR upload, filter/export/reset, invalid/hosting responses and cancellation. The first browser attempt lacked the required Chromium1254; installed the matching headless binary under ignored `.generated/playwright`. The next attempt exposed the obsolete four-event ball-handling assertion; an independent Python decode counted eight fresh initial Pickup/Catch results plus the question335/4/2 -> used336/0/0 -> Pickup336/0/1 chain, totaling nine supported records. Updated that exact expectation and model3 export assertion; all four flows then passed against the production build. `git diff --check` passes; local replays, generated tools, dependencies and test outputs remain ignored.

Commands: `corepack pnpm lint`; `corepack pnpm typecheck`; `corepack pnpm test`; `corepack pnpm test:e2e` (production build passed, browser failures diagnosed above); `corepack pnpm exec playwright test` (final four pass); `python -m unittest discover -s tests/research -p "test_*.py"`; `git diff --check`. Tests/build used normal host execution because sandboxed esbuild cannot read its Windows ancestor path. Local toolchain/cache paths stay inside ignored `.generated`.

Limits: partial dice units only, no contextual impact/win model, no whole-match comparative verdict, no block/damage/referee promotion and no claim of complete skill/causal/resource accounting. Paired failed-Bribe/natural1 Argue evidence is still unavailable. Both completed hotseat export probes are documented and are not being repeated as a prerequisite for independent implementation. The game remains open. Runtime checkpoint publication is separate from the already verified research commit; this entry does not claim that runtime code is remotely published.


## 2026-11-10 - Observed board-state checkpoints

Issue(s): NUF-008/013 remain in_progress; NUF-016 moves open -> in_progress. No issue closed. Parent runtime f52189727c76121f992ffd7302d9b10140f640b8 is now independently verified on GitHub master after authenticated, exact-bundle transport through Invictus; do not repeat that push. This subsequent checkpoint is tracked separately.

Implementation: added the pure src/domain/replay/boardState.ts observer and strict lastBoardCheckpointBefore lookup. Ordered extraction observes only direct ReplayStep/BoardState and NotificationGameJoined/InitialBoardState records and exposes compact ReplayModel.boardCheckpoints through the production parser. Capturing a checkpoint does not add a random event, change source IDs or alter existing Carrier emissions. Locators retain one-based ReplayStep/zero-based direct-child index and afterSourceIndex. Nonmatching versions retain unsupported/null state. Every snapshot replaces previous observations; absent zero, false, cell axis, carrier, held, movement or availability fields remain null. Numeric-only projection avoids copying private/arbitrary payload strings. Team count, per-team64-player observation cap and checkpoint count bound normalization independently of XML/worker limits;64 is a work cap, not a legal roster size.

State evidence: UI-095 off-pitch[-1,-1]/Situation1 can retain CanAct1 and TackleZone1, so no legal useful-activation total is inferred. UI-096 held carrier5 becomes absent Carrier/IsHeld, which clears held evidence without assuming a universal loose-ball default. UI-098 intermediate Carrier46 has no IsHeld and a different ball cell, so it remains unknown possession. UI-099 actor44 loses explicit CanAct/MovePoint while teammate45 remains CanAct1; omission is not universally false. UI-084 retains Period2/TurnsPerPeriod8/GameTurn20 and19 rather than wrapping clock values or inventing remaining turns. Held evidence requires an explicit flag, unique current-snapshot holder, matching complete coordinates and in-bounds position without an explicit nonzero situation; contradictions and duplicate IDs are observable issues. Last-observation lookup uses strict < event index, never future state, and does not claim an intervening-message reducer.

Validation (workspace-local Node22.23.4/pnpm9.0.0): corepack pnpm lint and typecheck pass. Final full unit run228 tests/35 files passes (50.46s), including13 new exact-fragment/adversarial state cases and all shared-parser legacy suites. corepack pnpm test:e2e passes its production worker/Next build plus all four Chromium browser flows (7.3s). Original-source verifiers pass for016 (7 cases/31 steps/9 direct records),020 (4/17/4) and025 (4/25/6), using --max-decoded-mib32 for offline verification only. Application size limits are unchanged. git diff --check passes. No new raw fixture, UI observation or private corpus file was added.

Game-dependent audit: collection remains incomplete independently of software status. Needed future playback should discriminate supported action/turn, omission, role, skill/choice and damage/recovery policies, not fulfill an arbitrary quota of duplicate files. The six unpaired source hashes are an evidence opportunity. Neither failed hotseat-export experiment will be repeated. A raw-linked failed Bribe/natural1 Argue still needs a viable capture route before those branches can be supported. Current concrete held-out target: source009 sequence221/step0/message0, ReplayStep282, player39 Dodge4+ die3, self-armor, EventEndTurn282/2 Reason2, before/after BoardStates281/3 and282/8 with turns6/7 ->7/7. Independent standard-library decode selected this candidate; no UI label is claimed. Other early failed Dodge candidates in that source were rejected as targets because a successful Dodge-skill replacement continued the turn.

Computer Use: re-read the bundled skill/guidance/API/confirmation rules, selected the unique returned BB3 window and captured its current state. A Windows Security firewall prompt for codex overlays the completed hotseat results. No security prompt or permission input was automated. Requested the user dismiss it with Cancel; replay navigation waits on that handoff while independent coding continues. Current game window remains open. This prompt is a playback-only blocker, not a reason to pause all implementation or mark the analyzer complete.

Remaining: reconstruct exact pre-roll state from checkpoints and intervening actions, verify legal useful activations and removal/recruitment/omission/phase/resource rules, derive counterfactual successor states and causal contributions, then expose independently validated contextual explanations. Checkpoints currently remain internal to the replay model and do not change report schema/model, dice scores or verdict abstention. See STATE_RECONSTRUCTION.md and REPLAY_CAPTURE_GAPS.md.

## 2026-11-10 - Retained originals after declined team rerolls

Issues: NUF-007/012/014/021/022 remain in_progress; no whole issue closes. User request: pull latest and continue implementation. The clean `master` working tree fast-forwarded from654a85b to8cd5cb8 via its configured `nufflizer/master` upstream. The unrelated legacy `origin` was not pulled or pushed. New implementation remains uncommitted.

Reproduction and independent expectations:
1. Added a regression replaying the existing exact sanitized UI-022 source002 fragment through the production parser/scorer. It failed before the fix: Pickup3+ die2, explicitly kept after declining a team reroll, had null probability/outcome and was excluded. The original fresh Status1/NewRoll1 die is embedded in QuestionTeamRerollUsage; Used0 is followed by Status1/NewRoll0 with the same die. Expected: one failed attempt at2/3 success probability, without full-reroll odds.
2. Independent Python standard-library decoding (existing inventory decoder, no application maps) identifies two additional retained demo1 ball-handling attempts: Pickup4+ die3 at question sequence60/step0/message3 -> Used0 at61/0/0 -> kept61/0/1; Catch5+ die3 at question61/2/0 -> Used0 at62/0/0 -> kept62/0/1. The latter has Requirement3 and two−1 modifiers. Fair-D6 arithmetic gives1/2 and1/3 respectively, not full-reroll probabilities.

Implementation:
- `src/domain/nufflizer/rerolls.ts` links valid failed original evidence to an exact kept summary using actor/team, explicit step/target, roll family, explicit integer gamer, effective/base threshold, modifiers and die identity. Only matching continuation PlayerStep records may intervene. Unknown messages, controller/turn changes, actions and conditional skills invalidate the simple policy; repeated choices reject. Questions are consumed once. Same-step independently emitted originals suppress another kept or combined-reroll contribution; general action deduplication remains incomplete.
- `numericCheckContract.ts` admits NewRoll0 only through that verified retained-original link; version, numeric, natural-roll, attribution and outcome checks still apply. `analyzeLuck.ts` keeps originalDice/question/policy provenance for admitted and excluded linked records. Declined choices never enable reroll-adjusted odds. The source ID remains the final kept summary's locator, not a claim of newly rolled dice.
- Runtime report model changes dice-only-3 -> dice-only-4; strict shared schema, browser export and contract expectations agree. Schema2.0, weights, upload limits and the4-second execution deadline are unchanged. Prior models reject rather than being silently reinterpreted. No block/damage/referee or new skill contract is promoted.
- Added34 adversarial numeric/identity/choice/interrupt/duplicate-boundary tests plus the exact UI-022 regression. Corrected an old synthetic reroll test to include explicit gamer IDs and a nonfresh declined-result flag consistent with the independently observed chain. Browser export checks the two independently decoded demo1 attempts; original fresh records and the existing linked replacement yield11 ball-handling records in total.

Validation (Node22.17.1, pnpm9.0.0; existing installed lockfile dependency set unchanged):
1. `corepack pnpm lint` and `corepack pnpm typecheck` pass. A first typecheck caught a possibly undefined payload after extending the freshness guard; an explicit payload guard fixed it before build/browser validation.
2. Final `corepack pnpm test`:263 tests in36 files pass, including legacy/shared-parser, API/CLI parity, execution/cancellation, report-contract and all new retained-original regressions.
3. `corepack pnpm test:e2e` completed the production worker/Next build successfully. The first browser launch lacked the default-cache Chromium1254; reused the already installed matching binary at `/tmp/nufflizier-remediation-browsers` without downloading or changing dependencies. Sandboxed localhost binding returned EPERM; the normal execution escalation allowed the local test server, with no automatic-review rejection.
4. `PLAYWRIGHT_BROWSERS_PATH=/tmp/nufflizier-remediation-browsers corepack pnpm test:e2e`: final production rebuild and4/4 browser flows pass (4.5s for the browser suite,3.0s for real upload). The final source-step duplicate guard includes an intervening-family regression, and all263 unit tests pass. An earlier standalone browser rerun passed in3.8s. An earlier run rendered the4-second analysis-timeout error during the real upload; it was not hidden by increasing the deadline or adding retries. Two isolated demo1 worker/serialization observations were1702ms/1697ms; a subsequent unmodified browser run passed (real upload flow2.4s). The timeout was not reproduced in those checks; CPU/load sensitivity remains a limit, not a proven production guarantee.
5. Browser plugin not available; used the repository Playwright workflow per the frontend testing skill. Tested `http://127.0.0.1:3000/nufflizier`, desktop1280x720 and mobile390x844. Page identity, meaningful content, absence of a framework overlay, no real-upload page/console errors, upload -> partial report -> filters/detail -> JSON export -> reset -> insufficient report, schema/hosting errors and cancellation pass. Inspected `/tmp/nufflizier-contract-desktop.png` and `/tmp/nufflizier-contract-mobile.png`; content is legible with no visible overlap. Screenshots are temporary QA artifacts, not committed inputs.
6. `git diff --check` passes. Updated plan, backlog notes, report/state contract and append-only migration/execution logs. Stable IDs/dependencies/issue acceptance criteria are preserved.

Remaining: full skill/Loner/Pro/choice/resource and repeated-question/action policies (NUF-012/014/018), core block/damage roles/distributions, exact pre-roll state and contextual counterfactuals, deployed Vercel behavior and shared abuse controls. This bounded fix adds observed dice evidence; reports still abstain from whole-match comparison. No commit, push, deployment, external message, new capture or private replay persistence was performed.

## 2026-11-10 - Commit and push of retained-original reroll remediation

User request: commit and push the completed changes. Target: current `master`, configured upstream `nufflizer/master` (`https://github.com/Brandon-Born/nufflizer.git`); the legacy `origin` remote is not the publication target. Commit: this commit (see Git history); parent8cd5cb8. This publication record supersedes the preceding session's uncommitted status.

Pre-publication review: refreshed `nufflizer/master` and confirmed no divergence; reviewed the15-file source/test/documentation inventory and `git diff --check`. The new retained-reroll suite is included; generated bundles, screenshots, dependencies and private replay inputs remain excluded. Final source already passed lint, typecheck,263 unit tests/36 files, production build and4 browser flows, as recorded above. Only publication documentation changed after that validation. No additional issue closure or deployment acceptance is claimed; push result is reported separately after remote confirmation.

## 2026-11-10 - Block, armor, context and shared quota checkpoint

User request: finish the remediation backlog. User selected a separate Nufflizier preview, restored CI for verification and selected a new free-tier shared store if available. Created codex/backlog-remediation from764ca58, re-enabled the repository's manually disabled CI and verified it active, and created the dedicated Vercel nufflizer-preview project. No changes to legacy bb-trainer or production aliases.

Implementation and independent evidence:
1. NUF-007 done: exact bounded single-D6 and 2D6 contracts; independent enumeration, multi-die/unknown-type/outcome/target/modifier regressions and failure guards. Block and reroll policies retain their separate owning IDs. Existing independent playback cases and the new armor checks validate arithmetic and perspective; changed build rejects prior model versions.
2. NUF-008/009/010/011/013/014: exact source locators and parent step IDs; corrected scoped roll/step/action labels and direct recovery visibility. Independent 12-demo raw inventory counted14,272 steps,33 encoded message/type pairs and77 direct recovery dice. UI-068/059/061 exercise one/two/three dice and attacker/defender choice, UI-020 rejects duplicate Loner pools, UI-071 isolates Brawler's fresh index, and UI-073 retains Wrestle resolution. Demo1 question6/4/0 -> selected7/0/0 -> outcome9/0/1 confirms [Push, Stumbles], chosen Stumbles, applied outcome6 and raw5/9 favorable chance. Split Carrier snapshots do not create or break the block action. Raw distributions remain distinct from skill-conditioned tactical outcomes.
3. UI-009, UI-015 and the original player-50 fragment prove subject-oriented armor. Player50's own [1,6] against6+ now contributes -10/36 instead of positive or suppressed armor luck. UI-015's three pre-roll foul assists produce effective5+; ambiguous subjects, contradictory outcomes and post-roll modifiers are excluded. Injury, casualty and mitigation distribution acceptance is open.
4. NUF-016–021: pre-roll checkpoint reduction applies only reconciled moves/declarations and invalidates unverified mutations. Mobility-possession-1 preserves unknowns and computes scoped signed context contributions under recorded terminal team reroll policies. Independent synthetic expectations: failed2+ non-carrier Dodge with two moves left gives -5/3 vs zero with none; marked Pickup has three of eight exposed bounce squares and produces -3.65 rounded units. Future snapshots and repeated summaries cannot affect these estimates. UI/CLI separate observed clock, dice and context; late deciding actions, exact real state, complete causal accounting and calibration remain open.
5. NUF-023/024: production Vercel requires a shared gate, with a fixed ten-upload window, two expiring leases, no request identity/forwarding headers, bounded backend time/reply and fail-closed pre-read handling. Real Redis7.4.12 integration passes with independent handlers, TTL and spoofing checks. Preview is separate and pending exact deployed checks. No paid resource authorized.
6. NUF-022/026/027: README, report/state/ingestion contracts and ledger distinguish scoped acceptance from remaining work. CI now runs the quota integration in addition to frozen install/audit and production browser coverage. Committed CI and deployed evidence are recorded separately.

Validation: Node22.17.1/pnpm9.0.0, lint/typecheck,293 unit tests/39 files, real Redis7.4.12 integration, production Next build and5 Chromium flows pass. Browser plugin unavailable; repository Playwright verified real sanitized demo1 upload/filter/export/reset, exposed pickup with synthetic complete pre-roll evidence, invalid/hosting errors, malformed success and cancellation. Two original tests that had endorsed missing block/armor scoring were changed to assert independently decoded dice and signed results; no unknown variants were promoted. No deployment verification or release-gate closure is claimed in this checkpoint.

## 2026-11-10 - Restored CI setup correction and preview store readiness

The restored CI run42913607654 on9f28dfb failed before installation because pnpm/action-setup was configured with both workflow version9 and packageManager pnpm@9.0.0. Removed the conflicting workflow input; the exact manifest pin remains the single source of truth. The runtime candidate is unchanged. All12 sanitized demos ran through the remediation probe without unexplained failures; declaration/whitespace variants agree, junk rejects, and the zero-event fixture abstains.

Stripe Directory and the upgraded Projects catalog identified an explicitly free Upstash Redis option; Projects was unauthenticated and Vercel's native Marketplace flow required account-owner terms acceptance. No Marketplace terms were accepted or paid plan selected. The authorized separate preview uses Upstash's documented free72-hour no-signup store for verification. Preview-only sensitive variables were configured without exposing their values. The hosted Redis readiness check verified real atomic acquire/release and shared slots; full Vercel worker and deployed admission checks are recorded separately. A durable free store would require accepting the Marketplace terms or connecting an existing store before the temporary store expires.

## 2026-11-10 - Preview packaging, target guard and parser work bounds

The CI retry on5901f18 installed pinned dependencies and passed audit/lint/typecheck/unit/real-Redis/build, but the real BBR browser step did not render a report on the Linux runner. Added an assertion of the upload HTTP status and error code before waiting for the report. Reduced redundant parse work without extending the4-second worker deadline: validate the immutable outer XML once before both trees, project only numeric checkpoint fields and retain ordered Ball/Bomb carrier markers without traversing full roster data. Every result in the12-demo and five formatting/invalid/insufficient probe run agrees before/after; the focused safety/state checks and final local verify (293 unit tests, Redis, production build, five browser flows) pass.

The first Vercel build omitted tests but kept a research-only TypeScript script that imports them. Excluded research scripts from the deployment package and built the same filtered source locally. The failed build was also classified production despite the requested preview target; the [Vercel first-deployment note](https://github.com/vercel/vercel/pull/17206) confirms this platform behavior. The artifact is Error, not a working deployment; no analyzer or Redis credentials were published to production. Added opt-in NUFFLIZIER_REQUIRE_PREVIEW=1 to reject any production/missing-target verification build before bundling. The guard rejects a production test input and admits the preview variant locally. A successful preview and hosted request checks remain to be observed.

## 2026-11-10 - Hosted quota and real replay timeout

- NUF-024 closes: on the isolated Vercel `nufflizer-preview` project, Preview deployment `dpl_BRoVFZLMuyVEBrpfs6p8FURqnNNu` (source `5461b45`) returned HTTP 503 `BUSY` with Retry-After 1 while two independent clients held Redis leases. After ten shared admissions, the hosted POST returned HTTP 429 `RATE_LIMIT` with Retry-After 57 despite a forged forwarding chain. Neither hosted check needed a valid body. Local independent-handler integration also checks expiry, bounded storage, and fail-closed unavailability. The authorized free Upstash store is temporary (72 hours); only Preview is configured, and expiration fails closed. No replay data is sent to Redis.
- NUF-023 remains in progress: the same Preview returned 200 for the page and 410 for the disabled legacy endpoint. A 4,000,000-byte incomplete XML file reached replay validation (400), a 4,000,001-byte file hit the typed application limit (413), and a 4,550,000-byte file hit Vercel's plain-text 413. The real 649 KB demo timed out with typed 504, also reproduced in fresh Linux CI run `42915674495` after all earlier steps passed. NUF-026 remains open pending a passing exact-source run.
- CPU profiling found the largest cost was the two XML trees. Primary analysis now skips direct replay steps in the unordered metadata parse when ordered steps and top-level teams are available. Full validation still precedes either parse; legacy inputs and fallback metadata paths keep the full tree. The 12 demo replay models match the full parse after excluding raw XML and timestamp fallback IDs. Demo1's local parse fell from 1,328 to 805 ms, and its measured local report was 1,097,298 bytes. The execution deadline, heap, response cap, and report model are unchanged.

## 2026-11-10 - Skill rerolls and ordered snapshot projection

- NUF-026 closes. Restored GitHub CI run 42917235073 at d669cd5cd425a4ce9cbb5a9b80ba03368aaaadda completed the frozen Node 22/pnpm 9 install, production dependency audit, lint, typecheck, 295 unit tests, real Redis integration, and five browser flows against the production build. A separate temp-directory install with deliberately changed Zod manifest specification and unchanged lockfile failed with ERR_PNPM_OUTDATED_LOCKFILE.
- NUF-023 remains open at d669cd5: isolated Preview dpl_F7qQQAkmvzYfTPtTVZbnjhiBLXy9 accepted a valid 4,000,000-byte XML (200, no scored evidence); 4,000,001 bytes returned the application's 413, and 4,550,000 bytes returned Vercel's plain-text 413. The page and legacy retirement returned 200 and 410, respectively. Both demo1 and demo7 still returned the typed 504 deadline on this Preview, even though Linux CI passed the real browser upload. The primary ordered parse now projects out unconsumed fields inside direct replay board snapshots after validating the original XML. It retains sibling positions, consumed fields, Ball/Bomb Carrier order, and original validation. Numeric character references bypass pruning and still go through codepoint validation. Legacy raw parsing keeps the full tree. All 12 projected demo models agree with the full parse apart from raw data and timestamp fallbacks; focused tests cover XML comments/CDATA, quoted tag characters, locators, and invalid references in unused fields.
- NUF-012 advances without closure. Independent UI-002 (Pickup3+ die1 then die1 with Sure Hands, followed by a bounce), UI-028 (Dodge3+ die2 then die4), UI-094 (Catch2+ die1 then die4), and UI-097 (Catch2+ natural1 despite Diving Catch+1 then die3) give the supported skill chains. Same step, actor, roster owner, exact roll/threshold/modifiers and a fresh second die are required. The final outcome is scored once at 8/9 or 35/36 under the corresponding one-skill-reroll policy; the original remains linked evidence. Explicit team resource cost and source IDs are exported, with the observed policy visible in UI and CLI. Conditional or mixed chains and turn-wide totals are still unsupported. Independent stdlib XML decode identifies demo1 Pickup at sequence86/step1/messages2–4 (1 then 4 at 3+) and Dodge at sequence162/step4/messages0–2 (1 then 3 at 2+). Browser export asserts the former. The model is now dice-only-6, with the existing context model still restricted to its separately verified team policies.

## 2026-11-10 - Hosted replay acceptance and conditional recovery

- Deployed commit 2ebd2eaa72eeb219ca8ec33dfb023fdb8d5bc05d as Ready Preview dpl_8qa2kCNcrtHn64SKbhNetdv57LUv. It returned 200 for demo1 (11.33 MB decoded, 1,100,455 response bytes, 613 report records, 4.37 s end to end including upload) and demo7 (11.46 MB decoded, 919,094 response bytes, 535 records, 3.97 s end to end). Both returned a partial-analysis verdict, with no luckier-team claim. Demo1's Sure Hands check exported 8/9. The four-second worker deadline and heap cap remain unchanged. The earlier exact file-boundary and text error checks passed. NUF-023's hosted criteria pass; the ledger retains the NUF-021 integration dependency. GitHub CI 42918579543 passed for this exact commit, as did local verify with 303 tests, real Redis, production build and five Chromium flows.
- NUF-011 advances with conditional Regeneration. Source001 UI-068 and source027 UI-054 independently identify skill19 after same-step casualty/removal and a 4+ D6: 6 succeeds and 2 fails. Demo009 UI-086 independently records 4 succeeding after a two-die casualty table. For the tightly matched damage step and unique roster subject, recovery is a separate half-probability chance scored as +0.5 or -0.5 before category weight. Casualty/removal source IDs remain auditable; the initial removal does not determine final availability. Unlinked, stale, duplicate or contradictory recovery records remain unsupported. Injury/casualty distributions and other mitigation remain open. Dice model advances to dice-only-7.
- NUF-008/013: separate Ball and Bomb snapshot carrier markers, with repeated snapshots carrying no turn-ownership votes. An explicit Ball carrier -1 clears the known holder and omitted carrier fields do not perpetuate the last observation. The ordered evidence is retained; the state reducer consumes each checkpoint once instead of interpreting marker copies as new transitions. Broader direct damage/phase transitions and stable role attribution remain open.
- Final local verification for conditional recovery and carrier attribution: `corepack pnpm verify` passed lint/typecheck, 312 unit tests in 39 suites, the real Redis integration, the production build, and all five Chromium flows. The full replay export still checks the 11 independently traced ball-handling entries and the linked first block. The exact final GitHub and Preview runs are reported separately.
- Ready Preview dpl_Ch7BQfMX4onrbLVjDhBC7Lvwsbk4 at 50a540a37772011eb9e3221be6df55dbf773c8dd returned model dice-only-7 on demo1 and demo9 (HTTP 200, 1,105,517 and 1,012,401 response bytes). Demo1 exports 11 ball-handling records and Sure Hands at 8/9; demo9's independently identified UI-086 Regeneration succeeds on die 4 at 1/2. All 12 demos passed the final local service corpus run with abstaining verdicts. GitHub 42919922384 caught evidence-document pairs dropped in a prose edit after the local suite; restored the explicit source/type pairs and reran the 12-demo inventory checks successfully. This follow-up changes documentation only.

## 2026-11-10 - Apothecary dice and observed decisions

Started on clean codex/backlog-remediation at 8a695651e7b999a22e8baa8be13e6520f5c52898, verified against GitHub before editing. NUF-011/013/014/018 advance. The previous report skipped the Apothecary usage and choice records, losing dice embedded inside the questions. Independent stdlib decoding counted 13 usage questions, four replacement choices and 13 decisions in the 12 demos.

The report records the usage question's original and the choice question's fresh dice, excludes the copied original from the denominator, and keeps an exact matching direct original in the same damage step once. The applied result requires matching damage subject, source, cell, ordered continuation, gamer and removal evidence. UI-060 proves that the copied outcome can be rewritten. UI-064, UI-065 and UI-066 verify treatment without fresh dice, a retained original after spending the resource and an applied replacement. Demo3 independently corroborates a declined original and a replacement across readiness and timer messages. Unsupported/mismatched continuations remain visible with unknown odds and no resource or outcome inference. This does not establish full injury/casualty odds or later player availability.

The existing preview uses the temporary free Redis REST store, expiring November 13. For a durable preview, the account owner needs to provide or attach an authorized Redis REST store supporting Lua EVAL, set its HTTPS endpoint and token in the separate nufflizer-preview project's Preview-scoped server variables NUFFLIZIER_QUOTA_REDIS_REST_URL and NUFFLIZIER_QUOTA_REDIS_REST_TOKEN, and redeploy a Preview candidate to retest 429 and backend failure. Keep credentials in Vercel's secret configuration.

Local corepack pnpm verify passed lint, typecheck, 319 tests in 40 suites, real Redis integration, production build and five browser flows. The full application service accounted for 17 embedded rolls across all 12 sanitized demos, matching the independent source count, with no whole-match verdict.

## 2026-11-10 - Roll family coverage and roster conflicts

NUF-013/014/021 advance. Roll candidates are grouped by roster, source tag and optional numeric family in the shared report. Conflicting explicit/roster evidence and overlapping roster IDs now appear in the unresolved bucket. The report validates each row against the underlying evidence, and the shared explanation identifies unattributed rolls. The replay parser reserves the existing unresolved sentinel. The 1+100+1 fixture has one scored roll, 100 unsupported rolls, and one unattributed roll. Tests also reject a tampered family count and prevent either roster from receiving an overlapping player's roll. Broader recruitment identity, causal and malformed-stage accounting remain open.

Apothecary commit ed0a5c8 passed GitHub CI 42922147317. Local verification for the coverage checkpoint passed lint, types, 323 unit tests, the real Redis test, production build and five Chromium flows.

## 2026-11-10 - Loner resource evidence and movement consistency

NUF-012/014/016/018 advance. UI-007 and UI-020 establish that a 4+ Loner gate follows an explicit team spend and that failure can keep the same block pool. The report links the step, owner, choice and skill source to the fresh gate, retaining the observed pass/fail and a single resource cost. No replacement or gate contribution is inferred from the decision. Contradictory ownership leaves the roll visible without a resource claim.

A successful movement claim can advance the board only when the recorded single D6 agrees with the target and the move actors match the enclosing step. A valid Dodge preceding the synthetic exposed pickup retains the original context estimate. A contradictory die and a move emitted for another actor both clear the board before the pickup, whose numeric dice result remains usable. Broader movement and turn legality, mixed reroll policies and calibrated context remain open.

Local corepack pnpm verify passed lint, types, 328 unit tests, real Redis, the production build and all five browser flows. Coverage checkpoint 355474c passed GitHub CI 42922669261.

## 2026-11-10 - Direct KO recovery

NUF-009/011/013/014 advance. The exact UI-040 direct source records at ReplayStep 287 children 3 and 4 independently give away player 37's failed 3 and player 40's successful 5 at 4+. This path scores -0.5 and +0.5 before injury weight. It uses the direct source shape, uniquely resolved subject, explicit matching team and one unmodified check per subject and replay step. Missing die type is part of the verified direct shape. Omitted Outcome is accepted only with a failing face. Tests retain modified, contradictory, duplicate, indirect and overlapping-roster cases with unknown odds. This does not establish modified recovery rules or subsequent lineup availability.

Local corepack pnpm verify passed lint, types, 334 unit tests, real Redis integration, the production build and five Chromium flows. All 12 demos analyzed successfully and retained all 77 direct type-13 records, with 36 matching the unmodified ownership and outcome contract.

## 2026-11-10 - Direct questions, results and ordered movement

NUF-008 closes. Independent stdlib traversal of the 12 demos found 47 direct non-Event question/result records outside encoded action steps: 12 Bribe questions, 14 rolls, eight sent-off notices, nine removals, three special-rule results and one no-contest result. They now retain ReplayStep and child locators and are covered by the existing bounded event budget. Direct rolls remain unscored under their distinct source format. The raw referee result in demo1 ReplayStep 370 is type 30, face 3, neutral outcome 2 and has no player or team to assign. Its preceding question and following removal identify player 10. Tests preserve that order across a Clock insertion while keeping the direct roll unattributed.

UI-002 confirms a declaration and two separate zero-risk moves before the pickup step and its two dice. The production decoder retains all four step IDs and the independent destination coordinates. Existing block and reroll regressions reject links across distinct adjacent actors, and unlinked blocks remain reported without odds. Board tests verify repeated Ball/Bomb carrier observations do not invent transitions and explicit Ball carrier -1 clears the known holder. These satisfy the ordered-source work. Interpreting further mutations and reconstructing complete state remains NUF-016.

The previous runtime commit 060bbf8 passed GitHub CI 42923810791. Its isolated Preview dpl_CCHTFLEXJYgAAdZDVQroAHxALKQ5 returned HTTP 200 for demo1 and demo10 (1,121,018 and 971,589 response bytes). Demo10 exported nine verified KO checks, including the independently matched die 2 failure at ReplayStep 106. Both hosted reports reconciled roll families and abstained from a whole-match verdict. A separate stdlib corpus pass matched the runtime's 36 accepted direct KO checks.

Local corepack pnpm verify passed lint, types, 336 unit tests, real Redis integration, production build and five Chromium flows.

## 2026-11-10 - Damage step contribution accounting

NUF-011/014/018/019 advance. The shared report groups verified armor and Regeneration with the same subject's observed damage-step records. Groups reference the original events and sum their existing dice contributions once. Independent UI-068 source sequence 259 step 1 gives 30 of 36 possible armor holds at 10+, a break on 6+6 and a successful 4+ recovery on 6. Its subtotal is -30/36 + 0.5 × 1.5 = -1/12. Injury and casualty remain visible unscored and the removal adds no dice. Duplicating the removal preserves the total and the first removal reference. A second fresh-looking armor record with no independently distinguishable attempt leaves both armor records unscored. Independent decoding found 690 damage steps with exactly one armor check and 45 without one across the 12 demos. The report rejects tampered subtotals. Cross-step causal linkage and contextual consequences remain open.

The ordered-source checkpoint 57c3a5c passed GitHub CI 42924518688. Local corepack pnpm verify passed lint, types, 339 unit tests in 41 suites, real Redis integration, production build and five Chromium flows for this damage-step checkpoint.

## 2026-11-10 - Exact preview and direct evidence corpus check

Runtime commit 53f3b335c44d1dc6c0980a1c2f29afbff18c40e6 passed GitHub CI 42925054539. Its isolated deployment dpl_4zpZcyCKF2DDDxw4waLyJwWNCfwb returned 200 for demo1 and demo9 (1,138,628 and 1,030,122 response bytes). Demo1 retained the unscored neutral referee die. Demo9's source-linked Regeneration step reconciled one scored roll, three unscored rolls and one context record to +0.75 dice units. Both hosted reports abstained from the whole-match verdict. All 12 local demos passed with 47 direct question/result records and 36 scored unmodified KO checks.

The independent stdlib inventory and hash-keyed public-demo fixture now retain per-file direct question/result counts separately from encoded step counts. The fixture preserves all previous raw counts. The suite compares the direct and KO record counts with all 12 schema-validated reports. Broader contextual and held-out cases remain open.

## 2026-11-10 - Direct KO recovery with Kegs

NUF-009/011 advance. The installed NetGameplay modifier enum identifies numeric code 20 as Kegs. Independent stdlib decoding found 18 modified direct KO checks in the 12 demos. Each recorded base 4+, effective 3+ and exactly one code-20 +1 modifier, and all 18 dice and outcomes agree with 3+. Fourteen also meet the explicit unique roster requirements. Demo1 at ReplayStep 654 child 4 has a successful 3 and at 370 child 6 a failed 2. Both now score under the 4/6 chance, verified through the production service. An unexplained target change or different modifier stays unscored. Other recovery modifiers, resource and lineup effects, and broader injury/casualty distributions remain open.

Local corepack pnpm verify passed lint, types, 342 unit tests in 41 suites, real Redis, production build and five Chromium flows. The all-demo inventory checkpoint a62fb12 passed GitHub CI 42925670679.

## 2026-11-10 - Held-out movement context and fallout

NUF-016/017/018/020/021/022 advance. Independent stdlib decoding of the public demo8 replay shows Rush2+ die1 at 463/1 step 6, applied self-damage at step 7 with armor9+ on [6,3], injury [6,6], casualty D16=5, player 44's removal, and failure turnover at 463/2. The linked subtotal is −5/6 − 26/36. Two damage dice outcomes have unknown odds and removal supplies context only. Demo1 at 342/1 steps 7–8 and 342/2 gives the counterpart with held armor and −5/12 dice units. The model rejects wrong-player, manual-end, contradictory summary, intervening action and ambiguous duplicate armor links.

The pre-roll reducer advances player 38 through the independently checked demo1 ordinary stand-up at 144/1 step 1. Checkpoints 143/3 and 144/3 corroborate the stance change and the movement budget after one ordinary move. Demo6 412/3 and 413/1 steps 1–2 corroborate a Dodge destination next to the active team's ball carrier after a prior Dodge and move. Edits to future state have no effect on this explanation. Demo-goblins1 536/2 records a turn-16 winner with no dice in the preceding four ordinary moves. It adds no luck.

Schema 2.1 and context model mobility-possession-3 expose these observations in JSON, the timeline and CLI explanations. Broader late scoring threats, complete useful activations, causal branches across rerolls and ball outcomes, and calibrated numeric context remain open. No issue closes at this checkpoint.

Local corepack pnpm verify passed lint, typecheck, 351 unit tests in 42 suites, the real Redis integration, the production build and five Chromium flows. The real-upload browser flow opened the demo1 Rush explanation and checked the linked turnover, held armor and −0.42 displayed dice subtotal.

## 2026-11-10 - Team reroll outcomes in movement falls

NUF-012/018 advance. Demo8 at 330/1 step 3 asks to reroll Dodge4+ on 2. At 331/1 the coach declines, the replay repeats the 2, then records broken armor at 10+, injury and removal. The linked subtotal is −1.1 × 1/2 − 30/36. Demo4 at 461/1 step 2 asks about the same target and die. At 462/1 the coach spends one team reroll, fails on a fresh 1 and holds armor below 8+. The subtotal is −1.1 × 3/4 + 15/36. Both direct failure turnovers occur at child 2. Independent stdlib decoding confirms these source locators. The retained original or replacement contributes once. Skill reroll and later ball branches remain open.

The preceding movement-context candidate ea9f9d8 returned HTTP 200 for demo1, demo6 and demo8 on the isolated Preview (1,163,866, 1,054,963 and 828,636 response bytes). Hosted checks confirmed the stand-up budget, carrier adjacency, held armor counterpart and the full Rush fall with two unscored damage rolls.

GitHub CI 42929732586 passed on ea9f9d8. Local corepack pnpm verify for the team-reroll extension passed lint, typecheck, 353 unit tests in 42 suites, the real Redis integration, the production build and all five Chromium flows.

## 2026-11-10 - Skill-rerolled falls and scoring-move evidence

NUF-012/016/017/018/021/022 advance. Independent decoding at demo-goblins1 280/1 step 2 gives a failed Dodge3+ on 1, used Dodge (skill7), and a failed replacement on 2. Applied damage at step 3 breaks armor8+ on [6,5], followed by injury, casualty and removal. A direct failure turnover follows at 280/2. The report counts the two dice as one action at 8/9 success chance, with zero team rerolls spent. The damage-chain subtotal is −1.1 × 8/9 − 21/36. Unknown injury and casualty odds stay visible.

Demo8 at 102/3 records the ball at [17,12] with holder fields omitted. At 103/1 step 1, player 8 moves there and rolls 4 for Pickup3+. The reducer carries the ball through seven moves to the Rush from [24,13] at step 9. Changing the future board leaves that pre-roll evidence unchanged. A conflicting pickup die stops the reducer. The direct touchdown at 103/2 records the same player at [25,13]. A different scorer breaks the link while the Rush retains its original 1/6 contribution. Schema 2.2 exports both source links and the real-upload timeline exercises them.

Prior candidate 6eb8fd2 passed GitHub CI 42930329986. Its isolated Preview returned HTTP 200 for demo1, demo4, demo6 and demo8 and enforced a typed 429 under the shared quota probe. That is historical hosted acceptance for the prior candidate. Current work uses the zero-cost restriction and local verification. No account, Redis configuration or deployment was changed.

Local corepack pnpm verify passed lint, typecheck, 355 unit tests in 42 suites, real Redis, the production build and six Chromium flows. The new demo8 browser flow opened the Rush explanation and verified the earlier pickup and immediate touchdown. GitHub lists the repository as public and its workflow uses a standard Ubuntu runner. The Vercel project inventory found no connection to this GitHub repository. Exact-candidate hosted verification is pending.

## 2026-11-10 - Final-turn scoring attempts and Pro observations

NUF-012/016/017/018/020/021/022 advance. Independent raw traversal matched 23 public-demo touchdowns to their preceding encoded player moves. Side32 maps to x25 in15, and Side64 maps to x0 in8. All eight direct x0 touchdown records omit X, while their encoded move retains explicit0. Schema 2.3 keeps the partial direct observation alongside the move destination. The pre-roll description requires the verified carrier, an ordinary Move declaration, an adjacent open target, explicit Side and a previously observed initial standard layout. Later observations cannot supply earlier geometry.

Demo1 654/1 step7 and demo5 540/1 step8 provide two final-period-turn Rush attempts at opposite ends. Their actor roster counter is16 and Period is1, with eight turns per period. Active-side attribution remains separate where omitted. Matched counter14 inputs report two further turns. The observed clock and scoring attempt receive no tactical weight.

GR-025 and UI-047/087 independently support a Pro3+ gate, with success on3 and failure on1. The latter is a kept original after an explicit declined team reroll in an AccuracyStep continuation. The report validates actor, skill50, source links, target, die and outcome, and shows the observed gate result with its 4/6 chance outside additive scores. Changed skill ownership or a contradictory kept die rejects the gate claim. Full replacement-choice policies remain open.

The current capture audit records why injury type11 plus dice cannot choose an expected-value table: observed total8 can be KO or Thick-Skull Stunned, and current trait provenance must be established across roster changes. Work continued on the independent clock and Pro contracts. Broader table, referee and quantified tactical acceptance remain open.

Local corepack pnpm verify passed lint, typecheck, 360 unit tests in43 suites, the real Redis integration, production build and seven Chromium flows. The real demo5 browser upload opens the turn16 scoring attempt and its left-end touchdown. These results are local; no newer Preview was deployed under the zero-cost restriction. Commit845c530 passed GitHub CI42933125895.

## 2026-11-10 - Raw block pools, Pro replacements and context coverage

NUF-010/012/013/014/015/019/021/022/027 advance. An acceptance audit from71517b4 distinguishes accepted scope, missing inputs and independent work for all17 remaining issues without dropping criteria or dependencies. No issue closes. Stale subsystem summaries now distinguish closed ingestion/legacy engineering from remaining semantic and hosted acceptance.

UI-047 independently records Skull, a passed Pro3+ gate, fresh Push and its selection, but no applied block result. Schema2.4 and dice-only-16 keep raw pool scoring independent of final resolution, retain optional source-linked selection, and leave unavailable applied outcomes unknown. The Pro replacement enumerates exactly its eligible fresh die conditional on the recorded pass, preserving kept faces and both source links. Both one-die opportunities have probability1/3. Invalid gate, absent eligibility and duplicate initial questions withhold unsupported replacement claims. The earlier activation-interruption test intentionally now retains the independently supported initial pool while refusing the unrelated selection.

The audit exposed and fixed two denominator defects: ResultNoRollSuccess without dice is deterministic evidence, and an exact contiguous kept numeric summary in the same supported action repeats no randomness. A different-action summary remains a candidate with unknown odds. Context-field counts separately reconcile positions, possession, clocks, activation IDs, quantified impacts and movement consequences over roll candidates. UI, CLI and exported JSON share this scope explanation. Source team order now preserves home/away labels instead of ranking them by turn frequency.

Local corepack pnpm verify passed lint, typecheck,369 unit tests in44 suites, the real Redis integration, production build and seven Chromium flows. The real-upload browser flow checks the context coverage explanation against its exported report. A formatting-only cleanup of untouched schema code passed typecheck. No new Preview was deployed under the zero-cost restriction. Full skill policies, tactical counterfactual calibration, complete damage/referee rules and integrated acceptance remain open.

## 2026-11-10 - Embedded staff-question injury evidence

NUF-009/011/014/021/022 advance. UI-025 independently labels6+1 as Stunty Injury→KO. Its QuestionKORecovery contains RollInfos type11, not a recovery attempt. Schema2.5 and dice-only-17 now retain the dice, raw outcome and source location as an injury with null probability/result and no contribution. The user-facing label says Observed injury dice instead of inferring binary success or failure. Staff use, applicable injury table, trait effects and availability remain unmodeled.

An independent Python stdlib traversal found14 questions across all12 public demos:10 in demo1,2 in demo3, and1 each in demo2 and demo-goblins1. The hashed raw inventory now records each exact sequence/step/message locator, dice and outcome. The existing all-demo test reconciles all14 through the production report. This intentionally expands unknown injury coverage rather than rebaselining a score.

An exact earlier direct injury in the same uniquely owned DamageStep makes a question a copied original with an explicit source link. Changed action, subject or dice prevents deduplication; missing original references fail schema validation. Malformed nested dice and unsupported versions remain visible without promoted odds. The direct-copy cases are adversarial tests, not additional paired gameplay observations.

Local corepack pnpm verify passed lint, typecheck,376 unit tests in45 suites, real Redis, production build and eight Chromium flows. The new browser flow uploads XML reconstructed from the exact saved numeric extract, inspects unknown injury evidence and checks its JSON export. Final review tightened the copy key to include subject and owner, followed by passing lint/types, worker rebuild and42 targeted contract/injury tests. Previous checkpoint adeb393 passed GitHub CI42942278731. No new deployment or cloud store was created under the zero-cost restriction. All17 remaining issues stay open with their original criteria and dependencies.

## 2026-11-10 - Player, half, turn and activation navigation

NUF-020/021/027 advance. Schema2.6 adds bounded initial-roster-name observations only when the original team/player key has unique matching ownership. Conflicting/unknown identity omits the name. Shared UI/CLI copy explicitly labels this as an initial roster observation; it does not assert current identity after recruitment or ID reuse. Dice-only-17 and mobility-possession-5 are unchanged.

Player-ID/initial-name search, half including unknown, observed team-turn and activation filters compose with all existing full-report filters before sorting and50-row pagination. A timeline row can restrict to its observed activation. Reset and another upload clear every new control. Missing clock/activation fields remain unknown. Source segments are never converted to guessed game turns.

Local corepack pnpm verify passed lint, typecheck,377 unit tests in45 suites, real Redis, production build and eight Chromium flows. The actual demo5 final-turn carrier40 remains discoverable with combined second-half/turn16/player40/activation controls; contradictory half returns an explained empty state. A named fixture checks case-insensitive initial-name search, observed clock and unknown-half exclusion. A subsequent upload resets stale player, period and turn state. Domain checks verify the initial-name provenance label and conflicting-owner omission. NUF-020 retains its NUF-016/019 dependencies, so no broad issue closes. Hosted verification stays pending under the zero-cost restriction.

## 2026-11-10 - Observed failed-pickup ball branches

NUF-014/018/021/022 advance. Independent stdlib traversal matched all135 complete-coordinate standard-ball bounce records in12 demos to the eight D8 direction offsets. The new branch requires an immediately following BallStep3/ResultRoll25 with matching origin, explicit standard ball, complete in-bounds coordinates and consistent direction. A stationary catch at that landing can link its verified scored result. Retained-original catch decisions use the existing source-certified reroll linkage. Failure can continue to another immediately adjacent bounce, bounded to16. Unknown, interrupted, contradictory, different-ball and unsupported paths stay outside this contract.

Demo11 sequence186 independently records Pickup3+ die2 → bounce3 from[19,7] to[20,8] → player9 Catch4+ die4, with−11/60 dice units. Demo3 sequence415 records Pickup6+ die5 → bounce2 to[15,10] → player45 Catch6+ die6, with11/15 units. Demo1 sequences60–62 contain two declined original checks, Pickup4+ on3 and Catch5+ on3, separated by bounce2, followed by bounce4 to[3,5]. Its subtotal is−11/12. These raw facts and separate centered checks establish observed accounting, not tactical value. An independent fixed-policy enumeration gives zero mean when the catch opportunity exists only after pickup failure.

Schema2.7 references the original bounce source and catch event IDs. Subtotals reconcile the existing contributions separately by team and add no score. An ownership permutation verifies that an opposing receiver's contribution stays on that receiver's side. UI/CLI explain the observed catch actors/outcomes and landing while leaving possession/turn cost unquantified. The shared consequence coverage includes these pickup branches. Dice/context model versions remain unchanged.

Local corepack pnpm verify passed lint, typecheck,386 unit tests in46 suites, real Redis, production build and eight Chromium flows. The real demo1 upload checks both recorded bounces, the linked catch, final landing and export. Broader ball paths, complete successor policies and calibrated contextual value remain open. The exact missing input for pricing occupied pickup landings is the applicable catching player's effective catch rule and eligible policy for each possible landing, not just the one actually observed. No hosting, account, service or Redis configuration changed.

## 2026-11-10 - Current trait provenance and recruitment boundary

NUF-010/011/013/016/021/022 advance. The compact board projection now preserves bounded numeric player Data.Id, IdPlayerTypes and innate/acquired skill lists, checking explicit player Data.TeamId against the enclosing roster. Selected nested XML lists retain their shape instead of becoming empty strings. Unknown children, duplicate/fractional/nonfinite/negative codes and lists above64 entries remain unknown. Missing and explicit empty lists differ. Mismatched player/team Data withholds the observation; names and arbitrary player fields are not copied into the numeric checkpoint.

Source008 UI-087 independently supplies board7/3 player48 Data.Id48, type1455 and innate[49,55,44,77,7], with acquired skills omitted. After removal and repurchase of ID48, board9/3 omits Data. The parser keeps that later trait observation unknown, despite the stale portrait during playback. Demo1's initial player1 lists innate[61,63] and acquired[30,7], but its later pre-roll frames omit Data. The report does not inherit the initial skills into those frames. Current trait persistence across omissions remains an exact unresolved NUF-013/016 requirement.

Schema2.8 can expose separate actor/target trait observations from the existing conservative pre-roll reducer. Ownership and player IDs must match, future data cannot fill an earlier frame, and a target list can exist while actor Data is absent. Known Block/Dodge/Tackle/Thick Skull/Stunty names describe listed data; eligibility and applied use still need action evidence. Dice-only-17 and mobility-possession-5 do not change. No skill-conditioned injury/block expectation or issue closure follows from this provenance slice.

Local corepack pnpm verify passed lint, typecheck,399 unit tests in47 suites, real Redis, production build and eight Chromium flows. The browser acceptance initially exposed a rendering gate that hid standalone trait explanations; it was fixed and the complete run then passed. The exposed-pickup browser fixture verifies current Block/Thick Skull observations while its dice and context totals remain unchanged. The existing all-demo reconciliation still passes. Previous ball-chain checkpoint2f25ea3 passed GitHub CI42949537957. No Preview, account, service or Redis configuration changed; exact hosted acceptance remains pending under the zero-cost restriction.

## 2026-11-10 - Replacement purchase bindings and current roster ownership

NUF-013/014/016/021/022 advance. The source008 lead is confirmed from the saved numeric records: EventBuyMercenary7/1 selects1455 for instance48; its unique category PlayerData lists innate[7,44,49,55,77]. After EventRemoveMercenary8/1, purchase9/1 selects1121 with innate[25,44,50,54,17]. The corresponding first boards7/3 and9/3 place48 on explicit roster1. The acquired lists are absent and stay unknown. The second board still has no current Data; candidate selection does not fill current eligibility or establish complete trait persistence.

Schema2.9 retains non-roll purchase/removal records and a separate bounded recruitment ledger. It links source IDs, the first following roster, and earlier purchase/removal records for an instance reuse. Unknown types, duplicate candidates, contradictory roster data, an intervening identity event, or missing first membership cannot be repaired by a convenient later checkpoint. Purchase catalogue entries live under inducement categories, not a flat global Players field. The schema reconciles source/header fields, links, counts and known team membership without equating GamerId with TeamId.

Dice-only-18 uses fresh unique current roster membership when an actor is unnamed or absent from the initial roster. Weaker turn inference alone remains insufficient. Explicit, initial-roster and current-roster conflicts stay unresolved; unknown mutations, overlapping IDs and future observations cannot supply ownership. Numeric contracts still govern dice and rerolls separately, and no additional contextual impact is inferred from membership. UI/CLI explain the separate purchase records and JSON retains the source evidence.

Local corepack pnpm verify passed lint, typecheck,412 unit tests in49 suites, real Redis, production build and nine Chromium flows. The new browser flow uploads the exact saved numeric purchase fragment, checks both roster bindings and exports the distinct selected types/lists. Current-roster tests include positive unnamed membership and explicit/initial/future/mutation/overlap counterexamples. All17 broad issues retain their criteria/dependencies. No new deployment, account, service or Redis configuration changed.

## 2026-11-10 - Confirmed player activation losses and later availability

NUF-016/017/018/021/022 advance. GR-003 and the exact UI-099 projections establish two distinct away Block activations:42 fails Foul Appearance2+ on1 against home10, then44 acts;44 fails separately, then43 acts in the same recorded team turn8. Their actor cells stay unchanged, the spent actors' flags become omitted, and the defender's skill use is not attributed as the attacker rolling. The minimal numeric fixture preserves source sequences254–257 and boards304–307 in independently annotated before/after order with explicitly renumbered fragment locators. No unrecorded moves are manufactured.

Schema2.10 links declaration, opposing skill use, failed gate, ordered checkpoints and following teammate. The gate stays unscored with unknown odds; its lost Block value is not quantified. Mobility-possession-6 applies a known spent status only from the confirming later declaration. Pure reduction returns a new frame and live evidence set, preserving source snapshots, position and tackle zone. Changed clock/period/phase/side/membership, renewed explicit availability or unknown mutations clear the status. Prefix-invariance regression required prefix-only skill/gate recognition, so future confirmation cannot decide the earlier roll's pre-state. Ordinary Block/Skill0 is the accepted slice; Blitz/special actions and broader activation-completion policies remain open.

A complete-state synthetic continuation independently checks the effect on a later declined-reroll2+ Dodge: one useful teammate instead of two gives−5/6 instead of−5/3 context units, with unchanged dice odds. The UI explains both the observed continued team turn and the already ended activation. CLI text also retains these unscored consequences when there are no scored swings. These are partial mobility units, not a calibrated value for the earlier lost Block.

The expanded browser suite initially made11 real uploads against the10/minute gate. Its malformed-response-only flow now constructs the valid reference through the production service in the test process and retains the same inconsistency/timeout assertions; production quota is unchanged. Final corepack pnpm verify passed lint, typecheck,425 unit tests in50 suites, real Redis, production build and all ten Chromium flows. This includes snapshot immutability/tackle-zone, turn expiry, prefix/future, ownership, same-actor, contradictory-die, unknown-transition and turnover regressions. All12 demo reconciliation checks pass. Recruitment/current-roster commitf9aa84c passed GitHub CI42959111769.

All17 broad issues stay open. Next ready state work is terminal-policy-aware Really Stupid/Bone Head and ordinary activation completion, including tackle-zone loss versus preserved defensive presence. SourceUI-099's actor43 retains CanAct1 after its movement while MovePoint is omitted, so CanAct alone still cannot identify a new useful activation. Remaining full skill/resource policies, occupied bounce successor rules, scoring-threat value and held-out calibration must be established independently. New-candidate hosting remains pending under the zero-cost restriction; no cloud, Redis or account configuration changed.

## 2026-11-11 - Ordinary Move completion and terminal mental-trait state

NUF-012/014/016/017/018/021/022 advance without closing their broader acceptance criteria. Public-demo numeric extraction independently reproduces four bounded source fragments: demo10 ReplaySteps231–233 fresh Bone Head failure, demo1 ReplaySteps92–95 kept Really Stupid failure, demo1 ReplaySteps91–93 ordinary movement completion, and demo-goblins1 ReplaySteps264–267 unsupported Loner3+ failure. Source hashes and original ReplayStep/child/sequence/step locators remain in bb3-activation-aftermath.json. scripts/extract-activation-evidence.py reproduces the fixture byte-for-byte without importing application parsing or semantics. Arbitrary text and names are excluded; fragment locators and the minimal ownership scaffold are explicitly separate from source observations.

The ordinary Move candidate advances only through verified movement. A different teammate's valid same-turn declaration confirms completion even where the source retains CanAct1. The actor's last verified destination must agree with the current board. Position and tackle zone remain intact; only later same-turn availability is derived. Conflicting declaration ownership, changed clock/period/active side, unknown transitions, missing movement and inconsistent cells withhold the confirmation. A declaration without movement and general Block/reactivation policies remain unsupported.

Mental-trait confirmation requires the original ordinary declaration and actor-owned skill, a valid failed terminal die, exact provider31/51 effect44/type4/durations[6,1], and a stable after-board with a different teammate continuing the same recorded turn. Fresh final, explicitly kept original and team-spend/passed Loner4+/fresh Status2 replacement are separate policies. Actor/target/step/controller ownership and original/replacement target/modifier evidence must agree. Equal original/replacement faces stay distinct. The UI-007 replacement messages are tested inside an explicitly synthetic complete-state continuation with consistent renamed IDs; no source001 board was captured for that case. The sampled Loner3+ failure is retained as unsupported, not relabeled as the accepted4+ policy.

Schema2.11/context mobility-possession-7 retain linked declaration, movement, skill, roll, effect, question, decision and gate evidence. The pure reducer returns its confirmation ledger alongside pre-roll evidence rather than mutating a caller-owned output map. New frames derive unavailable/no-tackle-zone state for verified mental failures, while ordinary completion and Foul Appearance preserve defensive presence. Source snapshots remain unchanged. Changed clock/side/phase/member/cell, unsupported transitions and contradictory mental-trait availability/tackle-zone observations expire derived state. No effect lifetime across turns or calibrated lost-action value is claimed. Prefix-truncation tests keep earlier pre-roll evidence independent of later confirmations.

A later failed2+ Dodge in matched complete-state continuations has one useful teammate instead of two:−5/6 rather than−5/3 context units, with unchanged5/6 dice success probability. The earlier trait odds and lost action remain unscored. Coverage counts the referenced terminal trait roll once and keeps no-roll completion outside the random-outcome denominator. UI/CLI share explicit completion/activation/tackle-zone copy; CLI lists observed activation endings without calling ordinary movement a random loss.

Final corepack pnpm verify passed lint, typecheck,456 unit tests across51 suites, real Redis quota integration, production build and all ten Chromium flows. The changed browser flow covers both exact Foul Appearance observations and the synthetic terminal Really Stupid continuation, keeping the real-upload quota unchanged. Added31 source/policy/state/ownership/clock/prefix/immutability/contract regressions. A final fetch confirmed the starting branch remained7eb5661 and matched its remote. The repository is public and the unchanged workflow is active on standard ubuntu-latest; exact pushed-candidate CI is checked after commit.

All17 broad issues remain open with criteria/dependencies preserved. Next ready work is effect44 expiry/recovery across opponent turns and the actor's next activation, failed/non-4+ Loner variants, and broader completion/reactivation policies. New-candidate hosting still awaits verified free allowance. No cloud service, Redis configuration, account, production or legacy deployment was changed.

## 2026-11-11 - Activation confirmation clock continuity

Review of the pushed activation-state group found that matching before/after clocks could conceal an intermediate changed clock. A bounded checkpoint pass now assigns observed clock epochs from phase/period/active roster and each roster's explicit team/cumulative turn, preserving expected unstable reroll-decision stages. Both Foul Appearance and terminal mental-trait confirmation require one continuous clock epoch; missing/invalid or changed intermediate observations cannot be repaired by a later matching board. Foul Appearance now selects its before-state strictly before the declaration. Two regressions cover intermediate changes that later revert, while all source-backed positive paths stay accepted. No new scoring policy or model/schema version is introduced.

Predecessor3707c15f53ffe9db7d3ba781c14cc2a3f0343929 passed exact GitHub CI42969952065 in3m13s. The follow-up's final corepack pnpm verify passed lint, typecheck,458 unit tests in51 suites, real Redis quota integration, production build and all ten Chromium flows. Full12-demo reconciliation remains green. The17 broad issues, zero-cost restriction and exact-candidate hosting limitation remain unchanged. This follow-up is committed/pushed separately and its exact CI is watched before handoff.

## 2026-11-11 - Current Confused effects and next-activation evidence

NUF-012/013/014/016/017/018/021/022 advance; all17 broad issues retain their criteria and remain open. Schema2.12/context mobility-possession-8 observe current Confused effect44/provider type4/skill31 or51 with exact duration codes[6,1]. The installed enum snapshot independently names Confused, Skill, NextActivation and EndOfDrive; those names corroborate the recorded shape without establishing universal expiry behavior. A stdlib-only scan of12 public demos found1,233 repeated board/player observations with that effect/provider and no simultaneous positive tackle-zone flag. Counts describe observations, not unique failures or new UI annotations.

The pure checkpoint observer retains only the admitted effect provider, validating at most64 effect entries per player and withholding duplicate/unknown44 providers, malformed shapes, unknown fields and non-empty character/skill modifiers. Snapshot numeric strings and decoded-message numbers are both validated. Current-frame reduction derives tackleZone=false without changing CanAct, posture, movement or source snapshots. A later omitted effect stays unknown; a contradictory positive tackle-zone flag invalidates reconstruction. A teammate still requiring an unmodeled mental activation policy makes ordinary useful-move counts unknown rather than manufacturing an available or spent move. Verified suppression can remove an opposing mark from the existing scoped pickup-bounce successor calculation.

New independent numeric/known-empty fixtures preserve source hashes and ReplayStep/child/sequence/step locators from demo1 ReplaySteps100–104 and135–137, demo-goblins1 ReplaySteps282–284, demo10 ReplaySteps232–234 and demo4 ReplaySteps414–417. scripts/extract-mental-effect-evidence.py reproduces bb3-mental-effect-lifetimes.json byte-for-byte. Fragment locators and the minimal initial ownership scaffold are explicitly renumbered/separate; arbitrary text is omitted. Demo1's opponent movement retains the missing active-side flag as null. Its exact effect end at ReplayStep136 is also checked through full production compact parsing, not just the extracted fragment.

A matching ordinary declaration and current effect can admit ResultEndPlayerEffect for the same on-pitch actor at its recorded origin. Continuous checkpoint clock epochs prevent an intermediate change from being repaired by later matching values. Ending the effect sets tackle-zone recovery unknown. A matching applied skill and fresh consistent initial Bone Head2+ or Really Stupid4+/assisted2+ test can preserve supported movement on success; a failure awaits a fresh checkpoint, which can independently observe reapplication. Movement while the old effect or a pending trait test remains unresolved is refused. Future boards and later failure/success cannot repair an earlier missing source. The report links end/declaration/skill/test evidence, checks the one-D6/effective-target/modifier/outcome contract, and rejects fabricated recovery. The trait odds remain null and add no dice or context contribution.

Demo4 independently corroborates failed_loner_kept_original: one team reroll spent, failed Loner4+ on2, exact copied original Really Stupid failure with NewRoll0, effect44 and a different teammate continuing. This differs from a declined reroll and a passed-gate fresh replacement. One resource cost is retained at the gate and no replacement or extra score is invented. The public Loner3+ branch remains an actionable separate-contract candidate, not a4+ fallback.

Matched complete-state synthetic pickup fixtures compare the same opponent at[11,7] with an explicit positive tackle zone versus a recorded Confused effect. Exposure changes from3/8 to0; a failed2+ pickup changes from−175/48 to−10/3 provisional context units, with unchanged5/6 odds and dice contribution. Removing both observations instead yields unknown exposure/context. Independent regressions preserve Foul Appearance use by a holder with no tackle zone, source immutability, effect omission, pending activation checks, ownership/geometry/clock constraints, future-prefix invariance and strict report links/outcomes.

The first full-source browser assertion exposed empty CharacModifiers in board XML and AdditionalSkills in decoded effect messages, which numeric-only extraction had omitted. Only those observed empty forms are now accepted; non-empty modifiers remain unsupported. The extracted evidence now preserves the known empty shape, and full-source production/HTTP export is explicitly covered. The no-dice winning-turn golden was strengthened to assert the two independent KO rolls separately from a newly retained effect-context declaration, which must contribute zero and stay outside the roll denominator.

Final corepack pnpm verify passed lint, typecheck,494 unit tests in52 suites, real Redis quota integration, production build and all ten Chromium flows. Added36 focused effect/policy/state/contract regressions; all12 demo reconciliation checks remain green. Actual BBR HTTP export verifies current effect/end fields. The matched suppression UI state uses a production-service report after the existing real exposed-pickup upload, keeping the suite at ten real uploads and production quota unchanged. Basec7b09bf passed exact CI42970577716. A final fetch matched the base remote, and the repository/public active standard-ubuntu CI route was verified before commit; the pushed candidate is watched separately.

Remaining integrated blockers are complete current trait/rule and resource legality, drive/phase/transform/reactivation policies, valid late deciding failure continuations, held-out quantitative context and calibration. New-candidate hosted acceptance remains pending while free allowance is unverified. No service, account, Redis configuration, production/legacy deployment, merge or release changed. Next ready work is the saved non-4+ Loner evidence and explicit drive-boundary effect behavior, with the existing source/unknown/causal distinctions preserved.


## 2026-11-11 - Loner3+ policies, conditional block pools and explicit drive ends

NUF-009/010/012/014/016/017/018/021/022/027 advance with all17 broad issues still open. Schema2.13, dice-only-19 and mobility-possession-9 add own-skill1008/3+ Loner admission alongside44/4+, strict ordered spend/skill/target/action identity, failed-gate kept originals and mental terminal confirmation. The gate records one observed team resource spent and remains unscored; complete turn-resource eligibility remains open. A passed gate can admit a separately verified full fresh block pool under its fair conditional distribution, with all indices explicit even for a repeated face. Failed gates with copied pools add no random outcome. No combined Loner-gated core numeric odds are inferred.

scripts/extract-loner-drive-evidence.py independently reproduces eight public-source numeric/known-empty cases with hashes/original locators in bb3-loner-drive.json. Public3+ inventory reconciles nine gates: five passed, four failed. Demo-goblins1 ReplaySteps364–366 supplies original[1,0] and fresh[1,2], Push-or-better5/9 and conditional delta−5/12;388–390 supplies failed3+ and unchanged unrolled original. Demo6 ReplaySteps194–196 supplies boundarypass3 and fresh[4,0]. Its343–346 supplies a passed3+ gate then successful mental replacement on6, while goblins264–267 confirms failed3+ original retention and activation loss. These outcomes remain distinct. These are raw-source observations, not new UI annotations; test fragments renumber locators and use a minimal ownership scaffold.

Explicit EventEndPlayerEffect/provider31 or51 immediately before setup links a positive prior instance to the first following same-step board, retaining on/off-pitch location and raw setup flags without asserting playable availability or restored coverage. Demo3 steps109–111 observes player1 on pitch; demo10 steps239–241 observes37 off pitch; goblins535–537 observes1 on pitch/38 off pitch, all with setup flags1/1. Pending halftime before-state can establish the old effect without supplying usable availability. Missing/contradictory/unknown transition and identity/effect mutations withhold confirmation. Deterministic end/phase records add no dice/context score. Normal-play StandBy confirmation is bounded to known fields and consistent phase/controller observations.

Acceptance: pnpm verify passed lint, typecheck,534 tests/54 suites, real Redis across independent handlers, production build and11 Chromium flows. New targeted cases reject wrong skill/threshold/owner/spend, missing fresh indices, controller/unknown-event drift, forged links/distributions, missing first setup boards and retained effects. Actual full demo-goblins1 upload traverses the production worker/API and shared schema; the new UI flow separately renders service-generated source-fragment reports. Ten existing browser flows remain. Complete-state synthetic context goldens remain separate from source observations. The extraction is checked byte-for-byte before commit.

Refreshed the permanent-ID acceptance map with actionable trait/persistence, skill-conditioned block/damage, phase/resource, unique-outcome and possession-successor engineering. Precise missing evidence includes accepted2+/5+ gates and core numeric Loner terminal chains, paired failed Bribe/natural1 Argue export, valid late deciding failure successors, held-out quantitative context/calibration and exact-candidate free hosting acceptance. No account/service/Redis change, Preview, production/legacy deployment, merge or release occurred. Historical hosted evidence is not evidence for this candidate. Exact pushed CI is recorded by its run after commit.


## 2026-11-11 - Observed block resolution and causal damage decomposition

Continued from29032d3a97c1796fd0660515df766c63ec25557a, whose exact CI42993389302 passed. NUF-010/013/014/018/020/021/022/027 advance together; no permanent issue or acceptance criterion is removed or closed. Schema2.14 adds a bounded observed blockResolution on the terminal linked pool, positive participant skill-source links, deterministic blockSelection evidence and victim-team damage subtotals. Dice-only-19 and mobility-possession-9 remain unchanged. This is observed aftermath, not a full current-trait table, best-choice/reroll policy, simulated availability, tactical value or win probability.

Paired source cases distinguish defender Dodge/UI-061, attacker and defender Wrestle/UI-073/074, attacker Block/UI-076 with defender armor/injury/casualty, and both-down/UI-078 with separate attacker and defender damage. UI-096 confirms one terminal consequence after a team replacement; the original pool remains separate. Positive Block/Dodge/Tackle/Wrestle use requires its actual participant and initial unambiguous ownership, ordered selection and matching applied result. Unknown skills/messages/fields, inconsistent roll status, duplicate selection and role/owner conflicts withhold the consequence. Omitted current traits are never repaired into eligibility. Wrestle-prone is distinct from knockdown and no turnover or ball-possession policy is inferred.

Independent stdlib scripts/inventory-block-resolutions.py reproduces bb3-block-resolutions.json byte-for-byte (SHA256 b4fe8f31cb2f2c69e6e5f818fcce6a2ba2e4b19d2bddf3cfa4e3857efd3c89f6), with original numeric source projections, locators and file hashes. Eight public block chains explicitly apply Tackle57: five in demo1 and three in demo6. Six gain the new resolution contract; two Sidestep/controller-wait chains retain unknown final linkage. Demo1 ReplaySteps232–235 records actor3/target38, Stumble, attacker Tackle57, applied6 and defender armor. Demo6's three further chains are source-held-out checks against this contract, not blind calibration data or new UI observations. Existing paired fragments retain their explicit minimal ownership scaffold and renumbered fragment locators.

Immediate damage linkage requires ordinary Source1, Applied1/non-evaluation, expected knocked-down subject, adjacent indices and the same sequence. A verified zero-movement/no-roll result summary and exact casualty SPP2 record can remain in the chain without adding luck. Unknown interruption, different subject/sequence, evaluation or unsupported source withholds damage linkage while preserving the separately verified resolution. Existing damage summaries anchor the decomposition, so unsupported/unlinked damage does not become zero impact. Per-team subtotals reference the terminal pool plus linked existing damage once; earlier replacements remain separate. Shared schema rejects forged links, duplicate final/damage attribution, wrong subjects/skills and fabricated totals. Random-outcome counts do not increase for selections or retained skill rows; observed consequence coverage can increase without quantified context coverage.

Web and CLI share applied-skill/aftermath copy and Raw target met/missed for block actuals. Visual inspection caught the previous generic Fail label alongside a successful Block-assisted knockdown; the new wording explicitly separates raw symbols and applied results. A memoized source index avoids repeated full-report scans for visible explanations.

Validation: corepack pnpm verify passes lint, typecheck,568 unit tests/55 suites, real Redis independent-handler quota checks, production build and12 Chromium flows.34 new regressions cover independent roles/outcomes, subject totals, held-out raw chains, prefix invariance, rerolled terminal attribution, interrupted/invalid damage and forged report data. The actual full-source upload worker exports the new fields; browser tests separately render production-service paired-source reports for defender Wrestle and attacker Block/damage. Browser plugin not available; used the repository Playwright workflow at http://127.0.0.1:3000/nufflizier, desktop1280x720. Page identity, nonblank report, framework-free render, console/page-error checks and target interactions pass. Inspected /tmp/nufflizier-block-consequences-desktop.png; report text wraps within the existing layout. No new mobile/other-browser claim. Screenshot/log artifacts stay outside the repository.

The public repository's active unchanged standard-Ubuntu CI route is checked before push; exact final pushed CI is watched after commit. All17 broad issues remain open. Ready work is full current-trait persistence/mutation and skill/choice distributions, explicit phase/resource/completion policies, valid ball/possession successors and unique-outcome reconciliation. Numeric late deciding failure still needs a valid terminal continuation, followed by independent quantitative context/calibration acceptance. No paid usage, new/claimed service, account/Redis change, Preview, production/legacy deployment, merge, force-push or release occurred. Exact-candidate hosted acceptance remains pending verified free allowance; historical hosting evidence stays tied to its actual SHA.


## 2026-11-11 - Successful movement geometry, fresh eligibility and conditional bounds

Continued from09dbed964ce5177f134ed1454b3475154344462b and exact green CI42998042991. NUF-012/014/016/017/018/019/020/021/022/027 advance as a dependency group; all17 broad issues and their original acceptance criteria remain open. Schema2.15/context mobility-possession-10 changes actual calculations and uncertainty handling; dice-only-19, raw dice/category scores and verdict abstention remain unchanged.

A pure successful-movement constructor vacates the checked actor's origin and occupies its verified adjacent empty destination before counting other ordinary standing-move options. Independent synthetic corner cases catch both directions of the old geometry defect: success can open a teammate's only exit or occupy its last free exit. The contract requires explicit ordinary Skill0/non-evaluation movement and rejects contradictory occupancy, unknown positions and known small-pitch layouts; a later omitted layout cannot re-enable the standard grid.

Known ordinary-move eligibility now requires the same current Data.Id, complete bounded innate/acquired lists limited to the supported ordinary-move subset7/30/57/68/63/59, explicitly empty Effects, known posture/situation/movement/availability and no positive mental effect. Missing current Data/Effects, other skill families and unresolved mental activation policies remain unknown. No initial or earlier omitted trait data is carried across a fresh snapshot. Complete-state synthetic helpers now explicitly supply those facts for their available teammates. This repairs a lower-bound eligibility hole rather than treating positive state flags as complete legality. Other trait persistence, transformations, temporary effects and resource policies remain open.

An already committed own Dodge-skill reroll defines a conditional terminal-D6 stage with recorded modifiers held fixed and no additional optional changes. Its contextual deviation is actual minus the single-die chance, while the raw dice event retains its existing compound two-attempt probability/deviation. The earlier failure, resource opportunity cost, other decisions and whole-action tactical value are outside this component. Saved BB3 original/skill/replacement chains and the failed terminal fall/turnover are the source evidence; the May2025 Games Workshop Second Season commentary's no-reroll-of-a-reroll rule is separately cited corroboration, not a universal BB3/version or modifier-policy proof.

When teammate availability is incomplete, contextualBounds records minimum/maximum ordinary-move counts, terminal success chance and lower/upper contribution. Unknown players contribute0–1 possible options; no missing field becomes a point estimate or midpoint. Bounds never enter team point totals. With complete supported state, the conditional component can be a point estimate with explicit deviation. Shared validation checks the correct stage, ordered original/own-skill/replacement sources, threshold/face/owner consistency, successor lists, count conservation, mutually exclusive point/bound output and component math. Six conditional terminal faces have mean-zero contributions under the fixed policy. Whole-match and calibrated tactical interpretations remain unsupported.

scripts/extract-dodge-successor-evidence.py independently reproduces bb3-dodge-successors.json byte-for-byte (SHA256 fdc391b70055ccae02679fb8d44d825c773e7867e7c15c3d9c3b61ff558ff866), retaining original locators and source hashes. Demo6 board414/ReplayStep415 gives actor46 a3+ terminal failure, seven unresolved peers37/38/41/42/43/45/49 and range−14/3 to0. Demo-goblins1 board93/ReplayStep94 gives actor47 a3+ terminal success and nine unresolved peers37/38/39/41/42/43/44/45/49, with explicitly Stunned40 excluded, for0 to3. Fragment ReplaySteps/sequences are renumbered with only a minimal roster ownership scaffold. No omitted availability is filled. A separate explicitly synthetic complete-state continuation supplies the seven teammates' missing state/eligibility and yields point−14/3 under terminal deviation−2/3, while the raw two-attempt deviation remains−8/9. The complete12-demo reconciliation finds ten bounded checks and zero point estimates, without changing whole-match abstention. This is source reconciliation, not blind calibration.

Web/CLI share range and stage copy. The full-event Context range filter runs before pagination and resets with uploads. The actual full goblin upload worker exports its three bounded checks. The new browser flow separately renders a service-generated source fragment, verifies conditional66.7% versus compound88.9%, range−4.67 to0, missing seven peers, exclusion from point totals, filtering and reset. An initial test assertion counted the separate summary table's rows; scoping it to the Replay segment table fixed the assertion while preserving its one-row expectation. Browser plugin not available; used the existing Playwright production workflow at http://127.0.0.1:3000/nufflizier, desktop1280x720. Page identity/nonblank content, interaction and page-error checks pass. Inspected /tmp/nufflizier-dodge-bounds-desktop.png; text wraps within the existing report layout. No mobile/other-browser claim; screenshots/logs remain outside the repository.

Final corepack pnpm verify passed lint, typecheck,603 unit tests in56 suites, real Redis independent-handler quota acceptance, production build and all13 Chromium flows.35 new regressions include geometry, fresh eligibility, known-small-pitch persistence, ordinary/evaluation boundaries, independent source ranges, conditional arithmetic, future-state invariance, invalid faces/owners/links, and forged/overlapping point-bound outputs. The CLI is checked on the actual full demo6 source as well. Exact final pushed CI is watched after commit; the existing public standard-Ubuntu CI route is verified before push.

Next ready work remains valid possession/ball-successor and phase/resource/completion transitions plus supported current-trait persistence/mutation that can narrow uncertainty. Full skill-conditioned block/damage tables, valid late deciding failure continuation, held-out quantitative context and tactical calibration remain separate acceptance requirements. No paid usage, new/claimed service, account/Redis change, Preview, production/legacy deployment, merge, force-push or release occurred. New-candidate hosting still awaits verified free allowance; historical hosted checks remain attached to their actual SHA.
