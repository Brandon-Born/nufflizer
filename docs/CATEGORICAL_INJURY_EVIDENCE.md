# Categorical initial injury luck

Current direct-code update (2026-11-14): schema2.64/dice33 qualifies direct Outcome3 as Badly Hurt using the extracted gameplay enum and eight original raw witnesses, corroborated by the Stunty9 rule. The existing table/cause guards remain; all eight public observations stay unscored. All144 full-pipeline injury faces now pass, including Badly Hurt. Earlier statements below that direct code3 was unverified describe the prior scope and are superseded only by [this bounded evidence](DIRECT_BADLY_HURT_EVIDENCE.md). Treatment-question code1, modifier choice and final availability remain separate.

Current schema2.50 / dice-only-25 / mobility-possession-38. Initial policy introduced in2.48; the2.49 prefix correction is documented below and the2.50 committed armor-spend extension is in ARMOR_MODIFIER_BUDGET_EVIDENCE.md. The original seven-admission scope below is retained as history. Owning work: NUF-011/014/018/019/021/022/027. Parent: `88092fde673b6e5240433c2f0845280b3bb9f2bc`. This extends actual dice analysis; it does not complete the remaining damage, state, counterfactual or calibration requirements.

Previously every initial injury table remained unscored even when the source established its unmodified policy. This change scores a qualified categorical injury without pretending that Stunned, KO and Casualty are binary success/failure outcomes. Both `probabilitySuccess` and `actualSuccess` remain null. The UI shows “Categorical” and the recorded injury; the shared explanation supplies the full four-outcome distribution and calculation.

## Value and probability contract

The fixed pre-roll injury table defines three ordered initial-result tiers: Stunned, KO, and casualty. Badly Hurt and a pending Casualty roll share the last tier; no later league damage or selected casualty effect is valued. This is ordinal **raw dice luck**, not the value of a removed player, match impact, or win probability.

For observed tier i, define q(i) = P(a fresh result from the same table is more severe) − P(it is less severe). Ties contribute zero. The injury contribution is q(i) times the existing injury category weight1.5. The values are fixed by the table before observing the dice; there is no fitted severity coefficient. Each ordered pair contributes equal and opposite amounts when swapped, so the table-weighted mean of q is exactly zero. With only two tiers, this reduces to the usual `actualSuccess − p(success)` deviation. The three exported probabilities sum to one; the full four-outcome table remains available separately.

| Table | Stunned / KO / casualty-tier counts out of36 |
| --- | --- |
| Ordinary |21 /9 /6 |
| Ordinary, Thick Skull |26 /4 /6 |
| Stunty |15 /11 /10 |
| Stunty, Thick Skull |21 /5 /10 |

The existing [injury-table evidence](INJURY_TABLE_EVIDENCE.md) retains ordinary/Stunty and Thick Skull rule/UI/source corroboration. The cached primary BB2020 rulebook SHA256 is `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`: printed27/60 define self-falls and injury, p77 explicitly excludes Armour/Injury/Casualty from Pro, p80 restricts Mighty Blow to the opposition player knocked down by the holder's Block and permits applying it after the roll, and p80 also gives Thick Skull. The web fetch exceeds its17MB limit; the retained primary PDF/text supplies the inspected content. No new game playback capture or compatibility with another replay version is claimed.

## Source and modifier qualification

Replay1-4-0-0 only. A pre-existing direct injury observation and complete current injury-table receipt must precede qualification. The subject is observed on pitch, with time-local ownership and complete intrinsic traits/effects/prayers/transformation continuity before damage. Missing state is not filled. The initial injury must immediately follow its own verified armor break in the same typed, applied DamageStep and sequence, with explicit empty modifier lists, matching source/subject and consecutive source indices. Unknown/intervening damage choices, extra fields, copied originals or unsupported injury namespaces cannot establish this policy.

