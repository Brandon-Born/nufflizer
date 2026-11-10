# Versioned report contract

Updated 2026-11-10. Owning IDs: NUF-007/009/012/013/015/019/021–023. Scoped semantic evidence below does not establish contextual scoring or complete BB3 rule support.

`src/domain/nufflizer/reportSchema.ts` is the executable Zod definition of schema `2.0` and model `dice-only-11`. All report/event/team TypeScript types are inferred from it in `types.ts`; API, CLI and UI cannot silently maintain different field definitions. The shared service validates generated reports in the worker. The browser validates a received report before rendering it or enabling JSON export.

## Current model guarantees

- This model only returns `insufficient_evidence` or `partial_analysis`, with `luckierTeam: "unknown"`. A supported/comparative model requires an explicit future version and its own acceptance evidence. A malformed old/new response does not become an even verdict.
- Scored records require known team ownership, random-outcome evidence, a probability, observed result and calculation. Delta equals `(actual - probability)` and the weighted contribution uses the versioned weight table. These numeric checks do not establish the action's game-rule identity.
- Excluded records cannot supply invented success probabilities, tags or scored contributions. Unknown probability/result values remain null; an excluded record can retain a known raw threshold result without claiming its game meaning.
- IDs are unique; key moments must point to unchanged, unique scored records. Team labels agree with the match header. Coverage counts/rates, category counts, exclusion-reason counts, per-team counts, category contributions and headline contributions reconcile with the underlying evidence. Floating comparisons use relative/absolute tolerance `1e-10` for arithmetic, not a statistical-confidence cutoff.
- Fixed model weights are checked against the versioned implementation. Finite numeric values, bounded event arrays, strict object fields and recognized schema/model versions are required.

## Model dice-only-4 numeric scope

For replay version `1-4-0-0`, `ResultRoll` families 1/2/4/7 mean Rush/Dodge/Pick up/Catch. Independent BB3 playback labels and the installed enum support those identities; exact sanitized extracts are exercised through the production decoder and scorer in `tests/unit/verifiedNumericChecks.test.ts`. Dodge has its own category; Pickup and Catch share ball handling. Step 1 is a movement container, not proof that a dodge occurred. Actions 2/3 are Block/Blitz.

Except for the verified retained-original chain described below, a scored numeric check requires a fresh (`NewRoll=1`) initial roll (`Status=1`), one explicit type-0 D6, an effective `Difficulty` from 2 through 6, a binary `Outcome` consistent with the face/target, and resolved ownership. Other replay versions, missing freshness/status/target, contradictory data, multiple dice and unsupported replacements are excluded with null odds. When a base `Requirement` is present, integer modifiers must reconcile with the recorded effective target. Only Catch admits clamped natural-roll edges in this slice: UI-097 proves natural 1 fails despite +1; UI-093 proves natural 6 succeeds despite −4. Equivalent outside-range assumptions are not generalized to other families.

One full team reroll can use `1-(1-p)^2` only when a question with valid failed original D6 evidence links to an explicitly available/used team reroll and a fresh Status-2 result. Actor, explicit step/target, roll family, explicit nonnegative integer gamer, effective/base target and modifiers must match. Only a matching continuation PlayerStep can intervene: unknown messages, skill usage, declarations and turn/controller changes break that simple policy link. A same-step independently emitted initial attempt prevents adding a combined full-reroll contribution; its replacement stays excluded pending complete action grouping. UI-014 verifies a hand-off recipient Catch at 8/9, with the original question die retained.

A declined choice (Used0) can instead preserve one original attempt: the question must contain fresh Status1/NewRoll1 failed single-D6 evidence and its final Status1/NewRoll0/Outcome0 summary must repeat the exact die, family and threshold/modifiers. The strict numeric/version/ownership contracts still apply. UI-022 independently verifies this Pickup3+ failure; demo1 supplies distinct retained Pickup4+ and Catch5+ failures. Score at base odds, never reroll-adjusted odds, with originalDice, rerollQuestionId and a retained-original policy. The final source ID locates the kept summary; it does not assert new dice were rolled there. If the same initial die was already emitted in that question's source step, the kept summary stays excluded. Once a question is consumed, another NewRoll0 summary cannot score independently. Incomplete, mismatched, contradictory, interrupted and orphan summaries remain excluded. A declined choice followed by supposedly fresh dice is contradictory and excluded when linked.

This extends the dice-only-3 admission policy without changing schema2.0 or category weights; prior model reports are rejected. It does not deduplicate every possible repeated question or reconstruct all action identities. Loner/Pro/skill policies and resource accounting remain incomplete. Initial attempts can score while unmodeled replacements remain excluded; coverage is partial, not a claim that every causal action is fully modeled.

