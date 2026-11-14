import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { staffInjuryXml, koInjuryXml } from "../helpers/staffInjuryOriginal";

it("[cli-worker] exports conditional initial originals while the unchanged real witness stays unknown", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuff-initial-original-cli-"));
  const run = (input: string, format: string) => {
    const path = join(dir, "source.xml");
    writeFileSync(path, input);
    const output = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        path,
        "--format",
        format
      ],
      { encoding: "utf8", maxBuffer: 4_000_000 }
    );
    expect(output.status, output.stderr).toBe(0);
    return output.stdout;
  };
  try {
    for (const ko of [false, true]) {
      const input = ko
        ? koInjuryXml({ dice: [4, 4], outcome: 2 })
        : staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 });
      const report = LuckReportSchema.parse(JSON.parse(run(input, "json"))),
        e = report.events.find((e) => e.metadata.injuryScoring)!;
      expect(e).toMatchObject({
        scoringStatus: "scored",
        probabilitySuccess: null,
        actualSuccess: null,
        weightedDelta: ko ? -5 / 8 : -13 / 12
      });
      expect(e.metadata.sourceTag).toBe(
        ko ? "QuestionKORecovery" : "QuestionApothecaryCasualtyUsage"
      );
      expect(run(input, "text")).toContain(
        ko ? "KO (recorded)" : "Badly Hurt (initial)"
      );
    }
    const real = LuckReportSchema.parse(
      JSON.parse(run(readFileSync("demo-replays/demo3.bbr", "utf8"), "json"))
    );
    const e = real.events.find((e) => e.metadata.sourceId === "source-628")!;
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      weightedDelta: 0
    });
    expect(e.metadata.initialInjuryOriginal).toBeUndefined();
    expect(e.metadata.injuryTable).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
