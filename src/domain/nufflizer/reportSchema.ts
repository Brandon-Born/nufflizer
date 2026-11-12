import { summarizeDiceRecords } from "./diceEvidence";
import { enumerateSkillBlock } from "./blockSkillModel";
import {
  contextComponent,
  summarizeContextComponents,
  type ContextComponentSummary
} from "./contextComponents";
import { directInjuryOutcome } from "./injuryObservation";
import { validReportedBlockCrowd } from "./blockCrowd";
import { bounceDestination } from "@/domain/replay/pickupSuccessors";
import { continuationOptionBounds } from "@/domain/replay/activeMoveContinuation";
import { estimateDodgeImpactBounds, estimateTeamDodgeMoveBounds, estimateTeamRushMoveBounds, estimateKeptRushMoveBounds, estimateKeptDodgeMoveBounds, estimateNumericImpact, estimatePickupPossessionBounds, estimateFreshCatchPossession, estimateKeptCatchPossession } from "./contextImpact";
import { blockOutcomeName, consistentBlockResolution, knockedDownSubjects, summarizeBlockConsequence } from "./blockConsequences";
import { enumerateBlockPool } from "./blockPools";
import { z } from "zod";
import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { CONTEXT_MODEL_VERSION } from "./contextImpact";
import { DICE_MODEL_VERSION, LUCK_CATEGORY_WEIGHTS, REPORT_SCHEMA_VERSION } from "./constants";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { summarizeRollFamilies } from "./rollCoverage";
import { summarizeDamageSteps } from "./damageSteps";
import { summarizeContextEvidence } from "./contextCoverage";
import { observedBounceDirection } from "./ballConsequences";
import { summarizeMovementFall } from "./movementConsequences";

export const LuckEventTypeSchema = z.enum([
  "block",
  "armor_break",
  "injury",
  "dodge",
  "ball_handling",
  "argue_call",
  "movement_risk",
  "unknown"
]);
export const LuckMomentTagSchema = z.enum(["blessed", "shaftaroonie"]);
export const LuckScoringStatusSchema = z.enum(["scored", "excluded"]);
const finite = z.number().finite();
const count = z.number().int().min(0).max(REPLAY_LIMITS.events);
const text = z.string().max(REPLAY_LIMITS.decodedBytes);
const probability = finite.min(0).max(1);
const numbers = z.array(finite).max(REPLAY_LIMITS.xmlNodes);
const pitchCell = z.strictObject({
  x: z.number().int().min(0).max(25),
  y: z.number().int().min(0).max(14)
});
const bounceCell = z.strictObject({x:z.number().int().min(-1).max(26),y:z.number().int().min(-1).max(15)});
const bounceBase={direction:z.number().int().min(1).max(8),destination:bounceCell};
const pickupSuccessors = z.strictObject({declarationSourceId:text,moveOutcomeSourceId:text,origin:pitchCell,actorRosterIndex:z.number().int().min(0).max(1),
  branches:z.array(z.discriminatedUnion("kind",[
    z.strictObject({...bounceBase,kind:z.literal("empty"),marking:z.enum(["marked","unmarked","unknown"]),settlement:z.enum(["loose","reaction_unknown"])}),
    z.strictObject({...bounceBase,kind:z.literal("occupied"),playerId:text,rosterIndex:z.number().int().min(0).max(1)}),
    z.strictObject({...bounceBase,kind:z.literal("out_of_bounds")})
  ])).length(8)
});
const activeMoveContinuation = z.strictObject({
  declarationSourceId:text,movementBefore:z.number().int().min(0).max(16).nullable(),movementAfterSuccess:z.number().int().min(0).max(15).nullable(),
  opponentMarking:z.enum(["unmarked","marked","unknown"]),candidateDestination:pitchCell,minimum:z.union([z.literal(0),z.literal(1)]),maximum:z.union([z.literal(0),z.literal(1)])
});
const dicePath = z
  .array(
    z.union([
      z.string().min(1).max(128),
      z.number().int().nonnegative().max(REPLAY_LIMITS.xmlNodes)
    ])
  )
  .min(1)
  .max(REPLAY_LIMITS.xmlDepth * 2);
const diceLocator = z.strictObject({
  replayStep: z.number().int().positive().optional(),
  childIndex: z.number().int().min(0).max(REPLAY_LIMITS.xmlNodes).optional(),
  stepIndex: z.number().int().min(0).max(REPLAY_LIMITS.xmlNodes).optional(),
  messageIndex: z.number().int().min(0).max(REPLAY_LIMITS.xmlNodes).optional(),
  xmlPath: dicePath.optional()
});
const diceRecord = z.strictObject({
  parentKind: z.enum(["event", "snapshot"]),
  locator: diceLocator.optional(),
  id: text,
  parentOrdinal: count,
  parentSourceId: text.optional(),
  parentSourceIndex: count.optional(),
  parentSourceTag: text,
  parentEventId: text.optional(),
  actionId: text.optional(),
  stepTag: text.optional(),
  stepType: count.optional(),
  stepActorId: text.optional(),
  stepTargetId: text.optional(),
  damageSource: count.optional(),
  status: count.optional(),
  newRoll: count.optional(),
  rollStatus: count.optional(),
  freshDiceIndexes: z
    .array(z.number().int().min(0).max(5).nullable())
    .max(6)
    .optional(),
  path: dicePath,
  rollType: z.number().int().min(0).max(1_000_000).optional(),
  dice: z
    .array(
      z.strictObject({
        value: z.number().int().min(0).max(100).nullable(),
        dieType: z.number().int().min(0).max(1_000_000).nullable()
      })
    )
    .max(6),
  quality: z.enum(["complete", "incomplete", "malformed", "not_applicable"]),
  disposition: z.enum([
    "covered_roll",
    "unscored_roll",
    "summary",
    "unresolved",
    "nonrandom"
  ]),
  eventId: text.optional(),
  aliasOf: text.optional()
});
const observedRerollKind = z.enum(["skill", "star"]),
  observedRule = z.union([z.literal(34), z.literal(47)]);
const playerTraits = z.strictObject({
  dataPlayerId: z.number().int().nonnegative().nullable(),
  playerTypeId: z.number().int().nonnegative().nullable(),
  innateSkills: z.array(z.number().int().nonnegative()).max(64).nullable(),
  acquiredSkills: z.array(z.number().int().nonnegative()).max(64).nullable()
});
const currentTraitEvidence = z.strictObject({playerId:text,teamId:text,rosterIndex:z.number().int().min(0).max(1),observedCheckpointAfter:count,currentCheckpointAfter:count,prayersCheckpointAfter:count,onPitch:z.boolean(),tackleZone:z.boolean().nullable(),statusCode:z.number().int().nonnegative().nullable(),traits:playerTraits});
const blockTraitEvidence = z.strictObject({attacker:currentTraitEvidence,defender:currentTraitEvidence});
const blockSkillModel = z.strictObject({policy:z.literal("single_pool_knockdown_balance"),wrestlePolicy:z.enum(["decline","improve_knockdown_balance"]),traitEvidence:blockTraitEvidence,faceOutcomes:z.array(z.number().int().min(0).max(6)).length(5),outcomeDistribution:z.array(probability).length(7),expectedValue:finite.min(-1).max(1),poolOutcome:z.number().int().min(0).max(6),poolValue:z.union([z.literal(-1),z.literal(0),z.literal(1)]),positiveChance:probability});
const activationEnd = z.strictObject({
  kind: z.enum(["ordinary_move_completed", "bone_head", "really_stupid"]),
  sourceId: text,
  sourceIndex: count,
  declarationSourceId: text,
  actorId: text,
  teamId: text,
  rosterIndex: z.number().int().min(0).max(1),
  teamTurn: z.number().int().positive(),
  periodCode: z.number().int().nonnegative().nullable(),
  actorCell: pitchCell,
  followingPlayerId: text,
  checkpointAfter: count,
  rosterCheckpointAfter: count.optional(),
  completionCheckpointAfter: count.optional(),
  moveSourceId: text.optional(),
  skillSourceId: text.optional(),
  rollSourceId: text.optional(),
  effectSourceId: text.optional(),
  questionSourceId: text.optional(),
  decisionSourceId: text.optional(),
  lonerSourceId: text.optional(),
  lonerSkillSourceId: text.optional(),
  policy: z
    .enum(["fresh_final", "kept_original", "team_loner_replacement", "failed_loner_kept_original"])
    .optional()
});
const rerollCounterObservation=z.strictObject({checkpointAfter:count,replayStep:z.number().int().positive(),childIndex:count,
  teamId:text,teamTurn:z.number().int().positive(),periodCode:z.number().int().min(0).max(2).nullable(),count:z.number().int().min(0).max(16)});
export const LuckEventMetadataSchema = z.strictObject({
  combinedMovement:z.strictObject({stepSourceId:text,policy:z.enum(["fresh_rush_then_dodge","team_rush_then_dodge"]),questionSourceId:text.optional(),decisionSourceId:text.optional(),gamerId:z.union([z.literal(0),z.literal(1)]).optional(),
    rushSourceId:text,dodgeSourceId:text,doMoveSourceId:text,outcomeSourceId:text,originalCheckpointAfter:count,checkpointAfter:count,from:pitchCell,to:pitchCell,
    movementBefore:z.literal(0).nullable(),movementAfter:z.literal(0).nullable(),carriedBallBefore:z.boolean().nullable(),dodgeSucceeded:z.boolean(),
    partialOccupancy:z.array(z.strictObject({playerId:text,cell:z.strictObject({x:z.number().int().min(0).max(25).nullable(),y:z.number().int().min(0).max(14).nullable()})})).max(64),
    zonePenalty:z.strictObject({baseTarget:z.number().int().min(2).max(6),markers:z.array(z.strictObject({playerId:text,cell:pitchCell})).min(1).max(8)}).optional()}).optional(),
  pickupAfterMovement:z.strictObject({movementSourceId:text,originalSourceId:text,skillSourceId:text,declarationSourceId:text,moveOutcomeSourceId:text,
    checkpointAfter:count,cell:pitchCell,movementRemaining:z.number().int().min(0).max(16).nullable(),
    check:z.strictObject({threshold:z.number().int().min(2).max(6),baseTarget:z.number().int().min(2).max(6),markerPlayerIds:z.array(text).max(8)})}).optional(),
  teamRerollMovement:z.strictObject({rollType:z.union([z.literal(1),z.literal(2)]),gamerId:z.union([z.literal(0),z.literal(1)]),questionSourceId:text,decisionSourceId:text,
    declarationSourceId:text,doMoveSourceId:text,outcomeSourceId:text,originalCheckpointAfter:count,checkpointAfter:count,from:pitchCell,to:pitchCell,
    movementBefore:z.number().int().min(0).max(16).nullable(),movementAfter:z.number().int().min(0).max(16).nullable(),carriesBall:z.boolean().nullable(),
    zonePenalty:z.strictObject({baseTarget:z.number().int().min(2).max(6),markers:z.array(z.strictObject({playerId:text,cell:pitchCell})).min(1).max(8)}).optional()}).optional(),
  rerollOffer:z.strictObject({gamerId:z.union([z.literal(0),z.literal(1)]),canUseTeamReroll:z.boolean(),decisionSourceId:text}).optional(),
  teamRerollCounter:z.strictObject({questionSourceId:text,spent:z.union([z.literal(0),z.literal(1)]),before:rerollCounterObservation,after:rerollCounterObservation.optional(),reconciliation:z.enum(["matched","mismatch","after_unavailable"])}).optional(),
  turnEndReason: z.literal(2).optional(),
  pickupTurnEnd:z.strictObject({catchSourceId:text,endSourceId:text,ordinaryMoves:z.strictObject({knownAvailablePlayerIds:z.array(text).max(64),unknownPlayerIds:z.array(text).max(64)}).optional()}).optional(),
  retainedRushContext:z.strictObject({declarationSourceId:text,declarationCheckpointAfter:count,resumeCheckpointAfter:count,
    successRushSourceId:text,doMoveSourceId:text,moveOutcomeSourceId:text,questionSourceId:text,decisionSourceId:text,waitingCheckpointAfter:count,
    from:pitchCell,via:pitchCell,destination:pitchCell}).optional(),
  retainedCatchReaction:z.strictObject({pickupSourceId:text,bounceSourceId:text,questionSourceId:text,decisionSourceId:text,followingBounceSourceId:text,beforeCheckpointAfter:count,waitingCheckpointAfter:count}).optional(),
  bounceCatchReaction:z.strictObject({pickupSourceId:text,bounceSourceId:text,declarationSourceId:text,moveOutcomeSourceId:text,checkpointAfter:count}).optional(),
  pickupResolution:z.strictObject({declarationSourceId:text,moveOutcomeSourceId:text,cell:pitchCell,movementRemaining:z.number().int().min(0).max(16).nullable(),checkpointAfter:count}).optional(),
  dodgeMovement: z.strictObject({declarationSourceId:text,doMoveSourceId:text,outcomeSourceId:text,
    from:pitchCell,to:pitchCell,movementBefore:z.number().int().min(1).max(16).nullable(),
    movementAfter:z.number().int().min(0).max(15).nullable(),carriesBall:z.boolean().nullable(),checkpointAfter:count}).optional(),
  blockSelection:z.strictObject({face:z.number().int().min(0).max(4)}).optional(),
  injuryObservation:z.strictObject({outcome:z.enum(["stunned","ko","casualty"]),recordKind:z.enum(["direct","embedded_ko"]),subjectId:text,subjectTeamId:text,sourceCode:z.number().int().min(0).max(64),damageStepSourceIndex:count}).optional(),
  crowdPush:z.strictObject({playerId:text,from:pitchCell,to:z.strictObject({x:z.number().int().min(-1).max(26),y:z.number().int().min(-1).max(15)}),resolution:z.literal(3)}).optional(),
  crowdRemoval:z.strictObject({reason:z.union([z.literal(0),z.literal(1)]),situation:z.union([z.literal(1),z.literal(2)]),status:z.union([z.literal(0),z.literal(3)])}).optional(),
  blockCrowd:z.strictObject({pushSourceId:text,initialRemovalSourceId:text,finalRemovalSourceId:text,injurySourceId:text,subjectId:text,subjectTeamId:text,
    from:pitchCell,to:z.strictObject({x:z.number().int().min(-1).max(26),y:z.number().int().min(-1).max(15)}),damageActionId:text,beforeCheckpointAfter:count,
    after:z.strictObject({checkpointAfter:count,cell:z.strictObject({x:z.literal(-1),y:z.literal(-1)}),situationCode:z.union([z.literal(1),z.literal(2)]),
      statusCode:z.number().int().nullable(),canAct:z.boolean().nullable(),tackleZone:z.boolean().nullable()})}).optional(),
  blockResolution: z.strictObject({
    outcome:z.enum(["attacker_down","both_down","wrestled_prone","both_stay_up","push","defender_down","defender_pushed_down"]),
    skillSourceIds:z.array(text).max(4),damageActionIds:z.array(text).max(2),
    diceByTeam:z.record(text,finite),unscoredDamageRolls:count
  }).optional(),
  setupPhase: z.strictObject({code:z.literal(3)}).optional(),
  driveEffectExpiry: z.strictObject({playerId:text,teamId:text,providerSkillId:z.union([z.literal(31),z.literal(51)]),phaseSourceId:text,
    beforeCheckpointAfter:count,afterCheckpointAfter:count,afterReplayStep:z.number().int().positive(),afterChildIndex:z.number().int().nonnegative(),
    afterPitchLocation:z.enum(["on_pitch","off_pitch","unknown"]),afterRecordedCanAct:z.boolean().nullable(),afterRecordedTackleZone:z.boolean().nullable()}).optional(),
  teamRerollDecision: z.strictObject({ gamerId: z.union([z.literal(0),z.literal(1)]), used: z.boolean() }).optional(),
  mentalTraitResolution: z.strictObject({ providerSkillId: z.union([z.literal(31), z.literal(51)]), effectEndSourceId: text, skillSourceId: text }).optional(),
  mentalEffectEnd: z.strictObject({ providerSkillId: z.union([z.literal(31),z.literal(51)]), declarationSourceId: text, playerId: text }).optional(),
  activationEnd: activationEnd.optional(),
  recordedEffect: z
    .strictObject({
      effectId: z.literal(44),
      providerId: z.union([z.literal(31), z.literal(51)]),
      providerType: z.literal(4),
      durations: z.tuple([z.literal(6), z.literal(1)])
    })
    .optional(),

  skillUsage: z.strictObject({ skillId: z.number().int().nonnegative(), used: z.boolean() }).optional(),
  activationLoss: z.strictObject({
    rollSourceId: text, rollSourceIndex: count, declarationSourceId: text, skillSourceId: text,
    followingActivationSourceId: text, followingSourceIndex: count, followingPlayerId: text,
    actorId: text, subjectId: text, teamId: text, teamTurn: z.number().int().positive(),
    rosterIndex: z.number().int().min(0).max(1), periodCode: z.number().int().nonnegative().nullable(),
    actorCell: pitchCell, beforeCheckpointAfter: count, afterCheckpointAfter: count
  }).optional(),
  mercenary: z.strictObject({ operation: z.enum(["purchase", "removal_record"]), playerId: text,
    playerTypeId: z.number().int().nonnegative(), gamerId: z.number().int().min(0).max(1) }).optional(),
  ballTravel: z.strictObject({ from: pitchCell, to: pitchCell }).optional(),
  ballCatchCell: pitchCell.optional(),
  pickupBallChain: z.strictObject({
    bounceSourceIds: z.array(text).min(1).max(16),
    catchEventIds: z.array(text).max(16),
    diceByTeam: z.record(text, finite),
    endingCell: pitchCell
  }).optional(),
  initialRosterName: z.string().max(320).optional(),
  embeddedDamageOriginalId: text.optional(),
  originalDice: z.unknown().optional(),
  rerollOriginalId: text.optional(),
  rerollQuestionId: text.optional(),
  rerollDecisionId: text.optional(),
  rerollResource: z.enum(["team", "skill"]).optional(),
  teamRerollsSpent: z.union([z.literal(0), z.literal(1)]).optional(),
  rerollSkill: z.enum(["Catch", "Dodge", "Sure Hands"]).optional(),
  lonerGate: z
    .strictObject({
      passed: z.boolean(),
      threshold: z.union([z.literal(3), z.literal(4)]),
      skillId: z.union([z.literal(44), z.literal(1008)]),
      gamerId: z.union([z.literal(0), z.literal(1)]),
      skillSourceId: text
    })
    .optional(),
  proGate: z.strictObject({
    passed: z.boolean(),
    successChance: z.literal(2 / 3),
    skillSourceId: text
  }).optional(),
  rerollPolicy: text.optional(),
  mergedRerollAnchorId: text.optional(),
  diceEvidenceId: text.optional(),
  repeatedDiceSourceId: text.optional(),
  teamDiceChoice: z
    .strictObject({
      questionSourceId: text,
      used: z.boolean(),
      gamerId: z.union([z.literal(0), z.literal(1)])
    })
    .optional(),
  teamDiceIdentity: z
    .strictObject({
      questionSourceId: text,
      decisionSourceId: text,
      originalRecordId: text,
      teamUsed: z.boolean(),
      replacementRolled: z.boolean(),
      originalDie: z.number().int().min(1).max(6),
      finalDie: z.number().int().min(1).max(6),
      gateSourceId: text.optional(),
      gatePassed: z.boolean().optional(),
      gateSkillId: z
        .union([z.literal(44), z.literal(1008), z.literal(50)])
        .optional()
    })
    .optional(),
  observedRerollOffer: z
    .strictObject({
      kind: observedRerollKind,
      ruleId: observedRule,
      gamerId: z.union([z.literal(0), z.literal(1)]),
      originalRecordId: text
    })
    .optional(),
  observedRerollChoice: z
    .strictObject({
      kind: observedRerollKind,
      ruleId: observedRule,
      used: z.boolean(),
      questionSourceId: text
    })
    .optional(),
  observedReroll: z
    .strictObject({
      kind: observedRerollKind,
      ruleId: observedRule,
      used: z.boolean(),
      questionSourceId: text,
      decisionSourceId: text,
      ownershipCheckpointAfter: count,
      originalRecordId: text,
      originalDie: z.number().int().min(1).max(6),
      finalDie: z.number().int().min(1).max(6)
    })
    .optional(),
  sourceTag: text,
  sourceId: text.optional(),
  actionId: text.optional(),
  sequenceId: text.optional(),
  sourceIndex: count.optional(),
  locator: z
    .strictObject({
      replayStep: z.number().int().positive().optional(),
      childIndex: z.number().int().min(0).optional(),
      stepIndex: z.number().int().min(0).optional(),
      messageIndex: z.number().int().min(0).optional(),
      xmlPath: dicePath.optional()
    })
    .optional(),
  preRoll: z
    .strictObject({
      checkpointAfter: count,
      activeMoveContinuation:activeMoveContinuation.optional(),
      actorDodgeMoveSourceId:text.optional(),
      pickupSuccessors:pickupSuccessors.optional(),
      pickupSettlementKnown:z.boolean().optional(),
      ordinaryMoveAvailability:z.strictObject({successDestination:pitchCell,knownAvailablePlayerIds:z.array(text).max(64),unknownPlayerIds:z.array(text).max(64)}).optional(),
      suppressedTackleZones: z.array(z.strictObject({ playerId: text, rosterIndex: z.number().int().min(0).max(1), teamId: text.nullable(), providerSkillId: z.union([z.literal(31),z.literal(51)]) })).max(128).optional(),
      actorMentalEffectEnd: z.strictObject({ sourceId: text, providerSkillId: z.union([z.literal(31),z.literal(51)]) }).optional(),
      endedActivationSourceIds: z.array(text).max(64).optional(),
      actorTackleZone: z.boolean().nullable().optional(),
      actorRosterTeamId: text.optional(),
      actorTraits: playerTraits.optional(),
      targetTraits: playerTraits.optional(),
      checkpointReplayStep: z.number().int().positive().optional(),
      phaseCode: z.number().int().nonnegative().nullable(),
      period: z.enum(["first_half", "second_half", "extra_time"]).nullable(),
      activeTeamId: text.nullable(),
      teamTurn: z.number().int().positive().nullable(),
      turnsRemaining: count.nullable(),
      activationId: text.nullable(),
      actorCell: pitchCell.nullable(),
      actorStandUpSourceIndex: count.optional(),
      actorMovementRemaining: count.optional(),
      actorPickupSourceId: text.optional(),
      scoringAttempt: z.strictObject({
        destination: pitchCell,
        sideCode: z.union([z.literal(32), z.literal(64)]),
        teamTurn: z.number().int().positive().nullable(),
        turnsRemaining: count.nullable(),
        turnsPerPeriod: z.number().int().min(1).max(16).nullable()
      }).optional(),
      teammateCarrierMove: z.strictObject({
        carrierCell: pitchCell,
        destination: pitchCell,
        effect: z.enum(["approach", "leave"])
      }).optional(),
      actorCarriesBall: z.boolean().nullable(),
      carriedBallCell:pitchCell.optional(),
      movementCheckLinked: z.boolean(),
      otherUsefulActivations: z.number().int().min(0).max(64).nullable(),
      pickupBounceExposure: probability.nullable()
    })
    .optional(),
  block: z
    .strictObject({
      pool: z.strictObject({
        faces: z.array(z.number().int().min(0).max(4)).min(1).max(3),
        rolledIndexes: z.array(z.number().int().min(0).max(2)).min(1).max(3),
        outcomes: z.array(z.number().int().min(0).max(6)).min(1).max(3),
        attackerChooses: z.boolean(),
        sourceId: text.optional(),
        proEligibleIndexes: z
          .array(z.number().int().min(0).max(2))
          .max(3)
          .optional()
      }),
      attackerId: text,
      defenderId: text,
      defenderTeamId: text,
      chooserTeamId: text,
      chooserGamerId: z.number().int().min(0).max(1).optional(),
      selectedFace: z.number().int().min(0).max(4).optional(),
      selectedOutcome: z.number().int().min(0).max(6).optional(),
      selectedSourceId: text.optional(),
      finalOutcome: z.number().int().min(0).max(6).optional(),
      finalSourceId: text.optional(),
      reroll: z.enum(["initial", "team", "brawler", "pro", "loner"]),
      proGateSourceId: text.optional(),
      lonerGateSourceId: text.optional(),
      previousPoolSourceId: text.optional(),
      distribution: z.array(probability).length(5),
      traitEvidence: blockTraitEvidence.optional(),
      skillModel: blockSkillModel.optional(),
      rankedSymbol: z.number().int().min(0).max(4)
    })
    .optional(),
  damage: z
    .strictObject({
      subjectId: text,
      subjectTeamId: text,
      sourceCode: finite.optional(),
      observedInjury:z.literal(true).optional(),
      crowd:z.strictObject({poolSourceId:text}).optional(),
      chainActionId: text.optional(),
      koRecovery: z
        .strictObject({ target: z.union([z.literal(3), z.literal(4)]) })
        .optional(),
      regeneration: z
        .strictObject({
          casualtySourceId: text,
          initialRemovalSourceId: text,
          skillUseSourceId: text
        })
        .optional(),
      perspective: z.literal("subject_team")
    })
    .optional(),
  movementFall: z.strictObject({
    combinedRushSourceId:text.optional(),
    damageActionId: text,
    moveOutcomeSourceIndex: count,
    turnoverSourceIndex: count,
    turnoverChildIndex: count,
    diceContribution: finite,
    unscoredDamageRolls: count,
    armorHeld: z.boolean().nullable(),
    playerRemoved: z.boolean()
  }).optional(),
  movementTouchdown: z.strictObject({
    sourceIndex: count,
    childIndex: count,
    destination: pitchCell,
    recordedCell: z.strictObject({
      x: z.number().int().min(0).max(25).nullable(),
      y: z.number().int().min(0).max(14).nullable()
    })
  }).optional(),
  apothecary: z
    .strictObject({
      originalSourceId: text,
      replacementSourceId: text.optional(),
      gamerId: z.number().int().min(0).max(1),
      resourceSpent: z.union([z.literal(0), z.literal(1)]),
      appliedCasualty: z.number().int().min(0).max(10),
      playerStatus: z.number().int().min(0).max(10),
      applied: z.enum(["original", "replacement", "injury_treatment"])
    })
    .optional(),
  isRollCandidate: z.boolean().optional(),
  mergedBlockAnchorId: text.optional(),
  rollType: finite.optional(),
  rollLabel: text.optional(),
  stepType: finite.optional(),
  stepLabel: text.optional(),
  targetId: text.optional(),
  actionCode: finite.optional(),
  actionLabel: text.optional(),
  outcomeCode: finite.optional(),
  requirement: finite.optional(),
  difficulty: finite.optional(),
  dice: numbers.optional(),
  dieTypes: numbers.optional(),
  modifiers: numbers.optional(),
  modifiersSum: finite.optional(),
  probabilityPolicy: z.enum(["single_attempt", "two_attempt", "block_pool"]).optional(),
  rerollUsed: z.boolean().optional(),
  skillsUsed: numbers.optional(),
  normalizationFlags: z.array(text).max(REPLAY_LIMITS.events).optional(),
  normalizationNotes: z.array(text).max(REPLAY_LIMITS.events).optional()
});
export const LuckEventSchema = z.strictObject({
  id: text.min(1),
  turn: z.number().int().min(1),
  teamId: text.min(1),
  teamName: text,
  playerId: text.optional(),
  type: LuckEventTypeSchema,
  probabilitySuccess: probability.nullable(),
  actualSuccess: z.boolean().nullable(),
  delta: finite,
  weightedDelta: finite,
  catchPossessionBounds:z.discriminatedUnion("policy", [
    z.strictObject({policy:z.literal("fresh_catch_failure_envelope"),successChance:probability,minimumDifference:z.literal(0),maximumDifference:z.literal(2),lower:z.literal(0),upper:finite}),
    z.strictObject({policy:z.literal("kept_catch_failure_envelope"),successChance:probability,minimumDifference:z.literal(0),maximumDifference:z.literal(2),lower:finite,upper:z.literal(0)})
  ]).optional(),
  possessionBounds:z.strictObject({policy:z.literal("sure_hands_reroll"),successChance:probability,minimumDifference:finite.min(0).max(3),maximumDifference:finite.min(0).max(3),lower:finite,upper:finite}).optional(),
  contextualBounds:z.strictObject({policy:z.enum(["dodge_skill_reroll","team_reroll_terminal_moves","team_reroll_rush_moves","kept_rush_terminal_moves","kept_dodge_terminal_moves"]),terminalCheckpointAfter:count.optional(),minimumMoves:count,maximumMoves:count,successChance:probability,activeContinuation:z.strictObject({minimum:z.union([z.literal(0),z.literal(1)]),maximum:z.union([z.literal(0),z.literal(1)])}).optional(),lower:finite,upper:finite}).optional(),
  contextualImpact: z
    .strictObject({
      policy: z.enum(["declined_team_reroll", "full_team_reroll", "dodge_skill_reroll"]),
      components: z.strictObject({
        availableMoves: finite.min(0),
        activeContinuation:z.union([z.literal(0),z.literal(1)]).optional(),
        possession: finite.min(0),
        markedBounce: probability
      }),
      difference: finite.min(0),
      deviation:finite,
      contribution: finite
    })
    .optional(),
  label: text,
  tags: z.array(LuckMomentTagSchema).max(2),
  scoringStatus: LuckScoringStatusSchema,
  statusReason: text,
  explainability: z.strictObject({
    target: text,
    baseOdds: probability.optional(),
    rerollAdjustedOdds: probability.optional(),
    weight: finite.min(0),
    formulaSummary: text.optional(),
    inputsSummary: text
  }),
  metadata: LuckEventMetadataSchema
});
export const LuckTeamAggregateSchema = z.strictObject({
  teamId: text.min(1),
  teamName: text,
  luckScore: finite,
  categoryScores: z.strictObject({
    block: finite,
    armorBreak: finite,
    injury: finite,
    dodge: finite,
    ballHandling: finite,
    argueCall: finite,
    movementRisk: finite
  }),
  eventCount: count,
  impactCount: count,
  impactScore: finite,
  impactByType: z.strictObject({ dodge: finite, ball_handling: finite })
});
const componentBucket = {
  componentCount: count,
  pointCount: count,
  boundedCount: count,
  bounds: z.strictObject({ lower: finite, upper: finite }).nullable()
};
const contextComponentSummary = z.strictObject({
  ...componentBucket,
  teamId: text,
  byCategory: z
    .array(
      z.strictObject({
        ...componentBucket,
        type: LuckEventTypeSchema,
        eventIds: z.array(text).min(1).max(REPLAY_LIMITS.events)
      })
    )
    .max(8),
  byAction: z
    .array(
      z.strictObject({
        ...componentBucket,
        actionId: text.nullable(),
        eventIds: z.array(text).min(1).max(REPLAY_LIMITS.events)
      })
    )
    .max(REPLAY_LIMITS.events)
});
// This model can only abstain. Supporting comparative verdicts requires a new, validated model version.
export const LuckVerdictSchema = z.strictObject({
  luckierTeam: z.literal("unknown"),
  status: z.enum(["insufficient_evidence", "partial_analysis"]),
  scoreGap: finite.min(0),
  summary: text
});
const coverageBucket = z.strictObject({
  scoredCount: count,
  excludedCount: count,
  scoredRate: probability
});
const categoryCounts = z.record(LuckEventTypeSchema, count);
const categoryKey = {
  block: "block",
  armor_break: "armorBreak",
  injury: "injury",
  dodge: "dodge",
  ball_handling: "ballHandling",
  argue_call: "argueCall",
  movement_risk: "movementRisk"
} as const;
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
}

