# Roll, step and declaration mapping acceptance

Audit date:2026-11-12. Owning issue:NUF-009. This audits the original mapping criteria against current claims. It does not certify complete block, damage, reroll, attribution, state or contextual policies, which retain their own IDs and acceptance requirements.

## Evidence and method

Run `python3 scripts/audit-semantic-contracts.py --check` and `corepack pnpm exec vitest run tests/unit/semanticContractAudit.test.ts`. The standard-library extractor imports no application maps or scoring. Its [hash-bound artifact](../tests/fixtures/evidence/bb3-semantic-contract-audit.json) joins the independently extracted executable enum snapshot, saved paired UI/numeric observations and all12 public source hashes. It records all41 declared contracts with semantic claim, payload-variant locators, serialization version, rule scope, provenance, positive/negative evidence and beneficiary convention.39 have paired identity witnesses; ThrowIn9 and ThrowARock70 remain explicitly provisional. Compiled names alone do not establish a probability or causal policy.

All96 roll names and39 step names match the installed NetGameplay definitions, with four documented UI aliases: Rush/GFI, Interfere/Interception, KO recovery/WakeUp and Projectile Vomit/VomitAccuracy. The image identity and exact byte offsets remain in [installed enum evidence](INSTALLED_ENUM_EVIDENCE.md). The primary BB2020 rule reference, hash and version limits are recorded in [injury rule evidence](INJURY_TABLE_EVIDENCE.md); local page inspection also corroborates the scoped base checks below. ReplayVersion1-4-0-0 is the admitted serialization scope, not proof about arbitrary future builds or tabletop editions. Every admitted policy has a negative version and ownership-conflict probe.

## Supported probability claims

These are conditional dice policies; exact admission, payload flags, die types, ownership, targets and source linkage remain required. A named family is not automatically supported. The fixture's eight original policy records bind each claim to its rule/version, distinct favorable perspective and positive/adversarial tests.

| Source/family | Semantic and payload scope | Favorable perspective / evidence |
| --- | --- | --- |
| ResultRoll1 | Fresh single-D6 Rush; qualified team/kept variants | Roller team; UI-008/009 and verifiedNumericChecks |
| ResultRoll2 | Fresh single-D6 Dodge; fixed recorded modifiers and qualified rerolls | Roller team; UI-006/008/009/028; movement container alone proves no Dodge |
| ResultRoll4 | Single-D6 Pick up; qualified Sure Hands/team/retained original | Roller team; UI-002/022 |
| ResultRoll7 | Single-D6 Catch; qualified Catch/team/retained original and observed natural edges | Recipient team, separate from initiator; UI-014/093/097 |
| ResultRoll10 | Fresh2D6 armor in a uniquely owned DamageStep, no modifier or fixed foul assists | Subject team benefits when armor holds; UI-009 self-fall and UI-015 opponent foul |
| ResultRoll46 | Linked fresh4+ Regeneration after casualty/removal/skill | Subject team; UI-054 failure/UI-068 success; removal is not final availability |
| EventRoll13 | Unique direct4+ KO recovery; exact code20 Kegs+1 at3+ | Subject team; UI-040, independently inventoried demo1 boundary faces |
| QuestionBlockDice3 | Fresh categorical type2 pool, explicit rolled indices and verified chooser/linkage | Attacker team under explicit raw-symbol policy; chooser/defender separate; UI-059 defender choice and one/two/three-die probes |

The exact roll, replacement, retained-original, skill-gate and copy contracts remain in [REPORT_CONTRACT.md](REPORT_CONTRACT.md). Existing reroll and block tests cover the admitted variants and distinguish categorical faces from applied skill outcomes. Full decision/resource legality and broader policies remain NUF-010/012/013, not a consequence of a label audit. Unknown injury/casualty/referee variants keep null odds; the separate fixed-unmodified injury model adds no binary luck score.

## Fixed numeric modifier evidence