An applied block uses the existing source-qualified pool/resolution/damage-action link. For injury to its defender, a **separate participant** lookup resolves the blocker's own current ownership and continued complete traits at the injury boundary; it never relabels the injury subject. Only known skills which cannot modify this ordinary injury policy are admitted. Mighty Blow1/2 and unknown/special skill policies are withheld, even when the actual raw modifier list is empty. Pro is admitted because its rule excludes injury rerolls. If the blocker itself is knocked down, its Mighty Blow cannot modify its own injury; the victim's current table and the applied self-knockdown still need proof.

A self-fall instead requires the actual scored failed Rush/Dodge, matching ordinary movement step, adjacent cells, exact recorded move/outcome summary and immediately following own DamageStep, source9/0 respectively. This is a prefix proof of the initial damage cause, not a claim about a later ball reaction, turnover clock or complete movement aftermath. Later treatment and independent recovery dice remain separate stages.

DamageStep's serialized applied State may be1/2/3. It is preserved as source evidence, not used to select a convenient scoring policy or suppress the casualty branch. The policy depends on the prior traits and qualified cause, not the future severity encoded in that applied state. Unknown applied-state layouts remain outside the source contract.

The strict public schema validates the injury's owned subject, current table, own armor/cause references, blocker modifier proof when required, source ordering, tier probabilities, null binary values and exact weighted contribution. A receipt on an excluded/unrelated row, wrong cause, future/foreign traits, fabricated binary chance or mismatched total is rejected. Structural consistency is not cryptographic proof of source bytes absent from the report.

## Independent source and arithmetic evidence

`scripts/extract-categorical-injury-evidence.py` uses Python's standard library and the raw inventory decoder, never application admission/scoring/ownership code. Its artifact preserves11 reviewed candidate source hashes/locators,107 typed steps from up to five preceding ReplaySteps, raw armor/injury/block/movement messages and selected participant Data observations. Full outer locators matter: offers, selection and applied blocks can straddle several source sequences. The projections are explicitly not full boards or eligibility oracles.

A second reference uses `Fraction` arithmetic and triangular2D6 multiplicities from the separately transcribed rule tables. It retains exact tier probabilities/deviations/weighted results for totals2–12 and proves zero means. Runtime tests independently enumerate all144 ordered faces across the four tables, exercise the complete parser/ownership/cause/schema path and compare the exact source dice and role/trait seeds. Direct code3 remains unverified and unscored even though the rule table contains a theoretical Badly Hurt branch.

Seven existing source rows gain actual categorical contributions:

| Replay / source | Subject team / recorded injury | Weighted raw injury luck |
| --- | --- | ---: |
| demo10 /128 |0 /Stunned, ordinary |+5/8 |
| demo10 /162 |0 /KO, ordinary |−5/8 |
| demo10 /439 |0 /Casualty, ordinary |−5/4 |
| demo10 /556 |1 /Stunned, Stunty |+7/8 |
| demo5 /110 |1 /KO, ordinary |−5/8 |
| demo5 /402 |0 /KO, ordinary |−5/8 |
| demo8 /249 |0 /Stunned, Stunty self-fall |+7/8 |

Demo1/source219 remains a conditional table with no score: its blocker's current list includes Mighty Blow13. An empty actual modifier list does not establish an unconditional pre-roll policy. Demo10/source113 was also unscored in2.48/2.49; schema2.50 now admits it only under the separately verified armor-spend budget in [modifier evidence](ARMOR_MODIFIER_BUDGET_EVIDENCE.md). Two other original candidate trait lists remain outside the table contract. Other unsupported injuries remain visible in coverage.

The existing7 injury rows and their raw dice identities are retained, not duplicated. Seven covered-roll statuses replace unscored statuses; denominators and source/event counts do not change. Initial injury, armor, casualty-selection and recovery remain distinct random stages. Damage/action summaries reference their existing contributions once and add no separate score. All2,223 parent scored deviations/odds remain unchanged; linked block/damage subtotals, category/team totals, coverage and ranked moments change only by the seven new contributions. All27 context ranges, zero source-backed context points and abstaining whole-match verdicts remain.

