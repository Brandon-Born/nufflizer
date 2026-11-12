import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// CPU-heavy corpus tests must not consume a real CLI worker's four-second
// wall-clock budget. This is the same isolation used for real HTTP acceptance.
// Both name filters are complementary, and the API file has its own quota gate.
// Mark any test invoking the actual CLI worker with [cli-worker]. Unmarked
// cases still run in the corpus gate; the marker controls scheduling only.
const cliMarker = String.raw`\[cli-worker\]`;
const vitest = resolve("node_modules/vitest/vitest.mjs");
const api = "tests/unit/nufflizierApi.test.ts";
const gates = [
  {
    name: "Pure domain/corpus gate",
    args: [
      "run",
      "--exclude",
      api,
      "--testNamePattern",
      `^(?![\\s\\S]*${cliMarker})[\\s\\S]*$`
    ]
  },
  {
    name: "Isolated real CLI worker gate",
    args: [
      "run",
      "--exclude",
      api,
      "--testNamePattern",
      cliMarker,
      "--no-file-parallelism"
    ]
  },
  {
    name: "Isolated real HTTP worker gate",
    args: ["run", api, "--no-file-parallelism"]
  }
];
for (const gate of gates) {
  process.stdout.write(`\n${gate.name}\n`);
  const result = spawnSync(process.execPath, [vitest, ...gate.args], {
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
