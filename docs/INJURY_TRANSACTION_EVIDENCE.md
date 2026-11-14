# Initial injury transactions and learned skill continuity

Observed 2026-11-14. Schema2.65 / dice-only-34 / mobility-possession-42. Partial advances under NUF-010/011/012/014/018/019/021/022/027. All original incomplete acceptance requirements remain.

An otherwise qualified initial injury can now survive one strictly identified, non-random SPP notification between its armor and injury records. Known skill-use messages also preserve the learned skill list under a bounded contract. Separate current physical, ownership, effective-skill, modifier and causal checks still decide admission. Public results gain ten injury and ten block contributions; they continue to abstain from a whole-match luck verdict.

## Independent rule and source evidence

The existing installed executable snapshot (SHA256590787b522ad4404b2e8a7570993375114a794fa4288d88a8595ab9dfbd7d6ae) supplies BoardDataSkill names/IDs. It is build evidence, not official serialization documentation. The independent stdlib-only extractor `scripts/extract-injury-transaction-evidence.py` decodes all twelve original sanitized replays without importing application admission, mappings or scoring. Its [frozen receipt](../tests/fixtures/evidence/bb3-injury-transactions.json) preserves all source SHA256s, enum provenance,80 uses among the15 additional skill IDs, six adjacent armor/SPP/injury prefixes and eleven literal-coordinate injury candidates. Current nullable checkpoint facts and earlier complete-list seeds are separately retained. Run `python3 scripts/extract-injury-transaction-evidence.py --check` to reproduce it. Original source and historical evidence fixtures retain their hashes.

