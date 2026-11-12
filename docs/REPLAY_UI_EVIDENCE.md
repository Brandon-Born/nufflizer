# BB3 UI observations paired with raw replay records

Observed 2026-11-09–10 using the [Computer Use skill](C:/Users/Brandon/.codex/plugins/cache/openai-bundled/computer-use/26.1103.60933/skills/computer-use/SKILL.md). Owning work: NUF-008–013, 016 and 022. Current mapping acceptance is recorded in [SEMANTIC_CONTRACT_AUDIT.md](SEMANTIC_CONTRACT_AUDIT.md); broader rule/choice/role/state policies retain their original issues.

## What the experiment produced

Completed a local Human versus Black Orc hotseat match, controlling both teams. The match finished 0–0 after both halves. Recorded 18 UI observations covering pickup, movement, Rush, dodge, pass, catch, hand-off, block choices, team rerolls, armor, injury, foul, Bone Head, Really Stupid and Loner. However, no new BBR appeared in Saved/Replays, and no downloadable hotseat match appeared in profile history. The replay directory still contained the same 27 original files. These hotseat observations cannot establish numeric replay mappings: there is no corresponding source file. The local plan and UI-only notes remain ignored under `replays/controlled/`.

Then loaded twenty-one existing local BBRs and one repository demo through **profile → History → Saved Replays**, stepped their actions, and manually transcribed visible labels, dice, modifiers and resources. This produced **99 annotated cases, 410 distinct numeric step records and 35 top-level event records**. The observations are independent of Nufflizier's disputed label maps, but were transcribed by the same agent and have not received a separate human review. Screenshots were inspected inline in the tool history; no screenshot files were exported.

The evidence artifacts contain no source filenames, account IDs, coach/team/player names or arbitrary decoded text:

- [Playback 025](../tests/fixtures/evidence/bb3-ui-playback-025.json): Elven Union versus Skaven, confirmed on loading; UI-094–097;25 numeric steps and six direct records. Pass/Catch rerolls, opposing interference, crowd removal, cleared possession and natural-one Catch failure despite Diving Catch(+1).

- [Playback 011](../tests/fixtures/evidence/bb3-ui-playback-011.json): Chaos Dwarf versus Norse, confirmed on loading; UI-090–093; twenty numeric steps. Breathe Fire Strength(-1) miss versus natural1 self-damage, ordinary success and natural6 Catch under large negative modifiers.

- [Playback 018](../tests/fixtures/evidence/bb3-ui-playback-018.json): Amazon versus Nurgle, confirmed on loading; UI-089; four numeric steps and four direct context records. Home-cast Fireball at the away11/home12 boundary, three hit checks and Spell(+1) injury modifier.

- [Playback 008](../tests/fixtures/evidence/bb3-ui-playback-008.json): Imperial Nobility versus Norse, confirmed on loading; UI-087/088; nine numeric step records and six direct context records (one turn end, three recruitment events and two BoardState snapshots). Failed Pro/Chainsaw, self-damage and defender-owned Block; recruitment identity reuse limits visible star identity.

- [Playback 001](../tests/fixtures/evidence/bb3-ui-playback-001.json): Dwarf versus Underworld Denizens; source SHA-256 `6e201a8485bec553f4a019bc02b4d381976202825817412bead003f178cbb867`; observations UI-001–016, UI-064 and UI-068; 57 raw records.
- [Playback 002](../tests/fixtures/evidence/bb3-ui-playback-002.json): Underworld Denizens versus Chaos Renegades; source SHA-256 `825efebbf7ed9ef2ff13ba0c71f5c68bbde86b29618d934d9118d11c1079e312`; observations UI-017–025 and UI-060–063; 44 raw records.
- [Playback 003](../tests/fixtures/evidence/bb3-ui-playback-003.json): Lizardmen versus Underworld Denizens; source SHA-256 `9accc6dc8b8b243d61e2c8e403992bc5ad95d941c64bfe386f63114cadc0464a`; observations UI-026–031; 19 raw records.
- [Playback 004](../tests/fixtures/evidence/bb3-ui-playback-004.json): Dwarf versus Underworld Denizens; source SHA-256 `a98deed825209103e148912939356ab81a7509b733c81af2a0faf1e381f993ab`; observations UI-032–035; 21 raw step records.
- [Playback 007](../tests/fixtures/evidence/bb3-ui-playback-007.json): Black Orc versus Norse; source SHA-256 `07e755b81ad21e4c68f25bc4adf4c57e7b9bce1af463d99336cc7a442515e832`; observations UI-036–041 and UI-071/072; 26 raw step records and 2 top-level event records.
- [Playback 013](../tests/fixtures/evidence/bb3-ui-playback-013.json): Nurgle versus Dark Elf; source SHA-256 `9afbdd2773e14ac1f92d45a5e56caf0fa183684c51a435418f0b9525c214454e`; observations UI-042–045; 20 raw step records.

- [Playback 016](../tests/fixtures/evidence/bb3-ui-playback-016.json): Nurgle versus Chaos Dwarf; source SHA-256 `55ff6509f5f1b6a59c360c82ebf2ec82cb6200c96fdebb29afd93708578ea15c`; UI-046–050 and UI-098/099;31 raw step records and nine direct context records. Natural-six Long pass accuracy, opposing interference, loose-ball/turn transition, and two activation-losing Foul Appearance failures.
- [Playback 027](../tests/fixtures/evidence/bb3-ui-playback-027.json): Goblin versus Underworld Denizens, confirmed on the loading screen during the later interference review; source SHA-256 `04445f58b61f529c09d957a6553d5972c778e9b9b38ba4a710a41ce563fdabb6`; UI-051–054 and UI-070; 21 raw records.
- [Playback 024](../tests/fixtures/evidence/bb3-ui-playback-024.json): Skaven versus Wood Elf; source SHA-256 `6e05cb9225442b6e7e73bca4fc6c2072b433d01bc8404e265e49fe2c941de72b`; UI-055/056; 7 raw records.

- [Playback 005](../tests/fixtures/evidence/bb3-ui-playback-005.json): Elven Union versus Norse; source SHA-256 `c7227e4bc477e3d0403e5a97833beca595877c03d428d13ef699b2a04db28695`; UI-057–059 and UI-079; 12 step records and 4 direct event records (two rolls and two skill usages).

- [Playback 021](../tests/fixtures/evidence/bb3-ui-playback-021.json): Skaven versus Chaos Chosen; source SHA-256 `2423ebf9e2ba037d4ae80e8c5c9fd5a7c0725cb99a88480ed6a162bb204e3284`; UI-065–067; 22 step records.

- [Playback 015](../tests/fixtures/evidence/bb3-ui-playback-015.json): Nurgle versus Orc; source SHA-256 `b257b7f53378d143ea5ae33666ea8a9e01dca5fdb3dc246c4d982733b3b87ef9`; UI-069/078; 10 step records.

- [Playback 012](../tests/fixtures/evidence/bb3-ui-playback-012.json): Norse versus Imperial Nobility; source SHA-256 `f7d9263892e0a6d1a40e3df9823ef0e8cb4e5a1d13071cde51568467eddda9db`; UI-073/074; 8 step records.

- [Playback 014](../tests/fixtures/evidence/bb3-ui-playback-014.json): Khorne versus Nurgle; source SHA-256 `23f4a74f613d48c60718a0dc4c897064835121e0ea90627ef9dfeb4c1fe4d300`; UI-075–077; 18 step records.

