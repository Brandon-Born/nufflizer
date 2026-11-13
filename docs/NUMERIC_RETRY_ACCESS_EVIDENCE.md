# Numeric retry-access dice scoring

Scope: original NUF-012/014/021/022/027, schema2.57/dice-only-30/context41. This advances the original queue without closing an issue or changing its work/acceptance requirements. Ledger14 done/14 in_progress/1 open remains authoritative.

## Source and rule contract

The [stdlib two-prefix inventory](../tests/fixtures/evidence/bb3-numeric-gates.json), reproduced by `python3 scripts/extract-numeric-gate-evidence.py --check`, preserves all12 public file hashes and complete numeric/empty payloads. Selection uses numeric question/gate families, independently of faces, outcomes, fallout and application admission. The existing raw fixture is unchanged. The [previous policy evidence](FAILED_NUMERIC_RETRY_EVIDENCE.md) records both complete actual failure chains; this model additionally qualifies each gate from its prefix ending at that gate, before any terminal result.

| Public source | First die | Gate | Gate contribution before/after the existing Dodge weight |
| --- | --- | --- | --- |
| demo9 |3154, actor10/team0, Dodge2 at3+, no modifier |3157 team Used1;3158 skill44 Used1;3159 Loner4+ face2 fails |−1/3;−11/30 |
| demo11 |4546, actor38/team1, Dodge1, Requirement2 with fixed−1 zone modifier, effective3+ |4548 team Used0;4549 Pro50 Used1;4550 Pro3+ face2 fails |−4/9;−22/45 |

GR-004 in [the in-game reference](GAME_SKILL_REFERENCE.md) and paired UI-007/020 in [playback evidence](REPLAY_UI_EVIDENCE.md) establish the Loner gate, retained original, spending and separate fresh replacement. Loner3+/4+ use distinct verified identities1008/44;2+/5+ variants remain unqualified. GR-025/UI-047/087 establish Pro50's3+ gate and distinction from its one rerolled die. The Pro rule excludes armor/injury/casualty and does not by itself certify all frequency, eligibility or fallback policies.

Admission is deliberately restricted to a supported single-D6 failed Dodge inside recorded PlayerStep.Move1. This is not a new proof of a complete legal activation or ordinary-Move declaration. It requires:

- A separately qualified native original in a question, with exclusive recorded team or Pro option and star−1; repeated/ambiguous originals cannot become new initial draws.
- Matching State1→State2 headers, known field shape and adjacent on-pitch coordinates, in the next source frame; only one optional checkpoint Carrier can bridge them. Unknown events or observed clock/controller/roster-turn changes break the proof. Omitted state remains unknown, not zero or an inherited legal state.
- One ordered, matching actor/current owner/target/gamer; explicit choice→used skill→fresh gate messages0–2; known skill identity/threshold and exactly one unmodified D6 with Status1/NewRoll1 and agreeing binary outcome.
- Unique original/choice/skill/gate ownership. A later replacement never selects whether the gate is scored.

A fresh replacement additionally requires the immediately following message3/source index, same actor/owner/check, Status2/NewRoll1, one supported D6, same fixed effective threshold/requirement/modifiers and consistent outcome. A repeated face is still a new die. Missing, modified, malformed or unqualified replacements remain unscored without erasing the known first or gate. Non-core/mixed/unsupported gate policies remain observable with unknown scoring.

## Variable and independently derived arithmetic

Let `p` be the supported fixed single-Dodge chance, `g` the gate pass chance, `I` the first success indicator, `G` the gate result and `R` the replacement result. A chosen one-die rescue succeeds when `J=G×R`. Before the gate its model chance is `g×p`; after the gate it is `G×p`. The observed gate therefore changes that fixed-model rescue chance by `p×(G-g)`. Revealing a fresh replacement adds `G×(R-p)`. Their sum is `J-g×p`. This derives the scaling from the one-rescue indicator, rather than introducing a tuning constant or counting the coach's choice as luck.

The model adds only observed stages:

`D = (I-p) + S × [p×(G-g) + G×(R-p)]`

Here `S` is the chosen policy after the first result, determined without future gate/replacement faces. Each admitted increment has zero conditional mean. Always use, odd-failure adaptive use and never use are independently enumerated through the complete application pipeline for2+–6+ base targets, Loner3+/4+ and Pro3+:9,720 leaves. With no gate (`g=1`) the arithmetic reduces to the existing fair ordinary full-retry model. These are conditional dice-model units, not scoring probability, full legal success odds or tactical resource value.

