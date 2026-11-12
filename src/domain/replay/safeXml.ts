import { XMLParser } from "fast-xml-parser";
import { SaxesParser } from "saxes";
import { ReplayValidationError } from "@/lib/errors";
import { REPLAY_LIMITS } from "./limits";

function decodeText(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,
    (match, entity: string) => {
      const builtins: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'"
      };
      if (entity in builtins) return builtins[entity]!;
      const number = entity.startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
      if (
        !Number.isSafeInteger(number) ||
        number <= 0 ||
        number > 0x10ffff ||
        (number >= 0xd800 && number <= 0xdfff)
      )
        throw new ReplayValidationError("Invalid XML character reference.");
      return String.fromCodePoint(number);
    }
  );
}
export const SAFE_XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
  trimValues: true,
  processEntities: false,
  tagValueProcessor: (_tag: string, value: string) => decodeText(value),
  attributeValueProcessor: (_tag: string, value: string) => decodeText(value)
} as const;

declare const checkedXml: unique symbol;
export type ValidatedXml = string & { readonly [checkedXml]: true };

// Each factory is owned by one synchronous analysis, never shared across
// uploads. Saxes resets on close; a failed validator is discarded entirely.
export function createSafeXmlValidator() {
  let depth = 0;
  let nodes = 0;
  let validator: SaxesParser | undefined;
  function createValidator() {
    const current = new SaxesParser();
    const resetEntities = () => {
      current.ENTITIES = Object.assign(Object.create(null), {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'"
      });
    };
    resetEntities();
    current.on("ready", resetEntities);
    current.on("error", (error) => {
      // Valid opaque names such as &AMP; retain the existing literal contract.
      // Saxes checks their XML name first; no custom entity is expanded.
      if (error.message.endsWith(": undefined entity.")) return;
      throw error;
    });
    current.on("doctype", () => {
      throw new ReplayValidationError(
        "DOCTYPE and entity declarations are not supported."
      );
    });
    current.on("opentagstart", () => {
      nodes++;
      depth++;
      if (nodes > REPLAY_LIMITS.xmlNodes || depth > REPLAY_LIMITS.xmlDepth)
        throw new ReplayValidationError(
          "Replay XML exceeds the node/depth processing limit."
        );
    });
    current.on("closetag", () => {
      depth--;
    });
    return current;
  }
  return (
    xml: string,
    maxBytes: number = REPLAY_LIMITS.decodedBytes
  ): ValidatedXml => {
    if (Buffer.byteLength(xml, "utf8") > maxBytes)
      throw new ReplayValidationError("Replay XML is too large.");
    depth = 0;
    nodes = 0;
    validator ??= createValidator();
    try {
      validator.write(xml).close();
    } catch (error) {
      validator = undefined;
      if (error instanceof ReplayValidationError) throw error;
      if (error instanceof Error && /doctype/i.test(error.message))
        throw new ReplayValidationError(
          "DOCTYPE and entity declarations are not supported."
        );
      if (
        error instanceof Error &&
        /malformed character entity/.test(error.message)
      )
        throw new ReplayValidationError("Invalid XML character reference.");
      throw new ReplayValidationError(
        `Replay XML parse failed: ${error instanceof Error ? error.message.slice(0, 512) : "Invalid XML"}`
      );
    }
    return xml as ValidatedXml;
  };
}

// Validate the complete original source before either tree parser.
export function validateSafeXml(xml: string, maxBytes?: number): ValidatedXml {
  return createSafeXmlValidator()(xml, maxBytes);
}

export function createSafeXmlParser() {
  const validate = createSafeXmlValidator();
  const parser = new XMLParser(SAFE_XML_OPTIONS);
  return (xml: string, maxBytes?: number): Record<string, unknown> =>
    parser.parse(validate(xml, maxBytes)) as Record<string, unknown>;
}

export function parseSafeXml(
  xml: string,
  maxBytes?: number
): Record<string, unknown> {
  return createSafeXmlParser()(xml, maxBytes);
}

export function parseValidatedXml(
  xml: ValidatedXml,
  envelopeOnly = false
): Record<string, unknown> {
  return new XMLParser({
    ...SAFE_XML_OPTIONS,
    // The ordered parser owns these steps. The envelope parse needs only
    // top-level metadata; it need not allocate a second tree of the match.
    ...(envelopeOnly
      ? { stopNodes: ["Replay.ReplayStep", "MatchReplay.ReplayStep"] }
      : {})
  }).parse(xml) as Record<string, unknown>;
}

export type XmlProjection = { readonly [field: string]: true | XmlProjection };

// ReplayStep/BoardState contains repeated snapshots whose only consumers use
// the fields in this projection. Operate on already validated source and
// retain every sibling, so replay step/message locators stay exact.
export function projectReplayBoards(
  xml: ValidatedXml,
  fields: XmlProjection
): ValidatedXml {
  // Numeric references must still reach the parser's codepoint checks even
  // when they occur in otherwise unused data.
  if (!xml.includes("<BoardState") || xml.includes("&#")) return xml;
  const tokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([^\s<>"'!?/]+)(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
  const names: string[] = [];
  const rules: (true | XmlProjection | undefined)[] = [];
  const parts: string[] = [];
  let skipDepth = -1;
  let keepFrom = 0;
  for (const match of xml.matchAll(tokens)) {
    const [tag, closing, name] = match;
    if (!name) continue;
    if (closing) {
      if (names.pop() !== name) return xml;
      rules.pop();
      if (skipDepth === names.length) {
        keepFrom = match.index + tag!.length;
        skipDepth = -1;
      }
      continue;
    }
    const depth = names.length;
    const parent = rules[depth - 1];
    const empty = tag!.endsWith("/>");
    let rule: true | XmlProjection | undefined =
      parent === true ? true : undefined;
    if (skipDepth < 0 && parent && parent !== true) {
      if (Object.hasOwn(parent, name)) {
        rule = parent[name];
      } else {
        parts.push(xml.slice(keepFrom, match.index));
        if (empty) keepFrom = match.index + tag!.length;
        else skipDepth = depth;
      }
    } else if (
      depth === 2 &&
      (names[0] === "Replay" || names[0] === "MatchReplay") &&
      names[1] === "ReplayStep" &&
      name === "BoardState"
    ) {
      rule = fields;
    }
    if (!empty) {
      names.push(name);
      rules.push(rule);
    }
  }
  if (names.length || skipDepth !== -1 || parts.length === 0) return xml;
  parts.push(xml.slice(keepFrom));
  return parts.join("") as ValidatedXml;
}
