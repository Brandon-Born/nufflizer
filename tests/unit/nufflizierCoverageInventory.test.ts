import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REQUIRED_NUFFLIZIER_TESTS = [
  "tests/unit/nufflizierProbability.test.ts",
  "tests/unit/nufflizierScoring.test.ts",
  "tests/unit/nufflizierNormalization.test.ts",
  "tests/unit/nufflizierApi.test.ts",
  "tests/unit/nufflizierCliParity.test.ts",
  "tests/unit/nufflizierArgueVariants.test.ts",
  "tests/unit/nufflizierConversionResidue.test.ts"
];

describe("nufflizier test inventory", () => {
  it("includes core nufflizier suite files", () => {
    for (const relativePath of REQUIRED_NUFFLIZIER_TESTS) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      expect(existsSync(absolutePath)).toBe(true);
    }
  });

  it("exposes split scripts for nufflizier-first and legacy suites", () => {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.scripts?.["test:nufflizier"]).toBeDefined();
    expect(packageJson.scripts?.["test:legacy"]).toBeDefined();
  });
});
