# Observed return after treatment

Schema 2.69 / dice-only-35 / mobility-possession-42. Advances original NUF-011/016/018/020/021/022/027 and fixes the separately reproduced NUF-034 continuity defect. Full legal availability and contextual value remain outside these observations.

## Source evidence

The independent stdlib [extractor](../scripts/extract-treatment-return-evidence.py) selects all three raw treatment/reserves cases from the preceding [notification evidence](TREATMENT_AFTERMATH_EVIDENCE.md), never application admission. Its [receipt](../tests/fixtures/evidence/bb3-treatment-returns.json) retains original replay hashes, reserves/setup/play/declaration-before observations, explicit player type or its omission, complete roster membership, raw declaration headers/messages, both Staff255 notifications and canonical ordered prefixes: 1,736 structured events and 224 selected-player/full-roster snapshots.

The fingerprint covers event tags, direct field names and selected identity integers. Scalar ReplayStep/Clock timestamps and derived Carrier markers remain outside that structured-event projection. Raw file hashes cover the original bytes; the receipt does not claim full decoder equivalence, legal setup or useful availability. No new playback capture or licensed asset is introduced.

| Replay / treatment | Player / team | First setup | First regular play | First later declaration | Accepted prefix |
| --- | --- | --- | --- | --- | --- |
| demo1 /5188 |37 /1 |5302, frame658 child6 |5366, frame673 child6 |5397, raw Action4 | Setup/play; unsupported-declaration stop |
| demo3 /2043 |45 /1 |Raw frame298 child6 |Raw frame303 child11 |Raw frame321 child1 | Unverified at Staff255 source2466, before setup |
| demo3 /3060 |7 /0 |3809, frame439 child10 |3876, frame454 child6 |4175 Move, before4172 | Observed through declaration |

Demo3's two Used0/Staff255 notifications occur at raw frames291 and312. Their unverified policy remains an identity-continuity barrier; later convenient rosters do not repair it. Demo1's Action4 is retained in independent raw evidence but is outside the supported Move1/Block2 return-declaration contract. It cannot create a qualified marker. Demo3's accepted Move has raw ResultUseAction.TeamId0, but its owned roster establishes the actor's team independently. Unknown setup and declaration-before controllers remain null, and omitted status/situation flags never become ordinary standing defaults.

## Shared reducer and cause-specific contracts

`reservesReturn.ts` holds the deterministic event/board merge previously used for Regeneration. Regeneration and treatment construct separate seeds and source references; a treatment notification is never rewritten as a successful recovery roll. Only a qualified first reserves checkpoint seeds this extension. Injured-box observations do not imply a later return or permanent loss.

The reducer commits setup, regular-play and supported declaration milestones at their own prefixes. Unique same-slot membership, compatible two-team namespaces, current ownership and known player type must remain compatible. Missing type observations do not erase an earlier known type. Catalogue reuse, unknown ownership transitions, new damage/removal, invalid source ordering, incompatible rosters and unsupported first placement/declarations stop tracking. Already observed earlier milestones survive a later stop; a completed declaration is not revoked by future score/clock/roster edits.

`treatmentReturn` distinguishes `not_observed`, `unverified` and `observed` with optional later milestones/stop. `treatmentReturnActivation` is a separately owned, excluded, non-random declaration with zero dice/context contribution and a reciprocal treatment reference. Nullable status/situation/action/tackle-zone fields have explicit presence flags. Export validation binds every milestone to the report's retained clock/roster checkpoint, checks the last board before the declaration, source order, own-team turn, controller/period omissions, actor role and reciprocal graph. It rejects substituting another recovery cause, invented defaults, missing markers and added scores. These structural checks do not cryptographically authenticate a coherently rewritten raw replay or prove every hypothetical legal action.

Shared UI/CLI text explains the accepted setup/play/participation or exact gap, with No new roll/Not scored for the declaration. Setup CanAct flags remain observations. The trace adds no useful-action count, immediate-return guarantee, permanent-loss assertion or value for a hypothetical recovery.

## NUF-034 reproduction and guards

All 542 tracked blobs of exact parent `f9c72368caaa485184f4b35cca22099fdf9345a6` are independently hash-verified before copying only new evidence/tests. The first three source cases reproduce two missing-report failures and one green independent extraction. Separate serialized Regeneration probes show the old tracker accepting an opposing third-team ID, duplicate owner-team ID and a known player-type change. A three-roster XML case is already rejected by the parser and remains a control. Extending the probes through an omitted-type setup adds one further failure and an unchanged-type control: four red/two green identity cases. The combined final parent run is six red/three green across nine cases.

The shared producer now withholds those incompatible prefixes before constructing a report, preserving earlier milestones and scores. The previous behavior could also cause the stricter new treatment export validator to reject a producer-generated report; invalid observations now become explicit unverified traces. The type guard makes no claim about an actual transformation's rules.

Current focused validation passes 139 cases: 77 treatment-state/export guards, six serialized identity cases, three independent source tests and the existing 53 Regeneration cases. An initial synthetic helper changed outer roster IDs while leaving encoded inner IDs untouched; the correct exclusion exposed that fixture mistake, and both layers were corrected. An obsolete loop entry with no remaining mutation was removed; the production no-context-value invariant remains unchanged. No source guard, original fixture, historical golden or runtime cap is relaxed.

## Complete-report and transport acceptance

Independent comparison validates every new trace against raw milestone/owner/header facts before comparing complete reports. All 1,480 previous scored event objects, 18,441 physical dice records, 173 resource choices, 6,798 counter checkpoints, 533 end notifications, 111 numeric groups, 27 contextual ranges, zero public context point components and every prior Regeneration trace remain identical. Three existing treatment rows gain traces; only demo3/source4175 is newly visible. Its owner, zero contribution, source coordinates, nullable state and derived visibility/team counts are independently checked. Two report IDs change and ten stay identical. Maximum compact report is 2,736,583 bytes. Receipts: `/tmp/nufflizier-treatment-return-conservation.{py,json,log}`.

Actual CLI workers exercise all three outcomes in JSON/text. The existing demo1 and demo3 HTTP requests assert the same contracts; there are still exactly ten POSTs. Desktop/mobile browser flows cover the accepted Move, staff gap and partial setup/play prefix, filters, Why/source evidence, No new roll/Not scored, full JSON equality and reset. Browser plugin absent; repository production Playwright fallback is used. Exact required local and published-head results, screenshot inspection and fresh raw report-ID verification are recorded in the append-only [implementation log](IMPLEMENTATION_LOG.md).

Every original issue packet, dependency and broader acceptance criterion remains. General setup/drive legality, effective skills/resources, useful activations, complete damage/recovery policies, counterfactual value, held-out calibration and current-schema hosted integration remain open. Worker4s/256MiB/report4MB, all input/XML/event limits and ten admissions/two leases are unchanged. No provider/account/store/terms/Stripe/billing/deployment/production/legacy action is required.
