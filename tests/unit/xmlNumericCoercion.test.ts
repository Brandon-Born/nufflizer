import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { parseSafeXml } from "@/domain/replay/safeXml";

// This is the upstream parser without the optimized processor, not a second
// implementation of the fast path. Compare exact value types and signed zero.
const reference = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
  trimValues: true,
  processEntities: false
});

describe("ordinary XML numbers retain upstream coercion semantics", () => {
  it.each([
    "0",
    "-0",
    "+0",
    "00",
    "-00",
    "+000",
    "1",
    "-1",
    "+1",
    "001",
    "999999999999999",
    "-999999999999999",
    "+999999999999999",
    "1000000000000000",
    "9007199254740991",
    "9007199254740992",
    "9007199254740993",
    "-9007199254740993",
    "000000000000000000001",
    "1.0",
    "0.000",
    "-0.0",
    ".1",
    "1.",
    "01e1",
    "00e1",
    "1e1000",
    "0x10",
    "-0x10",
    "+0x10",
    "0b10",
    "0o10",
    "NaN",
    "Infinity",
    "-Infinity",
    "true",
    "false",
    "TRUE",
    "false0",
    "Infinity ",
    "ordinary text",
    "PD94bWwgdmVyc2lvbj0iMS4wIj8+",
    "١",
    "１",
    " 003 ",
    "+",
    "-",
    "",
    "1 2",
    "1_000",
    "001abc"
  ])("matches the original parser for %j", (value) => {
    const xml = `<Value>${value}</Value>`;
    const expected = reference.parse(xml) as { Value: unknown };
    expect(parseSafeXml(xml).Value).toBe(expected.Value);
  });

  it("matches a deterministic sample of ordinary decimal spellings", () => {
    for (let n = -997; n <= 997; n += 17) {
      for (const value of [String(n), n < 0 ? `-000${-n}` : `+000${n}`]) {
        const xml = `<Value>${value}</Value>`;
        expect(parseSafeXml(xml).Value).toBe(reference.parse(xml).Value);
      }
    }
  });

  it("keeps character-reference processor results as strings and decodes once", () => {
    expect(parseSafeXml("<Value>&#49;</Value>").Value).toBe("1");
    expect(parseSafeXml("<Value>&#116;rue</Value>").Value).toBe("true");
    expect(parseSafeXml("<Value>&amp;#49;</Value>").Value).toBe("&#49;");
    expect(parseSafeXml("<Value>&AMP;</Value>").Value).toBe("&AMP;");
    expect(parseSafeXml("<Value><![CDATA[&#49;]]></Value>").Value).toBe("1");
  });

  it("keeps attributes as strings and preserves mixed text and CDATA", () => {
    const xml = '<Value n="001" b="true">001</Value>';
    expect(parseSafeXml(xml)).toEqual(reference.parse(xml));
    expect(parseSafeXml('<Value n="&#49;">1</Value>')).toEqual({
      Value: { "#text": 1, n: "1" }
    });
    for (const xml of [
      "<Value><![CDATA[001]]></Value>",
      "<Value><![CDATA[true ]]></Value>",
      "<Value><![CDATA[ false]]></Value>",
      "<Value><![CDATA[ordinary text ]]></Value>",
      "<Value><![CDATA[Infinity ]]></Value>",
      "<Value><![CDATA[true\u00a0]]></Value>",
      "<Value>00<![CDATA[01]]></Value>",
      "<Value>00<Empty/>01</Value>",
      "<Value><A>-0</A><A>0001</A><B>false</B></Value>"
    ])
      expect(parseSafeXml(xml)).toEqual(reference.parse(xml));
  });
});
