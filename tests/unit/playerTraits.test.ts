import { describe, expect, it } from "vitest";
import { observePlayerTraits } from "@/domain/replay/playerTraits";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructPreRollEvidence } from "@/domain/replay/reconstructContext";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { contextReplayXml } from "../helpers/contextReplay";
import { model, rollEvent } from "../helpers/replay";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";

const data =
  "<Data><Id>10</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills><InnateSkillsItem>30</InnateSkillsItem><InnateSkillsItem>63</InnateSkillsItem></InnateSkills><AcquiredSkills/></Data>";
function named() {
  return contextReplayXml().replaceAll("<Id>10</Id>", "<Id>10</Id>" + data);
}

describe("current trait observation (NUF-010/011/013/016)", () => {
  it("keeps a target's observed traits distinct when the actor's Data is absent", () => {
    const replay = model([
      rollEvent({ id: "check", sourceIndex: 1, targetId: "7" })
    ]);
    replay.boardCheckpoints = [
      observeBoardCheckpoint(
        {
          IsStable: 1,
          CurrentPhase: 5,
          ActiveTeam: 0,
          ListTeams: {
            TeamState: [
              {
                Data: { TeamId: 0 },
                ListPitchPlayers: {
                  PlayerState: { Id: 42, Cell: { X: 5, Y: 5 } }
                }
              },
              {
                Data: { TeamId: 1 },
                ListPitchPlayers: {
                  PlayerState: {
                    Id: 7,
                    Cell: { X: 6, Y: 5 },
                    Data: { Id: 7, InnateSkills: { InnateSkillsItem: 7 } }
                  }
                }
              }
            ]
          }
        },
        "1-4-0-0",
        {
          kind: "initial",
          afterSourceIndex: 0,
          replayStep: null,
          childIndex: null
        }
      )
    ];
    const context = reconstructPreRollEvidence(replay).get("check")!;
    expect(context.actorTraits).toBeUndefined();
    expect(context.targetTraits).toMatchObject({
      dataPlayerId: 7,
      innateSkills: [7],
      acquiredSkills: null
    });
    replay.turns[0]!.events[0]!.actorTeamId = "1";
    expect(
      reconstructPreRollEvidence(replay).get("check")!.targetTraits
    ).toBeUndefined();
  });
  it("distinguishes missing lists, explicit empty lists and bounded positive codes", () => {
    expect(observePlayerTraits(undefined, 10)).toBeNull();
    expect(observePlayerTraits({ Id: 10 }, 10)).toMatchObject({
      innateSkills: null,
      acquiredSkills: null
    });
    expect(
      observePlayerTraits(
        {
          Id: 10,
          InnateSkills: "",
          AcquiredSkills: { AcquiredSkillsItem: "30" }
        },
        10
      )
    ).toMatchObject({ innateSkills: [], acquiredSkills: [30] });
  });
  it.each([
    { InnateSkillsItem: [30, 30] },
    { InnateSkillsItem: [1.5] },
    { InnateSkillsItem: [Infinity] },
    { InnateSkillsItem: [-1] },
    { InnateSkillsItem: Array.from({ length: 65 }, (_, i) => i) },
    { UnknownField: 30 }
  ])("retains an invalid list as unknown: %j", (InnateSkills) => {
    expect(
      observePlayerTraits({ Id: 10, InnateSkills }, 10)?.innateSkills
    ).toBeNull();
  });
  it("does not attach another player's Data to this observation", () => {
    expect(observePlayerTraits({ Id: 11, InnateSkills: "" }, 10)).toBeNull();
    expect(
      observePlayerTraits({ Id: 10, TeamId: 1, InnateSkills: "" }, 10, 0)
    ).toBeNull();
  });
  it("keeps unexpected XML list children unknown instead of treating them as empty", () => {
    const xml = named().replaceAll(
      "<InnateSkills><InnateSkillsItem>30</InnateSkillsItem><InnateSkillsItem>63</InnateSkillsItem></InnateSkills>",
      "<InnateSkills><Unexpected>30</Unexpected></InnateSkills>"
    );
    const r = analyzeNufflizerInput(xml);
    expect(
      r.events.find((e) => e.scoringStatus === "scored")!.metadata.preRoll
        ?.actorTraits?.innateSkills
    ).toBeNull();
  });
  it("exports traits from the exact pre-roll frame without changing dice or context", () => {
    const r = analyzeNufflizerInput(named());
    const baseline = analyzeNufflizerInput(contextReplayXml());
    const event = r.events.find((e) => e.scoringStatus === "scored")!;
    expect(event.metadata.preRoll?.actorTraits).toEqual({
      dataPlayerId: 10,
      playerTypeId: 8,
      innateSkills: [30, 63],
      acquiredSkills: []
    });
    expect(event.weightedDelta).toBe(
      baseline.events.find((e) => e.scoringStatus === "scored")!.weightedDelta
    );
    expect(event.contextualImpact).toEqual(
      baseline.events.find((e) => e.scoringStatus === "scored")!
        .contextualImpact
    );
    event.metadata.preRoll!.actorTraits!.dataPlayerId = 11;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("does not fill an earlier observation from future Data or initial skills after an omitted list", () => {
    const r = parseReplayXml(contextReplayXml());
    const future = parseReplayXml(named()).boardCheckpoints![0]!;
    future.afterSourceIndex = 100000;
    r.boardCheckpoints!.push(future);
    expect(
      [...reconstructPreRollEvidence(r).values()].every((e) => !e.actorTraits)
    ).toBe(true);
    // The fixture's later pre-roll BoardState omits Data and replaces the
    // initial snapshot before the check. Initial trait lists cannot carry.
    const omitted = analyzeNufflizerInput(
      contextReplayXml().replace("<Id>10</Id>", "<Id>10</Id>" + data)
    );
    expect(
      omitted.events.find((e) => e.scoringStatus === "scored")!.metadata.preRoll
        ?.actorTraits
    ).toBeUndefined();
  });
});