export const LuckReportSchema = z
  .strictObject({
    schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
    modelVersion: z.literal(DICE_MODEL_VERSION),
    contextModelVersion: z.literal(CONTEXT_MODEL_VERSION),
    limitations: z.array(text).min(1).max(REPLAY_LIMITS.events),
    id: text.min(1),
    generatedAt: z.iso.datetime(),
    match: z.strictObject({ id: text, homeTeam: text, awayTeam: text }),
    verdict: LuckVerdictSchema,
    diceRecords: z.array(diceRecord).max(REPLAY_LIMITS.events),
    coverage: z.strictObject({
      modelVersion: z.literal("dice-evidence-2"),
      diceRecords: z.strictObject({
        recordCount: count,
        eventRecordCount: count,
        snapshotRecordCount: count,
        coveredCount: count,
        unscoredCount: count,
        summaryCount: count,
        nonrandomCount: count,
        unresolvedCount: count,
        malformedCount: count,
        scoredRate: probability
      }),
      sourceRecordCount: count,
      diceParentCount: count,
      denominatorDescription: text.min(1),
      allEvents: coverageBucket,
      rollCandidates: coverageBucket,
      rollFamilies: z
        .array(
          z.strictObject({
            teamId: text,
            sourceTag: text,
            rollType: finite.optional(),
            scoredCount: count,
            unscoredCount: count,
            unattributedCount: count,
            malformedCount: count,
            unresolvedIdentityCount: count
          })
        )
        .max(REPLAY_LIMITS.events),
      contextEvidence: z.strictObject({
        rollCount: count,
        positionCount: count,
        possessionCount: count,
        clockCount: count,
        activationCount: count,
        quantifiedCount: count,
        boundedCount: count,
        consequenceCount: count
      }),
      scoredByType: categoryCounts,
      excludedByType: categoryCounts,
      excludedByReason: z.record(text, count)
    }),
    weightTable: z.record(LuckEventTypeSchema, finite.min(0)),
    recruitments: z.array(z.strictObject({
      sourceId: text, sourceIndex: count, playerId: text, playerTypeId: z.number().int().nonnegative(),
      gamerId: z.number().int().min(0).max(1), candidateTeamId: z.number().int().nonnegative().nullable(),
      rosterTeamId: text.nullable(), checkpointAfter: count.nullable(),
      checkpointReplayStep: z.number().int().positive().nullable(), checkpointChildIndex: z.number().int().nonnegative().nullable(),
      innateSkills: z.array(z.number().int().nonnegative()).max(64).nullable(), acquiredSkills: z.array(z.number().int().nonnegative()).max(64).nullable(),
      previousPurchaseSourceId: text.optional(), removalSourceId: text.optional()
    })).max(REPLAY_LIMITS.events),
    damageSteps: z
      .array(
        z.strictObject({
          actionId: text,
          teamId: text,
          playerId: text,
          eventIds: z.array(text).min(1).max(REPLAY_LIMITS.events),
          scoredRolls: count,
          unscoredRolls: count,
          contextRecords: count,
          diceContribution: finite
        })
      )
      .max(REPLAY_LIMITS.events),
    howScoredSummary: z.array(text).max(REPLAY_LIMITS.events),
    teams: z.tuple([LuckTeamAggregateSchema, LuckTeamAggregateSchema]),
    contextComponents:z.tuple([contextComponentSummary,contextComponentSummary]),
    keyMoments: z.array(LuckEventSchema).max(REPLAY_LIMITS.events),
    events: z.array(LuckEventSchema).max(REPLAY_LIMITS.events)
  })
  .superRefine((report, ctx) => {
    function require(condition: boolean, message: string) {
      if (!condition) ctx.addIssue({ code: "custom", message });
    }
    require(report.verdict.summary ===
      VERDICT_SUMMARIES[
        report.verdict.status
      ], "Headline must state the declared model limitations.");
    const ids = new Map(report.events.map((event) => [event.id, event]));
    const sources = new Map(
      report.events.flatMap((event) =>
        event.metadata.sourceId
          ? [[event.metadata.sourceId, event] as const]
          : []
      )
    );
    require(ids.size === report.events.length, "Event IDs must be unique.");
    const pickupTurnEndSources = new Set(report.events.flatMap((e) => e.metadata.pickupTurnEnd ? [e.metadata.pickupTurnEnd.endSourceId] : []));
    const counterQuestions = new Set(report.events.flatMap((e) => e.metadata.teamRerollCounter ? [e.metadata.teamRerollCounter.questionSourceId] : []));
    require(counterQuestions.size === report.events.filter((e) => e.metadata.teamRerollCounter).length,"Each counter offer can fund at most one recorded decision.");
    const teamIds = new Set(report.teams.map((team) => team.teamId));
    require(teamIds.size === 2, "Report requires two distinct teams.");
    require(new Set(report.recruitments.map(r => r.sourceId)).size === report.recruitments.length,
      "Each recorded purchase must appear once.");
    require(report.events.filter(event => event.metadata.mercenary?.operation === "purchase" &&
      event.metadata.sourceId && event.metadata.sourceIndex !== undefined).length === report.recruitments.length,
      "Every locatable purchase record must appear in recruitment evidence.");
    for (const purchase of report.recruitments) {
      const source = sources.get(purchase.sourceId);
      const selection = source?.metadata.mercenary;
      require(source?.metadata.sourceTag === "EventBuyMercenary" &&
        source.metadata.sourceIndex === purchase.sourceIndex && !source.metadata.isRollCandidate &&
        selection?.operation === "purchase" && selection.playerId === purchase.playerId &&
        selection.playerTypeId === purchase.playerTypeId && selection.gamerId === purchase.gamerId,
        "Recruitment evidence must match its recorded purchase source.");
      require((purchase.rosterTeamId === null) === (purchase.checkpointAfter === null) &&
        (purchase.rosterTeamId === null || (teamIds.has(purchase.rosterTeamId) &&
          String(purchase.candidateTeamId) === purchase.rosterTeamId &&
          purchase.checkpointAfter! >= purchase.sourceIndex)),
        "A purchase-to-roster binding requires a following observed membership on the candidate team.");
      for (const list of [purchase.innateSkills, purchase.acquiredSkills])
        if (list) require(new Set(list).size === list.length, "Selected trait lists cannot repeat codes.");
      const previous = purchase.previousPurchaseSourceId ? sources.get(purchase.previousPurchaseSourceId) : undefined;
      if (purchase.previousPurchaseSourceId)
        require(previous?.metadata.mercenary?.operation === "purchase" &&
          previous.metadata.mercenary.playerId === purchase.playerId &&
          previous.metadata.sourceIndex !== undefined && previous.metadata.sourceIndex < purchase.sourceIndex,
          "A reused instance ID must reference its earlier purchase.");
      if (purchase.removalSourceId) {
        const removal = sources.get(purchase.removalSourceId);
        require(removal?.metadata.sourceTag === "EventRemoveMercenary" && removal.playerId === purchase.playerId &&
          removal.metadata.sourceIndex !== undefined && removal.metadata.sourceIndex < purchase.sourceIndex &&
          (!previous || removal.metadata.sourceIndex > (previous.metadata.sourceIndex ?? Infinity)),
          "The recorded removal must belong to this instance between its purchases.");
      }
    }
    require(report.match.homeTeam === report.teams[0].teamName &&
      report.match.awayTeam ===
        report.teams[1].teamName, "Match and team labels must agree.");
    const scored = report.events.filter(
      (event) => event.scoringStatus === "scored"
    );
    const excluded = report.events.filter(
      (event) => event.scoringStatus === "excluded"
    );
    const candidates = report.events.filter(
      (event) => event.metadata.isRollCandidate
    );
    const damageSteps = summarizeDamageSteps(report.events);
    require(JSON.stringify(report.damageSteps) ===
      JSON.stringify(
        damageSteps
      ), "Damage-step totals must reconcile with their original evidence.");
    const damageByAction = new Map(damageSteps.map((step) => [step.actionId, step]));
    const linkedBlockFinals = new Set<string>();
    const linkedDamageActions = new Set<string>();
    const linkedBallCatches = new Set<string>();
    const families = summarizeRollFamilies(candidates, report.diceRecords);
    const expectedComponents = summarizeContextComponents(
      report.events,
      report.teams.map((t) => t.teamId)
    );
    const sameBucket = (
      a:
        | ContextComponentSummary
        | ContextComponentSummary["byAction"][number]
        | ContextComponentSummary["byCategory"][number],
      b: typeof a
    ) =>
      a.componentCount === b.componentCount &&
      a.pointCount === b.pointCount &&
      a.boundedCount === b.boundedCount &&
      (a.bounds === null
        ? b.bounds === null
        : b.bounds !== null &&
          a.bounds.lower <= a.bounds.upper &&
          near(a.bounds.lower, b.bounds.lower) &&
          near(a.bounds.upper, b.bounds.upper));
    const sameMembers = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i]);
    require(report.contextComponents.every((team, i) => {
      const expected = expectedComponents[i]!;
      return (
        !!expected &&
        team.teamId === expected.teamId &&
        sameBucket(team, expected) &&
        team.byCategory.length === expected.byCategory.length &&
        team.byCategory.every((category, j) => {
          const group = expected.byCategory[j]!;
          return (
            category.type === group.type &&
            sameBucket(category, group) &&
            sameMembers(category.eventIds, group.eventIds)
          );
        }) &&
        team.byAction.length === expected.byAction.length &&
        team.byAction.every((action, j) => {
          const group = expected.byAction[j]!;
          return (
            action.actionId === group.actionId &&
            sameBucket(action, group) &&
            sameMembers(action.eventIds, group.eventIds)
          );
        })
      );
    }), "Partial context component sums and category/action membership must reconcile with unique admitted event components; absent evidence is null, never zero.");
    const componentSources = new Set<string>();
    for (const event of report.events) {
      const componentFields = [
        event.contextualImpact,
        event.contextualBounds,
        event.possessionBounds,
        event.catchPossessionBounds
      ].filter((x) => x !== undefined);
      if (componentFields.length)
        require(componentFields.length === 1 &&
          contextComponent(event) !== undefined &&
          report.teams.some(
            (t) => t.teamId === event.teamId
          ), "An additive context component needs one finite interval or point on one owned scored random record; overlapping or excluded components cannot enter sums.");
      if (componentFields.length && event.metadata.sourceId !== undefined) {
        require(!componentSources.has(
          event.metadata.sourceId
        ), "One random source cannot fund duplicate context components.");
        componentSources.add(event.metadata.sourceId);
      }
    }
    const contextEvidence = summarizeContextEvidence(report.events);
    require(Object.keys(contextEvidence).every(
      (key) =>
        contextEvidence[key as keyof typeof contextEvidence] ===
        report.coverage.contextEvidence[key as keyof typeof contextEvidence]
    ), "Context evidence counts must reconcile with the unique reported roll candidates.");
    require(families.length === report.coverage.rollFamilies.length &&
      families.every((expected, index) => {
        const row = report.coverage.rollFamilies[index];
        return (
          row?.teamId === expected.teamId &&
          row.sourceTag === expected.sourceTag &&
          row.rollType === expected.rollType &&
          row.scoredCount === expected.scoredCount &&
          row.unscoredCount === expected.unscoredCount &&
          row.unattributedCount === expected.unattributedCount &&
          row.malformedCount === expected.malformedCount &&
          row.unresolvedIdentityCount === expected.unresolvedIdentityCount
        );
      }), "Roll-family coverage must match the reported candidate evidence.");
    const rawDiceById = new Map(report.diceRecords.map((r) => [r.id, r]));
    const parentKeys= new Set(
      report.events.map(
        (e) => {
          const r = rawDiceById.get
            (e.metadata.diceEvidenceId ?? "");
        return r ? (r.parentEventId ?? `raw-${r.parentOrdinal}`) : e.id;
      })
    );
    require(report.coverage.diceParentCount >=
      parentKeys.size, "Expanded outcome rows must reconcile with their original source parents.");
    require(JSON.stringify(report.coverage.diceRecords) ===
      JSON.stringify(
        summarizeDiceRecords(report.diceRecords)
      ), "Raw dice record counts and coverage must reconcile independently of policy-event counts.");
    const resolvedAliases = new Set<string>();
    let aliasesAcyclic = true;
    for (const r of report.diceRecords) {
      if (resolvedAliases.has(r.id)) continue;
      const path = new Set<string>();
      let next: typeof r | undefined = r;
      while (next && !resolvedAliases.has(next.id) && !path.has(next.id)) {
        path.add(next.id);
        next = next.aliasOf ? rawDiceById.get(next.aliasOf) : undefined;
      }
      if (next && path.has(next.id)) aliasesAcyclic = false;
      for (const id of path) resolvedAliases.add(id);
    }
    require(aliasesAcyclic, "Dice summary aliases cannot form cycles.");
    const rootDiceBySource = new Map(
      report.diceRecords
        .filter((r) => r.path.length === 1 && r.path[0] === "Dice")
        .map((r) => [r.parentSourceId, r])
    );
    require(report.coverage.diceParentCount ===
      report.coverage.sourceRecordCount +
        new Set(
          report.diceRecords
            .filter((r) => r.parentKind === "snapshot")
            .map((r) => r.parentSourceId)
        )
          .size, "Dice parent counts must reconcile original events and separately retained snapshots.");
    const rawPaths = new Set<string>();
    const lastSnapshotDice = new Map<
      string,
      (typeof report.diceRecords)[number]
    >();
    const namedEmissions=report.events.filter(e=>["EventWeatherRoll","EventKickOffTable"].includes(e.metadata.sourceTag)&&e.metadata.sourceIndex!==undefined).sort((a,b)=>a.metadata.sourceIndex!-b.metadata.sourceIndex!);
    const latestNamedIndex=new Map<string,number>();let emissionCursor=0;
    for (const [index, r] of report.diceRecords.entries()) {
      while(emissionCursor<namedEmissions.length&&namedEmissions[emissionCursor]!.metadata.sourceIndex!<=(r.parentSourceIndex??-1)) {
        const e=namedEmissions[emissionCursor++]!;latestNamedIndex.set(e.metadata.sourceTag==="EventWeatherRoll"?"LastWeatherRoll":"LastKickOffEventRoll",e.metadata.sourceIndex!);
      }
      const pathKey = JSON.stringify([r.parentOrdinal, r.path]);
      require(r.id === `dice-${index}` &&
        !rawPaths.has(
          pathKey
        ), "Dice evidence identities and parent/path membership must be unique and source ordered.");
      rawPaths.add(pathKey);
      require(r.parentOrdinal < report.coverage.diceParentCount &&
        (!index ||
          r.parentOrdinal >=
            report.diceRecords[index - 1]!
              .parentOrdinal), "Dice field parents must stay in source order within the raw event bound.");
      const invalid =
        !r.dice.length ||
        r.dice.some(
          (d) =>
            d.value === null ||
            (d.dieType === 0 && (d.value < 1 || d.value > 6)) ||
            (d.dieType === 2 && d.value > 4)
        ) ||
        r.freshDiceIndexes?.some((v) => v === null);
      require(r.quality === "not_applicable"
        ? r.disposition === "nonrandom"
        : r.quality === "malformed"
          ? !["summary", "covered_roll"].includes(r.disposition)
          : !invalid &&
            (r.quality !== "complete" ||
              r.dice.every(
                (d) => d.dieType !== null
              )), "Dice quality cannot conceal invalid faces, missing types or a nonrandom sentinel.");
      const parent = r.parentEventId ? ids.get(r.parentEventId) : undefined;
      if (
        r.parentKind === "event" &&
        r.path.length === 1 &&
        r.path[0] === "Dice" &&
        ["EventWeatherRoll", "EventKickOffTable"].includes(r.parentSourceTag)
      )
        lastSnapshotDice.set(
          r.parentSourceTag === "EventWeatherRoll"
            ? "LastWeatherRoll"
            : "LastKickOffEventRoll",
          r
        );
      if (r.parentKind === "snapshot")
        require(["BoardState", "InitialBoardState"].includes(
          r.parentSourceTag
        ) &&
          /^snapshot-(?:end-)?\d+$/.test(r.parentSourceId ?? "") &&
          !r.parentEventId &&
          !r.actionId &&
          r.parentSourceIndex !== undefined &&
          r.parentSourceIndex <= report.coverage.sourceRecordCount &&
          ["summary", "unresolved"].includes(
            r.disposition
          ), "Snapshot dice retain separate source parents and cannot assert fresh scored outcomes.");
      if (r.parentEventId)
        require(!!parent &&
          !parent.metadata.diceEvidenceId &&
          parent.metadata.sourceTag === r.parentSourceTag &&
          parent.metadata.sourceId === r.parentSourceId &&
          parent.metadata.sourceIndex ===
            r.parentSourceIndex, "Dice evidence parent receipts must match their source identity and locator.");
      if (r.disposition === "nonrandom") {
        require(r.quality === "not_applicable" &&
          r.parentSourceTag === "QuestionPushBack" &&
          r.rollType === 0 &&
          JSON.stringify(r.path) === JSON.stringify(["BlockRoll", "Die"]) &&
          r.dice.length === 1 &&
          r.dice[0]!.value === 0 &&
          r.dice[0]!.dieType === 0 &&
          !r.eventId &&
          !r.aliasOf, "No-roll placeholders require their exact namespace and zero sentinel; they are not random outcomes.");
      } else if (r.disposition === "summary") {
        const target = r.aliasOf ? rawDiceById.get(r.aliasOf) : undefined;
        require(!!target &&
          target.parentOrdinal < r.parentOrdinal &&
          !r.eventId, "A repeated dice record needs an earlier source-linked alias without another scored event.");
        if (target) {
          const equal = JSON.stringify(r.dice) === JSON.stringify(target.dice);
          const block =
            r.rollType === 3 &&
            target.rollType === 3 &&
            r.stepTag === "PlayerStep" &&
            target.stepTag === "PlayerStep" &&
            r.stepType === 6 &&
            target.stepType === 6 &&
            r.stepActorId === target.stepActorId &&
            r.stepTargetId === target.stepTargetId &&
            [
              "ResultBlockRoll",
              "QuestionBlockSkillUsage",
              "QuestionPushBack",
              "QuestionBlockDice"
            ].includes(r.parentSourceTag) &&
            ["QuestionBlockDice", "ResultBlockRoll"].includes(
              target.parentSourceTag
            ) &&
            r.dice.every((d) =>
              target.dice.some(
                (v) => v.value === d.value && v.dieType === d.dieType
              )
            );
          const sameSubjects =
            r.stepTag === target.stepTag &&
            r.stepType === target.stepType &&
            r.stepActorId === target.stepActorId &&
            r.stepTargetId === target.stepTargetId;
          const parentFinal = r.parentEventId
            ? ids.get(r.parentEventId)
            : undefined;
          const linkedQuestion =
            parentFinal?.metadata.rerollQuestionId ??
            parentFinal?.metadata.observedReroll?.questionSourceId ??
            parentFinal?.metadata.teamDiceIdentity?.questionSourceId;
          const copiedKept =
            r.parentSourceTag === "ResultRoll" &&
            [
              "QuestionTeamRerollUsage",
              "QuestionStarSpecialRuleUsage",
              "QuestionSkillUsage"
            ].includes(target.parentSourceTag) &&
            linkedQuestion === target.parentSourceId &&
            sameSubjects &&
            r.rollType === target.rollType &&
            equal &&
            !parentFinal?.metadata.observedReroll?.used &&
            !parentFinal?.metadata.teamDiceIdentity?.replacementRolled &&
            r.newRoll === 0;
          const repeatedTerminal =
            r.parentSourceTag === "ResultRoll" &&
            target.parentSourceTag === "ResultRoll" &&
            (parentFinal?.metadata.repeatedDiceSourceId ?? parentFinal?.metadata.mergedRerollAnchorId) ===
              target.parentSourceId &&
            sameSubjects &&
            r.actionId === target.actionId &&
            equal;
          const copiedOriginal =
            [
              "QuestionTeamRerollUsage",
              "QuestionKORecovery",
              "QuestionApothecaryCasualtyUsage"
            ].includes(r.parentSourceTag) &&
            ["ResultRoll", "ResultInjuryRoll", "ResultCasualtyRoll"].includes(
              target.parentSourceTag
            ) &&
            sameSubjects &&
            r.rollType === target.rollType &&
            equal;
          const copiedTreatment =
            r.parentSourceTag === "QuestionApothecaryCasualtyChoice" &&
            target.parentSourceTag === "QuestionApothecaryCasualtyUsage" &&
            sameSubjects &&
            r.damageSource === target.damageSource &&
            r.rollType === target.rollType &&
            equal;
          const copiedSnapshot =
            r.parentKind === "snapshot" &&
            target.parentKind === "event" &&
            r.path.length === 2 &&
            r.path[1] === "Die" &&
            lastSnapshotDice.get(String(r.path[0]))?.id === target.id &&
            latestNamedIndex.get(String(r.path[0]))===target.parentSourceIndex &&
            equal;
          require(r.quality !== "malformed" &&
            target.quality !== "malformed" &&
            (block ||
              copiedKept ||
              repeatedTerminal ||
              copiedOriginal ||
              copiedTreatment ||
              copiedSnapshot), "Dice copies need a compatible source namespace, participants and an explicit pool/choice relationship; equal faces alone do not identify a summary.");
        }
      } else {
        const e = r.eventId ? ids.get(r.eventId) : undefined;
        require(!!e &&
          !r.aliasOf &&
          (r.disposition === "covered_roll"
            ? e.scoringStatus === "scored" && r.quality !== "malformed"
            : e.scoringStatus ===
              "excluded"), "Every non-summary dice group must point to its supported or explicitly unscored evidence.");
        if (e && r.disposition === "covered_roll")
          require(e.id === r.parentEventId ||
            (r.parentSourceId !== undefined &&
              [
                e.metadata.rerollQuestionId,
                e.metadata.rerollOriginalId
              ].includes(
                r.parentSourceId
              )), "A covered dice group must belong to its scored event or its explicitly linked policy original.");
      }
    }
    const fieldSources = new Set(
      report.diceRecords.map((r) => r.parentSourceId)
    );
    const teamChoiceLinks = new Set(
      report.events.flatMap((e) =>
        e.metadata.teamDiceIdentity
          ? [e.metadata.teamDiceIdentity.decisionSourceId]
          : []
      )
    );
    const offerLinks = new Map(
      report.events
        .filter((e) => e.metadata.observedReroll)
        .map((e) => [e.metadata.observedReroll!.questionSourceId, e])
    );
    const choiceLinks = new Map(
      report.events
        .filter((e) => e.metadata.observedReroll)
        .map((e) => [e.metadata.observedReroll!.decisionSourceId, e])
    );
    for (const e of report.events) {
      if (e.metadata.dice?.length && !e.metadata.diceEvidenceId)
        require(fieldSources.has(
          e.metadata.sourceId
        ), "Reported dice cannot lose their raw field membership.");
      if (e.metadata.teamDiceChoice)
        require(teamChoiceLinks.has(
          e.metadata.sourceId ?? ""
        ), "A team dice choice cannot be orphaned from its terminal identity proof.");
      if (e.metadata.observedRerollOffer)
        require(offerLinks.has(
          e.metadata.sourceId ?? ""
        ), "An observed reroll offer cannot be orphaned from its terminal proof.");
      if (e.metadata.observedRerollChoice)
        require(choiceLinks.has(
          e.metadata.sourceId ?? ""
        ), "An observed reroll decision cannot be orphaned from its terminal proof.");
      if (e.metadata.repeatedDiceSourceId) {
        const original = sources.get(e.metadata.repeatedDiceSourceId);
        require(!!original &&
          e.scoringStatus === "excluded" &&
          e.metadata.isRollCandidate === false &&
          e.metadata.actionId === original.metadata.actionId &&
          JSON.stringify(e.metadata.dice) ===
            JSON.stringify(original.metadata.dice) &&
          (original.metadata.sourceIndex ?? Infinity) <
            (e.metadata.sourceIndex ??
              -1), "A repeated terminal receipt must preserve the earlier same-action dice without a new candidate.");
      }
      if (e.metadata.diceEvidenceId) {
        const r = rawDiceById.get(e.metadata.diceEvidenceId);
        require(!!r &&
          r.eventId === e.id &&
          e.id === `nested-${r.id
      }` &&
          e.metadata.sourceId === e.id &&
          e.metadata.sourceTag === r.parentSourceTag &&
          e.metadata.sourceIndex === r.parentSourceIndex &&
          e.metadata.isRollCandidate === true &&
          e.scoringStatus === "excluded" &&
          e.type === "unknown" &&
          e.probabilitySuccess === null &&
          e.actualSuccess ===
            null, "Expanded nested dice must retain their source path and unknown odds/outcome, without a score.");
      }
      const team = e.metadata.teamDiceIdentity;
      if (team) {
        const q = sources.get(team.questionSourceId),
          choice = sources.get(team.decisionSourceId),
          original = rawDiceById.get(team.originalRecordId),
          gate = team.gateSourceId ? sources.get(team.gateSourceId) : undefined;
        const finalDice = rootDiceBySource.get(e.metadata.sourceId);
        require(e.scoringStatus === "excluded" &&
          e.probabilitySuccess === null &&
          e.metadata.sourceTag === "ResultRoll" &&
          q?.metadata.sourceTag === "QuestionTeamRerollUsage" &&
          choice?.metadata.sourceTag === "ResultTeamRerollUsage" &&
          original?.parentSourceId === team.questionSourceId &&
          original.dice.length === 1 &&
          original.dice[0]?.value === team.originalDie &&
          original.dice[0]?.dieType === 0 &&
          e.metadata.dice?.length === 1 &&
          e.metadata.dice[0] === team.finalDie &&
          original.rollType === e.metadata.rollType &&
          original.status === 1 &&
          original.newRoll === 1 &&
          choice?.metadata.teamDiceChoice?.questionSourceId ===
            team.questionSourceId &&
          choice.metadata.teamDiceChoice.used === team.teamUsed &&
          finalDice?.status === (team.replacementRolled ? 2 : 1) &&
          finalDice?.newRoll === (team.replacementRolled ? 1 : 0) &&
          (team.replacementRolled || team.originalDie === team.finalDie) &&
          (q?.metadata.sourceIndex ?? Infinity) <
            (choice?.metadata.sourceIndex ?? -1) &&
          (choice?.metadata.sourceIndex ?? Infinity) <
            (e.metadata.sourceIndex ??
              -1), "Observed team dice identities need an ordered matching original, explicit decision and terminal flags; they cannot promote odds or ownership.");
        require(gate
          ? team.gatePassed !== undefined &&
              team.gateSkillId !== undefined &&
              gate.metadata.rollType === (team.gateSkillId === 50 ? 15 : 71) &&
              team.teamUsed === (team.gateSkillId !== 50) &&
              gate.metadata.outcomeCode === Number(team.gatePassed) &&
              gate.metadata.dice?.length === 1 &&
              gate.metadata.dieTypes?.[0] === 0 &&
              [44, 1008, 50].includes(team.gateSkillId) &&
              gate.metadata.requirement ===
                (team.gateSkillId === 1008
                  ? 3
                  : team.gateSkillId === 44
                    ? 4
                    : 3) &&
              team.gatePassed ===
                gate.metadata.dice[0]! >= gate.metadata.requirement! &&
              team.replacementRolled === team.gatePassed &&
              (choice?.metadata.sourceIndex ?? Infinity) <
                (gate.metadata.sourceIndex ?? -1) &&
              (gate.metadata.sourceIndex ?? Infinity) <
                (e.metadata.sourceIndex ?? -1)
          : team.gatePassed === undefined &&
              team.gateSkillId === undefined &&
              team.replacementRolled ===
                team.teamUsed, "An observed reroll gate must be a separately ordered supported numeric test, never an inferred reroll price or eligibility claim.");
      }
      const proof = e.metadata.observedReroll;
      if (proof) {
        const q = sources.get(proof.questionSourceId),
          choice = sources.get(proof.decisionSourceId),
          original = rawDiceById.get(proof.originalRecordId),
          offer = q?.metadata.observedRerollOffer,
          used = choice?.metadata.observedRerollChoice;
        require(e.scoringStatus === "excluded" &&
          e.metadata.sourceTag === "ResultRoll" &&
          q?.metadata.sourceTag ===
            (proof.kind === "star"
              ? "QuestionStarSpecialRuleUsage"
              : "QuestionSkillUsage") &&
          choice?.metadata.sourceTag ===
            (proof.kind === "star"
              ? "ResultStarSpecialRuleUsage"
              : "ResultSkillUsage") &&
          proof.ruleId === (proof.kind === "star" ? 34 : 47) &&
          proof.ownershipCheckpointAfter < (q?.metadata.sourceIndex ?? -1) &&
          e.probabilitySuccess === null &&
          offer?.kind === proof.kind &&
          String(offer.gamerId) === e.teamId &&
          offer.ruleId === proof.ruleId &&
          offer.originalRecordId === proof.originalRecordId &&
          used?.kind === proof.kind &&
          used.ruleId === proof.ruleId &&
          used.used === proof.used &&
          used.questionSourceId === proof.questionSourceId &&
          q?.playerId === e.playerId &&
          choice?.playerId === e.playerId &&
          q?.teamId === e.teamId &&
          choice?.teamId === e.teamId &&
          e.teamId !== "unresolved" &&
          original?.parentSourceId === proof.questionSourceId &&
          original.dice.length === 1 &&
          original.status === 1 &&
          original.newRoll === (proof.kind === "star" ? 0 : 1) &&
          original.rollType === (proof.kind === "star" ? 87 : 5) &&
          original.dice[0]!.value === proof.originalDie &&
          original.dice[0]!.dieType === 0 &&
          e.metadata.dice?.length === 1 &&
          e.metadata.dice[0] === proof.finalDie &&
          (proof.used || proof.originalDie === proof.finalDie) &&
          rootDiceBySource.get(e.metadata.sourceId)?.status ===
            (proof.kind === "star" ? 1 : proof.used ? 2 : 1) &&
          rootDiceBySource.get(e.metadata.sourceId)?.newRoll ===
            (proof.kind === "star" ? 0 : proof.used ? 1 : 0) &&
          (q?.metadata.sourceIndex ?? Infinity) <
            (choice?.metadata.sourceIndex ?? -1) &&
          (choice?.metadata.sourceIndex ?? Infinity) <
            (e.metadata.sourceIndex ??
              -1), "Observed reroll dice require the owned original question, explicit matching choice and terminal record; observed use alone adds no accepted odds.");
      }
    }
    for (const [bucket, events] of [
      [report.coverage.allEvents, report.events],
      [report.coverage.rollCandidates, candidates]
    ] as const) {
      const n = events.filter(
        (event) => event.scoringStatus === "scored"
      ).length;
      require(bucket.scoredCount === n &&
        bucket.excludedCount ===
          events.length - n, "Coverage counts must reconcile with evidence.");
      require(near(
        bucket.scoredRate,
        events.length ? n / events.length : 0
      ), "Coverage rates must use the stated denominator.");
    }
    for (const type of LuckEventTypeSchema.options) {
      require(near(
        report.weightTable[type],
        LUCK_CATEGORY_WEIGHTS[type]
      ), "Weights must match the declared model version.");
      require(report.coverage.scoredByType[type] ===
        scored.filter((event) => event.type === type)
          .length, "Scored category counts must reconcile.");
      require(report.coverage.excludedByType[type] ===
        excluded.filter((event) => event.type === type)
          .length, "Excluded category counts must reconcile.");
    }
    const reasons = new Map<string, number>();
    for (const event of excluded)
      reasons.set(
        event.statusReason,
        (reasons.get(event.statusReason) ?? 0) + 1
      );
    require(Object.keys(report.coverage.excludedByReason).length ===
      reasons.size &&
      [...reasons].every(
        ([reason, n]) => report.coverage.excludedByReason[reason] === n
      ), "Exclusion reasons must conserve excluded records.");
    for (const event of report.events) {
      const policy = event.metadata.probabilityPolicy;
      const base = event.explainability.baseOdds;
      if (event.scoringStatus === "scored") {
        require(
          policy !== undefined && base !== undefined &&
            event.probabilitySuccess !== null &&
            event.explainability.rerollAdjustedOdds !== undefined &&
            near(event.explainability.rerollAdjustedOdds, event.probabilitySuccess),
          "Scored odds need an explicit probability policy and reconciled base/reported chances, independently of resource eligibility."
        );
        if (policy === "two_attempt") {
          require(
            [1, 2, 4, 7].includes(event.metadata.rollType ?? -1) &&
              event.metadata.rerollUsed === true && !!event.metadata.rerollResource &&
              !!(event.metadata.rerollQuestionId || event.metadata.rerollOriginalId) &&
              base !== undefined && event.probabilitySuccess !== null &&
              near(event.probabilitySuccess, 1 - (1 - base) ** 2),
            "A two-attempt policy needs a linked actual reroll and its compound chance, not inferred availability."
          );
        } else {
          require(
            (policy === "block_pool") === !!event.metadata.block &&
              (policy === "block_pool" || event.metadata.rerollUsed !== true) &&
              base !== undefined && event.probabilitySuccess !== null &&
              near(event.probabilitySuccess, base),
            "Single-attempt and block-pool policies must retain their base chance without implying resource availability."
          );
        }
      } else {
        require(policy === undefined, "Unscored evidence cannot claim an applied odds policy.");
      }
      const pro = event.metadata.proGate;
      if (pro) {
        const { dice, dieTypes, rollType, outcomeCode, teamRerollsSpent, rerollResource } = event.metadata;
        require(rollType === 15 &&
            dice?.length === 1 &&
            dieTypes?.length === 1 &&
            dieTypes[0] === 0 &&
            Number.isInteger(dice[0]) &&
            dice[0]! >= 1 &&
            dice[0]! <= 6 &&
          pro.passed === dice[0]! >= 3 &&
          outcomeCode === Number(pro.passed) &&
          event.actualSuccess === pro.passed &&
          teamRerollsSpent === 0 &&
          rerollResource === "skill" &&
          event.scoringStatus ===
            "excluded", "Pro evidence requires a verified 3+ gate and its skill resource.");
      }
      const gate = event.metadata.lonerGate;
      if (gate) {
        const skill = sources.get(gate.skillSourceId), choice = event.metadata.rerollDecisionId ? sources.get(event.metadata.rerollDecisionId) : undefined;
        require(skill?.metadata.sourceTag === "ResultSkillUsage" && skill.metadata.skillUsage?.skillId === gate.skillId && skill.metadata.skillUsage.used &&
          skill.playerId === event.playerId && skill.teamId === event.teamId && skill.metadata.actionId === event.metadata.actionId &&
          choice?.metadata.sourceTag === "ResultTeamRerollUsage" && choice.playerId === event.playerId && choice.teamId === event.teamId &&
          choice.metadata.actionId === event.metadata.actionId && choice.metadata.teamRerollDecision?.gamerId === gate.gamerId &&
          choice.metadata.teamRerollDecision.used && event.metadata.rerollResource === "team" &&
          (choice.metadata.sourceIndex ?? Infinity) < (skill.metadata.sourceIndex ?? -1) && (skill.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1),
          "A Loner gate requires its own ordered actor/skill/spend sources.");
        const {
          rollType,
          dice,
          dieTypes,
          outcomeCode,
          rerollDecisionId,
          teamRerollsSpent
        } = event.metadata;
        require(event.metadata.sourceTag === "ResultRoll" && event.metadata.isRollCandidate === true && rollType === 71 &&
          dice?.length === 1 &&
          dieTypes?.length === 1 && dieTypes[0] === 0 && event.teamId !== "unresolved" &&
          (event.metadata.modifiers?.length ?? 0) === 0 && event.metadata.modifiersSum === 0 &&
          Number.isInteger(dice[0]) &&
          dice[0]! >= 1 &&
          dice[0]! <= 6 &&
          gate.passed === dice[0]! >= gate.threshold &&
          gate.threshold === (gate.skillId === 1008 ? 3 : 4) &&
          event.metadata.requirement === gate.threshold &&
          event.metadata.difficulty === gate.threshold &&
          event.actualSuccess === gate.passed &&
          outcomeCode === Number(gate.passed) &&
          Boolean(rerollDecisionId) &&
          teamRerollsSpent === 1 &&
          event.scoringStatus ===
            "excluded", "A reported Loner gate requires one verified die and a team reroll spend.");
      }
      require(event.teamId === "unresolved" ||
        teamIds.has(
          event.teamId
        ), "Reported evidence must have a known or unresolved team.");
      const context = event.metadata.preRoll;
      const ended = context?.endedActivationSourceIds;
      if (ended)
        require(new Set(ended).size === ended.length &&
          ended.every((id) => {
            const loss = sources.get(id)?.metadata.activationLoss;
            const end = sources.get(id)?.metadata.activationEnd;
            if (end)
              return (
                end.teamId === context.actorRosterTeamId && end.teamTurn === context.teamTurn &&
          context.period === (end.periodCode === 0 ? "first_half" : end.periodCode === 1 ? "second_half" : end.periodCode === 2 ? "extra_time" : null) &&
          end.sourceIndex <= (event.metadata.sourceIndex ?? -1)
              );
            return (
              loss && loss.teamId === context.actorRosterTeamId &&
          loss.teamTurn === context.teamTurn &&
          context.period === (loss.periodCode === 0 ? "first_half" : loss.periodCode === 1 ? "second_half" : loss.periodCode === 2 ? "extra_time" : null) &&
          loss.followingSourceIndex <= (event.metadata.sourceIndex ?? -1)
            );
          }), "Known ended activations require earlier confirmed same-team, same-turn evidence.");
      const expiry = event.metadata.driveEffectExpiry;
      if (expiry) {
        const phase = sources.get(expiry.phaseSourceId);
        require(event.metadata.sourceTag === "EventEndPlayerEffect" && event.playerId === expiry.playerId && event.teamId === expiry.teamId &&
          teamIds.has(expiry.teamId) && event.metadata.recordedEffect?.providerId === expiry.providerSkillId &&
          phase?.metadata.sourceTag === "EventNewGamePhase" && phase.metadata.setupPhase?.code === 3 &&
          phase.metadata.locator?.replayStep === expiry.afterReplayStep && event.metadata.locator?.replayStep === expiry.afterReplayStep &&
          (event.metadata.locator?.childIndex ?? Infinity) < (phase.metadata.locator?.childIndex ?? -1) &&
          (phase.metadata.locator?.childIndex ?? Infinity) < expiry.afterChildIndex &&
          expiry.beforeCheckpointAfter < (event.metadata.sourceIndex ?? -1) && (event.metadata.sourceIndex ?? Infinity) < (phase.metadata.sourceIndex ?? -1) &&
          (phase.metadata.sourceIndex ?? Infinity) <= expiry.afterCheckpointAfter && expiry.afterCheckpointAfter <= report.coverage.sourceRecordCount &&
          event.scoringStatus === "excluded" && event.probabilitySuccess === null,
          "Drive effect expiry requires the explicit ordered end, setup phase and first same-step observation.");
      }
      if (event.metadata.setupPhase) require(event.metadata.sourceTag === "EventNewGamePhase", "Setup-phase context requires a recorded phase transition.");
      const suppressed = context?.suppressedTackleZones;
      if (suppressed) require(new Set(suppressed.map(p=>p.playerId)).size === suppressed.length &&
        suppressed.every(p=>(p.teamId === null || teamIds.has(p.teamId)) && (p.playerId !== event.playerId || context?.actorTackleZone === false)), "Tackle-zone effect observations require unique players and observed team identities.");
      const recovery = context?.actorMentalEffectEnd;
      if (recovery) {
        const source = sources.get(recovery.sourceId);
        require(source?.metadata.mentalEffectEnd?.providerSkillId === recovery.providerSkillId && source.playerId === event.playerId &&
          source.teamId === event.teamId && context?.actorTackleZone === null && source.metadata.mentalEffectEnd.declarationSourceId === context?.activationId &&
          (source.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1) &&
          (context?.checkpointAfter ?? Infinity) < (source.metadata.sourceIndex ?? -1), "An ended actor effect requires its earlier source in this observed activation frame.");
      }
      const resolution = event.metadata.mentalTraitResolution;
      if (resolution) {
        const end = sources.get(resolution.effectEndSourceId), skill = sources.get(resolution.skillSourceId);
        const face = event.metadata.dice?.[0], target = event.metadata.difficulty;
        const modifiers = event.metadata.modifiers ?? [];
        const unmodified = modifiers.length === 0 && event.metadata.modifiersSum === 0;
        const targetKnown = resolution.providerSkillId === 31
          ? event.metadata.requirement === 2 && target === 2 && unmodified
          : event.metadata.requirement === 4 && ((target === 4 && unmodified) ||
              (target === 2 && modifiers.length === 1 && modifiers[0] === 2 && event.metadata.modifiersSum === 2));
        require(event.metadata.dice?.length === 1 && event.metadata.dieTypes?.length === 1 && event.metadata.dieTypes[0] === 0 &&
          face !== undefined && Number.isInteger(face) && face >= 1 && face <= 6 && targetKnown &&
          event.actualSuccess === face >= target! &&
          event.metadata.outcomeCode === Number(event.actualSuccess), "A resolved mental test requires one consistent D6, effective target, modifiers and observed outcome.");
        require(event.metadata.sourceTag === "ResultRoll" && event.metadata.rollType === (resolution.providerSkillId === 51 ? 34 : 33) &&
          typeof event.actualSuccess === "boolean" && event.actualSuccess === Boolean(event.metadata.outcomeCode) &&
          event.scoringStatus === "excluded" && event.probabilitySuccess === null &&
          context?.actorMentalEffectEnd?.sourceId === resolution.effectEndSourceId && end?.metadata.mentalEffectEnd?.providerSkillId === resolution.providerSkillId &&
          skill?.metadata.sourceTag === "ResultSkillUsage" && skill.metadata.skillUsage?.skillId === resolution.providerSkillId && skill.metadata.skillUsage.used &&
          skill.playerId === event.playerId && skill.metadata.actionId === event.metadata.actionId &&
          (end?.metadata.sourceIndex ?? Infinity) < (skill.metadata.sourceIndex ?? -1) && (skill.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1),
          "A resolved mental test requires its ended prior effect and same-actor applied skill, with unknown odds.");
      }
      const effectEnd = event.metadata.mentalEffectEnd;
      if (effectEnd) {
        const declaration = sources.get(effectEnd.declarationSourceId);
        require(event.metadata.sourceTag === "ResultEndPlayerEffect" && event.teamId !== "unresolved" && event.playerId === effectEnd.playerId &&
          event.metadata.recordedEffect?.providerId === effectEnd.providerSkillId &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.playerId === event.playerId && declaration.teamId === event.teamId &&
          declaration.metadata.actionId === event.metadata.actionId &&
          (declaration.metadata.actionCode ?? 0) >= 1 && (declaration.metadata.actionCode ?? 0) <= 6 &&
          (declaration.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1), "Effect-end evidence requires the actor's own prior ordinary declaration.");
      }
      const end = event.metadata.activationEnd;
      if (end) {
        const declaration = sources.get(end.declarationSourceId);
        const originIndex = declaration?.metadata.sourceIndex ?? Infinity;
        const linked = (id: string | undefined, tag: string) => {
          const e = id ? sources.get(id) : undefined;
          return e?.metadata.sourceTag === tag &&
            e.playerId === end.actorId &&
            e.teamId === end.teamId &&
            (e.metadata.sourceIndex ?? -1) > originIndex &&
            (e.metadata.sourceIndex ?? Infinity) < end.sourceIndex
            ? e
            : undefined;
        };
        require(event.metadata.sourceTag === "ResultUseAction" &&
          event.metadata.sourceId === end.sourceId &&
          event.metadata.sourceIndex === end.sourceIndex &&
          event.playerId === end.followingPlayerId &&
          event.playerId !== end.actorId &&
          event.teamId === end.teamId &&
          (event.metadata.actionCode ?? 0) >= 1 &&
          (event.metadata.actionCode ?? 0) <= 6 &&
          declaration?.metadata.sourceTag === "ResultUseAction" &&
          declaration.playerId === end.actorId &&
          declaration.teamId === end.teamId &&
          originIndex < end.sourceIndex &&
          end.checkpointAfter <
            end.sourceIndex, "An ended activation requires an earlier declaration and a different following teammate.");
        if(end.rosterCheckpointAfter !== undefined) require(end.kind === "ordinary_move_completed" &&
          declaration?.metadata.preRoll?.checkpointAfter === end.rosterCheckpointAfter && end.rosterCheckpointAfter < originIndex &&
          declaration.metadata.preRoll.actorRosterTeamId === end.teamId && declaration.metadata.preRoll.activeTeamId === end.teamId &&
          declaration.metadata.preRoll.teamTurn === end.teamTurn,
          "Fresh-roster Move completion needs the original declaration's current roster, active side and clock checkpoint.");
        if(end.completionCheckpointAfter !== undefined) {
          const move=linked(end.moveSourceId,"ResultMoveOutcome");
          require(end.kind === "ordinary_move_completed" && !!move &&
            (move.metadata.sourceIndex ?? Infinity)<end.completionCheckpointAfter && end.completionCheckpointAfter<end.sourceIndex &&
            end.checkpointAfter===end.completionCheckpointAfter && event.metadata.preRoll?.checkpointAfter===end.completionCheckpointAfter &&
            event.metadata.preRoll.phaseCode===5 && event.metadata.preRoll.activeTeamId===end.teamId &&
            event.metadata.preRoll.teamTurn===end.teamTurn,
            "A deterministic Move wait needs the later stable-position checkpoint before the next same-team declaration; no dice or value is added.");
        }
        if (end.kind === "ordinary_move_completed") {
          require(declaration?.metadata.actionCode === 1 &&
            !!linked(end.moveSourceId, "ResultMoveOutcome") &&
            !end.policy &&
            !end.rollSourceId &&
            !end.effectSourceId &&
            !end.skillSourceId &&
            !end.questionSourceId &&
            !end.decisionSourceId &&
            !end.lonerSourceId &&
            !end.lonerSkillSourceId, "Ordinary Move completion requires its recorded movement and no fabricated trait policy.");
        } else {
          const skillId = end.kind === "bone_head" ? 31 : 51;
          const skill = linked(end.skillSourceId, "ResultSkillUsage"),
            roll = linked(end.rollSourceId, "ResultRoll"),
            effect = linked(end.effectSourceId, "ResultAddPlayerEffect");
          require((declaration?.metadata.actionCode ?? 0) >= 1 &&
            (declaration?.metadata.actionCode ?? 0) <= 6 &&
            skill?.metadata.skillUsage?.skillId === skillId &&
            skill.metadata.skillUsage.used &&
            roll?.metadata.rollType === (skillId === 31 ? 33 : 34) &&
            roll.actualSuccess === false &&
            roll.scoringStatus === "excluded" &&
            effect?.metadata.recordedEffect?.providerId === skillId &&
            (skill?.metadata.sourceIndex ?? Infinity) <
              (roll?.metadata.sourceIndex ?? -1) &&
            (roll?.metadata.sourceIndex ?? Infinity) <
              (effect?.metadata.sourceIndex ?? -1) &&
            (effect?.metadata.sourceIndex ?? Infinity) <= end.checkpointAfter &&
            !end.moveSourceId, "A terminal mental trait requires its own skill, failed roll, recorded effect and following board.");
          if (end.policy === "fresh_final")
            require(!end.questionSourceId &&
              !end.decisionSourceId &&
              !end.lonerSourceId &&
              !end.lonerSkillSourceId, "A fresh final trait cannot claim a reroll policy.");
          else {
            const question = linked(
                end.questionSourceId,
                "QuestionTeamRerollUsage"
              ),
              decision = linked(end.decisionSourceId, "ResultTeamRerollUsage");
            require(!!question &&
              !!decision &&
              (question?.metadata.sourceIndex ?? Infinity) <
                (decision?.metadata.sourceIndex ?? -1) &&
              (decision?.metadata.sourceIndex ?? Infinity) <
                (roll?.metadata.sourceIndex ??
                  -1), "A terminal reroll policy requires ordered question and decision evidence.");
            if (end.policy === "team_loner_replacement" || end.policy === "failed_loner_kept_original") {
              const loner = linked(end.lonerSourceId, "ResultRoll"),
                lonerSkill = linked(end.lonerSkillSourceId, "ResultSkillUsage");
              require(loner?.metadata.rollType === 71 &&
                loner.metadata.lonerGate?.passed === (end.policy === "team_loner_replacement") &&
                lonerSkill?.metadata.skillUsage?.skillId === loner.metadata.lonerGate?.skillId &&
                lonerSkill.metadata.skillUsage.used &&
                loner.metadata.lonerGate.skillSourceId ===
                  end.lonerSkillSourceId &&
                (decision?.metadata.sourceIndex ?? Infinity) <
                  (loner?.metadata.sourceIndex ?? -1) &&
                (loner?.metadata.sourceIndex ?? Infinity) <
                  (roll?.metadata.sourceIndex ??
                    -1), "A terminal trait policy requires its matching passed or failed Loner gate.");
            } else
              require(end.policy === "kept_original" &&
                !end.lonerSourceId &&
                !end.lonerSkillSourceId, "A kept trait cannot invent a replacement.");
          }
        }
      }
      const activationLoss = event.metadata.activationLoss;
      if (activationLoss) {
        const declaration = sources.get(activationLoss.declarationSourceId);
        const skill = sources.get(activationLoss.skillSourceId);
        const following = sources.get(activationLoss.followingActivationSourceId);
        require(event.metadata.sourceTag === "ResultRoll" && event.metadata.rollType === 37 &&
          event.metadata.sourceId === activationLoss.rollSourceId &&
          event.metadata.sourceIndex === activationLoss.rollSourceIndex &&
          event.metadata.dice?.length === 1 && event.metadata.dice[0] === 1 && event.metadata.dieTypes?.[0] === 0 &&
          event.metadata.difficulty === 2 && event.metadata.outcomeCode === 0 &&
          event.teamId === activationLoss.teamId && event.playerId === activationLoss.actorId &&
          event.metadata.targetId === activationLoss.subjectId && event.actualSuccess === false &&
          event.scoringStatus === "excluded" && event.probabilitySuccess === null &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.metadata.actionCode === 2 &&
          declaration.playerId === activationLoss.actorId && declaration.metadata.actionId === event.metadata.actionId &&
          (declaration.metadata.sourceIndex ?? Infinity) < activationLoss.rollSourceIndex &&
          skill?.metadata.sourceTag === "ResultSkillUsage" && skill.playerId === activationLoss.subjectId &&
          skill.metadata.skillUsage?.skillId === 10 && skill.metadata.skillUsage.used === true &&
          skill.metadata.actionId === event.metadata.actionId &&
          (skill.metadata.sourceIndex ?? Infinity) < activationLoss.rollSourceIndex &&
          following?.metadata.sourceTag === "ResultUseAction" && following.playerId === activationLoss.followingPlayerId &&
          following.playerId !== activationLoss.actorId && following.teamId === activationLoss.teamId &&
          following.metadata.sourceIndex === activationLoss.followingSourceIndex &&
          (following.metadata.actionCode ?? 0) >= 1 && (following.metadata.actionCode ?? 0) <= 6 &&
          activationLoss.beforeCheckpointAfter < activationLoss.rollSourceIndex &&
          activationLoss.afterCheckpointAfter >= activationLoss.rollSourceIndex &&
          activationLoss.afterCheckpointAfter < activationLoss.followingSourceIndex,
          "An activation loss requires the failed gate, opposing skill, following teammate and ordered checkpoints.");
      }
      if (event.scoringStatus === "scored" && context?.actorRosterTeamId !== undefined)
        require(context.actorRosterTeamId === event.teamId,
          "Scored ownership must agree with the current observed roster.");
      for (const traits of [context?.actorTraits, context?.targetTraits])
        for (const list of [traits?.innateSkills, traits?.acquiredSkills])
          if (list) require(new Set(list).size === list.length,
            "Observed skill lists cannot contain repeated codes.");
      if (context?.actorTraits?.dataPlayerId !== null && context?.actorTraits?.dataPlayerId !== undefined)
        require(String(context.actorTraits.dataPlayerId) === event.playerId,
          "Actor trait data must match the observed player ID.");
      if (context?.targetTraits?.dataPlayerId !== null && context?.targetTraits?.dataPlayerId !== undefined)
        require(String(context.targetTraits.dataPlayerId) === event.metadata.targetId,
          "Target trait data must match the observed target ID.");
      if (context && event.metadata.sourceIndex !== undefined)
        require(context.checkpointAfter <
          event.metadata
            .sourceIndex, "Pre-roll evidence must precede its source.");
      if (context?.actorStandUpSourceIndex !== undefined) {
        require(
          context.activationId !== null &&
            context.actorCell !== null &&
            event.metadata.sourceIndex !== undefined &&
            context.actorStandUpSourceIndex > context.checkpointAfter &&
            context.actorStandUpSourceIndex < event.metadata.sourceIndex,
          "Stand-up evidence must be between the checkpoint and roll of the same activation."
        );
      }
      const reaction=event.metadata.bounceCatchReaction,catchBound=event.catchPossessionBounds;
      const counter = event.metadata.teamRerollCounter;
      if(counter) {
        const question=sources.get(counter.questionSourceId),choice=event.metadata.teamRerollDecision,before=counter.before,after=counter.after;
        require(event.metadata.sourceTag === "ResultTeamRerollUsage" && event.scoringStatus === "excluded" && event.metadata.isRollCandidate === false &&
          !!question && ["QuestionTeamRerollUsage","QuestionBlockDice"].includes(question.metadata.sourceTag) && !!question.metadata.rerollOffer && !!choice &&
          question.metadata.rerollOffer.gamerId === choice.gamerId && choice.used === (counter.spent === 1) &&
          question.metadata.rerollOffer.decisionSourceId === event.metadata.sourceId &&
          (counter.spent === 0 || question.metadata.rerollOffer.canUseTeamReroll) &&
          event.teamId === before.teamId && question.teamId === event.teamId && !!event.playerId && question.playerId === event.playerId &&
          event.metadata.stepType === question.metadata.stepType && event.metadata.targetId === question.metadata.targetId &&
          before.checkpointAfter < (question.metadata.sourceIndex ?? -1) && (question.metadata.sourceIndex ?? Infinity)<(event.metadata.sourceIndex ?? -1) &&
          question.metadata.locator?.replayStep !== undefined && before.replayStep <= question.metadata.locator.replayStep &&
          (before.replayStep !== question.metadata.locator.replayStep || before.childIndex<(question.metadata.locator.childIndex ?? -1)) &&
          (!after || (after.checkpointAfter >= event.metadata.sourceIndex! && after.teamId === before.teamId && after.teamTurn === before.teamTurn &&
            before.periodCode !== null && after.periodCode === before.periodCode && after.replayStep === event.metadata.locator?.replayStep && after.childIndex>(event.metadata.locator?.childIndex ?? Infinity))) &&
          counter.reconciliation === (!after ? "after_unavailable" : after.count === before.count-counter.spent ? "matched" : "mismatch"),
          "Team reroll counter evidence needs one owned offer/decision, ordered checkpoint observations and exact reconciliation without phase/reset backfill.");
      }
      if(event.metadata.teamRerollDecision)
        require(event.metadata.sourceTag === "ResultTeamRerollUsage" && event.scoringStatus === "excluded" && event.metadata.isRollCandidate === false &&
          (event.metadata.teamRerollDecision.used || counter?.spent === 0),
          "A recorded team-reroll choice must be non-random decision evidence; a decline needs its counter receipt.");
      if(event.metadata.rerollOffer)
        require(((event.metadata.sourceTag === "QuestionTeamRerollUsage" && event.scoringStatus === "excluded" && event.metadata.isRollCandidate === false) ||
          (event.metadata.sourceTag === "QuestionBlockDice" && event.scoringStatus === "scored" && event.metadata.isRollCandidate === true && event.metadata.rollType === 3 &&
            event.metadata.block?.pool.attackerChooses === true && event.metadata.block.attackerId === event.playerId && event.metadata.block.chooserTeamId === event.teamId && event.metadata.block.chooserGamerId === event.metadata.rerollOffer.gamerId)) &&
          sources.get(event.metadata.rerollOffer.decisionSourceId)?.metadata.teamRerollCounter?.questionSourceId === event.metadata.sourceId &&
          counterQuestions.has(event.metadata.sourceId ?? ""),
          "A counter offer must reference one observed decision, preserving an existing attacker-selected pool or excluded non-random offer.");
      const pickupEnd = event.metadata.pickupTurnEnd;
      if(pickupEnd) {
        const caught=sources.get(pickupEnd.catchSourceId),end=sources.get(pickupEnd.endSourceId);
        const moves=pickupEnd.ordinaryMoves, known=moves?.knownAvailablePlayerIds ?? [],unknown=moves?.unknownPlayerIds ?? [];
        require(event.scoringStatus === "scored" && event.actualSuccess === false && event.metadata.rollType === 4 &&
          !!caught && caught.metadata.bounceCatchReaction?.pickupSourceId === event.metadata.sourceId && caught.actualSuccess === true &&
          end?.metadata.sourceTag === "EventEndTurn" && end.metadata.turnEndReason === 2 && end.scoringStatus === "excluded" && end.metadata.isRollCandidate === false &&
          caught.metadata.sourceIndex !== undefined && end.metadata.sourceIndex === caught.metadata.sourceIndex+1 &&
          caught.metadata.locator?.replayStep !== undefined && end.metadata.locator?.replayStep === caught.metadata.locator.replayStep &&
          end.metadata.locator?.childIndex === (caught.metadata.locator.childIndex ?? -2)+1 &&
          (!moves || (context?.phaseCode === 5 && context.activeTeamId === event.teamId && context.actorCell !== null)) &&
          new Set([...known,...unknown]).size === known.length+unknown.length && ![...known,...unknown].includes(event.playerId ?? ""),
          "Pickup turn-end evidence needs the adjacent verified catch, deterministic reason-2 source and qualified, disjoint ordinary-move candidates.");
      }
      if(event.metadata.turnEndReason !== undefined)
        require(event.metadata.sourceTag === "EventEndTurn" && event.scoringStatus === "excluded" && event.metadata.isRollCandidate === false &&
          pickupTurnEndSources.has(event.metadata.sourceId ?? ""),
          "A recorded turn-end reason needs a linked pickup aftermath, not another scored random outcome.");
      if(reaction || catchBound?.policy === "fresh_catch_failure_envelope") {
        const pickup=sources.get(reaction?.pickupSourceId ?? ""),bounce=sources.get(reaction?.bounceSourceId ?? "");
        const declaration=sources.get(reaction?.declarationSourceId ?? ""),move=sources.get(reaction?.moveOutcomeSourceId ?? "");
        const cell=event.metadata.ballCatchCell,travel=bounce?.metadata.ballTravel,target=event.metadata.difficulty;
        const expectedCatch=estimateFreshCatchPossession(catchBound?.successChance ?? 0);
        require(!!reaction && !!catchBound && event.scoringStatus === "scored" && event.actualSuccess === true && event.metadata.rollType === 7 && event.metadata.stepType === 4 && !event.metadata.rerollUsed &&
          !event.contextualImpact && !event.contextualBounds && !event.possessionBounds &&
          pickup?.scoringStatus === "scored" && pickup.actualSuccess === false && pickup.metadata.rollType === 4 && !pickup.metadata.rerollUsed &&
          pickup.metadata.pickupBallChain?.bounceSourceIds[0] === reaction.bounceSourceId && pickup.metadata.pickupBallChain.catchEventIds[0] === event.id &&
          bounce?.metadata.rollType === 25 && bounce.scoringStatus === "excluded" && !!cell && !!travel && travel.to.x === cell.x && travel.to.y === cell.y &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.metadata.actionCode === 1 && declaration.metadata.stepType === 0 && declaration.playerId === pickup.playerId && declaration.teamId === pickup.teamId &&
          move?.metadata.sourceTag === "ResultMoveOutcome" && move.metadata.stepType === 1 && move.scoringStatus === "excluded" && move.playerId === pickup.playerId && move.teamId === pickup.teamId && move.metadata.actionId === pickup.metadata.actionId &&
          event.metadata.sequenceId === pickup.metadata.sequenceId && bounce.metadata.sequenceId === event.metadata.sequenceId &&
          event.metadata.sourceIndex !== undefined && pickup.metadata.sourceIndex === event.metadata.sourceIndex-4 && bounce.metadata.sourceIndex === event.metadata.sourceIndex-2 &&
          move.metadata.sourceIndex === event.metadata.sourceIndex-5 && reaction.checkpointAfter === pickup.metadata.preRoll?.checkpointAfter && pickup.metadata.preRoll.activationId === reaction.declarationSourceId &&
          pickup.metadata.preRoll.actorCell?.x === travel.from.x && pickup.metadata.preRoll.actorCell.y === travel.from.y &&
          reaction.checkpointAfter<(declaration.metadata.sourceIndex??-1) && (declaration.metadata.sourceIndex??Infinity)<move.metadata.sourceIndex! &&
          Number.isInteger(target) && target!>=2 && target!<=6 && event.probabilitySuccess !== null && near(event.probabilitySuccess,(7-target!)/6) && near(catchBound.successChance,event.probabilitySuccess) && near(catchBound.upper,expectedCatch.upper),
          "A fresh catch envelope needs its verified occupied first bounce, failed pickup and ordinary-move prefix, with conditional odds and no point contribution.");
      }
      const keptReaction=event.metadata.retainedCatchReaction;
      if(keptReaction || catchBound?.policy === "kept_catch_failure_envelope") {
        const pickup=sources.get(keptReaction?.pickupSourceId ?? ""),bounce=sources.get(keptReaction?.bounceSourceId ?? ""),
          next=sources.get(keptReaction?.followingBounceSourceId ?? ""),question=sources.get(keptReaction?.questionSourceId ?? ""),
          decision=sources.get(keptReaction?.decisionSourceId ?? "");
        const expected=estimateKeptCatchPossession(event.probabilitySuccess ?? 0),at=event.metadata.ballCatchCell,travel=bounce?.metadata.ballTravel;
        const original=event.metadata.originalDice as {Die?: {DieType?:number;Value?:number}} | undefined;
        const retained=(e:typeof event|undefined,type:number)=>e?.scoringStatus === "scored" && e.actualSuccess === false &&
          e.metadata.probabilityPolicy === "single_attempt" && e.metadata.rollType === type && e.metadata.rerollUsed === false &&
          e.metadata.teamRerollsSpent === 0 && e.metadata.rerollResource === undefined;
        require(!!keptReaction && catchBound?.policy === "kept_catch_failure_envelope" && retained(event,7) && retained(pickup,4) &&
          !reaction && !event.contextualImpact && !event.contextualBounds && !event.possessionBounds &&
          pickup?.teamId === event.teamId && pickup?.metadata.pickupBallChain?.bounceSourceIds[0] === keptReaction.bounceSourceId &&
          pickup.metadata.pickupBallChain.bounceSourceIds[1] === keptReaction.followingBounceSourceId && pickup.metadata.pickupBallChain.catchEventIds[0] === event.id &&
          event.metadata.rerollQuestionId === keptReaction.questionSourceId && event.metadata.rerollDecisionId === keptReaction.decisionSourceId &&
          question?.metadata.sourceTag === "QuestionTeamRerollUsage" && decision?.metadata.sourceTag === "ResultTeamRerollUsage" &&
          question.scoringStatus === "excluded" && question.metadata.isRollCandidate === false && decision.scoringStatus === "excluded" && decision.metadata.isRollCandidate === false &&
          [question,decision].every(e=>e?.playerId === event.playerId && e?.teamId === event.teamId && e?.metadata.stepType === 4 && e?.metadata.targetId === "-1") &&
          event.metadata.stepType === 4 && event.metadata.targetId === "-1" &&
          !!event.metadata.sequenceId && question.metadata.sequenceId === pickup.metadata.sequenceId && bounce?.metadata.sequenceId === question.metadata.sequenceId &&
          decision.metadata.sequenceId === event.metadata.sequenceId && decision.metadata.actionId === event.metadata.actionId && next?.metadata.sequenceId === event.metadata.sequenceId &&
          event.metadata.sequenceId !== question.metadata.sequenceId && event.metadata.sourceIndex === (pickup.metadata.sourceIndex ?? -9)+7 &&
          question.metadata.sourceIndex === (pickup.metadata.sourceIndex ?? -9)+4 && decision.metadata.sourceIndex === event.metadata.sourceIndex-1 &&
          bounce?.metadata.sourceIndex === (pickup.metadata.sourceIndex ?? -9)+2 && next?.metadata.sourceIndex === event.metadata.sourceIndex+2 &&
          keptReaction.waitingCheckpointAfter === question.metadata.sourceIndex && keptReaction.beforeCheckpointAfter< (pickup.metadata.sourceIndex ?? -1) &&
          keptReaction.beforeCheckpointAfter === sources.get(pickup.metadata.rerollQuestionId ?? "")?.metadata.sourceIndex &&
          bounce?.metadata.rollType === 25 && next?.metadata.rollType === 25 && bounce.scoringStatus === "excluded" && next.scoringStatus === "excluded" &&
          !!at && !!travel && travel.to.x === at.x && travel.to.y === at.y && next.metadata.ballTravel?.from.x === at.x && next.metadata.ballTravel.from.y === at.y &&
          event.metadata.dice?.length === 1 && event.metadata.dieTypes?.[0] === 0 && original?.Die?.DieType === 0 && original.Die.Value === event.metadata.dice[0] &&
          event.metadata.difficulty !== undefined && near(event.probabilitySuccess ?? -1,(7-event.metadata.difficulty)/6) &&
          near(catchBound.successChance,event.probabilitySuccess ?? -1) && near(catchBound.lower,expected.lower) && catchBound.upper === 0,
          "A retained Catch envelope needs its first-bounce pickup chain, original offer and decline, matching kept die, adjacent further bounce and ordered physical checkpoints; no new random stage or point value.");
      }
      const successors = context?.pickupSuccessors;
      const possession = event.possessionBounds;
      if (successors || possession) {
        const original=sources.get(event.metadata.rerollOriginalId ?? ""),use=sources.get(event.metadata.rerollDecisionId ?? "");
        const declaration=sources.get(successors?.declarationSourceId ?? ""),move=sources.get(successors?.moveOutcomeSourceId ?? "");
        const target = event.metadata.difficulty;
        const owns=(e:typeof event|undefined)=>e?.playerId === event.playerId && e?.teamId === event.teamId;
        const sameStep=(e:typeof event|undefined)=>owns(e) && e?.metadata.actionId === event.metadata.actionId && e?.metadata.sequenceId === event.metadata.sequenceId;
        require(!!successors && !!possession && event.scoringStatus === "scored" && event.metadata.rollType === 4 && event.metadata.stepType === 1 &&
          event.metadata.rerollSkill === "Sure Hands" && event.metadata.rerollResource === "skill" && event.metadata.teamRerollsSpent === 0 &&
          !event.contextualImpact && !event.contextualBounds && context?.phaseCode === 5 && (context.actorRosterTeamId === undefined || context.actorRosterTeamId === event.teamId) && context.actorCarriesBall !== true &&
          context.activationId === successors.declarationSourceId && context.actorCell?.x === successors.origin.x && context.actorCell.y === successors.origin.y &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.metadata.actionCode === 1 && declaration.metadata.stepType === 0 && owns(declaration) &&
          move?.metadata.sourceTag === "ResultMoveOutcome" && sameStep(move) &&
          original?.metadata.sourceTag === "ResultRoll" && sameStep(original) && original.metadata.rollType === 4 && original.metadata.outcomeCode === 0 &&
          original.metadata.mergedRerollAnchorId === event.metadata.sourceId && original.metadata.difficulty === target && original.metadata.requirement === target &&
          use?.metadata.sourceTag === "ResultSkillUsage" && sameStep(use) && use.metadata.skillUsage?.skillId === 61 && use.metadata.skillUsage.used &&
          event.metadata.sourceIndex !== undefined && original.metadata.sourceIndex === event.metadata.sourceIndex-2 && use.metadata.sourceIndex === event.metadata.sourceIndex-1 &&
          move?.metadata.sourceIndex === event.metadata.sourceIndex-3 && context.checkpointAfter < move.metadata.sourceIndex! &&
          (declaration?.metadata.sourceIndex ?? Infinity) < (move.metadata.sourceIndex ?? -1) &&
          typeof target === "number" && Number.isInteger(target) && target >= 2 && target <= 6 && event.metadata.requirement === target &&
          original.metadata.modifiers?.length === 0 && event.metadata.modifiers?.length === 0 &&
          original.metadata.dice?.length === 1 && original.metadata.dieTypes?.length === 1 && original.metadata.dieTypes[0] === 0 &&
          Number.isInteger(original.metadata.dice[0]) && original.metadata.dice[0]! >= 1 && original.metadata.dice[0]! < target &&
          event.metadata.dice?.length === 1 && event.metadata.dieTypes?.length === 1 && event.metadata.dieTypes[0] === 0 &&
          Number.isInteger(event.metadata.dice[0]) && event.metadata.dice[0]!>=1 && event.metadata.dice[0]!<=6 &&
          event.actualSuccess === event.metadata.dice[0]! >= target &&
          event.probabilitySuccess !== null &&
          near(
            event.probabilitySuccess,
            1 - ((target - 1) / 6) ** 2
          ), "Pickup possession bounds require an owned ordinary Move and committed original/Sure-Hands/replacement chain; missing checkpoint possession stays unknown.");
        if (successors) {
          require(new Set(successors.branches.map(b=>b.direction)).size === 8 &&
            successors.branches.every((b) => {
              const expected=bounceDestination(b.direction,successors.origin);
              const onPitch=b.destination.x>=0 && b.destination.x<=25 && b.destination.y>=0 && b.destination.y<=14;
              return (
                expected?.x === b.destination.x && expected?.y === b.destination.y && (b.kind === "out_of_bounds" ? !onPitch : onPitch) &&
                (b.kind !== "occupied" || b.playerId !== event.playerId) &&
                (b.kind !== "empty" || (b.settlement === "loose") === (context?.pickupSettlementKnown === true))
              );
            }), "Pickup successors require all eight unique valid D8 directions, retaining occupied catch and off-pitch return uncertainty.");
        }
        const expected=possession ? estimatePickupPossessionBounds(context,possession.policy,Number(event.actualSuccess)-possession.successChance,possession.successChance) : undefined;
        require(!!possession && !!expected && near(possession.successChance,(7-(target ?? 0))/6) &&
          near(possession.minimumDifference,expected.minimumDifference) && near(possession.maximumDifference,expected.maximumDifference) &&
          near(possession.lower,expected.lower) && near(possession.upper,expected.upper),
          "Pickup possession endpoints must use the conditional terminal die and all eight successor bounds, outside point totals.");
      }
      if(context?.carriedBallCell) require(context.actorCarriesBall === true && context.actorCell?.x === context.carriedBallCell.x && context.actorCell.y === context.carriedBallCell.y,
        "A known carried-ball cell must match its observed carrier's current position.");
      const combined = event.metadata.combinedMovement;
      if (combined) {
        const rush=sources.get(combined.rushSourceId),step=sources.get(combined.stepSourceId),move=sources.get(combined.doMoveSourceId),outcome=sources.get(combined.outcomeSourceId);
        const own=(e:typeof event|undefined)=>!!e&&e.teamId===event.teamId&&e.playerId===event.playerId;
        const same=(e:typeof event|undefined)=>own(e)&&e!.metadata.actionId===event.metadata.actionId&&e!.metadata.sequenceId===event.metadata.sequenceId;
        const zone=combined.zonePenalty,mods=event.metadata.modifiers??[];
        require(event.metadata.sourceId===combined.dodgeSourceId&&event.scoringStatus==="scored"&&event.metadata.rollType===2&&event.actualSuccess===combined.dodgeSucceeded&&
          !event.contextualImpact&&!event.contextualBounds&&!event.possessionBounds&&!event.metadata.rerollUsed&&!event.metadata.rerollSkill&&
          same(rush)&&rush?.scoringStatus==="scored"&&rush.actualSuccess===true&&rush.metadata.rollType===1&&same(step)&&step?.metadata.sourceTag==="PlayerStep"&&step.metadata.stepType===1&&step.metadata.targetId==="-1"&&
          same(move)&&move?.metadata.sourceTag==="ResultDoMove"&&move.scoringStatus==="excluded"&&same(outcome)&&outcome?.metadata.sourceTag==="ResultMoveOutcome"&&outcome.scoringStatus==="excluded"&&
          event.metadata.sourceIndex!==undefined&&rush.metadata.sourceIndex===event.metadata.sourceIndex-1&&move.metadata.sourceIndex===event.metadata.sourceIndex+1&&outcome.metadata.sourceIndex===event.metadata.sourceIndex+2&&
          combined.originalCheckpointAfter<=combined.checkpointAfter&&combined.checkpointAfter<(step.metadata.sourceIndex??-1)&&
          Math.max(Math.abs(combined.from.x-combined.to.x),Math.abs(combined.from.y-combined.to.y))===1&&combined.movementAfter===(combined.dodgeSucceeded?combined.movementBefore:null)&&
          new Set(combined.partialOccupancy.map(p=>p.playerId)).size===combined.partialOccupancy.length &&
          combined.partialOccupancy.every(
            (p) =>
              p.playerId !== event.playerId &&
              (p.cell.x === null) !== (p.cell.y === null) &&
              [combined.from,combined.to].every(c=>(p.cell.x!==null&&p.cell.x!==c.x)||(p.cell.y!==null&&p.cell.y!==c.y))
          ) &&
          (zone?event.metadata.requirement===zone.baseTarget&&event.metadata.difficulty===zone.baseTarget+zone.markers.length&&mods.length===zone.markers.length&&mods.every(m=>m===-1)&&event.metadata.modifiersSum===-mods.length&&
            new Set(zone.markers.map(m=>m.playerId)).size===zone.markers.length&&zone.markers.every(m=>m.playerId!==event.playerId&&Math.max(Math.abs(m.cell.x-combined.to.x),Math.abs(m.cell.y-combined.to.y))===1):
            mods.length===0&&event.metadata.modifiersSum===0&&event.metadata.requirement===event.metadata.difficulty), "Combined movement needs two ordered scored checks and their confirmed two-family outcome; partial coordinates exclude the relevant squares without filling omissions or adding values.");
        if(combined.policy==="team_rush_then_dodge") {
          const q=sources.get(combined.questionSourceId??""),choice=sources.get(combined.decisionSourceId??"");
          require(own(q)&&q?.metadata.sourceTag==="QuestionTeamRerollUsage"&&q.scoringStatus==="excluded"&&q.metadata.isRollCandidate===false&&same(choice)&&choice?.metadata.sourceTag==="ResultTeamRerollUsage"&&
            choice.metadata.teamRerollDecision?.used===true&&choice.metadata.teamRerollDecision.gamerId===combined.gamerId&&choice.metadata.sourceIndex===(rush?.metadata.sourceIndex??-1)-1&&
            step?.metadata.sourceIndex===(choice.metadata.sourceIndex??-1)-1&&combined.originalCheckpointAfter<(q.metadata.sourceIndex??-1)&&(q.metadata.sourceIndex??Infinity)<=combined.checkpointAfter&&
            rush?.metadata.rerollResource==="team"&&rush.metadata.rerollUsed===true&&rush.metadata.teamRerollsSpent===1&&rush.metadata.rerollQuestionId===combined.questionSourceId&&rush.metadata.rerollDecisionId===combined.decisionSourceId,
            "A combined team Rush retains its explicit used decision and compound Rush odds separately from the fresh Dodge.");
        } else require(!combined.questionSourceId&&!combined.decisionSourceId&&combined.gamerId===undefined&&!rush?.metadata.rerollUsed&&!rush?.metadata.rerollSkill&&
          step?.metadata.sourceIndex===(rush?.metadata.sourceIndex??-1)-1&&combined.originalCheckpointAfter===combined.checkpointAfter,
          "A fresh combined Rush cannot invent a choice, resource spend or earlier waiting state.");
      }
      const reachedPickup=event.metadata.pickupAfterMovement;
      if(reachedPickup) {
        const moveEvent=sources.get(reachedPickup.movementSourceId),move=moveEvent?.metadata.teamRerollMovement;
        const original=sources.get(reachedPickup.originalSourceId),skill=sources.get(reachedPickup.skillSourceId),outcome=sources.get(reachedPickup.moveOutcomeSourceId);
        const same=(e:typeof event|undefined)=>!!e&&e.playerId===event.playerId&&e.teamId===event.teamId&&e.metadata.actionId===event.metadata.actionId&&e.metadata.sequenceId===event.metadata.sequenceId;
        const check=reachedPickup.check,mods=event.metadata.modifiers??[];
        require(event.scoringStatus==="scored"&&event.actualSuccess===true&&event.metadata.rollType===4&&event.metadata.rerollSkill==="Sure Hands"&&
          !event.contextualImpact&&!event.possessionBounds&&!event.contextualBounds&&!!move&&same(moveEvent)&&
          move.declarationSourceId===reachedPickup.declarationSourceId&&move.outcomeSourceId===reachedPickup.moveOutcomeSourceId&&move.checkpointAfter===reachedPickup.checkpointAfter&&
          move.to.x===reachedPickup.cell.x&&move.to.y===reachedPickup.cell.y&&move.movementAfter===reachedPickup.movementRemaining&&
          same(original)&&original?.metadata.rollType===4&&original.metadata.outcomeCode===0&&original.metadata.mergedRerollAnchorId===event.metadata.sourceId&&
          event.metadata.rerollOriginalId===reachedPickup.originalSourceId&&event.metadata.rerollDecisionId===reachedPickup.skillSourceId&&
          same(skill)&&skill?.metadata.skillUsage?.skillId===61&&skill.metadata.skillUsage.used&&same(outcome)&&outcome?.metadata.sourceTag==="ResultMoveOutcome"&&
          event.metadata.sourceIndex!==undefined&&original.metadata.sourceIndex===event.metadata.sourceIndex-2&&skill.metadata.sourceIndex===event.metadata.sourceIndex-1&&outcome.metadata.sourceIndex===event.metadata.sourceIndex-3&&
          context?.checkpointAfter===reachedPickup.checkpointAfter&&context.activationId===reachedPickup.declarationSourceId&&context.actorCell?.x===reachedPickup.cell.x&&context.actorCell.y===reachedPickup.cell.y&&
          (context.actorMovementRemaining??null)===reachedPickup.movementRemaining&&context.actorCarriesBall!==true&&
          check.threshold===event.metadata.difficulty&&check.baseTarget===event.metadata.requirement&&check.threshold===check.baseTarget+check.markerPlayerIds.length&&
          original.metadata.difficulty===check.threshold&&original.metadata.requirement===check.baseTarget&&
          mods.length===check.markerPlayerIds.length&&mods.every(m=>m===-1)&&event.metadata.modifiersSum===-mods.length&&JSON.stringify(original.metadata.modifiers)===JSON.stringify(mods)&&
          JSON.stringify(check.markerPlayerIds)===JSON.stringify(move.zonePenalty?.markers.map(m=>m.playerId)??[]),
          "Observed pickup after movement needs the adjacent owned Sure Hands chain, verified reached square, same fixed markers and unchanged post-move budget; no failed-alternative value is implied.");
      }
      const pickupResolution=event.metadata.pickupResolution;
      if(pickupResolution) require(!!successors && !!possession && event.actualSuccess === true &&
        pickupResolution.declarationSourceId === successors.declarationSourceId && pickupResolution.moveOutcomeSourceId === successors.moveOutcomeSourceId &&
        pickupResolution.cell.x === successors.origin.x && pickupResolution.cell.y === successors.origin.y &&
        pickupResolution.checkpointAfter === context?.checkpointAfter && pickupResolution.movementRemaining === (context?.actorMovementRemaining ?? null),
        "Observed pickup possession needs the successful committed Sure Hands chain and unchanged post-move budget.");
      const dodgeMove = event.metadata.dodgeMovement;
      const teamMove = event.metadata.teamRerollMovement;
      if(teamMove) {
        const question=sources.get(teamMove.questionSourceId),choice=sources.get(teamMove.decisionSourceId),declaration=sources.get(teamMove.declarationSourceId);
        const doMove=sources.get(teamMove.doMoveSourceId),outcome=sources.get(teamMove.outcomeSourceId);
        const own=(e:typeof event|undefined)=>e?.playerId===event.playerId&&e?.teamId===event.teamId;
        const resumed=(e:typeof event|undefined)=>own(e)&&e?.metadata.actionId===event.metadata.actionId&&e?.metadata.sequenceId===event.metadata.sequenceId;
        require(!!event.playerId&&event.scoringStatus==="scored"&&event.actualSuccess===true&&event.metadata.rollType===teamMove.rollType&&event.metadata.rerollResource==="team"&&event.metadata.rerollUsed===true&&event.metadata.teamRerollsSpent===1&&
          !event.metadata.rerollSkill&&!event.metadata.lonerGate&&!event.metadata.proGate&&event.metadata.rerollQuestionId===teamMove.questionSourceId&&event.metadata.rerollDecisionId===teamMove.decisionSourceId&&
          question?.metadata.sourceTag==="QuestionTeamRerollUsage"&&own(question)&&question.metadata.stepType===1&&question.metadata.isRollCandidate===false&&
          choice?.metadata.sourceTag==="ResultTeamRerollUsage"&&resumed(choice)&&choice.metadata.teamRerollDecision?.used===true&&choice.metadata.teamRerollDecision.gamerId===teamMove.gamerId&&
          declaration?.metadata.sourceTag==="ResultUseAction"&&own(declaration)&&declaration.metadata.actionCode===1&&declaration.metadata.stepType===0&&
          doMove?.metadata.sourceTag==="ResultDoMove"&&resumed(doMove)&&doMove.scoringStatus==="excluded"&&
          outcome?.metadata.sourceTag==="ResultMoveOutcome"&&resumed(outcome)&&outcome.scoringStatus==="excluded"&&
          event.metadata.sourceIndex!==undefined&&choice.metadata.sourceIndex===event.metadata.sourceIndex-1&&doMove.metadata.sourceIndex===event.metadata.sourceIndex+1&&outcome.metadata.sourceIndex===event.metadata.sourceIndex+2&&
          (declaration.metadata.sourceIndex??Infinity)<(question.metadata.sourceIndex??-1)&&(question.metadata.sourceIndex??Infinity)<choice.metadata.sourceIndex!&&
          teamMove.originalCheckpointAfter===context?.checkpointAfter&&context.activationId===teamMove.declarationSourceId&&
          teamMove.originalCheckpointAfter<=teamMove.checkpointAfter&&teamMove.checkpointAfter<choice.metadata.sourceIndex!&&
          (declaration.metadata.sourceIndex??-1)>teamMove.originalCheckpointAfter&&context.actorCell?.x===teamMove.from.x&&context.actorCell.y===teamMove.from.y&&
          Math.max(Math.abs(teamMove.to.x-teamMove.from.x),Math.abs(teamMove.to.y-teamMove.from.y))===1&&
          (teamMove.movementBefore===null?teamMove.movementAfter===null:
            teamMove.rollType===1?teamMove.movementBefore===0&&teamMove.movementAfter===0:
            teamMove.movementBefore>=1&&teamMove.movementAfter===teamMove.movementBefore-1),
          "Observed team-rerolled Rush/Dodge movement needs its original offer, owned ordinary declaration, committed direct replacement and adjacent confirmed move; fresh budget omissions stay unknown.");
      }
      if(teamMove) {
        const zone=teamMove.zonePenalty,mods=event.metadata.modifiers??[];
        require(zone ? teamMove.rollType===2 && event.metadata.requirement===zone.baseTarget &&
          event.metadata.difficulty===zone.baseTarget+zone.markers.length &&
          mods.length===zone.markers.length && mods.every(m=>m===-1) && event.metadata.modifiersSum===-mods.length &&
          new Set(zone.markers.map(m=>m.playerId)).size===zone.markers.length &&
          zone.markers.every(m=>m.playerId!==event.playerId&&Math.max(Math.abs(m.cell.x-teamMove.to.x),Math.abs(m.cell.y-teamMove.to.y))===1)
          : mods.length===0&&event.metadata.modifiersSum===0&&event.metadata.requirement===event.metadata.difficulty,
          "Observed team movement must reconcile its fixed opposing-zone penalty or its unmodified check.");
      }
      if (dodgeMove) {
        const declaration = sources.get(dodgeMove.declarationSourceId);
        const original = sources.get(event.metadata.rerollOriginalId ?? "");
        const skill = sources.get(event.metadata.rerollDecisionId ?? "");
        const doMove = sources.get(dodgeMove.doMoveSourceId);
        const outcome = sources.get(dodgeMove.outcomeSourceId);
        const sameMove = (e: typeof event | undefined, tag: string) => e?.metadata.sourceTag === tag &&
          e.playerId === event.playerId && e.teamId === event.teamId && e.metadata.actionId === event.metadata.actionId &&
          e.metadata.sequenceId === event.metadata.sequenceId;
        require(event.scoringStatus === "scored" && event.actualSuccess === true && event.metadata.rollType === 2 &&
          event.metadata.rerollSkill === "Dodge" && event.metadata.outcomeCode === 1 &&
          original?.metadata.outcomeCode === 0 && original.metadata.mergedRerollAnchorId === event.metadata.sourceId &&
          skill?.metadata.skillUsage?.skillId === 7 && skill.metadata.skillUsage.used &&
          sameMove(original,"ResultRoll") && sameMove(skill,"ResultSkillUsage") &&
          sameMove(doMove,"ResultDoMove") && sameMove(outcome,"ResultMoveOutcome") &&
          event.metadata.sourceIndex !== undefined && skill?.metadata.sourceIndex === event.metadata.sourceIndex - 1 &&
          original?.metadata.sourceIndex === event.metadata.sourceIndex - 2 &&
          doMove?.metadata.sourceIndex === event.metadata.sourceIndex + 1 && outcome?.metadata.sourceIndex === event.metadata.sourceIndex + 2 &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.metadata.actionCode === 1 && declaration.metadata.stepType === 0 &&
          declaration.playerId === event.playerId && declaration.teamId === event.teamId &&
          declaration.metadata.sourceIndex !== undefined && original?.metadata.sourceIndex !== undefined &&
          declaration.metadata.sourceIndex < original.metadata.sourceIndex &&
          context?.activationId === dodgeMove.declarationSourceId && context.checkpointAfter === dodgeMove.checkpointAfter &&
          context.actorCell?.x === dodgeMove.from.x && context.actorCell.y === dodgeMove.from.y &&
          context.actorCarriesBall === dodgeMove.carriesBall &&
          event.metadata.modifiers?.length === 0 && original?.metadata.modifiers?.length === 0 &&
          (!context.ordinaryMoveAvailability || (context.ordinaryMoveAvailability.successDestination.x === dodgeMove.to.x && context.ordinaryMoveAvailability.successDestination.y === dodgeMove.to.y)) &&
          (context.actorMovementRemaining ?? null) === dodgeMove.movementBefore &&
          Math.max(Math.abs(dodgeMove.from.x - dodgeMove.to.x),Math.abs(dodgeMove.from.y - dodgeMove.to.y)) === 1 &&
          dodgeMove.movementAfter === (dodgeMove.movementBefore === null ? null : dodgeMove.movementBefore - 1),
          "Observed Dodge movement needs its owned adjacent original/skill/replacement/move chain and current budget.");
      }
      if (context?.actorDodgeMoveSourceId) {
        const earlier = sources.get(context.actorDodgeMoveSourceId);
        const move = earlier?.metadata.dodgeMovement;
        const outcome = sources.get(move?.outcomeSourceId ?? "");
        require(!!move && earlier?.playerId === event.playerId && earlier.teamId === event.teamId &&
          move.declarationSourceId === context.activationId && move.checkpointAfter === context.checkpointAfter &&
          outcome?.metadata.sourceIndex !== undefined && event.metadata.sourceIndex !== undefined &&
          outcome.metadata.sourceIndex < event.metadata.sourceIndex,
          "Reconstructed movement must reference an earlier verified Dodge move in the same activation/frame.");
      }
      if (context?.actorPickupSourceId) {
        const pickup = sources.get(context.actorPickupSourceId);
        const index = pickup?.metadata.sourceIndex;
        require(
          context.actorCarriesBall === true &&
            context.activationId !== null &&
            context.actorCell !== null &&
            pickup?.metadata.rollType === 4 &&
            pickup.scoringStatus === "scored" &&
            pickup.actualSuccess === true &&
            pickup.playerId === event.playerId &&
            index !== undefined &&
            index > context.checkpointAfter &&
            event.metadata.sourceIndex !== undefined &&
            index < event.metadata.sourceIndex,
          "Reconstructed possession must link to the earlier successful pickup."
        );
      }
      const carrierMove = context?.teammateCarrierMove;
      const scoringAttempt = context?.scoringAttempt;
      if (scoringAttempt) {
        const from = context?.actorCell;
        const to = scoringAttempt.destination;
        const period = context?.period === "first_half" ? 1 : context?.period === "second_half" ? 2 : context?.period === "extra_time" ? 3 : null;
        const turns = scoringAttempt.turnsPerPeriod;
        const end = period !== null && turns !== null ? period * turns : null;
        require(
          (event.metadata.rollType === 1 || event.metadata.rollType === 2) &&
            context?.phaseCode === 5 &&
            context.activationId !== null &&
            context.actorCarriesBall === true &&
            !!from &&
            Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
            to.x === (scoringAttempt.sideCode === 32 ? 25 : 0) &&
            (scoringAttempt.turnsRemaining === null ||
              (end !== null &&
                scoringAttempt.teamTurn !== null &&
                turns !== null &&
                scoringAttempt.teamTurn > end - turns &&
                scoringAttempt.turnsRemaining === end - scoringAttempt.teamTurn)),
          "A scoring attempt requires a verified carrier move and its recorded side and clock."
        );
      }
      if (carrierMove) {
        const { carrierCell, destination, effect } = carrierMove;
        const distance = (a: typeof carrierCell, b: typeof carrierCell) =>
          Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        const from = context?.actorCell;
        require(
          event.metadata.rollType === 2 &&
            context?.movementCheckLinked === true &&
            context.activeTeamId === event.teamId &&
            context.actorCarriesBall === false &&
            !!from &&
            distance(from, destination) === 1 &&
            distance(from, carrierCell) === (effect === "approach" ? 2 : 1) &&
            distance(destination, carrierCell) === (effect === "approach" ? 1 : 2),
          "Carrier proximity requires a verified move across the adjacency boundary."
        );
      }
      const availability = context?.ordinaryMoveAvailability;
      if (availability) {
        const members=[...availability.knownAvailablePlayerIds,...availability.unknownPlayerIds];
        require(context?.movementCheckLinked === true && (event.metadata.rollType === 1 || event.metadata.rollType === 2) && context.actorCell !== null &&
          context.activeTeamId === event.teamId && Math.max(Math.abs(context.actorCell!.x-availability.successDestination.x),Math.abs(context.actorCell!.y-availability.successDestination.y)) === 1 &&
          members.length < 64 && new Set(members).size === members.length && !members.includes(event.playerId ?? "") &&
          context.otherUsefulActivations === (availability.unknownPlayerIds.length ? null : availability.knownAvailablePlayerIds.length),
          "Ordinary-move availability must describe the verified successful successor without duplicated or fabricated known counts.");
      }
      const continuation = context?.activeMoveContinuation;
      if(continuation) {
        const declaration=sources.get(continuation.declarationSourceId),success=context?.ordinaryMoveAvailability?.successDestination;
        const expected=continuationOptionBounds(continuation.movementBefore,continuation.opponentMarking);
        require(context?.actorCarriesBall === false && context.movementCheckLinked && context.activeTeamId === event.teamId && context.activationId === continuation.declarationSourceId &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.metadata.actionCode === 1 && declaration.metadata.stepType === 0 &&
          declaration.playerId === event.playerId && declaration.teamId === event.teamId &&
          (declaration.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1) &&
          !!success && Math.max(Math.abs(success.x-continuation.candidateDestination.x),Math.abs(success.y-continuation.candidateDestination.y)) === 1 &&
          continuation.movementAfterSuccess === (continuation.movementBefore === null ? null : Math.max(0,continuation.movementBefore-1)) &&
          continuation.minimum === expected.minimum && continuation.maximum === expected.maximum,
          "An active continuation requires the owned ordinary Move declaration, verified successor, recorded budget and marking bounds.");
      }
      const bound = event.contextualBounds;
      if (bound) {
        const keptDodge=bound.policy === "kept_dodge_terminal_moves";
        const keptRush=bound.policy === "kept_rush_terminal_moves";
        const rushStage=keptRush || bound.policy === "team_reroll_rush_moves";
        const teamStage=bound.policy === "team_reroll_rush_moves" || bound.policy === "team_reroll_terminal_moves";
        const expected=keptDodge ? estimateKeptDodgeMoveBounds(context,bound.successChance,bound.terminalCheckpointAfter ?? -1) : keptRush ? estimateKeptRushMoveBounds(context,bound.successChance,bound.terminalCheckpointAfter ?? -1) : teamStage ? (rushStage ? estimateTeamRushMoveBounds : estimateTeamDodgeMoveBounds)(context,event.actualSuccess === true,bound.successChance,bound.terminalCheckpointAfter ?? -1) :
          estimateDodgeImpactBounds(context,"dodge_skill_reroll",Number(event.actualSuccess)-bound.successChance,bound.successChance);
        if(teamStage) {
          const m=event.metadata,question=sources.get(m.rerollQuestionId ?? ""),choice=sources.get(m.rerollDecisionId ?? "");
          const original=z.strictObject({Die:z.strictObject({DieType:z.literal(0),Value:z.number().int().min(1).max(6)})}).safeParse(m.originalDice);
          require((!rushStage || (m.difficulty === 2 && event.actualSuccess === true && m.teamRerollMovement?.rollType === 1)) && m.rerollResource === "team" && m.rerollUsed === true && m.teamRerollsSpent === 1 &&
            !m.rerollSkill && !m.lonerGate && !m.proGate && !bound.activeContinuation &&
            (m.modifiers?.length ?? 0) === 0 && m.requirement === m.difficulty &&
            question?.metadata.sourceTag === "QuestionTeamRerollUsage" && question.metadata.stepType === 1 &&
            question.playerId === event.playerId && question.teamId === event.teamId &&
            question.metadata.rerollOffer?.canUseTeamReroll === true && question.metadata.rerollOffer.decisionSourceId === m.rerollDecisionId &&
            original.success && original.data.Die.Value < (m.difficulty ?? 0) &&
            bound.terminalCheckpointAfter !== undefined && (question.metadata.sourceIndex ?? Infinity)<=bound.terminalCheckpointAfter &&
            bound.terminalCheckpointAfter<(choice?.metadata.sourceIndex ?? -1) &&
            (!m.teamRerollMovement || m.teamRerollMovement.checkpointAfter === bound.terminalCheckpointAfter) &&
            choice?.metadata.sourceTag === "ResultTeamRerollUsage" && choice.metadata.teamRerollDecision?.used === true &&
            question.metadata.rerollOffer.gamerId === choice.metadata.teamRerollDecision.gamerId &&
            (question.metadata.sourceIndex ?? Infinity)<(choice.metadata.sourceIndex ?? -1) &&
            choice.playerId === event.playerId && choice.teamId === event.teamId &&
            choice.metadata.sourceIndex === (m.sourceIndex ?? -1)-1 &&
            (event.actualSuccess ? !!m.teamRerollMovement && !m.teamRerollMovement.zonePenalty :
              !!m.movementFall && !m.movementFall.combinedRushSourceId),
            "A conditional team movement component needs its committed direct replacement and confirmed move or self-fall/turnover, outside earlier dice, resources and ball value.");
        }
        require((teamStage || keptRush || keptDodge || bound.terminalCheckpointAfter === undefined) && event.scoringStatus === "scored" && event.metadata.rollType === (rushStage ? 1 : 2) && context?.activeTeamId === event.teamId &&
          event.contextualImpact === undefined && !!expected && bound.minimumMoves === expected.minimumMoves && bound.maximumMoves === expected.maximumMoves &&
          bound.activeContinuation?.minimum === ("activeContinuation" in expected ? expected.activeContinuation?.minimum : undefined) && bound.activeContinuation?.maximum === ("activeContinuation" in expected ? expected.activeContinuation?.maximum : undefined) &&
          near(bound.successChance,(7-(event.metadata.difficulty ?? 0))/6) && near(bound.lower,expected.lower) && near(bound.upper,expected.upper),
          "Partial ordinary-move bounds must reconcile with missing availability, the fixed policy and dice deviation, without a point estimate.");
      }
      if(bound?.policy === "kept_dodge_terminal_moves") {
        const m=event.metadata,question=sources.get(m.rerollQuestionId ?? ""),choice=sources.get(m.rerollDecisionId ?? ""),declaration=sources.get(context?.activationId ?? "");
        const original=z.strictObject({Die:z.strictObject({DieType:z.literal(0),Value:z.number().int().min(1).max(6)})}).safeParse(m.originalDice);
        require(event.scoringStatus==="scored" && event.actualSuccess===false && m.rollType===2 && m.stepType===1 && m.targetId==="-1" &&
          m.rerollUsed===false && m.teamRerollsSpent===0 && m.rerollResource===undefined && !m.rerollSkill && !m.lonerGate && !m.proGate && !bound.activeContinuation &&
          !!m.movementFall && !m.movementFall.combinedRushSourceId && !m.retainedRushContext && !m.teamRerollMovement &&
          m.requirement===m.difficulty && (m.modifiers?.length ?? 0)===0 && original.success &&
          m.dice?.length===1 && m.dieTypes?.length===1 && m.dieTypes[0]===0 && original.data.Die.Value===m.dice[0] && m.dice[0]!<(m.difficulty ?? 0) &&
          declaration?.metadata.sourceTag==="ResultUseAction" && declaration.metadata.actionCode===1 && declaration.metadata.stepType===0 && declaration.playerId===event.playerId && declaration.teamId===event.teamId &&
          (declaration.metadata.sourceIndex ?? Infinity)<(question?.metadata.sourceIndex ?? -1) &&
          question?.metadata.sourceTag==="QuestionTeamRerollUsage" && question.metadata.stepType===1 && question.metadata.targetId==="-1" && question.playerId===event.playerId && question.teamId===event.teamId &&
          question.metadata.rerollOffer?.canUseTeamReroll===true && question.metadata.rerollOffer.decisionSourceId===m.rerollDecisionId &&
          choice?.metadata.sourceTag==="ResultTeamRerollUsage" && choice.metadata.stepType===1 && choice.metadata.targetId==="-1" && choice.playerId===event.playerId && choice.teamId===event.teamId &&
          choice.metadata.teamRerollDecision?.used===false && choice.metadata.teamRerollDecision.gamerId===question.metadata.rerollOffer.gamerId &&
          bound.terminalCheckpointAfter===question.metadata.sourceIndex && choice.metadata.sourceIndex===bound.terminalCheckpointAfter!+3 && m.sourceIndex===bound.terminalCheckpointAfter!+4,
          "A retained original Dodge component needs an owned ordinary Move, fixed decline, identical original/kept die and unmodified terminal self-fall/turnover; it adds no replacement draw or point value.");
      }
      const keptRushProof=event.metadata.retainedRushContext;
      if(keptRushProof || bound?.policy === "kept_rush_terminal_moves") {
        const m=event.metadata,p=keptRushProof,question=sources.get(p?.questionSourceId ?? ""),choice=sources.get(p?.decisionSourceId ?? "");
        const declaration=sources.get(p?.declarationSourceId ?? ""),success=sources.get(p?.successRushSourceId ?? ""),move=sources.get(p?.doMoveSourceId ?? ""),outcome=sources.get(p?.moveOutcomeSourceId ?? "");
        const original=z.strictObject({Die:z.strictObject({DieType:z.literal(0),Value:z.literal(1)})}).safeParse(m.originalDice);
        const owns=(e:typeof event|undefined)=>!!e&&e.playerId===event.playerId&&e.teamId===event.teamId;
        require(!!p && bound?.policy === "kept_rush_terminal_moves" && event.scoringStatus === "scored" && event.actualSuccess === false &&
          m.rollType===1 && m.stepType===1 && m.targetId==="-1" && m.rerollUsed===false && m.teamRerollsSpent===0 &&
          m.rerollResource===undefined && !m.rerollSkill && !m.lonerGate && !m.proGate && !bound.activeContinuation &&
          !!m.movementFall && !m.movementFall.combinedRushSourceId && !m.teamRerollMovement &&
          m.difficulty===2 && m.requirement===2 && (m.modifiers?.length ?? 0)===0 && original.success &&
          m.dice?.length===1 && m.dice[0]===1 && m.dieTypes?.length===1 && m.dieTypes[0]===0 && near(event.probabilitySuccess ?? 0,5/6) &&
          context?.checkpointAfter===p.resumeCheckpointAfter && context.actorCarriesBall===false && context.activeTeamId===event.teamId &&
          context.actorCell?.x===p.via.x && context.actorCell.y===p.via.y &&
          context.ordinaryMoveAvailability?.successDestination.x===p.destination.x && context.ordinaryMoveAvailability.successDestination.y===p.destination.y &&
          Math.max(Math.abs(p.from.x-p.via.x),Math.abs(p.from.y-p.via.y))===1 &&
          Math.max(Math.abs(p.via.x-p.destination.x),Math.abs(p.via.y-p.destination.y))===1 &&
          declaration?.metadata.sourceTag==="ResultUseAction" && declaration.metadata.actionCode===1 && declaration.metadata.stepType===0 && owns(declaration) &&
          p.declarationCheckpointAfter<(declaration.metadata.sourceIndex ?? -1) && (declaration.metadata.sourceIndex ?? Infinity)<p.resumeCheckpointAfter &&
          success?.metadata.sourceTag==="ResultRoll" && success.metadata.rollType===1 && success.scoringStatus==="scored" && success.actualSuccess===true && owns(success) &&
          success.metadata.requirement===2 && success.metadata.difficulty===2 && (success.metadata.modifiers?.length ?? 0)===0 &&
          success.metadata.dice?.length===1 && success.metadata.dieTypes?.[0]===0 && success.metadata.dice[0]!>=2 &&
          near(success.probabilitySuccess ?? 0,5/6) && success.metadata.rerollResource===undefined &&
          question?.metadata.sourceTag==="QuestionTeamRerollUsage" && question.metadata.stepType===1 && question.metadata.targetId==="-1" && question.metadata.rerollOffer?.canUseTeamReroll===true && owns(question) &&
          choice?.metadata.sourceTag==="ResultTeamRerollUsage" && choice.metadata.stepType===1 && choice.metadata.targetId==="-1" && choice.metadata.teamRerollDecision?.used===false && owns(choice) &&
          question.metadata.rerollOffer.gamerId===choice.metadata.teamRerollDecision.gamerId &&
          question.metadata.rerollOffer.decisionSourceId===p.decisionSourceId && m.rerollQuestionId===p.questionSourceId && m.rerollDecisionId===p.decisionSourceId &&
          move?.metadata.sourceTag==="ResultDoMove" && outcome?.metadata.sourceTag==="ResultMoveOutcome" && [move,outcome].every(e=>owns(e)&&e!.scoringStatus==="excluded"&&e!.metadata.isRollCandidate===false&&e!.metadata.actionId===success.metadata.actionId) &&
          success.metadata.sequenceId===question.metadata.sequenceId && success.metadata.actionId!==question.metadata.actionId && success.metadata.stepType===1 && success.metadata.targetId==="-1" && success.metadata.sequenceId!==m.sequenceId &&
          success.metadata.sourceIndex===p.resumeCheckpointAfter+3 && move.metadata.sourceIndex===p.resumeCheckpointAfter+4 && outcome.metadata.sourceIndex===p.resumeCheckpointAfter+5 &&
          question.metadata.sourceIndex===p.resumeCheckpointAfter+7 && p.waitingCheckpointAfter===question.metadata.sourceIndex &&
          choice.metadata.sourceIndex===p.waitingCheckpointAfter+3 && m.sourceIndex===p.waitingCheckpointAfter+4 &&
          bound.terminalCheckpointAfter===p.waitingCheckpointAfter,
          "A retained original Rush component needs its ordinary declaration, deterministic checkpoint prefix, adjacent fresh Rush movement, fixed decline, identical kept die and verified self-fall/turnover; it adds no replacement draw, resource cost or point value.");
      }
      if (
        bound?.policy === "dodge_skill_reroll" || continuation || dodgeMove || event.contextualImpact?.policy === "dodge_skill_reroll"
      ) {
        const original=event.metadata.rerollOriginalId ? sources.get(event.metadata.rerollOriginalId) : undefined;
        const use=event.metadata.rerollDecisionId ? sources.get(event.metadata.rerollDecisionId) : undefined;
        const target = event.metadata.difficulty;
        require((!continuation || (sources.get(continuation.declarationSourceId)?.metadata.sourceIndex ?? Infinity)<(original?.metadata.sourceIndex ?? -1)) && event.metadata.rollType === 2 && event.metadata.rerollResource === "skill" && event.metadata.rerollSkill === "Dodge" && event.metadata.teamRerollsSpent === 0 &&
          original?.metadata.sourceTag === "ResultRoll" && original.metadata.rollType === 2 && original.playerId === event.playerId && original.teamId === event.teamId &&
          original.metadata.outcomeCode === 0 && original.metadata.mergedRerollAnchorId === event.metadata.sourceId &&
          original.metadata.difficulty === target && original.metadata.requirement === event.metadata.requirement &&
          JSON.stringify(original.metadata.modifiers) === JSON.stringify(event.metadata.modifiers) &&
          original.metadata.dice?.length === 1 && original.metadata.dieTypes?.length === 1 && original.metadata.dieTypes[0] === 0 &&
          Number.isInteger(original.metadata.dice[0]) && original.metadata.dice[0]!>=1 &&
          event.metadata.dice?.length === 1 && event.metadata.dieTypes?.length === 1 && event.metadata.dieTypes[0] === 0 &&
          Number.isInteger(event.metadata.dice[0]) && event.metadata.dice[0]!>=1 && event.metadata.dice[0]!<=6 &&
          event.actualSuccess === event.metadata.dice[0]! >= (target ?? 0) &&
          typeof target === "number" &&
          Number.isInteger(target) &&
          target >= 2 &&
          target <= 6 &&
          original.metadata.dice[0]! < target &&
          use?.metadata.sourceTag === "ResultSkillUsage" &&
          use.metadata.skillUsage?.skillId === 7 &&
          use.metadata.skillUsage.used &&
          use.playerId === event.playerId &&
          use.teamId === event.teamId &&
          use.metadata.actionId === event.metadata.actionId &&
          original.metadata.actionId === event.metadata.actionId &&
          (original.metadata.sourceIndex ?? Infinity)<(use.metadata.sourceIndex ?? -1) &&
          (use.metadata.sourceIndex ?? Infinity)<(event.metadata.sourceIndex ?? -1) &&
          event.probabilitySuccess !== null &&
          near(
            event.probabilitySuccess,
            1 - ((target - 1) / 6) ** 2
          ), "A Dodge-skill context policy requires the owned committed reroll, original failed die and two-attempt odds.");
      }
      const impact = event.contextualImpact;
      if (impact) {
        require(event.scoringStatus === "scored" &&
          !!context &&
          context.activeTeamId === event.teamId &&
          (event.type === "dodge" ||
            event.type ===
              "ball_handling"), "Context requires a scored roll and verified pre-roll ownership.");
        const expectedDeviation=impact.policy === "dodge_skill_reroll" ? Number(event.actualSuccess)-(7-(event.metadata.difficulty ?? 0))/6 : event.delta;
        require(near(impact.deviation,expectedDeviation), "Context deviation must use its stated whole-check or conditional terminal-die scope.");
        const expected=estimateNumericImpact(context,event.metadata.rollType,impact.policy,expectedDeviation);
        require(!!expected && near(impact.components.availableMoves,expected.components.availableMoves) && near(impact.components.possession,expected.components.possession) && near(impact.components.markedBounce,expected.components.markedBounce) && impact.components.activeContinuation === expected.components.activeContinuation, "Point context requires complete supported successor components.");
        require(near(
          impact.difference,
          Object.values(impact.components).filter((value):value is number=>typeof value === "number").reduce((a, b) => a + b, 0)
        ) &&
          near(
            impact.contribution,
            impact.deviation * impact.difference
          ), "Contextual contribution must reconcile with its components.");
      }
      const block = event.metadata.block;
      const damage = event.metadata.damage;
      const touchdown = event.metadata.movementTouchdown;
      if (touchdown) {
        const { locator, sourceIndex, rollType } = event.metadata;
        const from = context?.actorCell;
        const to = touchdown.destination;
        const recorded = touchdown.recordedCell;
        require(
          event.scoringStatus === "scored" &&
            event.actualSuccess === true &&
            (rollType === 1 || rollType === 2) &&
            context?.actorCarriesBall === true &&
            !!from &&
            Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
            (to.x === 0 || to.x === 25) &&
            (recorded.x === null || recorded.x === to.x) &&
            (recorded.y === null || recorded.y === to.y) &&
            (recorded.x !== null || recorded.y !== null) &&
            locator?.replayStep !== undefined &&
            locator.childIndex !== undefined &&
            touchdown.childIndex === locator.childIndex + 1 &&
            sourceIndex !== undefined &&
            touchdown.sourceIndex === sourceIndex + 4 &&
            touchdown.sourceIndex <= report.coverage.sourceRecordCount,
          "Touchdown evidence requires the same carrier's successful move to the end zone."
        );
      }
      if (event.metadata.blockSelection) require(event.metadata.sourceTag === "ResultBlockRoll" && !event.metadata.isRollCandidate && event.scoringStatus === "excluded", "An observed selected block face is a deterministic summary of a linked pool.");
      const injuryObservation=event.metadata.injuryObservation;
      if(injuryObservation)require(event.type === "injury" && event.scoringStatus === "excluded" && event.metadata.isRollCandidate === true &&
        event.probabilitySuccess === null && event.actualSuccess === null && event.delta === 0 && event.weightedDelta === 0 &&
        !event.contextualImpact && !event.contextualBounds && !event.possessionBounds && !event.catchPossessionBounds &&
        event.metadata.rollType === 11 && event.metadata.stepType === 2 && event.playerId === injuryObservation.subjectId && event.teamId === injuryObservation.subjectTeamId &&
        teamIds.has(event.teamId) && event.metadata.targetId === event.playerId && !!event.metadata.actionId && !!event.metadata.sequenceId &&
        event.metadata.sourceIndex !== undefined && injuryObservation.damageStepSourceIndex < event.metadata.sourceIndex &&
        event.metadata.dice?.length === 2 && event.metadata.dice.every(d=>Number.isInteger(d)&&d>=1&&d<=6) && event.metadata.dieTypes?.join() === "0,0" &&
        directInjuryOutcome(event.metadata.outcomeCode) === injuryObservation.outcome && !event.metadata.embeddedDamageOriginalId && !event.metadata.mergedRerollAnchorId &&
        (injuryObservation.recordKind === "direct" ? event.metadata.sourceTag === "ResultInjuryRoll" : event.metadata.sourceTag === "QuestionKORecovery" && injuryObservation.outcome === "ko") &&
        event.metadata.damage?.observedInjury === true && event.metadata.damage.sourceCode === injuryObservation.sourceCode,
        "A recorded injury outcome needs its supported direct/embedded source namespace, uniquely affected player, ordered damage step and two D6; it supplies no odds, final posture or luck contribution.");
      if(event.metadata.blockCrowd)
        require(validReportedBlockCrowd(event,sources,report.coverage.sourceRecordCount),"Crowd damage requires one direct defender push, ordered removal/injury stages, confirmed off-pitch observation and no invented odds or armor.");
      if (event.metadata.crowdPush || event.metadata.crowdRemoval)
        require(event.scoringStatus === "excluded" && !event.metadata.isRollCandidate &&
          report.events.some((pool) => {
            const c = pool.metadata.blockCrowd;
            return (
              !!c && (event.metadata.crowdPush ? c.pushSourceId === event.metadata.sourceId :
            c.initialRemovalSourceId === event.metadata.sourceId || c.finalRemovalSourceId === event.metadata.sourceId)
            );
          }), "Crowd push/removal receipts must be referenced non-random evidence, not extra outcomes.");
      if(event.metadata.damage?.observedInjury)
        require(!!event.metadata.injuryObservation && event.metadata.rollType === 11 && !event.metadata.damage.regeneration && !event.metadata.damage.koRecovery,
          "Observed injury subject evidence must retain its own categorical observation, without a recovery or binary-odds claim.");
      if(event.metadata.damage?.crowd) {
        const pool=sources.get(event.metadata.damage.crowd.poolSourceId);
        require(pool?.metadata.blockCrowd?.injurySourceId === event.metadata.sourceId && event.scoringStatus === "excluded" && event.metadata.isRollCandidate === true &&
          event.metadata.sourceTag === "ResultInjuryRoll" && event.metadata.rollType === 11 && event.metadata.damage.sourceCode === 2 &&
          !event.metadata.damage.regeneration && !event.metadata.damage.koRecovery,
          "An unscored crowd injury anchor needs its own verified block chain and retains unknown odds.");
      }
      const blockAftermath = event.metadata.blockResolution;
      if (blockAftermath) {
        const block = event.metadata.block;
        const selection = block?.selectedSourceId ? sources.get(block.selectedSourceId) : undefined;
        const final = block?.finalSourceId ? sources.get(block.finalSourceId) : undefined;
        const skills = blockAftermath.skillSourceIds.flatMap(id => {
          const use = sources.get(id);
          return use?.playerId && use.metadata.skillUsage ? [{sourceId:id,playerId:use.playerId,skillId:use.metadata.skillUsage.skillId}] : [];
        });
        require(!linkedBlockFinals.has(block?.finalSourceId ?? "") && block !== undefined && block.pool.faces.includes(block.selectedFace!) && event.teamId !== "unresolved" && block.selectedFace !== undefined && block.finalOutcome !== undefined &&
          blockOutcomeName(block.finalOutcome) === blockAftermath.outcome && block.selectedOutcome === block.finalOutcome &&
          selection?.metadata.sourceTag === "ResultBlockRoll" && selection.playerId === block.attackerId && selection.metadata.targetId === block.defenderId && selection.metadata.blockSelection?.face === block.selectedFace && selection.metadata.outcomeCode === block.finalOutcome && final?.metadata.sourceTag === "ResultBlockOutcome" &&
          final.metadata.outcomeCode === block.finalOutcome && final.playerId === block.attackerId && final.metadata.targetId === block.defenderId &&
          (event.metadata.sourceIndex ?? Infinity) < (selection?.metadata.sourceIndex ?? -1) &&
          (selection?.metadata.sourceIndex ?? Infinity) < (final?.metadata.sourceIndex ?? -1) &&
          skills.length === blockAftermath.skillSourceIds.length && new Set(blockAftermath.skillSourceIds).size === skills.length &&
          skills.every((skill) => {
            const use = sources.get(skill.sourceId)!;
            return (
              use.metadata.sourceTag === "ResultSkillUsage" && use.metadata.skillUsage?.used && teamIds.has(use.teamId) &&
              (skill.playerId === block.attackerId ? use.teamId === event.teamId : skill.playerId === block.defenderId && use.teamId !== event.teamId) &&
              use.metadata.stepType === 6 && use.metadata.actionId === selection?.metadata.actionId &&
              (event.metadata.sourceIndex ?? Infinity) < (use.metadata.sourceIndex ?? -1) && (use.metadata.sourceIndex ?? Infinity) < (selection?.metadata.sourceIndex ?? -1)
            );
          }) &&
          consistentBlockResolution(block.selectedFace, block.finalOutcome, block.attackerId, block.defenderId, skills), "Block consequences require their own ordered selected face, participant skill uses and applied outcome.");
        if (block && final) {
          linkedBlockFinals.add(block.finalSourceId!);
          const subjects = knockedDownSubjects(blockAftermath.outcome,block.attackerId,block.defenderId);
          const linked = blockAftermath.damageActionIds.flatMap(id => damageByAction.has(id) ? [damageByAction.get(id)!] : []);
          require(linked.length === blockAftermath.damageActionIds.length && new Set(blockAftermath.damageActionIds).size === linked.length &&
            new Set(linked.map(step=>step.playerId)).size === linked.length &&
            linked.every(
              (step) =>
                !linkedDamageActions.has(step.actionId) && (subjects.includes(step.playerId) || (event.metadata.blockCrowd?.damageActionId === step.actionId && event.metadata.blockCrowd.subjectId === step.playerId)) &&
              (step.playerId === block.attackerId ? step.teamId === event.teamId : step.teamId !== event.teamId && teamIds.has(step.teamId)) &&
              step.eventIds.some(id=>ids.get(id)?.metadata.damage?.sourceCode === (event.metadata.blockCrowd?.damageActionId === step.actionId ? 2 : 1)) &&
                step.eventIds.every((id) => {
                  const damage = ids.get(id)!;
                  return (
                    damage.metadata.sequenceId === final.metadata.sequenceId &&
                  damage.metadata.locator?.replayStep === final.metadata.locator?.replayStep &&
                  damage.metadata.locator?.stepIndex !== undefined && final.metadata.locator?.stepIndex !== undefined &&
                  damage.metadata.locator.stepIndex > final.metadata.locator.stepIndex && damage.metadata.locator.stepIndex <= final.metadata.locator.stepIndex + 2 &&
                  (damage.metadata.sourceIndex ?? -1) > (final.metadata.sourceIndex ?? Infinity)
                  );
                })
            ), "Block damage must retain the knocked-down subject, adjacent block-source damage step and original team perspective.");
          for (const step of linked) linkedDamageActions.add(step.actionId);
          const expected = summarizeBlockConsequence(event,linked);
          require(blockAftermath.unscoredDamageRolls === expected.unscoredDamageRolls &&
            Object.keys(blockAftermath.diceByTeam).length === Object.keys(expected.diceByTeam).length &&
            Object.entries(expected.diceByTeam).every(([team,total])=>near(blockAftermath.diceByTeam[team] ?? NaN,total)),
            "Block subtotals reference the terminal pool and existing damage contributions once per team.");
        }
      }
      const fall = event.metadata.movementFall;
      if (fall) {
        const step = damageByAction.get(fall.damageActionId);
        const { locator, rollType, sourceIndex } = event.metadata;
        require(
          !linkedDamageActions.has(fall.damageActionId) &&
            event.scoringStatus === "scored" &&
            event.actualSuccess === false &&
            event.metadata.sourceTag === "ResultRoll" &&
            (rollType === 1 || rollType === 2) &&
            step?.playerId === event.playerId &&
            step?.teamId === event.teamId &&
            sourceIndex !== undefined &&
            fall.moveOutcomeSourceIndex === sourceIndex + 2 &&
            locator?.replayStep !== undefined &&
            locator.childIndex !== undefined &&
            locator.stepIndex !== undefined &&
            fall.turnoverChildIndex === locator.childIndex + 1 &&
            fall.turnoverSourceIndex <= report.coverage.sourceRecordCount,
          "A movement fall requires one failed Rush or Dodge and a linked turnover."
        );
        linkedDamageActions.add(fall.damageActionId);
        if (step) {
          const rush=fall.combinedRushSourceId?sources.get(fall.combinedRushSourceId):undefined;
          if(fall.combinedRushSourceId)require(rollType===2&&rush?.scoringStatus==="scored"&&rush.actualSuccess===true&&rush.metadata.rollType===1&&rush.playerId===event.playerId&&rush.teamId===event.teamId&&
            rush.metadata.actionId===event.metadata.actionId&&rush.metadata.sequenceId===event.metadata.sequenceId&&rush.metadata.sourceIndex===(sourceIndex??-1)-1&&
            !rush.metadata.rerollUsed&&!rush.metadata.rerollSkill&&!event.metadata.rerollUsed&&!event.metadata.rerollSkill,
            "A combined fall subtotal must reference the immediately preceding successful fresh Rush of the same actor, separately from the failed Dodge and self-damage.");
          const expected = summarizeMovementFall(event, step, ids,rush);
          require(
            near(fall.diceContribution, expected.diceContribution) &&
              fall.armorHeld === expected.armorHeld &&
              fall.unscoredDamageRolls === expected.unscoredDamageRolls &&
              fall.playerRemoved === expected.playerRemoved &&
              step.eventIds.every((id) => {
                const e = ids.get(id)!;
                const location = e.metadata.locator;
                const index = e.metadata.sourceIndex;
                return (
                  e.turn === event.turn &&
                  location?.replayStep === locator?.replayStep &&
                  location?.childIndex === locator?.childIndex &&
                  location?.stepIndex === (locator?.stepIndex ?? -1) + 1 &&
                  index !== undefined &&
                  index > fall.moveOutcomeSourceIndex &&
                  index < fall.turnoverSourceIndex &&
                  (!e.metadata.damage ||
                    e.metadata.damage.sourceCode === (rollType === 1 ? 9 : 0))
                );
              }),
            "Movement-fall evidence and subtotal must match the following damage step."
          );
        }
      }
      if (block) {
        require(event.type === "block" &&
          teamIds.has(block.defenderTeamId) &&
          block.defenderTeamId !== event.teamId &&
          block.chooserTeamId ===
            (block.pool.attackerChooses
              ? event.teamId
              : block.defenderTeamId), "Block roles must use opposing verified teams.");
        if (block.traitEvidence) {
          const {attacker,defender}=block.traitEvidence;
          for (const proof of [attacker,defender]) require(proof.observedCheckpointAfter<=proof.currentCheckpointAfter && proof.prayersCheckpointAfter<=proof.currentCheckpointAfter && proof.currentCheckpointAfter<(event.metadata.sourceIndex ?? -1) && proof.traits.dataPlayerId!==null && String(proof.traits.dataPlayerId)===proof.playerId && proof.traits.playerTypeId!==null && proof.traits.innateSkills!==null && proof.traits.acquiredSkills!==null && [proof.traits.innateSkills,proof.traits.acquiredSkills].every(a=>new Set(a).size===a.length), "Continued intrinsic traits require complete owned identity, bounded unique lists and ordered source checkpoints.");
          require(attacker.playerId===block.attackerId && attacker.teamId===event.teamId && defender.playerId===block.defenderId && defender.teamId===block.defenderTeamId && attacker.rosterIndex!==defender.rosterIndex && attacker.currentCheckpointAfter===defender.currentCheckpointAfter, "Block trait evidence must describe its two opposing current roster instances.");
          const expected=enumerateSkillBlock(block.pool,block.traitEvidence,block.skillModel?.wrestlePolicy);
          require(Boolean(expected)===Boolean(block.skillModel), "Supported block skill evidence requires its separate fixed-policy distribution; unsupported skills cannot fabricate a model.");
          if (expected && block.skillModel) require(JSON.stringify(block.skillModel.traitEvidence)===JSON.stringify(block.traitEvidence) && block.skillModel.faceOutcomes.every((x,i)=>x===expected.faceOutcomes[i]) && block.skillModel.outcomeDistribution.every((x,i)=>near(x,expected.outcomeDistribution[i]!)) && block.skillModel.poolOutcome===expected.poolOutcome && block.skillModel.poolValue===expected.poolValue && near(block.skillModel.expectedValue,expected.expectedValue) && near(block.skillModel.positiveChance,expected.positiveChance), "A block skill distribution must reconcile fair faces/fresh indices, both current skill lists and the explicit choice policy.");
        } else require(!block.skillModel, "A block skill model requires owned current trait evidence.");
        require(block.pool.faces.length === block.pool.outcomes.length &&
          new Set(block.pool.rolledIndexes).size ===
            block.pool.rolledIndexes.length &&
          block.pool.rolledIndexes.every((i) => i < block.pool.faces.length) &&
          near(
            block.distribution.reduce((sum, n) => sum + n, 0),
            1
          ), "Block probabilities and fresh indices must reconcile.");
        require((block.selectedFace === undefined) ===
          (block.selectedOutcome === undefined) &&
          (block.finalOutcome === undefined) ===
            (block.finalSourceId ===
              undefined), "Selected and applied block outcomes require their corresponding evidence.");
        if (block.selectedSourceId) {
          const selected = sources.get(block.selectedSourceId);
          require(selected?.metadata.sourceTag === "ResultBlockRoll" &&
            selected.playerId === block.attackerId &&
            selected.metadata.targetId === block.defenderId &&
            selected.metadata.dice?.[0] === block.selectedFace &&
            selected.metadata.outcomeCode ===
              block.selectedOutcome, "Block selection must match its observed source.");
        }
        if (block.finalSourceId) {
          const final = sources.get(block.finalSourceId);
          require(final?.metadata.sourceTag === "ResultBlockOutcome" &&
            final.playerId === block.attackerId &&
            final.metadata.targetId === block.defenderId &&
            final.metadata.outcomeCode ===
              block.finalOutcome, "Applied block outcomes must match their observed source.");
        }
        if (block.reroll === "pro") {
          const gate = block.proGateSourceId
            ? sources.get(block.proGateSourceId)
            : undefined;
          const previous = block.previousPoolSourceId
            ? sources.get(block.previousPoolSourceId)
            : undefined;
          const index = block.pool.rolledIndexes[0];
          const prior = previous?.metadata.block;
          require(!!gate &&
            gate.metadata.proGate?.passed === true &&
            gate.playerId === block.attackerId &&
            gate.teamId === event.teamId &&
            prior?.attackerId === block.attackerId &&
            prior?.defenderId === block.defenderId &&
            prior?.pool.attackerChooses === block.pool.attackerChooses &&
            block.pool.rolledIndexes.length === 1 &&
            index !== undefined &&
            prior?.pool.proEligibleIndexes?.includes(index) === true &&
            prior.pool.faces.length === block.pool.faces.length &&
            block.pool.faces.every(
              (face, i) => i === index || face === prior.pool.faces[i]
            ), "Pro replacement odds require the passed gate and the unchanged kept dice.");
        }
        if (block.reroll === "loner") {
          const expected = enumerateBlockPool(block.pool);
          require(block.distribution.every((p,i)=>near(p,expected.distribution[i]!)) && block.rankedSymbol === expected.favoredSymbol,
            "A conditional Loner pool must use the fair fresh block-dice distribution.");
          require(block.pool.sourceId === event.metadata.sourceId, "A conditional pool must refer to its own fresh source.");
          const gate = block.lonerGateSourceId ? sources.get(block.lonerGateSourceId) : undefined;
          const previous = block.previousPoolSourceId ? sources.get(block.previousPoolSourceId) : undefined;
          const prior = previous?.metadata.block;
          require(gate?.metadata.lonerGate?.passed === true && gate.playerId === block.attackerId && gate.teamId === event.teamId &&
            gate.metadata.targetId === block.defenderId && prior?.attackerId === block.attackerId && prior.defenderId === block.defenderId &&
            prior.pool.faces.length === block.pool.faces.length && prior.pool.attackerChooses === block.pool.attackerChooses &&
            block.pool.rolledIndexes.length === block.pool.faces.length && !block.proGateSourceId &&
            (previous?.metadata.sourceIndex ?? Infinity) < (gate.metadata.sourceIndex ?? -1) &&
            (gate.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1),
            "A conditional Loner pool requires the passed gate, prior pool and newly rolled full pool in order.");
        } else require(!block.lonerGateSourceId, "Only a conditional Loner pool can claim a Loner gate.");
        if (event.scoringStatus === "scored")
          require(event.probabilitySuccess !== null &&
            near(
              event.probabilitySuccess,
              block.distribution[3]! + block.distribution[4]!
            ) &&
            event.actualSuccess ===
              block.rankedSymbol >=
                3, "Block chance and outcome must agree with the raw symbol contract.");
      }
      if (damage) {
        require(event.type ===
          (damage.regeneration || damage.koRecovery || damage.crowd || damage.observedInjury
            ? "injury"
            : "armor_break") &&
          damage.subjectId === event.playerId &&
          damage.chainActionId === event.metadata.actionId &&
          damage.subjectTeamId ===
            event.teamId, "Damage checks use the affected player's perspective.");
        if (damage.regeneration) {
          const casualty = sources.get(damage.regeneration.casualtySourceId);
          const removal = sources.get(
            damage.regeneration.initialRemovalSourceId
          );
          require(event.metadata.rollType === 46 &&
            event.probabilitySuccess === 1 / 2 &&
            damage.chainActionId === event.metadata.actionId &&
            casualty?.metadata.sourceTag === "ResultCasualtyRoll" &&
            casualty.metadata.actionId === damage.chainActionId &&
            removal?.metadata.sourceTag === "ResultPlayerRemoval" &&
            removal.metadata.actionId ===
              damage.chainActionId, "Regeneration requires linked casualty and removal evidence.");
        }
        if (damage.koRecovery) {
          const { target } = damage.koRecovery;
          const {
            sourceTag,
            rollType,
            dice,
            outcomeCode,
            locator,
            difficulty
          } = event.metadata;
          require(!damage.regeneration &&
            sourceTag === "EventRoll" &&
            rollType === 13 &&
            locator?.replayStep !== undefined &&
            locator.childIndex !== undefined &&
            difficulty === target &&
            event.metadata.requirement === 4 &&
            event.metadata.modifiersSum === 4 - target &&
            dice?.length === 1 &&
            Number.isInteger(dice[0]) &&
            dice[0]! >= 1 &&
            dice[0]! <= 6 &&
            event.probabilitySuccess === (7 - target) / 6 &&
            event.actualSuccess === dice[0]! >= target &&
            outcomeCode ===
              (event.actualSuccess
                ? 1
                : undefined), "KO recovery must match its direct source and verified target.");
        }
      }
      const apothecary = event.metadata.apothecary;
      if (event.metadata.ballTravel) {
        const { from, to } = event.metadata.ballTravel;
        require(event.metadata.sourceTag === "ResultRoll" &&
          event.metadata.rollType === 25 && event.scoringStatus === "excluded" &&
          event.metadata.dice?.length === 1 &&
          event.metadata.dieTypes?.[0] === 1 &&
          Number.isInteger(event.metadata.dice[0]) &&
          event.metadata.dice[0]! >= 1 && event.metadata.dice[0]! <= 8 &&
          observedBounceDirection(event.metadata.dice[0], from, to),
          "Observed bounce travel requires the recorded D8 direction and adjacent cells.");
      }
      if (event.metadata.ballCatchCell)
        require(event.scoringStatus === "scored" && event.metadata.rollType === 7 &&
          event.metadata.sourceTag === "ResultRoll" && event.playerId !== undefined,
          "A catch landing requires a verified recorded catch check.");
      const ballChain = event.metadata.pickupBallChain;
      if (ballChain) {
        const bounces = ballChain.bounceSourceIds.map((id) => sources.get(id));
        const catches = ballChain.catchEventIds.map((id) => ids.get(id));
        const contributions: Record<string, number> = { [event.teamId]: event.weightedDelta };
        require(event.scoringStatus === "scored" && event.actualSuccess === false &&
          event.metadata.rollType === 4 &&
          bounces[0]?.metadata.sequenceId === event.metadata.sequenceId &&
          bounces[0]?.metadata.locator?.stepIndex === (event.metadata.locator?.stepIndex ?? -2) + 1 &&
          new Set(ballChain.bounceSourceIds).size === bounces.length &&
          new Set(ballChain.catchEventIds).size === catches.length &&
          catches.length <= bounces.length && bounces.length <= catches.length + 1 &&
          bounces.every(
            (bounce, index) =>
              bounce?.metadata.ballTravel &&
            bounce.metadata.sourceIndex !== undefined &&
              bounce.metadata.sourceIndex >
                (index
                  ? (bounces[index - 1]?.metadata.sourceIndex ?? Infinity)
                  : (event.metadata.sourceIndex ?? Infinity))
          ), "Pickup ball chains require ordered, unique observed bounces after the failed check.");
        for (const [index, caught] of catches.entries()) {
          const bounce = bounces[index];
          const next = bounces[index + 1];
          const landing = bounce?.metadata.ballTravel?.to;
          const catchCell = caught?.metadata.ballCatchCell;
          require(!!caught && !linkedBallCatches.has(caught.id) &&
            caught.scoringStatus === "scored" && caught.metadata.rollType === 7 &&
            caught.metadata.sourceIndex !== undefined &&
            caught.metadata.sourceIndex > (bounce?.metadata.sourceIndex ?? Infinity) &&
            (!next || (caught.actualSuccess === false &&
              caught.metadata.sourceIndex < (next.metadata.sourceIndex ?? -1) &&
              next.metadata.ballTravel?.from.x === landing?.x &&
              next.metadata.ballTravel?.from.y === landing?.y)) &&
            !!catchCell && !!landing && catchCell.x === landing.x && catchCell.y === landing.y,
            "A linked catch must follow its landing, precede another bounce only on failure, and count once.");
          if (caught) {
            linkedBallCatches.add(caught.id);
            contributions[caught.teamId] = (contributions[caught.teamId] ?? 0) + caught.weightedDelta;
          }
        }
        const last = bounces.at(-1)?.metadata.ballTravel?.to;
        require(!!last && last.x === ballChain.endingCell.x && last.y === ballChain.endingCell.y &&
          Object.keys(contributions).length === Object.keys(ballChain.diceByTeam).length &&
          Object.entries(contributions).every(([team, subtotal]) => near(subtotal, ballChain.diceByTeam[team] ?? NaN)),
          "Pickup-chain subtotals must reference the existing contributions by team and final landing.");
      }
      if (event.metadata.embeddedDamageOriginalId) {
        const original = sources.get(event.metadata.embeddedDamageOriginalId);
        require(
          event.metadata.sourceTag === "QuestionKORecovery" &&
            !event.metadata.isRollCandidate && event.scoringStatus === "excluded" &&
            original?.metadata.isRollCandidate === true &&
            original.metadata.actionId === event.metadata.actionId &&
            original.playerId === event.playerId && original.teamId === event.teamId &&
            original.metadata.rollType === 11 && event.metadata.rollType === 11 &&
            original.metadata.outcomeCode === event.metadata.outcomeCode &&
            JSON.stringify(original.metadata.dice) === JSON.stringify(event.metadata.dice),
          "Copied staff-question injury dice require their original damage-step evidence."
        );
      }
      if (apothecary) {
        const original = sources.get(apothecary.originalSourceId);
        const replacement = apothecary.replacementSourceId
          ? sources.get(apothecary.replacementSourceId)
          : undefined;
        require(event.metadata.sourceTag === "ResultApothecary" &&
          event.type === "injury" &&
          event.scoringStatus === "excluded" &&
          event.metadata.isRollCandidate === false &&
          original?.metadata.sourceTag === "QuestionApothecaryCasualtyUsage" &&
          original.teamId === event.teamId &&
          original.playerId === event.playerId &&
          (!apothecary.replacementSourceId ||
            (replacement?.metadata.sourceTag ===
              "QuestionApothecaryCasualtyChoice" &&
              replacement.teamId === event.teamId &&
              replacement.playerId === event.playerId)) &&
          (apothecary.applied === "injury_treatment"
            ? original?.metadata.rollType === 11 &&
              !replacement &&
              apothecary.resourceSpent === 1 &&
              apothecary.appliedCasualty === 0
            : original?.metadata.rollType === 12 &&
              (apothecary.resourceSpent === 1) === Boolean(replacement) &&
              apothecary.appliedCasualty ===
                (apothecary.applied === "original"
                  ? original.metadata.outcomeCode
                  : replacement?.metadata
                      .outcomeCode)), "Apothecary decisions require linked damage rolls and consistent resource evidence.");
      }
      if (event.scoringStatus === "excluded") {
        require(event.probabilitySuccess === null &&
          event.delta === 0 &&
          event.weightedDelta === 0 &&
          event.tags.length ===
            0, "Excluded evidence cannot invent odds or scored contributions.");
      } else {
        require(teamIds.has(event.teamId) &&
          event.metadata.isRollCandidate ===
            true, "Scored outcomes require a known team and random-outcome evidence.");
        require(event.probabilitySuccess !== null &&
          event.actualSuccess !== null &&
          Boolean(
            event.explainability.formulaSummary
          ), "Scored outcomes require odds, observed result and calculation.");
        if (event.probabilitySuccess !== null && event.actualSuccess !== null)
          require(near(
            event.delta,
            Number(event.actualSuccess) - event.probabilitySuccess
          ), "Dice deviation must agree with chance and result.");
        require(near(
          event.weightedDelta,
          event.delta * event.explainability.weight
        ) &&
          near(
            event.explainability.weight,
            report.weightTable[event.type]
          ), "Weighted contributions must agree with the declared scale.");
      }
    }
    for (const team of report.teams) {
      const owned = report.events.filter(
        (event) => event.teamId === team.teamId
      );
      const impacts = owned.filter(
        (event) => event.contextualImpact !== undefined
      );
      require(team.impactCount === impacts.length &&
        near(
          team.impactScore,
          impacts.reduce(
            (sum, event) => sum + event.contextualImpact!.contribution,
            0
          )
        ), "Context totals must reconcile.");
      for (const type of ["dodge", "ball_handling"] as const)
        require(near(
          team.impactByType[type],
          impacts
            .filter((event) => event.type === type)
            .reduce(
              (sum, event) => sum + event.contextualImpact!.contribution,
              0
            )
        ), "Context categories must reconcile.");
      const contributions = owned.filter(
        (event) => event.scoringStatus === "scored"
      );
      require(team.eventCount === owned.length &&
        near(
          team.luckScore,
          contributions.reduce((sum, event) => sum + event.weightedDelta, 0)
        ), "Team totals and counts must reconcile with owned evidence.");
      for (const [type, key] of Object.entries(categoryKey) as Array<
        [
          keyof typeof categoryKey,
          (typeof categoryKey)[keyof typeof categoryKey]
        ]
      >) {
        require(near(
          team.categoryScores[key],
          contributions
            .filter((event) => event.type === type)
            .reduce((sum, event) => sum + event.weightedDelta, 0)
        ), "Category totals must reconcile with event contributions.");
      }
    }
    const momentIds = new Set<string>();
    for (const moment of report.keyMoments) {
      const original = ids.get(moment.id);
      require(!momentIds.has(moment.id) &&
        original?.scoringStatus === "scored" &&
        JSON.stringify(original) ===
          JSON.stringify(
            moment
          ), "Key moments must reference unique, unchanged scored evidence.");
      momentIds.add(moment.id);
    }
    require(near(
      report.verdict.scoreGap,
      Math.abs(report.teams[0].luckScore - report.teams[1].luckScore)
    ), "Reported gap must use the same additive team units.");
    require(report.verdict.status ===
      (scored.length
        ? "partial_analysis"
        : "insufficient_evidence"), "Evidence status must distinguish partial analysis from no scored evidence.");
  });
