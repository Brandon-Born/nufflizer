import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  formatActualOutcome,
  explainRecordedTreatment,
  explainTreatmentAftermath
} from "@/domain/nufflizer/presentation";
import {
  treatmentXml,
  mapTreatmentMessages,
  mapTreatmentAfterBoard
} from "../helpers/treatment";
import { playbackFragmentXml } from "../helpers/playback";

const analyze = (xml = treatmentXml()) => analyzeNufflizerInput(xml);
const result = (r: ReturnType<typeof analyze>) =>
  r.events.find((e) => e.metadata.sourceTag === "ResultApothecary")!;
const body = (xml: string, change: (raw: string) => string) =>
  mapTreatmentMessages(xml, (raw) =>
    raw.startsWith("<ResultApothecary>") ? change(raw) : raw
  );
const header = (xml: string, change: (raw: string) => string) =>
  mapTreatmentMessages(xml, (raw) =>
    raw.startsWith("<DamageStep>") && raw.includes("<State>2</State>")
      ? change(raw)
      : raw
  );
const prompt = (xml: string, change: (raw: string) => string) =>
  mapTreatmentMessages(xml, (raw) =>
    raw.startsWith("<QuestionApothecaryCasualtyUsage>") ? change(raw) : raw
  );
const initial = (xml: string, change: (raw: string) => string) =>
  xml.replace(
    /<InitialBoardState>([\s\S]*?)<\/InitialBoardState>/,
    (_m, p: string) => `<InitialBoardState>${change(p)}</InitialBoardState>`
  );
const reserve = () =>
  treatmentXml({
    noPrompt: true,
    stage: 0,
    spp: false,
    used: 1,
    outcome: 0,
    status: 0,
    canAct: true,
    tackleZone: true,
    emptyController: true,
    emptyTeam: true,
    emptyPaused: true,
    emptyStandby: true,
    afterController: null
  });

