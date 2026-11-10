# Nufflizier Project Plan

Last updated: 2026-11-09

## Start Here

The authoritative work queue is [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md). It contains permanent IDs **NUF-001 through NUF-028**, source locations, reproduction seeds, dependencies, acceptance criteria, and closure requirements. Its ledger is the status source of truth. Seven issues (NUF-001–006 and NUF-025) now have local closure evidence; 21 remain incomplete. NUF-023 and NUF-024 need deployment configuration/access. NUF-009 is active reverse-engineering work; official enum definitions are not a prerequisite.

The November adversarial review supersedes the February rare-roll promotion priority. Correct supported replay semantics, upload safety, attribution, and evidence quality before expanding claims or tuning contextual weights. Historical updates below describe earlier implementation work, not current proof of correctness.

## Mission

Accept a BB3 `.xml` or `.bbr` replay and explain both raw dice luck and how random outcomes changed the match situation. The report must distinguish an early failed dodge that loses useful activations, an exposed failed pickup, a final optional block, and a late game-deciding action. Timing is evidence about impact, not an unconditional early/late multiplier.

Deliver:

1. An evidence-qualified team comparison, with abstention when analysis is insufficient.
2. Correctly attributed block, armor, injury, dodge, ball-handling, movement, and supported special-action outcomes.
3. Cumulative contextual impact with category/action contributions that reconcile with the headline score.
4. A real timeline and plain-language explanations linking dice, pre-roll state, immediate consequences, and uncertainty.
5. Safe, bounded, ephemeral processing with shared domain logic across web/API/CLI.

## Current State and Trust Limits

Baseline reviewed commit: `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`. The remediation candidate is being committed and pushed on `master` at the user’s request on 2026-11-09; pre-existing planning edits were preserved. See the publication record in the implementation log and Git history.

- Ingestion now preserves XML document order, rejects malformed replay envelopes/messages, and bounds transfer, decompression, XML/message work and events. Primary API, legacy opt-in and CLI use terminating workers.
- Dependencies moved to supported Next.js 15.5.29 / React 19, parser 5.12.0 and Zod 4.6.7, with a refreshed lockfile and zero production advisories at validation. CI uses Node 22, frozen installs and a production audit.
- The legacy endpoint defaults to disabled; enabled compatibility shares safe input controls.
- Reports are schema `2.0`, model `dice-only-2`. Zero evidence returns `insufficient_evidence`; usable numeric dice evidence returns `partial_analysis`. Whole-match comparisons abstain. Unknown odds/results are null. Provisional dice contributions are additive and retain precision.
- Real block pools, injury/casualty records, unknown families and unresolved ownership are observable and reduce coverage. Disputed block/damage/referee contributions are excluded; this is a mitigation, not completed semantic support. No board-state or contextual consequence model is implemented.
- Reroll linkage uses actor/step/target/roll evidence across sequences; the original question dice are retained. Turn-6 cross-attribution is fixed, but full skill policies/resource accounting and duplicate semantics remain open.
- UI/CLI derive types from the same runtime Zod report schema; it rejects inconsistent totals/coverage, unsupported versions and fabricated comparative verdicts. Missing scored evidence displays “Not scored.” UI/CLI share copy. UI filters all evidence before paging, shows source segment locators, resets filters, and handles non-JSON errors. Actual half/team-turn/activation labels await reconstruction.
- Current clean-install verification passes 191 unit tests in 33 files, the production build and four Chromium browser flows, including a real sanitized `.bbr`, malformed reports, cancellation and hosting errors. This does not verify game-rule mappings, production-wide quotas, or Vercel deployment behavior. See [REPORT_CONTRACT.md](REPORT_CONTRACT.md).

