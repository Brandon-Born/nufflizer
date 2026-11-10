# Installed BB3 enum evidence

Date:2026-11-10. Owning work:NUF-008–016. Research evidence; no runtime mappings or scoring changed.

The installed BB3 executable contains explicit qualified enum names and numeric values in contiguous reflected tables. [The snapshot](../tests/fixtures/evidence/bb3-installed-enums.json) preserves **82 tables /1,428 entries** from the BoardData and NetGameplay namespaces, including byte offsets for each name and name/value pair. This supplies local compiled definitions that were not available in the earlier replay-only investigation. It does not supply full probability or action contracts.

Source identity: SHA-256 `590787b522ad4404b2e8a7570993375114a794fa4288d88a8595ab9dfbd7d6ae`,110,167,040 bytes,PE32+ x64. No executable bytes or machine-specific source filename are included in the snapshot. This hash identifies the installed image; it is not a claim that its application version equals the corpus's `ReplayVersion=1-4-0-0` serialization declaration.

## Extraction and verification

[extract-bb3-enums.py](../scripts/extract-bb3-enums.py) reads the image as a bounded file. It does not load/execute it, access process memory, hook the game, modify the installation or decrypt packages. It parses the PE image base and sections, finds exact ASCII qualified names, resolves 8-byte virtual-address pointers in `.rdata`, and reads the following signed8-byte value. Every matching name must pair exactly once; each enum array must be contiguous at stride16 with unique members and values. Values are read from pairs rather than assumed from declaration order. Skill IDs are notably nonsequential.

```sh
python scripts/extract-bb3-enums.py "<BB3 install>/BB3/Binaries/Win64/BB3-Win64-Shipping.exe" --verify tests/fixtures/evidence/bb3-installed-enums.json
python -m unittest discover -s tests/research -p 'test_*.py'
```

The installed-image verification passes at82/1,428. Six independent synthetic PE probes verify nonsequential values, offsets, malformed/truncated input rejection, unpaired names, ambiguous references, noncontiguous arrays and duplicate values. The verifier compares the entire hash-bound snapshot, including offsets; changing a stored value causes rejection. This verifies the extraction against this build, not every semantic use of a field.

## Useful definitions

| Namespace suffix | Evidence now available | Relevant examples |
| --- | --- | --- |
| NetGameplayRollType / BoardDataRollType |96 entries each, identical name/value pairs |0 NoRoll;9 ThrowIn;13 WakeUp;58 LastingInjury;79 ThrowInDistance;97 BreatheFire |
| BoardDataSkill |106 explicit IDs |1 StripBall;7 Dodge;29 Dumpoff;34 DivingTackle;40 Juggernaut;96 Brawler |
| NetGameplayStepType |39 entries |0 Activation;2 Damage;4 Catch;6 Block;29 Interception;34 Bite;35 EndPlayerTurn |
| NetGameplaySequenceType |20 entries |1 Move;2 Block;3 Blitz;9 DumpOff;19 Bite |
| NetGameplayModifierType |64 entries |3 OpponentTackleZone;11 AssistAttacker;27 Skill;31 NigglingInjury;38 InterceptInaccuratePass |
| NetGameplayInjuryOutcome |5 entries |0 Stunned;1 Reserve;2 Ko;3 BadlyHurt;4 Casualty |
| NetGameplayCasualty |11 entries |4 LastingInjury;5 SmashedKnee;6 HeadInjury;7 BrokenArm;8 NeckInjury;9 DislocatedShoulder |
| NetGameplayPassType |6 entries |0 Cancelled;1 Fumbled;2 WildlyInaccurate;3 Inaccurate;4 Accurate;5 Intercepted |
| NetGameplayRollStatus / RollOutcome |3 entries each |Unrolled/Rolled/Rerolled differs from Failed/Succeeded/Neutral |
| NetGameplayPeriod / GamePhase |3 /18 entries |Period2 ExtraTime;phase5 NormalTurn;phase7 TurnTransition;phase13 DumpOff |
| NetGameplayPlayerSituation / PlayerStatus |5 /8 entries |Situation4 Injured;Status4 Injured and5 Dead;no Situation3 member |

