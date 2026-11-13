// Physical alternatives at a verified push decision, after die selection.
// Choices belong to coaches, so branches have no random probability. The
// ordinary policy excludes push/follow-modifying skills and temporary effects.
export type PushCell = { x: number; y: number };
export type PushPlayer = {
  id: string;
  teamId: string;
  cell: PushCell;
  ordinaryPolicy: boolean;
};
export type PushMove = {
  playerId: string;
  teamId: string;
  from: PushCell;
  to: PushCell;
  destination: "pitch" | "crowd";
};
export type PushBranch = { moves: PushMove[]; follow: boolean };
export type PushProblem = {
  attackerId: string;
  defenderId: string;
  players: readonly PushPlayer[];
};
export type PushSolution =
  | { status: "supported"; destinations: PushCell[]; branches: PushBranch[] }
  | {
      status: "unsupported";
      reason:
        | "invalid_board"
        | "unknown_push_policy"
        | "cyclic_chain"
        | "branch_limit";
    };
const directions = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 }
];
export const onPushPitch = (c: PushCell) =>
  Number.isSafeInteger(c.x) &&
  Number.isSafeInteger(c.y) &&
  c.x >= 0 &&
  c.x <= 25 &&
  c.y >= 0 &&
  c.y <= 14;
const at = (c: PushCell) => `${c.x},${c.y}`;
export function ordinaryPushDirections(
  from: PushCell,
  subject: PushCell
): PushCell[] {
  const dx = subject.x - from.x,
    dy = subject.y - from.y;
  if (
    !onPushPitch(from) ||
    !onPushPitch(subject) ||
    Math.max(Math.abs(dx), Math.abs(dy)) !== 1
  )
    return [];
  const n = directions.findIndex((d) => d.x === dx && d.y === dy);
  return [-1, 0, 1]
    .map((i) => directions[(n + i + 8) % 8]!)
    .map((d) => ({ x: subject.x + d.x, y: subject.y + d.y }));
}
// No results are returned when any legal branch exceeds this verified scope.
// A missing branch must not look like a complete set of coach alternatives.
export function enumeratePushSuccessors(problem: PushProblem): PushSolution {
  const players = problem.players,
    byId = new Map(players.map((p) => [p.id, p])),
    occupied = new Map(players.map((p) => [at(p.cell), p]));
  const attacker = byId.get(problem.attackerId),
    defender = byId.get(problem.defenderId);
  if (
    players.length > 64 ||
    players.length < 2 ||
    byId.size !== players.length ||
    occupied.size !== players.length ||
    players.some((p) => !p.id || !p.teamId || !onPushPitch(p.cell)) ||
    !attacker ||
    !defender ||
    attacker.teamId === defender.teamId ||
    !ordinaryPushDirections(attacker.cell, defender.cell).length
  )
    return { status: "unsupported", reason: "invalid_board" };
  if (!attacker.ordinaryPolicy)
    return { status: "unsupported", reason: "unknown_push_policy" };
  let failure:
      Extract<PushSolution, { status: "unsupported" }>["reason"] | undefined,
    nodes = 0;
  function walk(
    pusher: PushCell,
    subject: PushPlayer,
    pending: ReadonlySet<string>
  ): PushMove[][] {
    if (++nodes > 512) {
      failure = "branch_limit";
      return [];
    }
    if (!subject.ordinaryPolicy) {
      failure = "unknown_push_policy";
      return [];
    }
    if (pending.has(subject.id) || subject.id === attacker!.id) {
      failure = "cyclic_chain";
      return [];
    }
    const candidates = ordinaryPushDirections(pusher, subject.cell),
      empty = candidates.filter((c) => onPushPitch(c) && !occupied.has(at(c))),
      crowd = candidates.filter((c) => !onPushPitch(c));
    // Empty on-pitch squares first, then crowd, otherwise an occupied square
    // causes a chain-push. Loose balls do not occupy a square.
    const legal = empty.length ? empty : crowd.length ? crowd : candidates;
    const next = new Set(pending);
    next.add(subject.id);
    return legal.flatMap((to) => {
      const move: PushMove = {
        playerId: subject.id,
        teamId: subject.teamId,
        from: { ...subject.cell },
        to: { ...to },
        destination: onPushPitch(to) ? "pitch" : "crowd"
      };
      const other = onPushPitch(to) ? occupied.get(at(to)) : undefined;
      if (!other) return [[move]];
      return walk(subject.cell, other, next).map((chain) => [move, ...chain]);
    });
  }
  const paths = walk(attacker.cell, defender, new Set());
  if (failure) return { status: "unsupported", reason: failure };
  if (!paths.length || paths.length > 128)
    return { status: "unsupported", reason: "branch_limit" };
  return {
    status: "supported",
    destinations: Array.from(
      new Map(paths.map((p) => [at(p[0]!.to), p[0]!.to])).values()
    ),
    branches: paths.flatMap((moves) =>
      [false, true].map((follow) => ({ moves, follow }))
    )
  };
}

// Pure application of an already admitted branch; pending crowd injury and
// ball reactions are deliberately outside this position-only transition.
export function pushPositionChanges(problem: PushProblem, branch: PushBranch) {
  const defender = problem.players.find((p) => p.id === problem.defenderId)!;
  return [
    ...branch.moves.map((m) => ({
      playerId: m.playerId,
      teamId: m.teamId,
      cell: m.destination === "crowd" ? null : { ...m.to }
    })),
    ...(branch.follow
      ? [
          {
            playerId: problem.attackerId,
            teamId: problem.players.find((p) => p.id === problem.attackerId)!
              .teamId,
            cell: { ...defender.cell }
          }
        ]
      : [])
  ];
}
