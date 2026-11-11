import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { explainPickupBallChain } from "@/domain/nufflizer/presentation";

function replay(name: string) {
  return parseReplayXml(
    decodeReplayInput(readFileSync(`demo-replays/${name}`, "utf8")).xml
  );
}
function at(
  r: ReturnType<typeof analyzeReplayLuck>,
  sequence: number,
  type = 4
) {
  return r.events.find(
    (e) =>
      e.metadata.actionId?.startsWith(`sequence-${sequence}-`) &&
      e.metadata.rollType === type &&
      e.scoringStatus === "scored"
  )!;
}

describe("observed pickup/bounce/catch branches (NUF-016/018/022)", () => {
  it.each([
    ["demo11.bbr", 186, "6", "9", [20, 8], -1.1 / 6],
    ["demo3.bbr", 415, "42", "45", [15, 10], (1.1 * 2) / 3]
  ] as const)(
    "reconciles independently decoded %s pickup and successful catch",
    (file, sequence, actor, receiver, to, subtotal) => {
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay(file)));
      const pickup = at(r, sequence);
      const chain = pickup.metadata.pickupBallChain!;
      expect(pickup.playerId).toBe(actor);
      expect(chain.bounceSourceIds).toHaveLength(1);
      expect(chain.catchEventIds).toHaveLength(1);
      expect(chain.endingCell).toEqual({ x: to[0], y: to[1] });
      const caught = r.events.find((e) => e.id === chain.catchEventIds[0])!;
      expect(caught).toMatchObject({
        playerId: receiver,
        actualSuccess: true,
        scoringStatus: "scored"
      });
      expect(chain.diceByTeam[pickup.teamId]).toBeCloseTo(subtotal, 12);
      expect(
        r.teams.find((t) => t.teamId === pickup.teamId)!.luckScore
      ).toBeCloseTo(
        r.events
          .filter((e) => e.teamId === pickup.teamId)
          .reduce((sum, e) => sum + e.weightedDelta, 0),
        12
      );
      expect(pickup.contextualImpact).toBeUndefined();
      chain.diceByTeam[pickup.teamId]!++;
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );

  it("links demo1's two declined originals and second bounce without adding dice", () => {
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay("demo1.bbr")));
    // Independent sequence60 question Pickup4+ on3, kept61/0; bounce2
    // to[4,5]; Catch5+ on3 kept62/0; bounce4 to[3,5].
    const pickup = at(r, 61);
    const chain = pickup.metadata.pickupBallChain!;
    expect(chain).toMatchObject({ endingCell: { x: 3, y: 5 } });
    expect(chain.bounceSourceIds).toHaveLength(2);
    expect(chain.catchEventIds).toHaveLength(1);
    expect(chain.diceByTeam[pickup.teamId]).toBeCloseTo(-11 / 12, 12);
    const caught = r.events.find((e) => e.id === chain.catchEventIds[0])!;
    expect(caught).toMatchObject({
      playerId: "1",
      actualSuccess: false,
      metadata: { teamRerollsSpent: 0, rerollUsed: false }
    });
    expect(explainPickupBallChain(pickup)).toContain(
      "2 recorded bounces and 1 linked catch check"
    );
    chain.catchEventIds.push(chain.catchEventIds[0]!);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });

  it("keeps hypothetical opposing receivers' dice contributions on their own team", () => {
    const model = replay("demo11.bbr");
    // Ownership permutation tests bookkeeping, not a new gameplay observation.
    model.playerOwnershipKeys = model.playerOwnershipKeys?.filter(
      (key) => key !== "0:9"
    );
    model.playerOwnershipKeys?.push("1:9");
    delete model.playerNamesByTeamAndId?.["0:9"];
    model.playerNamesByTeamAndId ??= {};
    model.playerNamesByTeamAndId["1:9"] = "Opposing receiver";
    for (const turn of model.turns)
      for (const event of turn.events)
        if (event.playerId === "9") {
          event.actorTeamId = "1";
          event.teamId = "1";
        }
    const r = LuckReportSchema.parse(analyzeReplayLuck(model));
    const chain = at(r, 186).metadata.pickupBallChain!;
    expect(chain.diceByTeam["0"]).toBeCloseTo((-1.1 * 2) / 3, 12);
    expect(chain.diceByTeam["1"]).toBeCloseTo(1.1 / 2, 12);
  });

  it.each([
    "wrong_direction",
    "different_ball",
    "interruption",
    "wrong_catch_cell"
  ] as const)("withholds unsupported causal links after %s", (change) => {
    const model = replay("demo11.bbr");
    const turn = model.turns.find((t) =>
      t.events.some((e) => e.actionId === "sequence-186-step-3")
    )!;
    const bounce = turn.events.find(
      (e) => e.sourceTag === "BallStep" && e.actionId === "sequence-186-step-3"
    )!;
    const direction = turn.events.find(
      (e) => e.actionId === bounce.actionId && e.sourceTag === "ResultRoll"
    )!;
    if (change === "wrong_direction")
      direction.payload!.Dice = { Die: { DieType: 1, Value: 4 } };
    if (change === "different_ball") bounce.payload!.BallId = 1;
    if (change === "interruption")
      turn.events.splice(turn.events.indexOf(bounce), 0, {
        type: "unknown",
        sourceTag: "UnverifiedMutation"
      });
    if (change === "wrong_catch_cell")
      turn.events.find(
        (e) =>
          e.sourceTag === "PlayerStep" && e.actionId === "sequence-186-step-4"
      )!.payload!.CellFrom = { X: 21, Y: 8 };
    const r = LuckReportSchema.parse(analyzeReplayLuck(model));
    const chain = at(r, 186).metadata.pickupBallChain;
    if (change === "wrong_catch_cell") {
      expect(chain!.bounceSourceIds).toHaveLength(1);
      expect(chain!.catchEventIds).toHaveLength(0);
    } else expect(chain).toBeUndefined();
  });

  it("has zero mean when a second check is rolled only after the first fails", () => {
    // Independently enumerate a fixed Pickup3+, then Catch4+ if needed.
    // All eight bounce directions use the same declared landing policy.
    let total = 0;
    for (let pickup = 1; pickup <= 6; pickup++)
      for (let direction = 1; direction <= 8; direction++)
        for (let caught = 1; caught <= 6; caught++)
          total +=
            1.1 * (Number(pickup >= 3) - 2 / 3) +
            (pickup < 3 ? 1.1 * (Number(caught >= 4) - 1 / 2) : 0);
    expect(total / (6 * 8 * 6)).toBeCloseTo(0, 12);
  });
});
