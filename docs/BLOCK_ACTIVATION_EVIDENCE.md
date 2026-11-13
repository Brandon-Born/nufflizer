# Completed ordinary Block activations

Schema 2.47 / dice-only-22 / mobility-possession-38. Owning work: NUF-016/018/020/021/022; parent `751771236dc138959748cfed5ce6fcb2e35e02dc`.

A player's raw `CanAct=1` can persist after an applied Block. Treating that flag as an unused activation leaves the player among unknown later move opportunities. This change derives a spent activation only once a different owned teammate actually declares its next action in the same continuously observed team turn. It preserves the raw flag, position and tackle zone. A declaration or selected block die alone is insufficient.

## Admitted source contract

Replay `1-4-0-0` only:

1. An ordinary Action2 declaration and exact ordinary Step0/Step6 fields identify the same actor, opposing defender and adjacent in-bounds origin/target. The original stable phase5 checkpoint has compatible roster ownership, explicit active side, positive cumulative GameTurn, an on-pitch actor with CanAct1, and the recorded participant cells. A bounded optional Dauntless prefix does not imply a wider skill policy.
2. The existing source-qualified block pool, applied outcome and immediate damage linker certify the actual commitment. This reuses the existing resolution contract, without adding another probability calculation. Unknown aftermath, unmodeled reactions, extra fields and unsupported skill uses stop the completion proof.
3. A following stable checkpoint places the old actor at its actual reached cell. Follow1 requires a matching recorded follow-up; Follow0 retains the original cell. The checkpoint precedes the next teammate's qualified Step0/declaration. An optional standby marker must agree with the recorded side/clock.
4. Phase, period, active roster, team identity and cumulative turn must remain compatible through every intervening checkpoint. A later matching observation cannot repair an unknown or changed clock epoch. The actor, opponent and following teammate each have time-local ownership proof. Missing, conflicting or overlapping membership withholds admission.
5. Only exact inert controls may separate the final checkpoint from the following declaration. Empty pause/start/readiness records and bounded numeric timer telemetry preserve state without supplying a clock, active side or missing physical value. Timer `NewTimer.Team` is a timer namespace, not a controller assignment; optional Team0/1 is preserved without changing gameplay ownership. Decimal timer values are retained. Unknown/additional fields, malformed amounts and actual phase/end-turn records retain barriers.

Source search bounds are 128 records for each declaration/control boundary and 256 from pool to applied result. Exceeding a bound withholds the whole proof. Unindexed/reversed event sources stop admission at the malformed suffix rather than revoking an earlier witnessed completion. Reversed checkpoint order cannot be used to recover a later convenient state. Initial and pre-play checkpoints may legitimately share source index0.

`metadata.activationEnd.kind = ordinary_block_completed` links the original declaration, block pool, applied block, original/following checkpoints, following teammate, actual actor cell and observed clock. The confirmation is non-random and excluded from scoring. Public validation checks those cross-links and rejects invented Move/mental/reroll fields, future frames and incompatible reported clocks. Structurally consistent JSON is not cryptographic attestation of the unavailable source replay.

The existing activation ledger applies the spent state only after confirmation and expires it on unsupported state/clock/phase/ownership/location transitions. It does not change the block's earlier pre-roll evidence. Physical Move/Block completions preserve the tackle zone; mental-trait failures retain their distinct suppression contract.

## Independent evidence and effects

`scripts/extract-block-activation-evidence.py` uses only the Python standard library and the raw inventory decoder. It imports no application admission, availability or scoring logic. Its artifact retains all12 source hashes,790 raw applied-block candidates, their nearest declarations, intervening tags and observed clock frames, plus2,987 timer-control payloads. Player observations are selected participant projections, explicitly not complete rosters. Missing fields remain null; empty XML elements are distinguished from omissions. Numeric timer decimals are retained.

Every admitted completion joins to its raw actor/defender/following declaration, applied outcome, before/after participant positions and every clock observation. Qualification yields:

| Replay | Confirmed completed Blocks |
| --- | ---: |
| demo-goblins1 | 4 |
| demo1 | 1 |
| demo10 | 22 |
| demo11 | 3 |
| demo2 | 6 |
| demo3 | 11 |
| demo4 | 8 |
| demo5 | 13 |
| demo6 | 0 |
| demo7 | 3 |
| demo8 | 5 |
| demo9 | 31 |
| Total | 107 |

Nine later scored pre-roll candidate lists each remove one independently confirmed spent actor: goblins1/source1031 (43), demo1/source1052 (44), demo10/source712 (38) and1063 (41), demo2/source1875 (47), demo3/source2235 (46) and3297 (38), demo5/source3272 (41) and3975 (43). Other unknown teammates remain unknown. In total82 scored pre-roll records gain only the new ended-activation traces and, in those nine cases, the candidate removal.

The complete-state synthetic matched control checks the actual downstream model effect: before completion, two other ordinary moves make the same failed2+ Dodge worth −5/3 provisional context units; after the committed Block and teammate declaration, one other move makes it −5/6. The original Dodge probability/dice contribution is unchanged. This is a labeled synthetic state test, not a new source-backed point estimate or calibration result.

All2,223 prior scored outcomes, raw dice identities/dispositions, random-candidate coverage, team/category/action sums,27 partial context ranges, zero public point estimates and abstaining whole-match verdicts remain. The full parent comparison reconciles only107 new endings,114 added non-random source rows, 41 changed confirmation labels/reasons, their explicit event/exclusion counters and two count-based summary lines, the validated new pre-roll traces/candidate removals (82 scored and73 excluded records), report identity/time and schema/context versions. Every other prior report field matches.

`block-activation-prior-context.json` contains exact parent pre-roll fields for only the82 changed scored rows. It is a sparse versioned regression projection, not a semantic oracle. Separate tests constrain every current difference to an earlier qualified Block ending and the exact spent-player removal. No frozen earlier cohort SHA is reset.

## Shared surfaces and remaining acceptance

The actual demo10 CLI worker exports source710's player38→45 completion and source712's reduced unknown-candidate list in JSON, with the same plain-language text explanation used by the UI. The existing demo5 HTTP admission checks player41→45/source3270 and the following source3272 availability; its isolated gate remains exactly ten requests. The browser flow inspects the completed Block, the later Dodge, JSON export and reset at1280×800 and390×844. Exact gate results and visual inspection are recorded in the execution ledger.

This does not establish full legal Block/Blitz/Frenzy/reroll/special-action policies, full playable setup/recovery/resource transitions, the value of the completed Block, general useful-action availability, valid full successors, calibrated context or current hosted acceptance. No original issue closes on this scoped state extension. The ledger remains13 closed/15 incomplete. Production4s/256MiB,4,000,000 response bytes, all upload/XML/event limits,10 admissions/minute and two leases are unchanged.
