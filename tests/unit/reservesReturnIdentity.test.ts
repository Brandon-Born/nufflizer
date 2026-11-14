import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { regenerationReturnXml } from "../helpers/regenerationReturn";

// Synthetic serialized source evidence. The roster namespace/type changes
// after a real recovery/reserves prefix; later unchanged boards cannot repair it.
describe("reserves-return first-instance continuity", () => {
  it.each(["third_team", "duplicate_team", "three_rosters", "type_change"])(
    "withholds a return across raw %s",
    (field) => {
      const xml = regenerationReturnXml().replace(
        /<BoardState>([\s\S]*?)<\/BoardState>/g,
        (_m, board: string) => {
          if (
            field === "type_change" &&
            board.includes("<Situation>1</Situation>")
          )
            board = board.replace(
              "<Id>42</Id>",
              "<Id>42</Id><Data><Id>42</Id><IdPlayerTypes>4</IdPlayerTypes></Data>"
            );
          if (board.includes("<CurrentPhase>3</CurrentPhase>")) {
            if (field === "third_team")
              board = board.replace("<TeamId>1</TeamId>", "<TeamId>9</TeamId>");
            if (field === "duplicate_team")
              board = board.replace("<TeamId>1</TeamId>", "<TeamId>0</TeamId>");
            if (field === "three_rosters")
              board = board.replace(
                "</ListTeams>",
                "<TeamState><Data><TeamId>9</TeamId></Data><ListPitchPlayers/></TeamState></ListTeams>"
              );
            if (field === "type_change")
              board = board.replace(
                "<Id>42</Id>",
                "<Id>42</Id><Data><Id>42</Id><IdPlayerTypes>5</IdPlayerTypes></Data>"
              );
          }
          return `<BoardState>${board}</BoardState>`;
        }
      );
      const r = analyzeNufflizerInput(xml),
        e = r.events.find((e) => e.metadata.regenerationReturn)!;
      expect(e.metadata.regenerationReturn).toMatchObject({
        status: "unverified",
        stop: { reason: "roster_conflict" }
      });
      expect(e.weightedDelta).toBe(3 / 4);
    }
  );
});

it.each([4, 5])(
  "keeps a known reserve type through omissions before later type%s",
  (type) => {
    const xml = regenerationReturnXml().replace(
      /<BoardState>([\s\S]*?)<\/BoardState>/g,
      (_m, board: string) => {
        if (board.includes("<Situation>1</Situation>"))
          board = board.replace(
            "<Id>42</Id>",
            "<Id>42</Id><Data><Id>42</Id><IdPlayerTypes>4</IdPlayerTypes></Data>"
          );
        else if (board.includes("<CurrentPhase>5</CurrentPhase>"))
          board = board.replace(
            "<Id>42</Id>",
            `<Id>42</Id><Data><Id>42</Id><IdPlayerTypes>${type}</IdPlayerTypes></Data>`
          );
        return `<BoardState>${board}</BoardState>`;
      }
    );
    const r = analyzeNufflizerInput(xml),
      trace = r.events.find((e) => e.metadata.regenerationReturn)!.metadata
        .regenerationReturn!;
    expect(trace.status).toBe("observed");
    if (trace.status !== "observed") throw new Error("Earlier setup missing");
    if (type === 5) {
      expect(trace.playing).toBeUndefined();
      expect(trace.activation).toBeUndefined();
      expect(trace.stop?.reason).toBe("roster_conflict");
    } else expect(trace.activation).toBeDefined();
  }
);
