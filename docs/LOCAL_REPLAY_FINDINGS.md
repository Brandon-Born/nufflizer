# Local replay corpus: raw action evidence

Date: 2026-11-09. Owning work: NUF-008, NUF-009, NUF-010–014 and NUF-016.

The user supplied 27 local `.bbr` files under `replays/`. This directory, including generated analysis, is Git-ignored. Do not commit the source files or identifying match metadata. This report records aggregate numeric facts; it does not promote game-rule mappings or close a remediation item.

Follow-up: [REPLAY_UI_EVIDENCE.md](REPLAY_UI_EVIDENCE.md) pairs 93 manually observed game cases with 376 verified step records and 20 top-level event records from twenty-one sources (including one repository demo). It establishes specific UI correspondences for 41 roll families and supersedes the candidate-name uncertainty below in those annotated contexts. Brawler, Grab and attacking/defending Wrestle provide further skill-resolution evidence; Decay and niggling Injury modifiers are now corroborated; Head Injury, Broken Arm and Smashed Knee are corroborated by secondary casualty dice; face1 is absent from the27 local files but is now independently corroborated in a repository demo (UI-086). Runtime support and full rule acceptance remain open. A completed hotseat experiment produced no replay export; the paired evidence comes from existing saved files. Source020 adds a prayer/effect pair, a Block/Horns chain and independently displayed Extra Time/home turn20. Its oversized XML requires the explicit offline32MiB verifier option. UI-085 separately confirms an offered and used Dump Off reaction, an accurate defender pass, a successful teammate catch and the resumed attacker block; the earlier UI-083 decision remains unconfirmed. The [in-game skill reference](GAME_SKILL_REFERENCE.md) adds25 separately recorded tooltip rule descriptions. A separate [installed-image extraction](INSTALLED_ENUM_EVIDENCE.md) now preserves82 gameplay enum tables /1,428 explicit name-value entries with hash/offset provenance; naming evidence is substantially stronger, while behavior and namespace/version linkage remain acceptance work.

## Reproduce

From the repository root:

```sh
python scripts/inventory-replay-actions.py replays --max-decoded-mib 32 --output replays/.analysis/inventory.json
python scripts/inventory-replay-actions.py demo-replays --output replays/.analysis/demo-inventory.json
```

The standard-library script reads raw XML and double-base64 message payloads without importing application mappings. Reports use SHA-256 source identifiers, one-based sequence numbers, zero-based step/message indices, and numeric-only payload projections. Examples span up to four files per family. Source emissions are not deduplicated random opportunities: questions, rerolls and resolutions can describe the same action. Skill counts indicate same-step co-occurrence, not proven skill causation.

## Corpus inventory

| Measure | New local corpus | Existing demo corpus |
| --- | ---: | ---: |
| Unique file hashes | 27 | 12 |
| StepResult emissions | 35,121 | 14,272 |
| Direct message-tag / roll-type pairs | 41 | 33 |
| QuestionBlockDice / type 3 | 2,281 | 848 |
| ResultBlockRoll / type 3 | 2,094 | 793 |

No input-file hashes overlap between these corpora; this does not establish independent matches or independent rule annotations. New message/type pairs relative to the demos are `ResultRoll|16`, `29`, `32`, `35`, `42`, `48`, `89`, and `97`. They remain unverified.

All 27 local files decode with the explicit 32 MiB offline cap. One expands to **16,510,562 bytes**, exceeding the application's 15 MiB / 15,728,640-byte decoded limit. The default-cap inventory reports that file as excluded; it is not corrupt. No application upload/decode limit was changed. All 12 demos fit the default limit.

## Direct observations and implications

