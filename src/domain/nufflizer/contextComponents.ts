import type { LuckEvent, LuckEventType } from "./types";

export type ComponentBounds = { lower: number; upper: number };
type Bucket = {
  componentCount: number;
  pointCount: number;
  boundedCount: number;
  bounds: ComponentBounds | null;
};
type MemberBucket = Bucket & { eventIds: string[] };
export type ContextComponentSummary = Bucket & {
  teamId: string;
  byCategory: (MemberBucket & { type: LuckEventType })[];
  byAction: (MemberBucket & { actionId: string | null })[];
};
const empty = (): Bucket => ({
  componentCount: 0,
  pointCount: 0,
  boundedCount: 0,
  bounds: null
});
const member = (): MemberBucket => ({ ...empty(), eventIds: [] });
// Exactly one admitted model component per random record. This arithmetic is
// not an additional rule/causal-policy admission or a whole-match impact bound.
export function contextComponent(event: LuckEvent) {
  const fields = [
    event.contextualImpact,
    event.contextualBounds,
    event.possessionBounds,
    event.catchPossessionBounds
  ].filter((x) => x !== undefined);
  if (
    event.scoringStatus !== "scored" ||
    event.metadata.isRollCandidate !== true ||
    fields.length !== 1
  )
    return;
  const point = event.contextualImpact;
  const interval =
    event.contextualBounds ??
    event.possessionBounds ??
    event.catchPossessionBounds;
  const bounds = point
    ? { lower: point.contribution, upper: point.contribution }
    : interval;
  if (
    !bounds ||
    !Number.isFinite(bounds.lower) ||
    !Number.isFinite(bounds.upper) ||
    bounds.lower > bounds.upper
  )
    return;
  return {
    bounds: { lower: bounds.lower, upper: bounds.upper },
    point: !!point
  };
}
function add(bucket: Bucket, bounds: ComponentBounds, point: boolean) {
  bucket.componentCount++;
  if (point) bucket.pointCount++;
  else bucket.boundedCount++;
  bucket.bounds = bucket.bounds
    ? {
        lower: bucket.bounds.lower + bounds.lower,
        upper: bucket.bounds.upper + bounds.upper
      }
    : { ...bounds };
}

// Sum existing component intervals once, without a midpoint, normalization or
// independence assumption. Interval addition is conservative when component
// uncertainties are dependent; missing components remain completely unbounded.
// Action groups use recorded IDs only. Unlinked events never become one action.
export function summarizeContextComponents(
  events: readonly LuckEvent[],
  teamIds: readonly string[]
): ContextComponentSummary[] {
  const teams = new Map(
    teamIds.map((teamId) => [
      teamId,
      {
        ...empty(),
        teamId,
        categories: new Map<LuckEventType, MemberBucket>(),
        actions: new Map<string, MemberBucket & { actionId: string | null }>()
      }
    ])
  );
  const seenIds = new Set<string>(),
    seenSources = new Set<string>();
  for (const event of events) {
    const component = contextComponent(event),
      team = teams.get(event.teamId),
      source = event.metadata.sourceId;
    if (
      !component ||
      !team ||
      seenIds.has(event.id) ||
      (source !== undefined && seenSources.has(source))
    )
      continue;
    seenIds.add(event.id);
    if (source !== undefined) seenSources.add(source);
    add(team, component.bounds, component.point);
    let category = team.categories.get(event.type);
    if (!category) {
      category = member();
      team.categories.set(event.type, category);
    }
    add(category, component.bounds, component.point);
    category.eventIds.push(event.id);
    const actionId = event.metadata.actionId ?? null,
      key = actionId === null ? `event:${event.id}` : `action:${actionId}`;
    let action = team.actions.get(key);
    if (!action) {
      action = { ...member(), actionId };
      team.actions.set(key, action);
    }
    add(action, component.bounds, component.point);
    action.eventIds.push(event.id);
  }
  return [...teams.values()].map(({ categories, actions, ...team }) => ({
    ...team,
    byCategory: [...categories.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([type, bucket]) => ({ type, ...bucket })),
    byAction: [...actions.values()]
  }));
}