Matching a recorded target is insufficient when a modifier can be chosen after seeing the die. GR-015 explicitly identifies Diving Tackle as such a choice. Numeric admission now accepts only identified pre-roll modifier variants, requires complete numeric source fields, and rejects unknown/effect-dependent, duplicate and post-roll evidence. The receipt includes raw holder ID, modifier/skill/effect codes and value; it does not certify full current eligibility or a counterfactual coach policy.

| Modifier namespace | Admitted family / value | Provenance |
| --- | --- | --- |
|3 OpponentTackleZone | Dodge/Pick up/Catch−1 per distinct holder | UI-023/024/093/097 and direct raw source |
|15 WeatherPouringRain | Pick up/Catch−1 | Compiled weather modifier, BB2020 weather rule, public source records |
|35 BallScatter | Catch−1 | UI-016/070 and compiled modifier |
|27/83 Titchy | Dodge+1 | UI-006/023/024 |
|27/16 TwoHeads | Dodge+1 | UI-024 |
|27/49 PrehensileTail | Dodge−1 per distinct holder | UI-023, independent raw demo10 |
|27/12 ExtraArms | Pick up/Catch+1 | Compiled skill, BB2020 trait rule, public source records |
|27/28 DivingCatch | Catch+1 | UI-097 natural1 failure/skill replacement |
|27/33 DisturbingPresence | Catch−1 per distinct holder | GR-002 and public source records |

All admitted receipts have Effect−1; unsupported weather/skills/effects retain raw evidence and unknown odds. Repeated copies of the same holder/type/skill/effect cannot double a modifier. Schema2.42/dice-only-21 requires fixedNumericModifiers for each scored numeric check and reconciles the receipt with the reported modifier vector and skills. Public missing/unknown/post-roll/value/owner/duplicate forgeries reject. Context mobility-possession-33 removes unverified declaration7 from intrinsic-trait continuity; existing value formulas and supported public results are unchanged.

## Action and step namespaces

ResultUseAction codes1–6 have paired declaration evidence: ordinary Move, Block, Blitz, Pass, Hand-off and Foul. These declarations are distinct from the executed step. UI-034 explicitly contains Action4 followed by ThrowTeamMateStep13, and its Throw Team-Mate behavior is independently displayed. The separate SequenceType7 name cannot establish ResultUseAction.Action7. The unverified code7 alias and continuity permission are removed; its raw code survives as action_unknown_7 and an unknown-code receipt. No declared action code alone grants a die, actor ownership, final consequence or useful activation.

Step names are compiled identifiers; source tags and qualified payloads still control admission. DamageStep2 is not a numeric movement die, and PlayerStep1 can contain deterministic movement, Dodge, Rush and Pick up. UI-006 reaches the real Dodge path with its proper away roster despite raw TeamId0. UI-014 separates hand-off initiator and catcher; UI-009 and UI-015 establish subject-oriented damage conventions. Unresolved ownership remains visible rather than inferred from proximity or a turn label.

## Complete public inventory

The artifact enumerates each raw source/family per file, distinguishing known, provisional/compiled-only and unscoped identities from direct conditional policy scope. Current reports separately retain actual scored/excluded/unattributed family counts. The independent18,441 fields conserve5,112 event fields plus13,329 snapshot copies. Copies/placeholders are not new independent trials; current dice coverage and causal-policy coverage remain different denominators.

| Public source | Scored policy events | Excluded policy candidates | Event + snapshot fields |
| --- | ---: | ---: | ---: |
|demo-goblins1 |160 |156 |1608 |
|demo1 |239 |104 |1839 |
|demo10 |175 |78 |1398 |
|demo11 |140 |155 |1428 |
|demo2 |158 |139 |1387 |
|demo3 |159 |78 |1427 |
|demo4 |211 |94 |1690 |
|demo5 |185 |86 |1532 |
|demo6 |189 |119 |1559 |
|demo7 |184 |162 |1742 |
|demo8 |160 |68 |1268 |
|demo9 |162 |115 |1563 |

