import { build } from "esbuild";

if (
  process.env.NUFFLIZIER_REQUIRE_PREVIEW === "1" &&
  process.env.VERCEL_ENV !== "preview"
) {
  throw new Error(
    "The preview-only verification build requires Vercel's preview environment."
  );
}

await build({
  entryPoints: ["src/server/analysisWorker.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: ".generated/analysis-worker.cjs"
});
