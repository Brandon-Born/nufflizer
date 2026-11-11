import { describe, expect, it } from "vitest";
import { playbackFragment } from "../helpers/playback";
import { observeRecruitmentPurchases } from "@/domain/replay/recruitment";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

function fragment() {
  return playbackFragment("008", "UI-087", [], [], true);
}
function purchases(r = fragment()) {
  return observeRecruitmentPurchases(r);
}

describe("source008 purchase and replacement evidence (NUF-013/016)", () => {
  it("binds both selected types to their first following roster without inheriting old traits", () => {
    const r = fragment();
    const found = purchases(r);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({
      playerId: "48",
      playerTypeId: 1455,
      gamerId: 1,
      candidateTeamId: 1,
      rosterTeamId: "1",
      checkpointReplayStep: 7,
      checkpointChildIndex: 3,
      innateSkills: [7, 44, 49, 55, 77],
      acquiredSkills: null
    });
    expect(found[1]).toMatchObject({
      playerId: "48",
      playerTypeId: 1121,
      rosterTeamId: "1",
      checkpointReplayStep: 9,
      checkpointChildIndex: 3,
      innateSkills: [25, 44, 50, 54, 17],
      acquiredSkills: null,
      previousPurchaseSourceId: found[0]!.sourceId
    });
    expect(found[1]!.removalSourceId).toBeDefined();
    const current = r.boardCheckpoints!.find((c) => c.replayStep === 9)!;
    expect(
      current.board!.teams[1]!.players.find((p) => p.id === 48)!.traits
    ).toBeNull();
    const report = LuckReportSchema.parse(analyzeReplayLuck(r));
    expect(report.recruitments).toEqual(found);
    expect(
      report.events
        .filter((e) => e.metadata.mercenary)
        .every(
          (e) => !e.metadata.isRollCandidate && e.scoringStatus === "excluded"
        )
    ).toBe(true);
    report.recruitments[1]!.previousPurchaseSourceId = "missing-source";
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
  it.each([
    "unknown_type",
    "duplicate_candidate",
    "contradictory_roster",
    "intervening_identity",
    "missing_first_roster"
  ] as const)("withholds a roster binding after %s", (change) => {
    const replay = fragment();
    const events = replay.turns.flatMap((t) => t.events);
    const buy = events.filter((e) => e.sourceTag === "EventBuyMercenary")[1]!;
    const payload = buy.payload!;
    if (change === "unknown_type") payload.MercenaryType = "99999";
    if (change === "duplicate_candidate") {
      const categories = (
        payload.TeamInducementsData as {
          InducementsCategories: {
            InducementsCategory: {
              Players?: { PlayerData: { IdPlayerTypes?: string } };
            }[];
          };
        }
      ).InducementsCategories.InducementsCategory;
      categories.push(
        structuredClone(
          categories.find(
            (c) => c.Players?.PlayerData.IdPlayerTypes === "1121"
          )!
        )
      );
    }
    const checkpoint = replay.boardCheckpoints!.find(
      (c) => c.replayStep === 9
    )!;
    if (change === "contradictory_roster")
      checkpoint.board!.teams[1]!.players.find((p) => p.id === 48)!.traits = {
        dataPlayerId: 48,
        playerTypeId: 1455,
        innateSkills: [7],
        acquiredSkills: null
      };
    if (change === "missing_first_roster")
      checkpoint.board!.teams[1]!.players =
        checkpoint.board!.teams[1]!.players.filter((p) => p.id !== 48);
    if (change === "intervening_identity") {
      const turn = replay.turns.find((t) => t.events.includes(buy))!;
      turn.events.splice(turn.events.indexOf(buy) + 1, 0, {
        ...buy,
        id: "intervening-removal",
        sourceTag: "EventRemoveMercenary",
        sourceIndex: buy.sourceIndex! + 1
      });
      checkpoint.afterSourceIndex = buy.sourceIndex! + 1;
    }
    const second = purchases(replay)[1]!;
    expect(second.rosterTeamId).toBeNull();
    expect(second.checkpointAfter).toBeNull();
  });
  it("does not bind an earlier purchase to a convenient later observation", () => {
    const r = fragment();
    const original = r.boardCheckpoints!.find((c) => c.replayStep === 9)!;
    r.boardCheckpoints!.push({
      ...structuredClone(original),
      afterSourceIndex: original.afterSourceIndex + 100
    });
    original.board!.teams[1]!.players =
      original.board!.teams[1]!.players.filter((p) => p.id !== 48);
    expect(purchases(r)[1]!.rosterTeamId).toBeNull();
  });
});