describe("treatment source facts reject malformed or unowned claims", () => {
  it("runs a real encoded original/continuation and keeps its scores separate", () => {
    const r = analyze(),
      e = result(r);
    expect(e.metadata.recordedTreatment).toMatchObject({
      stage: "initial_injury",
      wireIsInjury: 1,
      resourceSpent: 0,
      appliedOutcomeCode: 1
    });
    expect(e.metadata.apothecary?.applied).toBe("injury_original");
    expect(e.metadata.treatmentAftermath?.observation).toEqual({
      cell: { x: -1, y: -1 },
      situationCode: 4,
      statusCode: 4,
      canAct: null,
      tackleZone: null
    });
    expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
      0
    );
    expect(formatActualOutcome(e)).toBe("Initial injury retained (recorded)");
    expect(explainRecordedTreatment(e)).toContain(
      "result name is not verified by this notification alone"
    );
    expect(explainTreatmentAftermath(e)).toContain(
      "Off-pitch flags do not establish a legal or useful activation"
    );
  });
  it.each([
    "version",
    "extra-result",
    "missing-use",
    "invalid-use",
    "missing-stage",
    "invalid-stage",
    "outcome",
    "status",
    "fractional-status",
    "extra-header",
    "not-applied",
    "evaluation",
    "skill",
    "missing-source",
    "negative-source",
    "unknown-source",
    "header-state",
    "stage-state",
    "target",
    "owner-conflict",
    "future-owner",
    "initial-identity"
  ])("withholds raw treatment interpretation for %s", (kind) => {
    let xml = treatmentXml();
    if (kind === "version") xml = xml.replace("1-4-0-0", "2-0-0-0");
    if (kind === "extra-result")
      xml = body(xml, (r) =>
        r.replace(
          "</ResultApothecary>",
          "<Unknown>0</Unknown></ResultApothecary>"
        )
      );
    if (kind === "missing-use")
      xml = body(xml, (r) =>
        r.replace("<ApothecaryUsed>0</ApothecaryUsed>", "")
      );
    if (kind === "invalid-use")
      xml = body(xml, (r) =>
        r.replace(
          "<ApothecaryUsed>0</ApothecaryUsed>",
          "<ApothecaryUsed>2</ApothecaryUsed>"
        )
      );
    if (kind === "missing-stage")
      xml = body(xml, (r) => r.replace("<IsInjury>1</IsInjury>", ""));
    if (kind === "invalid-stage")
      xml = body(xml, (r) =>
        r.replace("<IsInjury>1</IsInjury>", "<IsInjury>2</IsInjury>")
      );
    if (kind === "outcome")
      xml = body(xml, (r) =>
        r.replace("<Casualty>1</Casualty>", "<Casualty>11</Casualty>")
      );
    if (kind === "status")
      xml = body(xml, (r) =>
        r.replace(
          "<PlayerStatus>4</PlayerStatus>",
          "<PlayerStatus>11</PlayerStatus>"
        )
      );
    if (kind === "fractional-status")
      xml = body(xml, (r) =>
        r.replace(
          "<PlayerStatus>4</PlayerStatus>",
          "<PlayerStatus>4.5</PlayerStatus>"
        )
      );
    if (kind === "extra-header")
      xml = header(xml, (r) =>
        r.replace("</DamageStep>", "<Unknown>0</Unknown></DamageStep>")
      );
    if (kind === "not-applied")
      xml = header(xml, (r) =>
        r.replace("<Applied>1</Applied>", "<Applied>0</Applied>")
      );
    if (kind === "evaluation")
      xml = header(xml, (r) =>
        r.replace(
          "<IsEvaluation>0</IsEvaluation>",
          "<IsEvaluation>1</IsEvaluation>"
        )
      );
    if (kind === "skill")
      xml = header(xml, (r) =>
        r.replace("<Skill>0</Skill>", "<Skill>13</Skill>")
      );
    if (kind === "missing-source")
      xml = header(xml, (r) => r.replace("<Source>1</Source>", ""));
    if (kind === "negative-source")
      xml = header(xml, (r) =>
        r.replace("<Source>1</Source>", "<Source>-1</Source>")
      );
    if (kind === "unknown-source")
      xml = header(xml, (r) =>
        r.replace("<Source>1</Source>", "<Source>65</Source>")
      );
    if (kind === "header-state")
      xml = header(xml, (r) =>
        r.replace("<State>2</State>", "<State>4</State>")
      );
    if (kind === "stage-state")
      xml = header(xml, (r) =>
        r.replace("<State>2</State>", "<State>3</State>")
      );
    if (kind === "target")
      xml = header(xml, (r) =>
        r.replace("<TargetId>13</TargetId>", "<TargetId>14</TargetId>")
      );
    if (kind === "owner-conflict")
      xml = initial(xml, (r) => r.replace("<Id>40</Id>", "<Id>13</Id>"));
    if (kind === "future-owner")
      xml = initial(xml, (r) =>
        r.replace(/<PlayerState><Id>13<\/Id>[\s\S]*?<\/PlayerState>/, "")
      );
    if (kind === "initial-identity")
      xml = initial(xml, (r) =>
        r.replace("<Id>13</Id>", "<Id>13</Id><Data><Id>99</Id></Data>")
      );
    if (kind === "version") {
      expect(() => analyze(xml)).toThrow("Unsupported replay version");
      return;
    }
    const e = result(analyze(xml));
    expect(e?.metadata.recordedTreatment).toBeUndefined();
    expect(e?.metadata.treatmentAftermath).toBeUndefined();
    expect(e?.weightedDelta ?? 0).toBe(0);
  });
  it("keeps unexpected dice observable instead of calling them a treatment control", () => {
    const r = analyze(
        body(treatmentXml(), (s) =>
          s.replace(
            "</ResultApothecary>",
            "<Dice><Die><DieType>0</DieType><Value>3</Value></Die></Dice></ResultApothecary>"
          )
        )
      ),
      e = result(r);
    expect(e.metadata.recordedTreatment).toBeUndefined();
    expect(
      r.diceRecords.some(
        (d) =>
          d.parentSourceId === e.metadata.sourceId && d.dice[0]?.value === 3
      )
    ).toBe(true);
    expect(r.coverage.rollCandidates.excludedCount).toBeGreaterThan(1);
  });
  it.each([false, true])(
    "keeps source-original identity with SPP present=%s",
    (spp) => {
      const r = analyze(treatmentXml({ spp })),
        e = result(r);
      expect(e.metadata.apothecary?.applied).toBe("injury_original");
      expect(!!e.metadata.apothecary?.treatmentSppSourceId).toBe(spp);
      expect(r.events.filter((e) => e.metadata.treatmentSpp)).toHaveLength(
        spp ? 1 : 0
      );
    }
  );
  it("retains explicitly absent controllers and off-pitch flags without defaulting zero", () => {
    const r = analyze(reserve()),
      e = result(r),
      a = e.metadata.treatmentAftermath!;
    expect(e.metadata.apothecary).toBeUndefined();
    expect(a.observation).toEqual({
      cell: { x: -1, y: -1 },
      situationCode: 1,
      statusCode: null,
      canAct: true,
      tackleZone: true
    });
    expect(a.recordedFlags).toEqual({
      status: false,
      canAct: true,
      tackleZone: true
    });
    expect(a.observedActiveGamerId).toBeNull();
    const c = r.events.find(
      (e) => e.metadata.treatmentControl?.kind === "gamer"
    )!.metadata.treatmentControl!;
    expect(c).toEqual({ kind: "gamer", gamerId: null, recordedGamer: false });
  });
});

