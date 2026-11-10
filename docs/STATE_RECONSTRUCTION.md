# Observed board checkpoints

Updated 2026-11-10. NUF-008/013/016 remain incomplete. This is the first state reconstruction slice, not a tactical simulator or contextual luck model.

## Implemented contract

`ReplayModel.boardCheckpoints` preserves compact numeric observations from `NotificationGameJoined/InitialBoardState` and direct `ReplayStep/BoardState` records, in document order. Each checkpoint has its original one-based ReplayStep and zero-based direct-child locator where applicable, plus `afterSourceIndex`: the number of extracted source events already seen. Existing random-event counts and source IDs are unchanged. Incidental nested BoardState tags do not become game checkpoints. Normalization is bounded by the XML/event budgets, a separate checkpoint-count guard and a maximum of 64 player observations per team; that work cap is not a legal roster size.

The pure `observeBoardCheckpoint` function accepts replay version `1-4-0-0`. Other versions retain the boundary with `unsupported_version` and null board semantics. Fields include explicit period/phase codes, turns per period, active team index/gamer/player, cumulative team GameTurn, touchdown and reroll values, player coordinates and explicit availability/movement/status/situation fields, and ball coordinates/carrier/held evidence. Team roster index, explicit TeamId and GamerId remain distinct namespaces. No private names, account IDs or arbitrary payload strings are copied into checkpoints.

Every snapshot is decoded from its own fields. Omission means null, including omitted zeros; it never means false, zero or the previous value. Incomplete coordinates remain incomplete. Coordinate geometry uses the recorded 26-by-15 pitch: this distinguishes in-bounds from off-pitch observations but does not establish legal availability. `CanAct=1` alone never supplies a useful-activation count. Raw status/situation codes are retained without inventing a standing/prone/stunned or recovery policy.

Held possession requires explicit IsHeld1, an unambiguous current-snapshot carrier membership, matching complete ball/player cells and an in-bounds carrier without an explicit nonzero Situation. Otherwise possession is unknown and inconsistent held evidence is flagged. Explicit IsHeld0 means not held, which can include flight; it does not automatically mean a loose ball. Missing Carrier/IsHeld never carry old possession forward. Duplicate player IDs and incomplete/malformed team/player collections are observable issues; static initial-roster ownership is not substituted for current membership.

`lastBoardCheckpointBefore(checkpoints, sourceIndex)` searches the parser's ordered timeline with a strict boundary: a checkpoint after event N cannot supply pre-roll context for event N. Its result is the last observation with its locator, not a reconstructed current state. Intervening movement, rolls or decisions can change the board, and a later checkpoint must never leak into pre-roll leverage.

## Independent acceptance evidence

`tests/unit/boardState.test.ts` reconstructs exact sanitized direct-event projections through the production XML parser, preserving original ReplayStep/child locators:

| Case | Independent observation | Required checkpoint behavior |
| --- | --- | --- |
| UI-095, source025 | Defender40 crosses the sideline and is removed while CanAct1/TackleZone1 persist | Preserve [17,14] -> [17,15] -> [-1,-1]; final Situation1, omitted Status unknown; no legal availability inferred |
| UI-096, source025 | Carrier5 falls; ball becomes visibly loose at [4,9] | Initial explicit held possession reconciles; missing after-state Carrier/IsHeld clear held evidence to unknown |
| UI-098, source016 | Pass intermediate state retains Carrier46 while the ball is elsewhere and IsHeld is omitted | Preserve carrier ID as raw observation; possession remains unknown |
| UI-099, source016 | Failed Foul Appearance loses the actor's activation while teammates continue | Preserve actor44 CanAct1/MovePoint5 -> null/null with unchanged cell; retain teammate45 CanAct1; do not treat omission as a universal false |
| UI-084, source020 | UI displays Extra Time, home turn20 | Retain Period2, team GameTurn20/19 and TurnsPerPeriod8 separately; do not wrap the clock or invent remaining turns |

Synthetic adversarial cases independently check future-snapshot exclusion, version gating, explicit versus omitted zero, conflicting held-ball ownership/coordinates, off-pitch carrier rejection, bounded malformed collections and incidental nested tags. Original-source extraction verifiers pass for sources016/020/025; source020 uses the explicit offline32MiB cap while application limits stay unchanged.

## Remaining reconstruction work

Use ordered actions/messages to advance a checkpoint to the exact pre-roll state, with source-specific mutation and omission rules. Reconcile action declarations versus activations and reactions, legal remaining actions/movement, removal/recovery/recruitment, setup/kickoff/drive changes, cumulative turns versus period/half, overtime and remaining turns, resources and possession during flight. Validate orientation, scoring threats and exposed versus protected pickups before assigning tactical values. A flag disappearing in one annotated transition is insufficient for a universal default rule.

The report is now schema2.0/model dice-only-4 (retained-original numeric rerolls); it does not yet export these internal checkpoints or consume them for scoring. No contextual weights, confidence claims, legal-activation totals or comparative verdicts were added. NUF-017/018/019 still require valid counterfactual successor states and causal accounting, beyond observed aftermath.
