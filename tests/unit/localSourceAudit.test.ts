import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
describe("read-only recovered-source receipt", () => {
  it("preserves narrow discovery counts without claiming new matches or policy admission", () => {
    const r = JSON.parse(
      readFileSync(
        "tests/fixtures/evidence/local-source-discovery-2026-11-12.json",
        "utf8"
      )
    );
    expect(r.unreadableInputs).toBe(0);
    expect(r.oversizedInputs).toBe(0);
    expect(r.sources).toHaveLength(9);
    expect(
      r.sources.filter(
        (s: { historicalSourceAuditHashMatch: boolean }) =>
          s.historicalSourceAuditHashMatch
      )
    ).toHaveLength(3);
    expect(
      r.sources.every((s: { publicNumericCounterpart: string }) =>
        /^demo\d+\.bbr$/.test(s.publicNumericCounterpart)
      )
    ).toBe(true);
    const candidates = r.sources.flatMap(
      (s: { failedCommittedRushEmissions: unknown[] }) =>
        s.failedCommittedRushEmissions
    );
    expect(candidates).toHaveLength(3);
    expect(
      candidates.filter(
        (s: {
          stepType: number;
          lastAction: number;
          knownNonCarrier: boolean;
        }) => s.stepType === 1 && s.lastAction === 1 && s.knownNonCarrier
      )
    ).toHaveLength(0);
  });
  it("deduplicates public bytes while keeping private input and archive names out of the receipt", () => {
    const folder = mkdtempSync(join(tmpdir(), "source-audit-"));
    try {
      const source = join(folder, "private-canary-player-name.bbr"),
        archive = join(folder, "private-canary-archive.zip"),
        out = join(folder, "receipt.json");
      writeFileSync(source, readFileSync("demo-replays/demo2.bbr"));
      const zip = spawnSync(
        "python3",
        [
          "-c",
          "import sys,zipfile; z=zipfile.ZipFile(sys.argv[2],'w'); z.write(sys.argv[1], 'private-canary-member.bbr'); z.close()",
          source,
          archive
        ],
        { encoding: "utf8" }
      );
      expect(zip.status, zip.stderr).toBe(0);
      const result = spawnSync(
        "python3",
        [
          "scripts/audit-local-replay-sources.py",
          "--source",
          source,
          "--source",
          archive,
          "--output",
          out
        ],
        { encoding: "utf8" }
      );
      expect(result.status, result.stderr).toBe(0);
      const rendered = readFileSync(out, "utf8"),
        r = JSON.parse(rendered);
      expect(rendered).not.toContain("private-canary");
      expect(rendered).not.toContain(folder);
      expect(r.sources).toHaveLength(1);
      expect(r.sources[0].publicNumericCounterpart).toBe("demo2.bbr");
      expect(r.unreadableInputs).toBe(0);
      expect(readFileSync(source)).toEqual(
        readFileSync("demo-replays/demo2.bbr")
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
