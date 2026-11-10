import { XMLParser, XMLValidator } from "fast-xml-parser";
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

// Run before either XML parser allocates a tree. Comments/CDATA are skipped as whole tokens.
export function validateSafeXml(
  xml: string,
  maxBytes: number = REPLAY_LIMITS.decodedBytes
): ValidatedXml {
  if (Buffer.byteLength(xml, "utf8") > maxBytes)
    throw new ReplayValidationError("Replay XML is too large.");
  let depth = 0;
  let nodes = 0;
  const tokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[A-Za-z_](?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
  for (const match of xml.matchAll(tokens)) {
    const token = match[0];
    if (
      token.startsWith("<!--") ||
      token.startsWith("<![CDATA[") ||
      token.startsWith("<?")
    )
      continue;
    if (token.startsWith("<!"))
      throw new ReplayValidationError(
        "DOCTYPE and entity declarations are not supported."
      );
    if (token.startsWith("</")) {
      depth -= 1;
      continue;
    }
    nodes += 1;
    if (!token.endsWith("/>")) depth += 1;
    if (nodes > REPLAY_LIMITS.xmlNodes || depth > REPLAY_LIMITS.xmlDepth) {
      throw new ReplayValidationError(
        "Replay XML exceeds the node/depth processing limit."
      );
    }
  }
  const valid = XMLValidator.validate(xml);
  if (valid !== true)
    throw new ReplayValidationError(
      `Replay XML parse failed: ${valid.err.msg}`
    );
  return xml as ValidatedXml;
}

export function parseSafeXml(
  xml: string,
  maxBytes?: number
): Record<string, unknown> {
  return parseValidatedXml(validateSafeXml(xml, maxBytes));
}

export function parseValidatedXml(xml: ValidatedXml): Record<string, unknown> {
  return new XMLParser(SAFE_XML_OPTIONS).parse(xml) as Record<string, unknown>;
}