| Raw family | Local observations | Interpretation boundary |
| --- | --- | --- |
| PlayerStep / step 1 | 17,304 steps; 15,838 have no direct ResultRoll; 1,466 have one or more | This is a movement container, not proof of a dodge. Do not classify every step 1 as dodge. |
| ResultRoll / type 2 | 976 emissions across all 27 files; every one is in PlayerStep / step 1, with one die of type 0 | The old numeric `block_check` label conflicts with movement evidence. A dodge is a candidate meaning; validate state and modifiers before promotion. |
| ResultRoll / type 4 | 208 emissions across all 27 files; every one is in PlayerStep / step 1, with one type-0 die | The old injury label is unsupported. Examples occur after ResultDoMove / ResultMoveOutcome; investigate pickup using ball state and skill evidence. |
| ResultRoll / type 7 | 180 emissions across 26 files; every one is in PlayerStep / step 4, with one type-0 die | The existing pickup label is not established by these counts. Investigate receipt/catch and possession transitions separately from movement-associated type 4. |
| ResultRoll / type 1 | 545 emissions across all 27 files; 450 in movement, 87 in block steps, 6 in step 31, 2 in AccuracyStep / step 24 | Neither an armor label nor a movement-only contract is sufficient. Identify the check's role within each action, including possible extra movement costs. |
| ResultRoll / type 10 | 1,548 emissions, all in DamageStep / step 2 | Supports a damage-chain investigation; exact stage distributions and beneficiary conventions still require validation. |
| ResultRoll / type 34 | 201 emissions across 15 files; all in activation step 0; all one type-0 die, requirement 4, difficulty 2 or 4 | Contradicts the old armor-like assumption. Skill 51 co-occurs in 171 emissions; investigate activation/trait checks. |
| ResultRoll / type 37 | 174 emissions across 13 files; 163 in activation step 0 and 11 in block step 6; all one type-0 die, requirement/difficulty 2 | Contradicts the old damage-chain assumption. Skill 10 co-occurs in 153 emissions; determine actor/target roles and that skill's behavior. |
| ResultRoll / type 71 | 39 emissions across 23 files; 34 co-occur with skill 44, mostly in block/activation steps | A referee/argue-call label is not justified. Determine reroll/skill behavior from the surrounding question and resource chain. |

These contradictions corroborate the November review. They do not change the current application's exclusions or make unsupported families scoreable.

## Source-linked examples

For local source SHA-256 `6e201a8485bec553f4a019bc02b4d381976202825817412bead003f178cbb867`:

- Sequence 28, step 1: type-2 single-die check followed by ResultDoMove and ResultMoveOutcome. The latter explicitly contains RollSummary with RollType 2 and Outcome 1. This is source-level movement linkage, not proximity to a later block.
- Sequence 4, step 3: ResultDoMove and ResultMoveOutcome precede a type-4 check, then skill 61 and another type-4 emission. Both outcomes are 0. The new corpus provides a concrete original/replacement or repeated-emission investigation seed; the flags alone do not establish two independent attempts.
- Sequence 3, step 0: ResultUseAction 1 and skill 51 precede type 34, requirement 4 / difficulty 2, on one die.
- Sequence 30, step 0: a team-reroll usage result and skill 44 precede type 71 and another type-34 emission. This distinguishes a potential reroll-enabling check from the check being rerolled.

Full numeric contexts and additional sources remain in the ignored inventory. Resolve local file paths by matching the file hash; filenames are deliberately absent from this document and report.

## Next empirical work

### Cross-corpus gap check — 2026-11-10

Rescanned all27 local files and all12 demos for direct and nested dice-bearing nodes in decoded `StringMessage` payloads under `EventExecuteSequence`. This scope excludes top-level events and counts emissions, including repeated questions/summaries, rather than independent random opportunities. The private audit and numeric source locators are in ignored `replays/.analysis/cross-corpus-gap-audit.json`.

