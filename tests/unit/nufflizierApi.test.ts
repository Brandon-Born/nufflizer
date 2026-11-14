// pnpm test runs this real-worker acceptance file after the parallel corpus
// suite, preserving the production4s deadline without unrelated CPU contention.
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { sequence, rollXml } from "../helpers/replay";
import { POST } from "@/app/api/nufflizier/analyze/route";
import { scoringRushXml } from "../helpers/scoringRush";

describe("POST /api/nufflizier/analyze", () => {
  it("exports demo1's original failed Catch envelope through the real bounded worker", async () => {
    const data=new FormData();data.append("replay",new File([readFileSync("demo-replays/demo1.bbr")],"source.bbr"));
    const response=await POST(new Request("http://localhost/api/nufflizier/analyze",{method:"POST",body:data}));
    const payload=await response.json();expect(response.status,JSON.stringify(payload).slice(0,200)).toBe(200);
    const report=LuckReportSchema.parse(payload),e=report.events.find(e=>e.metadata.retainedCatchReaction)!;
    const measuredZero=report.events.find(e=>e.metadata.sourceId==="source-272")!;
    expect(measuredZero).toMatchObject({scoringStatus:"scored",delta:0,weightedDelta:0,probabilitySuccess:null,actualSuccess:null});
    expect(measuredZero.metadata.block!.skillModel!.nonKnockdownSkills).toEqual({policy:"outside_current_pool_knockdowns",attacker:[102],defender:[]});
    expect(report.rerollResources).toMatchObject({decisionCount:21,linkedCount:20,unresolvedCount:1});
    expect(report.rerollResources.flow.clockWindows.find(w=>w.recordedUsedCount===2&&w.before?.count===4&&w.after?.count===2)).toMatchObject({netDecrease:2,status:"observed_agreement"});
    expect(report.rerollResources.decisions.find(d=>d.decisionSourceId==="source-5407")).toMatchObject({status:"unresolved",questionSourceId:"source-5404",teamId:null});
    expect(report.events.find(e=>e.metadata.sourceId==="source-5407")?.label).toBe("Recorded team reroll use");
    expect(e.metadata.sourceId).toBe("source-548");expect(e.metadata.retainedCatchReaction).toMatchObject({beforeCheckpointAfter:538,waitingCheckpointAfter:545});
    expect(e.catchPossessionBounds).toMatchObject({policy:"kept_catch_failure_envelope",lower:-2/3,upper:0});
    expect(e.probabilitySuccess).toBe(1/3);expect(e.weightedDelta).toBeCloseTo(-11/30,12);
    expect(e.metadata.preRoll).toBeUndefined();expect(report.teams.every(t=>t.impactCount===0)).toBe(true);
  },20000);
  it("keeps opt-in worker stage diagnostics separate from report data", async () => {
    vi.stubEnv("NUFFLIZIER_ANALYZER_TIMING", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const data = new FormData();
      const hidden=Array.from({length:100},(_,i)=>`<Unknown${i}><Dice><Die><DieType>0</DieType><Value>3</Value></Die></Dice></Unknown${i}>`).join("");
      const xml=scoringRushXml().replace("</Replay>",`<ReplayStep>${sequence([rollXml(7,6,2)])}<BoardState>${hidden}</BoardState></ReplayStep></Replay>`);
      data.set("replay",new File([xml],"private-input.xml"));
      const response = await POST(new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST", body: data
      }));
      expect(response.status).toBe(200);
      const report = LuckReportSchema.parse(await response.json());
      expect(report.coverage.rollCandidates).toMatchObject({scoredCount:2,excludedCount:100,scoredRate:2/102});
      expect(report.coverage.diceRecords).toMatchObject({eventRecordCount:2,snapshotRecordCount:100,unresolvedCount:100});
      expect(report.events.find(e=>e.metadata.rollType===7)).toMatchObject({scoringStatus:"scored",actualSuccess:true,probabilitySuccess:5/6});
      expect(report.events.find(e=>e.metadata.rollType===1)?.contextualImpact).toMatchObject({policy:"ordinary_no_retry_scoring_rush",difference:12,contribution:-10});
      expect(report.teams[0]!.impactByType.movement_risk).toBe(-10);
      expect(report.coverage.rollFamilies.find(f=>f.sourceTag==="BoardState")).toMatchObject({unattributedCount:100,unresolvedIdentityCount:100,malformedCount:0});
      const records = log.mock.calls.map(([s]) => JSON.parse(s));
      expect(records.map(r => r.stage)).toEqual([
        "worker_start", "worker_ready", "decode", "parse", "analyze", "validate", "serialize"
      ]);
      expect(records.every(r => Object.keys(r).sort().join() === "atMs,event,stage" &&
        r.event === "nufflizier_analysis_stage" && Number.isSafeInteger(r.atMs))).toBe(true);
      expect(JSON.stringify(records)).not.toContain("private-input");
      expect(JSON.stringify(report)).not.toContain("analysis_stage");
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });
  it("exports both combined failure subtotals from the original demo2 worker", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo2.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      falls = report.events.filter(
        (e) => e.metadata.movementFall?.combinedRushSourceId
      );
    const newlyOwned = report.events.find(
      (e) => e.metadata.sourceId === "source-2737"
    )!;
    expect(newlyOwned).toMatchObject({
      teamId: "0",
      playerId: "14",
      scoringStatus: "scored",
      probabilitySuccess: 7 / 12,
      metadata: {
        ownership: {
          role: "subject",
          basis: "current_roster",
          identitySourceId: "source-29",
          teamId: "0"
        }
      }
    });
    expect(newlyOwned.weightedDelta).toBeLessThan(0);
    const rushes=report.events.filter(e=>e.contextualBounds?.policy === "team_reroll_rush_moves");
    const retained=report.events.find(e=>e.metadata.sourceId==="source-2704")!;
    expect(retained.contextualBounds).toMatchObject({policy:"kept_rush_terminal_moves",minimumMoves:0,maximumMoves:9,successChance:5/6,lower:-15/2,upper:0});
    expect(retained.metadata.retainedRushContext).toMatchObject({successRushSourceId:"source-2696",moveOutcomeSourceId:"source-2698",waitingCheckpointAfter:2700});
    expect(retained.metadata.movementFall).toMatchObject({diceContribution:-5/3,unscoredDamageRolls:1});
    expect(retained.metadata.teamRerollsSpent).toBe(0);expect(retained.probabilitySuccess).toBe(5/6);
    const dodge=report.events.find(e=>e.metadata.sourceId==="source-3775")!;
    expect(dodge.contextualBounds).toMatchObject({policy:"kept_dodge_terminal_moves",successChance:2/3,minimumMoves:0,maximumMoves:8,lower:-16/3,upper:0});
    expect(dodge.metadata).toMatchObject({rerollUsed:false,teamRerollsSpent:0,preRoll:{actorCell:{x:9,y:11},actorMovementRemaining:3},movementFall:{armorHeld:true,unscoredDamageRolls:0}});
    expect(dodge.metadata.movementFall!.diceContribution).toBeCloseTo(-17/30,12);
    expect(dodge.contextualImpact).toBeUndefined();expect(dodge.probabilitySuccess).toBe(2/3);
    expect(rushes.map(e=>e.metadata.sourceId)).toEqual(["source-702","source-1091"]);
    expect(rushes.map(e=>e.contextualBounds!.maximumMoves)).toEqual([5,6]);
    expect(rushes.every(e=>e.contextualBounds!.successChance===5/6 && e.probabilitySuccess===35/36 && e.contextualImpact===undefined)).toBe(true);
    const rescued=report.events.find(e=>e.metadata.sourceId==="source-702")!;
    expect(rescued.metadata.rerollDraws).toMatchObject({initialSourceId:"source-698",initialFace:1,baseSuccessChance:5/6,initialDelta:-5/6});
    expect(rescued.metadata.rerollDraws!.replacementDelta).toBeCloseTo(1/6,12);
    expect(rescued.actualSuccess).toBe(true);expect(rescued.delta).toBeCloseTo(-2/3,12);expect(rescued.weightedDelta).toBeCloseTo(-2/3,12);
    const components=report.contextComponents.find(t=>t.teamId==="1")!;
    expect(components.componentCount).toBe(4);expect(components.byCategory.map(c=>c.type)).toEqual(["dodge","movement_risk"]);
    expect(components.bounds!.lower).toBeCloseTo(-77/6,12);expect(components.bounds!.upper).toBeCloseTo(11/6,12);
    expect(falls.map((e) => e.metadata.locator?.replayStep)).toEqual([
      229, 259
    ]);
    expect(falls[0]!.metadata.movementFall!.diceContribution).toBeCloseTo(
      -2 / 5,
      12
    );
    expect(falls[1]!.metadata.movementFall!.diceContribution).toBeCloseTo(
      3 / 20,
      12
    );
    // These combined Rushes succeeded on their first die. Their existing
    // single-attempt contributions and fall subtotals must not shift.
    for (const fall of falls) {
      const rush = report.events.find(e => e.metadata.sourceId === fall.metadata.movementFall!.combinedRushSourceId)!;
      expect(rush.actualSuccess).toBe(true);
      expect(rush.metadata.rerollDraws).toBeUndefined();
      expect(rush.delta).toBeCloseTo(1 / 6, 12);
    }
    expect(
      falls.every(
        (e) => e.actualSuccess === false && e.contextualImpact === undefined
      )
    ).toBe(true);
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("retains the full-source Dodge budget without filling its missing period", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo11.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      e = report.events.find(
        (e) =>
          e.metadata.locator?.replayStep === 194 &&
          e.metadata.teamRerollMovement
      )!;
    const original=report.events.find(e=>e.metadata.sourceId==="source-4546")!;
    expect(report.rerollResources).toMatchObject({decisionCount:15,linkedCount:15,unresolvedCount:0});
    expect(report.rerollResources.flow.clockWindows.find(w=>w.recordedUsedCount===2&&w.before?.count===2&&w.after?.count===null)).toMatchObject({netDecrease:null,status:"not_comparable"});
    expect(report.rerollResources.decisions.find(d=>d.decisionSourceId==="source-4548")).toMatchObject({status:"linked",questionSourceId:"source-4546",teamId:"1"});
    expect(report.events.find(e=>e.metadata.sourceId==="source-4548")?.metadata.recordedRerollChoice).toEqual({gamerId:1,used:false,validFields:true});
    expect(report.events.find(e=>e.metadata.sourceId==="source-4548")?.label).toBe("Recorded team reroll not used");
    expect(original.metadata.numericOriginal).toEqual({gamerId:1,canUseTeamReroll:false,canUseProReroll:true});
    expect(original.scoringStatus).toBe("scored");expect(original.probabilitySuccess).toBeCloseTo(2/3,12);
    expect(original.delta).toBeCloseTo(-2/3,12);expect(original.weightedDelta).toBeCloseTo(-11/15,12);
    expect(original.metadata.fixedNumericModifiers).toEqual([{playerId:14,modifierType:3,skillId:-1,effectId:-1,value:-1}]);
    expect(report.events.find(e=>e.metadata.sourceId==="source-4551")?.metadata.isRollCandidate).toBe(false);
    const kept=report.events.find(e=>e.metadata.sourceId==="source-4551")!;
    expect(kept.metadata.failedNumericRetry).toMatchObject({kind:"pro",originalSourceId:"source-4546",choiceSourceId:"source-4548",skillSourceId:"source-4549",gateSourceId:"source-4550"});
    expect(kept.metadata.failedNumericRetry!.fixedPolicySuccessChance).toBeCloseTo(22/27,12);
    const access=report.events.find(e=>e.metadata.sourceId==="source-4550")!;
    expect(access.scoringStatus).toBe("scored");expect(access.type).toBe("dodge");expect(access.metadata.rollType).toBe(15);
    expect(access.metadata.probabilityPolicy).toBe("gated_retry_access");expect(access.probabilitySuccess).toBeCloseTo(2/3,12);
    expect(access.delta).toBeCloseTo(-4/9,12);expect(access.weightedDelta).toBeCloseTo(-22/45,12);
    expect(report.diceRecords.find(d=>d.parentSourceId==="source-4550"&&d.path.join(".")==="Dice")?.disposition).toBe("covered_roll");

    expect(kept.metadata.teamRerollsSpent).toBeUndefined();expect(report.events.find(e=>e.metadata.sourceId===kept.metadata.failedNumericRetry!.gateSourceId)!.metadata.teamRerollsSpent).toBe(0);expect(kept.scoringStatus).toBe("excluded");expect(kept.probabilitySuccess).toBeNull();expect(kept.weightedDelta).toBe(0);
    expect(report.diceRecords.find(d=>d.parentSourceId==="source-4546" && d.path.join(".")==="RollInfos.Dice")?.disposition).toBe("covered_roll");
    const crowd=report.events.find(e=>e.metadata.blockCrowd?.subjectId === "38")!,proof=crowd.metadata.blockCrowd!;
    expect(crowd.metadata.sourceId).toBe("source-3716");expect(proof.after).toMatchObject({checkpointAfter:3730,cell:{x:-1,y:-1},canAct:true,tackleZone:true,statusCode:null});
    expect(crowd.metadata.blockResolution!.unscoredDamageRolls).toBe(1);
    const injuries=report.events.filter(e=>e.metadata.injuryObservation);
    expect(injuries.some(e=>e.metadata.injuryObservation?.outcome === "casualty")).toBe(true);
    expect(injuries.every(e=>e.scoringStatus === "excluded" && e.probabilitySuccess === null && e.actualSuccess === null && e.weightedDelta === 0)).toBe(true);
    expect(report.events.find(e=>e.metadata.sourceId === "source-3729")?.metadata.injuryObservation).toMatchObject({outcome:"stunned",subjectId:"38",subjectTeamId:"1",sourceCode:2});

    expect(report.damageSteps.find(s=>s.actionId===proof.damageActionId)).toMatchObject({scoredRolls:0,unscoredRolls:1,diceContribution:0});

    expect(e.metadata.teamRerollMovement).toMatchObject({
      rollType: 2,
      movementBefore: 4,
      movementAfter: 3
    });
    expect(e.metadata.preRoll?.activeTeamId).toBe("1");
    expect(e.metadata.preRoll?.period).toBeNull();
    const componentTeam=report.contextComponents.find(t=>t.teamId==="1")!;
    expect(componentTeam).toMatchObject({componentCount:4,pointCount:0,boundedCount:4});
    expect(componentTeam.bounds!.lower).toBeCloseTo(-14/3,12);expect(componentTeam.bounds!.upper).toBe(4);
    expect(componentTeam.byCategory[0]!.eventIds).toEqual(["12-17-ResultRoll","12-25-ResultRoll","16-28-ResultRoll","35-75-ResultRoll"]);
    expect(componentTeam.byAction).toHaveLength(4);expect(report.teams.every(t=>t.impactCount===0)).toBe(true);
    const terminalMoves=report.events.filter(e=>e.contextualBounds?.policy === "team_reroll_terminal_moves");
    expect(terminalMoves.map(e=>e.metadata.locator?.replayStep)).toEqual([194,249,430]);
    expect(terminalMoves.map(e=>e.contextualBounds?.maximumMoves)).toEqual([6,3,4]);
    expect(terminalMoves.every(e=>e.contextualBounds?.successChance===2/3 && e.contextualImpact===undefined)).toBe(true);
    expect(terminalMoves[1]!.contextualBounds!.lower).toBeCloseTo(-2,12);
    expect(report.events.find(e=>e.metadata.sourceId==="source-1954")?.metadata.activationEnd).toMatchObject({actorId:"46",followingPlayerId:"39",rosterCheckpointAfter:1939,teamTurn:6});
    expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(
      report.events.filter((e) => e.metadata.teamRerollMovement)
    ).toHaveLength(2);
  }, 20000);
  it("exports full-source carrier Rush transitions and touchdown through the worker", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo5.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      moves = report.events.filter((e) => e.metadata.teamRerollMovement);
    const push=report.events.find(e=>e.metadata.sourceId==="source-98")!.metadata.blockPush!;
    expect(push).toMatchObject({status:"modeled",questionSourceId:"source-101",checkpointAfter:98,pitchCheckpointAfter:0,selectedBranch:0,resultSourceIds:["source-103"]});
    if(push.status!=="modeled")throw new Error("missing ordinary push model");expect(push.destinations).toEqual([{x:14,y:9},{x:13,y:10}]);expect(push.branches).toHaveLength(4);
    expect(report.events.find(e=>e.metadata.sourceId==="source-101")).toMatchObject({label:"Recorded push destination choice",scoringStatus:"excluded",weightedDelta:0,metadata:{isRollCandidate:false,pushQuestion:{gamerId:0}}});
    expect(report.events.find(e=>e.metadata.sourceId==="source-3270")!.metadata.activationEnd).toMatchObject({kind:"ordinary_block_completed",actorId:"41",followingPlayerId:"45",teamTurn:13,periodCode:1,blockSourceId:"source-3265"});
    expect(report.events.find(e=>e.metadata.sourceId==="source-3272")!.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds).not.toContain("41");
    const skillPools=report.events.filter(e=>e.metadata.block?.skillModel);
    expect(skillPools.filter(e=>!e.metadata.block!.skillModel!.nonKnockdownSkills).map(e=>e.metadata.sourceId)).toEqual(["source-98","source-132","source-367","source-386","source-409"]);
    expect(skillPools.filter(e=>e.metadata.block!.skillModel!.nonKnockdownSkills).map(e=>e.metadata.sourceId)).toEqual(["source-116","source-338","source-438","source-579","source-634","source-638"]);
    expect(report.schemaVersion).toBe("2.66");
    expect(report.modelVersion).toBe("dice-only-34");
    const positive=report.events.find(e=>e.metadata.sourceId==="source-98")!;
    const negative=report.events.find(e=>e.metadata.sourceId==="source-132")!;
    expect(positive.metadata.blockScoring).toMatchObject({policy:"fixed_pool_knockdown_balance",observedValue:1,expectedValue:19/36});
    expect(positive.weightedDelta).toBeCloseTo(17/48,12);
    expect(negative.weightedDelta).toBeCloseTo(-19/48,12);
    for(const e of [positive,negative]) {
      expect(e.scoringStatus).toBe("scored");expect(e.actualSuccess).toBeNull();expect(e.probabilitySuccess).toBeNull();
    }
    const unknownPool=report.events.find(e=>e.metadata.sourceId==="source-1324")!;
    expect(unknownPool).toMatchObject({scoringStatus:"excluded",weightedDelta:0,actualSuccess:null,probabilitySuccess:null});
    expect(unknownPool.metadata.blockResolution).toMatchObject({unscoredPool:true,unscoredDamageRolls:1});
    expect(report.events.find(e=>e.metadata.sourceId==="source-367")!.metadata.blockPush).toMatchObject({status:"modeled"});
    expect(report.events.find(e=>e.metadata.sourceId==="source-402")!.metadata.injuryTable?.traitEvidence).toMatchObject({observedCheckpointAfter:0});
    const injuryTableEvent=report.events.find(e=>e.metadata.sourceId==="source-110")!;
    expect(injuryTableEvent.metadata.injuryTable).toMatchObject({rules:"bb2020",policy:"fixed_unmodified_injury",stunty:false,thickSkull:false,counts:[21,9,0,6],traitEvidence:{playerId:"46",teamId:"1",observedCheckpointAfter:0,currentCheckpointAfter:104}});
    expect(injuryTableEvent.scoringStatus).toBe("scored");
    expect(injuryTableEvent.probabilitySuccess).toBeNull();
    expect(injuryTableEvent.actualSuccess).toBeNull();
    expect(injuryTableEvent.weightedDelta).toBe(-0.625);
    expect(report.events.find(e=>e.metadata.sourceId==="source-1755")).toMatchObject({playerId:"38",teamId:"1",scoringStatus:"excluded",weightedDelta:0,metadata:{armorModifierUse:{subjectId:"2",subjectTeamId:"0",armorSourceId:"source-1756"},skillUsage:{skillId:13,used:true}}});
    expect(report.events.find(e=>e.metadata.sourceId==="source-1757")).toMatchObject({scoringStatus:"excluded",probabilitySuccess:null,weightedDelta:0});
    expect(injuryTableEvent.metadata.injuryScoring).toMatchObject({policy:"injury_table_order",armorSourceId:"source-109",cause:{kind:"block",poolSourceId:"source-98"},lessSevereChance:21/36,sameSeverityChance:9/36,moreSevereChance:6/36});
    expect(report.events.filter(e=>e.metadata.blockBallRelease)).toHaveLength(3);
    const release=report.events.find(e=>e.metadata.sourceId==="source-1324")!.metadata.blockBallRelease!;
    expect(release).toMatchObject({holderId:"40",holderTeamId:"1",beforeCheckpointAfter:1336,from:{x:13,y:2},to:{x:14,y:2},bounceSourceId:"source-1346",after:{checkpointAfter:1347,carrierId:null,isHeld:null}});
    expect(report.events.find(e=>e.metadata.sourceId===release.bounceSourceId)).toMatchObject({scoringStatus:"excluded",probabilitySuccess:null,weightedDelta:0,metadata:{ballTravel:{from:{x:13,y:2},to:{x:14,y:2}}}});
    for(const pool of skillPools) {
      // Preserve the earlier five literal table expectations. The six new
      // tables have independent full-source rational joins in the source gate.
      if(!pool.metadata.block!.skillModel!.nonKnockdownSkills){
        expect(pool.metadata.block!.skillModel!.expectedValue).toBeCloseTo(["source-98","source-132"].includes(pool.metadata.sourceId!)?19/36:1/6,12);
        expect(pool.metadata.block!.skillModel!.positiveChance).toBeCloseTo(["source-98","source-132"].includes(pool.metadata.sourceId!)?5/9:1/3,12);
      }
      expect(pool.metadata.block!.traitEvidence!.attacker.observedCheckpointAfter).toBe(0);
      expect(pool.metadata.preRoll?.actorTraits).toBeUndefined();
    }
    expect(moves.map((e) => e.metadata.locator?.replayStep)).toEqual([44, 118]);
    for (const e of moves) {
      expect(e.metadata.teamRerollMovement).toMatchObject({
        carriesBall: true,
        movementBefore: null,
        movementAfter: null
      });
      expect(e.probabilitySuccess).toBeCloseTo(35 / 36, 12);
    }
    expect(moves[1]!.metadata.movementTouchdown?.destination).toEqual({
      x: 25,
      y: 12
    });
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("returns a valid report including the resumed real Catch and its two draws", async () => {
    const formData = new FormData();
    formData.append(
      "replay",
      new File([readFileSync("demo-replays/demo4.bbr")], "source4.bbr", {
        type: "application/octet-stream"
      })
    );

    const request = new Request("http://localhost/api/nufflizier/analyze", {
      method: "POST",
      body: formData
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty("match");
    expect(payload).toHaveProperty("verdict");
    expect(payload).toHaveProperty("teams");
    expect(payload).toHaveProperty("keyMoments");
    expect(payload).toHaveProperty("events");
    expect(payload).toHaveProperty("coverage");
    expect(payload).toHaveProperty("coverage.allEvents");
    expect(payload).toHaveProperty("coverage.rollCandidates");
    expect(payload).toHaveProperty("coverage.scoredByType");
    expect(payload).toHaveProperty("coverage.excludedByType");
    expect(payload).toHaveProperty("coverage.excludedByReason");
    expect(payload).toHaveProperty("weightTable");
    expect(payload).toHaveProperty("howScoredSummary");

    const report=LuckReportSchema.parse(payload),catchRoll=report.events.find(e=>e.metadata.sourceId==="source-1722")!;
    expect(catchRoll.scoringStatus).toBe("scored");expect(catchRoll.probabilitySuccess).toBeCloseTo(8/9,12);expect(catchRoll.weightedDelta).toBeCloseTo(-11/30,12);
    expect(catchRoll.metadata.catchRerollResume).toMatchObject({readySourceIndex:1717,timerSourceIndex:1718,menu:{checkpointAfter:1715,activeGamerId:1,activePlayerId:46,teamTurns:[5,6],periodCode:null,teamRerolls:1},resumed:{checkpointAfter:1718,periodCode:null,teamRerolls:1}});
    expect(catchRoll.metadata.teamRerollsSpent).toBe(1);expect(catchRoll.metadata.preRoll).toBeUndefined();expect(catchRoll.contextualImpact).toBeUndefined();
    expect(report.events.find(e=>e.metadata.sourceId==="source-1715")!.scoringStatus).toBe("excluded");

    const keyMoments = payload.keyMoments as
      Array<{ explainability?: Record<string, unknown> }> | undefined;
    expect(Array.isArray(keyMoments)).toBe(true);
    if (keyMoments && keyMoments.length > 0) {
      expect(keyMoments[0]?.explainability).toHaveProperty("formulaSummary");
      expect(keyMoments[0]?.explainability).toHaveProperty("inputsSummary");
    }
  },20000);

  it("exports actual3+ gate, conditional fresh pools and drive expiries through the upload worker", async () => {
    const formData = new FormData();
    formData.append(
      "replay",
      new File([readFileSync("demo-replays/demo-goblins1.bbr")], "source.bbr", {
        type: "application/octet-stream"
      })
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload);
    expect(
      report.events.filter((e) => e.metadata.lonerGate?.threshold === 3)
    ).toHaveLength(3);
    expect(
      report.events.some((e) => e.metadata.block?.reroll === "loner")
    ).toBe(true);
    expect(report.events.some((e) => e.metadata.driveEffectExpiry)).toBe(true);
    const decision = report.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 365 && e.metadata.teamRerollCounter
    )!;
    expect(decision.metadata.teamRerollCounter).toMatchObject({
      before: { count: 2, periodCode: 1, teamTurn: 9 },
      after: { count: 1, periodCode: 1, teamTurn: 9 },
      spent: 1,
      reconciliation: "matched"
    });
    const offer = report.events.find(
      (e) =>
        e.metadata.sourceId ===
        decision.metadata.teamRerollCounter!.questionSourceId
    )!;
    expect(offer.metadata.block?.pool.attackerChooses).toBe(true);
    expect(offer.metadata.rerollOffer!.decisionSourceId).toBe(
      decision.metadata.sourceId
    );
    expect(report.events.filter((e) => e.contextualBounds)).toHaveLength(3);
    expect(
      report.events.find(
        (e) => e.metadata.locator?.replayStep === 94 && e.contextualBounds
      )?.contextualBounds?.activeContinuation
    ).toEqual({ minimum: 1, maximum: 1 });
    expect(
      report.events.find(
        (e) => e.metadata.locator?.replayStep === 94 && e.metadata.dodgeMovement
      )?.metadata.dodgeMovement
    ).toMatchObject({
      movementBefore: 6,
      movementAfter: 5,
      from: { x: 12, y: 2 },
      to: { x: 13, y: 3 }
    });
    expect(report.teams.every((team) => team.impactCount === 0)).toBe(true);
    expect(
      report.events.some(
        (e) => e.metadata.blockResolution?.damageActionIds.length
      )
    ).toBe(true);
  }, 20000);
  it("exports both source-backed Sure Hands possession ranges without invented clocks or point totals", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo6.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      ranges = report.events.filter((e) => e.possessionBounds);
    expect(report.events.find(e=>e.metadata.sourceId==="source-248")).toMatchObject({playerId:"47",teamId:"1",scoringStatus:"scored",probabilitySuccess:null,actualSuccess:null,weightedDelta:-13/12,metadata:{injuryObservation:{outcome:"badly_hurt",recordKind:"direct"},injuryScoring:{sppSourceId:"source-247"},injuryTable:{otherActionSkills:{policy:"outside_initial_injury_table",skills:[52]}}}});
    expect(report.events.find(e=>e.metadata.sourceId==="source-247")).toMatchObject({playerId:"8",teamId:"0",scoringStatus:"excluded",delta:0,metadata:{isRollCandidate:false,recordedSpp:{points:2}}});
    const classifiedBlock=report.events.find(e=>e.metadata.sourceId==="source-188")!;
    expect(classifiedBlock.weightedDelta).toBeCloseTo(-13/24,12);
    expect(classifiedBlock.metadata.block!.skillModel!.nonKnockdownSkills).toEqual({policy:"outside_current_pool_knockdowns",attacker:[],defender:[52,59]});
    expect(report.rerollResources.decisions.find(d=>d.decisionSourceId==="source-971")).toMatchObject({status:"linked", teamId:"1", decisionWait:{controller:null,activeGamerSourceId:"source-967",pauseSourceId:"source-968",timerSourceId:"source-969",resumedStepSourceId:"source-970"}});
    expect(ranges.map((e) => e.metadata.locator?.replayStep)).toEqual([
      99, 306
    ]);
    expect(ranges[0]!.possessionBounds!.upper).toBeCloseTo(7 / 8, 12);
    expect(ranges[0]!.metadata.pickupResolution).toMatchObject({
      cell: { x: 11, y: 10 },
      movementRemaining: 4
    });
    expect(ranges[1]!.metadata.pickupResolution).toBeUndefined();
    expect(ranges[1]!.possessionBounds!.lower).toBeCloseTo(-4 / 3, 12);
    expect(
      ranges.every(
        (e) =>
          e.metadata.preRoll?.activeTeamId === null &&
          e.metadata.preRoll.actorCarriesBall === null
      )
    ).toBe(true);
    expect(report.coverage.contextEvidence.boundedCount).toBe(3);
    const decision = report.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 345 && e.metadata.teamRerollCounter
    )!;
    expect(decision.metadata.teamRerollCounter).toMatchObject({
      before: { count: 2, teamTurn: 9, periodCode: 1 },
      after: { count: 1, teamTurn: 9, periodCode: 1 },
      spent: 1,
      reconciliation: "matched"
    });
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("exports a source-backed fresh catch envelope through the production worker", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo3.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const r = LuckReportSchema.parse(payload),
      caught = r.events.find((e) => e.catchPossessionBounds)!;
    const casualtyOriginal=r.events.find(e=>e.metadata.sourceId==="source-2033")!,casualtyReplacement=r.events.find(e=>e.metadata.sourceId==="source-2039")!;
    expect(casualtyOriginal.metadata.casualtyObservation).toMatchObject({outcome:"serious_injury",recordKind:"apothecary_original",subjectId:"45",subjectTeamId:"1"});
    expect(casualtyOriginal.metadata.ownership).toMatchObject({role:"subject",playerId:"45",teamId:"1"});
    expect(casualtyReplacement.metadata.casualtyObservation).toMatchObject({outcome:"no_injury",recordKind:"apothecary_replacement",subjectId:"45",subjectTeamId:"1"});
    expect(r.events.find(e=>e.metadata.sourceId==="source-2043")?.metadata.apothecary).toMatchObject({originalSourceId:"source-2033",replacementSourceId:"source-2039",resourceSpent:1,appliedCasualty:0,applied:"replacement"});
    for(const e of [casualtyOriginal,casualtyReplacement])expect(e).toMatchObject({scoringStatus:"excluded",actualSuccess:null,probabilitySuccess:null,delta:0,weightedDelta:0});
    expect(r.diceRecords.find(d=>d.parentSourceId==="source-2039"&&d.path.join()==="OriginalRoll,Dice")).toMatchObject({disposition:"summary",aliasOf:expect.any(String)});
    expect(r.rerollResources.flow.intervals.find(i=>i.pools[1].before?.count===1&&i.pools[1].after?.count===3)?.pools[1]).toMatchObject({netDecrease:-2,status:"not_comparable",reason:"clock_boundary"});
    expect(caught.metadata.locator?.replayStep).toBe(531);
    expect(caught.playerId).toBe("45");
    expect(caught.catchPossessionBounds!.upper).toBeCloseTo(5 / 3, 12);
    expect(caught.metadata.preRoll).toBeUndefined();
    const reached = r.events.find((e) => e.metadata.pickupAfterMovement)!;
    const combined = r.events.find((e) => e.metadata.combinedMovement)!;
    expect(combined.metadata.locator?.replayStep).toBe(402);
    expect(combined.metadata.combinedMovement).toMatchObject({
      from: { x: 17, y: 6 },
      to: { x: 18, y: 7 },
      carriedBallBefore: true,
      movementAfter: null
    });
    expect(combined.probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(reached.metadata.locator?.replayStep).toBe(401);
    expect(reached.metadata.pickupAfterMovement).toMatchObject({
      cell: { x: 17, y: 6 },
      movementRemaining: 0,
      check: { threshold: 3, baseTarget: 2, markerPlayerIds: ["42"] }
    });
    expect(reached.metadata.preRoll).toMatchObject({
      actorCarriesBall: null,
      activeTeamId: null,
      actorMovementRemaining: 0
    });
    expect(reached.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(reached.possessionBounds).toBeUndefined();
    expect(
      r.events
        .filter((e) => e.metadata.teamRerollMovement?.zonePenalty)
        .map((e) => e.metadata.locator?.replayStep)
    ).toEqual([273, 401]);
    const pickup = r.events.find((e) => e.metadata.pickupTurnEnd)!;
    expect(pickup.metadata.pickupTurnEnd!.ordinaryMoves).toEqual({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: [
        "37",
        "38",
        "39",
        "40",
        "41",
        "43",
        "44",
        "45",
        "47",
        "48"
      ]
    });
    expect(
      r.events.find(
        (e) =>
          e.metadata.sourceId === pickup.metadata.pickupTurnEnd!.endSourceId
      )?.metadata.turnEndReason
    ).toBe(2);
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("exports completed initial-member Moves through the original demo7 worker",async()=>{
    const form=new FormData();form.set("replay",new File([readFileSync("demo-replays/demo7.bbr")],"source7.bbr"));
    const response=await POST(new Request("http://localhost/api/nufflizier/analyze",{method:"POST",body:form}));
    const body=await response.json();expect(response.status,JSON.stringify(body).slice(0,200)).toBe(200);
    const report=LuckReportSchema.parse(body),e=report.events.find(e=>e.metadata.sourceId==="source-3098")!;
    expect(report.rerollResources.decisions.find(d=>d.decisionSourceId==="source-5448")).toMatchObject({status:"linked",teamId:"1",decisionWait:{controller:null,activeGamerSourceId:"source-5444",pauseSourceId:"source-5445",timerSourceId:"source-5446",resumedStepSourceId:"source-5447"}});
    const recovery=report.events.find(e=>e.metadata.sourceId==="source-1746")!;
    expect(recovery.weightedDelta).toBe(-0.75);expect(recovery.metadata.regenerationAftermath).toMatchObject({checkpointAfter:1747,controlSourceIds:["source-1747"],observation:{cell:{x:-1,y:-1},situationCode:4,statusCode:4,canAct:null}});
    expect(recovery.metadata.regenerationReturn).toBeUndefined(); // Failed recovery is not a successful return trace.
    expect(report.events.find(e=>e.metadata.sourceId==="source-1747")?.metadata.recoveryControl).toEqual({kind:"standby",phase:5,gamerId:null});
    expect(e.metadata.preRoll?.ordinaryMoveAvailability?.unknownPlayerIds).toEqual(["41","42","44"]);
    expect(e.metadata.preRoll?.endedActivationSourceIds).toEqual(["source-3065","source-3090"]);
    expect(e.contextualBounds?.maximumMoves).toBe(3);expect(e.contextualBounds?.upper).toBeCloseTo(1/2,12);
    expect(report.events.find(e=>e.metadata.sourceId==="source-3065")?.metadata.activationEnd?.completionCheckpointAfter).toBe(3062);
    expect(report.events.find(e=>e.metadata.sourceId==="source-3090")?.metadata.activationEnd?.completionCheckpointAfter).toBe(3087);
    expect(report.coverage.modelVersion).toBe("dice-evidence-2");expect(report.diceRecords.filter(d=>d.parentKind==="event")).toHaveLength(478);expect(report.coverage.diceRecords.snapshotRecordCount).toBe(1264);
    expect(report.events.filter(e=>e.metadata.observedReroll)).toHaveLength(8);
    const direction=report.events.find(e=>e.metadata.sourceId==="source-4802")!;expect(direction.metadata.observedReroll).toMatchObject({used:true,originalDie:6,finalDie:6});expect(direction.scoringStatus).toBe("excluded");expect(direction.probabilitySuccess).toBeNull();
    expect(report.diceRecords.find(d=>d.parentSourceId==="source-4802")?.aliasOf).toBeUndefined();
    expect(e.probabilitySuccess).toBeCloseTo(35/36,12);expect(report.teams.every(t=>t.impactCount===0)).toBe(true);
  },20000);

});
