# Catch reroll across a ready/start wait

Updated2026-11-13. Original NUF-012/014/021/022/027 remain in progress. Schema2.55 / dice-only-28 / mobility-possession-41. Ledger14 done/15 incomplete; this scoped continuation does not close the broader requirements.

## Reproduction and raw evidence

At parent0feffa98cc7b8d0f7134561a2771215f32558a11, demo4/source1715 correctly scores its original failed Catch2 at3+, but the fresh replacement6/source1722 remains unscored. `linkTeamRerolls` loses its pending question when the post-question checkpoint first records the controller and again at the ready/start messages. The identity-only transaction already links the physical dice, without certifying their scoring policy.

The stdlib `scripts/extract-catch-resume-evidence.py --check` inventories all12 unchanged public-source SHAs. It selects a numeric question immediately followed by the recorded ready/start wait before inspecting any following choice, face, success or fallout. Exactly one prefix qualifies that raw selection. The fixture preserves numeric headers/dice, all selected roster/cell/counter observations, the prior controller prefix, exact empty control fields and omitted values. Scalar Clock timestamps are excluded from these numeric projections; whole-source hashes remain.

| Source boundary | Raw locator | Observation |
| --- | --- | --- |
| Before question:after1707 |236/3 |Phase5, roster team turns5/6, active roster1; controller and period omitted |
| Controller1709 |237/1 |Explicit NewActiveGamer1, then empty pause and timer telemetry for Team1 |
| Catch header1714 |237/4/1 |Actor41, Step4, stationary(12,9), State1, Skill0, IsEvaluation0 |
| Question1715 |237/4/1/0 |Gamer1, team reroll available, Pro unavailable; original Catch2 at3+, Status1/NewRoll1 |
| Menu:after1715 |237/5 |Controller1, active player46, catcher41, team counter1 |
| Ready1717 / start1718 |238/1 /238/2 |Both exact empty native controls |
| Resumed:after1718 |238/3 |Same complete observed board, controller/counters/catcher square; counter still1 before decision |
| Continuation1720 |239/1/0 |Same catcher/target/square, State3 |
| Choice1721 |239/1/0/0 |Gamer1, Used1 |
| Replacement1722 |239/1/0/1 |Fresh Catch6 at3+, Status2/NewRoll1/Outcome1 |

The menu/resumed explicit roster team IDs are `[null,1]`; the omitted opponent ID remains unknown. Controller1, active roster1, active player46 and catcher41 are distinct observed fields. The catcher’s CanAct/status/situation and the period are omitted and remain null. The new contract does not fill them from another snapshot or imply complete legal eligibility. A later counter is not inferred as zero from the used choice.

## Admission and accounting

`catchRerollResume.ts` certifies this stationary Catch grammar with the exact question, two cached carrier observations, empty ready/start controls, continuation header, used choice and fresh result in source order. Its input is the prefix-qualified original-question scan and current ownership timeline. The prior checkpoint and any explicit controller change must resolve the question’s controller before the question; the post-question board cannot repair a missing/contradictory earlier controller. Phase, observed team-turns, namespace and period observations must remain compatible. The two waiting boards match completely, including raw unknowns; cached weather/kickoff dice match and unknown dice fields break admission.

Only that complete proof permits the existing team-reroll linker to transport its pending question across these exact events and the controller-observation refresh. Other controls, unknown fields, gates, extra checkpoints, state/cell/turn/counter/controller/namespace changes and unsupported longer Catch spans withhold compound support. An independently qualified first die survives. Qualification ends at the fresh result; no successful SPP, possession, stable aftermath or later counter selects it. Other movement/skill/gated/declined wait grammars are not promoted by this source.

Both actual innovations are retained once:

- Original2 at3+:−2/3.
- Fresh6 at3+:+1/3.
- Group delta:−1/3; unchanged weight1.1 gives−11/30 (−0.367 displayed).
- Fixed full-reroll policy chance:8/9 (88.9%), separately stated from the replacement’s own2/3 chance.
- Recorded resource:one team reroll used. Tactical price and later consequences are separate.

The original question becomes a non-random offer, and source1721 a non-random used decision. Source1722 owns both physical dice and their combined contribution. The previously scored original is neither erased nor scored twice; the team total gains only the replacement’s+11/30. Pre-roll/context estimates are suppressed for this proof, which does not establish a full legal board or counterfactual Catch policy.

The required `catchRerollResume` receipt retains the prior-controller boundary/change index, ready/start/header source indices and both observed wait snapshots. The shared schema validates exact relative source/locator order, typed native Catch/used-choice relationships, raw nullable fields and explicit roster team IDs. The owner’s active roster slot must contain its observed team ID; a swapped roster index cannot silently become a valid receipt. This is structural consistency validation, not cryptographic raw-byte attestation.