The demos contain a previously missing **secondary casualty face1**: source SHA-256 `7bef0a74bff43ae56da5edf6abed7d8cb182da85a4da591acb78943afebcbcaf`, sequence376, step1, message4. `ResultCasualtyRoll` records type12, D16=13, D6=1, Outcome6. The same damage step records armor[3,5] with skill13/+1, injury[6,5], removal and a subsequent type46 die4/Outcome1. The installed casualty enum names6 `HeadInjury`; the raw discovery was subsequently independently annotated in UI-086, including Head Injury and successful Regeneration. It is not a complete distribution. Across both corpora, secondary faces1–6 now have raw examples; earlier face1 absence remains valid only for the27-file local search.

Bribe/type21 has two emissions across two files, both die2/Outcome1. ArgueTheCall/type30 has nine emissions across eight files: die2 once, die4 three times, die5 twice (Outcome2), and die6 three times (Outcome1). Neither a failed Bribe nor a die1 Argue appears in this scoped search. Absence from these messages is not proof of impossibility or absence from every replay encoding. Subsequent [controlled hotseat observation HS-009](HOTSEAT_EXPERIMENTS.md) captures Bribe1 Failure followed by another selected bribe4 Success on one ejection; that match has not yet been exported and does not fill the raw-source gap.

Existing files can still supply action/reroll choice chains, state/possession transitions, modifiers and held-out acceptance examples. Ten of the27 local sources do not yet have positive source-linked UI fixtures. Prioritize those and the demo casualty face1 before creating another controlled match. Raw coverage is broader than verified behavioral support; none of these counts closes an issue or promotes a scoring contract.

The subsequent controlled match completed0–0 with Replay/Download disabled and no new local replay; HS-011–014 added KO mitigation and trapdoor behavior only. This strengthens the case for mining already exportable sources first. Do not treat UI-only trial notes as a missing raw branch having been filled.

### Remaining-source triage — 2026-11-10

Joined the local inventory against the seventeen local source hashes with positive UI fixtures, then independently decoded and recounted the ten remaining files. Sources008–011,017–019,022–023 and025 contain **13,004 StepResult emissions**. This means no positive fixture for those source hashes, not that their contents have never been inspected. They are candidates for source-held-out acceptance; they are not an untouched blind test set.

A direct `StringMessage` scan in these ten sources retains37 targeted candidate emissions with exact private source/sequence/step/message locators:

| Installed roll identifier | Type | Raw Outcome0 emissions | Raw Outcome1 emissions |
| --- | ---: | ---: | ---: |
| Interception | 6 | 1 | 0 |
| Pro | 15 | 1 | 0 |
| FireballHit | 48 | 4 | 4 |
| Chainsaw | 67 | 1 | 8 |
| Loner | 71 | 5 | 4 |
| Animosity | 74 | 0 | 1 |
| BreatheFire | 97 | 3 | 5 |

These are compiled names and raw outcome codes, not newly observed UI successes/failures or independent trial counts. In particular, hit-check success can hurt its subject. This scan excludes nested and top-level roll records. The ignored `held-out-source-inventory.json` and `held-out-target-candidates.json` preserve the triage results. Prioritize both outcome branches for Fireball, Breathe Fire, Chainsaw and Loner, then compare original/replacement dice and resource decisions. Existing board and possession transitions remain a separate useful investigation. No new mapping is promoted by this triage.

1. Reconstruct source-linked activation/action chains, retaining original question dice and final results. Distinguish emission status from independent attempts.
2. Use initial board data and subsequent BoardState records to test movement departure, tackle-zone occupancy and ball possession. Some fields are omitted; whether an omission means a default value, unchanged state or something else still requires validation. Do not assume absence of Carrier either clears possession or carries the previous carrier forward.
3. Resolve skill IDs using roster evidence, explicit usage and positive/negative behavior. Co-occurrence alone does not name a skill or prove a rule.
4. Validate probability/outcome arithmetic, natural-roll rules, actor/subject roles and negative cases before editing supported scoring contracts. Preserve uncertainty and coverage for unresolved cases.