describe("only the first compatible aftermath can be linked", () => {
  it.each([
    "before-phase",
    "phase",
    "unstable",
    "missing-stable",
    "on-pitch",
    "missing-cell",
    "situation",
    "status",
    "missing-player",
    "duplicate-player",
    "identity",
    "partial-data",
    "team",
    "both-omitted",
    "third-team",
    "unknown-tail",
    "unknown-control",
    "timer-type",
    "timer-team",
    "timer-value",
    "gamer",
    "gamer-extra",
    "pause-extra",
    "standby-phase",
    "standby-gamer",
    "board-controller",
    "first-bad-board",
    "first-empty-board"
  ])(
    "withholds the after-state for %s without erasing the notification",
    (kind) => {
      let xml = treatmentXml();
      if (kind === "before-phase")
        xml = initial(xml, (r) =>
          r.replace(
            "<CurrentPhase>5</CurrentPhase>",
            "<CurrentPhase>0</CurrentPhase>"
          )
        );
      if (kind === "phase")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(
            "<CurrentPhase>5</CurrentPhase>",
            "<CurrentPhase>6</CurrentPhase>"
          )
        );
      if (kind === "unstable")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<IsStable>1</IsStable>", "<IsStable>0</IsStable>")
        );
      if (kind === "missing-stable")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<IsStable>1</IsStable>", "")
        );
      if (kind === "on-pitch")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<X>-1</X><Y>-1</Y>", "<X>5</X><Y>5</Y>")
        );
      if (kind === "missing-cell")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<X>-1</X><Y>-1</Y>", "<X>-1</X>")
        );
      if (kind === "situation")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<Situation>4</Situation>", "<Situation>2</Situation>")
        );
      if (kind === "status")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<Status>4</Status>", "<Status>0</Status>")
        );
      if (kind === "missing-player")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(/<PlayerState><Id>13<\/Id>[\s\S]*?<\/PlayerState>/, "")
        );
      if (kind === "duplicate-player")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(
            /(<PlayerState><Id>13<\/Id>[\s\S]*?<\/PlayerState>)/,
            "$1$1"
          )
        );
      if (kind === "identity")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<Id>13</Id>", "<Id>13</Id><Data><Id>99</Id></Data>")
        );
      if (kind === "partial-data")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(
            "<Id>13</Id>",
            "<Id>13</Id><Data><IdPlayerTypes>8</IdPlayerTypes></Data>"
          )
        );
      if (kind === "team")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace("<TeamId>0</TeamId>", "<TeamId>1</TeamId>")
        );
      if (kind === "both-omitted")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(/<Data><TeamId>[01]<\/TeamId><\/Data>/g, "")
        );
      if (kind === "third-team")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(
            "</ListTeams>",
            "<TeamState><Data><TeamId>2</TeamId></Data><ListPitchPlayers/></TeamState></ListTeams>"
          )
        );
      if (kind === "unknown-tail") {
        xml = treatmentXml().replace(
          /(<\/Results><\/StepResult><\/Sequence><\/EventExecuteSequence>)(<EventActiveGamerChanged>)/,
          (_m, end: string, next: string) =>
            end.replace(
              "</Results>",
              `<StringMessage><MessageData>${Buffer.from(Buffer.from("<UnmodeledAftermath/>").toString("base64")).toString("base64")}</MessageData></StringMessage></Results>`
            ) + next
        );
      }
      if (kind === "unknown-control")
        xml = xml.replace(
          "<EventPauseActiveTimer/>",
          "<UnmodeledControl/><EventPauseActiveTimer/>"
        );
      if (kind === "timer-type")
        xml = xml.replace("<Type>1</Type>", "<Type>2</Type>");
      if (kind === "timer-team")
        xml = xml.replace("<Team>1</Team>", "<Team>0</Team>");
      if (kind === "timer-value")
        xml = xml.replace("<Value>220</Value>", "<Value>NaN</Value>");
      if (kind === "gamer")
        xml = xml.replace(
          "<NewActiveGamer>1</NewActiveGamer>",
          "<NewActiveGamer>2</NewActiveGamer>"
        );
      if (kind === "gamer-extra")
        xml = xml.replace(
          "</EventActiveGamerChanged>",
          "<Unknown>0</Unknown></EventActiveGamerChanged>"
        );
      if (kind === "pause-extra")
        xml = xml.replace(
          "<EventPauseActiveTimer/>",
          "<EventPauseActiveTimer><Unknown>0</Unknown></EventPauseActiveTimer>"
        );
      if (kind === "standby-phase")
        xml = xml.replace("<Phase>5</Phase>", "<Phase>6</Phase>");
      if (kind === "standby-gamer")
        xml = xml.replace(
          "<ActiveGamer>1</ActiveGamer></EventRulesEngineStandBy>",
          "<ActiveGamer>0</ActiveGamer></EventRulesEngineStandBy>"
        );
      if (kind === "board-controller")
        xml = mapTreatmentAfterBoard(xml, (r) =>
          r.replace(
            "<ActiveGamer>1</ActiveGamer>",
            "<ActiveGamer>0</ActiveGamer>"
          )
        );
      if (kind === "first-bad-board")
        xml = xml.replace(
          /<BoardState>([\s\S]*?)<\/BoardState>/,
          (_m, b: string) =>
            `<BoardState>${b.replace("<Situation>4</Situation>", "<Situation>2</Situation>")}</BoardState><BoardState>${b}</BoardState>`
        );
      if (kind === "first-empty-board")
        xml = xml.replace(
          "<BoardState>",
          "<BoardState><CurrentPhase>5</CurrentPhase><IsStable>1</IsStable></BoardState><BoardState>"
        );
      const e = result(analyze(xml));
      expect(e.metadata.recordedTreatment).toBeDefined();
      expect(e.metadata.treatmentAftermath).toBeUndefined();
      expect(e.weightedDelta).toBe(0);
    }
  );
  it("retains a prefix when a later board changes an omitted field", () => {
    const input = reserve(),
      a = result(analyze(input));
    const b = result(
      analyze(
        input.replace(
          "</Replay>",
          "<ReplayStep><BoardState><CurrentPhase>5</CurrentPhase><IsStable>1</IsStable><ListTeams/></BoardState></ReplayStep></Replay>"
        )
      )
    );
    expect(b.metadata.recordedTreatment).toEqual(a.metadata.recordedTreatment);
    expect(b.metadata.treatmentAftermath).toEqual(
      a.metadata.treatmentAftermath
    );
  });
});