Additional tables cover damage sources, removal reasons, effects/durations/holders/providers, kickoff events, weather, team reroll sources, turnover reasons, turn types, staff and star rules. The snapshot retains complete qualified names so matching numbers in different namespaces remain distinct.

### Cross-check against playback

The39 roll-family rows in [REPLAY_UI_EVIDENCE.md](REPLAY_UI_EVIDENCE.md), plus its direct-event KO recovery13 and Pick me up92 observations, all have corresponding compiled roll names. Both reflected roll tables agree. Contextual UI wording differs for several entries: Rush is GFI, Interfere is Interception, Projectile Vomit is VomitAccuracy, Bomb damage is BombHit, and the observed Explosion is BombExplodeOnCatch. Preserve the visible label and compiled identifier separately. Neither identifier alone decides whether success helps or harms the named subject.

The block-face table independently agrees with all five UI-correlated symbols:0 AttackerDown,1 BothDown,2 Pushed,3 DefenderStumbles,4 DefenderDown. The separate block-outcome table distinguishes5 DefenderDown from6 DefenderPushedDown and2 BothWrestleDown. The recently observed Head Injury, Broken Arm and Smashed Knee match casualty values6,7 and5. Compiled casualty4 LastingInjury does **not** establish the missing secondaryD6 face1 result or a complete injury distribution.

### Preserve namespace differences

BoardData and NetGameplay overlap but are not interchangeable. In this exact image:

- StepType34 Bite exists in NetGameplay and is absent from BoardData.
- SequenceType19 Bite and PitchRemoval5 FriendlyFans exist only in the NetGameplay pair of those tables.
- PlayerStatus8 Invalid exists only in BoardData.
- Weather value10 is BoardData COUNT but NetGameplay DazzlingSun; NetGameplay also has11 LightDrizzle and12 BriskDownpour, with COUNT13.

Do not flatten these definitions into a global value-to-name dictionary. `BoardDataEffects` is not `NetGameplayModifierType`; their27 and31 entries have different meanings. Retain source namespace and field-to-enum linkage evidence.

## Remaining evidence requirements

These definitions resolve a large portion of numeric naming uncertainty for the installed build, including names absent from the27-file corpus. They do not close NUF-009 or prove that an unobserved family is implemented correctly. Required evidence still includes field/namespace linkage, older/newer build compatibility, natural-roll rules, full ordinary/Stunty/casualty tables, modifier timing, reroll eligibility/consumption/deduplication, subject/controller/beneficiary roles, state omission/default behavior, coordinates and activation boundaries. ThrowIn now has a compiled name, while the three embedded dice's roles remain a geometry inference. Source020/UI-084 now independently corroborates Period2 as displayed Extra Time and an actual home turn20; complete field/default and turn-boundary policies remain open. No full-match luck guarantee or contextual calibration follows from this snapshot.


## Additional installed JSON corroboration — 2026-11-10

[OFFLINE_RULE_DATA_EVIDENCE.md](OFFLINE_RULE_DATA_EVIDENCE.md) records a separate archive/hash and178 selected static table rows. All105 skill,11 casualty and five characteristic name/code pairs match their BoardData enum entries after punctuation/case normalization. This strengthens those specific namespace correspondences; it does not add enum tables, prove behavioral distributions or establish which overlapping offline package is active.


## Probability-description namespace lookup — 2026-11-10

The existing snapshot already contains `EBB3BoardDataProbaDescription` and `EBB3NetGameplayProbaDescription`. Both explicitly name2 Success and3 Fail. BoardData entry offsets are81,822,816/81,822,832 and NetGameplay offsets82,338,144/82,338,160 in the hashed image. Their names/values are separate from RollOutcome0 Failed/1 Succeeded/2 Neutral and PassType4 Accurate. This lookup adds no enum table or newly observed UI case.

UI-094's QuestionInterceptors probabilities retain Description2/3 and values16.66667/83.33333; the compiled names are now recorded in the fixture follow-up. The two values sum100 and match the1/6 versus5/6 fractions associated with its raw Difficulty6. This is name/arithmetic corroboration; field binding, rule completeness and replay-version compatibility remain qualified. The earlier statement that this namespace was unassigned should be read as a behavioral acceptance limit, not absence of compiled names.
