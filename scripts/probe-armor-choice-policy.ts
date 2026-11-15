import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "../src/server/services/analyzeNufflizer";
import { armorChoicePolicyXml } from "../tests/helpers/armorChoicePolicy";

// NUF-036 acceptance: an optional post-roll policy must be uniformly unscored. An excluded value is UNKNOWN, not zero:
// report the admission split and the mean of admitted values separately.
const reference = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-armor-choice-policy.json", "utf8")
);
const results = reference.profiles.map(
  (profile: {
    policy: string;
    holdChance: string;
    rows: { dice: [number, number]; use: boolean }[];
  }) => {
    const contributions: number[] = [];
    let excluded = 0;
    for (const row of profile.rows) {
      const r = analyzeNufflizerInput(
          armorChoicePolicyXml(...row.dice, row.use)
        ),
        e = r.events.find((e) => e.metadata.rollType === 10)!;
      if (e.scoringStatus === "scored") contributions.push(e.weightedDelta);
      else excluded++;
    }
    const sum = contributions.reduce((a, b) => a + b, 0);
    return {
      policy: profile.policy,
      referenceFullPolicyHoldChance: profile.holdChance,
      admitted: contributions.length,
      excluded,
      meanAmongAdmitted: contributions.length
        ? sum / contributions.length
        : null
    };
  }
);
console.log(JSON.stringify({ issue: "NUF-036", results }));
if (results.some((r: { admitted: number; excluded: number; meanAmongAdmitted: number | null }) =>
  r.admitted !== 0 || r.excluded !== 36 || r.meanAmongAdmitted !== null)) process.exitCode = 1;