The BB2020 primary rulebook supplies the bounded behavioral policy ([Games Workshop document, mirrored PDF](https://www.tassidelmiele.it/wp-content/uploads/2021/02/OR2020.pdf), SHA2568598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3). Pages below are printed pages; the PDF page is one higher. The relevant pages were rendered and visually checked. Licensed book/executable assets remain outside the repository.

| Skill ID | Skill / printed page | Relevant effect, separate from a learned-list replacement |
| --- | --- | --- |
|17|Stand Firm /80|Optional resistance to being pushed.|
|18|Always Hungry /81|A Throw Team-mate interaction that can harm the thrown player.|
|23|Sneaky Git /75|Foul-related movement and sending-off behavior.|
|25|Chainsaw /84|A special attack with its own damage and kickback rules.|
|26|Dauntless /76|A strength comparison/test for the declared block.|
|37|Grab /80|Push placement and interaction with Side Step/Frenzy.|
|41|Jump Up /75|Standing or a prone Block declaration/test.|
|47|Pass /79|A failed Passing Ability test reroll.|
|55|Shadowing /77|Following an opposing player's movement.|
|64|Throw Team-mate /87|A separately declared throwing action.|
|71|Kick /77|Kick-off ball placement/deviation.|
|84|Animal Savagery /81|A declaration test and possible teammate attack.|
|95|Projectile Vomit /86|A special attack and its damage consequence.|
|97|On the Ball /79|Reactive movement under the stated trigger.|
|1009|Mighty Blow (+2) /80|The bracketed damage modifier; this extension does not admit its injury policy.|

These documented action, displacement and damage effects support preserving intrinsic learned lists across a strict `ResultSkillUsage` payload containing only matching PlayerId, known Skill and explicit Used0/1. This is a bounded inference about the learned lists, not a protocol-wide claim that skill usage cannot change state. Unknown/extra/conflicting fields, unknown skill uses, effects, prayers, transformations, identity changes and removal barriers still invalidate their respective proofs. No missing physical status becomes standing, and no omitted learned list becomes empty. Known use alone does not certify eligibility, frequency, optional decisions, modifier application or tactical value. Unknown action15, WakeUp13 and prayer/PitchInvasion barriers are not promoted.

## Initial injury skill scope

Only Pass47, RightStuff52 and Animosity86/100/101/102 receive the new `outside_initial_injury_table` classification. Pass (printed79), Animosity (81) and Right Stuff (86) affect other actions. Their presence in a complete current subject or incoming blocker's intrinsic profile leaves this fixed initial table unchanged. The canonical receipt contains sorted unique IDs and is recomputed by the export schema against the actual role's lists.

Stunty59 is deliberately absent from this classification: it changes the injury table. Thick Skull and the existing separate committed Mighty Blow-on-armor policy retain their own rules. Another unmodeled injury modifier still withholds the score. The corrected Pass/Animosity/Right Stuff references79/81/86 supersede the earlier mistaken81/82/85; this corrects references, not the prior immediate-knockdown arithmetic.

## One observational SPP bridge

The admitted ordered prefix is `DamageStep(Source1) → [committed Mighty Blow13] → armor10 → [one recorded SPP2] → initial injury11`. All records must agree on action, sequence, exact source ordering, damage header and the independently owned injured subject. No arbitrary intervening message or lookahead is accepted. SPP has a distinct, non-victim actor with current ownership; its metadata links the adjacent armor/injury records. For categorical block injury admission, that recipient must be the opposing participant in that same block: attacker when the defender is injured, defender when the attacker is injured. An unrelated opposing teammate cannot bridge the score. Own-fall SPP remains unsupported.

The SPP row is explicitly non-random, excluded, with null binary odds/results, zero delta/weight and no dice. It records two SPP, not the legality of the award, a skill advancement, player removal or useful availability. Retaining an observational link is separate from qualifying injury scoring. Export validation rejects contradictory roles, points, links, ordering, dice, contributions or skill-scope receipts.

Both injured block roles have fair-face coverage. An attacker's own injury does not borrow the attacker's incoming-damage modifier policy. Existing armor commitment, subject current traits, causal resolution and damage guards remain. The ordinal initial injury contribution still uses the fair table; Badly Hurt and pending Casualty share one severity tier. It does not price league damage or lost turns.

## Independent acceptance and conservation

- An exact5764633679f6fff12a057db9c15d14f5e7ee57fc archive was checked against all505 tracked Git blob hashes before copying the initial24 new tests. All24 fail on that parent. The later own-knockdown symmetry check independently reproduces two failures on the intermediate implementation before the peer-role correction.
- Literal table rows and independent triangular 2D6 multiplicities test864 full parser/scorer faces. Four ordinary/Stunty/Thick Skull profiles are exercised with and without a committed armor modifier and with SPP on every result or only Badly Hurt; the own-knockdown peer-role variants add288 faces. Every admitted stratum scores36/36 with zero actual mean. These are conditional model tests, not new game captures or a complete adaptive policy proof.
- Payload, physical-default, missing/unknown skill, duplicate/foreign/third-party SPP, self-fall and export forgery cases retain conservative exclusions. The initial invalid multi-root negative fixtures were corrected to separate encoded messages; parser guards were not relaxed.
- All eleven source tables join independent raw role seeds and current checkpoints; six SPP prefixes retain distinct owned actors. Ten new block values match existing independent Fraction references under their explicitly hypothetical last-complete-list scope; admission additionally joins the current source proof. In demo9/source625, attacker44/acquired30 and defender4/acquired15 both use the complete seed at checkpoint12, rather than an assumed initial seed.
- Three new ordinary push models join literal raw question/push/final tuples in demo9:46/47/48,69/70/71 and83/84/85. All four positional alternatives, unchanged other on-pitch players and the recorded follow-up agree with independent geometry. Actual choices remain non-random and add no tactical point estimate.

| Complete twelve-report comparison to5764633 | Result |
| --- | --- |
|Existing scored values|All1,460 preserved; eight derived damage-summary metadata objects change with separately checked sums.|
|New scores|10 injury +10 block =20; total1,480.|
|Current intrinsic trait pairs|88, up15; this is separate from scored-pool count.|
|Block models / unknown pools|67 /766 of833 raw pools.|
|Initial injury tables / scores|20 /18; eleven new tables, ten new scores.|
|SPP source controls|Six new non-random rows.|
|Ordinary push models|15, up3.|
|Physical dice|All18,441 records/faces/aliases/paths retained; only20 dispositions change from unscored to covered.|
|Resources|173 choices,6,798 checkpoints,533 end notifications and111 numeric groups unchanged.|
|Context|All27 ranges, zero public context points and continued whole-match abstentions.|
|Largest compact report|2,712,634 bytes, below the unchanged4MB cap.|

The independent temporary conservation program checks complete report equality after only independently validated new tables, controls, models, scores, coverage/reason/category/team sums, rankings and derived metadata, plus version/time/report-ID fields. It does not reset a historical golden hash. A final producer refresh also independently recomputes raw pre-Zod report IDs; export field ordering is not the hash input. The peer-role fix preserves all twelve complete captures.

## Product verification and limits

Shared UI/CLI text distinguishes a categorical contribution from its SPP annotation and shows the subject/blocker other-action scope. CLI injury rows now correctly label a qualified categorical contribution; unqualified observations still show Not scored. Actual demo6 transport checks source248 Stunty Badly Hurt at−13/12 and separate source247 SPP, while demo9 checks source501's measured zero, source625's checkpoint12 traits and source212's unscored table. The HTTP gate still makes exactly ten POSTs.

Two new production-browser flows inspect these source reports alongside unknown-odds counterexamples, Why/filter/reset/export parity and existing push controls. Desktop1280×900 and mobile390×844 screenshots were visually checked. A first mobile assertion incorrectly required an entire tall table cell to fit the viewport; the corrected check pans the table and verifies the actual text bounds inside the clipped viewport. No app layout change was needed. The browser plugin was unavailable, so the repository Playwright fallback was used.

The final complete `corepack pnpm verify` exits0:3,155 pure+41 isolated real CLI+exactly ten HTTP=3,206 cases, actual two-handler Redis, lint/types, production build and all64 Chromium flows. Detailed failed/passing receipts are recorded in the implementation ledger. Broader effective/legal state, adaptive skills/damage/treatment/recovery, causal contextual value, held-out calibration, integrated product acceptance and current-schema hosting remain open under the unchanged original issues. Ledger17 done/14 in_progress/one open; fifteen original issues incomplete. All worker4s/256MiB/report4MB, input/XML/event and ten-admission/two-lease limits remain unchanged.
