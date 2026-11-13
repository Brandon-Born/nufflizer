# Actual-draw numeric reroll scoring

Date:2026-11-13. Parent:`2a8ecaeefcf9f32428d89bced696ea751ca0a548`. Work item:NUF-029, discovered while auditing NUF-012/018. Current contract:schema2.53, dice-only-26, mobility-possession-41. Full reroll eligibility/resource policies, complete successors, coverage and calibration retain the original NUF-012/014/018/019 requirements.

## Reproduced bias and correction

The parent scores a first success against single-attempt probability p, but scores an observed replacement against composite probability q=1−(1−p)². Those are different outcome-selected benchmarks. For a fair2+ check rerolling every first failure, enumerate36 equally likely first/second face pairs:30 first successes contribute1/6 each, five rescued successes contribute1/36 each, and one double failure contributes−35/36. The mean is25/216≈0.115741, although the actual dice are fair. Existing tests preserved this arithmetic without testing the complete decision tree.

Count the actual draws instead. A first failed die contributes−p. An observed fresh replacement contributes actualReplacement−p. Their grouped delta is their sum, before the unchanged provisional category weight. A successful2+ rescue is−2/3, and a double failure is−5/3. The fixed policy still has35/36 success and1/36 failure; that hypothetical whole-check chance does not replace either actual draw's probability. For target t, p=(7−t)/6 and the correction relative to the parent is−p² for each admitted used replacement. First successes and retained original failures keep their existing single-attempt arithmetic.

Conditional context uses the terminal replacement deviation, actualReplacement−p. It does not charge the already witnessed initial failure again at the replacement's decision point. This changes a synthetic complete-availability context benchmark, but none of the27 current public context ranges or zero public point contributions. The context model version changes to make that scope explicit.

Each scored numeric two-attempt event now requires `metadata.rerollDraws`:original source ID, original face, base success chance, initial delta and replacement delta. The schema joins two distinct complete physical dice records to the same score, verifies their original/fresh flags, family, subject, target, face/result, source order and source/choice links, and requires the exact per-draw formula. It rejects a missing/forged receipt, the old composite-score arithmetic, altered original or replacement face, resource/offer/gamer mismatch and duplicate control consumption. A qualified team replacement spends one recorded team reroll; own Dodge7, Sure Hands61 and Catch6 replacements spend zero team rerolls. Those receipts do not infer complete resource availability, gate policies or future uses.

## Prefix and serialization scope

Observed own-skill replacements are admitted from the witnessed original→used skill→fresh replacement prefix. Their later fall, bounce or unknown reaction cannot select which already observed failures count. The original full aftermath, ball, activation and contextual policies remain separately guarded. A future unknown suffix cannot revoke a qualified prefix. An adjacent verified copied summary is an alias; a later fresh emission of the same check needs another policy and is unscored. No second resource may reroll that die again under this contract.

A separately emitted original can join a verified team offer only when unique and immediately preceding, apart from the established checkpoint carrier, with matching same-step locator, source order, action, dice/thresholds, ownership and checkpoint epoch. The ordered matching offer/used choice and one fresh replacement are required. Contradictory, ambiguous, interrupted, source-less and unverified-version chains cannot gain compound support or duplicate the original. A valid original survives an unsupported later policy. Kept-original copies remain a single draw and score.

All additions use replay1-4-0-0's existing numeric family contracts:Rush1, Dodge2, Pickup4 and Catch7. Unsupported flags, thresholds, modifiers and ownership conflicts remain excluded. The BB2020 rule reference, printed page24/PDF page25, independently requires accepting a replacement and forbids rerolling a die more than once; its special restrictions and eligibility requirements are not certified merely by a raw used choice. The previously audited PDF SHA256 is `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`; original rule/UI/namespace provenance is retained in the semantic and skill evidence documents.

## Independent evidence

`scripts/extract-numeric-reroll-score-evidence.py --check` uses the stdlib raw XML inventory decoder and original whole-file SHA256 bindings. It reproduces `tests/fixtures/evidence/bb3-numeric-reroll-scores.json` without application maps or a later success/fallout admission filter. It selects57 team and53 own-skill prefixes across all12 sanitized demos and preserves their original/choice/replacement step fields, raw dice/flags/thresholds/modifiers and locators. The separate test joins all110 actual report contributions to those raw facts and independently computes their delta, unchanged weight and whole-policy chance. This inventory is a prefix/arithmetic oracle, not a certification of every possible eligibility or game policy.

Among all124 raw public team-reroll questions, zero have an earlier numeric original of the same family in that raw step. Separately emitted serialization tests are explicitly synthetic source-derived variations; they are not new empirical matches or evidence of wider BB3 serialization support. Existing independent UI and rule evidence for the original skill/family contracts remains unchanged.

The full-pipeline zero-mean tests enumerate4,320 team decision trees:four families × five targets2–6 × two serialization forms × three non-anticipatory policies ×36 equiprobable face pairs. Policies always reroll a failure, reroll only odd failed first faces, or never reroll. Another540 trees exercise the three supported own-skill families and all targets. Each test checks actual score and physical draw conservation; the always-reroll policy separately checks its complete success count. Integrity and prefix tests include forged receipts, copied summaries, unsupported third fresh emissions, conflicting/unknown/interrupted originals, ownership and namespace failures. The two XML serialization cases also exercise the actual parser. This establishes the bounded draw accounting, not calibration of reports with unmodeled policies.

