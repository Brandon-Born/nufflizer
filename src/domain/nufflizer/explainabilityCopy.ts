export const HOW_TO_READ_LINES = [
  "Expected is the chance the play should work based on the replay context at roll time.",
  "Weighted delta is luck swing: (actual result - expected chance) x category weight.",
  "Scored means deterministic replay context was sufficient; excluded means the event is shown for transparency but not counted."
] as const;

export const CATEGORY_EXAMPLE_LINES = [
  "Block: dice faces where stronger outcomes are less likely.",
  "Armor break: target roll to crack armor.",
  "Injury: target roll for removal/severity outcomes.",
  "Dodge: agility-style roll to escape pressure.",
  "Ball handling: pickup/catch/pass/handoff style control rolls.",
  "Argue call: referee call roll outcomes.",
  "Movement risk: 2+ movement/rush checks that can chain into consequence rolls on failure."
] as const;
