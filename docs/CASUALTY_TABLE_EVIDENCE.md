# Conditional casualty distributions

Schema2.73, dice-only-36, mobility-possession-42. This advances NUF-011/014/018/020/021/022/027 without closing an original issue. The actual score algorithm is unchanged. A conditional table is additional rule evidence, not a scored outcome, a complete treatment policy or a useful-availability claim.

## Rule and source evidence

The primary BB2020 rulebook, printed61/PDF62, gives the five D16 casualty categories and the separate D6 lasting-injury table. Printed61 supplies the fixed niggling-injury modifier, printed84/PDF85 the fixed Decay modifier, and printed62 describes a new casualty draw followed by the coach's applied treatment choice. The retained PDF has SHA256 `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`; its casualty page was visually inspected again. [Primary rulebook, mirrored PDF](https://www.tassidelmiele.it/wp-content/uploads/2021/02/OR2020.pdf). The live browser fetch exceeds its document-size limit; the local copy's complete hash is independently checked. Neither licensed pages nor executable assets are committed.

The unchanged [casualty observation receipt](../tests/fixtures/evidence/bb3-casualty-observations.json) preserves all63 raw roots before admission:45 direct, ten originals, four replacements and four copied originals, across twelve original replay hashes. It also binds the installed enum namespaces and17 prior UI observations. UI-075/076 corroborate holder-specific Decay81/ModifierType27/+1, UI-078 separately corroborates NigglingInjury31/+1, and UI-060 establishes the changed copied-original outcome counterexample. These are existing independent observations, not new game captures.

The new [stdlib arithmetic extractor](../scripts/extract-casualty-table-evidence.py) reads that frozen receipt and original hashes, never runtime admission/probability/scoring code. Its [reference](../tests/fixtures/evidence/bb3-casualty-tables.json) transcribes the primary ranges and independently derives all16 primary faces and96 primary/secondary pairs per modifier total. It retains the original receipt hash instead of replacing it.

| Recorded fixed modifier total | Badly Hurt / Seriously Hurt / Serious Injury / Lasting Injury / Dead, out of16 |
| --- | --- |
|0|6 /3 /3 /2 /2|
|1|5 /3 /3 /2 /3|
|2|4 /3 /3 /2 /4|

Only a Lasting Injury uses the additional, unmodified D6: Head Injury has two faces; Smashed Knee, Broken Arm, Neck Injury and Dislocated Shoulder have one each. The model does not add that D6 to an event where it was not observed. A generic Lasting Injury remains generic.

## Conditional model and boundaries

`casualtyTable.ts` consumes only an already qualified, uniquely owned casualty observation. The list of modifiers must be explicitly recorded. It accepts empty lists and at most one exact +1 Decay vector and one exact +1 niggling-injury vector. The Decay holder must be this subject; the niggling namespace requires the witnessed sentinel IDs. Unknown fields/kinds/values, duplicates, omitted lists and contradictory dice/outcomes cannot establish this table. Existing malformed/ownership/version/source/copy guards remain.

The contract is conditional on the recorded automatic vector. It does **not** certify that the replay supplies every effective trait, eligibility restriction or counterfactual treatment option. In particular, an empty actual list is not promoted into a complete pre-roll policy. The table therefore remains excluded, with null binary success/result, zero dice/context contribution, no rarity tag, and unchanged random-outcome/dice-field coverage. Unknown variants retain their observation when valid, or at least their raw candidate when the stricter observation contract also fails.

`casualtyTable` records the full typed vector, modifier total, five category counts/probabilities, five secondary counts/probabilities and probability of this observed categorical label under the conditional table. The category order is the table above; secondary order is Head Injury, Smashed Knee, Broken Arm, Neck Injury, Dislocated Shoulder. A specified lasting subtype has joint probability `P(Lasting Injury) × P(secondary subtype)`; a generic recorded Lasting Injury retains its category probability. No secondary die or subtype is invented.

Direct, original and replacement roles stay separate. In the replacement wire namespace, a Badly Hurt result is recorded as No injury. The table still describes the casualty draw; reserves placement requires that result to be applied by the separate source-linked treatment decision. Copied OriginalRoll fields never select a distribution, rename the original or create another draw. League harm is not priced as match impact. Recovery and later participation remain separate observations.

The strict export validator recomputes the table and observed-label probability, checks the exact modifier kinds/holder/sentinels and normalized values, and requires the existing casualty observation/physical-role contract. Forged counts, probabilities, secondary weights, chance, modifier totals, kind/holder, score, missing observation and mismatched sums are rejected. Structural receipts do not authenticate absent raw bytes.

## Reproduction, source and whole-report acceptance

An exact-fa6a40b archive verifies all586 tracked Git blobs before copying only the new reference/extractor/source test. The final six-case run is four red/two green; it imports existing production exports, avoiding a manufactured missing-new-module failure. The initial positive UI-060 assertion was corrected: its old numeric projection omits empty modifier lists and cannot certify an unmodified table. That remains a green negative control; actual demo3 original2033/replacement2039 supply explicit positive lists instead. An unknown-field test initially assumed a retained named observation; the existing stronger guard correctly withholds that name while preserving the raw candidate. No producer guard was relaxed.

The new serialized enumeration covers all96 primary/secondary pairs for each of four vectors (empty, Decay, niggling injury, both) and three direct/original/replacement roles:1,152 complete pipeline inputs. Independent source joins check every59 public table's raw locator, role, dice, typed modifiers and exact rational distribution/observed chance. Fifty-five have total0 and four total1; positive Decay/combined profiles also have source/rule-bound synthetic checks. Malformed/omitted/duplicate modifiers, contradictory labels/secondary dice, immutable input, future-result/team-label invariance, unknown state and public forgeries are separate gates.

Fresh complete captures independently recompute all raw pre-Zod report IDs. Whole-parent comparison checks all59 tables against the independent source/reference and recomputes the exclusion-reason histogram before removing only those verified changes. All twelve complete fa6a40b parent reports then match after schema/id/time normalization. Every1,539 scored event object, all18,441 physical records/aliases/dispositions, all resource/state/return/causal/clock/context fields, counts/totals/ranking and abstention remain unchanged. All twelve IDs change because the additional event evidence is hashed. Maximum compact report2,962,178bytes, below the unchanged4MB cap.

The existing demo3 HTTP admission and actual CLI JSON/text case check both normal tables, unchanged copied-original identity and no score on the applied decision. The HTTP suite remains exactly ten POSTs. Existing report-fixture browser flows cover normal original/replacement/applied roles, a separate lasting subtype/Regeneration and a modified niggling replacement, with desktop/mobile Why, filters, export and reset. The frontend-testing-debugging skill uses repository Playwright because the Browser plugin is absent. Final local, visual and exact published-head CI results are recorded in the append-only execution log.

The broader original damage/modifier/treatment/availability requirements and their original dependencies remain open. This adds conditional distributions without claiming complete adaptive policies, current-schema hosting, contextual calibration or a completed analyzer. All34 original packets/ledger rows/statuses/dependencies and both full parent log prefixes remain; runtime/input/XML/event/report/admission limits remain unchanged.
