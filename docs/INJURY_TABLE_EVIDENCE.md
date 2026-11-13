# Conditional injury tables

Observed 2026-11-12. Owning IDs NUF-009/011/013/016/018/021/022. This advances the injury-distribution prerequisite; it does not close those issues.

## Rule and version evidence

The published **Blood Bowl Second Season (2020)** rulebook, printed p60 (PDF page61), supplies ordinary and Stunty injury tables. Printed p80 (PDF page81) supplies Thick Skull's two branches. The inspected reference is a [mirrored copy of the original rulebook](https://www.tassidelmiele.it/wp-content/uploads/2021/02/OR2020.pdf#page=61), SHA256 `8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3`. The book and page render remain temporary, outside Git. These are paraphrased rule facts and derived counts, not reproduced rulebook pages.

The existing in-game GR-010 tooltip independently corroborates Thick Skull's ordinary8/Stunty7 exceptions. UI-035 contrasts a Thick Skull total8 Stunned with UI-044's total8 KO; UI-025 supplies a Stunty7 KO and UI-035 a Stunty6 Stunned. UI-009's Stunty9 pending Apothecary outcome remains a separate namespace counterexample. See [skill observations](GAME_SKILL_REFERENCE.md) and [paired replay observations](REPLAY_UI_EVIDENCE.md). The rulebook edition does not certify later tabletop rules, another replay version, every installed build, or arbitrary house/event rules. Runtime admission remains ReplayVersion1-4-0-0 with qualified current identity/traits and empty effect/transformation/prayer evidence.

## Independently derived reference

The outcome order is **Stunned / KO / Badly Hurt / Casualty**. All counts are out of36 equally likely ordered2D6 faces, conditional on reaching the injury roll and applying no injury modifier.

| Table | Counts |
| --- | --- |
| Ordinary |21 /9 /0 /6 |
| Ordinary, Thick Skull |26 /4 /0 /6 |
| Stunty |15 /11 /4 /6 |
| Stunty, Thick Skull |21 /5 /4 /6 |

`scripts/extract-injury-table-evidence.py --check` independently reproduces [numeric witnesses](../tests/fixtures/evidence/bb3-injury-tables.json), using the triangular multiplicities of totals2–12 rather than importing the runtime face enumerator. It reads only public sanitized replay files and standard-library XML, preserving original source hashes, numeric step/roll fields, roster seeds, partial Data refreshes, last current player observation and explicit empty modifier evidence. No names or private match data are introduced.

## Source qualification and limits

Six candidate receipts across demo5/demo8/demo10 retain complete initial trait seeds and supported continuity to a current checkpoint. Four admit the conditional table: demo10 ReplayStep23/child1/step1/message2 (ordinary KO), demo10 26/1/1/1 (ordinary Stunned), demo5 29/1/1/1 (ordinary KO), demo8 45/1/10/1 (Stunty Stunned after a failed Rush). Two candidates retain unsupported skill lists and receive no model. Every other injury observation keeps its prior unknown odds rather than inheriting missing traits. Current physical flags and raw pre-roll fields are never restored by the separate intrinsic-trait receipt.

Source0/1/9 direct injury rolls require their existing qualified categorical observation, explicit empty raw Modifiers, zero normalized modifier sum, supported complete innate/acquired lists and an ordered owned trait checkpoint before the damage step. The observed dice/result must agree with the selected unmodified table. Missing/unknown lists, effects, prayers, transformations, intervening unknown messages, ownership conflict, post-damage observations, applied modifiers, unsupported versions and mismatched outcomes withhold the model. Intrinsic recovery traits do not by themselves change the injury table or settle subsequent availability. Direct code3 remains unverified even though the theoretical table contains a Badly Hurt branch; the model does not promote its serialization namespace.

Schema2.41 carries a separate fixed_unmodified_injury model with four counts/probabilities and current-trait provenance. This is a fixed conditional rule model, not certified odds for an adaptive coach's actual modifier/treatment policy. Binary probabilitySuccess/actualSuccess remain null, the event remains excluded, and no dice/context score, support-count promotion, recovery or final-availability claim is added. UI/CLI/JSON explain the distinction. Full modified tables/policies, casualty selection, representative mitigation/recovery state chains, useful activations, contextual valuation and calibration remain open under the original issue criteria.


## 2026-11-13 — separately qualified actual initial-roll scoring

Schema2.48/dice23 retains all nine existing conditional table receipts and adds a separate categorical scoring policy for seven source injuries. An owned on-pitch subject, immediate own verified armor break and source-qualified ordinary-block/self-fall cause are required. Opposing blocker traits must establish a fixed unmodified injury policy; an empty actual modifier list is insufficient for Mighty Blow. Pro is not an injury reroll. The ordinal raw-dice comparison is zero-mean and leaves binary success/odds null; treatment/recovery/final availability and tactical value remain separate. Original direct code3 and unsupported choice/source variants remain unscored. See [the complete source, arithmetic and shared-surface evidence](CATEGORICAL_INJURY_EVIDENCE.md). The earlier conditional-table-only descriptions above are historical scope, not permission to score every current table.

Primary-page correction (2026-11-13): direct inspection of the same hash-bound PDF places Thick Skull beside Mighty Blow on printed80/PDF81, correcting the older85 pointer in this document, extractor metadata and runtime comment. The four injury tables, counts, rule behavior and source projections are unchanged. Pro's exclusion is printed77/PDF78.
