import { categoricalInjuryXml } from "./categoricalInjury";
import { encodedMessage } from "./replay";
// Explicit synthetic source encoding, matching the separately witnessed pending
// original root. The wire code is NOT a direct injury outcome lookup.
function injuryQuestionXml(
  o: Parameters<typeof categoricalInjuryXml>[0] = {},
  duplicate = false,
  ko = false
) {
  let converted = 0;
  const xml = categoricalInjuryXml(o).replace(
    /<MessageData>([^<]+)<\/MessageData>/g,
    (whole, payload: string) => {
      const raw = Buffer.from(
        Buffer.from(payload, "base64").toString("utf8"),
        "base64"
      ).toString("utf8");
      if (!raw.startsWith("<ResultInjuryRoll>")) return whole;
      converted++;
      const next = raw
        .replace(
          "<ResultInjuryRoll>",
          ko
            ? "<QuestionKORecovery><GamerId>0</GamerId><Staffs><StaffsItem>2</StaffsItem></Staffs><RollInfos>"
            : "<QuestionApothecaryCasualtyUsage><GamerId>0</GamerId><RollInfos>"
        )
        .replace(
          "</ResultInjuryRoll>",
          ko
            ? "</RollInfos></QuestionKORecovery>"
            : "</RollInfos></QuestionApothecaryCasualtyUsage>"
        )
        .replace(
          "<Outcome>3</Outcome>",
          ko ? "<Outcome>3</Outcome>" : "<Outcome>1</Outcome>"
        );
      const message = `<MessageData>${encodedMessage(next)}</MessageData>`;
      return duplicate
        ? `${whole}</StringMessage><StringMessage>${message}`
        : message;
    }
  );
  if (converted !== 1)
    throw Error("Expected one synthetic initial injury field");
  return xml;
}

export const staffInjuryXml = (
  o: Parameters<typeof categoricalInjuryXml>[0] = {},
  duplicate = false
) => injuryQuestionXml(o, duplicate, false);
export const koInjuryXml = (
  o: Parameters<typeof categoricalInjuryXml>[0] = {},
  duplicate = false
) => injuryQuestionXml(o, duplicate, true);

export function mapEncodedInjuryMessages(
  xml: string,
  change: (raw: string) => string
) {
  return xml.replace(
    /<MessageData>([^<]+)<\/MessageData>/g,
    (_whole, payload: string) => {
      const raw = Buffer.from(
        Buffer.from(payload, "base64").toString("utf8"),
        "base64"
      ).toString("utf8");
      return `<MessageData>${encodedMessage(change(raw))}</MessageData>`;
    }
  );
}

// Append a separate synthetic current roster/transaction. The earlier Rush
// uses different players; no traits or outcomes are inserted into its prefix.
export function appendStaffInjuryTransaction(xml: string) {
  const renumber = (raw: string) =>
    raw.replace(
      /<(Id|PlayerId|TargetId|AttackerId|DefenderId|PushedPlayerId)>(42|7)<\/(\1)>/g,
      (_m, tag: string, id: string) =>
        `<${tag}>${id === "42" ? 88 : 89}</${tag}>`
    );
  const bonus = mapEncodedInjuryMessages(
    renumber(staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 })),
    renumber
  );
  const board = bonus.match(
    /<InitialBoardState>([\s\S]*?)<\/InitialBoardState>/
  )![1]!;
  const sequence = bonus.match(
    /<EventExecuteSequence>([\s\S]*?)<\/EventExecuteSequence>/
  )![1]!;
  return xml.replace(
    "</Replay>",
    `<ReplayStep><BoardState>${board}</BoardState><EventExecuteSequence>${sequence}</EventExecuteSequence></ReplayStep></Replay>`
  );
}