describe("initial original continuation does not borrow unrelated evidence", () => {
  it.each([
    "original-outcome",
    "original-total",
    "original-modifiers",
    "original-missing-modifiers",
    "original-controller",
    "original-header",
    "extra-continuation",
    "unrelated-action",
    "spp-repeat",
    "spp-points",
    "spp-extra",
    "spp-own",
    "spp-unknown",
    "spp-fall",
    "removal-situation",
    "removal-reason",
    "removal-status",
    "removal-player",
    "removal-extra"
  ])("withholds selected-original linkage for %s", (kind) => {
    let xml = treatmentXml();
    if (kind === "original-outcome")
      xml = prompt(xml, (r) =>
        r.replace("<Outcome>1</Outcome>", "<Outcome>3</Outcome>")
      );
    if (kind === "original-total")
      xml = prompt(xml, (r) =>
        r.replace("<Value>4</Value>", "<Value>6</Value>")
      );
    if (kind === "original-modifiers")
      xml = prompt(xml, (r) =>
        r.replace(
          "<Modifiers/>",
          "<Modifiers><Modifier><PlayerId>40</PlayerId><Skill>13</Skill><Effect>-1</Effect><Value>1</Value><ModifierType>27</ModifierType></Modifier></Modifiers>"
        )
      );
    if (kind === "original-missing-modifiers")
      xml = prompt(xml, (r) => r.replace("<Modifiers/>", ""));
    if (kind === "original-controller")
      xml = prompt(xml, (r) =>
        r.replace("<GamerId>0</GamerId>", "<GamerId>2</GamerId>")
      );
    if (kind === "original-header")
      xml = mapTreatmentMessages(xml, (r) =>
        r.startsWith("<DamageStep>") && r.includes("<State>1</State>")
          ? r.replace("<Applied>1</Applied>", "<Applied>0</Applied>")
          : r
      );
    if (kind === "extra-continuation" || kind === "unrelated-action") {
      const step =
        kind === "extra-continuation"
          ? "<DamageStep><Applied>1</Applied><Source>1</Source><PlayerId>13</PlayerId><TargetId>13</TargetId><IsEvaluation>0</IsEvaluation><StepType>2</StepType><State>2</State><Skill>0</Skill><CellFrom><X>5</X><Y>5</Y></CellFrom><CellTo><X>5</X><Y>5</Y></CellTo></DamageStep>"
          : "<PlayerStep><PlayerId>40</PlayerId><TargetId>-1</TargetId><StepType>0</StepType></PlayerStep>";
      const encoded = Buffer.from(
        Buffer.from(step).toString("base64")
      ).toString("base64");
      xml = xml.replace(
        "<EventGamersAreReady/>",
        `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encoded}</MessageData></Step><Results/></StepResult></Sequence></EventExecuteSequence><EventGamersAreReady/>`
      );
    }
    if (kind.startsWith("spp-") && kind !== "spp-fall")
      xml = mapTreatmentMessages(xml, (r) => {
        if (!r.startsWith("<ResultGainSpp>")) return r;
        if (kind === "spp-repeat") return r;
        if (kind === "spp-points")
          return r.replace(
            "<SppGained>2</SppGained>",
            "<SppGained>3</SppGained>"
          );
        if (kind === "spp-extra")
          return r.replace(
            "</ResultGainSpp>",
            "<Unknown>0</Unknown></ResultGainSpp>"
          );
        return r.replace(
          "<PlayerId>40</PlayerId>",
          `<PlayerId>${kind === "spp-own" ? 13 : 99}</PlayerId>`
        );
      });
    if (kind === "spp-repeat") {
      xml = treatmentXml();
      const message = xml
        .match(
          /<StringMessage><MessageData>[^<]+<\/MessageData><\/StringMessage>/g
        )!
        .find((m) =>
          Buffer.from(
            Buffer.from(
              m.match(/<MessageData>([^<]+)/)![1]!,
              "base64"
            ).toString(),
            "base64"
          )
            .toString()
            .startsWith("<ResultGainSpp>")
        )!;
      xml = xml.replace(message, message + message);
    }
    if (kind === "spp-fall") xml = treatmentXml({ source: 9 });
    if (kind.startsWith("removal-"))
      xml = mapTreatmentMessages(xml, (r) => {
        if (!r.startsWith("<ResultPlayerRemoval>")) return r;
        if (kind === "removal-situation")
          return r.replace(
            "<Situation>4</Situation>",
            "<Situation>1</Situation>"
          );
        if (kind === "removal-reason")
          return r.replace("<Reason>0</Reason>", "<Reason>1</Reason>");
        if (kind === "removal-status")
          return r.replace("<Status>4</Status>", "<Status>0</Status>");
        if (kind === "removal-player")
          return r.replace(
            "<PlayerId>13</PlayerId>",
            "<PlayerId>40</PlayerId>"
          );
        return r.replace(
          "</ResultPlayerRemoval>",
          "<Unknown>0</Unknown></ResultPlayerRemoval>"
        );
      });
    const e = result(analyze(xml));
    if (["spp-extra", "removal-extra"].includes(kind)) {
      expect(e.metadata.recordedTreatment).toBeUndefined();
      expect(e.teamId).toBe("unresolved");
      expect(e.metadata.ownershipConflict?.reason).toBe(
        "unverified_transition"
      );
    } else expect(e.metadata.recordedTreatment).toBeDefined();
    expect(e.metadata.apothecary).toBeUndefined();
    expect(e.weightedDelta).toBe(0);
  });
});

