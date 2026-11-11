# Versioned report contract

Updated 2026-11-11. Owning IDs: NUF-007/009/012/013/015/019/021–023. Scoped semantic evidence below does not establish contextual scoring or complete BB3 rule support.

`src/domain/nufflizer/reportSchema.ts` is the executable Zod definition of schema `2.11` and model `dice-only-18`. All report/event/team TypeScript types are inferred from it in `types.ts`; API, CLI and UI cannot silently maintain different field definitions. The shared service validates generated reports in the worker. The browser validates a received report before rendering it or enabling JSON export.

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

## Model dice-only-12 direct questions and results

Direct `ReplayStep` questions and results appear with their original child locators. The encoded message location is absent because these are not contained in an action step. Direct referee dice stay in the roll denominator with unknown odds. Bribe questions, sent-off notices and player removals remain visible as separate records without adding a roll. This retention does not assign a referee die to the nearest player or infer a state transition.

## Model dice-only-13 damage steps

`damageSteps` lists the reported events in a single damage step when verified armor or Regeneration anchors it. Each group preserves ordered event IDs for one affected roster subject. It separates scored rolls, unscored rolls, and context records. Its subtotal reconciles with the original dice contributions and is included once in the team total.

Multiple fresh-looking armor rolls in the same damage step leave that stage unscored because freshness is ambiguous. Repeated identical removal summaries remain context records and preserve the original Regeneration linkage. The subtotal describes recorded dice in that damage step. It does not infer the preceding block, dodge or other action that caused the damage, or claim an effect on match value.

## Model dice-only-14 Kegs and KO recovery

The independently extracted installed `EBB3NetGameplayModifierType` enum names code 20 Kegs. All 18 modified direct KO records in the 12 demos contain one code-20 +1 modifier, base 4+, and effective 3+. The observed dice and outcomes agree with 3+, including successes on 3 and failures on 2. An exact matching, uniquely owned check now scores at 4/6 success odds. Other modifier shapes, missing ownership, and contradictory outcomes stay unscored.

## Empty evidence versus measured zero

A contribution sum over no scored events is mathematically zero in JSON, but is not a measurement of even luck. UI/CLI presentation uses the number of scored records for that team/category: no records displays **Not scored** (or **No scored evidence** for a team); a measured sum of zero displays a numeric zero. The insufficient-evidence verdict always abstains. Unknown probabilities/results are null, not zero/failure.

Values are cumulative provisional **dice units**, not contextual match impact or win probabilities. Shape/count/arithmetic validation does not validate roll IDs, skill meanings, actors/beneficiaries, causal deduplication, tactical state or counterfactual consequences. Those requirements remain with the existing semantic/context backlog IDs.

## HTTP boundary

The browser bounds a successful response to 4,000,000 bytes while reading, independently of `Content-Length`. Declared oversized bodies are cancelled without reading; streamed bodies are cancelled on overflow. Error bodies are bounded to 4 KiB and only string messages from a valid error object are displayed. HTML/text errors, malformed JSON, incompatible reports, interrupted downloads, cancellation and upstream 413/429/504 statuses have explicit messages. No invalid report is rendered or exported.

HTTP callers request worker-side serialization with the same terminating deadline as parse/scoring. Oversized JSON returns `REPORT_TOO_LARGE` before copying the report to the API thread. The legacy envelope reserves its 11-byte wrapper overhead. Main-thread decoding/response construction handles only bounded JSON; a final size guard remains. CLI callers retain their larger-output path under the existing input/work/time/memory budgets. Worker heap exhaustion maps to an explicit `RESOURCE_LIMIT` response.

## Reproducible verification

`corepack pnpm verify` runs lint, typecheck, all unit suites, the real Redis quota integration, production build and browser flows sequentially. `test:e2e` prepares the worker and rebuilds the production application before starting Playwright; it cannot silently use a previous `.next` UI build. CI uses the same production build/browser command after its frozen install, audit and unit checks, without a duplicate production build.

Independent checks include deliberately inconsistent schema/model versions, totals, coverage, weights, event ownership, key-moment references and fabricated verdicts; bounded body reads and cancellation; exact worker output-size boundaries; real-BBR upload/export/filter/reset; malformed-success responses; HTML 413/504 errors; and user cancellation. See the remediation ledger for hosted quota, build and CI evidence and remaining rule, context and deployment acceptance.

## Schema 2.1 movement evidence

A fresh scored Dodge or Rush, or the verified resolution of its team-reroll question, can expose an observed fall when the same player's failed move summary is immediately followed by applied self-damage and a direct failure turnover in the same replay step. Dodge and Rush damage source codes are 0 and 9 respectively. The group points to the existing damage-step evidence, ordered move outcome and turnover. Its subtotal is the original movement contribution plus the existing damage dice subtotal. Injury and casualty with unknown odds remain unscored. A removal is reported as an observed consequence. A declined reroll counts the retained original once. A spent reroll uses the verified two-attempt chance. A different actor, intervening action, ambiguous replacement or contradictory summary prevents linkage.