- [Playback 006](../tests/fixtures/evidence/bb3-ui-playback-006.json): Khorne versus Norse; source SHA-256 `9fad07e11984929d3e07a3a2ccca1fb1ac4e9300aac0733e28c3694da2cf8515`; UI-080; 6 step records.
- [Playback 026](../tests/fixtures/evidence/bb3-ui-playback-026.json): Shambling Undead versus Underworld Denizens; source SHA-256 `28c03430e9dcae3cd29651e1bc50731c75a9ff036cd8fe18346680a5969bf84f`; UI-081; 7 step records.

- [Playback 020](../tests/fixtures/evidence/bb3-ui-playback-020.json): faction labels not transcribed from loading; UI-082–085; 17 step records and 4 direct records, including a complete numeric BoardState. Oversized source inspected with an explicit offline32MiB cap.

- [Repository demo009](../tests/fixtures/evidence/bb3-ui-demo-009.json): factions not independently captured; UI-086; 6 step records, confirming casualty[13,1] Head Injury and successful Regeneration.

All twenty-two source files declare `ReplayVersion=1-4-0-0`. Sequence numbers below are one-based `EventExecuteSequence` indices; step/message indices are zero-based. UI team turns are cumulative: normal halves display1–16; source020 Extra Time displays17–24. A second-half turn labeled 13 is the fifth turn of that half. UI Action numbers are display counters with unresolved activation semantics: a counter can advance during a continuing trait chain or post-block movement. Record the displayed value without treating it as an activation ID or raw sequence number.

## Observed roll meanings

These are direct UI/raw correspondences in the annotated contexts, not a completed global rule contract or permission to score every occurrence of a number.

| Raw RollType | Observed game label | Source location / observation |
| --- | --- | --- |
| 1 | Rush | 001: 125/6, die 6 success; 127/5, die 1 failure; UI-008/009 |
| 2 | Dodge | 001: 28/1–2, dice 5 and 3 with Titchy +1; 125/2, die 6; 127/2, die 4; UI-006/008/009 |
| 3 | Block dice | `QuestionBlockDice` pools, with separate selected-face/result records; UI-003–005, 010–013, 017–020 |
| 4 | Pick up | 001: 4/3 messages 2 and 4, die 1 then Sure Hands then die 1; UI-002 |
| 5 | Quick pass check | 001: 324/1 question die 1, then 325/0 replacement die 3; UI-016 |
| 6 | Interfere / passing interference | 003: 162/0, away player 41 die 4, base 3+ with −3 accurate-pass and +1 Stunty modifiers, fails; 015:260/0 home6 die4−1 against3+ succeeds, followed by separate Catch; UI-028/069 |
| 7 | Catch | 001: 319/4 question die 1; 320/0 replacement die 5; 325/2 scatter catch die 3 with −1; UI-014/016 |
| 8 | Scatter | 001: 325/0 message 2, D8 values 1,5,4 to cell [20,4]; UI-016 |
| 10 | Armour Value (AV) check | 001: 127/6, [3,5] against 8+; 322/4, [5,3] with +3; 002: 82/1, [1,5] against 9+; UI-009/015/020 |
| 11 | Injury / Stunty Injury | 001: 127/6 question [5,4] is Stunty Injury → Badly Hurt; 322/4 [1,4] is Injury → Stunned; UI-009/015 |
| 12 | Casualty | 004: 349/1 and 529/2; D16=13 plus D6=5 → Neck Injury, D16=16 → Dead; UI-033/035; second die role unresolved |
| EventRoll/13 | KO recovery dice roll | 007: ReplayStep 287, child indices 3/4; away 37 die 3 fails and away 40 die 5 succeeds against 4+; UI-040 |
| 16 | Tentacles | 013: 199/0, home Rotspawn1 die5 +2 Strength against base6+ succeeds during away turn8, stopping player47; UI-043 |
| 21 | Bribe | 013: 418/0 die2 succeeds, home team avoids fouler7 removal; raw requirement2, UI log does not print threshold; UI-045 |
| 25 | Bounce | 001: 4/4 D8=3; 325/1 D8=2, then 325/3 D8=8; UI-002/016 |
| 26 | Deviate (kick and thrown player) | 003: 1/0, [5,3] to [24,5]; 004: 529/0 [7,1] to [13,6]; 007: 421/1 [5,6] to [19,7]; UI-031/034/041 |
| 30 | Argue the Call | 007: 206/0, die 5 against 6+ → Neutral, followed by sent off; UI-039 |
| 31 | Dauntless | 004: 322/1 question die 1 against 3+ → Failure, original retained; UI-032 |
| 32 | Jump up check before Block | 013: 172/1 die3 +1 against base2+ succeeds; skill41; UI-042 |
| 33 | Bone Head | 002: 76/0, Renegade Ogre die 2 succeeds; 003: 80–81/0, Kroxigor die 1 fails against 2+, kept original; UI-019/026 |
| 34 | Really Stupid | 001: 3/0 die 3 with +2 succeeds; 29/0 question die 1 and 30/0 replacement die 1 fail; UI-001/007 |
| 35 | Unchannelled Fury | 007: 16/0 die 5 with +2 Block/Blitz succeeds; 81/0 ordinary activation die 2 against 4+ fails; UI-036/038 |
| 36 | Animal Savagery | 002: 80/0 die 3 with +2 succeeds; 34/0 question die 1 with +2 fails; UI-020/021 |
| 37 | Foul Appearance | 002: 66/0 die 2, 70/0 die 5 against 2+; defender owns skill, attacker rolls; UI-017/018 |
| 41 | Throw Team-Mate | 004: 528/1 original 4 and 529/0 replacement 3, both −3 fail; 007: 421/1 die 2−1 fails; UI-034/041 |
| 42 | Land | 007: 421/2 thrown player 10, die 1−2 Terrible throw against base 3+ fails; UI-041 |
| 43 | Always Hungry | 004: 528/1 die 5, 007: 421/1 die 2, both against 2+ succeed; UI-034/041 |
| 45 | Projectile Vomit | 007: 54/1 die 4 against 2+ succeeds, damages player 46; UI-037 |
| 48 | Fireball hit! | 013: 344/0–4, ordered D6 values6,1,5,4,4 against4+; four hits and one miss; UI-044; 018:282/0–3,6/1/2 checks then KO with Spell(+1), UI-089 |
| 73 | Shadowing | 003: 93/0 and 95/0, home player 11 during away turn 4, dice 3 and 1, base 6+ with movement capacity −2, both fail; UI-027 |
| 71 | Loner | 001: 30/0 die 6 against 4+ succeeds; 002: 81/0 die 1 against 4+ fails; UI-007/020 |
| 15 | Pro | 016: 41/0 die3 against3+ succeeds, allowing fresh Block dice; UI-047 |
| 29 | Jump over | 024: 63/1 and64/0 die2−1 against2+ fail, including a fresh same-face team reroll; UI-055 |
| 46 | Regeneration | 027: 151/1 die2 against4+ fails after Badly Hurt casualty; 001:259/1 die6 against4+ succeeds after Badly Hurt, skill19; UI-054/068 |
| 67 | Chainsaw | 027: 109/7 die6 against2+ succeeds during Foul; UI-053 |
| 74 | Animosity | 027: 53/0 die3 against2+ succeeds before hand-off; UI-052 |
| 87 | Ball & Chain direction | 027: 4/0 die6 is Neutral, without a success threshold; UI-051 |
| 88 | Bomb damage | 016: 462/2 die5 succeeds and462/3 die1 fails against4+; UI-050 |
| 89 | Explosion | 016: 351/1 die4 against4+ succeeds after a bomb catch, harming the catcher; UI-049 |
| EventRoll/92 | Pick me up | 005: ReplayStep261 child3 die6 succeeds and530 child5 die4 fails against5+; UI-057/058 |
| 97 | Breathe fire | 016: 9/1 die1 fails and46/2 die5 succeeds against4+; UI-046/048 |