describe("exported treatment receipts preserve uncertainty and source order", () => {
  it.each([
    "stage",
    "wire-stage",
    "subject",
    "role",
    "dice",
    "probability",
    "actual",
    "weight",
    "posture",
    "action-flag",
    "tackle-flag",
    "active-controller",
    "checkpoint",
    "before",
    "roster",
    "control-order",
    "control-gamer",
    "control-team",
    "control-pause",
    "orphan-controls"
  ])("rejects %s forgery", (kind) => {
    const r = analyze(reserve()),
      e = result(r),
      a = e.metadata.treatmentAftermath!,
      record = e.metadata.recordedTreatment!;
    if (kind === "stage") record.stage = "initial_injury";
    if (kind === "wire-stage") record.wireIsInjury = 1;
    if (kind === "subject") record.subjectId = "40";
    if (kind === "role") e.metadata.ownership!.role = "actor";
    if (kind === "dice") e.metadata.dice = [6];
    if (kind === "probability") e.probabilitySuccess = 1;
    if (kind === "actual") e.actualSuccess = true;
    if (kind === "weight") e.explainability.weight = 1.5;
    if (kind === "posture") a.observation.statusCode = 0;
    if (kind === "action-flag") a.observation.canAct = null;
    if (kind === "tackle-flag") a.observation.tackleZone = null;
    if (kind === "active-controller") a.observedActiveGamerId = 0;
    if (kind === "checkpoint") a.checkpointAfter++;
    if (kind === "before") a.beforeCheckpointAfter = e.metadata.sourceIndex!;
    if (kind === "roster") a.rosterIndex = 1;
    if (kind === "control-order")
      [a.controlSourceIds[0], a.controlSourceIds[1]] = [
        a.controlSourceIds[1]!,
        a.controlSourceIds[0]!
      ];
    if (kind.startsWith("control-")) {
      for (const e of r.events) {
        const c = e.metadata.treatmentControl;
        if (kind === "control-gamer" && c?.kind === "gamer") c.gamerId = 0;
        if (kind === "control-team" && c?.kind === "timer") c.team = 0;
        if (kind === "control-pause" && c?.kind === "timer") c.isPaused = 0;
      }
    }
    if (kind === "orphan-controls") delete e.metadata.treatmentAftermath;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    "resource",
    "original",
    "removal",
    "spp-pointer",
    "spp-parent",
    "spp-original",
    "spp-team",
    "spp-index",
    "spp-points",
    "delete-spp",
    "physical-status"
  ])("rejects selected-original %s forgery", (kind) => {
    const r = analyze(),
      e = result(r),
      selection = e.metadata.apothecary!,
      spp = r.events.find((e) => e.metadata.treatmentSpp)!;
    if (kind === "resource") e.metadata.recordedTreatment!.resourceSpent = 1;
    if (kind === "original") selection.originalSourceId = "source-not-present";
    if (kind === "removal")
      selection.initialRemovalSourceId = selection.originalSourceId;
    if (kind === "spp-pointer")
      selection.treatmentSppSourceId = "source-not-present";
    if (kind === "spp-parent")
      spp.metadata.treatmentSpp!.treatmentSourceId = selection.originalSourceId;
    if (kind === "spp-original")
      spp.metadata.treatmentSpp!.originalSourceId = "source-not-present";
    if (kind === "spp-team") spp.teamId = e.teamId;
    if (kind === "spp-index") spp.metadata.sourceIndex!++;
    if (kind === "spp-points")
      Object.assign(spp.metadata.treatmentSpp!, { points: 3 });
    if (kind === "delete-spp") delete spp.metadata.treatmentSpp;
    if (kind === "physical-status")
      r.diceRecords.find(
        (d) => d.parentSourceId === selection.originalSourceId
      )!.status = 2;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});

it.each([
  [
    "001",
    "UI-064",
    [38],
    [90000],
    "initial_injury",
    1,
    0,
    "Injury treated (recorded)"
  ],
  ["002", "UI-060", [8], [47], "casualty", 1, 0, "No injury (applied)"],
  ["004", "UI-033", [48], [90000], "casualty", 0, 8, "Neck Injury (applied)"],
  [
    "021",
    "UI-065",
    [10],
    [48],
    "casualty",
    1,
    9,
    "Dislocated Shoulder (applied)"
  ],
  ["021", "UI-066", [2], [43], "casualty", 1, 3, "Serious Injury (applied)"]
] as const)(
  "retains %s/%s's independently witnessed applied namespace",
  (file, id, home, away, stage, used, code, name) => {
    const e = result(
      analyze(playbackFragmentXml(file, id, [...home], [...away]))
    );
    expect(e.metadata.recordedTreatment).toMatchObject({
      stage,
      resourceSpent: used,
      appliedOutcomeCode: code
    });
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      actualSuccess: null,
      probabilitySuccess: null,
      weightedDelta: 0
    });
    expect(formatActualOutcome(e)).toBe(name);
  }
);
