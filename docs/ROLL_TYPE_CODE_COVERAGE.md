# Roll Type Code Coverage Crosswalk

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
| `ResultRoll|1` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but semantics unresolved |
| `ResultRoll|5` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|6` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
| `ResultRoll|7` | mapped-but-excluded-deterministic | excluded_deterministic | - | yes | deterministic but unresolved |
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
1. `ResultRoll|1` and `ResultRoll|67`: highest-volume unresolved deterministic families.
2. `ResultRoll|7`, `ResultRoll|33`, `ResultRoll|88`: repeated unresolved families that can affect candidate coverage.
3. low-frequency one-offs (`6`, `31`, `41`, `43`, `74`) after higher-impact families are resolved.