Named skill correspondences supported by these same UI chains: `51` Really Stupid, `61` Sure Hands, `83` Titchy, `44` Loner, `10` Foul Appearance, `31` Bone Head and `84` Animal Savagery; follow-up UI-023/024/027/028 adds `49` Prehensile Tail, `16` Two Heads, `55` Shadowing and `7` Dodge. UI-028 also visibly displays Stunty +1 matching raw skill `59` in that context. This does not establish that every skill ID has the same meaning in every other namespace or replay version.

Block dice have `DieType=2` and the observed encoded values are `0` Attacker Down, `1` Both Down, `2` Push, `3` Defender Stumbles, `4` Defender Down. UI-018 shows the last two distinct faces together as raw [4,3], while both applied `DiceOutcomes` equal 6 against that target. Face values and skill-adjusted outcome codes are different namespaces. Five encoded symbols do not establish five equally likely faces; distributions and chooser/skill policies still need their own rule contracts.

## Movement, action and attribution evidence

In the annotated contexts, `PlayerStep/1` contains plain movement, dodge, Rush and pickup. Plain moves at 4/1–2 and 28/3 have no direct roll; 4/3 contains movement plus two pickup attempts. Classifying all movement containers as dodge or using the container as a roll count is incorrect.

The observed step correspondences are `PlayerStep/0` activation/action declaration, `/4` catch, `/5` hand-off, `/6` block, `/7` stand up, `/8` foul and `/11` pass. `DamageStep/2` is a different namespace. `ResultUseAction` codes 2, 4, 5 and 6 accompany Block, Pass, Hand-off and Foul respectively. Code 1 accompanies ordinary movement activations in these cases. Keep these mappings scoped to their tags and observed contexts.

UI-014 explicitly separates the hand-off initiator (player 9) from the catch roller/recipient (player 2). The hand-off transfer step contains `ResultNoRollSuccess`; the recipient's catch supplies the random check. UI-015 separates the foul initiator (6) from damage subject (44). UI-009's failed Rush damages player 38 himself; both DamageStep PlayerId and TargetId name that subject. UI-017/018 separate the Foul Appearance skill owner (defender 5) from the roller (attackers 44/45). None of these fields can universally be treated as a luck beneficiary.

## Reroll and outcome counterexamples

1. **Successful Loner gate:** UI-007 shows Really Stupid 1 → team resource 4→3 → Loner 6 succeeds → replacement Really Stupid 1 fails. Equal faces do not make the two checks duplicate emissions. The replacement has Status 2 and NewRoll 1.
2. **Failed Loner gate:** UI-020 shows double skull → team resource 3→2 → Loner 1 fails → original skull is applied → own armor [1,5] fails to break. The post-gate block question and selected result have RollStatus 2 although no fresh block pool was rolled. The repeated question lacks `RolledDiceIndexes`. Status 2 alone does not prove replacement dice; resource expenditure does not prove a reroll occurred. Preserve original pools, gating checks, rolled-index evidence and selected results separately.
3. **Skill reroll:** UI-002 shows pickup 1 → Sure Hands → pickup 1 in one movement step. UI-014 shows catch 1 → team reroll → catch 5 across raw sequences. Link by action, actor/subject and check evidence, not sequence adjacency alone.
4. **Different failed pass outcomes:** UI-016 shows natural 1 as Fumbled, rerolled 3 as Inaccurate on a 4+ quick pass. Both type-5 records contain Outcome 0. A binary success/failure code cannot recover the pass consequence by itself.
5. **Base versus effective requirement:** Really Stupid is labeled 4+ with Close Team-mate +2 and raw Difficulty 2; Titchy dodge is labeled 3+ with +1 and Difficulty 2. The scatter catch is labeled 4+ with −1 and Difficulty 5. Avoid applying a modifier twice. These examples do not establish all natural-roll exceptions.
6. **Injury table context matters:** the same RollType 11 produces Stunned on ordinary [1,4], but Badly Hurt on Stunty [5,4]. The presence of an apothecary question does not turn its embedded injury dice into a separate casualty randomizer. UI-064 later revisits UI-009's aftermath: apothecary use produces No Injury without a new casualty roll or choice question.
7. **Declined reroll repeats a check:** UI-021 shows Animal Savagery 1 failing, then a friendly victim selection. Its question is followed by Used 0 and the same failed type-36 die with NewRoll 0. UI-022 corroborates Dodge 6, Rush 6 and failed pickup 2 in the second source; the pickup question is repeated as Status 1/NewRoll 0 after Used 0 and then bounces on D8=2 to [9,9]. Both resources remain 3. These question/result pairs represent one attempt each. A repeated face can therefore be either an actual replacement (UI-007) or the kept original (UI-021/022); action/gate/emission evidence is essential.

For arithmetic reference only, a fair D6 check requiring 3+ succeeds with 4/6; one available unconditional full reroll gives 8/9 total success. A 2+ check gated by a 4+ Loner reroll gives 5/6 + (1/6 × 1/2 × 5/6) = 65/72, conditional on choosing the resource and on those being the applicable rules. The observed individual rolls establish neither player choice policy nor unconditional availability.

## Additional modifier and transition evidence

UI-023 shows Prehensile Tail −1 and Titchy +1 cancelling on a 3+ dodge. UI-024 shows Two Heads +1 and Titchy +1, with a base 3+ label but effective 2+ overlay/raw difficulty. These establish the observed effective requirements, not every natural-die exception. UI-025 reads friendly Animal Savagery victim Stunty Injury [6,1] → KO; its earlier armor dice remain raw context only.

UI-026 adds Bone Head die 1 failure followed by Used 0/NewRoll 0 and the kept die, while UI-030 adds Foul Appearance die 1 failure on a Blitz (`ResultUseAction/3`). UI-027 and UI-028 show home Shadowing during an away turn and away passing interference during a home turn: active team and roller team can differ.

UI-029 pairs type 9 with the ball returning to the pitch after an out-of-bounds bounce. The game log did not display its three raw dice or their roles; retain this as transition evidence, not a fully identified direction/distance contract. Seeking can retain stale log lines from unrelated actions; only source-matched actor/dice chains are annotated.

## Further trait, damage and referee evidence

UI-032–035 add Dauntless failure, Guard, failed Dodge with opposing Tackle, a casualty injury, Always Hungry, Throw Team-Mate with Loner-gated replacement, and multiple thrown-player collisions. Thick Skull turns ordinary injury [4,4] into Stunned in UI-035; the thrown Snotling has Stunty Injury [2,4] → Stunned. Damage subjects include both teams and the thrown player himself. Skill correspondences in these contexts: `26` Dauntless, `38` Guard, `57` Tackle, `18` Always Hungry, `64` Throw Team-Mate and `63` Thick Skull.

UI-036–041 add skill `67` Unchannelled Fury and `95` Projectile Vomit, failed landing, Argue the Call and KO recovery. A Block action resolves through `AccuracyStep/17` Projectile Vomit and armor/injury without block dice in UI-037. UI-039 shows type 30 Outcome 2 as Neutral, and NewRoll 0 despite the displayed argue-call die. UI-040 recovery events sit outside encoded steps; failed recovery omits Outcome while success includes 1. Preserve these distinctions without generalizing defaults.