Validation performed: both corpus inventories completed, default-cap exclusion was reproduced, generated reports were checked for aggregate consistency and source locators, and Git ignore coverage was verified. No production analyzer behavior changed; full app tests/build were not run for this offline research tooling/documentation change.


### Source008 reviewed after triage

UI-087/088 add a positive fixture for source008, leaving nine local source hashes without positive UI fixtures. The ten-source/13,004-step/37-candidate triage above remains its original snapshot. Failed Pro1 is now independently displayed between original and repeated Chainsaw1; final summaries encode NewRoll0 and lead to self-armor/injury, not another independent Chainsaw attempt. The following defender-owned Block/self-damage chain is also displayed. See REPLAY_UI_EVIDENCE and bb3-ui-playback-008.json.

Raw recruitment events7/1,8/1,9/1 reuse MercenaryId48 across two types1455 and1121 with EventRemoveMercenary between. BoardState7/3 supplies earlier Data, while9/3 omits Data. The game displays the earlier portrait/card during later Chainsaw/Pro behavior. This supplies a concrete identity/update-precedence counterexample; no universal omission or valid-removal interpretation is inferred. These raw recruitment locators are context, not additional UI dice cases or closed state semantics.


Source018 follow-up (2026-11-10): UI-089 pairs three Fireball4+ checks6/1/2 with the explicitly displayed home caster, away11 end-turn/home12 boundary, AV10+ [6,4] and injury[6,2]+Spell1 KO. Four exact steps and four direct context events brought checkpoint totals to89/356/20 across twenty saved sources. Eight original local hashes then lacked positive fixtures. Corrected an earlier prose namespace error: Fireball PlayerStep StepType19 is distinct from DamageStep Source3; saved raw extracts were already correct. NUF-009/013/016 remain incomplete.


Source011 follow-up (2026-11-10): UI-090–093 add Breathe fire4+ die4−Strength1 Failure with original kept; natural1 self-Prone/AV10+[6,2] Failure; and die5 Success/target Prone without armor. A separate Blitz/ball-return chain independently displays Catch4+1−5 Failure and Catch4+6−4 Success, both raw Difficulty6. Natural6 is therefore a catch-specific exception to the plain modified-sum check; modifier holders and catchers differ. Current93 cases/376 distinct steps/20 direct records across twenty-one sources (twenty originals plus one demo); seven original hashes lack positive fixtures. Full policies/state/version acceptance and production semantics remain incomplete.


Source025 follow-up (2026-11-10): UI-094 pairs Pass and Catch skill rerolls with failed opposing interference during the home pass. Seven exact records bring current totals to94/383/20 across22 sources. Six originals (009,010,017,019,022,023) still lack positive UI fixtures. Independently decoding/recounting those hashes gives8,408 StepResult emissions; filtering the historical direct-message candidate list gives10 emissions (Loner6, FireballHit3, Animosity1), not independent attempts. Private hashes/locators are in ignored remaining-source-audit.json. See REPLAY_CAPTURE_GAPS for the finite next-data requirements; historical triage snapshots above remain historical.


UI-095/096 source025 state follow-up: a crowd-pushed defender becomes off-pitch Cell[-1,-1]/Situation1 while CanAct1 and TackleZone1 persist. A separate Both Down on carrier5 leaves a visibly loose ball[4,9]; the after-state omits Carrier/IsHeld, contrary to blanket carry-forward. Complete snapshots and mutations are retained. Current96/398/26 across22 sources; six unpaired originals unchanged. The installed offline rules JSON independently corroborates121 name/code pairs and adds casualty effects; see OFFLINE_RULE_DATA_EVIDENCE for provenance,178 selected rows and package/version limits. Client UI logs preserve hotseat failed-Bribe text but not raw dice messages.


### ResultUseAction TeamId audit — 2026-11-10

