import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { createOwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { findDeclaredActivationChecks } from "@/domain/replay/activationChecks";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { projectionXml } from "../helpers/playback";
import { encodedMessage, envelope } from "../helpers/replay";

import {
  activationCheckFacts,
  activationCheckLocator
} from "../helpers/activationCheckFacts";

const read = (file: string) => readFileSync(`demo-replays/${file}`, "utf8");

describe("owned activation checks", () => {
  it("joins every declared die, retained result and fresh replacement to the raw replay", () => {
    const sources = activationCheckFacts();
    expect(sources).toHaveLength(12);
    const admissions = {
      direct: 0,
      original: 0,
      replacement: 0,
      kept: 0,
      spent: 0
    };
    let observedContinuations = 0;
    for (const { file, rows } of sources) {
      const report = analyzeNufflizerInput(read(file));
      const byLocation = new Map(
        report.events.flatMap((event) => {
          const at = event.metadata.locator;
          return at ? [[activationCheckLocator(at), event] as const] : [];
        })
      );
      const dice = new Map(
        report.diceRecords
          .filter((row) => ["Dice", "RollInfos,Dice"].includes(row.path.join()))
          .map((row) => [row.parentSourceId, row])
      );
      let count = 0;
      for (const fact of rows) {
        const row = byLocation.get(fact.locator.join());
        const evidence = dice.get(row?.metadata.sourceId);
        const retry = fact.continuation;
        const { rollType, status, newRoll } = fact;
        const skillId = rollType === 33 ? 31 : rollType === 34 ? 51 : 84;
        if (retry) {
          const first = byLocation.get(retry.original.join())!;
          const originalDie = dice.get(first.metadata.sourceId)!;
          const replaced = retry.gate?.passed ?? false;
          expect(row?.metadata.teamDiceIdentity).toMatchObject({
            questionSourceId: first.metadata.sourceId,
            originalRecordId: originalDie.id,
            teamUsed: retry.teamUsed,
            replacementRolled: replaced,
            gatePassed: retry.gate?.passed,
            gateSkillId: retry.gate?.skill
          });
          if (retry.teamUsed) admissions.spent++;
          if (retry.gate) {
            const gate = byLocation.get(
              [...fact.locator.slice(0, 3), 2].join()
            )!;
            const [deltaN, deltaD] = retry.gate.accessDelta;
            const [policyN, policyD] = retry.gate.policyChance;
            expect(gate).toMatchObject({
              teamId: fact.team,
              playerId: fact.actor,
              type: "activation_check",
              scoringStatus: "scored",
              actualSuccess: retry.gate.passed,
              probabilitySuccess: (7 - retry.gate.target) / 6,
              metadata: {
                rollType: 71,
                dice: [retry.gate.face],
                teamRerollsSpent: 1,
                numericRetryAccess: {
                  originalSourceId: first.metadata.sourceId,
                  terminalSourceId: row!.metadata.sourceId
                }
              }
            });
            expect(
              gate.metadata.numericRetryAccess!.fixedPolicySuccessChance
            ).toBeCloseTo(policyN / policyD, 12);
            expect(gate.weightedDelta).toBeCloseTo(deltaN / deltaD, 12);
            expect(gate.contextualImpact).toBeUndefined();
            expect(dice.get(gate.metadata.sourceId)).toMatchObject({
              disposition: "covered_roll",
              eventId: gate.id
            });
            count++;
          }
          if (!replaced) {
            expect(row).toMatchObject({
              scoringStatus: "excluded",
              weightedDelta: 0,
              metadata: { isRollCandidate: false }
            });
            expect(evidence).toMatchObject({
              status,
              newRoll,
              disposition: "summary",
              aliasOf: originalDie.id
            });
            expect(evidence?.eventId).toBeUndefined();
            const observed = fact.animalContinuation;
            if (observed) {
              const following = byLocation.get(observed.following.join())!;
              const standBy = byLocation.get(`${observed.standBy.join()},,`)!;
              expect(row?.metadata.animalSavageryContinuation).toMatchObject({
                standBySourceId: standBy.metadata.sourceId,
                afterCheckpointAfter: standBy.metadata.sourceIndex,
                followingActivationSourceId: following.metadata.sourceId,
                followingPlayerId: observed.followingPlayerId,
                teamTurn: observed.teamTurn,
                actorRecordedCanAct: observed.actorRecordedCanAct
              });
              expect(row?.metadata.animalSavageryContinuation?.victim).toEqual(
                observed.victim ?? undefined
              );
              observedContinuations++;
            }
            admissions.kept++;
            continue;
          }
          expect(row!.metadata.activationCheck?.draw).toBe("replacement");
          expect(evidence?.aliasOf).toBeUndefined();
          admissions.replacement++;
        } else {
          const alternatives = [
            ["ResultUseAction", "ResultSkillUsage"],
            ["ResultUseAction", "ResultEndPlayerEffect", "ResultSkillUsage"]
          ];
          expect(alternatives).toContainEqual(fact.prefix);
          expect(fact.skillId).toBe(skillId);
          const embedded = fact.sourceTag === "QuestionTeamRerollUsage";
          expect(row?.metadata.activationCheck?.draw).toBe(
            embedded ? "original" : undefined
          );
          admissions[embedded ? "original" : "direct"]++;
        }
        if (!row || !evidence) {
          expect(row, fact.locator.join()).toBeDefined();
          expect(evidence, fact.locator.join()).toBeDefined();
          continue;
        }
        if (fact.assistant) expect(fact.assistantTeam).toBe(fact.team);
        expect(row).toMatchObject({
          teamId: fact.team,
          playerId: fact.actor,
          type: "activation_check",
          actualSuccess: Boolean(fact.outcome),
          probabilitySuccess: fact.successFaces / 6,
          scoringStatus: "scored",
          metadata: {
            rollType: fact.rollType,
            difficulty: fact.target,
            dice: [fact.face],
            activationCheck: {
              skillId,
              assistantId: fact.assistant ?? undefined
            },
            ownership: {
              playerId: fact.actor,
              teamId: fact.team,
              role: "actor"
            }
          }
        });
        expect(row.weightedDelta).toBeCloseTo(fact.numerator / 6, 12);
        expect(row.contextualImpact).toBeUndefined();
        expect(evidence).toMatchObject({
          status,
          newRoll,
          eventId: row.id,
          disposition: "covered_roll",
          dice: [{ value: fact.face, dieType: 0 }]
        });
        count++;
      }
      const foulAppearance = report.events.filter(
        (event) => event.metadata.foulAppearance
      ).length;
      expect(
        report.coverage.scoredByType.activation_check - foulAppearance
      ).toBe(count);
    }
    expect(admissions).toEqual({
      direct: 192,
      original: 32,
      replacement: 3,
      kept: 29,
      spent: 5
    });
    expect(observedContinuations).toBe(5);
  }, 45000);

  it("keeps Animal Savagery effects and teammate armor separate from the first die", () => {
    const report = analyzeNufflizerInput(read("demo5.bbr"));
    const source = (id: number) =>
      report.events.find(
        (event) => event.metadata.sourceId === `source-${id}`
      )!;
    for (const [kept, effect] of [
      [662, 663],
      [1427, 1428],
      [2546, 2547]
    ]) {
      expect(source(kept).metadata.animalSavageryOutcome).toEqual({
        kind: "actor_effect",
        effectSourceId: `source-${effect}`
      });
      expect(source(effect).playerId).toBe("37");
    }
    expect(source(1129).metadata.animalSavageryOutcome).toEqual({
      kind: "teammate_selected",
      offerSourceId: "source-1130",
      selectionSourceId: "source-1133",
      offeredVictimIds: ["38", "41"],
      victimId: "38",
      armorSourceId: "source-1135"
    });
    expect(source(2759).metadata.animalSavageryOutcome).toEqual({
      kind: "teammate_selected",
      offerSourceId: "source-2760",
      selectionSourceId: "source-2763",
      offeredVictimIds: ["46"],
      victimId: "46",
      armorSourceId: "source-2765"
    });
    expect(source(1135)).toMatchObject({
      playerId: "38",
      type: "armor_break",
      scoringStatus: "excluded",
      probabilitySuccess: null,
      metadata: { damage: { sourceCode: 16, subjectTeamId: "1" }, dice: [4, 6] }
    });
    expect(source(1125)).toMatchObject({
      probabilitySuccess: 1 / 2,
      weightedDelta: -1 / 2
    });
    const continuation = source(1129).metadata.animalSavageryContinuation!;
    continuation.followingActivationSourceId = "source-2772";
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    continuation.followingActivationSourceId = "source-1141";
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    const effect = source(1129).metadata.animalSavageryOutcome!;
    if (effect.kind !== "teammate_selected")
      throw new Error("expected a teammate choice");
    effect.armorSourceId = "source-2765";
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it("withholds Animal Savagery continuation across a conflicting controller", () => {
    const replay = parseReplayXml(decodeReplayInput(read("demo5.bbr")).xml, {
      omitRawReplaySteps: true
    });
    const settled = replay.boardCheckpoints?.find(
      (cp) => cp.afterSourceIndex === 1138
    )?.board;
    expect(settled).toBeDefined();
    settled!.activeGamerId = 0;
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const kept = report.events.find(
      (event) => event.metadata.sourceId === "source-1129"
    );
    expect(kept?.metadata.animalSavageryContinuation).toBeUndefined();
    expect(kept?.metadata.animalSavageryOutcome).toMatchObject({
      victimId: "38",
      armorSourceId: "source-1135"
    });
    expect(
      report.events.find((event) => event.metadata.sourceId === "source-1125")
        ?.weightedDelta
    ).toBe(-1 / 2);
  });

  it("scores UI-021's failed Block check with a +2 modifier and preserves its recorded victim", () => {
    const evidence = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-ui-playback-002.json", "utf8")
    );
    type Projection = Parameters<typeof projectionXml>[0];
    const observation = evidence.cases.find(
      (item: { id: string }) => item.id === "UI-021"
    );
    const frames = observation.rawRecords
      .map(
        (record: { step: Projection; messages: Projection[] }) =>
          `<ReplayStep><EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(projectionXml(record.step))}</MessageData></Step><Results>${record.messages.map((message) => `<StringMessage><MessageData>${encodedMessage(projectionXml(message))}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence></ReplayStep>`
      )
      .join("");
    const roster = (team: number, players: number[]) =>
      `<TeamState><Data><TeamId>${team}</TeamId></Data><ListPitchPlayers>${players.map((player) => `<PlayerState><Id>${player}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`;
    const xml = envelope(
      `<NotificationGameJoined><InitialBoardState><ListTeams>${roster(0, [1])}${roster(1, [37, 42, 46])}</ListTeams></InitialBoardState></NotificationGameJoined>${frames}`
    );
    const replay = parseReplayXml(xml, { omitRawReplaySteps: true });
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const first = report.events.find(
      (event) => event.metadata.activationCheck?.skillId === 84
    )!;
    expect(first).toMatchObject({
      teamId: "1",
      playerId: "37",
      probabilitySuccess: 5 / 6,
      actualSuccess: false,
      metadata: {
        dice: [1],
        difficulty: 2,
        modifiersSum: 2,
        activationCheck: { draw: "original" }
      }
    });
    expect(first.weightedDelta).toBeCloseTo(-5 / 6, 12);
    const kept = report.events.find(
      (event) => event.metadata.teamDiceIdentity
    )!;
    expect(kept.metadata.animalSavageryOutcome).toMatchObject({
      kind: "teammate_selected",
      offeredVictimIds: ["42", "46"],
      victimId: "42",
      armorSourceId: undefined
    });

    const raw = replay.turns.flatMap((turn) => turn.events);
    raw.find(
      (event) => event.sourceTag === "ResultAnimalSavagery"
    )!.payload!.VictimId = 1;
    const wrongVictim = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(
      wrongVictim.events.find((event) => event.metadata.teamDiceIdentity)
        ?.metadata.animalSavageryOutcome
    ).toBeUndefined();
    expect(
      wrongVictim.events.find(
        (event) => event.metadata.activationCheck?.skillId === 84
      )?.weightedDelta
    ).toBeCloseTo(-5 / 6, 12);

    const roll = raw.find(
      (event) => event.sourceTag === "QuestionTeamRerollUsage"
    )!.payload!.RollInfos as {
      Modifiers: { Modifier: { ModifierType: number } };
    };
    roll.Modifiers.Modifier.ModifierType = 17;
    expect(
      findDeclaredActivationChecks(replay, createOwnershipTimeline(replay)).size
    ).toBe(0);
  });

  it("rejects wrong-side helpers, copied dice, and a mismatched skill use", () => {
    const replay = parseReplayXml(decodeReplayInput(read("demo7.bbr")).xml, {
      omitRawReplaySteps: true
    });
    const events = replay.turns.flatMap((turn) => turn.events);
    const check = events.find((event) => event.id === "source-347")!;
    const skill = events.find((event) => event.id === "source-346")!;
    const scan = () =>
      findDeclaredActivationChecks(replay, createOwnershipTimeline(replay));
    expect(scan().get(check.id!)?.evidence).toMatchObject({
      skillId: 51,
      assistantId: "11"
    });

    const modifier = (
      check.payload!.Modifiers as { Modifier: { PlayerId: number } }
    ).Modifier;
    modifier.PlayerId = 37;
    expect(scan().has(check.id!)).toBe(false);
    modifier.PlayerId = 11;
    check.payload!.NewRoll = 0;
    expect(scan().has(check.id!)).toBe(false);
    check.payload!.NewRoll = 1;
    skill.payload!.Skill = 31;
    expect(scan().has(check.id!)).toBe(false);
  });

  it("rejects a JSON score whose fresh die or linked skill proof is forged", () => {
    const report = analyzeNufflizerInput(read("demo5.bbr"));
    const check = report.events.find(
      (event) => event.metadata.sourceId === "source-314"
    )!;
    const proof = check.metadata.activationCheck!;
    const die = report.diceRecords.find(
      (row) => row.parentSourceId === check.metadata.sourceId
    )!;
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    die.newRoll = 0;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    die.newRoll = 1;
    proof.skillSourceId = proof.declarationSourceId;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it("keeps the first die when the resumed activation names a different destination", () => {
    const replay = parseReplayXml(decodeReplayInput(read("demo7.bbr")).xml, {
      omitRawReplaySteps: true
    });
    const header = replay.turns
      .flatMap((turn) => turn.events)
      .find((event) => event.id === "source-716")!;
    header.payload!.CellTo = { X: 0, Y: 0 };
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const first = report.events.find(
      (event) => event.metadata.sourceId === "source-714"
    )!;
    const replacement = report.events.find(
      (event) => event.metadata.sourceId === "source-720"
    )!;
    expect(first.weightedDelta).toBeCloseTo(-5 / 6, 12);
    expect(replacement).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null
    });
    expect(
      report.events.find((event) => event.metadata.sourceId === "source-719")
        ?.scoringStatus
    ).toBe("excluded");
  });

  it("rejects a scored Loner gate linked to an unrelated terminal source", () => {
    const report = analyzeNufflizerInput(read("demo7.bbr"));
    const gate = report.events.find(
      (event) => event.metadata.sourceId === "source-719"
    )!;
    gate.metadata.numericRetryAccess!.terminalSourceId = "source-885";
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects a scored replacement that claims the gate failed", () => {
    const report = analyzeNufflizerInput(read("demo7.bbr"));
    const row = report.events.find(
      (event) => event.metadata.sourceId === "source-720"
    )!;
    row.metadata.teamDiceIdentity!.gatePassed = false;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
