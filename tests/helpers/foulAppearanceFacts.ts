import { execFileSync } from "node:child_process";

type Check = {
  locator: number[];
  actor: string;
  actorTeam: string;
  defender: string;
  defenderTeam: string;
  face: number;
  target: number;
  passed: boolean;
  delta: [number, number];
  action: 2 | 3 | null;
  previous: number[] | null;
};

let facts: Array<{ file: string; rows: Check[] }> | undefined;
export function foulAppearanceFacts() {
  facts ??= execFileSync(
    "python3",
    ["scripts/extract-foul-appearance-checks.py"],
    {
      encoding: "utf8"
    }
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return facts;
}