Mobility-possession-3 retains a corroborated ordinary stand-up and its recorded movement budget before later rolls. It reports a verified Dodge that crosses the adjacency boundary to a teammate explicitly holding the ball. This pre-roll observation and the movement-fall aftermath appear separately from the existing heuristic context contribution.

## Schema 2.2 possession and observed touchdowns

Dice-only-15 scores the terminal same-step Dodge-skill failure when the original, Dodge usage and replacement match the verified skill reroll contract and lead directly to the matching self-fall and failure turnover. The fresh pair is one check at two-attempt odds with zero team rerolls spent. Unlinked or contradictory responses remain outside this expanded contract.

Mobility-possession-4 can establish held possession after a verified ordinary move onto the recorded ball square and an immediate fresh unmodified pickup success. The later carrier roll can link back to the original pickup with actor and source order preserved. In the narrow successful end-zone move path, the report can also link the direct touchdown for that same carrier and square. That observed consequence adds no tactical or dice weight. It is independent of the pre-roll evidence used to describe possession.

## Schema 2.3 clock, pitch and Pro evidence

Mobility-possession-5 reads the observed actor roster's cumulative GameTurn for a declared ordinary carrier move into the opponent's end zone. The clock basis remains the actor roster when the active-side field is omitted. Explicit Period and TurnsPerPeriod bound the remaining scheduled turns. Missing counters and periods stay unknown. Pitch orientation requires an earlier initial standard 26×15 layout, the actor roster's explicit Side32 or Side64, an adjacent open destination, and the verified holder. Installed pitch-zone enums name these sides. Independent traversal matched 23 scoring moves across all public demos, with 15 Side32 moves to x25 and eight Side64 moves to x0.

A direct touchdown can match that same carrier's encoded move when its available coordinate fields agree. The report retains nullable recorded coordinates alongside the encoded destination. Omitted coordinates are preserved. Goal-threat observations and the observed touchdown add no numerical impact weight.

The separate Pro gate contract uses GR-025 and UI-047/087. A recorded 3+ gate has four passing D6 faces. Fresh success requires the same actor's skill50 use immediately before the gate. The kept failed gate requires its original question, matching AccuracyStep continuation, declined team reroll, unchanged die, target and actor. The report displays the observed outcome and retains it outside additive luck contributions.

## Schema 2.4 raw block evidence and context coverage

Dice-only-16 scores a verified fresh raw block pool independently of a later selection or applied result. This supersedes the final-outcome requirement in the historical dice-only-5 section. An interrupted action retains its raw distribution while selected and applied fields stay absent. A source-linked selection can be known while the applied result remains unknown. Two ambiguous fresh initial questions for the same action remain unscored. Neither later skills nor an unavailable final result changes the definition of raw-symbol opportunity.

UI-047 records an initial Skull, a successful Pro3+ gate and a one-die Push replacement, followed by a selected Push. The saved fragment contains no applied ResultBlockOutcome. The replacement requires the same attacker and defender, a certified passed gate, exactly one explicitly Pro-eligible fresh index, unchanged kept dice, and matching chooser. Its distribution enumerates that fresh die conditional on the recorded pass. Each one-die pool has a raw defender-down opportunity probability of 1/3. The gate remains outside additive scores. This does not establish full Pro policies or skill-conditioned knockdown odds.

`coverage.contextEvidence` reconciles overlapping counts over reported roll candidates: actor position, known possession, period with team-turn clock, activation identity, quantified contextual impact, and linked movement consequences. Counts describe recorded fields and supported calculations, without claiming complete state, calibrated confidence or full causal coverage. UI and CLI display the same explanation, and exported JSON retains all counts.

A known ResultNoRollSuccess without dice remains visible as deterministic evidence and adds no roll candidate. An exact contiguous non-fresh kept summary adds no second candidate only when it matches a supported linked numeric check in the same action. A different action, interrupted sequence, changed die or unsupported family is not deduplicated by this rule. Replay team order supplies the home/away labels when exactly two source teams exist; turn frequency cannot swap them.

## Schema 2.5 embedded staff-question injury evidence

Dice-only-17 retains RollInfos from QuestionKORecovery. UI-025 identifies its type11 two-D6 payload as the original Stunty injury, with6+1 giving KO. The question is not a recovery roll. Fourteen questions in the12 public demos now retain their exact raw dice, outcome code and locators as unscored injury evidence. Their probabilities and binary results remain null.

