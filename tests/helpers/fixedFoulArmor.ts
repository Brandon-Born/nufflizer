import { playbackFragmentXml } from "./playback";
import { encodedMessage } from "./replay";

// Source-derived UI-015 shapes, with explicitly synthetic complete current
// rosters/empty fouler skills. The captured playback alone omits those traits.
export function fixedFoulArmorXml(a: number, b: number, skills: number[] = []) {
  const seed = (id: number) =>
    `<Cell><X>${id === 8 || id === 5 ? 21 : id === 10 ? 19 : 20}</X><Y>${id === 6 || id === 5 ? 7 : 6}</Y></Cell><Data><Id>${id}</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills>${(id === 6 ? skills : []).map((s) => `<InnateSkillsItem>${s}</InnateSkillsItem>`).join("")}</InnateSkills><AcquiredSkills/></Data><Effects/>`;
  let xml = playbackFragmentXml("001", "UI-015", [5, 6, 8, 10], [44])
    .replace(
      "<InitialBoardState>",
      "<InitialBoardState><CurrentPhase>5</CurrentPhase><Effects/>"
    )
    .replaceAll(
      "<TeamState>",
      "<TeamState><Effects/><ActivePrayers/><TransformedPlayers/>"
    )
    .replace(
      /<PlayerState><Id>(\d+)<\/Id>/g,
      (_, id) => `<PlayerState><Id>${id}</Id>${seed(Number(id))}`
    );
  xml = xml.replace(
    /<StringMessage><MessageData>(.*?)<\/MessageData><\/StringMessage>/g,
    (all, data) => {
      let body = Buffer.from(
        Buffer.from(data, "base64").toString(),
        "base64"
      ).toString();
      if (body.startsWith("<ResultInjuryRoll>") && a + b < 5) return "";
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
            `<Outcome>${Number(a + b >= 5)}</Outcome>`
          );
        return `<StringMessage><MessageData>${encodedMessage(body)}</MessageData></StringMessage>`;
      }
      return all;
    }
  );
  return xml;
}
