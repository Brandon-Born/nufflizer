import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  analyzeNufflizerInput,
  analyzeNufflizerXml
} from "@/server/services/analyzeNufflizer";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { readReplayUpload } from "@/server/upload/readReplayUpload";
import { envelope, sequence, rollXml, encodedMessage } from "../helpers/replay";

const valid = envelope(sequence([rollXml()]));
function semantic(xml: string) {
  const { generatedAt: _, ...report } = analyzeNufflizerInput(xml);
  void _;
  return report;
}
describe("NUF-002/003/004/005 ingestion regressions", () => {
  it("preserves teams, ordered actions, odds and scores across XML formatting", () => {
    const original = semantic(valid);
    const message = encodedMessage(rollXml());
    expect(
      semantic(valid.replace(message, message.match(/.{1,40}/g)!.join("\n")))
    ).toEqual(original);
    for (const xml of [
      '<?xml version="1.0"?>\n<!-- safe -->' + valid,
      valid.replaceAll("><", ">\n<"),
      valid.replaceAll("><", ">\r\n  <"),
      valid.replace("<Replay>", '<Replay version="reference">')
    ])
      expect(semantic(xml)).toEqual(original);
    expect(semantic(valid.replaceAll("Replay>", "MatchReplay>"))).toEqual(
      original
    );
  });
  it.each([
    "<hello>world</hello>",
    "<Replay/>",
    "<Replay>",
    envelope().replace("<id>1</id>", "<id>0</id>"),
    envelope().replace("<id>0</id>", ""),
    envelope().replace(
      "<MatchId>",
      "<ReplayVersion>9-0-0-0</ReplayVersion><MatchId>"
    )
  ])("rejects invalid or unsupported envelopes: %s", (xml) => {
    expect(() => analyzeNufflizerInput(xml)).toThrow();
  });
  it.each([
    "<ResultRoll><RollType>7</RollType><Difficulty>2</Difficulty><Outcome>1</Outcome></ResultRoll>",
    rollXml().replace("<Value>1</Value>", "<Value>1.5</Value>"),
    rollXml().replace(
      "<Difficulty>2</Difficulty>",
      "<Difficulty>Infinity</Difficulty>"
    )
  ])("rejects malformed roll contracts without server errors", (message) =>
    expect(() => analyzeNufflizerInput(envelope(sequence([message])))).toThrow(
      /Invalid/
    )
  );
  it("rejects malformed nested base64 and XML rather than dropping messages", () => {
    expect(() =>
      analyzeNufflizerInput(valid.replace(encodedMessage(rollXml()), "!!!"))
    ).toThrow(/base64/);
    expect(() =>
      analyzeNufflizerInput(envelope(sequence(["<ResultRoll>"])))
    ).toThrow(/parse failed/);
  });
  it("blocks DTD/entity expansion in outer and embedded XML", () => {
    const dtd = '<!DOCTYPE Replay [<!ENTITY a "example">]>';
    expect(() => analyzeNufflizerXml(dtd + valid)).toThrow(/DOCTYPE/);
    expect(() =>
      analyzeNufflizerInput(envelope(sequence([dtd + rollXml()])))
    ).toThrow(/DOCTYPE/);
    expect(() =>
      analyzeNufflizerInput(valid.replace("<MatchId>", "<!DOCTYPE x><MatchId>"))
    ).toThrow(/DOCTYPE/);
  });
  it("bounds numeric text references and does not misdecode differently cased names", () => {
    expect(() =>
      parseReplayXml(
        valid.replace(
          "<name>Home</name>",
          "<name>&#99999999999999999999999999999;</name>"
        )
      )
    ).toThrow(/character reference/);
    expect(
      parseReplayXml(valid.replace("<name>Home</name>", "<name>&AMP;</name>"))
        .teams[0]?.name
    ).toBe("&AMP;");
  });
  it("preserves safe text and empty-element variants", () => {
    const xml = valid
      .replace("<name>Home</name>", "<name>Home &amp; Friends &#33;</name>")
      .replace("<MatchId>", "<Unused/><MatchId>");
    expect(parseReplayXml(xml).teams[0]?.name).toBe("Home & Friends !");
    expect(
      semantic(valid.replace("<MatchId>", "<Unused></Unused><MatchId>"))
    ).toEqual(semantic(valid));
  });
  it("bounds decompression during expansion", () => {
    const input = deflateSync(
      Buffer.from("<Replay>" + "x".repeat(64_000) + "</Replay>")
    ).toString("base64");
    expect(() => decodeReplayInput(input, { maxDecodedChars: 1024 })).toThrow(
      /too large/
    );
    expect(
      decodeReplayInput(deflateSync(Buffer.from(valid)).toString("base64"), {
        maxDecodedChars: Buffer.byteLength(valid)
      }).xml
    ).toBe(valid);
  });
  it("rejects depth and node exhaustion before tree parsing", () => {
    expect(() =>
      parseReplayXml(
        "<Replay>" + "<a>".repeat(65) + "</a>".repeat(65) + "</Replay>"
      )
    ).toThrow(/depth/);
    expect(() =>
      parseReplayXml(
        "<Replay>" + "<a/>".repeat(REPLAY_LIMITS.xmlNodes) + "</Replay>"
      )
    ).toThrow(/node/);
  });
  it.each([undefined, "1"])(
    "enforces streamed byte limits with missing/false content length %s",
    async (length) => {
      let reads = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(64 * 1024));
        },
        cancel() {
          cancelled = true;
        }
      });
      const request = new Request("http://localhost/upload", {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: {
          "content-type": "multipart/form-data; boundary=x",
          ...(length ? { "content-length": length } : {})
        }
      } as RequestInit);
      await expect(readReplayUpload(request)).rejects.toMatchObject({
        status: 413
      });
      expect(reads).toBeLessThan(70);
      expect(cancelled).toBe(true);
    }
  );
  it.each(["extra-field", "extra-file", "duplicate-replay"])(
    "rejects extra multipart content: %s",
    async (kind) => {
      const form = new FormData();
      form.append("replay", new File([valid], "replay.xml"));
      if (kind === "extra-field") form.append("extra", "x");
      else
        form.append(
          kind === "duplicate-replay" ? "replay" : "extra",
          new File(["x"], "extra.xml")
        );
      await expect(
        readReplayUpload(
          new Request("http://localhost/upload", { method: "POST", body: form })
        )
      ).rejects.toThrow(/exactly one/);
    }
  );
});

