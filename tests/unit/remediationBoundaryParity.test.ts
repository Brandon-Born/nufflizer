import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/nufflizier/analyze/route";
import { envelope, sequence, rollXml, encodedMessage } from "../helpers/replay";
const valid = envelope(sequence([rollXml()]));
const invalid = [
  "<hello>world</hello>",
  envelope(
    sequence([
      "<ResultRoll><RollType>7</RollType><Difficulty>2</Difficulty></ResultRoll>"
    ])
  ),
  valid.replace(encodedMessage(rollXml()), "!!!"),
  envelope(
    sequence([rollXml().replace("<Value>1</Value>", "<Value>1.5</Value>")])
  ),
  envelope().replace("<id>0</id>", ""),
  envelope().replace("<id>1</id>", "<id>0</id>"),
  envelope().replace(
    "<MatchId>",
    "<ReplayVersion>9-0-0-0</ReplayVersion><MatchId>"
  )
];
describe("Replay rejection parity", () => {
  const cases = [
    ...invalid.map((xml) => ({ xml, status: 400, code: "INVALID_REPLAY" })),
    {
      xml: valid.replace("1-4-0-0", "9-0-0-0"),
      status: 422,
      code: "UNSUPPORTED_REPLAY_VERSION"
    }
  ];
  it.each(cases)(
    "[cli-worker] rejects $code consistently across HTTP and CLI",
    async ({ xml, status, code }) => {
      const form = new FormData();
      form.append("replay", new File([xml], "invalid.xml"));
      const response = await POST(
        new Request("http://localhost/analyze", { method: "POST", body: form })
      );
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body).toHaveProperty("code", code);
      if (status === 422)
        expect(body.error).toContain("supports BB3 replay version 1-4-0-0");
      const dir = mkdtempSync(path.join(tmpdir(), "nuff-invalid-"));
      try {
        const file = path.join(dir, "invalid.xml");
        writeFileSync(file, xml);
        const cli = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "src/cli/nufflizier.ts",
            "analyze",
            file,
            "--format",
            "json"
          ],
          { encoding: "utf8", timeout: 10_000 }
        );
        expect(cli.status).toBe(1);
        expect(cli.stdout).toBe("");
        expect(cli.stderr.trim()).toBe(`[nufflizier] [${code}] ${body.error}`);
      } finally {
        rmSync(dir, { recursive: true });
      }
    }
  );
});