See [INGESTION_SAFETY.md](INGESTION_SAFETY.md), [the ledger](REMEDIATION_BACKLOG.md#ledger), and [the implementation record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation).

## Subsystem Status

| Subsystem | Status | Required work |
| --- | --- | --- |
| Replay decoding, parsing, attribution | partial | NUF-002–013; parsing is not production-validated |
| Probability and actual-outcome contracts | partial | NUF-007, 009–013 |
| Coverage and verdict reliability | partial | NUF-014–015 |
| Board/state reconstruction and contextual impact | pending | NUF-016–019 |
| API/UI/CLI surfaces | partial | NUF-003, 015, 020–024 |
| Legacy coaching stack | legacy-kept | NUF-025; do not add primary features here |
| Test infrastructure | partial | Existing checks run; NUF-001, 022, 026 add independent correctness evidence |
| Security and deployment readiness | pending | NUF-004–006, 023–026 |
| Documentation and handoff | partial | Backlog established; NUF-027 closes implementation/evidence reconciliation |

## Execution Milestones

### A — Safe and truthful ingestion

Start with NUF-001, 004–007, 026, 002–003, and 008. Capture regressions, fix dependency/entity handling, bound resources, validate input, and preserve ordered source evidence. Apply truthful partial/insufficient result handling as soon as prerequisites for NUF-014–015 are available; do not wait for contextual scoring to stop fabricated verdicts.

### B — Correct dice and ownership

Complete NUF-009–015: independently supported mappings, actual block and damage distributions, action-linked rerolls, beneficiary attribution, complete coverage accounting, and qualified verdicts. A mapping is not proven by stable payload shape, proximity, or a matching snapshot.

### C — Consequence-sensitive analysis

Complete NUF-016–019: reconstruct state, compare valid counterfactual outcomes, account for causal chains without double counting, and aggregate additive impact. Separate dice luck, coaching choices, observed aftermath, and uncertainty. Heuristic value units must not be advertised as calibrated win probability.

### D — Usable, deployable, verified reports

Complete NUF-020–025, 027, and final gate NUF-028. Test real uploads, filters, explanations, errors, platform limits, abuse controls, and the legacy policy. Independent fixtures and focused tests accompany every earlier milestone; NUF-022 performs final corpus reconciliation.

## Next Ready Work

1. **NUF-009:** Continue reverse-engineering from raw replay facts, source-linked state transitions, cross-fixture positive/negative cases and independently derived rule arithmetic. The user confirmed there is no official enum source; this is not an external blocker. Controlled PC captures are useful corroboration when available, but independent engineering and empirical investigation continue without them. Mark inferred meanings and unresolved alternatives explicitly.
2. **NUF-024 / NUF-023:** Configure and test a deployment-wide quota/concurrency mechanism and a Vercel deployment with near-limit upload/response/timeout/worker checks. No deployment configuration/access is present in the checkout. Local safeguards and packaging are ready for that validation.
3. Continue the independently actionable engineering and empirical work in NUF-007–022 while strengthening semantic evidence: natural rules, roles/beneficiaries, block/damage distributions, reroll policies, complete coverage, board reconstruction, valid counterfactual values, causal accounting, calibrated comparisons and independent contextual goldens. Keep NUF-026/027/028 open for final CI and acceptance evidence.

## Carried-Forward Commitments

The previous plan's commitments remain owned work:

- Remaining roll families (`33`, `88`, `67`, other rare families) and argue variants (`42`, `70`): NUF-009, 014, 022, 027. Resolve after correcting the core categories; do not promote on frequency alone.
- Deterministic, framework-agnostic domain behavior, fixture coverage, and no generic fallback odds: NUF-007–019, 022.
- Legacy gate policy and removal criteria: NUF-025, 027. Historical compatibility decisions remain context, not a reason to leave unsafe defaults indefinitely.
- Per-moment calculations, coverage disclosure, novice-readable explanations, cross-surface parity, and test-suite rebalance: NUF-020–022, 027.
- Append-only conversion/implementation logs and synchronized handoffs: required for every issue closure.

## Definition of Done

The remediation milestone is complete only when NUF-028 closes with evidence for every preceding issue. Required evidence includes independent semantic tests, contextual comparison cases, all original defect regressions, bounded security/resource tests, fresh-install quality checks, meaningful `.bbr` browser coverage, and appropriate deployment verification. Missing rule evidence, calibration, or platform access is a documented open requirement rather than a passed check.

Keep stable issue IDs and acceptance criteria. Add new issues for additional defects found during implementation. Documentation-only completion of this backlog does not mark any runtime issue fixed.

## Historical Implementation Updates

The following entries are retained as history. Their confidence/support claims are subject to the November review and the new backlog.

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

## Status Update (2026-02-11, Roll-Type Rebaseline)
1. Added source-tag-aware roll evidence and coverage docs:
- `docs/ROLL_TYPE_EVIDENCE_MATRIX.md`
- `docs/ROLL_TYPE_CODE_COVERAGE.md`
2. Rebased deterministic scoring to high-confidence families only:
- promoted `ResultRoll|10` into scored armor-like checks.
- promoted `ResultRoll|1` to scored `movement_risk` checks after expanded fixture validation.
- promoted `ResultRoll|7` to scored `ball_handling` pickup checks after expanded fixture validation.
- excluded known randomizer families from roll-candidate denominator.
3. Next milestone focus:
1. Resolve highest-impact uncertain families (`ResultRoll|33` -> 39, then `ResultRoll|88` -> 18 and `ResultRoll|67` -> 15) with additional fixture evidence.
2. Maintain one-to-one contract coverage for newly observed `sourceTag|rollType` pairs.

## Status Update (2026-02-11, rollType 1 promotion with expanded fixtures)
1. Fixture expansion:
- Added demo replay coverage through `demo11.bbr` and validated rollType-1 evidence across 12 fixtures.
- Captured reproducible evidence artifact and strict gate config:
  - `tests/fixtures/evidence/rolltype1-expanded-summary.json`
  - `tests/fixtures/evidence/rolltype1-gate.json`
2. Scoring promotion:
- Promoted `ResultRoll|1` from excluded deterministic to scored deterministic as `movement_risk`.
- Added `movement_risk` category to domain types, weight table, coverage maps, UI filters/cards, and explainability copy.
3. Verification:
- Full validation passed (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`).

## Status Update (2026-02-11, rollType 7 pickup promotion with expanded fixtures)
1. Fixture evidence and strict gate:
- Added pickup evidence artifacts and gate config:
  - `tests/fixtures/evidence/rolltype7-expanded-summary.json`
  - `tests/fixtures/evidence/rolltype7-gate.json`
- Added strict gate test:
  - `tests/unit/rollType7Evidence.test.ts`
2. Scoring promotion:
- Promoted `ResultRoll|7` from excluded deterministic to scored deterministic as `ball_handling` pickup.
- Applied contract-based scoring regardless of step-type/scatter-chain adjacency; chain/kickoff patterns remain telemetry evidence only.
3. Verification:
- Full validation passed (`corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm test:e2e`).