When an exact direct injury already appeared in the same uniquely owned DamageStep, the question links that source through embeddedDamageOriginalId and adds no new random outcome. Linking requires matching subject, source, action, complete dice and outcome. A different subject, action or die prevents this deduplication. Malformed and unsupported-version nested records remain inspectable without promoted odds. This does not establish injury tables, trait effects, staff policy or player availability.

## Schema 2.6 player observations and timeline navigation

The optional initialRosterName is a bounded label from the uniquely owned initial team/player key. Conflicting or unresolved ownership omits it. UI and CLI explicitly say initial roster; the label does not assert current identity after recruitment or reuse of a player ID. It does not influence scoring. The dice and context model versions stay unchanged.

The web timeline searches player IDs and available initial roster names over the full report before sorting and paging. Half and team-turn controls use observed pre-roll metadata, with a separate unknown-half option. An actor-roster scoring-attempt counter can supply the turn when the active-side counter is absent. A row can restrict the timeline to its recorded activation ID. Existing team/category/status/tag filters compose with these controls. Reset and a new upload clear every filter. Missing clocks and activations are not inferred from replay segment numbers.

## Schema 2.7 pickup, bounce and catch branches

A scored failed pickup can link its immediately following standard-ball BallStep3 and D8 ResultRoll25. Raw source and destination must be complete, adjacent and consistent with the recorded direction. Independent traversal of135 complete-coordinate records across12 demos corroborates all eight offsets. Off-pitch/partial coordinates, different balls, mismatched steps and intervening mutations withhold this branch.

A stationary Catch step at that landing can link its verified scored result, including a retained original resolved by an independently linked team-reroll decision. On failure, the next immediately adjacent step can supply another bounce; at most16 are retained. A successful catch stops the branch. Ambiguous or unsupported catch outcomes remain separate report evidence. The branch references original bounce source IDs and catch event IDs, ending at the last recorded landing.

Each per-team dice subtotal equals the existing failed-pickup contribution plus that team's linked catch contributions. The group adds no new contribution and does not combine opponents' luck under the pickup team's perspective. Catch-dependent opportunities retain their own conditional distributions. This observed chain is separate from a counterfactual possession or lost-turn value. The consequence coverage count now includes these linked pickup branches as well as movement falls and touchdowns. Dice-only-17 and mobility-possession-5 stay unchanged.

Independent examples: demo11 sequence186 has Pickup3+ on2, bounce3 to[20,8], then player9 Catch4+ on4; its same-team subtotal is−11/60. Demo3 sequence415 has Pickup6+ on5, bounce2 to[15,10], then player45 Catch6+ on6; its subtotal is11/15. Demo1 sequence61 preserves Pickup4+ on3 after declining, bounce2 to[4,5], Catch5+ on3 retained at62/0 after declining, then bounce4 to[3,5]. Its subtotal is−11/12. These values describe recorded dice, not whether the resulting action helped the match.

## Schema 2.8 current trait provenance

Numeric player Data now survives the compact board projection: Data.Id, IdPlayerTypes, InnateSkills and AcquiredSkills. Names, account data and arbitrary player fields are not copied. Each skill list is independently null when omitted or malformed; explicit empty lists are empty arrays. Duplicate/nonfinite/fractional/negative codes, unknown list children and more than64 entries withhold that list. A mismatched Data.Id or an explicit player Data.TeamId conflicting with its enclosing roster withholds the whole trait observation. The ordered XML projection preserves nested selected list shapes so malformed children cannot become a fabricated empty list.

The existing conservative pre-roll reducer can expose actorTraits and targetTraits from its exact current frame, with the checkpoint boundary already present in the contract. Actor ownership must match current roster evidence; target data is separate and does not require the actor's list to exist. Unsupported intervening mutations and a newer snapshot replace the frame. No initial roster list or future observation supplies omitted current Data. Known listed Block, Dodge, Tackle, Thick Skull and Stunty can be explained as recorded traits; eligibility and skill use still need action evidence.

UI-087 source008 board7/3 records player48 Data.Id48, type1455 and innate codes[49,55,44,77,7], with the acquired list omitted. After removal and a new purchase of ID48, board9/3 omits Data. Its traits remain unknown. The stale playback portrait is not identity evidence. Demo1's initial player1 has innate[61,63] and acquired[30,7], but later snapshots omit Data; no pre-roll trait claim is filled from that initial list. This supplies bounded provenance, not complete trait persistence, a skill-conditioned block model or an injury table. Dice-only-17 and mobility-possession-5 remain unchanged.

## Schema 2.9 recruitment evidence and current roster ownership