Type 25 appears in thrown-player bounce steps as well as ball bounce steps. The former bounce faces were not displayed; only collision/victim outcomes are annotated. Type 26 also serves both kicks and thrown players. Object role must come from the containing step and context.

The expanded offline inventory separately counts top-level dice events: 184 `EventRoll/13`, 67 `EventRoll/92` (Pick me up in UI-057/058), 116 kick-off table events, 43 weather events and 27 fan-factor events. These are emissions, not unique independent attempts or semantic acceptance. The historical 35,121 step count and 41 step-message/type pairs remain unchanged.

UI-042–045 add Jump up (skill `41`), attacker Block (skill `30`) on a selected Both Down, opposing Tentacles (skill `69`), five Fireball hit checks and a successful Bribe. Fireball subjects are victims, so their successful type-48 hits harm their own side; PlayerStep StepType19 differs from DamageStep Source3; these are separate numeric namespaces. Earlier prose incorrectly called19 the damage source. The spell adds +1 armor where visible in the threshold-changing log. A foul with non-double armor [3,2] but double injury [1,1] reaches the referee; Bribe type21 die2 succeeds with NewRoll0 and play continues. These are individual policies, not complete skill/referee rule tables.

UI-046–055 add nine named numeric families. Breathe fire failure knocks down and tests armor on its user, while success knocks down its victim. Pro succeeds before a fresh Block pool. Animosity gates the giver before a separate recipient Catch. Ball & Chain direction is explicitly Neutral, not a binary success check. Chainsaw succeeds during a Foul, adds +3 armor modification, and is followed by a successful Argue the Call die6; Regeneration die2 fails after a D16=2 Badly Hurt casualty. The latter casualty has no second D6, unlike some earlier cases.

Bomb passing uses the same type5 as ball passing, and the log reuses ball/catch wording for bombs. Type5 Outcome0 also covers Wildly Inaccurate. In UI-049 the caught bomb's type89 Explosion succeeds and harms its catcher. In UI-050 type88 Bomb damage succeeds against a friendly player and fails against the thrower; neither affected subject is automatically the beneficiary. Failed Loner consumes a team reroll but retains the original Wildly Inaccurate pass. Accurate skill21 and Disturbing Presence skill33 modifiers are visible in these chains.

UI-055 distinguishes Jump over (type29, PlayerStep12, Leap skill11) from Jump up (type32). A Leap-modified failed Jump over is genuinely rerolled to the same face and fails again. `ResultMoveOutcome/Moved=1` appears alongside the failed jump and resulting damage; it cannot establish a successful useful move by itself.

UI-056 adds successful Jump over die3 and continued movement/Rush, contrasting UI-055. UI-057/058 identify direct EventRoll92 as Pick me up: die6 succeeds and die4 fails against5+. The successful subject stands before his turn, while the failed subject subsequently uses a Stand up activation. Both companion EventSkillUsage records have skill9 and Used1; usage does not imply success. Failure omits Outcome. These top-level events would be missed by an encoded-StepResult-only reader.

The only numeric roll family without a full dice-role identification in this expanded corpus is `9` (ball-return transition observed, dice roles unread). All rule-level acceptance gaps below remain open even when a numeric name is identified.

## Decision chains mined from existing files

UI-059 (005:58–62) shows a weaker home attacker offering the existing [Push, Defender Stumbles] pool to the away defender, who chooses Push. The repeated question changes GamerId and choice permissions without fresh dice or a team reroll. The selected result still has NewRoll1. Neither repeated pools nor that selected-result flag alone establishes a new random attempt.

UI-060 (002:111–116) follows a block through armor [6,2], injury [6,4], casualty D16=8 Seriously Hurt, and an accepted apothecary intervention with replacement D16=1 No Injury. The original casualty has Outcome2 in the usage question but Outcome0 inside the later choice question. Preserve the original record and choice context; the transformed question is not a substitute for the original casualty. No Injury here is an apothecary-context observation, not a global ordinary-casualty mapping for D16=1.

UI-061 (002:117–120) shows Bone Head die3 success, a three-die [Defender Stumbles, Defender Stumbles, Both Down] pool, and Dodge converting selected Defender Stumbles to Push. The last icon was initially transcribed incorrectly and corrected against the screenshot and raw pool before this checkpoint. UI-062 (002:107–110) adds Sidestep skill56: an away attacker chooses Push, then the home defender controls the push destination. Raw GamerId fields and offered cells corroborate that handoff; the full destination menu was not separately transcribed. UI-063 (002:100) shows Animal Savagery die5 against4+ during an ordinary stand-up activation, without the Block/Blitz bonus.

A further raw-only scan of all 27 originals found 37 apothecary usage questions, 16 casualty-choice questions and 16 type9 return-to-pitch emissions. These are emission counts, not independent accepted policies. Candidates include retaining an original casualty when the replacement is worse. Type9 geometry suggests a direction die plus two distance dice, but edge crossing and chained returns need independent confirmation; this remains an inference and is not a promoted mapping.

UI-064 (001:127/5–6,128/0) contrasts the casualty reroll with intervention after a failed Rush and Stunty Injury [5,4] Badly Hurt. The UI explicitly reports apothecary use and No Injury, and the resource disappears. The raw question embeds the original type11 injury dice; ResultApothecary has Used1 and IsInjury1 but no replacement dice or casualty-choice question. This is not evidence of an additional random attempt.

UI-065 (021:199–203) shows a Chaos Ogre's failed Loner retaining Both Down, followed by separate damage to both players. Its casualty D16=13 plus D6=6 is Dislocated Shoulder (Outcome9); the apothecary replacement D16=15 is Dead (Outcome10). The final log and ResultApothecary Casualty9 retain Dislocated Shoulder. UI-066 (021:150–155) demonstrates accepting the replacement instead: home player2's D16=16 Dead becomes D16=10 Serious Injury (Outcome3). Preserve both rolls and the applied choice. The second D6's complete table role still needs confirmation. Horns skill15 is visibly used on the UI-066 Blitz. ResultUseAction TeamId0 occurs on these away actions, so it cannot universally identify the acting side.

UI-067 (021:234–235) adds a Wildly Inaccurate short pass (die2−2), failed home interference during an away turn (die3−5 against base3+), return to pitch and D8=1 bounce. The interceptor's offered evaluation includes type37/−3, while the actual check and UI use type39/−1 for the wildly-inaccurate pass. Preserve evaluation and applied modifiers separately. Actual Difficulty6 also differs from simply adding the printed modifiers to the base threshold; no complete natural-roll policy is established by this failed3. The log again omits type9's three raw dice, so this extra playback corroborates the transition but does not resolve their roles.

UI-068 (001:256–259) adds successful Regeneration: home Dwarf blocker6 knocks down away Troll37; armor[6,6] breaks, injury[4,6] yields Casualty, D16=3 is Badly Hurt, then Regeneration4+ die6 succeeds. Raw skill19 accompanies type46. Original removal Situation4/Status4 precedes the skill and successful regeneration in the same damage step. Treating that earlier emission as irreversible final availability would be unsafe; complete reserve/re-entry behavior was not observed.

UI-069 (015:258–260) adds a successful interference-to-possession chain. Away Orc49 passes during turn8/action6: Animosity2+ die5 succeeds, Quick pass3+ die1−4 fumbles, Pass skill47 rerolls it into4−4 Wildly Inaccurate. Four skill33/type27 modifiers match the UI Disturbing Presence(−4). After deviation[4,3] to[8,9], home6 succeeds at Interfere3+ with4−1, then separately succeeds at Catch3+ with5−1; the log then reports possession and the away turn ending for a failed action. Both random checks must be preserved. Interference success alone is not evidence that the following catch succeeded. The offered evaluation again differs from the applied check: type37/−3/Difficulty6 versus actual type39/−1/Difficulty4.

