import { build } from "esbuild";
await build({
  entryPoints: ["src/server/analysisWorker.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: ".generated/analysis-worker.cjs"
});
