import { categoricalInjuryXml } from "./categoricalInjury";
import { encodedMessage } from "./replay";
// Same complete pre-roll skill/state scaffold for every face. The policy,
// never the observed report, chooses the post-roll Mighty Blow use.
export function armorChoicePolicyXml(a: number, b: number, use: boolean) {
  const broken = a + b >= 8 || use;
  return categoricalInjuryXml({
    attackerSkills: [13],
    armorMightyBlow: use,
    dice: [1, 1],
    outcome: 0,
    state: 1
  }).replace(
    /<StringMessage><MessageData>(.*?)<\/MessageData><\/StringMessage>/g,
    (all, data) => {
      let body = Buffer.from(
        Buffer.from(data, "base64").toString(),
        "base64"
      ).toString();
      if (body.startsWith("<ResultInjuryRoll>") && !broken) return "";
      if (
        body.startsWith("<ResultRoll>") &&
        body.includes("<RollType>10</RollType>")
      ) {
        body = body
          .replace(
            /<Dice>.*?<\/Dice>/,
            `<Dice><Die><DieType>0</DieType><Value>${a}</Value></Die><Die><DieType>0</DieType><Value>${b}</Value></Die></Dice>`
          )
          .replace(
            /<Outcome>.*?<\/Outcome>/,
            `<Outcome>${Number(broken)}</Outcome>`
          );
        return `<StringMessage><MessageData>${encodedMessage(body)}</MessageData></StringMessage>`;
      }
      return all;
    }
  );
}
