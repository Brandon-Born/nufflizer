import { mentalNotificationXml } from "./mentalNotification";
import { mapEncodedInjuryMessages } from "./staffInjuryOriginal";

// Separate current roster/learned-list probe after the existing synthetic
// context transaction. It cannot change the earlier Rush pre-roll evidence.
export function appendIntrinsicContinuityProbe(xml: string) {
  const rename = (s: string) =>
    s.replace(
      /<(Id|PlayerId|TargetId|AttackerId|DefenderId)>(42|7|99)<\/(\1)>/g,
      (_m, tag: string, id: string) =>
        `<${tag}>${({ 42: 142, 7: 107, 99: 199 } as Record<string, number>)[id]}</${tag}>`
    );
  const raw = mapEncodedInjuryMessages(
    rename(mentalNotificationXml("ResultEndPlayerEffect")),
    rename
  );
  const board = raw.match(
    /<InitialBoardState>([\s\S]*?)<\/InitialBoardState>/
  )![1]!;
  const tail = raw
    .split("</InitialBoardState></NotificationGameJoined>")[1]!
    .replace("</Replay>", "");
  const ko =
    "<EventRoll><Requirement>4</Requirement><Difficulty>4</Difficulty><RollType>13</RollType><PlayerId>199</PlayerId><Modifiers/><Dice><Die><Value>2</Value></Die></Dice></EventRoll>";
  return xml.replace(
    "</Replay>",
    `<ReplayStep><BoardState>${board}</BoardState>${ko}</ReplayStep>${tail}</Replay>`
  );
}
