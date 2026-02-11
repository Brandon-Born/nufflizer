export const HOW_TO_READ_LINES = [
  "Expected is the chance the play should work based on the replay context at roll time.",
  "Weighted delta is luck swing: (actual result - expected chance) x category weight.",
  "Explicit means we have a dedicated calculator for that roll family; fallback means we still scored it, but with generic odds."
] as const;

export const CATEGORY_EXAMPLE_LINES = [
  "Block: dice faces where stronger outcomes are less likely.",
  "Armor break: target roll to crack armor.",
  "Injury: target roll for removal/severity outcomes.",
  "Dodge: agility-style roll to escape pressure.",
  "Ball handling: pickup/catch/pass/handoff style control rolls.",
  "Argue call: referee call roll outcomes."
] as const;

