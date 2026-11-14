import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { formatActualOutcome } from "@/domain/nufflizer/presentation";
import { encodedMessage, envelope } from "../helpers/replay";
import { projectionXml } from "../helpers/playback";

type Projection = Parameters<typeof projectionXml>[0];
type Roll = {
  Status: string[];
  Source: string[];
  RollType: string[];
  Outcome: string[];
  Dice: { Die: { DieType: string[]; Value: string[] }[] }[];
};
type Raw = {
  sourceFile: string;
  sha256: string;
  locator: {
    replayStep: number;
    childIndex: number;
    stepIndex: number;
    messageIndex: number;
  };
  tag: string;
  recordKind: string;
  subjectId: number;
  header: Projection;
  message: Projection;
  roll: Roll;
  modifiersPresent: boolean;
  modifiersEmpty: boolean;
};
type Pair = {
  sourceFixture: string;
  fixtureSha256: string;
  sourceSha256: string;
  caseId: string;
  observations: {
    ui: { label: string; dice: number[]; result: string };
    matches: {
      recordIndex: number;
      messageIndex: number;
      tag: string;
      recordKind: string;
      subjectId: number;
      roll: Roll;
    }[];
  }[];
};
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-casualty-observations.json", "utf8")
) as {
  sourceHashes: Record<string, string>;
  initialRosters: Record<
    string,
    { rosterIndex: number; explicitTeamId: string; playerIds: number[] }[]
  >;
  enumSource: {
    file: string;
    sha256: string;
    executableSha256: string;
    members: Record<string, number>;
  };
  rawEmissions: Raw[];
  paired: Pair[];
};
const names: Record<number, [string, string]> = {
  0: ["no_injury", "No injury"],
  1: ["badly_hurt", "Badly Hurt"],
  2: ["seriously_hurt", "Seriously Hurt"],
  3: ["serious_injury", "Serious Injury"],
  4: ["lasting_injury", "Lasting Injury"],
  5: ["smashed_knee", "Smashed Knee"],
  6: ["head_injury", "Head Injury"],
  7: ["broken_arm", "Broken Arm"],
  8: ["neck_injury", "Neck Injury"],
  9: ["dislocated_shoulder", "Dislocated Shoulder"],
  10: ["dead", "Dead"]
};
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
function pairXml(p: Pair) {
  const fixture = JSON.parse(
    readFileSync(`tests/fixtures/evidence/${p.sourceFixture}`, "utf8")
  );
  const c = fixture.cases.find((c: { id: string }) => c.id === p.caseId) as {
    rawRecords: { step: Projection; messages: Projection[] }[];
  };
  const ids = [
    ...new Set(p.observations.flatMap((o) => o.matches.map((m) => m.subjectId)))
  ];
  const target = p.observations
    .flatMap((o) => o.matches)
    .find((m) => m.recordKind === "apothecary_original");
  const raw = target
    ? c.rawRecords[target.recordIndex]!.messages[target.messageIndex]
    : undefined;
  const gamer = raw
    ? Number(
        ((Object.values(raw)[0] as { GamerId: string[] }).GamerId ?? ["0"])[0]
      )
    : 0;
  const roster = (team: number, players: number[]) =>
    `<TeamState><Data><TeamId>${team}</TeamId></Data><ListPitchPlayers>${players.map((id) => `<PlayerState><Id>${id}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`;
  const initial = `<NotificationGameJoined><InitialBoardState><ListTeams>${roster(gamer === 1 ? 1 : 0, ids)}${roster(gamer === 1 ? 0 : 1, [90000])}</ListTeams></InitialBoardState></NotificationGameJoined>`;
  const steps = c.rawRecords
    .map(
      (r) =>
        `<StepResult><Step><MessageData>${encodedMessage(projectionXml(r.step))}</MessageData></Step><Results>${r.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(projectionXml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult>`
    )
    .join("");
  return envelope(
    initial +
      `<EventExecuteSequence><Sequence>${steps}</Sequence></EventExecuteSequence>`
  );
}

describe("independent casualty raw namespaces and prior playback", () => {
  it("reproduces every raw root and original evidence hash without app helpers", () => {
    const r = spawnSync(
      "python3",
      ["scripts/extract-casualty-observation-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      rawRoots: 63,
      copies: 4,
      pairedCases: 14,
      pairedObservations: 17
    });
    expect(digest(readFileSync(evidence.enumSource.file))).toBe(
      evidence.enumSource.sha256
    );
    const enums = JSON.parse(readFileSync(evidence.enumSource.file, "utf8"));
    expect(enums.source.sha256).toBe(evidence.enumSource.executableSha256);
    for (const name of [
      "EBB3NetGameplayCasualty",
      "EBB3BoardDataCasualtyOutcome"
    ]) {
      const entries = enums.enums.find((e: { name: string }) => e.name === name)
        .entries as { member: string; value: number }[];
      expect(
        Object.fromEntries(entries.map((e) => [e.member, e.value]))
      ).toEqual(evidence.enumSource.members);
    }
    expect(
      evidence.rawEmissions.filter((r) => r.recordKind === "direct")
    ).toHaveLength(45);
    expect(
      evidence.rawEmissions.filter(
        (r) =>
          r.recordKind === "direct" && r.modifiersPresent && r.modifiersEmpty
      )
    ).toHaveLength(44);
  });

  it.each(Object.keys(evidence.sourceHashes))(
    "joins every %s casualty to its raw header, subject, role and physical dice path",
    (file) => {
      const input = readFileSync(`demo-replays/${file}`);
      expect(digest(input)).toBe(evidence.sourceHashes[file]);
      const r = analyzeNufflizerInput(input.toString("utf8")),
        raw = evidence.rawEmissions.filter((x) => x.sourceFile === file);
      const originals = raw.filter((x) => x.recordKind !== "copied_original");
      expect(
        r.events.filter((e) => e.metadata.casualtyObservation)
      ).toHaveLength(originals.length);
      for (const x of originals) {
        expect(x.sha256).toBe(evidence.sourceHashes[file]);
        const e = r.events.find(
            (e) =>
              [
                e.metadata.locator?.replayStep,
                e.metadata.locator?.childIndex,
                e.metadata.locator?.stepIndex,
                e.metadata.locator?.messageIndex
              ].join(":") ===
              [
                x.locator.replayStep,
                x.locator.childIndex,
                x.locator.stepIndex,
                x.locator.messageIndex
              ].join(":")
          )!,
          o = e.metadata.casualtyObservation!;
        const ref = names[Number(x.roll.Outcome[0])]!;
        expect(o).toMatchObject({
          recordKind: x.recordKind,
          outcome: ref[0],
          subjectId: String(x.subjectId),
          subjectTeamId: e.teamId,
          sourceCode: Number(x.roll.Source[0])
        });
        expect(e.metadata.sourceTag).toBe(x.tag);
        expect(e.playerId).toBe(String(x.subjectId));
        const initial = evidence.initialRosters[file]!.filter((t) =>
          t.playerIds.includes(x.subjectId)
        );
        expect(initial).toHaveLength(1);
        expect(initial[0]!.explicitTeamId).toBe(e.teamId);
        expect(e.metadata.ownership).toMatchObject({
          role: "subject",
          playerId: String(x.subjectId),
          teamId: e.teamId
        });
        expect(e.metadata.dice).toEqual(
          x.roll.Dice[0]!.Die.map((d) => Number(d.Value[0]))
        );
        expect(e.metadata.dieTypes).toEqual(
          x.roll.Dice[0]!.Die.map((d) => Number(d.DieType[0]))
        );
        expect(e).toMatchObject({
          scoringStatus: "excluded",
          probabilitySuccess: null,
          actualSuccess: null,
          delta: 0,
          weightedDelta: 0
        });
        expect(formatActualOutcome(e)).toBe(`${ref[1]} (recorded)`);
        const path =
          x.recordKind === "direct"
            ? ["Dice"]
            : [
                x.recordKind === "apothecary_original"
                  ? "RollInfos"
                  : "NewRoll",
                "Dice"
              ];
        expect(
          r.diceRecords.find(
            (d) =>
              d.parentEventId === e.id &&
              JSON.stringify(d.path) === JSON.stringify(path)
          )
        ).toMatchObject({
          disposition: "unscored_roll",
          quality: "complete",
          rollType: 12,
          status: 1,
          stepActorId: String(x.subjectId),
          stepTargetId: String(x.subjectId)
        });
      }
      for (const x of raw.filter((x) => x.recordKind === "copied_original")) {
        const e = r.events.find(
          (e) =>
            [
              e.metadata.locator?.replayStep,
              e.metadata.locator?.childIndex,
              e.metadata.locator?.stepIndex,
              e.metadata.locator?.messageIndex
            ].join(":") ===
            [
              x.locator.replayStep,
              x.locator.childIndex,
              x.locator.stepIndex,
              x.locator.messageIndex
            ].join(":")
        )!;
        expect(e.metadata.casualtyObservation?.recordKind).toBe(
          "apothecary_replacement"
        );
        expect(
          r.diceRecords.find(
            (d) =>
              d.parentEventId === e.id && d.path.join() === "OriginalRoll,Dice"
          )
        ).toMatchObject({
          disposition: "summary",
          aliasOf: expect.any(String)
        });
      }
    }
  );

  it.each(evidence.paired)(
    "keeps $sourceFixture/$caseId labels separate from copied treatment outcomes",
    (p) => {
      const bytes = readFileSync(`tests/fixtures/evidence/${p.sourceFixture}`);
      expect(digest(bytes)).toBe(p.fixtureSha256);
      expect(JSON.parse(bytes.toString()).source.sha256).toBe(p.sourceSha256);
      const r = analyzeNufflizerInput(pairXml(p));
      for (const o of p.observations) {
        const actual = o.matches.filter(
          (m) => m.recordKind !== "copied_original"
        );
        expect(actual.length).toBeGreaterThan(0);
        for (const m of actual) {
          const e = r.events.find(
            (e) =>
              e.metadata.locator?.stepIndex === m.recordIndex &&
              e.metadata.locator.messageIndex === m.messageIndex &&
              e.metadata.sourceTag === m.tag
          )!;
          expect(
            e,
            `${p.caseId}/${m.recordIndex}/${m.messageIndex}`
          ).toBeDefined();
          expect(e.metadata.casualtyObservation?.recordKind).toBe(m.recordKind);
          expect(e.metadata.casualtyObservation?.subjectId).toBe(
            String(m.subjectId)
          );
          expect(e.metadata.dice).toEqual(o.ui.dice);
          expect(formatActualOutcome(e)).toBe(
            `${o.ui.result === "No Injury" ? "No injury" : o.ui.result} (recorded)`
          );
          expect(e.probabilitySuccess).toBeNull();
          expect(e.actualSuccess).toBeNull();
          expect(e.weightedDelta).toBe(0);
        }
      }
    }
  );
});
