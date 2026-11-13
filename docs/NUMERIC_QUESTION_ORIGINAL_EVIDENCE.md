# First numeric dice embedded in reroll questions

Updated 2026-11-13. Scope: original NUF-012/014/021/022/027. Schema2.54 / dice-only-27 / mobility-possession-41. This is partial implementation of the original requirements, not closure of those issues. The ledger remains14 done/15 incomplete.

## Reproduction and resulting behavior

At parent21170f31c5623493d8d52e475351cf133a1698fe, three public questions contain a known failed original D6, but its later policy lacks a scored terminal owner. Their originals consequently remain unscored. The new prefix contract scores the original under its actual `QuestionTeamRerollUsage` source identity. It does not rename the source to `ResultRoll`, fabricate a nested source, or certify the later policy.

| Source | Raw locator (ReplayStep/child/step/message) | Actor / team | Family | Face / effective target | Recorded team / Pro flags |
| --- | --- | --- | --- | --- | --- |
| demo11/source4546 |512/1/2/0 |38 /1 |Dodge |1 /3+; Requirement2 and fixed zone−1 |false /true |
| demo4/source1715 |237/4/1/0 |41 /1 |Catch |2 /3+ |true /false |
| demo9/source3154 |371/1/1/0 |10 /0 |Dodge |2 /3+ |true /false |

Each original has chance2/3, failed-die deviation−2/3, and the unchanged category weight1.1 yields−11/15 (−0.733 displayed). The first two retain their historical initial roster name; player10 has no invented initial name. Current-roster attribution remains separately source-qualified. An available flag records what the question says; it does not prove legal eligibility or the tactical price of spending a reroll.

Demo11 later has a failed Pro gate and a kept original; demo9 has a failed Loner gate and a kept original. Those summaries add no new physical draw or score. Demo4's later fresh Catch remains unscored because its complete source/controller policy is not qualified. Neither that replacement nor any gate, resource cost, availability or contextual value is promoted here.

## Prefix and identity contract

`numericQuestionOriginal.ts` admits the verified replay namespace, known numeric families1/2/4/7, explicit one-D6 failed Status1/NewRoll1, fixed target/modifiers, strict question/roll/step shape, ordered locators and a confirmed actor owner matching the question's gamer. Rush step6/31 can retain a positive opponent target; family/step/target combinations outside the witnessed grammar are withheld. Unknown messages or unknown fields in a preceding known message prevent admission. Empty movement rolls/pushbacks and the specifically supported successful Rush summary are explicit; arbitrary summaries do not pass.

Qualification scans only the prefix. An unanswered original remains an identity boundary across continuation actions; changing an action ID cannot turn another cached question or unexplained Status1 emission into an independent first draw. A witnessed terminal result or explicit phase/turn boundary retires that scope. Later unknown policy or fallout cannot erase an already qualified first die.

An existing qualified scored group retains its score owner and all its fields. An adjacent matching emitted original or canonical identical repeated menu is a copy, with strict source order, actor, controller, action, step and locator proof. Repeated menus can compose with complete used or declined choices and separately emitted originals. Changed dice/controllers, interruptions and ambiguous new initials withhold later compound support while preserving the earlier first. The repeated-menu and separately emitted composition variants are synthetic regression evidence, not new game captures.

`numericOriginal` exposes the recorded gamer and team/Pro flags. Its report validator binds the exact `RollInfos/Dice` physical record and public source, current role, one initial die and single-attempt arithmetic/formula. It rejects missing/mismatched receipts, dice paths/faces/freshness/thresholds, invented spending/policies/original pointers, and pre-roll/context claims. `numericOriginalCopy` binds adjacent repeated questions to their first original and previous menu; copies have no additional score. This is structural consistency validation, not cryptographic raw-input attestation.

A scored initial Catch is not a terminal catch. Ball-consequence linking still requires its separately qualified terminal policy; no downstream possession or context is inferred from the initial question.

