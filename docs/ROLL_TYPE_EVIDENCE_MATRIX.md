# Roll Type Evidence Matrix (Demo Replay Baseline)

Date: 2026-02-11  
Fixtures analyzed:
1. `demo-replays/demo1.bbr`
2. `demo-replays/demo2.bbr`
3. `demo-replays/demo3.bbr`
4. `demo-replays/demo-goblins1.bbr`

## Confidence Rubric
1. `high`: repeated across multiple fixtures with stable dice shape, target pattern, and sequence role.
2. `medium`: repeated but semantics still ambiguous or mixed by context.
3. `low`: sparse or one-off observation with insufficient context to lock semantics.

Status meanings:
1. `known`: semantics stable enough for deterministic handling.
2. `ambiguous`: deterministic shape exists, but rule meaning is not settled.
3. `unknown`: insufficient evidence to assign meaning.

## Evidence Table
| Pair | Observed Count | Dice / Target Pattern | Sequence Signature | Inferred Semantics | Confidence | Status | Recommended Action |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `ResultBlockRoll|3` | 236 | no Dice payload, outcome-only | `Carrier/ResultUseAction -> ResultBlockRoll -> ResultPushBack/ResultBlockOutcome` | block face summary | high | known | exclude as summary |
| `ResultInjuryRoll|11` | 68 | 2d6 summary payload, no target | usually after `ResultRoll|10` | injury chain summary | high | known | exclude as summary |
| `ResultCasualtyRoll|12` | 5 | d6 summary payload | after `ResultInjuryRoll|11` | casualty chain summary | high | known | exclude as summary |
| `ResultRoll|2` | 147 | 1 die, target typically 2-4 | appears in block chains | block check | high | known | score |
| `ResultRoll|10` | 232 | always 2 dice, target mostly 8-10 | often follows `ResultBlockOutcome`; often precedes `ResultInjuryRoll|11` | armor-like chain check | high | known | score |
| `ResultRoll|34` | 73 | 1 die, requirement 4, difficulty often 2 | frequently follows blitz/foul action declaration | modified armor-like check | high | known | score |
| `ResultRoll|4` | 24 | 1 die, target mostly 3 | appears in injury/removal chains | injury-like check | high | known | score |
| `ResultRoll|37` | 10 | 1 die, target 2 | appears in damage chains | injury variant | high | known | score |
| `ResultRoll|71` | 5 | 1 die, target 3-4 | follows reroll usage in secret-weapon contexts | argue call check | high | known | score |
| `ResultRoll|8` | 4 | 3 dice (dieType 1), target 0 | kickoff/ball-step randomization chain | kickoff scatter randomizer | high | known | exclude randomizer |
| `ResultRoll|9` | 5 | 3 dice, target 0 | chained with `ResultRoll|25` | kickoff event randomizer | high | known | exclude randomizer |
| `ResultRoll|25` | 38 | 1 die (dieType 1), target 0 | appears after injury/check events and in kickoff chains | single-die chain randomizer | high | known | exclude randomizer |
| `ResultRoll|26` | 16 | 2 dice (dieType 1 + 0), target 0 | stepType 10 kickoff/opening chains | paired kickoff randomizer | high | known | exclude randomizer |
| `ResultRoll|87` | 52 | 1 die, target 0, outcome 2 | repeated in chainsaw-like chains, often stepType 31 | chain randomizer | high | known | exclude randomizer |
| `ResultRoll|30` | 1 | 1 die, target 6, outcome 2 | one-off in catch/removal chain | special randomizer 30 | medium | ambiguous | exclude randomizer |
| `ResultRoll|1` | 99 | 1 die, target 2 | appears in block/damage chain but semantics conflict with prior label | deterministic check 1 | medium | ambiguous | exclude deterministic |
| `ResultRoll|5` | 4 | 1 die, target 3-5 | low-frequency special chain | deterministic check 5 | low | unknown | exclude deterministic |
| `ResultRoll|6` | 1 | 1 die, target 6 | one-off special-action chain | deterministic check 6 | low | unknown | exclude deterministic |
| `ResultRoll|7` | 14 | 1 die, target 2-6 | mixed step contexts with negative modifiers | deterministic check 7 | medium | ambiguous | exclude deterministic |
| `ResultRoll|31` | 1 | 1 die, target 3 | one-off in block chain | deterministic check 31 | low | unknown | exclude deterministic |
| `ResultRoll|33` | 5 | 1 die, target 2 | repeated but semantics unclear | deterministic check 33 | medium | ambiguous | exclude deterministic |
| `ResultRoll|41` | 1 | 1 die, target 5/6 with many modifiers | one-off near argue/chain events | deterministic check 41 | low | unknown | exclude deterministic |
| `ResultRoll|43` | 1 | 1 die, target 2 | one-off in modified armor chain | deterministic check 43 | low | unknown | exclude deterministic |
| `ResultRoll|45` | 4 | 1 die, target 2 | usually precedes `ResultRoll|10` | deterministic check 45 | medium | ambiguous | exclude deterministic |
| `ResultRoll|67` | 11 | 1 die, target 2 | often immediately before `ResultRoll|10` | deterministic setup check 67 | medium | ambiguous | exclude deterministic |
| `ResultRoll|73` | 7 | 1 die, target 6 with large modifiers | special-skill chain only | deterministic check 73 | medium | ambiguous | exclude deterministic |
| `ResultRoll|74` | 1 | 1 die, target 2 | one-off in special chain | deterministic check 74 | low | unknown | exclude deterministic |
| `ResultRoll|88` | 6 | 1 die, target 4 | bomb/special-action chain | deterministic check 88 | medium | ambiguous | exclude deterministic |

## High-Impact Problem Roll Types (count x uncertainty)
1. `ResultRoll|1` (99): high frequency, ambiguous semantics.
2. `ResultRoll|67` (11): repeated setup pattern before `rollType 10`, semantics unclear.
3. `ResultRoll|7` (14): repeated with mixed contexts and modifiers.
4. `ResultRoll|33` (5): stable deterministic shape, unclear gameplay meaning.
5. `ResultRoll|88` (6): repeated special-action chain check, unclear meaning.