Frozen historical score/cohort SHA256 expectations are unchanged. Their compatibility projection reconstructs only the explicitly superseded composite benchmark and its linked subtotals/tags; it is labeled historical evidence, not a current correctness oracle. Current correctness is enforced separately by the independent decision trees and raw110-source joins.

## Complete report conservation

All12 current complete reports were compared against exact parent2a8ecae reports. The comparison independently joins the110 raw prefixes, verifies new delta=actual−2p and old delta=actual−q, checks the−p² shift, then reconstructs and checks current action/category/team sums, score gaps, exclusions, moment ordering and summaries before reversing only the declared changes. Every other field must deep-match the parent, including pre-roll state, ownership, traits, damage, physical dice identity/disposition, odds, context and verdict fields.

| Checked output | Result |
| --- | --- |
| Same ordered scored source IDs |2,231 |
| Corrected reroll scores/formulas/receipts |110:57 team,53 skill |
| Newly visible non-random controls |28:14 offers,14 used decisions; zero extra score |
| Corrected movement-fall subtotals |28 |
| Corrected ball-chain team subtotals |6 |
| Tags reflecting a rescued likely first failure |30 |
| Existing nested dice gaining a now-visible offer parent |14; no new physical die |
| Context ranges / public context points |27 /0, unchanged |
| Verdicts |12 partial-analysis abstentions |
| Largest serialized report |2,470,834 bytes, below unchanged4MB |

Expected2+ rescue example:demo2/source702, first failed source698 face1, replacement face6. Expected35/36 remains97.2%; the actual first−5/6 plus replacement+1/6 gives−2/3 before weight1. API and CLI retain the same receipt and shared explanation. The browser flow verifies this row, its Why explanation and unlucky-first-die tag, desktop/mobile layout, JSON export and reset. Source controls remain excluded non-random observations.

The local full gate and exact-head CI receipts are recorded in the implementation ledger. Production4s/256MiB/report4MB, upload/XML/event caps and shared10-admissions/minute/two-worker-lease limits remain unchanged. No provider, Stripe, billing or deployment change is part of this correction. Current-schema hosted integration, complete state/choice/successor coverage and calibrated whole-match analysis retain their original acceptance requirements.

Closure receipt:NUF-029 is done after the full local gate and completed [exact ac4eb7c CI43421025804](https://github.com/Brandon-Born/nufflizer/actions/runs/43421025804):2,475 unit/API cases, real Redis, production build and41 Chromium flows. Desktop1280×800 and mobile390×844 screenshots were visually inspected; JSON export, source receipts, shared explanation, filtering/reset and console/overlay checks pass. Chromium/local production validation does not establish other browsers or current-schema hosted integration. The full ledger remains14 done/15 incomplete.

## Reopened: own-skill choice reuse

A later adversarial review found the initial closure premature. At ac4eb7c/d655ac3 the schema's unique-decision set covers only team rerolls. A forged report can retarget two otherwise valid own-skill checks to the same used-skill decision after making their action links and moment copies coherent. The full public schema accepts that forgery. This violates NUF-029's existing source/choice conservation requirement; it is not a newly waived or narrowed criterion.

A global uniqueness invariant now covers every numeric reroll decision, including own-skill checks. Three explicit full-schema probes cover Dodge, Sure Hands and Catch, preserve valid initial two-check reports, synchronize moment copies and require rejection naming the duplicate decision. The reproduced forgery is rejected and all44 focused tests pass. Valid report data, schema/model versions, draw arithmetic and runtime budgets do not change. NUF-029 is reopened pending renewed full verification and exact-head CI; current ledger totals are13 done/16 incomplete.

The same review also reproduced accepted team/own-skill reports placing their decision before the original or after the replacement. A common guard now requires explicit original<decision<replacement source indices. The raw linkers withhold compound support when that proof is missing or contradictory, preserving a valid earlier own-skill initial die; the manually assembled cross-sequence regression now supplies its actual ordered indices. Six public-report order/missing-index forgeries and two raw-family tests exercise all three invalid positions. The combined focused four-suite run passes86 cases, including all52 numeric integrity cases, the13 independent raw-source joins, two XML serialization cases and19 remediation regressions. The uniqueness-only full gate passed2,478 unit/API cases and41 browser flows; complete verification of the final combined guards is pending. Valid public reports retain the same values and model/schema versions.

Final combined-guard local verification passes2,486 unit/API cases, real Redis/build and41 Chromium flows. Fresh regeneration and complete parent comparison of all12 reports also pass with identical values/counts to the conservation table above. Final desktop/mobile screenshots were inspected again. The global decision uniqueness and original<decision<replacement checks add no valid public output or version change. NUF-029 remains in progress pending exact-head CI of this final fix.

## Final source-conservation closure

NUF-029 is reclosed after completed [exact b0afeb6 CI43425409564](https://github.com/Brandon-Born/nufflizer/actions/runs/43425409564) verifies both reopened gaps and the original correction. All52 numeric integrity cases,13 independent source joins, two XML serialization cases and4,860 decision trees pass; the complete gate contains2,486 unit/API cases, real Redis, production build and41 Chromium flows. Fresh12-source regeneration/full-parent comparison and re-inspected desktop/mobile screenshots retain the conservation table unchanged. Every numeric decision has unique consumption and explicit original<decision<replacement source order. The final follow-up modifies no valid public score/count/version. The original28 issue statuses/requirements are unchanged; full ledger14 done/15 incomplete. This final receipt supersedes the earlier premature closure without rewriting its recorded history.
