# Recorded Throw Team-mate participants

Schema 2.70 / dice-only-35 / mobility-possession-42. This advances the existing NUF-012/014/021/022/027 scope and extends NUF-013's source roles. No original issue closes and no throwing, Always Hungry, non-Dodge Loner or deviation policy receives a luck score.

## Independent source evidence

The stdlib [extractor](../scripts/extract-throw-team-mate-role-evidence.py) selects every raw ThrowTeamMateStep and separately censuses PlayerStep/14 landings across the twelve public replays, independently of application admission. The [receipt](../tests/fixtures/evidence/bb3-throw-team-mate-roles.json) preserves original file hashes, typed headers, numeric message payloads, preceding nullable rosters and the hashed existing UI-034 and UI-041 playback observations. This uses existing playback evidence; it does not claim a new game capture or new legal-policy verification.

| Source | Typed thrower / thrown player | State | Raw CellFrom | Retained source rows |
| --- | --- | --- | --- | --- |
| demo1 /5400 |37 /50 |1 |13,7 |5400–5404 |
| demo1 /5406 |37 /50 |3 |13,7 |5406–5411 |
| demo6 /2273 |37 /45 |3 |14,9 |2273–2278 |

All seventeen rows carry source-specific role evidence. Three headers and five skill decisions are newly visible non-random controls; the nine previously visible rows gain roles. An explicit skill notification belongs to its holder, which may differ from the thrower. No PlayerStep/14 landing occurs in the twelve public sources. The separately hashed existing UI-041 control supplies an actual PlayerStep/14 landing for thrown player10 after thrower1; it keeps its own explicit player. The prior Pass-budget Action4 declaration is separate from the executed Throw Team-mate Step13.

UI-034 independently records actor37/target50, the original throwing die4, resource2→1, Loner4+ die5, replacement throwing die3 and deviation destination13,6. Raw difficulty/modifiers are preserved without deriving throwing odds. The continuation's CellTo contains a future deviation destination; it never supplies a pre-roll position, movement or success policy. Identity matching uses the recorded participant pair, source continuity, State1→3 and identical raw CellFrom.

## Producer and exported contract

Only version1-4-0-0's exact known header field set, distinct numeric typed IDs, validated state/evaluation/step/cell fields and known message shapes receive inherited roles. Ordinary PlayerId/TargetId aliases cannot override ThrowerId/ThrownMateId. Contradictory explicit message participants, unknown tags/families, unexpected nested dice and malformed shapes retain unverified roles. Missing or unknown flags stay unknown. Domain callers' derived annotations are rechecked against original payloads and the ordered source graph, without mutating their input.

Observed resource ownership requires unique current same-roster membership of both players, independently of GamerId/controller. Demo1/source5407 now links to source5404 with actor37/team1 and the observed checkpoint5404. All173 public choices link; the118 recorded uses/55 non-uses are unchanged. The final counter interval retains before2/after1 and a clock-boundary status, rather than claiming a complete legal-turn reconciliation. The pre-existing original/replacement physical identity remains exactly one draw per physical record. The gate gains a separately owned, still-unscored Loner receipt and spends once.

Export validation binds each role to its retained header, exact source coordinates/order, action/sequence, raw participant pair, state/from cell, actor ownership and physical actor/target fields. Holder skill/decision fields must agree. Resource namespace validation additionally requires the thrown player in the same observed roster. Roles cannot add probability, score, weight or contextual value. The original question's physical die remains visible; only headers, skill decisions and resource decisions use “No new roll.”

## Reproduction and conservation

All552 Git blobs of exact parent `265dadd6fe6d0d966b62ed709cd7cbb4caaa1119` are independently hash-verified before copying only new evidence/tests. The initial four independent source cases reproduce three failures and one green extraction control. The expanded suite also runs against that parent; some missing-annotation guards necessarily fail at their required setup, so its aggregate failure count is not a separate semantic-acceptance claim.