Counts above are observed output inventories, not independent correctness or complete-support claims. New tests reconcile every raw parent count against the separate extractor and execute every supported family through positive, wrong-version and conflicting-owner probes. Thirty-seven favorable generic-D6 probes cannot promote named unsupported or source-specialized families. Unverified9/70/999 without thresholds remain visible candidates with null odds. The existing one-supported-plus100-unknown, nested/snapshot/root dice, rare critical unknown and source-count conservation regressions remain mandatory.

## Original NUF-009 acceptance audit

| Original requirement | Authoritative proof |
| --- | --- |
|Audit every promoted/provisional roll, step and action mapping | Complete enum comparison, all41 explicit contracts, paired witnesses, two provisional identities, declaration counterexample and guard corrections |
|Semantic definition, variants, rule/version, provenance and favorable perspective for supported contracts | Artifact fields and eight scoped policies; REPORT_CONTRACT plus independent UI/enum/rule references; positive/wrong-version/owner-conflict runtime probes |
|Dice and modifiers support the claimed rule | Independent exact arithmetic/paired numeric checks, fixed modifier receipt/duplicate/post-roll guards, armor/recovery/block admission and adversarial tests |
|All12 demo inventories | Source hashes and every raw family in the independent artifact; complete parent-count reconciliation and the current report family counts |
|Real verified Dodge reachable, movement not mislabeled block | UI-006/008/009 through the production decoder; proper Dodge/Rush categories and roster perspectives |
|Unresolved families visible with honest coverage |9/70 remain provisional, unknown7 remains unknown; global dice census, family buckets, one-of101 and rare-unknown regressions |
|No-threshold unknown random outcomes are not harmless |9/70/999 candidate/unknown-odds/abstention probes; randomizer candidate helper correction and pre-admission census |

The original mapping criteria and required local quality gates have closure evidence in the execution ledger. Exact pushed CI validation is recorded separately in chat. Remaining block skills, modified damage/casualty/treatment, reroll resources, current traits/roles, board/legal successors, calibrated contextual comparisons and final hosted/integrated acceptance stay with their original issue IDs. This is not completion of the analyzer or proof of an even-luck verdict.


## Schema2.48 categorical injury policy extension

The eight original frozen policy records above remain unchanged. A separately qualified ninth policy now admits a direct ResultInjuryRoll11 only with its current subject table, time-local ownership, verified own armor break, applied ordinary-block or self-fall cause and fixed unmodified injury policy. Current blocker traits exclude adaptive Mighty Blow1/2 and unknown skill/effect policies; Pro's primary rule explicitly excludes injury rerolls. Raw State1/2/3 cannot select the admission policy. Direct outcomes0/2/4 preserve the existing Stunned/KO/Casualty namespace;3 remains unsupported. The generic named-family contract still does not score every injury.

Independent11-candidate/107-step raw prefixes and four exact rational tier references, full144-face synthetic parser/scoring checks, seven source admissions and adversarial role/choice/namespace/public-schema cases are documented in [CATEGORICAL_INJURY_EVIDENCE.md](CATEGORICAL_INJURY_EVIDENCE.md). The new ordinal dice contribution has zero mean, retains null binary fields and does not price treatment, recovery, casualty effects or match impact. Original mapping acceptance remains closed; broader damage/state/context requirements remain in their original issues.


## Schema2.50 committed Mighty Blow armor scope

The original41 contracts/eight frozen policies and the separate categorical injury model remain. A new stage receipt observes exact used13/+1 `NetGameplayModifierType27=Skill` armor evidence without odds. Only a separate applied ordinary Block, current complete holder/subject policy and exact prior spend can certify no remaining modifier for its following initial injury. This does not promote generic modified armor, every use13, MightyBlow2, an empty actual modifier list, treatment or final state. Ten independent raw patterns yield one current-table injury admission and nine visible negative cases. Source roles, namespace, effect/value, freshness, source order and per-damage resource scope have independent adversarial tests; mapping acceptance remains closed while original broader damage/resource/state/context requirements remain open. See ARMOR_MODIFIER_BUDGET_EVIDENCE.md.
