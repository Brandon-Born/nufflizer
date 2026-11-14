# Recorded casualty outcomes and treatment roles

Observed2026-11-14. Schema2.66 / dice-only-34 / mobility-possession-42. Partial progress under NUF-011/014/018/020/021/022/027; every original incomplete acceptance requirement remains.

The report now names recorded D16 casualty results and distinguishes direct rolls, originals embedded in treatment questions, replacement dice and the later applied treatment decision. These observations retain unknown odds, null binary results and no luck or contextual contribution. A permanent league injury is not silently priced as current-match impact. Existing initial-injury and recovery scores remain separate.

## Independent source and rule evidence

The [stdlib extractor](../scripts/extract-casualty-observation-evidence.py) decodes all twelve original sanitized replays without importing application mappings, admission or scoring. Its [receipt](../tests/fixtures/evidence/bb3-casualty-observations.json) preserves every source SHA256, literal locator/header/subject/roll, modifier presence/emptiness and initial roster IDs. It contains63 raw roots:45 direct results, ten embedded originals, four replacements and four copied originals. All59 actual observation rows join their raw source; copied roots remain summaries. `python3 scripts/extract-casualty-observation-evidence.py --check` reproduces the receipt.

All63 raw roots have an explicit Modifiers element. Among the45 direct rolls,44 lists are empty and one has a numeric modifier. An early numeric-only projection dropped empty XML elements and made them look omitted; the new evidence explicitly preserves presence and emptiness. Two embedded originals and one replacement/copy also carry numeric modifiers. This source detail does not establish full modifier legality or a counterfactual probability policy.

The existing frozen installed snapshot (executable SHA256590787b522ad4404b2e8a7570993375114a794fa4288d88a8595ab9dfbd7d6ae) has matching BoardDataCasualtyOutcome and NetGameplayCasualty member/value tables. Both independent enum namespaces are checked against the original snapshot hash. Naming evidence remains tied to that build; ReplayVersion1-4-0-0 is the admitted serialization scope, not a guarantee for other builds.

