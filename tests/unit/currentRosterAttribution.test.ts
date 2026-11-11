import { describe, expect, it } from "vitest";
import { contextReplayXml } from "../helpers/contextReplay";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

function introduced(interruption = false) {
  const xml = contextReplayXml({ interruption });
  const split = xml.indexOf("</InitialBoardState>");
  return (
    xml
      .slice(0, split)
      .replace(/<PlayerState><Id>10<\/Id>[\s\S]*?<\/PlayerState>/, "") +
    xml.slice(split)
  );
}
const check = (r: ReturnType<typeof analyzeReplayLuck>) =>
  r.events.find(
    (e) => e.metadata.sourceTag === "ResultRoll" && e.metadata.rollType === 2
  )!;

describe("current roster ownership (NUF-013/016)", () => {
  it("attributes an unnamed later roster member without treating turn inference as proof", () => {
    const r = analyzeNufflizerInput(introduced());
    const event = check(r);
    expect(event).toMatchObject({
      playerId: "10",
      teamId: "0",
      scoringStatus: "scored",
      metadata: { preRoll: { actorRosterTeamId: "0" } }
    });
    expect(event.probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(event.metadata.initialRosterName).toBeUndefined();
    expect(event.contextualImpact).toBeUndefined();
  });
  it("keeps contradictory explicit ownership unresolved", () => {
    const replay = parseReplayXml(introduced());
    const raw = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "ResultRoll")!;
    raw.actorTeamId = "1";
    raw.teamId = "1";
    raw.actorTeamSource = "explicit";
    const event = check(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    expect(event.teamId).toBe("unresolved");
    expect(event.scoringStatus).toBe("excluded");
    expect(event.metadata.preRoll?.actorRosterTeamId).toBe("0");
  });
  it("does not resolve an initial-roster conflict using membership alone", () => {
    const replay = parseReplayXml(introduced());
    replay.playerOwnershipKeys?.push("1:10");
    const event = check(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    expect(event.teamId).toBe("unresolved");
    expect(event.scoringStatus).toBe("excluded");
  });
  it("does not carry ownership through an unverified mutation", () => {
    const event = check(analyzeNufflizerInput(introduced(true)));
    expect(event.teamId).toBe("unresolved");
    expect(event.scoringStatus).toBe("excluded");
  });
  it("requires unique current membership", () => {
    const xml = introduced();
    const split = xml.indexOf("</InitialBoardState>");
    const duplicate =
      xml.slice(0, split) +
      xml.slice(split).replaceAll("<Id>40</Id>", "<Id>10</Id>");
    const event = check(analyzeNufflizerInput(duplicate));
    expect(event.teamId).toBe("unresolved");
  });
  it("cannot use a future roster to fill an earlier missing actor", () => {
    const xml = introduced();
    const split = xml.indexOf("</InitialBoardState>");
    const missing =
      xml.slice(0, split) +
      xml
        .slice(split)
        .replace(/<PlayerState><Id>10<\/Id>[\s\S]*?<\/PlayerState>/, "");
    const replay = parseReplayXml(missing);
    const future = structuredClone(
      parseReplayXml(contextReplayXml()).boardCheckpoints![1]!
    );
    future.afterSourceIndex = 100000;
    replay.boardCheckpoints!.push(future);
    const event = check(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    expect(event.teamId).toBe("unresolved");
  });
});
