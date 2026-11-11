# Nufflizier adversarial remediation backlog

Created: 2026-11-09. Reviewed baseline: `b06d50e9fa2b42b821f4f8b30ef3894c10f588ca`.

This is the authoritative implementation backlog for the November 2026 review and the requested context-sensitive luck analyzer. Read [AGENTS.md](../AGENTS.md), [PROJECT_PLAN.md](PROJECT_PLAN.md), and the two execution logs first. The February roll-family promotion order is superseded. **Eleven issues have closure evidence; the full analyzer is not complete. See the ledger and current implementation record.**

## Product outcome

A user uploads a BB3 `.xml` or `.bbr` replay and receives a defensible account of dice luck and its match consequences. A failed 2+ dodge with one applicable full reroll has a 1/36 failure probability. Its impact depends on what the failure costs: useful activations, possession, scoring opportunities, player availability, and remaining time. A final optional block can matter little; a final action deciding the match can matter enormously.

Preserve one-shot processing, no required replay persistence, pure domain logic, shared API/CLI calculations, sanitized fixtures, and the existing architecture boundaries. New analysis belongs in the Nufflizier pipeline, not the legacy coaching stack. Do not replace missing evidence with an LLM guess or invented rule mappings.

## Instructions for the implementing agent

1. Inspect the current tree and reproduce the issue before editing. The observations below describe the reviewed commit, not every future checkout.
2. Work on one coherent issue or dependency group at a time. The ledger is the status source of truth: `open`, `in_progress`, `blocked`, or `done`. Record evidence blockers precisely and continue independent work.
3. Add regression tests with independently derived expectations for changed parser, probability, attribution, and scoring behavior. A snapshot of current output is not a correctness oracle. Never make a test green by silently weakening a requirement or relabeling the current behavior as correct.
4. Preserve `NUF-001` through `NUF-028` permanently. Add newly discovered problems under the next unused ID; do not renumber, delete, or silently absorb unresolved work. Splitting an item requires linked child IDs and retention of all acceptance criteria.
5. A completed item needs all acceptance criteria satisfied, implementation/test paths, validation commands and results, and a commit reference when one exists. Use the evidence/notes column to link the relevant implementation-log entry. A plan, skipped test, exclusion, or unsupported family is not completed support.
6. Run focused tests while implementing. Before completing a significant change run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, and applicable `corepack pnpm test:e2e`. Run build and browser-server checks sequentially. Include legacy checks when shared parsing or the legacy boundary changes.
7. Update this ledger and `PROJECT_PLAN.md`; append migration impact to `CONVERSION_LOG.md` and execution evidence to `IMPLEMENTATION_LOG.md`. Do not rewrite historical log entries. Update semantic documentation whenever an assumption changes.
8. Gather missing evidence from available sanitized fixtures first. If controlled game captures or deployed-environment access are unavailable, record the exact missing case and its effect on support. Do not claim calibrated win probabilities, production safety, or complete coverage without the corresponding evidence.

Execution note (2026-11-09): safety/report mitigation work proceeded where independent of missing semantic evidence. An exclusion or an abstention is not completed block/injury/context support. Dependencies remain acceptance requirements.

Local corpus evidence (2026-11-09): the user supplied 27 additional Git-ignored replays. [LOCAL_REPLAY_FINDINGS.md](LOCAL_REPLAY_FINDINGS.md) records 35,121 raw steps, 41 message/type pairs and counterexamples for disputed move/roll labels. NUF-009 remains in progress: aggregate shape/co-occurrence is investigation evidence, not completed semantic acceptance. One source exceeds the product decoded-size cap; inspection used an explicit offline-only cap.

UI-paired evidence (2026-11-09): [REPLAY_UI_EVIDENCE.md](REPLAY_UI_EVIDENCE.md) adds 96 observed cases / 398 verified step records plus 26 top-level event records across twenty-two saved sources (including one repository demo), with direct correspondences for 41 roll families. NUF-009/012/013 remain incomplete. Failed Loner and controller handoff can repeat block pools without fresh dice; Brawler can replace one die while retaining another; Wrestle changes resolution without new dice and can belong to the defender; pass Outcome 0 conflates fumble/inaccurate/wildly inaccurate; Secondary casualty pairs now include Head Injury, Broken Arm and Smashed Knee; Decay and niggling Injury use distinct casualty modifiers; Frenzy creates a separate attack; skill owner, initiator, roller and damage subject are distinct roles. Apothecary choice questions can transform the original casualty's Outcome field. Successful explosion/hit checks can harm the named subject. Successful interference can be followed by a failed catch; removal can precede successful Regeneration in the same step. The completed hotseat experiment generated no replay export, so its observations are not linked to raw mappings. Source020 adds a prayer/effect pair, a Block/Horns chain and independently displayed Extra Time/home turn20. Its oversized XML requires the explicit offline32MiB verifier option. UI-085 separately confirms an offered and used Dump Off reaction, an accurate defender pass, a successful teammate catch and the resumed attacker block; the earlier UI-083 decision remains unconfirmed. The [in-game skill reference](GAME_SKILL_REFERENCE.md) adds25 separately recorded tooltip rule descriptions. A separate [installed-image extraction](INSTALLED_ENUM_EVIDENCE.md) now preserves82 gameplay enum tables /1,428 explicit name-value entries with hash/offset provenance; naming evidence is substantially stronger, while behavior and namespace/version linkage remain acceptance work.

Controlled follow-up (2026-11-10): [HOTSEAT_EXPERIMENTS.md](HOTSEAT_EXPERIMENTS.md) records a live custom-team match with Bribe1 Failure followed by a second selected Bribe4 Success for the same ejection, neutral Argue5, exact bribe consumption and a direct Stunty Badly Hurt/apothecary/No Injury branch. No export/raw linkage yet exists for this match, so paired fixture counts and issue statuses are unchanged. Natural1 Argue and complete referee/state policies remain open.

The match later completed normally0–0 with Replay/Download disabled and no new local replay (28 files including the imported demo). HS-011–014 add kickoff/prayer, on-pitch KO→Stunned apothecary mitigation and Treacherous Trapdoor success/failure behavior. The trapdoor1 offered a team reroll; keeping it removed the player, directly rolled injury[1,3] Stunned and left the turn active. A separate referee send-off has no observed argument die and cannot count as Argue1. These remain UI-only observations; mine existing source-linked cases for numeric acceptance.

Source008 follow-up adds UI-087/088: failed Pro1 followed by repeated Chainsaw1 results (NewRoll0), self-damage and defender-owned Block. A separate raw purchase/remove/purchase chain reuses mercenary ID48 while later BoardState omits Data; playback retains the earlier portrait despite later Chainsaw/Pro behavior. See REPLAY_UI_EVIDENCE for locators and limits. This is a NUF-008/013/016 reconstruction counterexample, not a solved omission policy. At that source008 checkpoint, nine local sources still lacked positive fixtures; source018 reduced the count to eight, source011 to seven and source025 to six.

Suggested sequential order: **001 → 004 → 005 → 006 → 026 → 002 → 003 → 007 → 008 → 009 → 013 → 012 → 010 → 011 → 014 → 015 → 016 → 017 → 018 → 019 → 020 → 021 → 023 → 024 → 025 → 022 → 027 → 028**. Tests and documentation accompany each item; 022 and 027 are final reconciliation, not permission to postpone them.

## Ledger

P1 means a trust, safety, or core-product blocker. P2 means required reporting/operational work; it still belongs in the final acceptance gate. Dependencies are issue suffixes below and refer to implementation completion unless a task explicitly permits an initial investigation first.

