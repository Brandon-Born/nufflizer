# Nufflizier Project Plan

Last updated: 2026-11-11

## Start Here

The authoritative work queue is [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md). It contains permanent IDs **NUF-001 through NUF-028**, source locations, reproduction seeds, dependencies, acceptance criteria, and closure requirements. Its ledger is the status source of truth. Eleven issues (NUF-001–008 and NUF-024–026) have closure evidence. Seventeen remain incomplete. Shared quota, exact upload boundaries and two large real replays passed on the isolated Vercel Preview. NUF-023 awaits its NUF-021 report integration dependency and exact-candidate hosting verification under the zero-cost restriction. NUF-009 is active reverse-engineering work; official enum definitions are not a prerequisite.

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

Baseline reviewed commit: `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`. The active remediation branch is `codex/backlog-remediation`. See the implementation log for exact CI and isolated Preview verification.

- Ingestion now preserves XML document order, rejects malformed replay envelopes/messages, and bounds transfer, decompression, XML/message work and events. Primary API, legacy opt-in and CLI use terminating workers.
- Dependencies moved to supported Next.js 15.5.29 / React 19, parser 5.12.0 and Zod 4.6.7, with a refreshed lockfile and zero production advisories at validation. CI uses Node 22, frozen installs and a production audit.
- The legacy endpoint defaults to disabled; enabled compatibility shares safe input controls.
- Reports use schema `2.12`, dice model `dice-only-18`, and context model `mobility-possession-8`. Zero evidence returns `insufficient_evidence`. Usable numeric dice evidence returns `partial_analysis`. Whole-match comparisons abstain. Unknown odds and results are null. Provisional dice contributions are additive and retain precision.
- Replay `1-4-0-0` has scoped UI-backed Rush (1), Dodge (2), Pick up (4), and Catch (7) numeric contracts. Freshness/status, one explicit D6, effective target, binary outcome and ownership are required; contradictory thresholds and unmodeled replacements are excluded. Catch-specific natural-one/six edges have playback evidence. Block/Blitz action labels are corrected. `ResultUseAction.TeamId=0` is preserved as raw evidence but no longer assigns the acting side. See [REPORT_CONTRACT.md](REPORT_CONTRACT.md#model-dice-only-4-numeric-scope).
- Linked raw block pools and verified 2D6 armor contribute dice units with explicit roles. Applied block skills and choices are separate evidence. Verified Regeneration and direct KO recovery have scoped odds, including one verified Kegs modifier. Apothecary chains retain original and replacement dice and link supported applied choices. Unverified injury and casualty distributions and referee outcomes stay visible with unknown odds. A conservative pre-roll reducer supports a limited Dodge/Pickup mobility and possession estimate in separate context units. See [STATE_RECONSTRUCTION.md](STATE_RECONSTRUCTION.md).
- Reroll linkage uses actor/step/target/roll evidence across sequences; the original question dice are retained. Explicitly declined numeric rerolls now recover the original attempt from a matching kept-result summary at single-attempt odds; that summary does not create a second roll. Missing/mismatched gamer IDs and intervening unknown/state/skill events break the link. Turn-6 cross-attribution is fixed, but full skill policies/resource accounting and duplicate semantics remain open.
- UI/CLI derive types from the same runtime Zod report schema; it rejects inconsistent totals/coverage, unsupported versions and fabricated comparative verdicts. Missing scored evidence displays “Not scored.” UI/CLI share copy. UI filters all evidence before paging, supports player/initial-name and observed half/team-turn navigation, inspects one observed activation, resets filters, and handles non-JSON errors. Initial roster names are explicitly labeled as historical observations. Verified half/turn labels are shown when observations support them; unverified source segments remain source locators.
- The timeline explains a scoped recorded stand-up, a dodge entering or leaving adjacency to a teammate holding the ball, and linked fall, damage and turnover evidence. A grouped dice subtotal references existing contributions. The timeline also follows a verified pickup into later movement and links an immediately recorded touchdown to the same carrier’s successful move. The touchdown adds no dice score. See [STATE_RECONSTRUCTION.md](STATE_RECONSTRUCTION.md) and [REPORT_CONTRACT.md](REPORT_CONTRACT.md).
- A confirmed failed ordinary Block Foul Appearance test can record a lost player activation while another teammate continues the same observed team turn. Later availability excludes that known spent actor; omission alone does not imply a spent activation. The lost Block value remains unquantified.
- Completed ordinary Move and verified terminal mental-trait chains have source-linked same-turn availability effects. Current observed mental effects also establish tackle-zone suppression across turns and a scoped next-activation end/test path. See schema2.12 in [REPORT_CONTRACT.md](REPORT_CONTRACT.md). Omitted effects, general duration rules, arbitrary reactivation and full skill/resource policies remain unknown.
- Purchase evidence binds a unique selected mercenary type to the first following roster observation, preserving replacement/removal source links. Source008 ID48 selects type1455 then1121 with distinct innate lists; missing acquired skills stay unknown. Fresh unique pre-roll roster membership can establish ownership for an unnamed player absent from the initial roster. Conflicting ownership remains unresolved.
- Ordered checkpoints retain bounded numeric player-type and innate/acquired skill observations from their own player Data. Pre-roll actor/target traits require matching current ownership; omitted lists remain unknown and recruitment/ID reuse cannot inherit earlier traits. No new trait-conditioned odds are claimed.
- Failed pickups can link immediately recorded D8 bounces and verified catches, including retained-original catch failures followed by another bounce. The group references existing dice contributions by team and does not quantify possession or turn cost.
- Context coverage separately counts observed positions, possession, clocks, activation identity, quantified impacts and linked movement consequences over roll candidates. Deterministic no-roll records and verified repeated kept summaries add no random outcome. Source home/away order is preserved.
- All 12 sanitized demos return reports locally. The isolated Preview acceptance and the Node 22 checks are recorded by exact candidate in [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

See [INGESTION_SAFETY.md](INGESTION_SAFETY.md), [the ledger](REMEDIATION_BACKLOG.md#ledger), and [the implementation record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation).

## Subsystem Status

| Subsystem | Status | Required work |
| --- | --- | --- |
| Replay decoding, parsing, attribution | partial | NUF-002–008 closed; remaining semantic and role contracts in NUF-009–013 |
| Probability and actual-outcome contracts | partial | NUF-007, 009–013 |
| Coverage and verdict reliability | partial | NUF-014–015 |
| Board/state reconstruction and contextual impact | partial | NUF-016–019 |
| API/UI/CLI surfaces | partial | NUF-003, 015, 020–024 |
| Legacy coaching stack | legacy-kept, default disabled | NUF-025 closed; explicit opt-in shares safe ingestion |
| Test infrastructure | partial | Existing checks run; NUF-001, 022, 026 add independent correctness evidence |
| Security and deployment readiness | partial | NUF-004–006 and 024–026 closed; NUF-023 awaits report integration and new-candidate hosted acceptance |
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

The latest runtime step observes bounded Confused effect44/provider31 or51 in each current snapshot, including opponent turns, without carrying missing effects forward or treating ready activation flags as tackle-zone recovery. A matching next-activation effect end removes the old suppression but leaves tackle-zone recovery unknown until separately observed. Source-backed fresh trait tests can preserve verified movement; a new failure waits for a fresh board. A failed Loner4+ chain now confirms the kept original and one team resource spent. Next, implement the saved non-4+ Loner candidates under their own identity/threshold contracts, and establish drive-boundary expiry and broader completion/reactivation/resource policies. Current trait-table legality, a valid late deciding failure continuation, held-out quantitative context and tactical calibration still block integrated acceptance. New-candidate hosting remains pending under the zero-cost restriction.

The user-supplied `replays/` corpus is Git-ignored and now inventoried: 27 local files, 35,121 raw step emissions and 41 message/type pairs. See [LOCAL_REPLAY_FINDINGS.md](LOCAL_REPLAY_FINDINGS.md) for reproducible numeric evidence, counterexamples to historical labels, and source-linked investigation seeds. One file exceeds the application's decoded-size limit and was inspected only with a larger offline cap. No scoring contracts were promoted.

Computer Use follow-up: [REPLAY_UI_EVIDENCE.md](REPLAY_UI_EVIDENCE.md) records 96 UI-annotated cases, 398 source-verified step records and 26 top-level event records from twenty-two saved BBRs (twenty-one local originals and one repository demo), identifying 41 roll families and all five encoded block symbols in concrete contexts. Includes successful/failed Loner gates, pickup versus catch, hand-off initiator versus recipient, self-damage, opposing skill ownership, Pro, Jump over, Chainsaw, Regeneration, Animosity, Ball & Chain, bombs and Breathe fire. Further mining adds defender-selected blocks, Sidestep control, apothecary casualty choices, successful Regeneration and successful interference followed by a separate catch, with both catch success and failure corroborated, plus Brawler selective die replacement, Grab and attacking/defending Wrestle. Head Injury, Broken Arm and Smashed Knee secondary casualty results, distinct Decay/niggling Injury modifiers and a separate Frenzy attack are now corroborated; throw-in geometry fits all16 encoded endpoints under an explicit, still-inferred model. A completed hotseat match produced no replay export; its UI-only notes remain local. Failed Loner and controller handoff can repeat pools without fresh dice, and pass Outcome 0 covers fumble, inaccurate and wildly inaccurate results. Successful hit checks can harm their subject. Implement contracts using this evidence plus held-out/rule validation; production mappings have not yet changed. Source020 adds a prayer/effect pair, a Block/Horns chain and independently displayed Extra Time/home turn20. Its oversized XML requires the explicit offline32MiB verifier option. UI-085 separately confirms an offered and used Dump Off reaction, an accurate defender pass, a successful teammate catch and the resumed attacker block; the earlier UI-083 decision remains unconfirmed. The [in-game skill reference](GAME_SKILL_REFERENCE.md) adds25 separately recorded tooltip rule descriptions. A separate [installed-image extraction](INSTALLED_ENUM_EVIDENCE.md) now preserves82 gameplay enum tables /1,428 explicit name-value entries with hash/offset provenance; naming evidence is substantially stronger, while behavior and namespace/version linkage remain acceptance work.

Controlled match follow-up: [HOTSEAT_EXPERIMENTS.md](HOTSEAT_EXPERIMENTS.md) records a successful bribe, neutral Argue5 followed by failed Bribe1 then a separately selected successful Bribe4 on the same ejection, staff counts, and direct Stunty Badly Hurt→apothecary→No Injury. Fourteen UI-only observations now also include on-pitch KO→Stunned apothecary mitigation and repeated Treacherous Trapdoor entries:6/3/5 succeed,1 fails with team-reroll offer; keeping1 removes the player, directly rolls injury[1,3] Stunned and leaves the turn active. The match finished0–0, but Replay/Download remained disabled and the local replay count stayed28. Raw linkage is unavailable at this checkpoint; the96 paired cases remain separate. Natural1 Argue and full policy/state acceptance remain open. The Human research roster is a custom team, not a saved template.

1. **NUF-009:** Continue reverse-engineering from raw replay facts, source-linked state transitions, cross-fixture positive/negative cases and independently derived rule arithmetic. The user confirmed there is no official enum source; this is not an external blocker. Controlled PC captures are useful corroboration when available, but independent engineering and empirical investigation continue without them. Mark inferred meanings and unresolved alternatives explicitly.

   Cross-corpus follow-up: the12 demos supply a secondary casualty face1 missing from the27-file local scan (sequence376/step1/message4, hash/chain in `LOCAL_REPLAY_FINDINGS.md`). All six secondary faces now have raw candidates across the39 files; UI-086 independently confirms the demo case as Head Injury followed by successful Regeneration. Scoped nested-message scans still find no failed Bribe or die1 Argue. Mine existing state/decision chains and six local sources without positive UI fixtures before generating duplicate scenarios.
   UI-087/088 now add source008: failed Pro1 preserves the original Chainsaw1 (final summaries NewRoll0), self-damage, defender Block and a recruitment ID48 reuse/omitted-Data counterexample with stale playback identity. At that source008 checkpoint, nine local sources lacked positive fixtures; source018 reduced the count to eight, source011 to seven and source025 to six. The original remaining-source triage independently recounted13,004 step emissions in the ten local sources without positive fixtures, retaining37 targeted direct-message candidates. FireballHit, BreatheFire, Chainsaw and Loner each supply both raw outcome branches. See `LOCAL_REPLAY_FINDINGS.md` for scope; these are source-held-out candidates, not a blind test set or accepted semantics.
2. **NUF-023:** Carry the passing real replay, worker and boundary checks forward to final NUF-021/028 integration. NUF-024 has shared-backend evidence from the isolated Preview; configure a durable store before maintaining an ongoing Preview or production deployment.
3. Continue the independently actionable engineering and empirical work in NUF-008–022 while strengthening semantic evidence: natural rules, roles/beneficiaries, block/damage distributions, reroll policies, complete coverage, board reconstruction, valid counterfactual values, causal accounting, calibrated comparisons and independent contextual goldens. Keep NUF-027/028 open for final acceptance evidence.

## 2026-11-10 verified numeric implementation checkpoint

The accumulated research is preserved on GitHub at `34fc68421a1371bb66e14f072160b33fedca26b0`; the tested numeric runtime slice is also remotely verified at `f52189727c76121f992ffd7302d9b10140f640b8`. Subsequent runtime work applies a deliberately limited part of that evidence: corrected core labels/categories and action ownership, strict numeric admission, and one explicitly linked full team-reroll policy. Exact sanitized playback fragments exercise the production parser/scorer, including UI-006 away attribution, UI-008/009 separate Rush/Dodge, UI-002 Pickup, UI-014 recipient Catch at 8/9, and UI-093/097 Catch edge rules. Known Really Stupid/Foul Appearance/Loner identities remain unscored policies.

The earlier research paragraphs record their checkpoint state; their “runtime unchanged” statements do not describe this subsequent implementation. NUF-007/009/012/013 remain in progress. No contextual model, complete skill/resource policy, damage/block support or comparative verdict is claimed. Failed Bribe and natural-one Argue remain without paired raw evidence; both completed hotseat probes produced no export, so repeating that route is not prerequisite to independent engineering.

## 2026-11-10 observed state checkpoint slice

NUF-016 is now in progress. `ReplayModel.boardCheckpoints` preserves ordered, source-linked numeric board observations with null omissions, conservative held-possession reconciliation and explicit off-pitch geometry. Last-observation lookup excludes future snapshots; it is not an exact pre-roll reducer. Thirteen regressions include exact UI-095/096/098/099/084 event projections and adversarial boundaries. Scores/report semantics remain dice-only-3. See [STATE_RECONSTRUCTION.md](STATE_RECONSTRUCTION.md) for supported behavior and remaining policies, and [REPLAY_CAPTURE_GAPS.md](REPLAY_CAPTURE_GAPS.md#current-game-dependent-stopping-criteria) for finite game-dependent targets. Game collection is not complete; software work is independently actionable.

## 2026-11-10 retained original reroll slice

NUF-012/014 remain in progress. UI-022 reproduced a missing failed Pickup: its fresh original die lives in QuestionTeamRerollUsage, followed by Used0 and a NewRoll0 kept summary. Model dice-only-4 admits this narrowly linked evidence once, retaining original dice/question provenance without applying reroll odds. Same-step independently emitted originals and repeated kept summaries cannot add another contribution. Unknown standalone summaries remain excluded. Independent demo1 decoding identifies two additional ball-handling attempts (Pickup4+ die3 and Catch5+ die3); browser export asserts their single-attempt odds and source dice. Full skill/gate/resource and causal-action policies remain incomplete; no issue closes. See [REPORT_CONTRACT.md](REPORT_CONTRACT.md) and the latest implementation record.

## 2026-11-10 block, armor, context and shared quota checkpoint

NUF-007 closes its numeric-contract acceptance; block and reroll policy completion stays with NUF-010/012. The original player-50 self-damage now scores negative armor luck at -10/36, verified by its sanitized source fragment. Three block pool sizes, defender choice, failed Loner, Brawler and Wrestle have raw/selection regressions. Report model dice-only-5 scopes raw distributions separately from applied resolution. Explicit source locators and conservative state transitions support a partial mobility-possession-1 model; it distinguishes early/late lost moves and marked/safe pickup bounce geometry but does not yet price a late scoring threat or calibrate comparative verdicts.

The Redis gate enforces two shared leases and ten admissions per minute with bounded, anonymous metadata. Real Redis tests exercise independent handlers, expiry, spoofed headers and fail-closed failures. The user authorized a separate preview, restored CI and a new free-tier store if available; hosted evidence is tracked separately. No release gate closes.

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


Source018 follow-up (2026-11-10): UI-089 pairs three Fireball4+ checks6/1/2 with the explicitly displayed home caster, away11 end-turn/home12 boundary, AV10+ [6,4] and injury[6,2]+Spell1 KO. Four exact steps and four direct context events brought checkpoint totals to89/356/20 across twenty saved sources. Eight original local hashes then lacked positive fixtures. Corrected an earlier prose namespace error: Fireball PlayerStep StepType19 is distinct from DamageStep Source3; saved raw extracts were already correct. NUF-009/013/016 remain incomplete.


Source011 follow-up (2026-11-10): UI-090–093 add Breathe fire4+ die4−Strength1 Failure with original kept; natural1 self-Prone/AV10+[6,2] Failure; and die5 Success/target Prone without armor. A separate Blitz/ball-return chain independently displays Catch4+1−5 Failure and Catch4+6−4 Success, both raw Difficulty6. Natural6 is therefore a catch-specific exception to the plain modified-sum check; modifier holders and catchers differ. Current93 cases/376 distinct steps/20 direct records across twenty-one sources (twenty originals plus one demo); seven original hashes lack positive fixtures. Full policies/state/version acceptance and production semantics remain incomplete.


Source025 checkpoint (2026-11-10): UI-094 adds seven exact step records for a Long pass fumble1→Pass6 Accurate, away interference4−4 Failure and home Catch1→Catch4 Success. Roles and controller handoff stay separate; team rerolls remain4/3. Current94 cases/383 steps/20 direct records across22 sources;41 named families. Six local originals lack positive fixtures, independently recounted at8,408 step emissions. [REPLAY_CAPTURE_GAPS.md](REPLAY_CAPTURE_GAPS.md) scopes remaining collection separately from implementation acceptance. Failed Bribe/raw linkage, natural1 Argue, field/state policies and full contract acceptance remain open. No runtime change or issue closure.


State/static-data checkpoint (2026-11-10): UI-095/096 add crowd removal without armor, off-pitch CanAct1/TackleZone1 and a carrier-knockdown/loose-ball transition with Carrier/IsHeld omitted. Current96 cases/398 distinct steps/26 direct records across22 sources. The installed [offline JSON extraction](OFFLINE_RULE_DATA_EVIDENCE.md) preserves178 rows; all105 skill,11 casualty and five characteristic name/code pairs agree with the executable enums after spelling normalization. Package precedence and behavior remain unresolved. Preserved client UI logs corroborate the hotseat Bribe1 failure but supply no serialized replay roll/step. No production mappings or issue closures change.


Attribution/provenance follow-up (2026-11-10): all6,342 direct ResultUseAction emissions in27 originals explicitly report TeamId0, including2,920 actors on initial roster index1;113 initial memberships remain unresolved. UI-096 independently observes an away actor with0. Preserve this counterexample under NUF-013; do not infer side from that field alone. Static archive discovery/path registration is corroborated by the hotseat session log, with conflicting external/internal package revision3/23 retained. No additional paired cases or issue closures. A natural1 Argue trial has not started: the game is at offline Connection awaiting manual profile connection after a hotseat-settings navigation fault.


Natural-roll triage (2026-11-10): a scoped39-source audit of3,822 direct single-D6 ResultRoll emissions with binary outcomes finds nine disagreements with plain modified-sum thresholding: eight natural6 and one Catch1+1. All selected records agree with their recorded Difficulty and a2–6 clamped threshold relationship, which remains a corpus hypothesis rather than universal rule acceptance. Exact source/message projections and reproducible tooling are in LOCAL_REPLAY_FINDINGS / bb3-threshold-model-audit.json. Source016258/1 and source025444/6 are next independent UI targets. No paired-case count, runtime contract or issue status changes. The same manual profile-connection handoff remains pending.


Offline handoff follow-up (2026-11-10): the user connected the local profile manually. A fresh main-menu observation confirmed the handoff cleared. My Teams is disabled in offline hotseat setup; default rosters transition directly from Chaos Chosen to Chaos Renegades in the inspected portion, providing no Breathe Fire reference through that route. No match was started. Profile → History → Saved Replays remains available offline and successfully loads source025. UI-097 independently displays away16 Action2: Quick pass4+ die5 Accurate, Catch2+ die1+Diving Catch1 Failure, Catch skill replacement3+1 Success, then receiver possession. Reroll counters stay1/1. Three exact records444/0,5,6 bring totals to97 cases/401 steps/26 direct records across22 sources. This closes the UI-transcription gap for that specific arithmetic counterexample, not its broader supported rule contract or a production issue. Source016258/1 Pass6 under negative modifiers remains the next discriminating target; raw-linked failed-Bribe and natural1 Argue gaps remain open. The previous profile handoff is resolved; the game remains open with saved-replay analysis resumed.


Source016 follow-up (2026-11-10): UI-098 independently displays away8 Action9 Long pass4+ die6-4 Accurate, with Long pass-2 and grouped Disturbing Presence-2. Home interceptor10 then fails Interfere4+ die5-8 (accuracy-3, four tackle zones-4 and Disturbing Presence-1); Bounce2 lands at[6,9] and home8 starts. Four exact steps and five direct context records retain the pass/response, role ownership and held/intermediate/loose ball states. Intermediate309/5 retains Carrier46 after the pass while IsHeld is omitted and the ball coordinate differs from the passer's cell; Carrier alone is not sufficient held-possession evidence. UI-099 adds two separately selected Foul Appearance2+ die1 failures (away Actions5/6), followed by different teammates acting during the same turn. Five exact steps/four BoardState records preserve each actor's explicit CanAct1 to omission transition, subject-owned Skill10, unchanged cells and continued team turn. Omission is not promoted to a universal false/default rule. Current totals99 cases/410 distinct steps/35 direct records across22 saved sources; six original hashes remain unpaired. The source016 numeric verifier passes; deliberate pass-Outcome and intermediate-Carrier mutations reject; global ID/locator recount passes. No runtime mapping, rule contract or backlog issue is closed.


Offline export follow-up (2026-11-10): HS-B used two default Black Orc teams in offline local hotseat, bought no inducements, and finished normally0–0 after both sides ended turn16. The results view exposed no Replay/Download control. At15:38:14Z the replay directory remained28 files with unchanged newest write/length. The temporary Hold→Toggle input test was restored to Hold; pitch selection remained unresolved while menu/End of Turn worked. See HOTSEAT_EXPERIMENTS for setup and limits. No new raw replay, paired case, runtime mapping or issue closure resulted. Raw-linked failed-Bribe/natural1 Argue remain blocked on a viable capture route; existing-file research remains possible. Current paired totals remain99 cases/410 steps/35 direct events across22 sources. The game is open and the full data-gathering objective remains incomplete.