All6,342 direct ResultUseAction messages in the27 originals explicitly contain TeamId0. Unambiguous initial-roster membership splits3,309 roster-index0 actors and2,920 index1 actors, with113 unresolved by initial membership. This independent raw recount broadens UI-096's away-actor counterexample. The public numeric/source-hash snapshot is bb3-action-team-audit.json, reproduced by scripts/audit-bb3-action-team.py with explicit offline32MiB cap. TeamId alone cannot distinguish sides here; field purpose, recruitment and replacement ownership policy remain open. These counts are raw emissions and add no UI cases.


### Single-D6 arithmetic hypotheses — 2026-11-10

The independent [threshold audit](../scripts/audit-bb3-thresholds.py) scans all27 originals plus12 demos. It selects direct ResultRoll messages with exactly one explicitly DieType0 die, explicit Requirement, complete direct modifier values and binary Outcome0/1. This yields3,822 raw emissions across31 numeric RollType identifiers. Questions, nested roll nodes, top-level events, neutral outcomes, block pools and multi-die damage are excluded. These counts are not deduplicated attempts.

[bb3-threshold-model-audit.json](../tests/fixtures/evidence/bb3-threshold-model-audit.json) preserves39 source hashes/versions, per-type counts and nine exact numeric message projections. In the selected sample:

- `die + sum(modifiers) >= Requirement` disagrees with recorded Outcome nine times: eight natural6 records (seven Catch/type7 and one Pass/type5), plus one natural1 Catch record with a positive modifier.
- `die >= Difficulty` agrees with all3,822 recorded binary outcomes.
- Every selected Difficulty equals `max(2, min(6, Requirement - sum(modifiers)))`. This is a fitted corpus relationship, not a universally accepted natural-roll rule. Some families lack samples that distinguish alternative policies.

| Source hash prefix | Sequence / step / message | RollType | Die | Modifier total | Requirement | Difficulty | Raw Outcome |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `06f918e5e6f8` | 427 / 3 / 0 | 7 | 6 | -5 | 3 | 6 | 1 |
| `06f918e5e6f8` | 444 / 6 / 0 | 7 | 1 | 1 | 2 | 2 | 0 |
| `3495be476155` | 54 / 8 / 0 | 7 | 6 | -4 | 4 | 6 | 1 |
| `55ff6509f5f1` | 258 / 1 / 0 | 5 | 6 | -4 | 4 | 6 | 1 |
| `55ff6509f5f1` | 351 / 1 / 0 | 7 | 6 | -3 | 4 | 6 | 1 |
| `7895a4dfb4e8` | 71 / 4 / 0 | 7 | 6 | -4 | 3 | 6 | 1 |
| `7bef0a74bff4` | 88 / 4 / 0 | 7 | 6 | -5 | 3 | 6 | 1 |
| `bb666000e382` | 722 / 12 / 0 | 7 | 6 | -6 | 2 | 6 | 1 |
| `fb4da9519a1c` | 241 / 3 / 0 | 7 | 6 | -6 | 3 | 6 | 1 |

Two entries already have independent UI observations: source01154/8 in UI-093 (ordinary ball Catch6−4) and source016351/1 in UI-049 (bomb Catch6−3 before Explosion). The other seven locators are raw review targets; this scan creates no new UI cases. Two particularly discriminating next observations are source016258/1 Pass6−4 against Requirement4, and source025444/6 Catch1+1 against Requirement2. In the latter, Skill28/+1 belongs to receiver40; Catch6 then replaces1 with3 in the same step, with final Outcome1. Do not call the original failure a final turnover or discard it merely because the skill reroll succeeds. The former also offers an opposing interceptor, but its exact pass label has not been transcribed at this locator.

Reproduce: `python scripts/audit-bb3-thresholds.py replays demo-replays --max-decoded-mib 32 --verify tests/fixtures/evidence/bb3-threshold-model-audit.json`. Exact regeneration passes and agrees with the separate initial private scan. A deliberate message-Outcome mutation rejects; invalid caps reject; all selected projections are numeric-only. Nine existing research tests pass. None of this establishes a universal rule, completes probability/role policies, promotes scoring or substitutes for game/rule evidence.


