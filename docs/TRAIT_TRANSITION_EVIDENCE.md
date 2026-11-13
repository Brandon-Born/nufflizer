# Scoped intrinsic-trait continuity

Schema2.46 / dice-only-22 / mobility-possession-37. Owning work: NUF-010/011/013/016–018/021/022. Parent implementation: `ff9238edfee63007b20476c6c11daada6926cf09`.

The prior reducer erased every player's continued intrinsic-trait knowledge at a recognized Bone Head/Really Stupid/Foul Appearance/Fend/Frenzy/Sidestep use, a stunned-player reset, an experience award or an explicit mental-effect end. These records do not all rewrite learned skill lists. Full current observations could renew knowledge, but subsequent omitted lists could not; the resulting global invalidation unnecessarily withheld unrelated players' evidence.

## Accepted transition contract

Replay1-4-0-0 only, with existing ordered ownership and checkpoint guards:

| Record | Accepted evidence | Intrinsic effect |
| --- | --- | --- |
| ResultSkillUsage | Explicit nonnegative numeric PlayerId, Skill10/31/35/36/51/56, Used0/1, exactly these fields | Preserve lists; no effective skill, posture, movement, activation, choice, die or resource policy is granted |
| ResultGainSpp | Explicit nonnegative numeric PlayerId/SppGained, exactly these fields | Preserve lists; this is an award, without an added skill or advancement transition |
| EventFaceUpStunnedPlayers | Explicit empty PitchRolls and only a Players/PlayersItem list, 1–64 unique nonnegative safe IDs | Preserve lists; do not infer posture, availability, stability or restored tackle zones |
| EventAddPlayerEffect / EventEndPlayerEffect | Only PlayerId and exact already verified Confused44/Skill4/BoneHead31 or ReallyStupid51/durations[6,1], no characteristic or additional-skill modifiers | Invalidate the holder only; preserve unrelated players and prior empty-prayer evidence |

Direct PlayersItem and effect-holder IDs may be canonical numeric strings; encoded skill/experience fields must be numeric. Missing/null/unsafe/fractional IDs, duplicate or oversized lists, nonempty/omitted PitchRolls, extra fields, unknown skills/effects/providers/durations and attribution conflicts retain barriers. List length is checked before mapping it. The previously recognized passive skill uses now also require the same explicit holder, binary decision and exact field shape; null cannot coerce to a decline.

The holder of a recognized effect remains invalidated even after its end. A later omitted/empty effect cannot recover a deleted seed. Existing current empty player/team/board effects, absent transformations, compatible ownership, continued empty prayers, unique roster membership and agreeing partial Data refreshes remain required. Purchases/removals remain scoped by their explicit player ID. Unknown transitions invalidate knowledge. Raw checkpoint Data and all omitted physical fields remain unchanged.

## Independent evidence

The standard-library `scripts/extract-trait-transition-evidence.py` imports no application maps or scoring logic. Its numeric/presence-only `bb3-trait-transitions.json` retains all12 input hashes, initial seeds, Data refreshes, 848 offered block-pool participant observations and440 transition payloads. There are272 selected skill uses,78 stunned resets and74 experience awards;13 effect ends satisfy the mental contract. Three other effects remain outside it, including an actual Confused44/provider84 end in demo5. The effect number alone cannot establish the supported provider/lifetime contract. No account/player names are exported.

Skill code identities independently agree with installed enum/static rule-data artifacts. Behavior is checked against the cached BB2020 primary rulebook, SHA256 `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`: printed27,70,74–78,84,86. Complete relevant pages were rendered and inspected. These are rule definitions for intrinsic versus immediate physical effects, not new BB3 playback captures or proof of arbitrary future serialization. Existing in-game/paired evidence and mental-effect witnesses retain their separate provenance.

Every exported block participant's complete seed and current roster/effect observation joins to the independent artifact, including the current complete seed after source12 rather than falsely insisting on the initial board. Every admitted single-pool distribution joins the independently generated1024-case exact rational arithmetic table with its own skills, dice count, controller and fresh/held indices. Existing independent push witnesses check every newly admitted menu against current source positions, complete trait evidence, actual menu and selected branch. Five additional raw injury witnesses extend the separate injury-table artifact: demo1/ReplayStep36, demo10/32,76,90 and demo5/70. Its source-specific complete-seed locator replaces an invalid universal initial-checkpoint assumption.

## Public effect and regression boundary

All12 demos now expose73 continued block-trait receipts (21 before),15 fixed-policy block distributions (3 before),12 ordinary post-die push models (3 before), and9 conditional injury tables (4 before). These are52/12/9/5 additions. The original complete models are unchanged. All706 push menus remain non-random. The largest report is2,454,949 bytes, below the unchanged4,000,000-byte limit.

A complete parent/current comparison preserves every prior field after only new block-trait/skill/injury receipts, newly modeled formerly unknown-policy pushes and their validated result/follow links, report identity/time and schema/context versions are reconciled. All2,223 scored outcomes, raw dice identities/dispositions, coverage denominators, team/category/action sums,27 partial context ranges, zero source-backed point estimates and whole-match abstentions remain unchanged. No existing frozen expected SHA is reset: `trait-continuity-prior-receipts.json` records parent receipt membership solely to project new fields away from older cohort hashes. It is regression evidence, not a semantic oracle.

Web/API/CLI continue sharing the strict report schema and explanations. The existing ten-request HTTP gate checks original two-die and newly supported one-die models at their distinct exact means/chances. The actual-source CLI checks all five demo5 push models in JSON/text. The existing browser flow additionally filters player45, opens source367's newly supported model, exports its historical-seed receipt and resets; mobile retains an observed menu with no invented tactical score. Browser plugin not available; repository Playwright supplies local production-server checks at1280×800 and390×844. Screenshots remain outside the repository.

This does not establish full current effective-trait/control policies, playable setup/drive/reset state, pre-roll push/ball successors, treatment/casualty probabilities, calibrated context or current hosted acceptance. The source-backed models above remain separately labeled conditional/post-die components. Production4s/256MiB, transfer/decompression/XML/event/report bounds,10 admissions/minute and two leases are unchanged. The execution log records complete validation and precise remaining backlog scope.
