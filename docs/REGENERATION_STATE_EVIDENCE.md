# First observed Regeneration aftermath

Schema2.51 / dice-only-25 / mobility-possession-39. Parent `cbc38ead5f1b8bf5493aff104d3124ca8670f604`. Scope NUF-011/016/018/021/022/027. This records an observed post-roll state; it is not a complete availability/return reducer, a new random outcome or a context value.13 issues remain closed/15 incomplete, with all original criteria/dependencies preserved.

## Independent rule and source evidence

The primary BB2020 rule on printed86/PDF87 says a successful4+ Regeneration discards the casualty and puts the player in reserves; failure1–3 applies the casualty normally. The inspected PDF SHA256 is `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`. This agrees with in-game [GR-006/skill19](GAME_SKILL_REFERENCE.md) and paired UI-054/068/086. Those UI records correctly warned that the initial Situation4/Status4 removal alone is not an irreversible final availability result.

The installed `EBB3BoardDataPlayerSituation` namespace names1 Reserve and4 Injured; `EBB3BoardDataPlayerStatus` separately names physical statuses. Neither is DamageStep.State nor injury Outcome. No omitted status, controller, CanAct or tackle-zone flag is defaulted from these names or from a successful die.

`extract-regeneration-state-evidence.py` imports only the independent stdlib inventory decoder. It retains all seven public raw type46 chains, full numeric damage/messages, first same-frame following board, previous board locator, selected player fields, both full roster ID lists and intervening controls, with unchanged replay hashes. The rule reference is an independent3-of-6 probability, not a fitted coefficient or another contribution.

| File / roll source | Subject / team | Recorded result | First snapshot after source | Observed box / status / CanAct |
|---|---|---|---|---|
| demo10/444 |6/0 |success |445 |Reserve1 / null / null |
| demo10/1012 |4/0 |failure |1013 |Injured4 /4 / null |
| demo4/1425 |3/0 |success |1426 |Reserve1 / null / null |
| demo7/1746 |37/1 |failure |1747 |Injured4 /4 / null |
| demo9/1573 |43/1 |success |1578 |Reserve1 / null / null |
| demo9/3894 |43/1 |success |3895 |Reserve1 / null / null |
| demo9/4576 |41/1 |success |4577 |Reserve1 / null / null |

All are stable phase5 observations at cell[−1,−1]. The raw tackle-zone flag is true for five successful reserve observations and omitted for both failures; it is preserved as a flag, not a defensive square or playable activation. Three standby messages also omit the controller, which remains null. These are seven existing chains in four matches, not seven additional independent matches.

## Domain and exported contract

The pure finder starts from the existing verified Regeneration/casualty/initial-removal chain and confirmed time-local ownership. It uses the immediately preceding board and the **first** following board, not a search for a convenient later result. Membership must be unique on both boards, retain the same roster, and agree with any explicit team/Data identity. The after-board must be stable, same frame, phase5 and off pitch, with the result-consistent reserves/injured box. Contradictory known status, membership, identity, position, controller or source layout withholds only this observation; it does not rewrite the existing dice.

Only two exact bridges are supported: one RulesEngineStandBy, or EndTurn2→ActiveGamerChanged→PauseActiveTimer→validated ActiveTimerChanged→StandBy. Their source indices and top-level child indices must be consecutive, with no intervening player action or unknown policy. Known controllers must agree; omitted standby/controller observations stay null. The turn-end bridge is checked across the raw event stream even when parser turn segmentation divides it. It supplies no inferred game-turn clock. Checkpoint lookup is logarithmic, with at most five controls checked per candidate.

`metadata.recoveryControl` exposes typed unscored control provenance. `metadata.regenerationAftermath` on the original recovery roll references the before/after checkpoint indices, outer board locator, roster, ordered control IDs and exact observed cell/situation/status/CanAct/tackle-zone fields. The shared schema joins source tags, ordered indices/children, controller consistency, result/box and nullable status. These validate the exported structure, not cryptographic authenticity of replay bytes absent from a report.

UI/CLI explain reserves versus the injured box, the earlier staged removal, unknown action availability and the lack of an extra luck/context contribution. The observation does not prove immediate re-entry, a useful activation, future setup selection or final match availability. The earlier2,231 dice scores, coverage dice identities and source denominators are retained; no recovery state is added to dice luck a second time.

## Acceptance checks

Synthetic face1–6 cases preserve the existing±3/4 recovery deviations and exactly two scored stages in their explicit damage fragment. Tests exercise both bridges, missing controller/physical flags, explicit flags without legal-activation inference, unstable/wrong-phase/missing/duplicate/foreign-identity/contradictory first boards, unknown controls, timer/controller conflicts, future suffix and same-index later-board invariance, and forged public checkpoint/control/state joins. Independent seven-source joins verify raw hashes, locators, roster membership, box/flags and control observations.

The frozen historical scored-cohort SHA still predates these state receipts. Its projection excludes only the new `regenerationAftermath` metadata while preserving every original event/probability/value field; the independent state joins test the omitted new evidence. No historical expected SHA is reset. Full parent-report reconciliation, mandatory checks and rendered desktop/mobile evidence are recorded in the implementation ledger before publication. Current-schema hosted acceptance and the original full state, recovery/availability, choice, successor, contextual/calibration and integrated gates remain open.

Final gate:2,366 unit/API cases, real Redis/lint/types/production build and39 Chromium flows pass. The12-report exact-parent comparison asserts only the seven state receipts/eleven controls and their independently computed normalized-event counters/reason summaries before removing those declared differences; every2,231 prior score/odds, dice/source identity and denominator, subtotal/team/verdict/context/moment field matches. Max2,458,525 JSON bytes. Final desktop/mobile screenshots were visually inspected after source444 success/reserves and1012 failure/injured-box details, export and reset. See the execution ledger for exact commands, first failed historical-hash run and complete successful rerun.