Frozen historical scored-cohort SHA expectations are unchanged. Their projection reconstructs only the former damage-subtotal membership, treating the seven new stages as formerly excluded; current source, rational arithmetic and aggregate comparisons are tested separately. The execution ledger records a complete exact-parent/current comparison and final gate results.

## Shared surface verification and limits

The existing demo5 HTTP admission tests source110's−5/8, null binary odds and armor/block/modifier cross-links; the isolated gate stays at ten requests. The existing actual demo8 CLI test checks the table and categorical explanation. The production browser flow uploads the same real demo8 file, filters the scored injury, opens its calculation, switches to excluded and back, exports JSON and resets. Its API response fixture is the actual domain report; separate HTTP tests exercise the real bounded worker. Desktop/mobile identity, meaningful render, overlays, console health and screenshots are recorded in the execution ledger.

This does not certify adaptive modifier/treatment policies, every special action, the direct Badly Hurt serialization, casualty-selection odds, final availability, general playable state, full valid successors, contextual calibration or current hosted acceptance. The ledger remains13 closed/15 incomplete. All original IDs, dependencies and acceptance requirements remain. Production4s/256MiB,4,000,000 report bytes, ingestion/XML/event limits and10-admission/two-lease controls remain unchanged.


## Initial-injury prefix stability (schema2.49)

Parent595bf1e admitted an initial ordinary Block injury only if the whole following damage action also passed `findBlockConsequences`. A direct counterexample appends an unknown treatment message to the otherwise identical synthetic damage action: the already witnessed initial KO lost its source-qualified cause and became unscored. The same interruption before the injury must still withhold its policy.

`ObservedBlockConsequence.damagePrefixes` now retains an independently witnessed adjacent ordinary damage header (action ID and source index). It is separate from `damageActionIds` and the continuation cursor. The categorical scorer still requires the exact immediate DamageStep→scored unmodified broken armor→initial injury, current subject and blocker policy, unique owned cause and supported namespace. The header is retained before scanning later treatment. An unsupported suffix leaves the full damage action unlinked and its cursor at the unvalidated damage action; it cannot establish a completed activation or ball release.

Schema2.49/dice-only-24 requires each Block injury cause to name `appliedOutcomeSourceId` and `damageStepSourceIndex`. The public validator joins the applied outcome, sequence and outer source locator, adjacent damage step, actually knocked-down participant, armor, ownership/traits and probability calculation. A second damage step is possible only for Both Down. These are structural report checks; the report alone cannot authenticate omitted raw replay bytes.

Negative cases retain rejection for interrupted earlier injury policy, wrong damage source/subject/applied flag/sequence/step and forged public applied-outcome/header references. Both an unknown later reaction and a foreign-holder unknown skill preserve the earlier injury while withholding full aftermath. Existing independent raw-corpus injury joins and exact rational references remain unchanged. No Mighty Blow budget, modified injury probability, treatment/final availability or contextual value is added by this correction. Original acceptance remains13 closed/15 incomplete.

Final evidence: the12 source reports deep-match595bf1e after only six new applied-outcome/header receipts and schema/dice versions/identity/time are reconciled. All2,230 prior scores and all coverage/context/verdict fields remain identical; max2,458,525 bytes.2,276 unit/API cases, Redis/build/lint/types and37 browser flows pass. The existing demo10 JSON-export browser flow checks source128→pool122→applied125→damage126. See the execution ledger for the initial stale-version browser failure and the complete corrected rerun.


## Schema2.50 committed armor-use extension

The initial unmodified injury policy can also be established by a prior source-qualified MightyBlow1 spend on this same damage action's armor. Only demo10/source113 gains the additional−5/8 contribution; the earlier seven and every other2,230 parent scored value/odds remain. Ten distinct holder/subject use observations add no score or random outcome. The armor itself stays unscored, with null binary odds/result, and only its later conditional injury receives the unchanged ordinal model. Full stage-budget, raw source, negative-policy and shared-surface evidence is in [ARMOR_MODIFIER_BUDGET_EVIDENCE.md](ARMOR_MODIFIER_BUDGET_EVIDENCE.md). Totals now include2,231 supported outcomes; context38 and whole-match abstention remain.
