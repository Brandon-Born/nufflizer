export const VERDICT_SUMMARIES = {
  insufficient_evidence: "Insufficient evidence to compare team luck.",
  partial_analysis:
    "Partial dice analysis. Whole-match luck cannot be determined from the supported evidence."
} as const;

export const HOW_TO_READ_LINES = [
  "Expected is the chance under the stated numeric dice contract, where supported.",
  "Weighted delta is (actual result - expected chance) x provisional category weight. Team totals add these contributions; these are dice units, not win probabilities or match impact.",
  "Excluded records have unknown odds where the contract is unverified. Unknown does not mean an even match.",
  "Replay segments are source order, not validated half or team turns."
] as const;
export const CATEGORY_EXAMPLE_LINES = [
  "Movement risk and ball handling currently use provisional threshold contracts; category meanings await independent verification.",
  "Block pools and damage chains remain visible but excluded from scoring until their semantics and beneficiaries are verified.",
  "Dodge, special actions and referee variants require further rule evidence; no whole-match luck verdict is currently supported."
] as const;