describe("NUF-005 limit boundaries", () => {
  it("detects depth even when attribute values contain tag delimiters", () => {
    const deep =
      "<Replay>" +
      '<a text="/> >">'.repeat(65) +
      "</a>".repeat(65) +
      "</Replay>";
    expect(() => parseReplayXml(deep)).toThrow(/depth/);
  });
  it("enforces embedded message size before building its XML tree", () => {
    expect(() =>
      analyzeNufflizerInput(
        envelope(
          sequence([
            "<Unknown>" + "x".repeat(REPLAY_LIMITS.messageBytes) + "</Unknown>"
          ])
        )
      )
    ).toThrow(/size|too large/);
  });
  it("enforces the source-event cap", () => {
    const xml = envelope(
      "<EventActiveGamerChanged><NewActiveGamer>0</NewActiveGamer></EventActiveGamerChanged>".repeat(
        REPLAY_LIMITS.events + 1
      )
    );
    expect(() => analyzeNufflizerXml(xml)).toThrow(/event processing limit/);
  });
  it("accepts the exact file cap and rejects one byte more", async () => {
    for (const delta of [0, 1]) {
      const form = new FormData();
      form.append(
        "replay",
        new File(
          [valid + " ".repeat(REPLAY_LIMITS.inputBytes - valid.length + delta)],
          "boundary.xml"
        )
      );
      const result = readReplayUpload(
        new Request("http://localhost/upload", { method: "POST", body: form })
      );
      if (delta) await expect(result).rejects.toMatchObject({ status: 413 });
      else expect((await result).length).toBe(REPLAY_LIMITS.inputBytes);
    }
  });
});
