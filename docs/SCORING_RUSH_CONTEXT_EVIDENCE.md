# Qualified scoring Rush context

Schema2.62 / dice-only-31 / mobility-possession-42. Advances original NUF-016/017/018/019/021/022/027; none closes from this component. All fifteen original incomplete issues retain their acceptance requirements.

## Rule and source boundary

The original 2020 Games Workshop rulebook, printed pages44 and64 ([primary document, mirrored PDF](https://www.tassidelmiele.it/wp-content/uploads/2021/02/OR2020.pdf)), establishes ordinary Rush failure after entering the square, a maximum of two ordinary Rushes, Rush before Dodge, and the standing carrier's end-zone touchdown. A standing recipient can also score there after later ball movement. These mechanics support the narrow successor comparison below; the Third Season FAQ is not used as evidence for replay1-4-0-0. No rulebook file or substantial quotation is committed.

The existing independently verified BB3 numeric namespace identifies RollType1 as Rush. This extension requires its source-qualified fresh direct unmodified2+ D6 contract. It does not promote another roll family or infer an omitted weather modifier.

## Pre-roll admission

`scoringRushState.ts` constructs a typed current frame, never from a later result. It requires:

- An owned ordinary Move declaration in this period/team turn, followed by a fresh stable regular-play checkpoint, standard pitch, known current carrier, standing/actionable actor, zero ordinary movement and adjacent empty scoring destination.
- Explicit current complete supported intrinsic skill lists, empty global/team/player effects, empty prayers and absent transformations. These profiles exclude unresolved retries, reactions and extra Rush allowances. The acting team explicitly has zero rerolls. This is a fixed ordinary policy, not general skill/resource eligibility.
- Both current scores, regulation period/turn length and both teams' cumulative turn counters. Inconsistent scheduling, missing fields and overtime withhold the component.
- Complete current identities for every player previously observed in the initial/prefix roster universe. A missing known player is not assumed absent. Recruitment/removal controls invalidate that universe for this policy.
- No positive or unknown opponent tackle zone beside the origin, because a successful Rush followed by an unresolved Dodge would not guarantee a touchdown. No other possible standing scorer at either side's scoring end zone: pending failure ball movement must not add a touchdown for either team.
- A first Rush, or exactly one preceding source-qualified successful ordinary Rush in the same declaration. Fresh checkpoints do not reset the two-Rush budget. Repeated same-actor declarations, unknown/failed/replaced preceding Rushes and a third attempt cannot gain this component.
- A strict ordinary move header immediately before the current direct die. Unknown header fields, nonzero skill/evaluation flags, modifiers, linked retries and incompatible source order withhold it.

These guards qualify only the component's transition, not a full match simulator. Missing evidence keeps the supported dice score and its uncertainty presentation.

## Successors and value

The success successor puts the standing holder at the destination, increments its team's score by one and ends the drive. The failure successor puts the actor prone there with no carrier, unchanged scores and a pending turnover. Armor and ball movement remain pending; their order, damage, final loose-ball square, possession, availability and future decisions are not invented. No other possible standing scorer and the supported passive profiles keep both failure scores unchanged through those pending stages.

The provisional team-perspective difference is:

```text
R = sum(2 * turnsPerPeriod - eachTeamCurrentTurn)
lead(own, other) = sign(own - other)
D = 4 + 8 * (lead(successScore, otherScore) - lead(failureScore, otherScore)) / (1 + R)
contribution = (actualSuccess - 5/6) * D
```

Four touchdown units and eight lead-pressure units are explicit heuristic weights. They share the existing provisional context scale (ordinary move1, own possession2), without claiming calibration or a win probability. The comparison is a partial scoring component. It adds no teammate activation, defensive-threat, damage, resource-price or future-policy value. It does not assert the final winner or overtime rules. A team already leading, or trailing by more than one, receives no extra lead-pressure delta merely because the clock is late.

A tied final-regulation-turn2+ failure contributes−10; the same early tied failure contributes−85/24. An independent existing low-stakes Dodge example contributes−5/3. The qualified final-turn success contributes+2. Both success and failure are admitted from the same pre-roll profile; all six equally likely faces have zero mean. The observed later touchdown is evidence, not a second context award.

## Independent references and adversaries

`scoring-pressure-reference.py` uses only Python standard-library exact fractions, with no application imports. Its committed arithmetic fixture covers63 score/clock strata and six fair faces. The full production service is checked on both pitch sides for756 cases; additional cases reverse the owned roster slot and enumerate the second-Rush faces. Literal expectations and the original helper/test copied into the independently blob-verified exact1e1730d parent produce six red assertions and twelve passing guard checks before this implementation.

Source tests withhold omitted global/team/player fields, a missing previously known player, unsupported retry/reactive skills, unknown header flags, repeated declarations, contradictory posture, impossible clocks, another possible scorer and a further required Dodge. Future result/checkpoint edits preserve the earlier contribution. Report adversaries alter score, clock, budget, skill, roster, header/declaration/source linkage, policy, successor, contribution, category and aggregate. The schema checks the retained declaration, physical checkpoint/clock/roster and raw-die ordering in addition to recomputing the value and totals. A report contract cannot authenticate a coherently rewritten raw replay; untrusted replay admission remains the producer's responsibility.

## Conservation and product contract

Fresh complete captures from exact1e1730d and the candidate preserve all twelve parent report objects after only the independently checked version fields, the scope sentence, generation timestamp and explicit zero `movement_risk` aggregate are projected. All1,418 prior scored events,18,441 physical dice/aliases,173 reroll choices,6,798 checkpoints,533 end notifications,111 numeric reroll groups,27 bounded context components and abstaining verdicts remain. None of the public demos supplies this policy's full pre-roll profile, so there are still zero public point components. Maximum compact report2,685,188bytes remains below the unchanged4MB ceiling.

API/CLI/UI share the typed pre-roll frame, successor pair, components and arithmetic. The single contribution reconciles by action/category/team and the partial component sum. UI/CLI explain the current score/remaining scheduled turns, legal branch scope, missing later stages and heuristic status in plain language. Actual worker tests cover transport; browser fixtures cover interpretation rather than adding quota admissions. Current verification and exact publication receipts are in the matching append-only implementation entry.

Full current legal state, all optional/effective skill and resource policies, combined action valuation, independent held-out calibration, broad product acceptance and current-schema hosted integration remain under the original open issues. Upload/XML/event limits, four-second worker deadline,256MiB heap, report ceiling, ten-admission quota and two shared leases are unchanged.