A nested-message scan of all27 originals found ten type6 dice-bearing emissions: eight Outcome0 and two Outcome1 (sources015 and027), plus fourteen evaluation nodes without dice. In the same scan type21 has only one successful Bribe, type30 has two successful and four Neutral Argue emissions, and type46 has seven successful and six failed Regeneration emissions. No failed Bribe or die1 Argue emission was found in these encoded messages. These counts are raw emissions, not deduplicated attempts or proof that every unrecognized representation is absent. UI-070 corroborates the second successful interference source and its subsequent failed catch; missing referee outcomes still need corroboration.

UI-070 (027:455–457) supplies the contrasting chain: away turn16/action4 Quick pass4+ die2 is Inaccurate, a team reroll gives3 Inaccurate, and scatter[4,4,8] reaches[16,13]. Home10 Interfere3+ die4 succeeds with inaccurate-pass−2 and Stunty+1, but his separate Catch3+ die2−1 fails. The ball then scatters[8,3,2] to[20,13] and bounces5 to[21,13]. No possession can be inferred from the first success. Raw SPP gain1 versus UI-069 gain2 is preserved without independently naming its policy. The enclosing BoardState counters change from[16,16] to[17,16] during this final away-turn chain; they must not be read as proof of an actual seventeenth home turn. UI-069/070 also pair PlayerStep/29 with passing interference in two contexts, distinct from the separate PlayerStep/4 Catch. Full phase/counter semantics remain unresolved.

UI-071/072 (007:59–65) identify Brawler skill96 and Grab skill37. In home turn2/action3, Brawler replaces one Both Down in[Both Down,Both Down] with Defender Down; the other Both Down stays. Initial eligible indices[0,1] become replacement RolledDiceIndexes[0], matching[1,1]→[4,1]. Grab follows selection, then a knockdown and failed AV[1,6] against9+. In action4 a second attacker changes[Both Down,Push]→[Defender Stumbles,Push], again replacing only index0. RollStatus2 applies to a mixed pool of fresh and retained dice, so count replacements by rolled-index evidence, not pool length or status alone. Both questions have CanUseTeamReroll0; no team-reroll usage is emitted in these chains. Full Brawler eligibility/reuse restrictions and complete Grab destination policies remain unproven.

UI-073/074 (012:62–64 and142–144) identify Wrestle skill68 on the same player42, first as attacker during away turn2/action6, then as defender during home turn5/action9. Both chains select Both Down from different pools, explicitly prompt Wrestle, report Players are wrestling, place both players prone and continue the active team's turn. No armor/damage step appears before the next activation. The selected face remains1 while Outcome changes1 to2 after the skill choice, with NewRoll0; this is a resolution change without another random attempt. In the defensive case the decision question belongs to GamerId1/player42 while player11 attacks. Full eligibility, Block interactions and beneficiary policies remain open.

## Remaining candidates in the existing corpus

UI-075/076 corroborate Decay skill81/type27/+1 on casualty subjects38/39 in source014. The game reads D16=14+1 as Dead (Outcome10), and D16=6+1 as Seriously Hurt (Outcome2). Neither has an additional D6. UI-076 also resolves selected Both Down through attacker Block skill30 to defender-only damage, contrasting Wrestle. UI-077 follows player4's Push, follow-up and Frenzy skill36 into a second block against41, with new positions and recalculated assists. The second block is another attack, not a replacement of the first pool; no team-reroll usage is emitted in that chain.

UI-078 (015:185–186) names the distinct modifier type31/+1 as niggling Injury, with PlayerId-1/Skill-1. It produces the same 6+1 Seriously Hurt result as Decay but has a different source. Selected Both Down causes separate armor checks on attacker5 and defender45, then a home turnover. The enclosing counters already read[5,5] while this final home action is resolving; the game log places away turn5 after damage. Counters alone cannot identify the damage's acting turn.

A raw-only skill/casualty scan located 64 direct ResultCasualtyRoll emissions, excluding embedded questions. Source017:434/1 (D16=6, skill81/+1, Outcome2) remains available for cross-source corroboration of Decay. Further candidates contain D16=13/14 with an additional D6, suitable for confirming the secondary table's role.

Prioritize these modifier cases, remaining block-skill decisions and state transitions in the existing files before generating another match. The nested-message referee scan above found no failed Bribe or die1 Argue; those specific gaps may require a new capture. All sources share one declared replay version, so this corpus cannot alone provide a version-held-out check.

## Secondary casualty evidence

UI-079 (005:94–97), first-half home turn3/action2, follows Catcher3 blocking Norse Raider Lineman47. The original pool is Defender Down/Both Down; selected Defender Down leads to armor8+ [6,4] Success, injury[5,6] Casualty, then **D16=14 plus D6=2 → Head Injury**, and Injured. The raw ResultCasualtyRoll has Outcome6 with no casualty modifier. This independently names one more result; it does not establish a complete secondary-die table.

A nested-message scan of all27 originals found16 two-die type12 emissions: secondary faces2/3/4/5/6 appear2/3/1/4/6 times. Embedded apothecary questions can repeat or transform a roll, so these are emission counts, not independent attempts. No secondary face1 was found in the decoded message representation searched. The later39-file audit found face1 in a repository demo; UI-086 independently confirms that case. Do not fill unobserved labels by analogy.

| Observed casualty dice | UI result | Raw outcome in this context | Evidence |
| --- | --- | --- | --- |
| 13 +1 | Head Injury | 6 | UI-086, demo009:376/1 |
| 14 +2 | Head Injury | 6 | UI-079,005:97/1 |
| 14 +3 | Smashed Knee | 5 | UI-081,026:387/1 |
| 14 +4 | Broken Arm | 7 | UI-080,006:123/1 |
| 13 +5 | Neck Injury | 8 | UI-033,004:349/1 |
| 13 +6 | Dislocated Shoulder | 9 | UI-065,021:201/1 |

UI-080 follows Khorngor5 blocking Norse Raider Lineman44 on home turn6/action2: Both Down/Defender Stumbles pool, defender knocked down, armor8+ [6,6], injury[5,6] Casualty,14+4 Broken Arm and Injured. UI-081 follows Ghoul Runner10 blocking Skaven Thrower46 on home turn12/action11: single Defender Down, armor8+ [3,6], injury[5,5] Casualty,14+3 Smashed Knee and Injured, followed by Bounce8 to[22,2]. Both sources' loading factions were independently read. Neither casualty has a modifier. These are scoped result pairs; complete ordinary/modified/apothecary casualty distributions and state consequences remain open.

## Prayers, skill-context limits and Extra Time

UI-082 independently displays Prayers to Nuffle D16=13, Fouling Frenzy and Drive duration. EventPrayerTable at ReplayStep5/child6 encodes Prayer9, followed by EventAddEffect at child7 with EffectId9, ProviderType3/ProviderId9, DurationsItem1 and HolderType1. There is no RollType field or explicit team ID: do not invent a type84 roll or infer ownership from omission.

UI-083 (020:345–347) confirms away turn11/action9 Pestigor38 versus Runner8, Horns, two Both Down faces, attacker Block, Defender Down, armor8+ [1,5] Failure, Prone and Bounce2 to[22,14]. Preceding raw messages show defender8 Skill29 Used1 with QuestionDumpOff, then Used0 before movement/block. Compiled definitions name29 Dumpoff, but this playback pass did not clearly expose that decision label. Those messages remain context only, without independently confirmed acceptance/decline semantics or another pass/dice event.