## Independent evidence and conservation

The stdlib `scripts/extract-numeric-question-originals.py --check` selects all83 raw numeric questions across all12 unchanged SHA256-bound sanitized public replays, without consulting later outcomes or application admission. Its fixture preserves step/question/initial dice, earlier same-step messages and raw prior roster namespaces, including omitted fields. Raw roster observations alone do not certify eligibility or full continuity. The existing independent ownership corpus verifies every reported roster proof; new question math/roles join this separate witness rather than replacing historical expected hashes.

`numericQuestionEvidence.test.ts` checks every original physical record in the complete reports, then cuts the parsed replay at each of the83 questions, removing future events/checkpoints. Each cut retains exactly the witnessed first attempt at independently calculated probability/deviation, without a reroll or contextual claim. Four family tests enumerate all six first faces at five targets:120 full-pipeline cases have zero mean first-draw deviation. Unknown later policies, ownership conflicts, malformed dice/flags/steps, repeated-menu identity and explicit report forgeries have separate regressions. All110 existing numeric reroll groups and the earlier4,860 decision trees remain covered unchanged.

A fresh12-report comparison against exact parent21170f3 independently verifies new source math and all derived counts, family coverage, category/team totals, headline gaps, moments and summaries. It reverses only those verified changes, then deep-matches the complete parent reports. No historical expected hash is reset.

| Checked output | Result |
| --- | --- |
| Entire previously scored event objects unchanged |2,231 |
| Additional original contributions |3; total2,234 |
| Existing numeric reroll groups unchanged |110 |
| Raw question first-die fields covered once |83 |
| Kept summaries removed from roll-candidate status |2; no score |
| Newly visible original-question records for already counted groups |2:demo4/source3319 and demo6/source3769; no new draw or score |
| Candidate denominator change |+1 in demo4 only; the other two replace kept-summary candidates |
| Physical dice facts/order/aliases |Unchanged; three first fields change unscored→covered ownership and two fields gain a visible parent |
| Context ranges / public context points |27 /0, unchanged |
| Verdicts |12 partial-analysis abstentions |
| Maximum JSON |2,470,834 bytes, below unchanged4MB |

The complete comparison script and receipt are `/tmp/nufflizier-question-original-regression.cjs` and `.json`; final hashes and gate/CI receipts are in the append-only implementation log. Temporary validation files are not product fixtures.

## Product verification and remaining requirements

Shared UI/CLI text explains the first attempt's chance/deviation, the observed flags, eligibility uncertainty and separate later policy/resource/consequences. The existing demo11 real HTTP admission checks the first die and kept summary without an11th POST. A serial real CLI case checks demo9 JSON and text. The new42nd Chromium flow uploads actual demo11 through a deterministic response interception using the real domain report, filters actor/category/status, checks66.7% /Fail /−0.733 and Why, exports schema2.54, resets and checks desktop/mobile health. Actual HTTP/CLI workers have separate gates; intercepted browser rendering is not hosted/API proof.

Full original reroll/choice/gate/resource accounting, outcome coverage, state/successors, calibrated context and integrated hosted acceptance remain open. Production4s/256MiB/4MB, upload/XML/event caps and shared10/minute/two-lease limits remain unchanged. No provider/store/account/Stripe, billing/plan, deployment/production/legacy, merge or release action is part of this change.


Schema2.55 follow-up: [the independently qualified Catch continuation](CATCH_REROLL_RESUME_EVIDENCE.md) now retains demo4/source1715's original within source1722's used two-draw group. The first is not erased or counted twice; only the replacement's+11/30 is added to the team sum. The other two standalone originals and all110 prior reroll groups remain unchanged. Current total stays2,234 scored checks, now111 numeric rerolls, with27 ranges/zero points and abstentions. The schema2.54 counts/proofs above remain the historical first-draw milestone; full original broad acceptance remains open.
