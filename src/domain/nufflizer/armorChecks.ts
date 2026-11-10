import type { ReplayEvent } from "@/domain/replay/types";

// These modifiers are settled before rolling: ordinary attack/defence assists.
// Post-roll choices (e.g. Mighty Blow) cannot be substituted into the odds.
function fixedAssistTotal(raw: unknown): number | undefined {
  if (raw === undefined || raw === "") return 0;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  const entries = (raw as { Modifier?: unknown }).Modifier;
  const modifiers = Array.isArray(entries) ? entries : [entries];
  if (modifiers.length === 0 || modifiers.length > 30) return;
  let sum = 0;
  for (const rawModifier of modifiers) {
    const m = rawModifier as
      | {
          ModifierType?: unknown;
          Value?: unknown;
          Skill?: unknown;
          Effect?: unknown;
        }
      | null
      | undefined;
    if (
      !m ||
      !(
        (m.ModifierType === 11 && m.Value === 1) ||
        (m.ModifierType === 12 && m.Value === -1)
      ) ||
      m.Skill !== -1 ||
      m.Effect !== -1
    )
      return;
    sum += m.Value;
  }
  return sum;
}

type ArmorContract =
  | { kind: "verified"; held: boolean; probability: number; subject: string }
  | { kind: "excluded"; reason: string };

export function verifyArmorCheck(
  version: string | undefined,
  event: ReplayEvent,
  dice: readonly number[],
  dieTypes: readonly number[]
): ArmorContract | undefined {
  if (event.sourceTag !== "ResultRoll" || event.rollType !== 10) return;
  const p = event.payload;
  const subject = event.stepActorId;
  if (
    version !== "1-4-0-0" ||
    event.stepTag !== "DamageStep" ||
    event.stepType !== 2 ||
    !subject ||
    subject !== event.stepTargetId ||
    subject !== event.playerId ||
    subject !== event.targetId
  )
    return {
      kind: "excluded",
      reason: "armor subject or replay version is unverified"
    } as const;
  if (
    p?.Status !== 1 ||
    p.NewRoll !== 1 ||
    (p.Outcome !== 0 && p.Outcome !== 1) ||
    dice.length !== 2 ||
    dieTypes.length !== 2 ||
    dieTypes.some((kind) => kind !== 0) ||
    dice.some((face) => !Number.isInteger(face) || face < 1 || face > 6)
  )
    return {
      kind: "excluded",
      reason: "armor requires fresh binary outcome evidence from exactly two D6"
    } as const;
  const adjustment = fixedAssistTotal(p.Modifiers);
  const requirement = p.Requirement;
  const difficulty = p.Difficulty;
  if (
    adjustment === undefined ||
    (adjustment !== 0 && event.damageSource !== 7)
  )
    return {
      kind: "excluded",
      reason:
        "armor uses a modifier or choice outside the fixed assist contract"
    } as const;
  if (
    typeof requirement !== "number" ||
    !Number.isSafeInteger(requirement) ||
    requirement < 2 ||
    requirement > 12 ||
    typeof difficulty !== "number" ||
    difficulty !== requirement - adjustment ||
    difficulty < 2 ||
    difficulty > 12
  )
    return {
      kind: "excluded",
      reason:
        "armor difficulty does not reconcile with its base target and fixed assists"
    } as const;
  const held = dice[0]! + dice[1]! < difficulty;
  if (held !== (p.Outcome === 0))
    return {
      kind: "excluded",
      reason: "armor dice contradict its recorded outcome"
    } as const;
  let holds = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++) if (a + b < difficulty) holds++;
  return { kind: "verified", held, probability: holds / 36, subject } as const;
}