UI-084 independently displays EXTRA TIME and17–24 buttons, then away end of turn19 / Failed action followed by home Turn nb20, score2–1. Complete numeric BoardState813 has Period2, team counters20/19 and CurrentPhase5; EventEndTurn812 Reason2 matches the visible boundary. This proves an actual home twentieth turn in this source. It does not establish a universal counter/default policy or actual play of every displayed turn button.

Source020 exceeds the product/default15MiB decoded limit. Verification requires an explicit bounded research option; application limits are unchanged:

```sh
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-020.json --max-decoded-mib 32
```

The verifier still defaults to15MiB and permits only integer offline caps15–32MiB. Three independent research probes check default rejection versus explicit acceptance, invalid override rejection and exact BoardState mutation rejection. Together with six enum-extractor probes, nine research tests pass. At the UI-084 checkpoint, all seventeen source verifiers passed at84/327/10; this proves extracts, not the accuracy of manual labels or complete scoring support.

### Used Dump Off during the opponent's turn

UI-085 (020:604–610) independently displays USE DUMP-OFF? during away turn20/action6, then home8 using the skill, making an Accurate Quick pass3+ on die5−2, and home6 succeeding at Catch2+ on die6−3. The log confirms home6 has the ball. The pass modifiers are opposing tackle zone−1 and Disturbing Presence−1; catch modifiers are opposing tackle zones−2 and Disturbing Presence−1. Away46 then stands, blocks home8 with Defender Down/Both Down, knocks him down and fails AV8+ [2,1], leaving him prone. The display counter advances6→7 during this reaction.

QuestionSkillUsage604/0 assigns Skill29 to home8/GamerId0 although away46 initiates the Blitz;605/0 records Used1 and QuestionDumpOff. In606 the step actor becomes home8 for Pass and home6 for Catch, then returns to away46 in607. This separates turn owner, initiator, reaction skill owner, passer, receiver and subsequent damage subject. It independently corroborates a genuinely used Dump Off, without relabeling the unobserved decision in UI-083. All ten step records are preserved; the unannotated damage-stage skill question remains context only.

[GAME_SKILL_REFERENCE.md](GAME_SKILL_REFERENCE.md) separately records25 manually read skill tooltips, with independently extracted numeric IDs. Those references supply rule text, not additional replay cases or automated semantic acceptance. Current replay checkpoint:96 cases /398 step records /26 direct records across twenty-two sources;41 UI-named roll families remain unchanged.

## Secondary casualty face1 from a repository demo

UI-086 adds an independently observed chain from the repository demo with hash `7bef0a74bff43ae56da5edf6abed7d8cb182da85a4da591acb78943afebcbcaf`. After a no-overwrite copy into the local game replay folder and hash verification, Saved Replays accepted and played it. This also establishes a practical route for independently reviewing demo fixtures in the installed game.

Home turn13/action6 shows a Renegade Ogre blocking a Zombie Lineman: Bone Head2+ die2 succeeds, pool Push/Defender Down, defender knocked down, Mighty Blow(+1) applied to armor9+ [3,5], injury[6,5] Casualty, casualty[13,1] Head Injury, then Regeneration4+ die4 succeeds. Six records373–376 retain actor2, damage subject43, modifier owner2 and recovery owner43. The UI's sanitized defender alias differs from raw ID43; do not use the visible alias as the replay ID. Loading faction labels were not captured. Normal playback preserved all intermediate entries; pausing had reached action7 while retaining the full action6 log.

This supplies a separately observed secondary face1, so observed examples now cover faces1–6 across local originals and the demo. It does not establish the entire casualty table, all modifiers or every recovery consequence. The earlier27-file absence statement remains scoped to that local corpus. At UI-086, UI totals were86 cases /343 distinct steps /10 direct records across eighteen saved sources; production contracts remain unchanged.

## Failed Pro, repeated Chainsaw result and recruitment ID reuse

UI-087 independently displays away turn4/action1: Blitz toward Imperial Retainer Lineman11, Chainsaw2+ die1 Failure, Pro3+ die1 Failure, Chainsaw1 Failure reported again, self-armor9+ [2,5]+Chainsaw3 Success and injury[2,1] Stunned. Team rerolls stay2. In104/6 the original Chainsaw appears in a decision question;105/0 records skill50 usage and a Pro1 question;106/0 reports both final results with NewRoll0 and team-reroll Used0. Those summaries are not new independent attempts. The actor and intended target are48/11, but106/1 assigns damage subject48 and modifier ownership48. Direct ReplayStep165 child2 contains EventEndTurn Reason2, and playback advances to home4. The later TURNOVER banner was captured during the following home block; it is not separately transcribed as the preceding exact reason.

UI-088 displays that following home4/action1 block: two identical block symbols, defender uses Block, result Attacker Down, attacker armor8+ [1,5] Failure and TURNOVER.107–108 preserve attacker4/defender41 and defender skill30, then attacker self-damage4. The pool symbols are retained numerically without claiming a newly established face label from this pass.

Source008 also supplies a raw recruitment-identity counterexample. ReplayStep7 child1 buys MercenaryId48/MercenaryType1455 at150,000; child3 BoardState supplies player48 Data type1455. ReplayStep8 child1 is EventRemoveMercenary for48/type1455 with Validity0. ReplayStep9 child1 buys the same ID48/type1121 at140,000, while child3 omits its Data. The retained recruitment catalogue describes type1121 with innate skill25 and50; the subsequent chain uses those skills. Playback still shows the earlier recruit's star name/portrait and MA9/ST2/AG2+/AV8+ card, yet its self-armor log uses9+. **Do not infer final recruit identity from the first roster appearance, omitted Data, or a visible playback portrait.** This is a source-specific mismatch; full removal validity, update precedence, replay compatibility and omission policies remain unproven. Numeric locators and fresh raw inspection support the counterexample; these recruitment events are not extra UI-labelled dice cases.

At the source008 checkpoint:88 cases /352 distinct step records /16 direct events across nineteen sources (eighteen local originals plus one demo).41 UI-named roll families remained unchanged. Source008 then had positive fixtures, leaving nine of the original27 local source hashes without one; the earlier ten-source/13,004-step/37-candidate triage remains a historical snapshot, not a current unseen-source count.

## Throw-in geometry hypothesis

An offline check of all16 type9 emissions predicts every recorded endpoint with this explicit model: first D6 selects the paired directions1/2,3/4,5/6; the remaining two D6 sum the distance; the origin is the last inbound square; an interrupted throw stops at its first out-of-bounds square and starts another throw-in. Under the same model, using dice index1 or2 as direction fits only2/16 or5/16 respectively, versus16/16 for index0. This comparison tests three fixed models, not every possible mapping.

| Source / sequence / step | Origin [x,y] | Dice | Recorded endpoint | Relevant distinction |
| --- | --- | --- | --- | --- |
| 002 /375 /3 | [19,14] | [6,1,4] | [24,9] | Raw CellFrom[18,15] differs from the inbound origin |
| 003 /170 /5 | [20,0] | [1,4,1] | [25,5] | North edge diagonal |
| 004 /311 /3 | [25,2] | [5,2,1] | [22,5] | East edge diagonal |
| 007 /107 /4 | [6,0] | [4,3,5] | [6,8] | Straight return |
| 018 /310 /3 | [15,14] | [2,2,2] | [11,10] | Carrier exit recovered from pushback before intervening damage |
| 021 /235 /1 | [12,14] | [3,4,1] | [12,9] | Origin inferred by clamping outside endpoint[12,17] |
| 026 /400 /3 | [22,0] | [1,5,6] | [26,4] | Eleven-square throw interrupted at another edge |
| 026 /400 /4 | [25,3] | [6,3,1] | [21,7] | New roll starts at preceding last inbound square |

