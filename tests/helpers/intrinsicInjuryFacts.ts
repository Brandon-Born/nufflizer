import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { expect } from "vitest";
import type { LuckEvent, LuckReport } from "@/domain/nufflizer/types";

type Obj = Record<string, unknown>;
type Loc = {
  replayStep: number | null;
  childIndex: number | null;
  stepIndex?: number;
  messageIndex?: number;
};
type Message = { tag: string; payload: Obj };
type Participant = {
  rosterIndex: number;
  teamId: number | null;
  effects: unknown;
  prayers: unknown;
  transformations: unknown;
  player: { Id: number; Effects: unknown; Data: Obj | null };
};
type Steps = {
  stepIndex: number;
  tag: string;
  header: Obj;
  messages: Message[];
}[];
type Case = {
  locator: Loc;
  checkpoint: Loc;
  boardEffects: unknown;
  phase: number;
  participants: Participant[];
};
export const intrinsicInjuryFacts = JSON.parse(
  gunzipSync(
    readFileSync("tests/fixtures/evidence/bb3-intrinsic-injuries.json.gz")
  ).toString("utf8")
) as {
  references: Record<string, string>;
  files: {
    file: string;
    sha256: string;
    records: Case[];
    sequences: { locator: Loc; steps: Steps }[];
  }[];
};
const traits = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-trait-transitions.json", "utf8")
) as {
  files: {
    file: string;
    seeds: Participant[];
    refreshes: { locator: Loc; players: Participant[] }[];
  }[];
};
const rules = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-injury-tables.json", "utf8")
) as {
  tables: {
    stunty: boolean;
    thickSkull: boolean;
    counts: number[];
    totalOutcomes: number[];
  }[];
};
const loc = (l: Loc | NonNullable<LuckEvent["metadata"]["locator"]>) =>
  [
    l.replayStep ?? null,
    l.childIndex ?? null,
    l.stepIndex ?? null,
    l.messageIndex ?? null
  ].join(":");
const skills = (v: unknown, key: string): number[] | null =>
  v === ""
    ? []
    : v && typeof v === "object"
      ? ([(v as Obj)[key]].flat() as number[])
      : null;
const faces = (p: Obj) =>
  [(p.Dice as { Die: { Value: number } | { Value: number }[] }).Die]
    .flat()
    .map((d) => d.Value);