`ResultUseAction.TeamId` remains in the raw payload but is not used as ownership: all 6,342 emissions in the 27-source audit report zero, including 2,920 actors on the other initial roster. Roster evidence supplies ownership where available; unresolved membership still excludes scoring. Really Stupid (34), Foul Appearance (37), and Loner (71) have corrected names but no scored policy. At the dice-only-4 checkpoint, block, damage and referee scoring were excluded; see the current scope below. Other historical mapping labels are not newly accepted by this change. The schema stays `2.0`; changed semantics require model `dice-only-4`, so old model reports are rejected rather than silently reinterpreted.

See [playback evidence](REPLAY_UI_EVIDENCE.md), [installed enums](INSTALLED_ENUM_EVIDENCE.md), and [local corpus findings](LOCAL_REPLAY_FINDINGS.md) for provenance and limits. This model still returns only partial/insufficient evidence and never a comparative whole-match verdict.

## Model dice-only-5 block, armor and context scope

A linked QuestionBlockDice with one to three type-2 dice and explicit freshly rolled indices supplies a raw block pool. An applied selection and ResultBlockOutcome must reconcile to the same step participants without crossing a different action. A repeated Carrier snapshot does not break linkage; a new activation or different participants do. Repeated controller handoff/failed-Loner pools have no fresh indices, and selected/final result records are evidence rather than additional dice. Full team replacements and Brawler's one replaced Both Down require the corresponding choice, matching participants and unchanged retained faces. Conditional/unknown replacements remain unsupported. Chooser and attacker/defender roster teams are distinct.

The raw ranking is Attacker Down, Both Down, Push, Defender Stumbles, Defender Down. Enumerate all six faces per fresh die (Push occurs twice), select the maximum rank for attacker choice or minimum for defender choice, and retain a five-category distribution. A favorable raw opportunity is one of the two defender-down symbols under that ranking. The observed selected face, skill-adjusted options and final outcome are separately preserved and do not enter the probability calculation. This measures the pool, not the chance of actually knocking down a player through their skills, surf geometry or ball consequences.

A fresh ResultRoll|10 inside a matching DamageStep requires two explicit D6, binary result, a 2–12 base/effective target, and unique subject ownership. Empty modifier lists and pre-roll foul assists are supported. Post-roll choices, unverified skill effects, contradictory dice/targets and ambiguous owners are excluded. The favorable outcome is **armor holds**, so a self-fall break hurts the affected team and opponent damage is not credited twice. Injury, casualty and recovery chains still have no scored distribution.

Context model mobility-possession-1 only estimates a non-carrier Dodge or open-square Pickup with a verified terminal reroll policy and exact pre-roll observations. Separate team/context totals and optional per-event components reconcile in the shared schema. Dice scoring remains available when state is incomplete. This is a selected supported subset; the observed policy may only be visible after an initial failure. Do not compare team context totals as unbiased full-match estimates or use them to infer a winner. See [STATE_RECONSTRUCTION.md](STATE_RECONSTRUCTION.md).

## Model dice-only-6 recorded skill rerolls

UI-002/028/094/097 show two fresh numeric dice separated by explicit Sure Hands, Dodge or Catch usage in the same player step. A uniquely owned actor, same step/family/target/modifiers, failed initial D6 and a valid replacement are required. The original remains visible as linked evidence and the completed check contributes once under `1-(1-p)^2`. A failed replacement without a verified ending stays unsupported; UI-002's immediate recorded bounce supplies the terminal failure for Pickup. The report records the two dice, both roll locators, the skill-use locator, and zero team rerolls spent on that check. A verified full team reroll records one spent, while declining records zero. Unsupported mixtures of skill and team choices, Pro, Loner, Pass and turn-wide resource reconciliation remain open. The existing tactical model still only covers its verified team policies.

## Model dice-only-7 Regeneration

Regeneration contributes as a separate 4+ D6 check conditional on a recorded casualty and explicit skill use in the same damage step. UI-054 and UI-068 independently verify failure and success, respectively; demo UI-086 confirms success with a secondary casualty die. The affected player's roster receives `actual - 1/2` dice units before the category weight. The report links the casualty, initial removal and skill-use records; it makes no claim that the first removal determines final availability. Unsupported casualty, injury, recovery or apothecary distributions remain excluded and visible. An unlinked or stale recovery die does not contribute.

## Model dice-only-8 Apothecary evidence