Private reproducible scan: `python replays/.analysis/audit-throwin-geometry.py`; output `replays/.analysis/throwin-geometry-audit.json` records all16 source hashes, locators, origins, assumptions and predictions. This is stronger raw corroboration, still not independently labelled die-role evidence. The existing UI observations identify the return-to-pitch transition but omit its dice roles. No west-edge example exists here; two distant-pass origins are inferred by clamping, and distance-die ordering is indistinguishable. Do not count these raw hypotheses as additional UI cases or completed support.

## Reproduce and review

Keep the original corpus under ignored `replays/`. Verify that the sanitized extracts match it:

```sh
python scripts/verify-replay-evidence.py demo-replays tests/fixtures/evidence/bb3-ui-demo-009.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-001.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-002.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-003.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-004.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-005.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-006.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-007.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-008.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-012.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-013.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-014.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-015.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-016.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-021.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-024.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-026.json
python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-027.json
```

The standard-library verifier uses source SHA-256, replay version and exact numeric step/message projections, plus optional direct-event projections. Event records use one-based ReplayStep and zero-based direct child indices, including non-event children such as Clock and BoardState. It imports no application maps and prints no private filenames. It verifies extraction identity, not the accuracy of a manual UI transcription. For semantic review, load the matching source through Saved Replays, pause, choose the annotated half/team turn, then step actions and expand the dice log with L. Next-action seeking can clear the log; play briefly and pause to retain intervening reroll details. Read the resulting screenshot before each further input.

## Still required

New source (2026-11-10): [INSTALLED_ENUM_EVIDENCE.md](INSTALLED_ENUM_EVIDENCE.md) documents82 compiled gameplay enum tables /1,428 name-value pairs from the installed executable, with a reproducible extractor, hash and offsets. This independently corroborates the observed names and supplies additional unobserved names. Current UI totals are96/398/26; compiled entries are not additional gameplay observations. Namespaces differ in places and must remain separate. Behavioral and version acceptance remains required.

This evidence establishes concrete names and counterexamples for 41 roll families; it does not complete NUF-009. Further work includes held-out source/version validation, additional held-out trait cases, fuller Animal Savagery victim/damage policies, complete opponent-chosen block policies beyond UI-059, detailed Block/Dodge/Tackle/Wrestle/Juggernaut/Pro/Brawler behavior, complete ordinary and Stunty injury tables, complete casualty/apothecary/regeneration/KO-recovery policies, remaining referee/ejection/bribe/argue-call outcomes, interception/deflection and remaining rare families. State omission/default semantics, coordinate orientation, action boundaries, natural-roll policies and beneficiary contracts also remain open.

No production mappings or scoring were changed. The historical label maps remain disputed; consumers must not read this evidence as completed support or a full-match verdict guarantee.


## Source018: Fireball owner, boundary and injury modifier

UI-089 independently confirms Amazon/home uses Fireball after the final away11 activation and before the logged away end-turn/home12 boundary. Three Fireball hit!(4+) lines show6 Success,1 Failure,2 Failure. The successful subject's AV10+ [6,4] succeeds; injury[6,2]+Spell1 is KO. Raw282/0–2 are PlayerStep StepType19 with subjects37/47/48, TargetId−1;282/3 is DamageStep Source3 with PlayerId=TargetId37. Hit lines omit subject names, so the three individual IDs remain raw chain context. The visible team card-use label independently establishes the home caster. Raw subjects belong to the away roster; the successful hit harms that side.

ReplayStep386 child1 EventActiveGamerChanged has no explicit value; child4 asks for one cell with CardId253. ReplayStep388 child1 uses that card at[13,10], then child3 ends the turn with Reason1. The UI names the away end-turn reason End of Turn. These four exact event projections are retained; no general omitted GamerId/ActiveTeam policy is inferred. The top Action9 display persists across the boundary and is not a wizard activation ID. DamageStep Source3 and injury Source3 must not be conflated with PlayerStep StepType19. Corrected UI-044's prose to reflect its already-correct saved numeric extracts.

At the source018 checkpoint:89 cases /356 distinct step records /20 direct context records across twenty sources (nineteen originals and one demo);41 UI-named roll families. Eight originals then remained without positive UI fixtures. These are corroborating cases, not runtime promotion or completed policy/state acceptance.


## Source011: three breath branches and natural-six Catch

UI-090: home3 Action9 Flamesmith7/ST3 targets Yhetee37/ST5. Question banner requires5+; kept die4 appears in the final log as Breathe fire4+,4−Strength1 Failure. Raw98/1 uses ModifierType52/PlayerId37/−1. Final99/0 Used0/NewRoll0 keeps the original4; rerolls stay3. Home Action10 follows, so the miss does not end the team turn. UI-091: home5 Action8 Flamesmith8 attacks the same target, keeps1, becomes Prone and takes AV10+[6,2] Failure. Raw169/1 DamageStep Source21 has PlayerId=TargetId8; AccuracyStep FinalCell switches to the actor square. Playback advances to away6; no exact end-turn reason was separately transcribed. A failed roll is not sufficient to choose the self-damage branch: natural1 and ordinary4 have different consequences.

UI-092: home2 Action4 player8's Breathe fire4+ die5 succeeds against39, placing the opponent Prone without an armor emission. UI-093: next Action5 attacker5 declares Blitz, Rush2+5 succeeds, pool Both Down/Defender Stumbles resolves using attacker Block to Defender Down; victim40 armor8+[2,4] fails and the ball bounces7→[11,0],8→[12,−1], returns to pitch, then bounces3→[12,7]. Away38 Catch4+1−5 fails, with Scatter−1/tackle zones−2/Disturbing Presence−2. Bounce8→[13,6] leads to home3 Catch4+6−4 Success and possession, with Scatter−1/tackle zones−2/Disturbing Presence−1. Both raw Catch Difficulty values are6 despite different negative sums. **Natural6 succeeds despite a modified total below4.** This is catch-specific evidence, not a universal threshold exception for all dice families. Individual modifier owners differ from the catcher.

The raw throw-in at54/4 supplies dice[4,2,4] and pre-bounce landing[11,6], but the UI only says the ball returns to pitch; die roles remain inferred geometry. No unsupported direction/distance transcription is added. Source011 adds4 cases/20 steps, bringing current totals to93 cases/376 distinct steps/20 direct records across twenty-one saved sources (twenty originals plus one demo). Seven original local sources lack positive fixtures;41 named roll families unchanged.


## Source025: Pass, opposing interference and Catch rerolls

UI-094 independently displays home11 Action7: passer5 stands, picks up on6, then fumbles a Long pass on1 with Long pass−2/Cannoneer+1. Pass rerolls it to6−1 Accurate. Away45 then fails Interfere3+ on4−4 (Accurate pass−3, opposing tackle zone−1). Intended home receiver4 fails Catch2+ on1, uses Catch and succeeds on4, gaining possession. Team rerolls remain home4/away3. Temporary away highlighting during the interception decision precedes the actual away11 team turn; it is not an ordinary new away activation.

