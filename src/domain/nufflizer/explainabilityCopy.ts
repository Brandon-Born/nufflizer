export const VERDICT_SUMMARIES = {
  insufficient_evidence: "Insufficient evidence to compare team luck.",
  partial_analysis:
    "Partial dice analysis. Whole-match luck cannot be determined from the supported evidence."
} as const;

export const HOW_TO_READ_LINES = [
  "Expected is the chance under the stated numeric dice contract, where supported.",
  "Weighted delta is (actual result - expected chance) x provisional category weight. Team dice totals add these contributions. Context units are a separate estimate for checks with enough pre-roll evidence; neither unit is a win probability.",
  "Excluded records have unknown odds where the contract is unverified. Unknown does not mean an even match.",
  "Replay segments follow source order. A half or team turn is shown only when the pre-roll state verifies it."
] as const;
export const CATEGORY_EXAMPLE_LINES = [
  "Rush, Dodge, Pick up and Catch use verified single-die contracts where the replay has enough evidence.",
  "Linked block pools measure the symbols rolled, separately from coach choices and skill-adjusted results. Armor luck is scored from the affected player’s side.",
  "Injury, special actions and referee outcomes can lack enough rule evidence for scoring. The report gives no whole-match verdict."
] as const;
