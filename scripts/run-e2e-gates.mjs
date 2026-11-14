import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Test-runner corpus generation must not consume the real server worker's
// four-second budget. Real upload/route cases run first, one at a time, against
// a fresh production server. The complementary fixture gate keeps its normal
// parallelism. Mark every case making an unmocked POST with [real-worker].
const marker = String.raw`\[real-worker\]`;
const playwright = resolve("node_modules/@playwright/test/cli.js");
const gates = [
  {
    name: "Isolated real upload browser gate",
    timing: true,
    args: [
      "test",
      "--grep",
      marker,
      "--workers",
      "1",
      "--output",
      "test-results/real-worker"
    ]
  },
  {
    name: "Report fixture browser gate",
    args: [
      "test",
      "--grep-invert",
      marker,
      "--output",
      "test-results/report-ui"
    ]
  }
];
for (const gate of gates) {
  process.stdout.write(`\n${gate.name}\n`);
  const result = spawnSync(process.execPath, [playwright, ...gate.args], {
    stdio: "inherit",
    // Existing diagnostic messages contain only stage names and timestamps.
    env: {
      ...process.env,
      ...(gate.timing ? { NUFFLIZIER_ANALYZER_TIMING: "1" } : {})
    }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
