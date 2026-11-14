# Categorical block scoring evidence

Base evidence: schema2.61, dice-only-31, mobility-possession-41. Current schema2.63/dice32 extends the qualified skill scope; see [the current classification evidence](BLOCK_SKILL_EFFECT_SCOPE.md). This advances
NUF-010/012/014/018/019/021/022/027; it does not close their broader acceptance.
All fifteen original incomplete issues remain incomplete.

## Defect and metric

Exact parent16c7ff835ea56d58a51bf3f5be5b10a126475890 scores a fresh block pool by
raw symbol rank, even when it already has a different skill-conditioned outcome
table. Block can make Both Down favorable; Dodge can make Stumbles a push.
The old raw-symbol binary score can therefore disagree in sign with the offered
knockdown opportunity. A raw symbol is evidence, not an unconditional success.

`categoricalBlock.ts` now uses the already qualified, prefix-time intrinsic
trait table. Utility is defender knockdowns minus attacker knockdowns. Under
the stated fixed policy the attacker maximizes this balance and a defending
chooser minimizes it. Optional Wrestle is used only when it improves its
holder's balance; ties decline. Only fresh indexes are fairly enumerated;
retained dice stay fixed. Each actual fresh pool contributes:

`(offered balance - fair conditional mean) × 0.75`

The existing block category weight is unchanged. Actual die choice, later
applied resolution, push/ball/armor results and reroll resource price cannot
select the metric or its mean. Those remain separate observations or components.
This innovation has zero conditional mean under the stated fair-draw policy,
including an adaptive decision to buy another admitted draw. It is a provisional
dice component, not calibrated tactical or match value.

Binary success and success probability are null for every admitted raw pool.
Qualified pools carry `blockScoring`, `probabilityPolicy=categorical_block`,
the source ID and observed/expected balance. No categorical rarity-tag policy
is asserted. A pool without a qualified current table is excluded with null
odds and zero contribution, while its raw symbols, roles, selected face and
applied aftermath remain observable. This is missing evidence, not even luck.
`blockResolution.unscoredPool` identifies partial damage subtotals that do not
contain a block value. An unknown pool cannot create a measured zero entry.

Current trait qualification requires the existing complete intrinsic lists,
same-instance prefix continuity, owned opposing roles and current on-pitch and
tackle-zone observations, without known active effects/transformations/prayers
or nonzero status. Missing posture remains unknown. This conditional intrinsic
model does not certify full legal eligibility, the coach's actual choice,
all optional-skill policies or a legal complete match. Brawler and other
unsupported skill combinations retain raw evidence without this score.

## Independent arithmetic and source evidence

- `categoricalBlock.test.ts`: ten literal one/two/three-die source cases plus
  two unsupported-skill negatives. The ten arithmetic XML inputs are byte
  identical to the preserved exact-parent reproduction. Parent gives twelve
  failures; current gives twelve passes. All474 tracked parent blobs were
  independently verified against git object IDs before the fresh comparison.
- Literal checks include Block Both Down +2/3, Block against Dodge Stumbles
  -1/6, a defending two-die chooser +7/36 and three skulls -367/216 before weight.
  Both Down with opposing/both Block and both Wrestle holders remain distinct.
- `categoricalBlockPolicies.test.ts`:2,064 actual XML prefixes covering four
  literal skill profiles, both choosing sides and one/two/three dice. Each
  fair stratum has zero mean.108 whole team-reroll trees cover always, never
  and attacker-down-only policies. Selection invariance, future-prefix
  stability, four misplaced-policy/unknown-odds probes and ten scoring forgeries are separate checks. The existing1,024
  exact rational skill-table oracle also retains partial-die conditional cases.
- `extract-block-scoring-evidence.py --check` uses only Python stdlib/raw XML,
  selecting **all848 questions before support, values or flags** across twelve
  SHA-linked sources. Every public question joins once with its raw dice/types;
  all833 pool locators/faces/outcomes/fresh indexes/choosers join independently.
  The fixture retains nullable current board/roles and prior complete list
  observations, without names or fabricated empty lists/statuses.
- The fixture's exact Fraction reference is explicitly a
  `last_complete_lists_hypothesis`, never an admission/continuity certificate.
  All fifteen admitted scores additionally join their runtime current-board
  and seed receipts to physical source locations and current raw flags before
  their values/means/deltas/weighted values are checked against that reference.
  Thirteen and nineteen in this narrow oracle are Mighty Blow1 and Regeneration,
  outside immediate knockdown utility; other unmodeled skills remain unknown.
- Equal emitted-event checkpoint coordinates now require strict physical XML
  order (or the initial board followed by the first located board). Duplicated,
  missing and backward physical locations break continuity. A malformed later
  refresh cannot erase a previously established prefix or seed later evidence.
- A contradictory recorded team use with `CanUseTeamReroll=0` cannot admit a
  replacement pool. Its first draw and raw Used1 observation remain; resource
  linkage and replacement luck stay unresolved. This is not a complete
  frequency, mixed-skill, per-die or whole-turn resource policy.

## Complete parent conservation

Fresh schema-valid reports were captured serially from exact16c and current
source, independently of deadline workers. All twelve complete parent objects
match after **only** independently checked scoring/display/subtotal changes,
their derived coverage/team totals/ranking, the explicit limitations sentence,
model/schema versions and generated ID/time metadata are restored. No golden
fingerprint is reset. Historical raw-symbol projections remain historical
compatibility checks; separate rational/source cases establish current behavior.

The corpus retains all833 raw pools. Fifteen existing skill models (five demo5,
ten demo10) now contribute categorical values;818 unknown-table pools cease
contributing raw-symbol points. The1,403 other scored event objects remain
deeply identical, giving1,418 current scored events. All18,441 physical dice
records and aliases are identical except818 covered→unscored dispositions.
Every173 recorded resource choice,6,798 checkpoint,533 end notification,
106 offer receipt,86 counter receipt,111 numeric reroll group, eight injury
contribution and nine injury table is retained. All695 observed block
resolutions,599 push receipts (including unsupported observations), four
crowd chains and nineteen first ball releases remain.27 context ranges/zero
public context points and all whole-match abstentions are unchanged. Maximum
compact report:2,685,113 bytes, below the unchanged4MB cap.

The shared UI shows Categorical / Offered balance for known tables and
Observed symbols / Not scored for unknown pools. Why explains the fixed policy,
raw/selected/applied distinction and partial subtotals. CLI text lists all
qualified pool contributions and counts unknown pools; JSON shares the report.
The existing demo5 real HTTP request and dedicated real CLI case check positive,
negative and unknown-pool integration without another HTTP admission.

Current local/CI verification receipts are recorded in IMPLEMENTATION_LOG.
Current-schema hosted checks, full effective-skill and optional choice policies,
legal successor/context integration and quantitative calibration remain open.
Worker4s/256MiB/report4MB and ten admissions/minute/two leases are unchanged.
