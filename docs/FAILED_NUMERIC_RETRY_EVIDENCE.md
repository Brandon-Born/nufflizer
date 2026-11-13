# Failed numeric retry policies

Scope: NUF-012/014/021/022/027, schema2.56/dice-only-29/context41. This component does not close an original issue. The ledger remains14 done/14 in_progress/1 open.

## Independent evidence

`python3 scripts/extract-numeric-gate-evidence.py --check` uses the standard-library XML decoder/inventory, without importing application parsers, maps, admission or probability code. Its [numeric-only artifact](../tests/fixtures/evidence/bb3-numeric-gates.json) binds all12 public file hashes. It selects every numeric question with a raw Loner/Pro gate before the next base-family result, independently of faces, outcomes, fallout or application admission. There are two prefixes. Exact numeric/empty/omitted payloads and locators are joined to the production parse in tests; BoardState remains a boundary without private text. This is a bounded public corpus inventory, not evidence of every possible policy.

| Source | Initial Dodge | Choice, skill, gate, kept | Observed resource |
| --- | --- | --- | --- |
| demo9, ReplayStep371/1/1/0 →372/1/0 | source3154: actor10/team0, face2, Requirement3/Difficulty3, no modifier | 3157 uses team reroll;3158 uses Loner44;3159 rolls2 at4+;3160 keeps original2 with Status1/NewRoll0 | One team reroll spent; gate grants no replacement |
| demo11, ReplayStep512/1/2/0 →513/1/0 | source4546: actor38/team1, face1, Requirement2 with fixed−1 zone modifier from holder14, Difficulty3 | 4548 uses no team reroll;4549 uses Pro50;4550 rolls2 at3+;4551 keeps original1 with Status1/NewRoll0 | Pro used; zero team rerolls spent |

GR-004 in [the in-game skill reference](GAME_SKILL_REFERENCE.md) and UI-007/020 in [paired playback evidence](REPLAY_UI_EVIDENCE.md) distinguish Loner access, spending and replacement. Loner3+/4+ variants have separate verified skill identities; this does not promote2+/5+ variants. GR-025 and UI-047/087 distinguish Pro's3+ gate from the die it may reroll. The original question has only the corresponding team/Pro option and no star-special option. Availability flags alone do not establish general legal eligibility, frequency or later fallback policies.

## Qualification and arithmetic

The new pure matcher requires a separately qualified fresh failed original inside a question; ordinary-Move Dodge roles; current ownership at every linked source; matching State1→State2 headers, including geometry; exactly the next source frame; optional checkpoint Carrier only; and adjacent choice→skill→gate→kept messages0–3. The kept payload must equal the original with NewRoll0. Unknown fields, modifiers, actors, gamers, namespace, freshness, order or continuation shapes withhold the policy while retaining independently valid first-die evidence. Any reused original/choice/skill/gate/kept prefix rejects both contenders. Later movement, armor, injury and turnover do not select admission.

For a **fixed policy** of retrying this one die after an initial failure iff its gate passes, let `p` be the single-Dodge success chance and `g` the gate success chance. The whole-check chance is `p + (1-p) × g × p`. It includes both first successes and initial-failure branches; it is not a full-reroll probability and not a conditional chance of rescuing an already failed action.

- 3+ Dodge with4+ Loner: `2/3 + 1/3 × 1/2 × 2/3 = 7/9`.
- 3+ Dodge with3+ Pro (or the separately verified3+ Loner variant): `2/3 + 1/3 × 2/3 × 2/3 = 22/27`.
- The paired2+ action/4+ Loner arithmetic reference is65/72; a hypothetical2+ action/3+ gate gives25/27. Neither is35/36, which requires an unconditional full retry.

Independent enumeration covers every6³ first/gate/replacement leaf for each2+–6+ base target and3+/4+ gate. Unused gate/replacement coordinates are marginalized when the first succeeds. The public-source cuts stop at original, choice, skill, gate and kept result, so future fallout cannot qualify a receipt. A synthetic use of the independently verified Loner3+ rule checks that the implementation does not hardcode4+.

## Shared report and user explanation

`failedNumericRetry` belongs to the excluded kept summary and carries source IDs plus base, gate and fixed-policy chances. The schema reconciles unique ordered actor/choice/skill/gate sources, current original odds, retained physical-die aliases, gate freshness/threshold and resource accounting. Conditional odds cannot populate the kept summary's applied probability, create another draw or add dice/context points. Shared UI/CLI text explains one spent team reroll despite Loner failure, or Pro with zero team spending, and explicitly keeps general eligibility and tactical cost unknown. The original first die retains its existing single-attempt contribution. The gate remains visible and unscored; a full fair gated-scoring model is still separate work.

The gate owns the resource-spend field exactly once; the kept receipt references that gate and cannot claim a second spend. The Pro skill control becomes visible as an observed use; its raw source was always present. Existing sourceRecordCount and physical dice are preserved. There is no post-choice counter/reset inference. The original4s/256MiB/4MB and upload/XML/event/quota/lease limits are unchanged. HTTP acceptance remains exactly ten admissions, extending its existing demo11 request. Real CLI cases run only in the serial worker gate. Browser flows use actual domain reports with deterministic response interception; real HTTP workers are tested separately.

## Acceptance boundaries

Original NUF-012 still requires mixed/partial policies, restrictions, source-specific eligibility and turn-wide resources. NUF-014's unique-outcome/causal coverage, full state/legal successors, context/calibration and current-schema hosted integration retain their original requirements. Neither a visible gate nor conditional arithmetic supplies those missing outcomes. Exact final gates and complete twelve-parent conservation are recorded in the matching [implementation entry](IMPLEMENTATION_LOG.md). No provider, account, Stripe, billing, deployment, production or legacy action is part of this component.

Final local `corepack pnpm verify` passes2,673 unit/API cases (2,632 pure,31 serial CLI,10 isolated HTTP), real Redis/build and45 Chromium flows. Complete12-parent conservation retains all2,234 scored objects/111 numeric rerolls, physical dice/aliases,27 ranges/zero context points and abstentions. Only the two explanatory receipts, Pro gate metadata, one non-random Pro control and its derived visibility counts change. The gate remains the sole spend owner. Exact commands, comparison hashes, screenshots and CI handoff are in the implementation record.
