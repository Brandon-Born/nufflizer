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