Recruitments records a valid EventBuyMercenary header and its uniquely selected PlayerData under TeamInducementsData/InducementsCategories/InducementsCategory/Players. Candidate and category counts are bounded. GamerId, candidate TeamId and observed roster TeamId remain separate namespaces. Only the first following checkpoint can confirm unique membership with matching explicit team and noncontradictory type/skill data. An intervening purchase/removal of the same instance ID prevents binding the older event. Missing/ambiguous candidates, incompatible observations and incomplete lists remain unknown. Source/removal/replacement links and counts reconcile with retained non-roll context records. Source IDs are provenance references; a removal record is not a new dice outcome or proof of every subsequent availability transition.

Source008 UI-087 selects type1455 for instance48, with innate[7,44,49,55,77], then records removal and a new purchase of type1121 with innate[25,44,50,54,17]. Board7/3 and9/3 independently place48 on roster1; the first explicitly corroborates type1455, while the second omits current Data. The acquired list is unknown in both candidate records. The selected replacement data is now available separately from current snapshot traits; it is not carried into current skill eligibility.

Dice-only-18 admits ownership from a fresh, valid, unique pre-roll roster for an actor missing from the initial roster. This can replace absent or weaker turn-inferred ownership, but explicit event conflicts, ambiguous IDs and initial-roster contradictions remain unresolved. Future snapshots and unverified intervening mutations cannot supply this proof. The numeric roll contract still applies independently, and resolved ownership alone does not establish a tactical continuation policy. Context model mobility-possession-5 is unchanged.

## Schema 2.10 confirmed activation losses

GR-003 and UI-099 distinguish a player losing an ordinary Block activation from the team turn ending. The implemented path requires an explicit ordinary Block declaration (Action2, Skill0), the opposing target's Foul Appearance use, a fresh2+ D6 failure on1, and an immediately following different teammate's declaration. Ordered before/after checkpoints must agree on phase, active roster, cumulative turn and unchanged actor cell. Before-state CanAct must be true; after-state must not contradict a spent activation. A new team turn, reroll choice, intervening unknown message, same actor, conflicting owner or contradictory die withholds this confirmation. Blitz and special-action variants remain outside this slice.

The report links the original declaration, skill-use, failed-gate and following-activation sources. The gate retains unknown odds and zero contribution; the observed loss is not priced as a Block value. Source008 purchase records and current roster traits remain separate from this action-specific skill-use proof.

Mobility-possession-6 applies the confirmed spent status only at or after the following declaration, never to the failed gate's pre-state. The current frame can then exclude that actor from later useful standing-move counts in the same recorded team turn. Explicit renewed availability, changed cell/clock/period/phase/active side, missing membership or unknown mutation clears the derived status. Snapshots remain immutable and their omitted flags remain null. Prefix-only skill/gate recognition does not depend on later confirmation.

The exact UI-099 numeric records show away actors42 and44 failing separately, with home target10 owning the skill, followed by actors44 and43 in the same team turn8. Its source sequences254–257 and boards304–307 are replayed as a minimal ordered fragment with deliberately renumbered fragment locators; unrecorded moves are not invented. A separate synthetic complete-state continuation gives a later failed2+ Dodge one remaining useful teammate rather than two:−5/6 versus−5/3 context units. This tests availability arithmetic, not a calibrated estimate of the earlier lost Block's match value.


## Schema 2.11 activation completion and mental aftermath

Context model mobility-possession-7 adds activationEnd evidence on the confirming following declaration. It records the earlier actor/declaration, same-team clock, current cell and either the last verified Move outcome or the terminal trait skill/roll/effect and explicit reroll-policy sources. Source links are ordered and reconciled by the shared report schema. endedActivationSourceIds can reference these confirmations as well as the existing Foul Appearance loss evidence; a confirmation affects only its own prefix and later frames. No-roll declarations stay outside the roll denominator. Context consequence coverage counts a terminal trait's referenced roll once; ordinary completion adds no random outcome.

The terminal policies are fresh_final, kept_original and team_loner_replacement. The last requires the separate passed4+ Loner gate and matching skill44 source; it does not equate the original and replacement dice or erase the resource spend. Other Loner thresholds/failures and alternative skill/choice chains stay unsupported. The mental trait's odds remain unknown and it contributes zero dice/context units. Known failed outcome and observed activation/tackle-zone loss are separate from that unknown expectation. UI/CLI share these explanations; JSON retains all linked context sources. Dice model dice-only-18 is unchanged.

Ordinary Move completion overrides the known stale CanAct1 availability flag only after a different teammate starts acting following verified movement. It preserves position and tackle zone. The mental-trait branch derives unavailable/no-tackle-zone state only from a matched terminal policy, provider31/51 effect44 and corroborating ordered boards. These are bounded same-turn contracts; broad action completion, special reactivation and cross-turn effect expiry remain open. Public-demo numeric extracts and source hashes are reproducible, while the complete-state UI-007 continuation is explicitly synthetic.