If a passed gate has no verified replacement, only its observed opportunity increment is counted. No replacement, completed success or terminal policy is invented. An unknown later modifier/policy cannot erase the independently known first/gate; unsupported later outcomes remain coverage gaps. Full post-roll, mixed and eligibility policies retain their original acceptance work.

Fixed-policy whole-check odds remain `p+(1-p)×g×p`, under the same supported fixed numeric conditions:7/9 for3+ Dodge/4+ Loner and22/27 for3+ Dodge/3+ Pro. They remain explanatory metadata, separate from the gate row's own50% or66.7% pass chance. The2+ action/4+ Loner reference remains65/72; an unconditional2+ full retry is35/36.

## Report, ownership and resource conservation

`numericRetryAccess` binds the first, choice and skill sources and the base/gate/fixed-policy chances. Its applied `gated_retry_access` policy validates the raw15/71 family, fresh gate die, role, namespace, ordering, derived delta and exact formula. The event belongs to the linked Dodge category while retaining its actual Loner/Pro source identity. The declared1.1 Dodge weight is unchanged.

`numericGatedReplacement` references its passed gate and contributes only that fresh die at single-attempt odds. The native question remains the owner of the first die; an old policy-original physical link cannot transfer that score to the new replacement. The gate owns resource-spend metadata exactly once:1 for Loner,0 for Pro. Neither replacement nor kept summary can claim another spend or ordinary full-reroll owner. Pro Used0 is described as “team reroll not used,” preserving the unavailable option rather than inventing a decline.

The kept `failedNumericRetry` receipt retains its hypothetical policy odds and zero contribution, linking to the gate's separate scoring status. Source-qualified positive gates/replacements, malformed prefixes, coherent report forgeries and every newly scored public role/die are checked independently. The older general Loner/Pro helpers retain unscored wording for unsupported gates; fully qualified access has its own explanation.

## Verification and limits

The new suite checks all six gate faces from both actual sources cut at the gate, all six counterfactual fresh replacement faces cut at that result, source clock barriers,20 malformed-prefix classes across both kinds,7 unsupported replacement cases,19 gate/11 replacement receipt forgeries,9,720 complete decision-tree leaves and both real CLI JSON/text paths. These counterfactuals are tests of a source/rule contract, not new paired gameplay captures. The existing independent ownership suite explicitly joins the raw gate witnesses and rational math after its normal roster/namespace proof checks; it does not silently skip the two new outcomes.

HTTP remains exactly ten admissions, extending its existing real demo11 request. Actual Loner worker behavior is checked by its real full-source CLI paths; the HTTP middleware/worker/shared-schema path is separately exercised with Pro, retaining every existing public-source admission/assertion. No original HTTP fixture is replaced. Browser flows use actual complete domain reports through deterministic response interception, with real worker HTTP isolated separately. Full corpus/capture work never contends with the CLI/HTTP worker gate. The production4s/256MiB/4MB, XML/upload/event and10-per-minute/two-lease limits remain unchanged.

Clock barriers are indexed in one ordered checkpoint pass, including a change followed by a restoration; missing clock fields are never filled. Cross-policy ownership checks use indexed decision sets, retaining the same invariants without per-event quadratic searches.

The complete final local gate, fresh exact-parent twelve-report conservation, screenshots and exact-head CI receipt are recorded in [the implementation log](IMPLEMENTATION_LOG.md). All prior scores, physical sources/dice/aliases and27 ranges/zero public context points must be conserved except the two expressly qualified gate contributions and their independently reconciled coverage/subtotals/ordering/text. Whole-match comparisons still abstain. Mixed/reroll/resource restrictions, full block/damage/state/successor/context/calibration and current-schema hosted integration retain their original requirements. No provider, account, Stripe, billing, deployment, production or legacy action belongs to this component.

Final local `corepack pnpm verify` passes2,755 cases (2,712 pure/33 serial CLI/10 isolated HTTP), real Redis/build and47 Chromium flows. Fresh exact-parent conservation preserves every2,234 old scored object,111 ordinary numeric reroll groups, physical source/alias/state/counter and27 ranges/zero public points after independently checking the two gate contributions and all dependent fields; total2,236 scored outcomes. Max JSON remains2,470,834 bytes. Exact commands, comparison hashes, screenshots and final-head CI handoff are in the matching execution record.
