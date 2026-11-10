// NUF-001 seed probe for still-open NUF-016–019. Printed observations are not expected game truth.
import { analyzeReplayLuck } from "../src/domain/nufflizer/analyzeLuck";
import { model, rollEvent } from "../tests/helpers/replay";
for (const [scenario, events] of [
  ["failed-pickup-at-first-source-position", [rollEvent()]],
  [
    "same-failed-pickup-after-nine-nonrandom-messages",
    [
      ...Array.from({ length: 9 }, () =>
        rollEvent({
          type: "unknown",
          sourceTag: "UnrelatedMessage",
          payload: {}
        })
      ),
      rollEvent()
    ]
  ],
  [
    "ten-independent-failed-pickups",
    Array.from({ length: 10 }, () => rollEvent())
  ]
] as const) {
  const report = analyzeReplayLuck(model([...events]));
  console.log(
    JSON.stringify({
      owners: ["NUF-016", "NUF-017", "NUF-018", "NUF-019"],
      scenario,
      observedDiceUnits: report.teams[0].luckScore,
      verdict: report.verdict,
      limitation:
        "No valid board/counterfactual model exists yet. Matched useful-activation, safe/exposed possession and late-winning-action captures remain required. Source position alone must not invent tactical leverage."
    })
  );
}
