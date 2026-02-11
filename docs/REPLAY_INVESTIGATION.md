# Replay Investigation Notes (2026-02-08)

These notes summarize observed structure from sanitized demo replay files:

1. `demo-replays/demo1.bbr`
2. `demo-replays/demo2.bbr`
3. `demo-replays/demo3.bbr`

## Key Findings

1. Core turn progression is represented by repeated `EventExecuteSequence` blocks plus `EventEndTurn`.
2. Sequence payloads use nested base64 in `MessageData` (double decode required).
3. Step-level payloads commonly use:
   - `PlayerStep`
   - `DamageStep`
   - `BallStep`
4. Frequent result tags include:
   - `ResultUseAction`
   - `ResultBlockRoll`
   - `ResultBlockOutcome`
   - `ResultPushBack`
   - `ResultTeamRerollUsage`
   - `ResultInjuryRoll`
   - `ResultPlayerRemoval`

## Working Mapping Assumptions

1. `block`:
   - `ResultBlockRoll`, `ResultBlockOutcome`, `ResultPushBack`
2. `blitz`:
   - `ResultUseAction` with `Action=2`
3. `dodge`:
   - `ResultRoll` when step context `StepType=1`
4. `reroll`:
   - `QuestionTeamRerollUsage`, `ResultTeamRerollUsage`
5. `casualty`:
   - `ResultInjuryRoll`, `ResultCasualtyRoll`, `ResultPlayerRemoval`
6. `ball_state`:
   - `BallStep`, `Carrier`, `ResultTouchBack`
7. `possible turnover`:
   - `EventEndTurn` with `Reason != 1`

## Mapping Provenance Notes

1. The mapping tables in `src/domain/replay/mappings.ts` are based on:
   - observed demo replay codes from `demo1.bbr`, `demo2.bbr`, and `demo3.bbr`;
   - existing parser behavior that already classifies major event chains correctly.
2. Additional labels were added for common BB3 action/step/roll families so unknown-code diagnostics remain stable as coverage expands.
3. Code labels that are not yet behaviorally interpreted are intentionally descriptive placeholders and are only used for diagnostics/evidence.

## Observed Code Ranges

Across the three demo replays:

1. Common `StepType` values: `0`, `1`, `2`, `3`, `6`, `10`.
2. Additional observed `StepType` values: `13`, `17`, `24`, `27`, `29`, `31`, `32`.
3. Common `ResultUseAction.Action` values: `1`, `2`, `3`.
4. Additional observed `Action` values: `4`, `5`, `6`, `15`, `16`.

These extra codes are not fully mapped yet and should be refined as more replay coverage is added.

## Deterministic Scoring Coverage (2026-02-11)

The Nufflizier probability engine now distinguishes scored deterministic contexts from excluded contexts.

1. Scored deterministic contexts:
   - `ResultRoll` + `RollType=2` -> `block`
   - `ResultRoll` + `RollType=1|34` -> `armor_break`
   - `ResultRoll` + `RollType=4|31|37` -> `injury`
   - `ResultRoll` + `StepType=1` + valid target -> `dodge`
   - `ResultRoll` + `StepType=4|5|8|9|12|13` + valid target -> `ball_handling`
   - `ResultRoll` + `RollType=71` + valid target -> `argue_call`
2. Excluded contexts:
   - Missing target threshold.
   - Non-deterministic or unsupported source-tag/roll combinations.
   - Summary-chain events (`ResultBlockOutcome`, `ResultInjuryRoll`, `ResultCasualtyRoll`, `ResultPlayerRemoval`) that do not carry stable roll-threshold semantics.
3. Argue-call variant matrix:
   - `RollType=71`: scored when target is present.
   - `RollType=42`: excluded.
   - `RollType=70`: excluded.
4. Fixture evidence:
   - `tests/fixtures/models/argue-rolltype-42.json`
   - `tests/fixtures/models/argue-rolltype-70.json`
5. Transparency requirement:
   - Every event must indicate `scoringStatus` and `statusReason`.
   - Coverage must expose scored/excluded rates and exclusion-reason inventory.

## Goblin Fixture Findings (`demo-goblins1.bbr`, 2026-02-11)

1. Argue-the-call scoring:
   - `ResultRoll` with `RollType=71` remains deterministic and scored as `argue_call`.
2. Ball-handling false-positive control:
   - Step-only promotion is no longer sufficient.
   - `ball_handling` now requires `ResultRoll` plus `StepType in {4,5,8,9,12,13}` plus supported roll family `11|12|13|14|15|25`.
   - Unsupported families observed in goblin replay (for example `RollType=7` and `RollType=30`) remain visible but excluded.
3. Dodge false-positive control:
   - `dodge` now requires `ResultRoll` plus `StepType=1` plus supported roll family `3|17|21`.
4. Block-chain context merge:
   - `ResultBlockRoll`, `ResultBlockOutcome`, and `ResultPushBack` entries are retained in event timelines but excluded from luck scoring when merged to a nearby scored block anchor (`RollType=2`).
   - Merged members carry `metadata.mergedBlockAnchorId` and exclusion reason `excluded: merged into block anchor <id>`.
5. Coverage interpretation update:
   - Primary fidelity signal is now `coverage.rollCandidates` (dice-only candidate population).
   - Secondary visibility signal remains `coverage.allEvents` (entire normalized event stream).
6. Mapping diagnostics:
   - `RollType=30` is now labeled `special_event_30` to reduce unknown-code ambiguity while semantics remain intentionally unscored.