A usage question can carry the original injury or casualty dice in `RollInfos`. A casualty choice carries the replacement dice in `NewRoll` and a copy of the original in `OriginalRoll`. UI-060 shows that the copied outcome can differ from the observed original, so the report keeps the usage outcome and counts the copy zero times. An exact direct original in the same damage step counts once. The replacement counts as an observed roll with unknown odds.

The linked applied decision records the subject's roster team, the recorded gamer ID, the resource used and the source IDs of the observed rolls. Linkage requires matching subject, source, cell and contiguous damage steps, with the choice gamer and removal status checked where applicable. UI-065 retains the original casualty after using the resource, UI-066 applies the replacement, and UI-064 treats an injury without a replacement roll. The decision contributes no dice score. Full injury and casualty distributions, ambiguous choices and later player availability remain unresolved.

## Model dice-only-9 roll coverage and attribution

`coverage.rollFamilies` groups roll candidates by team, source tag and optional roll type. Each candidate contributes once to scored, unscored with a known team, or unattributed. The schema checks every row against the underlying events. Conflicting declarations, roster disagreement, and overlapping roster player IDs are reported as unresolved. Turn-level inference alone cannot assign a roll to a roster. The reserved team ID `unresolved` cannot be supplied as an actual replay team.

## Model dice-only-10 Loner evidence and pre-roll movement

A matching team reroll spend, Loner skill use and fresh 4+ die in the same uniquely owned step records one team resource spent and the observed gate result. UI-007 and UI-020 independently establish success and failure. The gate remains unscored. Passing does not certify a replacement die, and failing can still consume the resource without adding a second pool.

Context model mobility-possession-2 requires an intervening successful Rush or Dodge to agree with its recorded die and target, and a move's actor to match the enclosing step. Contradictions clear reconstructed board evidence until a later checkpoint. Context contribution arithmetic is unchanged.

## Model dice-only-11 direct KO recovery

UI-040 verifies direct `ReplayStep/EventRoll` type 13 before second-half setup. A single 4+ recovery die contributes `actual - 1/2` before the injury-category weight. The accepted record requires an explicit team matching unique roster ownership, one subject check per replay step, and no modifiers. The direct shape omits die type and records `Outcome=1` for success. A face below four with omitted outcome is the verified failure shape in this family. Modified checks, unresolved ownership, duplicates and contradictory outcomes retain unknown odds. The check supplies dice luck only. Subsequent lineup availability requires separate evidence.

## Empty evidence versus measured zero

A contribution sum over no scored events is mathematically zero in JSON, but is not a measurement of even luck. UI/CLI presentation uses the number of scored records for that team/category: no records displays **Not scored** (or **No scored evidence** for a team); a measured sum of zero displays a numeric zero. The insufficient-evidence verdict always abstains. Unknown probabilities/results are null, not zero/failure.

Values are cumulative provisional **dice units**, not contextual match impact or win probabilities. Shape/count/arithmetic validation does not validate roll IDs, skill meanings, actors/beneficiaries, causal deduplication, tactical state or counterfactual consequences. Those requirements remain with the existing semantic/context backlog IDs.

## HTTP boundary

The browser bounds a successful response to 4,000,000 bytes while reading, independently of `Content-Length`. Declared oversized bodies are cancelled without reading; streamed bodies are cancelled on overflow. Error bodies are bounded to 4 KiB and only string messages from a valid error object are displayed. HTML/text errors, malformed JSON, incompatible reports, interrupted downloads, cancellation and upstream 413/429/504 statuses have explicit messages. No invalid report is rendered or exported.

HTTP callers request worker-side serialization with the same terminating deadline as parse/scoring. Oversized JSON returns `REPORT_TOO_LARGE` before copying the report to the API thread. The legacy envelope reserves its 11-byte wrapper overhead. Main-thread decoding/response construction handles only bounded JSON; a final size guard remains. CLI callers retain their larger-output path under the existing input/work/time/memory budgets. Worker heap exhaustion maps to an explicit `RESOURCE_LIMIT` response.

## Reproducible verification

`corepack pnpm verify` runs lint, typecheck, all unit suites, the real Redis quota integration, production build and browser flows sequentially. `test:e2e` prepares the worker and rebuilds the production application before starting Playwright; it cannot silently use a previous `.next` UI build. CI uses the same production build/browser command after its frozen install, audit and unit checks, without a duplicate production build.

Independent checks include deliberately inconsistent schema/model versions, totals, coverage, weights, event ownership, key-moment references and fabricated verdicts; bounded body reads and cancellation; exact worker output-size boundaries; real-BBR upload/export/filter/reset; malformed-success responses; HTML 413/504 errors; and user cancellation. See the remediation ledger for hosted quota, build and CI evidence and remaining rule, context and deployment acceptance.
