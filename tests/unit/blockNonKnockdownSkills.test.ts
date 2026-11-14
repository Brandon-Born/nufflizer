import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { skillBlockXml } from "../helpers/skillBlock";

// Literal installed namespace IDs, cross-checked against the primary rule
// descriptions. Expected values are from [-1,+1,0,0,+1] over a six-face die
// [Skull,BothDown,Push,Push,Stumbles,Down], with Block against Dodge.
const skills = [47, 52, 59, 86, 100, 101, 102] as const;

describe("documented skills outside the immediate pool knockdown component", () => {
  for (const side of ["attacker", "defender"] as const)
    it.each(skills)(
      `retains the literal Block-vs-Dodge distribution with skill%s on the ${side}`,
      (skill) => {
        const a = [30, ...(side === "attacker" ? [skill] : [])];
        const d = [7, ...(side === "defender" ? [skill] : [])];
        const r = analyzeNufflizerInput(skillBlockXml(a, d, [1], [5]));
        const e = r.events.find((e) => e.metadata.block)!;
        expect(e.scoringStatus).toBe("scored");
        expect(e.probabilitySuccess).toBeNull();
        expect(e.actualSuccess).toBeNull();
        expect(e.delta).toBeCloseTo(5 / 6, 12);
        expect(e.weightedDelta).toBeCloseTo(5 / 8, 12);
        expect(e.metadata.block!.skillModel).toMatchObject({
          faceOutcomes: [0, 5, 4, 4, 6],
          outcomeDistribution: [1 / 6, 0, 0, 0, 1 / 2, 1 / 6, 1 / 6],
          expectedValue: 1 / 6,
          nonKnockdownSkills: {
            policy: "outside_current_pool_knockdowns",
            attacker: side === "attacker" ? [skill] : [],
            defender: side === "defender" ? [skill] : []
          }
        });
        expect(LuckReportSchema.safeParse(r).success).toBe(true);
      }
    );
});
