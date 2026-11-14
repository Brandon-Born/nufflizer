# Direct Badly Hurt injury results

Observed 2026-11-14. Schema2.64 / dice-only-33 / mobility-possession-42. Partial work under NUF-011/014/018/021/022/027; no original issue closes.

`ResultInjuryRoll`, RollType11, Outcome3 now retains the categorical label **Badly Hurt** for ReplayVersion1-4-0-0. This fills an omitted initial injury branch. A label establishes neither the applicable distribution nor treatment, final removal, availability or match value. The existing damage-header, subject/ownership, dice, status, field and version checks still apply. Embedded KO observations remain restricted to KO; treatment-question codes use their own namespace.

Current follow-up: schema2.65 independently qualifies demo6/source248 through its current trait/causal/SPP prefix, while the other seven direct Badly Hurt records remain unscored. The statements below describe the schema2.64 checkpoint. See [injury transaction evidence](INJURY_TRANSACTION_EVIDENCE.md).

## Independent evidence

- The previously frozen installed executable snapshot (SHA256 `590787b522ad4404b2e8a7570993375114a794fa4288d88a8595ab9dfbd7d6ae`) contains the contiguous `EBB3NetGameplayInjuryOutcome` entries Stunned0, Reserve1, Ko2, BadlyHurt3, Casualty4. This is extracted build evidence, not official protocol documentation or a guarantee for every build.
- A new stdlib-only extractor decodes the original twelve sanitized replays without importing application mappings, eligibility or scoring. Eight direct code3 records occur in five files. All eight initially observed subjects have Stunty; seven totals are9 without modifiers, and one total8 has an explicit +1 modifier. The seed corroborates the mapping; it does not certify current effective traits. Missing Modifiers and explicit empty Modifiers are distinguished.
- The BB2020 primary rulebook, printed p60, assigns Stunty total9 to Badly Hurt. The existing UI-009 annotation independently shows a Stunty9/Badly Hurt treatment question whose nested Outcome is1. This corroborates the injury meaning while demonstrating why question code1 cannot become a direct injury mapping. No new game playback or controlled capture is claimed.

The original raw injury fixture, enum snapshot, UI annotation and their hashes remain unchanged. Run `python3 scripts/extract-direct-badly-hurt-evidence.py --check` to reproduce the new [source receipt](../tests/fixtures/evidence/bb3-direct-badly-hurt.json), including all source hashes, locators, numeric headers/rolls and the counterexample.

| File | Source IDs | Recorded subjects |
| --- | --- | --- |
| demo-goblins1 |1003,2830,3083 |10,48,46 |
| demo10 |1121 |48 |
| demo4 |2833 |49 |
| demo6 |248,3956 |47,45 |
| demo8 |2870 |8 |

## Scoring and conservation

The existing unmodified table and ordinal scoring policy now accept the direct Badly Hurt branch when their separate current-trait and causal guards qualify it. Badly Hurt and a pending Casualty remain one initial removal tier: Stunty counts15/11/(4+6) give total9 a raw deviation−13/18, weighted−13/12. No extra casualty roll, league-damage price or availability value is added.

An exact9b3b214 archive, independently verified against all500 tracked Git blob hashes, reproduces the consequence of the omission: each fully qualified synthetic Stunty profile admits only32 of36 faces. The four omitted total9 faces each have weighted contribution−13/12, so treating their unscored contribution as zero leaves a positive fair-draw mean13/108 (about0.12037). The current implementation admits36/36 and the actual mean is zero for both Stunty profiles. Ordinary profiles are unchanged zero-mean controls. This is a bias in the stated conditional component; it does not claim that an old whole-match verdict was decisive or that these synthetic profiles certify the public replays' current traits. Parent/current measurements remain in the temporary publication evidence, outside the repo.

The existing full parser/cause/schema test now covers all144 ordered faces of the ordinary, ordinary+Thick Skull, Stunty and Stunty+Thick Skull tables. Each profile admits36 faces and its actual scored deviations sum to zero. The separate committed Mighty Blow-on-armor gate also checks all144 faces against its unchanged exact-rational references, including Badly Hurt. The previous deliberate code3 omission is replaced with the independent direct mapping; unknown code5, code1 and the existing unsupported-version/status/ownership/modifier/field/cause guards remain tested. Export forgeries cannot substitute code1, another injury name, a treatment tag or an unrelated current table.

The eight public records still lack separately qualified scoring policies and remain unscored, with null binary probability/success and zero contribution. Across complete reports for all twelve replays, all1,460 previously scored event objects,18,441 physical dice records/dispositions, category/team totals, rankings,173 choices,6,798 counter checkpoints,533 end notifications,111 numeric groups,27 contextual ranges/zero public point components and abstentions remain identical to9b3b214. Only the eight observation/explanation records, their exclusion-reason buckets and derived report IDs change, alongside the explicit version/time fields. Maximum compact report size remains2,712,634 bytes, below the unchanged4MB cap.

API and CLI assertions extend existing demo6 worker requests; the HTTP gate still makes exactly ten POSTs. Desktop/mobile inspection covers the recorded label, unknown odds, unscored filtering, Why explanation, JSON parity and reset. Browser view tests consume the same source report; actual transport is verified separately by the existing bounded HTTP/CLI workers.

Full adaptive damage/modifier/treatment/recovery policy, current legal state, combined contextual valuation, held-out calibration, integrated product acceptance and current-schema hosting remain open. All original IDs, work/acceptance packets, priorities, dependencies and ledger statuses remain;17 done/14 in_progress/one open. Runtime4s/256MiB, input/XML/event/report caps and ten admissions/two leases remain unchanged.