Current source/serialized guard/export tests cover73 cases. They include missing/aliased/contradictory roles, distinct skill holders and landing players, unknown header/message/nested-dice shapes, version boundaries, changed state/from/pair/gamer, missing/opposing/duplicate teammates, missing usage flags, recorded non-use, stale/unindexed/duplicate headers, future destination/face independence, input immutability and forged report/physical/resource graphs.

Complete twelve-report comparison first joins the new roles to independent raw headers/messages and validates each zero contribution. It preserves all1,480 scored event objects, all18,441 physical values/paths/aliases/dispositions,173 choices,6,798 source checkpoints,533 end notifications,111 numeric groups,27 contextual ranges, zero public point components, prior treatment/Regeneration traces and every verdict. Exactly eight physical records gain actor/target fields. Eight non-random rows are added; visibility, family attribution, team event counts and the last resource interval/window are independently recomputed before every remaining report field is compared. Ten reports change only schema/time; two report IDs change. Receipts: `/tmp/nufflizier-ttm-conservation.{py,json,log}`. Raw pre-Zod report IDs are checked separately; export field order is not a hash oracle.

Actual CLI, the existing demo1 HTTP request and desktop/mobile report flows cover the same source contract. HTTP acceptance keeps exactly ten POSTs. Final local gate results, screenshots and exact published-head CI evidence belong in the append-only implementation log. Runtime/input/XML/event/report limits and ten admissions/two leases are unchanged. General eligibility, mixed reroll/throw/landing policy, full state, contextual value/calibration and current-schema hosted integration remain open under existing IDs.

## Missing-roster namespace follow-up

A post-publication partial-domain probe finds a producer/export mismatch in exact `a1e13a36e162a00a59793674d5230ed719444151`: removing all board checkpoints while supplying explicit actor-team fields can produce a linked `explicit_team` resource namespace. That proves neither a current friendly thrown player nor the observed roster required by this contract, so the exported report is rejected. Normal serialized public inputs already have the required rosters and are unaffected.

An independent archive verifies all561 tracked blobs of that exact parent before copying only the two-case test extension. The explicit-team case reproduces one failure; the plain missing-board case remains a green control. The producer now requires an observed board before constructing a Throw Team-mate resource namespace; ordinary single-actor explicit-team fallbacks are unchanged. Both missing-board variants retain an unresolved choice, null team/namespace, zero contribution, a valid report and input immutability. This is a follow-up to existing NUF-012/021, with no schema/dice/context version change or original issue closure. Final focused coverage is73 cases. Public complete-report equality and final local/exact-head verification follow in the execution log.

## Browser workload isolation

Exact a1e13a3 CI43613607917 passes3,635 unit/CLI/HTTP cases, Redis and production compilation, but the real demo1 browser upload returns504/TIMEOUT while the report-fixture tests run concurrently;73 of74 browser cases pass. Exact eb7f272 CI43615228100 later passes3,637 cases/Redis/build/all74 Chromium with the same public reports and concurrent browser arrangement. The failure is intermittent; the older log does not prove its cause or a hosted performance fix.

`scripts/run-e2e-gates.mjs` now runs seven `[real-worker]` cases first with one Playwright worker and a fresh production server, then67 report-fixture cases with normal parallelism and a second server. The seven include all tests making any unmocked POST, including the mixed invalid-input case. Complementary [CLI filters](https://playwright.dev/docs/test-cli) preserve every case; independent collection-set comparison verifies7+67=74 with no omissions or duplicates. Existing actual upload status assertions remain, with no added retry, runtime relaxation or fallback to a mocked success. AGENTS.md documents the marker for future tests.

The first gate enables existing stage/timestamp-only analyzer diagnostics; [server stdout piping](https://playwright.dev/docs/test-webserver) exposes those messages during this test phase. No replay identifiers, payloads or report fields are logged by that diagnostic contract. Final local production build and both gates pass; nine actual worker starts produce eight serialized reports and the expected invalid-root result. The local stage spans are64–1,001ms, which are machine-specific and do not certify Linux or Vercel cold-start acceptance. Exact new-head CI remains the verification gate. This advances NUF-022/023 without changing schema2.70, product code, limits, issue statuses or broader hosted requirements.
