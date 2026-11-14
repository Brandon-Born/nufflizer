import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import type { LuckEvent } from "./types";
import { enumerateSkillBlock } from "./blockSkillModel";
import { explainBlockEvidence } from "./blockPools";

// Score only the fresh draw(s), conditional on already retained dice and the
// current intrinsic-trait observations. Actual die/optional-skill selection is
// separate evidence and must not decide either this policy or its deviation.
export function applyCategoricalBlockScore(event: LuckEvent) {
  const block = event.metadata.block;
  if (!block) return;
  event.actualSuccess = null;
  event.probabilitySuccess = null;
  delete event.explainability.baseOdds;
  delete event.explainability.rerollAdjustedOdds;
  delete event.metadata.probabilityPolicy;
  event.tags = [];
  const model = block.skillModel;
  if (!model) {
    event.scoringStatus = "excluded";
    event.delta = 0;
    event.weightedDelta = 0;
    event.label = "Observed block pool; outcome policy unverified";
    event.statusReason =
      "excluded: no source-qualified current block-skill outcome policy";
    delete event.explainability.formulaSummary;
    event.explainability.target =
      "Observed block symbols; skill-conditioned outcome odds unknown";
    event.explainability.inputsSummary = explainBlockEvidence(block);
    return;
  }
  event.metadata.blockScoring = {
    policy: "fixed_pool_knockdown_balance",
    poolSourceId: event.metadata.sourceId!,
    observedValue: model.poolValue,
    expectedValue: model.expectedValue
  };
  event.metadata.probabilityPolicy = "categorical_block";
  event.scoringStatus = "scored";
  event.delta = model.poolValue - model.expectedValue;
  event.explainability.weight = LUCK_CATEGORY_WEIGHTS.block;
  event.weightedDelta = event.delta * LUCK_CATEGORY_WEIGHTS.block;
  event.label = `Block pool: knockdown balance ${model.poolValue > 0 ? "+" : ""}${model.poolValue}`;
  event.statusReason =
    "verified categorical block pool under the stated fixed knockdown-balance policy";
  event.explainability.target =
    "Defender knockdowns minus attacker knockdowns offered by the pool";
  event.explainability.formulaSummary =
    "weighted delta = (offered knockdown balance - fair conditional mean) × block weight";
  event.explainability.inputsSummary = `${explainBlockEvidence(block)} Offered balance ${model.poolValue}; expected balance ${model.expectedValue.toFixed(6)}. Only ${block.pool.rolledIndexes.length} newly rolled dice are enumerated; retained dice stay fixed. Current recorded traits and tackle-zone observations qualify this conditional model. Both coaches optimize knockdown balance; this does not assert their actual choice, legal full-turn eligibility, ball/armor consequences, resource value or tactical impact.`;
}

export function validReportedCategoricalBlock(event: LuckEvent): boolean {
  const b = event.metadata.block,
    s = event.metadata.blockScoring;
  if (!b) return !s && event.metadata.probabilityPolicy !== "categorical_block";
  if (event.tags.length) return false;
  if (
    event.metadata.sourceTag !== "QuestionBlockDice" ||
    event.type !== "block" ||
    event.metadata.rollType !== 3 ||
    event.metadata.isRollCandidate !== true ||
    event.playerId !== b.attackerId ||
    event.metadata.targetId !== b.defenderId ||
    b.pool.sourceId !== event.metadata.sourceId ||
    !event.metadata.ownership
  )
    return false;
  if (!s)
    return (
      !b.skillModel &&
      event.metadata.probabilityPolicy === undefined &&
      event.explainability.baseOdds === undefined &&
      event.explainability.rerollAdjustedOdds === undefined &&
      event.scoringStatus === "excluded" &&
      event.probabilitySuccess === null &&
      event.actualSuccess === null &&
      event.delta === 0 &&
      event.weightedDelta === 0
    );
  const expected =
    b.traitEvidence && enumerateSkillBlock(b.pool, b.traitEvidence);
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
  return (
    !!expected &&
    b.skillModel?.wrestlePolicy === "improve_knockdown_balance" &&
    s.poolSourceId === event.metadata.sourceId &&
    event.metadata.sourceTag === "QuestionBlockDice" &&
    event.metadata.isRollCandidate === true &&
    event.type === "block" &&
    event.scoringStatus === "scored" &&
    event.probabilitySuccess === null &&
    event.actualSuccess === null &&
    event.metadata.probabilityPolicy === "categorical_block" &&
    s.observedValue === expected.poolValue &&
    near(s.expectedValue, expected.expectedValue) &&
    near(event.delta, expected.poolValue - expected.expectedValue) &&
    near(event.weightedDelta, event.delta * LUCK_CATEGORY_WEIGHTS.block) &&
    event.explainability.baseOdds === undefined &&
    event.explainability.rerollAdjustedOdds === undefined
  );
}