Seven exact records292/0,292/1,292/2,292/5,293/0,294/0 and294/1 retain the deterministic stand-up, pickup and full random chain. Pass47 and Cannoneer88 belong to5; QuestionInterceptors assigns Gamer1/player45; the interference modifier references tackle-zone owner9; Catch6 belongs to4. Original pass1 appears in QuestionSkillUsage; replacement6 has Status2/NewRoll1. Catch1 and replacement4 are separate ResultRoll messages in the same step, with Status1 then2 and NewRoll1. Those fresh dice differ from kept-result NewRoll0 summaries. QuestionInterceptors probability entries16.66667/83.33333 retain numeric Description2/3 without assigning that namespace from inference.

Current totals:94 cases/383 distinct step records/20 direct context records across22 sources (21 originals plus one demo);41 named roll families unchanged. Six original sources lack positive fixtures. A fresh recount finds8,408 step emissions there, with10 candidates retained from the earlier targeted triage. See [REPLAY_CAPTURE_GAPS.md](REPLAY_CAPTURE_GAPS.md) for finite collection requirements and limits. No runtime mapping or issue is promoted.


## Source025: availability and possession counterexamples

UI-095 independently observes home11 Action3, actor3 blocks away40 on two Defender Down symbols. The defender crosses the sideline into the crowd; the log reports Defender Knocked down then Injury[1,4] Stunned with no AV line. Five complete steps286–288 contain no armor check. Pushback moves[17,14]→[17,15], then two removal messages with different Reason values1/0 precede the single injury. Three full numeric BoardStates410/2,411/2,412/3 preserve the progression to Cell[-1,-1]/Situation1 while CanAct1/TackleZone1 remain and Status is omitted. **Those flags alone do not establish on-pitch availability; the injury label alone does not establish a final on-pitch Stunned state.** The installed enum names Situation1 Reserve, but the bench label was not independently inspected. The following home Action4 proceeds. Full removal/default policies remain open.

UI-096 independently observes away10 Action4, actor48 stands, dodges3+ on5 and blitzes home ball carrier5. Original Push is rerolled with an away team reroll4→3 to Both Down. Attacker AV8+[1,3] fails, defender AV8+[4,3] fails;5 becomes Prone and the ball bounces7 to the independently displayed[4,9], visibly loose on an empty square. Home11 begins. Ten exact steps279–281 retain both pools, the reroll and subject-specific damage. BoardState401/2 has Carrier5/IsHeld1;402/7 omits both with Ball cell[4,9]. **Blanket carry-forward of omitted Carrier/IsHeld is incorrect for this transition.** No universal omission/default policy follows. EventEndTurn402/2 has Reason2; the exact turnover banner was not separately captured. ResultUseAction TeamId0 accompanies away48 and reroll Gamer1; it is not sufficient by itself as a roster-ownership oracle.

Checkpoint:96 cases/398 distinct step records/26 direct context records across22 saved sources. Six original sources still lack positive fixtures and41 UI-named families remain unchanged. All22 source verifiers pass; deliberate off-pitch CanAct and omitted Carrier mutations reject at412/3 and402/7. Static [offline rule data](OFFLINE_RULE_DATA_EVIDENCE.md) adds178 selected rows without adding UI cases or accepting runtime semantics.


## Corpus audit of ResultUseAction.TeamId

A separate direct-message audit of all27 local originals finds6,342 ResultUseAction emissions, every one with explicit TeamId0. Of these,3,309 actors belong unambiguously to initial roster index0,2,920 to initial roster index1, and113 have no unambiguous initial-roster membership. Those indices are raw roster ordering, not a newly verified universal home/away mapping. Recruitment and later ownership changes are not reconstructed by this audit.

[bb3-action-team-audit.json](../tests/fixtures/evidence/bb3-action-team-audit.json) preserves source hashes, replay versions, per-source counts and numeric example locators. UI-096 supplies an independently observed away actor with this field0. Thus the field cannot be used alone as a side-ownership oracle for this corpus. Its intended semantics remain unresolved; no replacement ownership policy is accepted from proximity. Counts are emissions, not independent random attempts or additional UI cases.

Reproduce with `python scripts/audit-bb3-action-team.py replays --max-decoded-mib 32 --verify tests/fixtures/evidence/bb3-action-team-audit.json`. The explicit offline cap is needed for source020. Default15MiB rejection, invalid-cap rejection and a deliberate aggregate mutation rejection were checked. Paired UI counts remain96/398/26 across22 sources.


A separate [39-file arithmetic audit](LOCAL_REPLAY_FINDINGS.md#single-d6-arithmetic-hypotheses--2026-11-10) now supplies exact additional natural-roll review targets. It is not UI evidence:3,822 scoped direct single-D6 ResultRoll emissions include nine disagreements with a plain modified-sum test. Recorded Difficulty agrees in the selected sample, including source011's ordinary-ball Catch in UI-093 and source016's bomb Catch in UI-049. Source016258/1 Pass6−4 and source025444/6 Catch1+1 still need direct replay review at those locators; no new annotated case is counted.


Probability-description follow-up: the existing executable enum snapshot explicitly names Description2 Success and3 Fail in both BoardData/NetGameplay ProbaDescription tables. UI-094's numeric probabilities16.66667/83.33333 can now be compared with those naming facts; its fixture notes preserve the distinction from RollOutcome0/1 and retain field-binding/version limits. No numeric extract or UI transcription changed.


Offline handoff follow-up (2026-11-10): the user connected the local profile manually. A fresh main-menu observation confirmed the handoff cleared. My Teams is disabled in offline hotseat setup; default rosters transition directly from Chaos Chosen to Chaos Renegades in the inspected portion, providing no Breathe Fire reference through that route. No match was started. Profile → History → Saved Replays remains available offline and successfully loads source025. UI-097 independently displays away16 Action2: Quick pass4+ die5 Accurate, Catch2+ die1+Diving Catch1 Failure, Catch skill replacement3+1 Success, then receiver possession. Reroll counters stay1/1. Three exact records444/0,5,6 bring totals to97 cases/401 steps/26 direct records across22 sources. This closes the UI-transcription gap for that specific arithmetic counterexample, not its broader supported rule contract or a production issue. Source016258/1 Pass6 under negative modifiers remains the next discriminating target; raw-linked failed-Bribe and natural1 Argue gaps remain open. The previous profile handoff is resolved; the game remains open with saved-replay analysis resumed.


Source016 follow-up (2026-11-10): UI-098 independently displays away8 Action9 Long pass4+ die6-4 Accurate, with Long pass-2 and grouped Disturbing Presence-2. Home interceptor10 then fails Interfere4+ die5-8 (accuracy-3, four tackle zones-4 and Disturbing Presence-1); Bounce2 lands at[6,9] and home8 starts. Four exact steps and five direct context records retain the pass/response, role ownership and held/intermediate/loose ball states. Intermediate309/5 retains Carrier46 after the pass while IsHeld is omitted and the ball coordinate differs from the passer's cell; Carrier alone is not sufficient held-possession evidence. UI-099 adds two separately selected Foul Appearance2+ die1 failures (away Actions5/6), followed by different teammates acting during the same turn. Five exact steps/four BoardState records preserve each actor's explicit CanAct1 to omission transition, subject-owned Skill10, unchanged cells and continued team turn. Omission is not promoted to a universal false/default rule. Current totals99 cases/410 distinct steps/35 direct records across22 saved sources; six original hashes remain unpaired. The source016 numeric verifier passes; deliberate pass-Outcome and intermediate-Carrier mutations reject; global ID/locator recount passes. No runtime mapping, rule contract or backlog issue is closed.