Offline handoff follow-up (2026-11-10): the user connected the local profile manually. A fresh main-menu observation confirmed the handoff cleared. My Teams is disabled in offline hotseat setup; default rosters transition directly from Chaos Chosen to Chaos Renegades in the inspected portion, providing no Breathe Fire reference through that route. No match was started. Profile → History → Saved Replays remains available offline and successfully loads source025. UI-097 independently displays away16 Action2: Quick pass4+ die5 Accurate, Catch2+ die1+Diving Catch1 Failure, Catch skill replacement3+1 Success, then receiver possession. Reroll counters stay1/1. Three exact records444/0,5,6 bring totals to97 cases/401 steps/26 direct records across22 sources. This closes the UI-transcription gap for that specific arithmetic counterexample, not its broader supported rule contract or a production issue. Source016258/1 Pass6 under negative modifiers remains the next discriminating target; raw-linked failed-Bribe and natural1 Argue gaps remain open. The previous profile handoff is resolved; the game remains open with saved-replay analysis resumed.


Source016 follow-up (2026-11-10): UI-098 independently displays away8 Action9 Long pass4+ die6-4 Accurate, with Long pass-2 and grouped Disturbing Presence-2. Home interceptor10 then fails Interfere4+ die5-8 (accuracy-3, four tackle zones-4 and Disturbing Presence-1); Bounce2 lands at[6,9] and home8 starts. Four exact steps and five direct context records retain the pass/response, role ownership and held/intermediate/loose ball states. Intermediate309/5 retains Carrier46 after the pass while IsHeld is omitted and the ball coordinate differs from the passer's cell; Carrier alone is not sufficient held-possession evidence. UI-099 adds two separately selected Foul Appearance2+ die1 failures (away Actions5/6), followed by different teammates acting during the same turn. Five exact steps/four BoardState records preserve each actor's explicit CanAct1 to omission transition, subject-owned Skill10, unchanged cells and continued team turn. Omission is not promoted to a universal false/default rule. Current totals99 cases/410 distinct steps/35 direct records across22 saved sources; six original hashes remain unpaired. The source016 numeric verifier passes; deliberate pass-Outcome and intermediate-Carrier mutations reject; global ID/locator recount passes. No runtime mapping, rule contract or backlog issue is closed.

## 2026-11-12 source recovery scope and Dodge follow-up

A new bounded read-only discovery checked known local BBR locations and242 ZIP central directories, finding one standalone original and eight archived BBRs. Three hashes join the historical audits; all9 raw files have numeric encoded-step/message counterparts in current public demos, without proving whole-board equivalence or new independent match diversity. Three direct failed committed Rush emissions are carrier/special-action cases, not the missing ordinary non-carrier Used1 contract. Private original/member names and paths stay out of committed artifacts. See [the exact scope/receipt](REPLAY_CAPTURE_GAPS.md#2026-11-12-read-only-local-source-discovery); the historical27-original inventories above remain historical, and absence of this checkout's ignored directory is not global absence.

Independent public-source extraction now qualifies retained original Dodge failures demo2/432, demo3/213 and demo8/163 for only their fixed-decline teammate-move ranges. `bb3-kept-dodge-moves.json` stores source hashes, numeric frames, raw dice/choice/declaration/roles/geometry/damage and qualified deterministic-completion joins. Incomplete eligibility gives0–8,0–2 and0–10, with exact ranges[−16/3,0],[−4/3,0],[−20/3,0]. Demo3's fragment omits earlier completions and stays0–10; demo8's interrupted prior history cannot narrow its range. These source-specific envelopes are neither new gameplay UI annotations nor a held-out quantitative calibration set.
