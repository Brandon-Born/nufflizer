# Observed board checkpoints

Updated 2026-11-10. NUF-008 is complete for ordered source evidence. NUF-013 and NUF-016 remain open for broader attribution and state reconstruction.

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

## Scoped pre-roll reduction and context

Mobility-possession-3 looks up ordered checkpoints strictly before each original roll or question. It applies verified ordinary movement (matching PlayerStep, adjacent in-bounds origin and destination, ResultDoMove plus Moved1, no occupancy contradiction), supported declarations and a scoped no-roll stand-up. A successful intervening Rush or Dodge must match its explicit die and target. Other mutations invalidate the frame until another checkpoint. A recorded held ball follows the moved carrier. ReplayStep, child, step and message locators remain separate from validated half/turn and the activation source ID. Timeline labels require normal phase, explicit active-team ownership and observed turn values.

The stand-up path requires an ordinary Move declaration, a prone and actionable actor on the active roster, matched stationary origin and destination, an actual StepType7 with Skill0 and a same-step ResultNoRollSuccess. It retains the checkpoint's recorded movement budget in this shape and leaves tackle-zone status unknown. A missing or unverified confirmation clears the frame. The verified Dodge destination can show an adjacency change relative to a teammate explicitly holding the ball. This describes the intended position and adds no tactical weight.

Mobility-possession-1 compares success and failure under the recorded terminal team reroll policy. It supports non-carrier Dodge across a verified open move and Pickup on the ball's exact square with all eight neighboring landing squares empty and in bounds. One other standing teammate with explicit CanAct, movement and a legal ordinary destination contributes one context unit. Pickup success securing the ball adds two units; a failed pickup can bounce uniformly to eight empty squares, and the fraction marked by opponents adds up to one unit. Marks measure immediate exposure, not the chance of an actual opponent recovery. Missing availability, flight/occupied bounce paths, carrier dodges, unlinked decisions and unresolved ownership leave context unscored.

The signed contribution is (observed success minus probability) times the sum of those components. Synthetic matched replay inputs demonstrate a failed 2+ dodge at -5/3 units with two useful moves left versus zero with none, and a failed pickup with three of eight landings marked losing more context units than an otherwise identical safe pickup. Under a fixed policy, enumerating the six D6 faces gives mean zero. The report validates event/category/team conservation and shows unknown context separately from a measured zero. Future checkpoints and duplicate kept summaries cannot change totals.

Held-out public demos provide stand-up and carrier-movement acceptance using independent stdlib decoding. Demo1 checkpoints 143/3 and 144/3 bracket player 38 standing up and dodging with movement 3 → 2. Demo6 checkpoint 412/3 records the active team's turn 11 and player 42 holding the ball at [15,6]. Player 45 first dodges to [13,6], then the second Dodge3+ at 413/1 step 2 targets [14,7], next to the carrier. A changed future checkpoint cannot alter that explanation. Demo-goblins1 ends 2–1 after an uncontested turn-16 touchdown at 536/2. Its move emitted no dice and adds no luck.

Remaining work includes actions beyond the standing ordinary-move subset, replay-specific omission defaults, kickoff and drive transitions, scoring orientation and calibrated tactical values for high-stakes situations. The held-out checks verify ordered state and explanation. Numeric context contributions still require complete availability and the terminal reroll policy.

## Verified pickup and carried movement

Mobility-possession-4 establishes possession from an observed unmodified successful Pickup immediately following the verified move to the recorded ball square. An omitted holder flag on that earlier board stays unknown until the pickup. A conflicting holder, movement or die clears the frame. The actor must match a recorded ordinary Move declaration. If the board omits the active side, a unique roster-backed Move declaration can preserve the actor's position, while the active side and turn remain unknown. The source-linked ball moves with its carrier until a later checkpoint or unverified mutation.

Independent demo8 decoding links checkpoint 102/3 and pickup 103/1 step 1 to the Rush from [24,13] to [25,13] at step 9. Changing the later checkpoint leaves the earlier evidence unchanged. The same player's direct touchdown at 103/2 is reported separately as observed aftermath.

## Observed last-turn scoring attempts

Mobility-possession-5 reads Side and standard pitch-zone geometry from the same ordered source. A standard layout must already have been observed in an initial checkpoint. A future initial checkpoint cannot establish prior geometry, and an explicit small pitch disables this path. This geometry is specific to the supported standard 26×15 replay layout.

The actor roster's GameTurn can supply its observed clock even where ActiveTeam is omitted. It remains distinct from the active-side clock. Demo1 at 653/3 precedes carrier1's 2+ Rush to [25,14] at 654/1 step7. Demo5's prior board precedes carrier40's 2+ Rush to [0,3] at 540/1 step8. Both actor teams record cumulative turn16 in Period1, leaving zero further scheduled turns in the period. Their explicit roster Side values are32 and64. Matched earlier counter14 inputs yield two further turns. The direct left-end touchdown omits X; the report preserves that null while retaining the encoded move's explicit destination0. The move, holder, side and clock explain the attempt before the roll, and the direct touchdown records its observed aftermath.

## Current numeric player-trait observations

Schema2.8 checkpoints retain each player's current Data.Id, IdPlayerTypes and independent innate/acquired skill lists. Only numeric bounded observations are copied. Missing, malformed and overlong lists stay unknown; a newer snapshot never inherits an omitted list. Pre-roll actor and target traits use the reducer's existing strict checkpoint/order/ownership boundary and are separate roles. Source008 UI-087 verifies positive Data for the first ID48 mercenary and absent Data after removal/repurchase; the earlier skills and portrait cannot identify the replacement.

Trait lists record data rather than complete eligibility, temporary effects or a transformation policy. Demo1's later snapshots omit Data, so its observed initial skills do not establish current pre-roll skill availability. The remaining NUF-010/011/013/016 requirement is an independently supported persistence/mutation contract across those omissions and relevant player changes, plus the applicable complete rule tables. This work does not add skill-conditioned tactical values.
