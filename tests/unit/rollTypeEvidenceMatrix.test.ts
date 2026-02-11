import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { getRollTypeContract, listObservedRollTypeContracts } from "@/domain/replay/rollTypeContracts";

const DEMO_REPLAYS = ["demo1.bbr", "demo2.bbr", "demo3.bbr", "demo-goblins1.bbr"] as const;

function observedRollPairs(): Set<string> {
  const keys = new Set<string>();

  for (const replayFile of DEMO_REPLAYS) {
    const replayInput = readFileSync(path.resolve(process.cwd(), "demo-replays", replayFile), "utf-8");
    const replay = parseReplayXml(decodeReplayInput(replayInput).xml);

    for (const turn of replay.turns) {
      for (const event of turn.events) {
        if (typeof event.rollType !== "number") {
          continue;
        }

        keys.add(`${event.sourceTag}|${event.rollType}`);
      }
    }
  }

  return keys;
}

describe("roll-type evidence matrix coverage", () => {
  it("defines a contract for every observed sourceTag|rollType pair in demo fixtures", () => {
    const observed = observedRollPairs();

    for (const key of observed) {
      const [sourceTag, rollTypeRaw] = key.split("|");
      const rollType = Number(rollTypeRaw);
      expect(getRollTypeContract(sourceTag!, rollType)).toBeDefined();
    }
  });

  it("keeps contracts one-to-one by sourceTag and rollType", () => {
    const contracts = listObservedRollTypeContracts();
    const unique = new Set(contracts.map((contract) => `${contract.sourceTag}|${contract.rollType}`));

    expect(unique.size).toBe(contracts.length);
  });

  it("documents every observed sourceTag|rollType pair in evidence and code-coverage docs", () => {
    const observed = observedRollPairs();
    const evidenceDoc = readFileSync(path.resolve(process.cwd(), "docs", "ROLL_TYPE_EVIDENCE_MATRIX.md"), "utf-8");
    const coverageDoc = readFileSync(path.resolve(process.cwd(), "docs", "ROLL_TYPE_CODE_COVERAGE.md"), "utf-8");

    for (const key of observed) {
      expect(evidenceDoc).toContain(`\`${key}\``);
      expect(coverageDoc).toContain(`\`${key}\``);
    }
  });
});
