# Observed return after Regeneration

Schema2.52 / dice-only-25 / mobility-possession-40. This advances NUF-011/016/018/021/022/027; it does not complete their original acceptance requirements.

## Supported observation

An already qualified successful Regeneration roll and its first reserves observation can now link to a later setup placement, first following regular-play snapshot and first supported recorded Move or Block declaration by that same player instance. Each milestone retains its own checkpoint, outer source locator, roster, cell, nullable status/CanAct/TackleZone/controller/period and observed own-team turn. Missing fields are never carried forward. A declaration records actual later participation, not a complete legal-action test, a useful-action count or the value of a hypothetical recovery.

The pure reducer merges ordered raw events and boards once. Unique membership must remain on the same roster with compatible explicit team and player Data IDs. Known catalogue purchases/removals invalidate their matching ID; unknown extra policy fields and unsupported intervening events stop continuity. A missing/conflicting member, unknown position/phase, new damage/removal or unsupported first setup/declaration cannot be skipped for a later convenient board. An event without an ordered index stops tracking with a null source index. Already witnessed earlier milestones survive a later gap; a completed declaration cannot be revoked by a future suffix. Replays without qualified recoveries skip this work.

Three statuses stay distinct: `observed` retains the accepted prefix (and any later stop), `unverified` has a continuity boundary before placement, and `not_observed` has no later linked return. None proves permanent unavailability. Setup CanAct and TackleZone flags are observations, not permission to play during setup or proof of defensive coverage.

## Raw-source cases

The five successful reserves cases from [the initial recovery-state audit](REGENERATION_STATE_EVIDENCE.md) are followed independently. All locators below are source indices, not validated match turns.

| Replay / recovery | Player / roster | First setup | First regular play | Later declaration | Application result |
| --- | --- | --- | --- | --- | --- |
| demo10 /444 |6 /0 |774, frame116 child6, [11,12] |906, frame130 child8 |1256 Move, before1253 | Observed through declaration |
| demo9 /1573 |43 /1 |2161, frame278 child6, [14,12] |2192, frame284 child7 |2245 Move, before2242 | Observed through declaration |
| demo4 /1425 |3 /0 |2216, frame305 child6, [12,7] |2257, frame313 child7 |2260 Block, before2257 | Unverified after source1696; raw later observations do not repair it |
| demo9 /3894 |43 /1 | None later | None linked | None linked | Not observed |
| demo9 /4576 |41 /1 | None later | None linked | None linked | Not observed |

Demo4's QuestionSkillUsage1696 has an unqualified intervening policy under the current continuity contract; QuestionInterceptors1704 and EventEndEffect2167 follow. This is an evidence gap, not a claim that identity actually changed. The global policy was not broadened to admit it. Failed recoveries demo10/1012 and demo7/1746 get no successful-return trace.

The accepted setup/play/declaration-before snapshots have CanAct/TackleZone=true and omitted status/situation. Demo10's controller/period stay null; its own turns are4/5/6. Demo9 retains controller1/period1 and own turns8/9/9. Both declarations contain raw ResultUseAction.TeamId0; actual owned roster attribution correctly yields team0 versus team1. Existing demo9/2245 also confirms a different player's ordinary Move completion; its prior metadata and explanation remain intact.

## Independent evidence and checks

`scripts/extract-regeneration-return-evidence.py --check` independently decodes the original XML with the stdlib extractor, selects the five raw success cases, and reproduces `tests/fixtures/evidence/bb3-regeneration-returns.json`. Whole-file SHA256 provenance, raw setup/play/declaration-before observations, exact decoded declaration fields and bounded canonical fingerprints retain every intervening structured event's locator/tag/direct-field-set/identity integers and every selected-player/full-roster board in each tracked prefix. The raw selection yields three later placement/play/declaration sequences, including the deliberately unsupported demo4 case; it does not use application admission as an oracle.

The event fingerprint deliberately excludes scalar ReplayStep/Clock timestamps and derived Carrier markers. It checks identity/order-relevant field projections, not every decoded byte, full legal state or decoder equivalence. Source file hashes cover the original bytes. JavaScript and Python use the same ordinal canonical key order, preserving null observations without substituting zero. Initial focused failures found the scalar timestamp mismatch and locale-based canonical key sorting in the test harness; both were corrected explicitly without changing production source guards or prior expected hashes.

Forty-nine focused semantic/adversarial cases cover partial prefixes, omitted flags/controllers, first-board conflicts, same-ID reuse versus unrelated catalogue operations, new damage, explicit Data-team conflicts, unknown intervening policies, new source-less records, supported Move/Block declarations, malformed declarations, public report forgeries, raw TeamId0 and future-prefix stability. Four independent-extractor/corpus tests join all five raw prefixes and the differing admission outcomes. The existing real CLI demo10 admission and real API failed-recovery admission are extended without another HTTP request. A dedicated browser flow follows successful return and its excluded declaration, full export and reset on desktop/mobile; the earlier success/failure recovery-state flow remains.

## Conservation and limits

Two declaration markers are non-random, with null binary values and zero dice/context contribution. Only demo10/1256 is a newly visible event; demo9/2245 already existed. Five parent recovery rows gain return statuses. No roll is rescored. All twelve complete report comparisons preserve every other parent field after asserting these exact receipts, the one new event and its derived counts/reason summaries, versions/identity/time. All2,231 scored deviations/odds, damage/action/category/team totals, dice provenance/denominators,27 context ranges, zero public context points, moment order and every abstaining verdict field remain unchanged. Largest JSON remains2,458,525 bytes under4MB.

General setup/kickoff/drive legality, arbitrary transformations, current skill/resource eligibility, full recovery/treatment and final availability, useful actions, valid full counterfactuals, calibration and current-schema hosted integration remain open. Production4s/256MiB/report4MB, upload/XML/event bounds and shared10/minute/two-lease limits are unchanged. See the execution log for exact final validation and publication evidence. Original ledger status remains13 done/15 incomplete.
