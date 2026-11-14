import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import {
  assertIntrinsicInjury,
  intrinsicInjuryFacts
} from "../helpers/intrinsicInjuryFacts";

describe("independent raw injury consequences of continued intrinsic knowledge", () => {
  it("regenerates every raw injury before admission and preserves prior rule/trait artifacts", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-intrinsic-injury-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(intrinsicInjuryFacts.files.flatMap((f) => f.records)).toHaveLength(
      232
    );
    for (const [file, sha] of Object.entries(intrinsicInjuryFacts.references))
      expect(
        createHash("sha256")
          .update(readFileSync("tests/fixtures/evidence/" + file))
          .digest("hex")
      ).toBe(sha);
  });
  it.each(intrinsicInjuryFacts.files)(
    "joins every $file conditional table and actual score to raw state, cause and independent arithmetic",
    (f) => {
      const r = analyzeNufflizerInput(
        readFileSync("demo-replays/" + f.file, "utf8")
      );
      let tables = 0,
        scored = 0;
      for (const e of r.events.filter((e) => e.metadata.injuryTable)) {
        expect(assertIntrinsicInjury(f.file, e, r), e.metadata.sourceId).toBe(
          true
        );
        tables++;
        if (e.metadata.injuryScoring) scored++;
      }
      const expected: Record<string, [number, number]> = {
        "demo1.bbr": [1, 0],
        "demo5.bbr": [4, 4],
        "demo6.bbr": [1, 1],
        "demo8.bbr": [7, 7],
        "demo9.bbr": [13, 7],
        "demo10.bbr": [10, 8]
      };
      expect([tables, scored]).toEqual(expected[f.file] ?? [0, 0]);
    }
  );
});
