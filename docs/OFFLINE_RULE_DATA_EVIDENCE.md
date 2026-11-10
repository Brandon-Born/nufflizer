# Installed offline rule data

Observed 2026-11-10 while investigating NUF-009/011/013/016. Static JSON data from the installed offline server supplies additional provenance for numeric names and casualty effects. No game modules were imported or executed.

## Source and artifact

The selected `bb3rulesengine.zip` is 2,433,838 bytes, SHA-256 `d5b328d7925ccc98ab8ac4a47d6d100e4b8683230025b17ed81b4163935eac61`. Its `version.json` declares package revision 23 for both the rules engine and game packages. These are package revisions, not ReplayVersion or the displayed client build.

[bb3-offline-rule-data.json](../tests/fixtures/evidence/bb3-offline-rule-data.json) retains 178 rows from six tables, archive identity and individual JSON-member hashes. It contains static game facts, with no match/account/player-instance data or machine-specific source path.

| Table | Rows | Scope |
| --- | ---: | --- |
| Skill |105 | Numeric code, name and category |
| Casualty |11 | Numeric code and name |
| Casualty effects |11 | Characteristic effects, missed game, niggling injury and roster treatment fields |
| Characteristic |5 | Numeric code, bounds and improvement direction |
| Skill granting |1 | Declared skill relationship |
| Skill preventing |45 | Declared skill relationships; application context unresolved |

Every skill code/name 105/105, casualty code/name 11/11 and characteristic code/name 5/5 agrees with the corresponding `EBB3BoardDataSkill`, `EBB3BoardDataCasualtyOutcome` and `EBB3BoardDataCharacteristic` entry in [the independently extracted executable enums](INSTALLED_ENUM_EVIDENCE.md). Comparison removes punctuation/whitespace and ignores case, while retaining digits and exact numeric values. There were no disagreements in those 121 rows.

For example, skill 105 names Breathe Fire, 47 Pass, 6 Catch and 25 Chainsaw. Casualty 6 names Head Injury and 7 Broken Arm; their table effects reference AV and PA respectively. These give precise namespace facts and static effect declarations. They do not establish which dice select the casualties or how a skill changes an action.

## Reproduce

The standard-library [extractor](../scripts/extract-bb3-offline-data.py) reads only `version.json` and `Datas/BB3Rules.json`; it neither extracts nor executes `.pyc` members. It caps the archive at 16 MiB and each selected JSON member at 2 MiB, rejects duplicate/missing required members and checks table shapes.

```powershell
python scripts/extract-bb3-offline-data.py 'D:/games/steamapps/common/Blood Bowl 3/BB3/Content/OfflineServer/bb3rulesengine.zip' --verify tests/fixtures/evidence/bb3-offline-rule-data.json
```

Exact snapshot verification passes. A deliberately changed casualty code is rejected. Input-cap and duplicate-member rejection were also checked independently. Those checks verify extraction integrity, not game semantics.

## Limits that change the next investigation

The installation also has an older-looking `bb3.zip` containing overlapping module names with different bytes. Startup discovery and path registration of the separate rules archive are now corroborated below; per-module import resolution and complete path precedence remain unestablished. The selected archive's compiled members are opaque to ordinary Python bytecode inspection; no mechanics algorithm is claimed from those files. The names Bribe/Catch/BoardState/Replay identify investigation targets only.

In particular, the granting/preventing tables must not be treated as in-action cancellation rules such as Tackle versus Dodge. Their usage context needs independent evidence. The casualty-effect table is not a probability distribution, a complete apothecary policy or proof of recovery behavior. Cross-version and source-held-out acceptance remain open. This evidence adds no UI observations, changes no production mapping and closes no backlog issue.


## Session registration and conflicting manifests

[bb3-offline-package-registration.json](../tests/fixtures/evidence/bb3-offline-package-registration.json) preserves sanitized metadata from the same private client-log snapshot as the hotseat observations (SHA-256 `39e452d2ea14e72abd5f2b7bdf31c70baa6b0a0b482293d5141e86a562918857`). Lines979/980 explicitly find `bb3rulesengine.zip` and add its installed path to system paths. The path was checked against the archive extracted above; the artifact retains line hashes and the archive hash, without the machine-specific path. This strengthens session provenance but is not an import trace for every module.

A separate external `version.json` is130 bytes, SHA-256 `532476cced3f29f5ec19eb78388f6d95e5d9e93a63b4f7eced45c82c132c7642`, and declares rules revision3; the archive's manifest declares23. Both exact declarations are retained. Do not silently choose one as the replay serialization version, client build or proof of full compatibility. The current log says a persistent-download version file was not found and records the installed path; it does not settle all loader precedence.