The Games Workshop2020 primary rulebook, printed61/PDF62, supplies the casualty and secondary lasting-injury tables ([primary document, mirrored PDF](https://www.tassidelmiele.it/wp-content/uploads/2021/02/OR2020.pdf), SHA2568598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3). The page was rendered and visually checked. Its categories distinguish future league harm; they do not independently price lost useful activations after treatment/recovery. No licensed book or executable asset is committed.

| Gameplay code | Recorded name | Source boundary |
| --- | --- | --- |
|0|No injury|Only the explicitly recorded replacement root in a treatment choice.|
|1|Badly Hurt|Casualty namespace; distinct from injury/treatment code meanings.|
|2|Seriously Hurt|Not injury-roll code2 KO.|
|3|Serious Injury|Not injury-roll code3 Badly Hurt.|
|4|Lasting Injury|The enum's generic category; no subtype or extra die is invented.|
|5|Smashed Knee|Secondary injury name.|
|6|Head Injury|Secondary injury name.|
|7|Broken Arm|Secondary injury name.|
|8|Neck Injury|Secondary injury name.|
|9|Dislocated Shoulder|Secondary injury name.|
|10|Dead|Recorded result, before separately evidenced treatment/recovery.|

Seventeen existing UI observations in fourteen independently annotated cases corroborate ordinary/modified casualty results, every secondary D6 face and original/replacement treatment behavior. The new receipt retains the original fixture hashes and every matching raw origin, including copied roots as counterexamples. These are existing playback observations, not new game captures. Synthetic fragment owner rosters are explicitly distinct from the full-source attribution checks.

UI-060 is the critical namespace/copy counterexample: the usage question records original D16=8/Outcome2, Seriously Hurt. A later choice records replacement D16=1/Outcome0, No Injury, while its copied OriginalRoll repeats8 with Outcome0. That copied code cannot rename the earlier observed original or add another draw. UI-065/066 independently distinguish keeping an original versus applying a replacement. UI-075/076 corroborate the Decay skill modifier and UI-078 the separate niggling-injury modifier namespace. Neither a displayed name nor a numeric modifier grants full skill/resource policy.

## Runtime and export contract

`casualtyObservation` contains the recorded outcome, role, affected player/team, source code and prior damage-header index. It requires the supported version; a strict direct payload or the correct RollInfos/NewRoll root; explicit Status1, one D16 and at most one secondary D6 with valid numeric faces/types; supported numeric modifier shape; and an applied, non-evaluation, ordinary-skill DamageStep with matching subject, target, action, sequence, source and order. Unknown fields, malformed dice/modifiers, duplicated headers, conflicting ownership and unknown outcomes cannot supply a named observation. Direct/original code0 is withheld. The copied OriginalRoll is never read as an observation.

Current ownership must separately resolve as confirmed, and each row retains a subject-role proof. All59 public proofs independently join the original raw roster evidence:15 initial and44 current-roster receipts. Fresh roster IDs can establish team membership while learned-trait data remains omitted; no complete skill list or distribution follows. A conflicting current roster, mismatched identity or unknown transition withholds the label. A future conflicting snapshot cannot rewrite the earlier subject's team. Existing identity/recruitment barriers remain.

The export schema validates the role's exact physical dice path, parent/source IDs and order, DamageStep subject, recorded source/status, dice values/types, unscored disposition and current ownership receipt. A copied summary/alias cannot certify an original or replacement observation. The observation must remain excluded with null binary odds/results, zero deltas and no injury table, scored injury policy, context point or range. Unknown numeric modifiers can remain observed without granting odds. Ordinary injury11, casualty12, embedded treatment results and copied summaries retain separate namespaces.

Existing source-qualified Apothecary receipts remain the authority for an applied coach decision. Shared copy now names that applied result and cites the original/replacement source IDs, recorded resource use and unresolved eligibility/availability scope. Such a decision displays No new roll and adds no dice contribution. A replacement observation alone does not certify which result was applied. Full adaptive treatment, modifier/casualty distributions and final useful availability remain unfinished.

## Independent acceptance and complete conservation

An exactbeab0d65bdb2273e40db543ef433dfe095fbeea8 archive was verified against all515 tracked Git blob hashes before copying the four initial regressions only. A first test incorrectly looked for a direct result where the source uses a treatment question; the corrected four cases all fail on the unchanged archive and pass after implementation. Further tests cover strict payloads, direct-zero/unknown namespaces, secondary dice, current/ambiguous ownership, future invariance, copied-outcome mutations and forged role/source/physical/owner/score exports.

The independent source tests reproduce the extractor, check both enum tables and all source/annotation hashes, join every actual and copied root, and match all17 UI labels. The existing full ownership audit also checks the59 newly visible subject proofs against its original raw current-roster fixture; prior scored-source assertions remain. One test initially conflated omitted learned-trait data with absent roster membership; it now explicitly verifies known membership without inventing traits. An incorrectly escaped test filter skipped cases; the corrected focused run actually passes all138 selected cases. Neither episode relaxes a production guard or resets an existing golden.

Complete twelve-report comparison tobeab0d6 verifies every new observation/owner/name/reason/explanation against independent raw source and roster facts, then permits only those declared changes, recomputed exclusion-reason summaries and schema/time/report IDs. Every other field is exactly equal. Raw pre-Zod report IDs are independently recomputed; export field ordering is not the hash input.

| Complete comparison | Result |
| --- | --- |
|Scored event objects|All1,480 unchanged in full, including metadata.|
|Physical dice/aliases/dispositions|All18,441 exactly unchanged.|
|New observations|59:45 direct, ten originals, four replacements.|
|New ownership receipts|15 initial /44 current; all subject roles independently checked.|
|Resources|173 choices,6,798 clock checkpoints and533 end notifications unchanged.|
|Numeric rerolls / context|111 groups,27 ranges and zero public context points unchanged.|
|Team/category totals, ranking and verdict|Unchanged, including whole-match abstentions.|
|Largest compact report|2,714,024 bytes, below the unchanged4MB cap.|

## Product and execution evidence

The CLI prints all recorded casualty roles and separately applied treatment receipts, independently of top-swing selection. The actual demo3 CLI worker exports original source2033 Serious Injury, replacement2039 No injury and applied2043 replacement/one resource, preserving the copied original's physical alias. The existing demo3 HTTP request checks the same roles; the HTTP gate still makes exactly ten POSTs.

The full local `corepack pnpm verify` exits0:3,236 pure+42 isolated real CLI+ten HTTP=3,288 cases; actual two-handler Redis; lint/types; production build; all66 Chromium flows. Final plain-language copy receives another production build/full browser run and focused guards, with receipts in the execution ledger. The final pushed candidate has a separate exact-head CI receipt.

Browser plugin not available; repository Playwright is used at http://127.0.0.1:3000/nufflizier. Desktop1280×900/mobile390×844 checks cover page identity/content, no overlay/console errors, original/replacement/applied labels, unknown odds versus No new roll, excluded/scored filters, Why explanations, horizontally panned actual-result text, export parity and full reset. A second flow preserves source3891 Head Injury as unscored while its separate Regeneration source3894 remains+0.75. Screenshots are visually inspected outside the repository.

All32 original work/acceptance packets, ledger rows, priorities/dependencies/statuses and append-only logs remain. Ledger17 done/14 in_progress/one open; fifteen original issues incomplete. Runtime4s/256MiB/report4MB, every input/XML/event bound and ten admissions/two leases remain. Current-schema hosting, full effective/legal/modifier/treatment policy, causal contextual values, held-out calibration and integrated acceptance retain their original gates.
