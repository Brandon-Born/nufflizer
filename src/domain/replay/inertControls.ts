import type { ReplayEvent } from "./types";
function record(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function number(v: unknown) {
  if (typeof v === "string" && /^(0|[1-9]\d{0,15})$/.test(v)) v = Number(v);
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    ? v
    : undefined;
}
function amount(v: unknown) {
  if (typeof v === "string" && /^(0|[1-9]\d{0,15})(?:\.\d{1,9})?$/.test(v))
    v = Number(v);
  return typeof v === "number" &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= Number.MAX_SAFE_INTEGER
    ? v
    : undefined;
}
// Timer telemetry does not reset the observed game-turn clock or a committed
// activation. This never supplies a missing value, controller or timeout event.
export function isInertReplayControl(e: ReplayEvent) {
  const p = record(e.payload);
  if (!p || e.attributionConflict) return false;
  if (
    [
      "EventPauseActiveTimer",
      "EventStartActiveTimer",
      "EventGamersAreReady"
    ].includes(e.sourceTag)
  )
    return Object.keys(p).length === 0;
  if (e.sourceTag === "Clock")
    return Object.keys(p).every(
      (k) =>
        ["Remaining", "Elapsed", "Value"].includes(k) &&
        amount(p[k]) !== undefined
    );
  if (
    e.sourceTag !== "EventActiveTimerChanged" ||
    !Object.keys(p).every((k) => k === "NewTimer" || k === "IsPaused")
  )
    return false;
  const timer = record(p.NewTimer);
  return (
    !!timer &&
    Object.keys(timer).every((k) =>
      ["Duration", "Type", "Value", "Team"].includes(k)
    ) &&
    [timer.Duration, timer.Value].every((v) => amount(v) !== undefined) &&
    number(timer.Type) !== undefined &&
    (timer.Team === undefined || [0, 1].includes(number(timer.Team) ?? -1)) &&
    (p.IsPaused === undefined || [0, 1].includes(number(p.IsPaused) ?? -1))
  );
}