## Independent tests and export integrity

`catchRerollResume.test.ts` joins the one stdlib witness to every report snapshot field, prior controller source, distinct actor/active-player roles, dice and arithmetic. It cuts the replay at source1722 and tests every replacement face without later fallout. Twenty-nine malformed-prefix/state cases and an invalid roster namespace retain the earlier qualified first; an explicit pre-question gamer change can explain a previously different controller. An unsupported longer Catch returns a valid partial report rather than generating an invalid compound.

Synthetic trees cover five targets,36 first/second face pairs and always/odd-failure/never reroll choices:540 cases have zero mean actual-draw deviation, preserve one scored check and separately count accepted fresh draws. The declined/no-use branches retain known firsts; these tests do not claim empirical declined-ready transport support. The existing4,860 decision trees and110 direct-prefix reroll witnesses remain unchanged.

A final review reproduced two accepted receipt forgeries: coherent category relabeling and swapping both active roster slots. Explicit team-ID observations now bind the slot. The category probe also reproduced across all four admitted numeric families, including an equal-weight Rush→armor relabel; a common family/category invariant now rejects all four coherent forgeries. No valid source’s probability, contribution or category changes from that guard. Named receipt/order/controller/snapshot and category regressions retain the exact failure diagnostics.

The independent ownership suite joins this new raw continuation’s actor/team/math instead of omitting it or resetting historical cohort hashes. A serial real CLI case checks JSON and text independently of top moments. The real HTTP suite keeps exactly ten POST admissions: its generic valid-payload case now uses demo4 and preserves every previous payload-field assertion while adding source1722 proof/math checks. Positive XML intake remains separately exercised by the existing diagnostics and browser checks.

## Complete report comparison

All12 reports are compared to exact parent0feffa9. Independent raw arithmetic and source joins check the one new group, namespace/nullable snapshots, derived coverage/category/team sums/headline gap/moments/summaries and physical ownership. Reversing only those checked changes must deep-match every other parent field.

| Scope | Result |
| --- | --- |
| Earlier scored objects retained exactly |2,233; original1715’s first-die contribution remains inside the combined1722 group |
| Scored check count |2,234, unchanged |
| Numeric reroll groups |110 unchanged +1 resumed Catch =111 |
| Newly covered actual dice |1 replacement; original already covered |
| Candidate denominator |demo4 decreases by1 when two rows become one qualified group |
| Original/choice/replacement records |Same three source identities; two non-random controls and one scored group |
| Other raw dice/source facts/order/aliases |Unchanged; only the original score owner and replacement coverage bookkeeping change |
| Context |27 ranges,0 public points, unchanged |
| Verdict |12 partial-analysis abstentions |
| Maximum report |2,470,834 bytes; unchanged4MB cap |

Final comparison hashes, complete local gate counts and screenshot inspection are recorded in the matching append-only implementation entry. Exact-candidate CI is checked after publication and linked in the handoff. The temporary comparison script/receipt are `/tmp/nufflizier-catch-resume-regression.cjs` and `.json`.

## Product verification and remaining work

UI/CLI share the actual-draw explanation plus the readiness/controller/roster/counter trace. They distinguish active player46 from catcher41, retain unknown period/action availability, and state the separate resource price. The new43rd browser flow uses actual demo4 domain output through deterministic response interception, then upload→player41/ball-handling/scored→source1722 Why→88.9%/Success/−0.367→export→reset at1280×800 and390×844. Actual HTTP/CLI worker checks are separate; interception is rendering proof, not hosted/API proof.

Production4s/256MiB/4MB, upload/XML/event and shared10-admissions/minute/two-lease limits are unchanged. Broad mixed/gated/resource policies, source coverage, full state/successors, calibrated context and current-schema hosted/integrated acceptance remain open. No provider/store/account/Stripe, billing/plan, deployment/production/legacy, merge or release action is part of this implementation.


Final local verification on Node22.17.1 passes2,620 unit/API cases (2,581 pure +29 serial CLI +10 isolated HTTP), real Redis/lint/types/production build and43 Chromium flows across100 unique unit/API suites. The final desktop/mobile screenshots are inspected; the readiness/actor/counter explanation and per-draw math wrap without overlap, and the mobile table retains its own horizontal panning. Fresh12-source generation/shared-schema validation and the strict complete parent comparison pass after all workers exit. The implementation ledger records exact commands/log paths and hashes. Other browser engines/viewports and hosted schema2.55 remain unverified.