// Raw-source + last complete seed + independent triangular table arithmetic.
// Does not call an application eligibility, probability, scoring or reducer helper.
export function assertIntrinsicInjury(
  file: string,
  e: LuckEvent,
  report: LuckReport
): boolean {
  const f = intrinsicInjuryFacts.files.find((f) => f.file === file),
    c = f?.records.find((c) => loc(c.locator) === loc(e.metadata.locator!));
  if (!f || !c || !e.metadata.injuryTable) return false;
  expect(
    createHash("sha256")
      .update(readFileSync("demo-replays/" + file))
      .digest("hex")
  ).toBe(f.sha256);
  const table = e.metadata.injuryTable,
    proof = table.traitEvidence;
  expect(proof.playerId).toBe(e.playerId);
  expect(proof.teamId).toBe(e.teamId);
  const cp = (n: number) =>
    report.rerollResources.flow.clockSnapshots.find(
      (p) =>
        p.source.checkpointAfter === n &&
        ["initial", "board"].includes(p.source.kind)
    )!;
  const seedSource = cp(proof.observedCheckpointAfter),
    current = cp(proof.currentCheckpointAfter),
    known = traits.files.find((f) => f.file === file)!;
  const seeds =
    proof.observedCheckpointAfter === 0
      ? known.seeds
      : known.refreshes.find((r) => loc(r.locator) === loc(seedSource.source))!
          .players;
  expect(proof.prayersCheckpointAfter).toBe(0);
  const initial = known.seeds.find(
    (p) =>
      p.rosterIndex === proof.rosterIndex &&
      String(p.player.Id) === proof.playerId
  )!;
  expect(initial.prayers).toBe("");
  const seed = seeds.find(
    (p) =>
      String(p.player.Id) === proof.playerId &&
      p.rosterIndex === proof.rosterIndex
  )!;
  expect(seed).toBeDefined();
  expect(seed.player.Data).not.toBeNull();
  expect(proof.traits).toEqual({
    dataPlayerId: seed.player.Data!.Id,
    playerTypeId: seed.player.Data!.IdPlayerTypes,
    innateSkills: skills(seed.player.Data!.InnateSkills, "InnateSkillsItem"),
    acquiredSkills: skills(
      seed.player.Data!.AcquiredSkills,
      "AcquiredSkillsItem"
    )
  });
  expect(loc(current.source)).toBe(loc(c.checkpoint));
  const participant = c.participants.find(
    (p) => String(p.player.Id) === proof.playerId
  )!;
  expect(participant.rosterIndex).toBe(proof.rosterIndex);
  expect(participant.player.Effects).toBe("");
  const physical = participant.player as unknown as {
    Cell: { X: number; Y: number };
    Status: number | null;
    Situation: number | null;
    TackleZone: number | null;
  };
  expect(proof.onPitch).toBe(
    physical.Cell.X >= 0 &&
      physical.Cell.X < 26 &&
      physical.Cell.Y >= 0 &&
      physical.Cell.Y < 15 &&
      (physical.Situation === null || physical.Situation === 0)
  );
  expect(proof.statusCode).toBe(physical.Status);
  expect(proof.tackleZone).toBe(
    physical.TackleZone === null ? null : physical.TackleZone === 1
  );
  expect(participant.effects).toBe("");
  expect(participant.transformations).toBe("");
  expect(c.boardEffects).toBe("");
  expect(
    participant.teamId === null || String(participant.teamId) === e.teamId
  ).toBe(true);
  const learned = [
    ...proof.traits.innateSkills!,
    ...proof.traits.acquiredSkills!
  ];
  const reference = rules.tables.find(
    (t) =>
      t.stunty === learned.includes(59) && t.thickSkull === learned.includes(63)
  )!;
  expect(table.stunty).toBe(reference.stunty);
  expect(table.thickSkull).toBe(reference.thickSkull);
  expect(table.counts).toEqual(reference.counts);
  expect(table.probabilities).toEqual(reference.counts.map((n) => n / 36));
  const group = f.sequences.find(
    (g) =>
      loc(g.locator) ===
      loc({
        replayStep: c.locator.replayStep,
        childIndex: c.locator.childIndex
      })
  )!;
  const step = group.steps.find((s) => s.stepIndex === c.locator.stepIndex)!,
    raw = step.messages[c.locator.messageIndex!]!;
  expect(raw.tag).toBe("ResultInjuryRoll");
  expect(step.tag).toBe("DamageStep");
  expect(step.header.PlayerId).toBe(Number(e.playerId));
  expect(step.header.TargetId).toBe(Number(e.playerId));
  expect(step.header.Source).toBe(e.metadata.injuryObservation!.sourceCode);
  expect(faces(raw.payload)).toEqual(e.metadata.dice);
  expect(raw.payload.Outcome).toBe(e.metadata.outcomeCode);
  if (!e.metadata.injuryScoring) return true;
  expect(
    raw.payload.Modifiers === undefined || raw.payload.Modifiers === ""
  ).toBe(true);
  expect(raw.payload.Status).toBe(1);
  const outcome =
    reference.totalOutcomes[faces(raw.payload).reduce((a, b) => a + b, 0) - 2]!;
  expect(raw.payload.Outcome).toBe([0, 2, 3, 4][outcome]);
  const tier = Math.min(outcome, 2),
    mass = [
      reference.counts[0]!,
      reference.counts[1]!,
      reference.counts[2]! + reference.counts[3]!
    ];
  const less = mass.filter((_, i) => i < tier).reduce((a, b) => a + b, 0),
    more = mass.filter((_, i) => i > tier).reduce((a, b) => a + b, 0);
  expect(e.delta).toBe((more - less) / 36);
  expect(e.weightedDelta).toBeCloseTo((more - less) / 24, 12);
  expect(e.actualSuccess).toBeNull();
  expect(e.probabilitySuccess).toBeNull();
  expect(e.metadata.injuryScoring.lessSevereChance).toBe(less / 36);
  expect(e.metadata.injuryScoring.moreSevereChance).toBe(more / 36);
  expect(e.contextualImpact).toBeUndefined();
  const sources = new Map(report.events.map((e) => [e.metadata.sourceId, e]));
  const rawSource = (id: string) => {
    const row = sources.get(id)!;
    expect(row).toBeDefined();
    const l = row.metadata.locator!;
    const currentOrder = [
      c.locator.replayStep,
      c.locator.childIndex,
      c.locator.stepIndex!,
      c.locator.messageIndex!
    ];
    const order = [l.replayStep!, l.childIndex!, l.stepIndex!, l.messageIndex!];
    const difference = order
      .map((v, i) => v! - currentOrder[i]!)
      .find((v) => v !== 0);
    expect(difference).toBeLessThan(0);
    const rawGroup = f.sequences.find(
      (g) =>
        g.locator.replayStep === l.replayStep &&
        g.locator.childIndex === l.childIndex
    )!;
    expect(rawGroup).toBeDefined();
    const s = rawGroup.steps.find((s) => s.stepIndex === l.stepIndex)!;
    expect(s).toBeDefined();
    const m = s.messages[l.messageIndex!]!;
    expect(m.tag).toBe(row.metadata.sourceTag);
    return { row, step: s, message: m };
  };
  const armor = rawSource(e.metadata.injuryScoring.armorSourceId);
  expect(armor.message.tag).toBe("ResultRoll");
  expect(armor.message.payload.RollType).toBe(10);
  expect(armor.row.metadata.actionId).toBe(e.metadata.actionId);
  expect(armor.message.payload.Outcome).toBe(1);
  expect(armor.message.payload.NewRoll).toBe(1);
  const cause = e.metadata.injuryScoring.cause;
  if (cause.kind === "self_fall") {
    const failure = rawSource(cause.rollSourceId);
    expect(failure.step.header.StepType).toBe(1);
    expect(failure.step.header.PlayerId).toBe(Number(e.playerId));
    expect([1, 2]).toContain(failure.message.payload.RollType);
    expect(failure.message.payload.Outcome).toBe(0);
    expect(step.header.Source).toBe(
      failure.message.payload.RollType === 1 ? 9 : 0
    );
  } else {
    const final = rawSource(cause.appliedOutcomeSourceId),
      pool = rawSource(cause.poolSourceId);
    expect(pool.step.header.StepType).toBe(6);
    expect(final.message.tag).toBe("ResultBlockOutcome");
    expect(final.message.payload.AttackerId).toBe(Number(pool.row.playerId));
    expect([pool.step.header.PlayerId, pool.step.header.TargetId]).toContain(
      Number(e.playerId)
    );
    expect([0, 1, 2, 5, 6]).toContain(final.message.payload.Outcome);
    expect(step.header.Source).toBe(1);
    if (cause.attackerTraitEvidence) {
      const a = cause.attackerTraitEvidence,
        rawPlayer = c.participants.find(
          (p) => String(p.player.Id) === a.playerId
        )!;
      expect(rawPlayer).toBeDefined();
      expect(rawPlayer.player.Effects).toBe("");
      const aSeedSource = cp(a.observedCheckpointAfter),
        aSeeds =
          a.observedCheckpointAfter === 0
            ? known.seeds
            : known.refreshes.find(
                (r) => loc(r.locator) === loc(aSeedSource.source)
              )!.players;
      const aSeed = aSeeds.find((p) => String(p.player.Id) === a.playerId)!;
      expect(a.traits.innateSkills).toEqual(
        skills(aSeed.player.Data!.InnateSkills, "InnateSkillsItem")
      );
      expect(a.traits.acquiredSkills).toEqual(
        skills(aSeed.player.Data!.AcquiredSkills, "AcquiredSkillsItem")
      );
    }
    if (cause.armorModifierBudget) {
      const use = rawSource(cause.armorModifierBudget.useSourceId);
      expect(use.message.payload.Skill).toBe(13);
      expect(use.message.payload.Used).toBe(1);
      expect(use.message.payload.PlayerId).toBe(Number(pool.row.playerId));
    }
  }
  return true;
}
