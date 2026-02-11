import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FORBIDDEN_PATTERNS = [/BB Trainer/i, /bb-trainer/i];
const TARGET_PATHS = [
  "src/app",
  "src/cli",
  "src/server/services/analyzeNufflizer.ts",
  "README.md"
];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".css"]);

function collectFiles(relativePath: string): string[] {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return [absolutePath];
  }

  const results: string[] = [];
  for (const entry of readdirSync(absolutePath)) {
    const childPath = path.join(absolutePath, entry);
    const childStats = statSync(childPath);
    if (childStats.isDirectory()) {
      results.push(...collectFiles(path.relative(process.cwd(), childPath)));
      continue;
    }

    if (TEXT_EXTENSIONS.has(path.extname(childPath))) {
      results.push(childPath);
    }
  }

  return results;
}

describe("nufflizier conversion residue inventory", () => {
  it("contains no BB Trainer residue in active product surfaces", () => {
    const files = TARGET_PATHS.flatMap((relativePath) => collectFiles(relativePath));

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
