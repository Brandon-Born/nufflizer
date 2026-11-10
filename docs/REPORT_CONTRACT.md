# Versioned report contract

Updated 2026-11-10. Owning IDs: NUF-007/009/012/013/015/019/021–023. Scoped semantic evidence below does not establish contextual scoring or complete BB3 rule support.

`src/domain/nufflizer/reportSchema.ts` is the executable Zod definition of schema `2.0` and model `dice-only-3`. All report/event/team TypeScript types are inferred from it in `types.ts`; API, CLI and UI cannot silently maintain different field definitions. The shared service validates generated reports in the worker. The browser validates a received report before rendering it or enabling JSON export.

## Current model guarantees

- This model only returns `insufficient_evidence` or `partial_analysis`, with `luckierTeam: "unknown"`. A supported/comparative model requires an explicit future version and its own acceptance evidence. A malformed old/new response does not become an even verdict.
- Scored records require known team ownership, random-outcome evidence, a probability, observed result and calculation. Delta equals `(actual - probability)` and the weighted contribution uses the versioned weight table. These numeric checks do not establish the action's game-rule identity.
- Excluded records cannot supply invented success probabilities, tags or scored contributions. Unknown probability/result values remain null; an excluded record can retain a known raw threshold result without claiming its game meaning.
- IDs are unique; key moments must point to unchanged, unique scored records. Team labels agree with the match header. Coverage counts/rates, category counts, exclusion-reason counts, per-team counts, category contributions and headline contributions reconcile with the underlying evidence. Floating comparisons use relative/absolute tolerance `1e-10` for arithmetic, not a statistical-confidence cutoff.
- Fixed model weights are checked against the versioned implementation. Finite numeric values, bounded event arrays, strict object fields and recognized schema/model versions are required.

## Model dice-only-3 numeric scope

For replay version `1-4-0-0`, `ResultRoll` families 1/2/4/7 mean Rush/Dodge/Pick up/Catch. Independent BB3 playback labels and the installed enum support those identities; exact sanitized extracts are exercised through the production decoder and scorer in `tests/unit/verifiedNumericChecks.test.ts`. Dodge has its own category; Pickup and Catch share ball handling. Step 1 is a movement container, not proof that a dodge occurred. Actions 2/3 are Block/Blitz.

A scored numeric check requires a fresh (`NewRoll=1`) initial roll (`Status=1`), one explicit type-0 D6, an effective `Difficulty` from 2 through 6, a binary `Outcome` consistent with the face/target, and resolved ownership. Other replay versions, missing freshness/status/target, contradictory data, multiple dice and unsupported replacements are excluded with null odds. When a base `Requirement` is present, integer modifiers must reconcile with the recorded effective target. Only Catch admits clamped natural-roll edges in this slice: UI-097 proves natural 1 fails despite +1; UI-093 proves natural 6 succeeds despite −4. Equivalent outside-range assumptions are not generalized to other families.

One full team reroll can use `1-(1-p)^2` only when a question with valid failed original D6 evidence links to an explicitly available/used team reroll and a fresh Status-2 result. Actor, step, target, roll family, gamer, effective/base target and modifiers must match. Skill usage or a fresh action declaration breaks that simple policy link. UI-014 verifies a hand-off recipient Catch at 8/9, with the original question die retained. Loner/Pro/skill policies and resource accounting remain incomplete. Initial attempts can score while unmodeled replacements remain excluded; coverage is partial, not a claim that every causal action is fully modeled.

`ResultUseAction.TeamId` remains in the raw payload but is not used as ownership: all 6,342 emissions in the 27-source audit report zero, including 2,920 actors on the other initial roster. Roster evidence supplies ownership where available; unresolved membership still excludes scoring. Really Stupid (34), Foul Appearance (37), and Loner (71) have corrected names but no scored policy. Block, damage and referee scoring remain excluded. Other historical mapping labels are not newly accepted by this change. The schema stays `2.0`; changed semantics require model `dice-only-3`, so old model reports are rejected rather than silently reinterpreted.

See [playback evidence](REPLAY_UI_EVIDENCE.md), [installed enums](INSTALLED_ENUM_EVIDENCE.md), and [local corpus findings](LOCAL_REPLAY_FINDINGS.md) for provenance and limits. This model still returns only partial/insufficient evidence and never a comparative whole-match verdict.

## Empty evidence versus measured zero

A contribution sum over no scored events is mathematically zero in JSON, but is not a measurement of even luck. UI/CLI presentation uses the number of scored records for that team/category: no records displays **Not scored** (or **No scored evidence** for a team); a measured sum of zero displays a numeric zero. The insufficient-evidence verdict always abstains. Unknown probabilities/results are null, not zero/failure.

Values are cumulative provisional **dice units**, not contextual match impact or win probabilities. Shape/count/arithmetic validation does not validate roll IDs, skill meanings, actors/beneficiaries, causal deduplication, tactical state or counterfactual consequences. Those requirements remain with the existing semantic/context backlog IDs.

## HTTP boundary

The browser bounds a successful response to 4,000,000 bytes while reading, independently of `Content-Length`. Declared oversized bodies are cancelled without reading; streamed bodies are cancelled on overflow. Error bodies are bounded to 4 KiB and only string messages from a valid error object are displayed. HTML/text errors, malformed JSON, incompatible reports, interrupted downloads, cancellation and upstream 413/429/504 statuses have explicit messages. No invalid report is rendered or exported.

HTTP callers request worker-side serialization with the same terminating deadline as parse/scoring. Oversized JSON returns `REPORT_TOO_LARGE` before copying the report to the API thread. The legacy envelope reserves its 11-byte wrapper overhead. Main-thread decoding/response construction handles only bounded JSON; a final size guard remains. CLI callers retain their larger-output path under the existing input/work/time/memory budgets. Worker heap exhaustion maps to an explicit `RESOURCE_LIMIT` response.

## Reproducible verification

`corepack pnpm verify` runs lint, typecheck, all unit suites, production build and browser flows sequentially. `test:e2e` prepares the worker and rebuilds the production application before starting Playwright; it cannot silently use a previous `.next` UI build. CI uses the same production build/browser command after its frozen install, audit and unit checks, without a duplicate production build.

Independent checks include deliberately inconsistent schema/model versions, totals, coverage, weights, event ownership, key-moment references and fabricated verdicts; bounded body reads and cancellation; exact worker output-size boundaries; real-BBR upload/export/filter/reset; malformed-success responses; HTML 413/504 errors; and user cancellation. Deployment-wide quotas, Vercel deployment acceptance, complete semantic/context goldens and committed CI evidence remain open.
