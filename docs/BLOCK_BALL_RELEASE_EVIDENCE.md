# First recorded bounce after a carrier becomes prone

This is observed block aftermath for NUF-010/013/016/018/021/022. It adds a source link and plain-language explanation, not a new roll, possession simulation, tactical estimate or closure of those issues. Schema **2.43**, dice model **dice-only-21**, context model **mobility-possession-34**.

## Independent evidence

Paired BB3 playback **UI-096**, retained in `tests/fixtures/evidence/bb3-ui-playback-025.json`, shows away48 blitzing home ball carrier5. A one-die Push is rerolled to Both Down; each player's armor holds; D8 bounce7 travels from[4,10] to[4,9]. The recording shows a loose ball. The earlier serialized snapshot has Carrier5/IsHeld1; the later snapshot omits both fields. That omission cannot independently certify a loose ball or retain the previous carrier.

The published [BB2020 rulebook](https://www.tassidelmiele.it/wp-content/uploads/2021/02/OR2020.pdf), printed p25/p27, describes bounce movement and the release of a held ball when its carrier becomes prone, with damage resolved before a knockdown's bounce. Wrestle's placed-prone branch does not add armor. The locally inspected original has SHA256 `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`. These rule facts and paired UI interpretation qualify the mechanic, not every BB3 variant or a complete tactical policy. The BB3 D8 serialization uses the separately source-audited numeric offsets; the tabletop template's orientation is not substituted for those numbers.

`scripts/extract-block-ball-evidence.py` uses Python's standard library and the independent raw decoder, without application imports. It preserves seven numeric source witnesses, source hashes, original locators, sequence boundaries, actual bounce directions/cells, source roster IDs and selected physical checkpoint fields. Other players retain IDs for ownership-conflict detection; their omitted positions/traits remain unknown. These projections are not complete playable boards or full-match semantic goldens.

| Source | Final original ReplayStep | Bounce step | Prior holder | First motion |
| --- | ---: | ---: | ---: | --- |
| demo1 |111|2|42|[1,4]→[0,5] |
| demo3 |381|3|44|[18,4]→[17,4] |
| demo5 |196|2|40|[13,2]→[14,2] |
| demo5 |502|3|44|[12,5]→[13,5] |
| demo11 |232|3|6|[19,8]→[18,7] |
| demo-goblins1 |490|2|42|[13,7]→[14,6] |
| demo6 |563|2|42|[17,8]→[17,9] |

These include a carrier on the blocker's team, Both Down damage on separate teams, pushed defenders and a later catch/second bounce. The original complete public files are tested separately from the smaller projections. UI-096 is reconstructed with explicit home/away scaffolding and preserved sequence boundaries. Its later snapshot is isolated because intervening timer/controller records were not captured; that fragment does not claim uninterrupted adjacency or a full-source hash join. A separately labeled synthetic Wrestle variant tests the no-armor release branch; it is not claimed as an observed Wrestle in UI-096.

## Runtime and public contract

For version1-4-0-0, a previously qualified terminal block resolution must make the actual recorded holder prone. The last checkpoint before the applied outcome must explicitly record the held ball, its complete on-pitch cell and a uniquely owned carrier at that cell, with phase5 and no board issues. Every intervening raw event must stay within that same block continuation, within256 source records. The checkpoint may be after die selection or an already executed push; it is not represented as pre-roll leverage. No coordinate or skill list is carried across an omitted field.

Only the immediately following validated block/damage prefix can lead to a BallId0, non-evaluation BallStep3 and its adjacent unmodified D8 Bounce25. Sequence/step/source order, direction, cells, raw field shapes, status/outcome and no-new-roll flags must agree. Unknown movement summaries, additional actions/choices, unsupported ball/roll/step policies or missing departure cells withhold the link. The earlier damage scoping rules and contributions are unchanged.

`blockBallRelease` names the source-confirmed prior holder/team/checkpoint and the first bounce's source/from/to. The existing excluded bounce row receives `ballTravel`. An optional immediate physical snapshot preserves its cell and nullable Carrier/IsHeld exactly. A catch, further bounce or controller/timer transition prevents that optional adjacency claim; contradictory immediate holder/cell data withholds the release. Omitted flags remain null. Explicit IsHeld0 can be explained as not held; null cannot. Later motion, possession, turnover and useful activations remain unmodeled by this receipt.

The shared schema reconciles the prone subject/team, terminal block, damage prefix, first bounce source/location, ordered locators, exported travel and any immediate snapshot. It rejects contradictory or fabricated cross-links. This is structural validation of the exported report, not cryptographic attestation of a caller-supplied snapshot. UI details and CLI text share the same explanation; JSON retains the provenance. The D8 row remains excluded with unknown binary odds and zero stored contribution. Existing block/damage subtotals, coverage and scoring policies remain unchanged.

## Remaining acceptance

This does not complete legal alternative push/chain-push/surf/throw-in branches, full catch/recovery chains, general current-trait/identity continuity, reroll/skill resource policies, state reconstruction, counterfactual values, held-out context calibration or hosted acceptance. The original backlog IDs, dependencies and acceptance requirements remain authoritative; twelve issues remain closed and sixteen open.

## Verification receipt

Full local `corepack pnpm verify` passes lint/types, **1,972 unit/API cases in85 unique suites** (1,938 pure +24 serial real CLI +10 isolated real HTTP), real Redis atomic/concurrency/quota/expiry/spoofing/fail-closed checks, production build and **34 Chromium flows**. The new suite adds55 cases, including seven original-file/projection joins, paired UI evidence, synthetic Wrestle, nullable versus explicit not-held flags,30 unsupported-input mutations,12 public cross-link forgeries and a real CLI worker. The existing demo5 HTTP case now verifies three release receipts without adding an eleventh POST. A focused check also asserts that demo3's cross-turn timer/controller records prevent an immediate after-state claim.

All12 complete reports were compared with an archived exact parent `bcef1896c4e07faaf421ccd78d78567ddc123699`. Every prior field matches after excluding only the new blockBallRelease, ballTravel on its specifically linked bounce rows, content-derived identity/time and versions. This parent is a regression reference, not independent semantic truth. There are19 first-bounce links across ten public files,27 existing partial context ranges, zero source-backed context point estimates and no newly promoted outcome or whole-match verdict. Frozen earlier scored-event hashes are unchanged; their projection excludes the separately tested new receipt.

Browser plugin was unavailable; the repository Playwright workflow exercised the production app at `http://127.0.0.1:3000/nufflizier`,1280×800 and390×844. Page identity/nonblank report, no framework overlay, clean relevant console, expanded source explanation, scoring filter, JSON download and upload reset passed. Screenshots outside the repository (`/tmp/nufflizier-block-ball-desktop.png`, `/tmp/nufflizier-block-ball-mobile.png`) were visually inspected. The existing horizontally scrollable evidence table exposes the explanation on mobile; this does not claim simultaneous visibility of every column or validation on other browsers/viewports. No new hosted acceptance is claimed.
