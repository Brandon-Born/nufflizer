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
