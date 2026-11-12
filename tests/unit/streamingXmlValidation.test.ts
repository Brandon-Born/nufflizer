import { describe, expect, it } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { parseSafeXml, validateSafeXml } from "@/domain/replay/safeXml";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { ReplayValidationError } from "@/lib/errors";

describe("streaming XML preflight keeps original-source safety and text semantics", () => {
  it.each([
    "<Replay/>",
    '\uFEFF<?xml version="1.0"?><Replay><Empty/></Replay>',
    "<Replay><!-- <!DOCTYPE x> <wrong> --><![CDATA[<!DOCTYPE x><wrong> &bogus;]]></Replay>",
    '<Replay><?note value?><Entry quoted="1 > 0" other="a / b"/></Replay>',
    '<Replay><Élément 属性="value">&#x1f600; &amp; &lt;</Élément></Replay>',
    '<Replay><Entry a="&quot;" b="&apos;">a &gt; b</Entry></Replay>'
  ])("accepts unchanged valid source %s", (xml) => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(validateSafeXml(xml)).toBe(xml);
  });

  it("preserves opaque valid entity names without expanding or rewriting source", () => {
    const text =
      "&AMP; &unknown; &constructor; &__proto__; &toString; &Éclair;";
    const xml = "<Replay>" + text + "</Replay>";
    expect(validateSafeXml(xml)).toBe(xml);
    expect(parseSafeXml(xml).Replay).toBe(text);
    expect(parseSafeXml("<Replay>&amp;lt; &#x1f600;</Replay>").Replay).toBe(
      "&lt; 😀"
    );
  });

  it.each([
    "<Replay><a></Replay>",
    '<Replay a="1" a="2"/>',
    "<Replay a=unquoted/>",
    "<Replay><a",
    "<Replay>&bad name;</Replay>",
    "<Replay>&;</Replay>",
    '<Replay a="raw < tag"/>',
    "<Replay><!-- bad -- comment --></Replay>",
    "<Replay><![CDATA[unfinished</Replay>",
    "<Replay/>trailing",
    "<Replay/><Other/>",
    "<Replay>&#xnothex;</Replay>"
  ])("rejects malformed original source %s", (xml) => {
    expect(() => validateSafeXml(xml)).toThrow(ReplayValidationError);
  });

  it.each(["0", "1", "xD800", "x110000", "999999999999999999999999"])(
    "rejects invalid numeric reference %s before projection",
    (code) => {
      expect(() =>
        validateSafeXml("<Replay><Ignored>&#" + code + ";</Ignored></Replay>")
      ).toThrow(/character reference/);
    }
  );

  it.each([
    "<!DOCTYPE Replay><Replay/>",
    '<!DOCTYPE Replay [<!ENTITY x "expanded">]><Replay>&x;</Replay>',
    '<!DOCTYPE Replay SYSTEM "https://invalid.example/schema"><Replay/>',
    "<Replay><!DOCTYPE inner><inner/></Replay>",
    '<Replay><!ENTITY x "expanded"></Replay>'
  ])("rejects declarations without fetching or expanding %s", (xml) => {
    expect(() => validateSafeXml(xml)).toThrow(ReplayValidationError);
  });

  it("counts Unicode elements and self-closing siblings in the original source", () => {
    const depth = (n: number) => "<É>".repeat(n) + "</É>".repeat(n);
    expect(validateSafeXml(depth(REPLAY_LIMITS.xmlDepth))).toBeTruthy();
    expect(() => validateSafeXml(depth(REPLAY_LIMITS.xmlDepth + 1))).toThrow(
      /node\/depth/
    );
    expect(() =>
      validateSafeXml(
        "<Replay>" + "<É/>".repeat(REPLAY_LIMITS.xmlNodes) + "</Replay>"
      )
    ).toThrow(/node\/depth/);
  });

  it("enforces UTF-8 bytes before parsing and ignores tag-like comments for depth", () => {
    expect(() => validateSafeXml("<Replay>😀</Replay>", 18)).toThrow(
      /too large/
    );
    const xml =
      "<Replay><!-- " +
      "<É>".repeat(100) +
      " --><![CDATA[" +
      "<É>".repeat(100) +
      "]]></Replay>";
    expect(validateSafeXml(xml)).toBe(xml);
  });
  it("bounds diagnostic text for a long unclosed source tag", () => {
    try {
      validateSafeXml("<Replay><" + "a".repeat(3000) + ">");
      throw new Error("Expected malformed XML to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplayValidationError);
      expect((error as Error).message.length).toBeLessThanOrEqual(540);
    }
  });

});
