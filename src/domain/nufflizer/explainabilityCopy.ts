export const VERDICT_SUMMARIES = {
  insufficient_evidence: "Insufficient evidence to compare team luck.",
  partial_analysis:
    "Partial dice analysis. Whole-match luck cannot be determined from the supported evidence."
} as const;

export const HOW_TO_READ_LINES = [
  "Expected is the chance under the stated numeric dice contract. For a linked reroll it assumes rerolling a first failure. Categorical injuries show their outcome distribution instead of a binary success chance.",
  "A single binary roll contributes actual result minus its chance. A linked reroll adds that calculation for each actual draw, including the failed first die once, before applying the provisional category weight. A qualified initial injury compares more-severe and less-severe tiers. Team dice totals add these contributions; context units require separate pre-roll evidence. Neither unit is a win probability.",
  "Excluded records have unknown odds where the contract is unverified. Unknown does not mean an even match.",
  "Replay segments follow source order. A half or team turn is shown only when the pre-roll state verifies it."
] as const;
export const CATEGORY_EXAMPLE_LINES = [
  "Rush, Dodge, Pick up and Catch use verified single-die contracts where the replay has enough evidence.",
  "Linked block pools measure the symbols rolled, separately from coach choices and skill-adjusted results. Armor luck is scored from the affected player’s side.",
  "Qualified unmodified injuries compare Stunned, KO and casualty tiers from the injured player’s side, before treatment or recovery. Other injury, special-action and referee policies can remain unscored. The report gives no whole-match verdict."
] as const;