| ID | Priority | Work item | Dependencies | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| NUF-001 | P1 | Preserve review reproductions and independent reference cases | None | done | Minimal raw fragments, baseline/current corpus inventory, independent arithmetic tests and runnable contextual seed probes; missing rule evidence explicitly owned by NUF-009; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-002 | P1 | XML document root and formatting invariance | 001 | done | Ordered XML parsing; declaration/comment/CRLF/format/empty-element invariance; malformed inner messages reject visibly; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-003 | P1 | Replay structure and boundary validation | 001, 002 | done | Bounded Zod event/envelope validation; seven invalid-input cases agree across HTTP and CLI; no input-error 500; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-004 | P1 | Dependency advisories and XML entity handling | None | done | Patched framework/parser/validation + transitive dependencies; fresh production audit: zero advisories; both XML parser guards tested; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-005 | P1 | Bound request reading and decompression | 001 | done | Stream, zlib-output, message, depth/node/event and file caps; boundary/false-length/multipart regressions; all 12 demos parse; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-006 | P1 | Enforce analysis budgets and cancellation | 005 | done | Terminating worker deadline/cancellation, parent responsiveness, cleanup/concurrency and local production tracing/browser checks; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-007 | P1 | Exact, bounded probability and outcome contracts | 003 | done | Bounded verified single-D6 and subject-oriented 2D6 checks; independent enumeration, die/target bounds and contradiction rejection. Block/reroll policy completion remains separately tracked. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-008 | P1 | Preserve ordered sequences, actions, and state transitions | 002, 003 | done | Encoded and direct records retain ordered locators, including zero-risk moves and direct removals. Clock insertion, unrelated adjacent actions, carrier clearing and unlinked evidence are covered. Reconstructing game state from the records remains NUF-016. [record](IMPLEMENTATION_LOG.md#2026-11-10---direct-questions-results-and-ordered-movement) |
| NUF-009 | P1 | Revalidate roll, step, and action semantics | 001, 008 | in_progress | Scoped NetGameplay labels and raw counts across 12 demos; 21/30 are referee families, 42/70 are Land/Throw a Rock. Verified numeric/block-symbol/armor scope; held-out and broader rule acceptance remain. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-010 | P1 | Real block pools, choices, skills, and outcomes | 007, 009, 012, 013 | in_progress | Fresh raw block distributions with optional linked selection/applied outcome, Brawler and conditional verified Pro indices, and no duplicate Loner/controller pools. Skill-conditioned tactical distributions and conditional policies remain. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-011 | P1 | Armor, injury, casualty, and recovery chains | 007, 009, 013 | in_progress | Subject-oriented armor and scoped Regeneration and direct KO recovery at 4+ or 3+ with one verified Kegs modifier. Original self-damage is negative. Apothecary original/replacement dice and verified decisions are retained. Complete injury/casualty tables, other mitigation and final availability remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---hosted-replay-acceptance-and-conditional-recovery) |
| NUF-012 | P1 | Action-linked rerolls and resource consumption | 007, 008, 009, 013 | in_progress | Verified team rerolls, kept originals and Dodge/Catch/Sure Hands. Terminal Dodge-skill failures use one two-attempt result. Source-linked Pro 3+ gates retain observed pass/fail and zero team spend. Linked Loner4+ gates show observed success/failure and one team resource spent, separately from replacement dice. Mixed choices and turn-wide reconciliation remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---skill-rerolls-and-ordered-snapshot-projection) |
| NUF-013 | P1 | Actor, subject, controller, and beneficiary attribution | 008, 009 | in_progress | Separate block attacker/defender/chooser and armor subject teams; player-50 negative self-damage regression. Roster conflicts and overlapping IDs are routed to unresolved coverage. Current-snapshot numeric trait lists preserve actor/target roles and clear on omitted Data after recruitment/ID reuse. Selected purchase records bind to their first following roster and retain replacement/removal sources. Fresh current membership supports unnamed new actors without resolving explicit/initial conflicts. Complete cross-snapshot identity/trait persistence and additional role policies remain. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-014 | P1 | Honest observed-outcome and attribution coverage | 009, 010, 011, 012, 013 | in_progress | Linked block selections and repeated pools are non-roll evidence; Raw direct recovery, embedded Apothecary dice and staff-question injury dice are visible. Linked decisions and repeated originals are excluded from the roll denominator. Per-team/source-family counts reconcile scored, unscored and unattributed rolls. Broader causal deduplication and reason-specific malformed accounting remain. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-015 | P1 | Insufficient-evidence and partial-analysis verdicts | 003, 014 | in_progress | Zero evidence abstains; partial status/unknown odds shared across surfaces; supported-analysis/even prerequisites await semantic completion; [record](IMPLEMENTATION_LOG.md#2026-11-09---report-contracts-and-independent-engineering) |
| NUF-016 | P1 | Reconstruct board, possession, activations, and game clock | 008, 009, 010, 011, 012, 013 | in_progress | Ordered checkpoints advance verified moves, declarations, an ordinary stand-up and a fresh successful pickup. Held-out replay evidence preserves activation, actor position, possession and the clock where observed. UI-099 confirms two Foul Appearance activation losses with continued same-team play. Public-demo ordinary Move completion and terminal mental-trait chains derive distinct same-turn availability effects. Current observed Confused effects preserve suppression across turns, with explicit next-activation end/test/reapplication and failed-Loner4+ original retention. Later same-turn availability can exclude those actors without treating omissions as a universal false flag. Other mutation, clock, recovery and useful-action policies remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---held-out-movement-context-and-fallout) |
| NUF-017 | P1 | Explainable pre-roll contextual value model | 007, 016 | in_progress | Mobility-possession-8 adds current observed suppression and source-confirmed spent activations to the recorded actor-team clocks and attempted scoring moves at both end zones to the scoped Pickup and Dodge evidence. Synthetic safe/exposed and early/late estimates are tested. Quantified scoring threats and numeric context on held-out replays remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---held-out-movement-context-and-fallout) |
| NUF-018 | P1 | Causal action accounting without double counting | 010, 011, 012, 017 | in_progress | Fixed-policy zero-mean arithmetic and duplicate-summary invariance. Scoped fresh, team-reroll and Dodge-skill failures link to self-damage and observed turnovers with one reconciled dice subtotal. A linked successful carrier move can show an observed touchdown. Failed pickups now link scoped bounces and catches with existing dice subtotals by team. Broader ball-outcome branches and tactical accounting remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---held-out-movement-context-and-fallout) |
| NUF-019 | P1 | Additive impact totals and calibrated interpretation | 014, 015, 018 | in_progress | Separate additive dice and scoped context totals with checked event/category/team conservation. Full coverage, held-out calibration and supported verdict remain. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-020 | P2 | Full-event filters and truthful timeline navigation | 008, 016, 019 | in_progress | Full-event player/initial-roster-name, half and team-turn filters, observed activation inspection, bounded paging and full reset are implemented. Initial names remain explicitly historical. Closure still depends on NUF-016/019 state and impact acceptance. [checkpoint](IMPLEMENTATION_LOG.md#2026-11-10---block-armor-context-and-shared-quota-checkpoint) |
| NUF-021 | P2 | Shared report contract and plain-language explanations | 015, 019, 020 | in_progress | Shared schema 2.10 retains partial touchdown coordinates, conditional Pro replacement pools and reconciled context-evidence counts. UI and CLI explain observed scoring attempts, final-turn clocks and movement consequences. Broader counterfactual and acceptance cases remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---held-out-movement-context-and-fallout) |
| NUF-022 | P1 | Independent golden corpus and meaningful browser coverage | 001, 021, 023, 024, 025, 026 | in_progress | Independent raw evidence includes full Rush fallout, Dodge carrier adjacency, stand-up followed by a Dodge, a late winning touchdown with no dice, and a verified pickup-to-scoring Rush. Twelve-demo direct-result reconciliation and synthetic context goldens remain covered. Held-out quantified context and integrated cases remain. [record](IMPLEMENTATION_LOG.md#2026-11-10---held-out-movement-context-and-fallout) |
| NUF-023 | P2 | Vercel request/response limits and upload failures | 005, 006, 021 | in_progress | Hosted checks pass: app and upstream boundaries, typed timeout, and two large real demos with 0.92–1.10 MB reports after parser fixes. Remains open for the NUF-021 integration dependency. [record](IMPLEMENTATION_LOG.md#2026-11-10---hosted-replay-acceptance-and-conditional-recovery) |
| NUF-024 | P2 | Deployment-wide abuse controls | 004, 005, 006 | done | Real Redis two-handler TTL, spoofing and fail-closed tests pass. Independent leases forced hosted 503; the shared window forced 429 despite forged forwarding headers. Temporary Preview store expires after 72 hours; production requires its own shared configuration. [record](IMPLEMENTATION_LOG.md#2026-11-10---hosted-quota-and-real-replay-timeout) |
| NUF-025 | P2 | Legacy endpoint retirement/default gate | 003, 004, 005, 006 | done | Default/invalid config disabled, explicit opt-in hardened; 410 replacement + deprecation/HTTP-date sunset; tests/docs agree; [record](IMPLEMENTATION_LOG.md#2026-11-09---safe-ingestion-and-truthful-report-remediation) |
| NUF-026 | P2 | Frozen installs and reproducible CI | None | done | Restored CI passes fresh frozen install, dependency audit, lint/types, unit/Redis checks and production browser flows on d669cd5. The lockfile rejects a deliberate manifest mismatch. [record](IMPLEMENTATION_LOG.md#2026-11-10---skill-rerolls-and-ordered-snapshot-projection) |
| NUF-027 | P2 | Reconcile product claims and evidence documentation | 009, 019, 021, 022, 023, 024, 025 | in_progress | Active copy corrected and historical gates marked non-authoritative; final rule/context/deployment evidence reconciliation depends on open predecessors; [record](IMPLEMENTATION_LOG.md#2026-11-09---report-contracts-and-independent-engineering) |
| NUF-028 | P1 | Integrated adversarial and product acceptance gate | 001–027 | open | Open. Independent rule and context gates and final integrated acceptance remain. Scoped shared abuse controls, committed CI and isolated deployments have separate evidence in the implementation log. |

## Review evidence and reproduction seeds

These are local observations from 2026-11-09, not claims about a deployed service. Extracted turn numbers below are the old parser's global counters, not validated half/team-turn labels. Do not assume current numeric roll labels are authoritative.

| Evidence | Observed baseline result | Responsible issues |
| --- | --- | --- |
| Analyze all 12 `demo-replays/*.bbr` files | Zero scored dodges in every fixture | 009, 010, 014 |
| `demo1.bbr` | 168 scored events; 94.4% roll-candidate coverage; all 81 `ResultBlockRoll` and 18 `ResultInjuryRoll` records excluded | 009–011, 014 |
| `demo1.bbr`, extracted turn 6 | Player 42's reroll changes player 37's earlier check; player 42's final rerolled result has no reroll adjustment | 008, 012 |
| `demo1.bbr`, extracted turn 12, player 50 | Failed movement followed by own armor break/removal; own team receives +0.278 armor luck | 011, 013, 018 |
| Add an XML declaration to decoded `demo1.bbr` | Root becomes `?xml`; no teams/report events; even verdict | 002, 003, 015 |
| Replace adjacent `><` with `>\n<` in decoded `demo1.bbr` | Scored-event count falls from 168 to zero | 002, 008 |
| Upload `<hello>world</hello>` as `.xml` | HTTP 200 with an even verdict | 003, 015 |
| Supported `ResultRoll` with threshold/outcome, no dice | HTTP 500: probability dice missing | 003, 007 |
| One supported success plus 100 unknown roll-family events | 100% roll-candidate coverage and decisive verdict | 014, 015, 019 |
| Same failed 2+ pickup at event position 1 versus 10 | Same −0.917 event contribution | 016–018 |
| One versus ten identical failed 2+ pickups | Same −83.3 team score | 019 |
| Multi-die ball-handling `[2,2]`, target 4+, no outcome | Probability uses any-die success, actual result uses sum and reports success | 007 |
| `demo1.bbr`, ball-handling UI filter | Four scored events exist, none in global top 15, so filter returns no rows | 020 |
| `tests/fixtures/replays/sample-basic.xml` | Zero scored events; existing API and browser smoke tests still pass | 001, 022 |

Run this bounded, read-only probe from the repository root to rediscover the parser/report defects:

```sh
node --import tsx - <<'NODE'
const fs = require('node:fs');
const { decodeReplayInput } = require('./src/domain/replay/decodeReplay.ts');
const { analyzeNufflizerInput } = require('./src/server/services/analyzeNufflizer.ts');
const xml = decodeReplayInput(fs.readFileSync('demo-replays/demo1.bbr', 'utf8')).xml;
for (const [name, input] of [
  ['original', xml],
  ['declaration', '<?xml version="1.0" encoding="utf-8"?>' + xml],
  ['whitespace', xml.replaceAll('><', '>\n<')],
  ['not-a-replay', '<hello>world</hello>'],
  ['smoke-fixture', fs.readFileSync('tests/fixtures/replays/sample-basic.xml', 'utf8')]
]) {
  try {
    const r = analyzeNufflizerInput(input);
    console.log(name, JSON.stringify({
      verdict: r.verdict, coverage: r.coverage, eventCount: r.events.length
    }));
  } catch (error) {
    console.log(name, error.message);
  }
}
NODE
```

For API probes, construct a `FormData` with a `File` named `replay.xml` under field `replay` and invoke `POST` from `src/app/api/nufflizier/analyze/route.ts` with a `Request`. Encode structured `MessageData` twice with base64, as the existing fixtures do. For state/scoring probes, use a minimal two-team `ReplayModel` with explicit ownership and independently stated expected results. Preserve initial roll data in questions when extracting minimal fixtures. Do not use expensive denial-of-service payloads against a live service; resource tests must be bounded and isolated.

Review validation: lint, typecheck, 79 tests in 25 files, production build, and one browser smoke test passed. Those passes did not establish semantic correctness. Browser validation required a temporary Playwright download and permission to bind a local test server; `/tmp` artifacts are not durable evidence or required dependencies. The production dependency audit reported 44 advisories (4 critical, 20 high, 16 moderate, 4 low); refresh it and assess reachability rather than treating that count as 44 confirmed exploits.

## Work packets

### NUF-001 — Preserve review reproductions and independent reference cases

**Find:** `tests/unit/nufflizier*.test.ts`, `tests/unit/replayImplementationBaseline.test.ts`, `tests/fixtures`, `demo-replays`, and the evidence table above.

**Work:** Create small sanitized reproduction cases for each confirmed defect. Establish an annotation format containing source fixture/sequence, actor and subject, action, original/replacement dice, final result, consequence facts, and why the expected interpretation is justified. Separate raw replay facts, independently verified rules, and unresolved hypotheses.

**Acceptance:** Every review observation has a runnable probe or regression case and an owning ID; annotations do not derive expectations by calling the scorer being tested. Record a corpus inventory and baseline before semantic rewrites. Capture at least the block pool, reroll mislink, self-damage, declaration/whitespace, junk XML, and zero-event smoke cases. Missing independent rule evidence is explicitly assigned to NUF-009, not invented. Deliver fixtures/harness and provenance; promote each defect probe into a passing regression with its fix rather than leaving permanent skipped tests.

### NUF-002 — XML document root and formatting invariance

**Find:** `parseXml.ts` root selection and `extractStructuredTurns.ts` token/message regexes.

**Work:** Identify the actual supported document element, ignoring XML declarations/comments. Extract messages using XML structure with document order preserved. Whitespace, normal attribute variation, and equivalent empty-element syntax must not change gameplay meaning. Preserve outer sequence boundaries needed by NUF-008.

**Acceptance:** Original, declaration-prefixed, CRLF, and pretty-printed variants of the same replay yield equivalent teams, ordered actions, probabilities, and scores, ignoring generated timestamps. Malformed XML is rejected. Test multiple supported root shapes and explicitly reject unsupported ones. Inner-message parse failures are counted/disclosed, not silently skipped.

### NUF-003 — Replay structure and boundary validation

**Find:** `parseXml.ts`, `analyzeNufflizer.ts`, API route, `src/cli/nufflizier.ts`.

**Work:** Add bounded Zod validation for the replay envelope and decoded event contracts, not just a nonempty string. Define required team IDs, valid numeric fields, legal structures, duplicate handling, replay-version support, and typed validation errors. Distinguish an invalid file from a recognizable but incomplete/unsupported replay.

**Acceptance:** Junk XML, missing dice, malformed inner base64/XML, invalid numbers, missing/duplicate teams, and unsupported versions have deterministic documented outcomes across API and CLI. User input errors do not become HTTP 500. Unsupported partial content remains visible for coverage. Limits apply through service/CLI entry points as well as HTTP; NUF-015 provides the final partial-report presentation.

### NUF-004 — Dependency advisories and XML entity handling

**Find:** `package.json`, `pnpm-lock.yaml`, both `XMLParser` configurations, `.github/workflows/ci.yml`.

**Work:** Refresh `corepack pnpm audit --prod --json`, inspect maintainer advisories and actual reachable paths, upgrade supported dependencies, and disable unneeded DTD/entity processing in outer and embedded XML. Preserve normal safe XML text handling. Do not blindly change major framework versions without checking migrations and runtime compatibility.

**Acceptance:** No unmitigated reachable high/critical advisory remains in the upload path. Record remaining advisories, reachability, mitigation, and follow-up IDs instead of suppressing them globally. Bounded entity/DOCTYPE regression tests cover both parsers. Build and browser tests pass after upgrades. CI checks dependencies. Reviewed versions were `fast-xml-parser@5.3.4`, `next@14.2.35`, and `zod@3.25.76`; these are historical observations, not upgrade targets.

Primary starting references: [parser entity-expansion DoS](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-jmr7-xgp7-cmfj), [parser advisory inventory](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories). Refresh the inventory when implementing; one old patched version may still have later advisories.

### NUF-005 — Bound request reading and decompression

**Find:** `decodeReplay.ts`, both upload routes, `appConfig`, CLI file reading.

**Work:** Enforce byte limits while reading/decompressing, including zlib output bounds, before allocating complete expanded input. Limit multipart fields/files, embedded message sizes, XML depth/node counts, and total events. Treat `Content-Length` as a hint, not enforcement. Share safe decoder behavior with legacy and CLI paths.

**Acceptance:** Bounded tests cover compressed expansion beyond the cap, missing/false content length, extra multipart fields/files, excessive depth/events, and limit boundaries. Rejection occurs within measured memory/work budgets and produces typed errors. All valid demo fixtures remain supported. No huge attacker-controlled allocation or enumeration is required before a size check.

### NUF-006 — Enforce analysis budgets and cancellation

**Find:** Synchronous service execution and post-hoc `maxAnalyzeDurationMs` logging.

**Work:** Introduce an execution boundary capable of terminating expensive parse/analysis work, with explicit input/work/time limits and cancellation cleanup. A timer or `Promise.race` around synchronous work on the same event loop is insufficient. Choose a worker/process/platform approach supported by the deployment target and keep domain functions pure.

**Acceptance:** A bounded slow-analysis test is actually terminated; unrelated requests remain responsive; client cancellation releases work; workers and buffers are cleaned up. API/CLI receive documented timeout/cancellation results, never a fabricated verdict. Record local timing/memory evidence and validate packaging against NUF-023.

### NUF-007 — Exact, bounded probability and outcome contracts

**Find:** `probability.ts`, `classifyRollContext.ts`, dice/modifier extraction in `analyzeLuck.ts`.

**Work:** Use validated die types and legal face/count bounds. Remove inference of die size from an observed value. Resolve probability and actual outcome from the same action-specific contract, including threshold versus sum, modifiers, explicit outcomes, and natural-roll rules where applicable. An unknown outcome code must not automatically become a deterministic success/failure. Distinguish valid D6 type `0` from missing metadata.

**Acceptance:** Independently enumerated supported single-die/2D6 examples pass; `[2,2]` against an any-die 4+ rule cannot resolve as success via sum. Impossible/fractional/nonfinite faces, excessive dice, missing targets, unknown die types, and contradictory evidence are rejected or explicitly excluded without fabricated odds. Runtime is bounded regardless of supplied numeric magnitude. Block-specific distributions are completed in NUF-010; reroll policies in NUF-012.

### NUF-008 — Preserve ordered sequences, actions, and state transitions

**Find:** `extractStructuredTurns.ts`, `types.ts`, `parseXml.ts`, block-chain proximity merging in `analyzeLuck.ts`.

**Work:** Introduce stable sequence/action/roll IDs and source locators. Retain movement cells, all relevant action declarations, block questions/choices, reroll questions and nested roll data, skill use, ball transitions, damage transitions, team changes, and end-phase events. Keep unknown messages in a bounded evidence inventory. Replace nearest-event linkage with explicit source-sequence relationships or a documented unambiguous transition rule.

**Acceptance:** An annotated replay fragment reconstructs the same ordered action chain with optional non-gameplay messages inserted. Distinct adjacent players/actions never merge because they are close in the array. Zero-risk moves and activations remain countable. Repeated snapshot `Carrier` values do not invent possession changes, and carrier `-1` clears possession when the source semantics require it. Missing linkage reduces confidence and is reported.

### NUF-009 — Revalidate roll, step, and action semantics

**Find:** `rollTypeContracts.ts`, `mappings.ts`, `constants.ts`, `classifyRollContext.ts`, existing roll evidence documents.

**Work:** Audit every promoted and provisional mapping against independently annotated actions and the applicable BB3 rules/version. Prioritize actual dodge/block/injury/ball handling over rare-family promotion. Investigate labels `2`, `4`, `34`, `37`, and `71`; retain supported conclusions for `1` and `7` only where evidence warrants them. Audit step/action codes too. Do not infer identity from proximity to a block, a stable target, or the old map itself.

**Acceptance:** Each supported contract has a semantic definition, payload variants, rule/version scope, provenance, positive/negative examples, and owner/beneficiary conventions. Observed dice and modifiers support the claimed rule. All 12 demo fixtures have an inventory of supported, unknown, and disputed families. A real independently verified dodge is reachable as dodge; movement threshold rolls are not mislabeled block. Unresolved families stay visible with honest coverage. Unknown random outcomes are not assumed harmless merely because they lack thresholds.

### NUF-010 — Real block pools, choices, skills, and outcomes

**Find:** `QuestionBlockDice`, `ResultBlockRoll`, `ResultBlockOutcome`, push/follow-up messages; generic block probability handling.

**Work:** Reconstruct initial and rerolled pools, attacker/defender choice, selected face, applicable skills, pushes, knockdowns, and ball displacement. A block is a categorical outcome distribution, not a numeric D6 target. Preserve the distinction between dice luck and a coach's die choice. Use roster/state skill evidence rather than guessing from the face selected.

**Acceptance:** Golden cases cover one/two/three dice, defender-selected dice, double skulls, both-down with differing skills, relevant Block/Dodge/Tackle/Wrestle behavior, pushes/surfs, and available versus used rerolls. Enumerated odds sum to one. Raw pool records and their resolution are counted once, and skipped block support lowers coverage. Explain both the rolled possibilities and selected outcome. If a special skill lacks evidence, mark that context unsupported explicitly.

### NUF-011 — Armor, injury, casualty, and recovery chains

**Find:** `ResultRoll|10`, `ResultInjuryRoll`, `ResultCasualtyRoll`, removals, apothecary/skill messages, current single-die injury labels.

**Work:** Decode the actual damage distributions and stage-specific modifiers, victims, removals, recovery, and mitigation choices. Do not discard an injury merely because it lacks a binary target. Distinguish stunned/KO/casualty and match-relevant availability; do not silently price long-term league damage as current-match impact.

**Acceptance:** Independently annotated normal/modified armor, injury outcomes, self-fall damage, and representative mitigation/recovery chains match expected distributions and states. Positive damage to one's own team cannot be beneficial luck. Armor and conditional injury rolls retain separate conditional probabilities and a shared causal chain. Unsupported variants remain observable and cannot impersonate supported injury checks.

### NUF-012 — Action-linked rerolls and resource consumption

**Find:** `extractRerollFlags`, nested `RollInfos`, `Status`/`NewRoll`, skill and team-reroll messages.

**Work:** Replace four-event lookahead with action-linked state transitions. Track original dice, eligible sources, choice, replacement dice, final outcome, and consumed resource. Validate the meanings of status/new-roll flags before deduplicating. Model source-specific restrictions and conditional skills such as Pro; availability alone does not mean an unconditional full reroll was used.

**Acceptance:** Original fail→reroll success, fail→reroll fail, declined reroll, no eligible reroll, skill reroll, and adjacent unrelated actions are covered. A legal 2+ full-reroll action has 35/36 success and 1/36 failure under the stated policy. First rolls embedded only in questions are recovered; duplicate summary emissions do not create extra attempts. Replay turn-6 reproduction is corrected. Chosen reroll policy and resource cost are explicit so decision quality is not counted as dice luck.

### NUF-013 — Actor, subject, controller, and beneficiary attribution

**Find:** `attribution.ts`, `resolveTeamId`, extraction of `PlayerId`/`TargetId`/`TeamId`/`GamerId`, roster ownership maps.

**Work:** Separate who acts, who is affected, who controls a choice, and which perspective benefits. Validate source-specific ID namespaces. Do not depend on a player having a readable name to establish roster ownership. Detect conflicts between explicit IDs and roster evidence; low-confidence turn inference is not proof of event ownership.

**Acceptance:** The player-50 self-damage reproduction lowers that team's favorable outcome value. Opponent damage is attributed consistently. Cases cover both-down, self-fall, opponent-selected blocks, ambiguous/missing IDs, unnamed players, and overlapping player IDs. Known explicit/roster conflicts are surfaced and resolved with evidence. Swapping team labels swaps the reported perspectives without changing total event meaning. Unresolved events remain in coverage instead of disappearing.

### NUF-014 — Honest observed-outcome and attribution coverage

**Find:** `isRollCandidateEvent`, `classifyRollContext`, pre-normalization skips, report coverage aggregation.

**Work:** Inventory unique observed random outcomes before deciding support. Track eligible/scored/unsupported/malformed/unattributed counts, per team and family, with deduplication of questions/resolutions. Distinguish randomizers, summary records, and game-changing random outcomes that lack success thresholds. Expose state/causal-link coverage separately from dice coverage.

**Acceptance:** One supported roll plus 100 unique unknown rolls cannot yield 100% support. Real unscored block/injury dice reduce relevant coverage. Unattributed rolls are visible in overall totals and an unresolved bucket. Count conservation is tested; duplicate summary messages cannot inflate counts. Critical unknowns can limit verdicts even when they are numerically rare. Explain denominators in UI/CLI and avoid presenting a known-family-only percentage as whole-match confidence.

### NUF-015 — Insufficient-evidence and partial-analysis verdicts

**Find:** `summarizeVerdict`, `LuckReport`, API/UI/CLI error/report handling.

**Work:** Add explicit result states for invalid input, unsupported replay, insufficient evidence, partial analysis, and supported analysis. Separate evidence quality from statistical uncertainty. Define documented prerequisites for comparative and context-impact claims; unknown high-impact events or missing state can require abstention.

**Acceptance:** Zero scored outcomes never yield an even-luck conclusion. One supported success amid 100 unknowns never yields an unqualified decisive verdict. Partial reports expose usable evidence and limitations without inventing values. Known even performance is distinguishable from unknown performance. API, CLI, JSON export, and UI agree on statuses. Thresholds are versioned and justified rather than arbitrary replacements for the existing adjectives.

### NUF-016 — Reconstruct board, possession, activations, and game clock

**Find:** Raw initial board state, ordered message payloads, `ReplayTurn`, `Carrier`, end-turn and active-gamer handling.

**Work:** Build a deterministic reducer with pre/post-action snapshots: positions, standing/prone/stunned/removed players, relevant stats/skills, activations and movement remaining, action resources, ball/carrier/loose position, score, drive, half, team turn, and remaining turns. Derive turn endings from verified reasons, not every non-manual event. Handle setup, kickoff, touchdown, half-end, overtime, and incomplete replay states explicitly.

**Acceptance:** Golden fragments assert state at specific source locations. Possession clears correctly, player moves/removals reconcile, and team turns/halves match annotations. Remaining useful actions derive from legal state, not extracted message count. Unknown state fields stay unknown; invalid transitions lower reconstruction confidence. Initial/final checkpoints agree with replay evidence where available. State reconstruction remains pure and replayable.

### NUF-017 — Explainable pre-roll contextual value model

**Find:** Fixed weights and `weightedDelta` computation; consume NUF-016 state.

**Work:** Define an explicit, versioned team-perspective value function with documented components for possession/security, legal useful activations, scoring/defensive threats, player availability/role, reroll resources, score, and clock. For binary actions use `(actual - p) * (V(success) - V(failure))`; for categorical outcomes use `V(realized) - sum(P(outcome) * V(outcome))`. Values must compare valid counterfactual successor states under a stated continuation/choice policy. Treat future opponent decisions as uncertain, not known at roll time.

**Acceptance:** Matched fixtures prove that an early failure with valuable activations remaining can hurt more than a final optional block, an exposed failed pickup hurts more than a safe one, and a late game-deciding failure can outweigh an early low-stakes one. Irrelevant message order, player names, and future match-result edits cannot change pre-roll leverage. Each contribution exposes component deltas and state evidence. Unknown state falls back to clearly labeled dice-only analysis, never invented tactical context. Heuristic value units are labeled as such; use win-probability units only after independent calibration.

### NUF-018 — Causal action accounting without double counting

**Find:** Event aggregation and key moments; consume action chains and value transitions.

**Work:** Define whether contributions are evaluated per random transition or grouped action and how those reconcile. A failed dodge can induce turnover and damage; its downstream chance rolls must be conditional, and deterministic consequences must not be charged again. Group original/replacement dice correctly. Keep observed aftermath such as a later opponent recovery/score separate from causally attributed impact and from coach decision quality.

**Acceptance:** A fail→fall→armor→injury→removal sequence has an auditable decomposition whose components sum to the action total. Adding duplicate summaries does not change totals. Later lucky opponent rolls are not charged in full to the earlier failed pickup. For a fixed pre-roll state and fixed policy, enumerated probability-weighted luck contributions average to zero. Team perspective/beneficiary conventions are consistent without subtracting or awarding the same swing twice.

### NUF-019 — Additive impact totals and calibrated interpretation

**Find:** Per-team weight denominators, category totals, verdict thresholds, score rounding.

**Work:** Separate raw dice deviation, cumulative contextual impact, and evidence quality. Use a common interpretable scale for comparable impact. Category/action/event contributions must reconcile with team totals. Calibrate any strength labels on an annotated evaluation set and account for sample size, excluded high-impact outcomes, and reconstruction quality. Preserve precision until presentation.

**Acceptance:** Duplicating an identical independently scored opportunity changes cumulative impact appropriately while an explicitly labeled average remains an average. Safe/no-impact events do not dilute an established impact total. Category contributions sum to headline impact within documented rounding tolerance. Team comparisons use the same units and perspective convention. Unsupported events do not strengthen a verdict. Record calibration method, held-out cases, limitations, and model version; do not claim statistical significance from arbitrary score cutoffs.

### NUF-020 — Full-event filters and truthful timeline navigation

**Find:** `.slice(0, 15)` in `analyzeLuck.ts`, `filteredMoments` and timeline UI.

**Work:** Filter the relevant full event/action set before ranking or pagination. Offer chronological and impact views with real half/team turn/activation, player names where available, and stable replay locators. Allow users to inspect excluded/unknown evidence without mixing it into scored totals.

**Acceptance:** All four baseline ball-handling events are discoverable even if none are in the global top 15. Team/category/tag/status combinations work and empty states explain why no rows match. Sort order and labels are truthful. Uploading another replay resets stale filters appropriately. Large reports remain usable with accessible labeled controls and bounded rendering/response behavior.

### NUF-021 — Shared report contract and plain-language explanations

**Find:** Domain `types.ts`, duplicated UI types, CLI rendering, `explainabilityCopy.ts`, landing-page claims.

**Work:** Share and version the report schema across service/API/UI/CLI. Present chance, observed outcome, immediate consequences, contextual contribution, resource use, and evidence limitations separately. Describe important moments in gameplay terms with an expandable calculation/evidence trail. Distinguish observed aftermath from predictions/counterfactuals and decision errors. Handle non-JSON HTTP errors, cancellation, timeout, and partial reports clearly.

**Acceptance:** API/CLI core values agree; exported reports include model/schema versions and enough sanitized evidence to explain contributions. UI copy advertises only supported capabilities. Users can understand why an early dodge failure mattered and why an exposed pickup was dangerous without reading parser code. Unknown values are not shown as zeros or failures. Category/total units are labeled. Error handling works for hosting-generated HTML/text errors as well as application JSON.

### NUF-022 — Independent golden corpus and meaningful browser coverage

**Find:** Existing unit/API/parity tests, `smoke.spec.ts`, evidence snapshots, CI.

**Work:** Extend the seed corpus with independent annotations covering the corrected core families and the context scenarios. Keep calibration and held-out evaluation cases separate. Add semantic golden tests, bounded adversarial tests, and useful invariants; retain legacy safety coverage only where needed. The browser test must upload an actual sanitized `.bbr` and assert known events and explanations.

**Acceptance:** Tests detect the old block exclusion, reroll cross-link, self-damage sign, XML-format failures, unknown-coverage inflation, junk success, early/late invariance, and filter truncation. Include early/late failures, safe/exposed pickups, a late winning action, reroll decline, defender-selected blocks, and incomplete state. Browser coverage checks nonempty expected results, filters, reset, partial/error states, and JSON export. All 12 demos run without unexplained crashes/coverage regressions. Rebaseline snapshots only with a recorded reason and independently supported new expectations.

### NUF-023 — Vercel request/response limits and upload failures

**Find:** `maxReplayBytes`, API request/response serialization, browser upload error handling, deployment config.

**Work:** Verify current platform limits and align the app including multipart overhead, expanded reports, timeouts, and worker packaging. At review time Vercel documented 4.5 MB request/nonstreamed-response limits while the app allowed 5 MiB files. Choose a safe smaller direct-upload limit or a documented ephemeral transfer architecture if larger files are required. Do not silently add long-term replay storage.

**Acceptance:** Just-below/above-limit cases have understandable UI/API behavior. Client/server limits match; non-JSON upstream 413/504 responses are handled. Response size and worker runtime are exercised on a representative large replay. Record a deployed smoke result when environment access exists; otherwise keep deployment verification explicitly open rather than claiming local tests prove Vercel behavior. Reference: [Vercel function limits](https://vercel.com/docs/functions/limitations).

### NUF-024 — Deployment-wide abuse controls

**Find:** Module-level rate maps and forwarded-header client identification in both API routes.

**Work:** Use a platform/shared limiter that survives multiple instances, with bounded concurrency and storage, an explicit trusted-proxy identity policy, and defined failure behavior. Avoid trusting spoofable headers on unsupported hosts. Cover whichever legacy paths remain exposed; return useful retry information.

**Acceptance:** Tests using independent handler instances cannot exceed the intended shared quota merely by switching instances. A forged forwarded-header chain cannot reset identity under the documented deployment policy. Expiration/cardinality and failure-mode tests are bounded. Rejections happen before expensive decoding. Document privacy/retention of any limiter metadata separately from ephemeral replay results; verify actual edge configuration where applicable.

### NUF-025 — Legacy endpoint retirement/default gate

**Find:** `/api/replay`, `lib/config.ts`, legacy ADR and README.

**Work:** Implement a conservative default-disabled legacy endpoint with a documented explicit compatibility opt-in if still required, or document a justified replacement retirement policy based on actual consumers. Avoid deleting modules/tests without dependency evidence. The stated sunset date currently does not enforce anything. Retained compatibility routes must use the same hardened input controls.

**Acceptance:** Default requests receive a clear replacement response; explicit enabled/disabled/invalid configuration behavior is tested. Primary upload/API/CLI remain unaffected. Deprecated headers, sunset policy, docs, and behavior agree. Any unresolved compatibility requirement is recorded with evidence and an owner, not an indefinite default-enabled exception.

### NUF-026 — Frozen installs and reproducible CI

**Find:** `pnpm install --frozen-lockfile=false` in CI, package manager/runtime declarations.

**Work:** Use frozen installs, a supported declared Node runtime, and consistent package-manager/browser setup. Check dependency advisories with documented treatment of reachable versus non-applicable findings. Make the lockfile the tested deployment dependency set.

**Acceptance:** A manifest/lock mismatch fails CI instead of silently resolving new versions. Fresh install→lint→typecheck→tests→build→browser checks works from the committed tree on the supported runtime. Dependency changes are committed with their lockfile. Test scripts cannot pass while silently omitting required new regression suites.

### NUF-027 — Reconcile product claims and evidence documentation

**Find:** README, AGENTS, project plan/blueprint, replay investigation, both roll-type matrices, shared UI/CLI copy.

**Work:** Replace unsupported present-tense claims with the proven implementation status and link each supported rule to fixture/rule provenance. Record corrected historical assumptions explicitly while preserving append-only logs. Keep the distinction between dice support, state reconstruction, heuristic impact, and calibrated probabilities visible.

**Acceptance:** No active document claims dodge/block/injury support absent its acceptance evidence. Historical confidence labels cannot override corrected contracts. New IDs cover any unresolved mapping, platform, calibration, or security gap. Old backlog items such as rare roll families, argue variants, legacy policy, and explainability remain traceable to the new owner IDs; no acceptance requirement is lost during reconciliation.

### NUF-028 — Integrated adversarial and product acceptance gate

**Find:** This ledger, all updated tests/docs, deployed-environment evidence when available.

**Work:** Re-run the original review probes against the final tree and verify the product examples end to end. Produce a concise validation record with commit, runtime/model versions, fixture coverage, commands, performance limits, audit disposition, supported semantics, and remaining limitations.

**Acceptance:** All predecessor IDs have actual closure evidence; no required item is merely deferred or skipped. Fresh-install checks pass, every original defect is fixed or safely rejected with an explicit supported/unsupported contract, and context-sensitive analysis works for the requested core scenarios. The user can upload a real replay and trace a large swing from dice through state consequences to an additive report contribution. No missing evidence yields an even/decisive conclusion. No live malicious load test is required. If deploy verification or independent semantic/calibration evidence is unavailable, leave this gate open and report the exact remaining limitation.

## Current acceptance audit

Updated2026-11-11 for schema2.19/dice-only-19/context mobility-possession-14. Every original issue, dependency and acceptance criterion above is retained. Eleven issues are closed and seventeen remain open. An open broad issue is not a reason to stop its independently actionable engineering. This table separates implementation work from precise absent evidence and final acceptance; it does not replace the ledger.

| ID | Existing acceptance evidence | Remaining input or acceptance gap | Next actionable work |
| --- | --- | --- | --- |
| NUF-009 | Source-linked core numeric checks, raw block symbols, armor, scoped recovery, all-demo inventories and nine public3+ Loner gates | Complete supported injury/casualty/referee rules and version variants. No accepted raw2+/5+ Loner or paired failed Bribe/natural1 Argue | Reconcile saved source families and current trait/rule tables; official enum documentation is not a prerequisite |
| NUF-010 | One-to-three dice, chooser roles, Brawler, Pro, conditional Loner3+/4+ pools and observed Block/Dodge/Tackle/Wrestle resolution with distinct prone/knockdown and subject damage | Full skill-conditioned outcomes/choices and legal current trait sets | Establish full current-trait/optional-choice distributions and push/surf successors. Six public Tackle chains have final linkage; two Sidestep/controller-wait chains remain unsupported. Observed resolution is not a hypothetical choice policy |
| NUF-011 | Subject-oriented armor, scoped recovery and observed Apothecary choices | Total8 injury can mean Stunned or KO depending on traits; complete applicable tables/current traits needed | Reconcile each damage/mitigation stage against saved trait observations, retaining unknown expectations until table scope is accepted |
| NUF-012 | Original/replacement/kept numeric checks, observed3+/4+ Loner spend/results, mental terminal chains, conditional block pools and Pro observations | Mixed policies, turn resources/eligibility and core numeric Loner chains. Public/saved paired extracts lack accepted gated Rush/Dodge/Pickup/Catch originals and terminal results | Extend explicit resource-transition and choice contracts from saved chains. Admit another threshold/family only with its own original/question/gate/terminal/ownership evidence |
| NUF-013 | Self-fall, both-down, opposing chooser, conflicts, current traits and source008 purchase/replacement identities | Transformation, temporary effects and cross-snapshot persistence | Implement explicit mutation/persistence boundaries; omitted Data remains unknown and initial names are historical |
| NUF-014 | Overall/per-family/team conservation, unknown/unattributed retention and deterministic no-roll/kept-summary exclusion | Complete unique-outcome accounting and state/causal coverage | Reconcile all supported/unknown families and duplicate policies against independent raw inventories |
| NUF-015 | Insufficient/partial reports agree across surfaces and whole-match verdicts abstain | Supported/even interpretation depends on semantic coverage and calibration | Preserve abstention while exposing coverage and supported component scope |
| NUF-016 | Ordered checkpoints, movement, possession, clocks, completion/effects/drive observations, valid Dodge-success occupancy, fresh ordinary-move skill/effect eligibility, bounded active Move continuation and actual movement after verified own Dodge replacement and held-ball continuity after successful own Sure Hands | General setup/kickoff/drive legality, transformations, recovery/reactivation and resource resets | Expand explicit phase/roster/resource transitions and current-trait continuity; raw setup CanAct/TackleZone flags are not playable availability |
| NUF-017 | Synthetic fixed-policy early/late and safe/exposed arithmetic, real scoring descriptions and ten public conditional terminal-Dodge teammate/active-continuation ranges and two Sure Hands possession ranges | Late deciding failure needs valid successors and a supported terminal policy. Last own turn does not prove opponent turns are exhausted; success does not reveal failed-roll choices | Continue valid state/possession successors and terminal/resource chains. New ranges retain missing availability and are excluded from point totals; they do not close the late deciding failure requirement |
| NUF-018 | Source-linked damage, falls, touchdowns, eight-way pickup successor/uncertainty bounds, scoped ball branches and terminal-block/damage decomposition by victim team | Wider ball/possession successors and quantified causal accounting (the narrow actual held-ball movement transition adds no tactical possession value) | Implement valid successor policies and decomposition without charging later independent dice twice |
| NUF-019 | Additive event/category/team conservation and fixed-policy zero-mean checks | Held-out quantitative context, calibration and supported interpretation | Build matched independent context fixtures and measure scope/calibration; calibration is not a prerequisite to remaining state engineering |
| NUF-020 | Full filters/paging/reset, source locators and observed player/clock/activation navigation | NUF-016/019 integrated impact prerequisites | Extend navigation only for accepted state metadata; continue bounded large-report acceptance |
| NUF-021 | Shared validated schema, unknowns, source explanations and conditional gate/expiry copy across API/UI/CLI | Broad counterfactual and real contextual acceptance | Carry accepted consequence components through shared contract and explain their quantified/observed distinction |
| NUF-022 | 756 unit tests, fourteen browser flows, full demos, independent3+ gate/pool/drive goldens and actual full-source upload worker acceptance | Held-out quantified context, valid late deciding failure and calibration set | Add source-independent successor/trait expectations and adversarial contract checks; source fragments and synthetic continuations stay labeled |
| NUF-023 | Local budgets/boundaries/workers, real Redis quota and historical hosted smokes | New-candidate Vercel acceptance awaits verified free allowance under zero-spend restriction | Continue local packaging/response/runtime acceptance; keep historical hosted evidence tied to its SHA |
| NUF-027 | Current supported/observed/provisional contracts and updated acceptance map | Final claims depend on open rule/context/hosting gates | Reconcile every implementation with evidence without dropping original acceptance requirements |
| NUF-028 | Local integrated checks and exact-candidate CI records | Every predecessor and requested core contextual scenario must pass acceptance | Run adversarial acceptance per admitted contract, commit/push progress and leave integrated gate open |

Failed Bribe and natural1 Argue require a viable paired-export route in [REPLAY_CAPTURE_GAPS.md](REPLAY_CAPTURE_GAPS.md); two completed hotseat probes produced no export, so repeating that route is not a prerequisite to engineering. Missing2+/5+ and core numeric Loner chains are precise source gaps, not an official-enum blocker. No new service/store, account/Redis change or Preview is authorized until zero cost/free allowance is verified. These evidence/hosting limits do not block the state, trait, coverage and successor work above.

## Review-to-backlog coverage

| Review finding / requirement | Owning IDs |
| --- | --- |
| Actual blocks excluded; dodge unreachable; injury mappings disputed | 001, 008–011 |
| Rerolls attached to unrelated events / original failed dice omitted | 008, 012 |
| Own damage produces good luck / team attribution conflicts | 011, 013, 018 |
| No contextual consequence analysis | 016–019 |
| XML declaration and formatting silently lose data | 002, 008 |
| Junk XML succeeds; malformed rolls return 500 | 003, 007, 015 |
| Inflated coverage and unsupported confident verdicts | 014, 015, 019 |
| Dependency vulnerabilities and entity expansion | 004, 026 |
| Late size/time checks, attacker-controlled numeric work | 005–007 |
| Average score confused with cumulative match impact | 019 |
| Hidden filtered moments and misleading turn timeline | 016, 020 |
| Tests verify output shape rather than game truth | 001, 022 |
| Inconsistent multi-die probability/outcome rules | 007, 010 |
| Vercel size/runtime mismatch and non-JSON errors | 006, 021, 023 |
| Per-instance rate limiting | 024 |
| Deprecated legacy route still enabled | 025 |
| Non-frozen CI dependency installation | 026 |
| Contradictory docs and unsupported capability claims | 021, 027 |
| Regular agent can discover, execute, and verify all work | Ledger, execution instructions, 028 |

## Closure record template

Append a record to `IMPLEMENTATION_LOG.md` and link it from the ledger:

```text
Issue(s): NUF-...
State: in_progress | blocked | done
Baseline reproduction and independently expected behavior:
Changes and relevant source/test paths:
Acceptance criteria verified (one result per criterion):
Commands and results:
Commit (if created):
Remaining limitations / newly assigned issue IDs:
Next ready issue:
```


Source018 follow-up (2026-11-10): UI-089 pairs three Fireball4+ checks6/1/2 with the explicitly displayed home caster, away11 end-turn/home12 boundary, AV10+ [6,4] and injury[6,2]+Spell1 KO. Four exact steps and four direct context events brought checkpoint totals to89/356/20 across twenty saved sources. Eight original local hashes then lacked positive fixtures. Corrected an earlier prose namespace error: Fireball PlayerStep StepType19 is distinct from DamageStep Source3; saved raw extracts were already correct. NUF-009/013/016 remain incomplete.


Source011 follow-up (2026-11-10): UI-090–093 add Breathe fire4+ die4−Strength1 Failure with original kept; natural1 self-Prone/AV10+[6,2] Failure; and die5 Success/target Prone without armor. A separate Blitz/ball-return chain independently displays Catch4+1−5 Failure and Catch4+6−4 Success, both raw Difficulty6. Natural6 is therefore a catch-specific exception to the plain modified-sum check; modifier holders and catchers differ. Current93 cases/376 distinct steps/20 direct records across twenty-one sources (twenty originals plus one demo); seven original hashes lack positive fixtures. Full policies/state/version acceptance and production semantics remain incomplete.


Source025 checkpoint (2026-11-10): UI-094 adds seven exact step records for a Long pass fumble1→Pass6 Accurate, away interference4−4 Failure and home Catch1→Catch4 Success. Roles and controller handoff stay separate; team rerolls remain4/3. Current94 cases/383 steps/20 direct records across22 sources;41 named families. Six local originals lack positive fixtures, independently recounted at8,408 step emissions. [REPLAY_CAPTURE_GAPS.md](REPLAY_CAPTURE_GAPS.md) scopes remaining collection separately from implementation acceptance. Failed Bribe/raw linkage, natural1 Argue, field/state policies and full contract acceptance remain open. No runtime change or issue closure.


State/static-data checkpoint (2026-11-10): UI-095/096 add crowd removal without armor, off-pitch CanAct1/TackleZone1 and a carrier-knockdown/loose-ball transition with Carrier/IsHeld omitted. Current96 cases/398 distinct steps/26 direct records across22 sources. The installed [offline JSON extraction](OFFLINE_RULE_DATA_EVIDENCE.md) preserves178 rows; all105 skill,11 casualty and five characteristic name/code pairs agree with the executable enums after spelling normalization. Package precedence and behavior remain unresolved. Preserved client UI logs corroborate the hotseat Bribe1 failure but supply no serialized replay roll/step. No production mappings or issue closures change.


Attribution/provenance follow-up (2026-11-10): all6,342 direct ResultUseAction emissions in27 originals explicitly report TeamId0, including2,920 actors on initial roster index1;113 initial memberships remain unresolved. UI-096 independently observes an away actor with0. Preserve this counterexample under NUF-013; do not infer side from that field alone. Static archive discovery/path registration is corroborated by the hotseat session log, with conflicting external/internal package revision3/23 retained. No additional paired cases or issue closures. A natural1 Argue trial has not started: the game is at offline Connection awaiting manual profile connection after a hotseat-settings navigation fault.


Natural-roll triage (2026-11-10): a scoped39-source audit of3,822 direct single-D6 ResultRoll emissions with binary outcomes finds nine disagreements with plain modified-sum thresholding: eight natural6 and one Catch1+1. All selected records agree with their recorded Difficulty and a2–6 clamped threshold relationship, which remains a corpus hypothesis rather than universal rule acceptance. Exact source/message projections and reproducible tooling are in LOCAL_REPLAY_FINDINGS / bb3-threshold-model-audit.json. Source016258/1 and source025444/6 are next independent UI targets. No paired-case count, runtime contract or issue status changes. The same manual profile-connection handoff remains pending.


Offline handoff follow-up (2026-11-10): the user connected the local profile manually. A fresh main-menu observation confirmed the handoff cleared. My Teams is disabled in offline hotseat setup; default rosters transition directly from Chaos Chosen to Chaos Renegades in the inspected portion, providing no Breathe Fire reference through that route. No match was started. Profile → History → Saved Replays remains available offline and successfully loads source025. UI-097 independently displays away16 Action2: Quick pass4+ die5 Accurate, Catch2+ die1+Diving Catch1 Failure, Catch skill replacement3+1 Success, then receiver possession. Reroll counters stay1/1. Three exact records444/0,5,6 bring totals to97 cases/401 steps/26 direct records across22 sources. This closes the UI-transcription gap for that specific arithmetic counterexample, not its broader supported rule contract or a production issue. Source016258/1 Pass6 under negative modifiers remains the next discriminating target; raw-linked failed-Bribe and natural1 Argue gaps remain open. The previous profile handoff is resolved; the game remains open with saved-replay analysis resumed.


Source016 follow-up (2026-11-10): UI-098 independently displays away8 Action9 Long pass4+ die6-4 Accurate, with Long pass-2 and grouped Disturbing Presence-2. Home interceptor10 then fails Interfere4+ die5-8 (accuracy-3, four tackle zones-4 and Disturbing Presence-1); Bounce2 lands at[6,9] and home8 starts. Four exact steps and five direct context records retain the pass/response, role ownership and held/intermediate/loose ball states. Intermediate309/5 retains Carrier46 after the pass while IsHeld is omitted and the ball coordinate differs from the passer's cell; Carrier alone is not sufficient held-possession evidence. UI-099 adds two separately selected Foul Appearance2+ die1 failures (away Actions5/6), followed by different teammates acting during the same turn. Five exact steps/four BoardState records preserve each actor's explicit CanAct1 to omission transition, subject-owned Skill10, unchanged cells and continued team turn. Omission is not promoted to a universal false/default rule. Current totals99 cases/410 distinct steps/35 direct records across22 saved sources; six original hashes remain unpaired. The source016 numeric verifier passes; deliberate pass-Outcome and intermediate-Carrier mutations reject; global ID/locator recount passes. No runtime mapping, rule contract or backlog issue is closed.


Offline export follow-up (2026-11-10): HS-B used two default Black Orc teams in offline local hotseat, bought no inducements, and finished normally0–0 after both sides ended turn16. The results view exposed no Replay/Download control. At15:38:14Z the replay directory remained28 files with unchanged newest write/length. The temporary Hold→Toggle input test was restored to Hold; pitch selection remained unresolved while menu/End of Turn worked. See HOTSEAT_EXPERIMENTS for setup and limits. No new raw replay, paired case, runtime mapping or issue closure resulted. Raw-linked failed-Bribe/natural1 Argue remain blocked on a viable capture route; existing-file research remains possible. Current paired totals remain99 cases/410 steps/35 direct events across22 sources. The game is open and the full data-gathering objective remains incomplete.
