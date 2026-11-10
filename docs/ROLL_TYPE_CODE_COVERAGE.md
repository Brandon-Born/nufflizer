# Roll Type Code Coverage Crosswalk

## Current direct-event evidence

Independent 12-demo raw inventory: `EventRoll|13`. These are visible excluded outcomes; omitted die type/Outcome and unverified modifier or recovery rules do not receive odds. See [raw counts](../tests/fixtures/evidence/bb3-demo-raw-roll-inventory.json). Historical tables below do not control runtime labels or scores.

## 2026-11-10 scoped semantic update

Model `dice-only-3` now uses UI-backed Rush (1), Dodge (2), Pick up (4), and Catch (7) contracts for replay `1-4-0-0`. The old table labels for 2/4/34/37/71 are superseded: 34/37/71 are Really Stupid/Foul Appearance/Loner and remain unscored. Exact admission, reroll, attribution and natural-roll limits are in [REPORT_CONTRACT.md](REPORT_CONTRACT.md#model-dice-only-3-numeric-scope); `tests/unit/verifiedNumericChecks.test.ts` exercises the exact sanitized playback extracts. Historical counts and unsupported rows below are retained as history, not accepted semantics. No backlog item is closed by this slice.

## November runtime correction (NUF-008/009)

Ordered extraction now retains `QuestionBlockDice|3`, `ResultRoll|15`, `ResultRoll|21`, `ResultRoll|36`, and `ResultRoll|46`. These have explicit unverified contracts and no semantic promotion. `ResultBlockRoll|3` contains actual face data under `Die`; the historical claim that it has no dice was incorrect. Injury/casualty records also remain random outcomes, not harmless summaries. Block and damage-category contributions are disabled until independent rule and beneficiary evidence exists. Movement/ball-handling numeric threshold analysis remains provisional. Whole-match comparisons abstain; the historical tables below are not current acceptance evidence.


> 2026-11-09 review notice: this crosswalk describes historical implementation behavior, not proof that its labels or probabilities are correct. In particular, real block/injury outcomes are excluded and dodge scoring is unreachable at the reviewed baseline. Follow [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md), especially NUF-009–015 and NUF-027, before promoting additional families or treating known-family coverage as whole-match confidence.

This document maps each observed `sourceTag|rollType` pair to current code behavior so future agents can target specific gaps quickly.

Primary implementation files:
1. `/Users/bborn/projects/bb-nuffilizer/src/domain/replay/mappings.ts`
2. `/Users/bborn/projects/bb-nuffilizer/src/domain/replay/rollTypeContracts.ts`
3. `/Users/bborn/projects/bb-nuffilizer/src/domain/replay/extractStructuredTurns.ts`
4. `/Users/bborn/projects/bb-nuffilizer/src/domain/nufflizer/classifyRollContext.ts`
5. `/Users/bborn/projects/bb-nuffilizer/src/domain/nufflizer/analyzeLuck.ts`
6. `/Users/bborn/projects/bb-nuffilizer/src/domain/nufflizer/probability.ts`

Coverage status meanings:
1. `mapped-and-scored`: explicit deterministic scoring path.
2. `mapped-but-excluded-deterministic`: explicit excluded deterministic family (counted in roll-candidate denominator).
3. `mapped-randomizer-excluded`: explicit randomizer family (not a roll candidate).
4. `mapped-summary-excluded`: source summary chain event (not a roll candidate).

## Coverage Table
| Pair | Coverage Status | Contract Kind | Scoring Category | Roll Candidate | Current Handling |
| --- | --- | --- | --- | --- | --- |
| `ResultBlockRoll|3` | mapped-summary-excluded | summary | block | no | block summary event only; never luck-scored |
| `ResultInjuryRoll|11` | mapped-summary-excluded | summary | injury | no | injury summary chain event |
| `ResultCasualtyRoll|12` | mapped-summary-excluded | summary | injury | no | casualty summary chain event |
| `ResultRoll|2` | mapped-and-scored | scored_deterministic | block | yes | scored block check |
| `ResultRoll|10` | mapped-and-scored | scored_deterministic | armor_break | yes | scored armor-like 2d6 check |
| `ResultRoll|34` | mapped-and-scored | scored_deterministic | armor_break | yes | scored modified armor check |
| `ResultRoll|4` | mapped-and-scored | scored_deterministic | injury | yes | scored injury check |
| `ResultRoll|37` | mapped-and-scored | scored_deterministic | injury | yes | scored injury variant check |
| `ResultRoll|71` | mapped-and-scored | scored_deterministic | argue_call | yes | scored argue-call check |
| `ResultRoll|8` | mapped-randomizer-excluded | randomizer | - | no | excluded as randomizer (no target semantics) |
| `ResultRoll|9` | mapped-randomizer-excluded | randomizer | - | no | excluded as randomizer |
| `ResultRoll|25` | mapped-randomizer-excluded | randomizer | - | no | excluded as randomizer |
| `ResultRoll|26` | mapped-randomizer-excluded | randomizer | - | no | excluded as randomizer |
| `ResultRoll|30` | mapped-randomizer-excluded | randomizer | - | no | excluded as randomizer |
| `ResultRoll|87` | mapped-randomizer-excluded | randomizer | - | no | excluded as randomizer |
| `ResultRoll|1` | mapped-and-scored | scored_deterministic | movement_risk | yes | scored movement-risk 2+ check |
| `ResultRoll|5` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|6` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|7` | mapped-and-scored | scored_deterministic | ball_handling | yes | scored pickup attempt check |
| `ResultRoll|31` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|33` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|41` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|43` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|45` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|67` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|73` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|74` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|88` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |

## Remaining Priority Targets
Expanded unresolved counts (12 demo fixtures):
1. `ResultRoll|33` -> 39
2. `ResultRoll|88` -> 18
3. `ResultRoll|67` -> 15
4. `ResultRoll|5` -> 12
5. `ResultRoll|73` -> 7
6. `ResultRoll|6` -> 6
7. `ResultRoll|45` -> 5
8. `ResultRoll|31` -> 4
9. `ResultRoll|41` and `ResultRoll|43` and `ResultRoll|74` -> 2 each

Priority order:
1. `ResultRoll|33` (highest remaining impact).
2. `ResultRoll|88` and `ResultRoll|67` (next coverage impact tier).
3. Remaining low-frequency families after higher-impact tiers are resolved.
