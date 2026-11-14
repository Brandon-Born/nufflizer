import type { ReplayEvent } from "@/domain/replay/types";

function object(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function fields(p: Record<string, unknown> | undefined, keys: string[]) {
  return !!p && Object.keys(p).every((k) => keys.includes(k));
}
// This is NOT a direct outcome mapping. The prompt code1 is kept verbatim;
// only a current, unmodified Stunty table can reconstruct its original nine.
export function staffInjuryRoll(e: ReplayEvent) {
  const p = e.payload,
    r = object(p?.RollInfos),
    dice = object(r?.Dice),
    faces = dice?.Die;
  if (
    e.sourceTag !== "QuestionApothecaryCasualtyUsage" ||
    !fields(p, ["GamerId", "RollInfos"]) ||
    ![0, 1].includes(Number(p?.GamerId)) ||
    typeof p?.GamerId !== "number" ||
    !fields(r, [
      "Status",
      "Modifiers",
      "Dice",
      "Source",
      "RollType",
      "Outcome"
    ]) ||
    r?.RollType !== 11 ||
    r.Status !== 1 ||
    r.Outcome !== 1 ||
    r.Modifiers !== "" ||
    ![0, 1, 9].includes(Number(r.Source)) ||
    typeof r.Source !== "number" ||
    !fields(dice, ["Die"]) ||
    !Array.isArray(faces) ||
    faces.length !== 2 ||
    !faces.every((x) => {
      const d = object(x);
      return (
        fields(d, ["DieType", "Value"]) &&
        d?.DieType === 0 &&
        Number.isInteger(d.Value) &&
        Number(d.Value) >= 1 &&
        Number(d.Value) <= 6
      );
    })
  )
    return;
  const values = faces.map((x) => Number(object(x)!.Value));
  if (values[0]! + values[1] !== 9) return;
  return { roll: r, dice: values };
}
export function koInjuryRoll(e: ReplayEvent) {
  const p = e.payload,
    r = object(p?.RollInfos),
    dice = object(r?.Dice),
    faces = dice?.Die,
    staffs = object(p?.Staffs),
    raw = staffs?.StaffsItem,
    items = Array.isArray(raw) ? raw : [raw];
  if (
    e.sourceTag !== "QuestionKORecovery" ||
    !fields(p, ["GamerId", "Staffs", "RollInfos"]) ||
    typeof p?.GamerId !== "number" ||
    ![0, 1].includes(p.GamerId) ||
    !(
      p.Staffs === undefined ||
      p.Staffs === "" ||
      (fields(staffs, ["StaffsItem"]) &&
        items.length <= 16 &&
        items.every(
          (v) =>
            typeof v === "number" &&
            Number.isSafeInteger(v) &&
            v >= 0 &&
            v <= 65535
        ))
    ) ||
    !fields(r, [
      "Status",
      "Modifiers",
      "Dice",
      "Source",
      "RollType",
      "Outcome"
    ]) ||
    r?.RollType !== 11 ||
    r.Status !== 1 ||
    r.Outcome !== 2 ||
    r.Modifiers !== "" ||
    typeof r.Source !== "number" ||
    ![0, 1, 9].includes(r.Source) ||
    !fields(dice, ["Die"]) ||
    !Array.isArray(faces) ||
    faces.length !== 2 ||
    !faces.every((x) => {
      const d = object(x);
      return (
        fields(d, ["DieType", "Value"]) &&
        d?.DieType === 0 &&
        Number.isInteger(d.Value) &&
        Number(d.Value) >= 1 &&
        Number(d.Value) <= 6
      );
    })
  )
    return;
  return r;
}
