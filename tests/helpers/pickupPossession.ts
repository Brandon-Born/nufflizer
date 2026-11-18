import { lonerDriveXml } from "./lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";

export function demo8PickupWithNeighbor(xml: string, neighbor: "occupied" | "unknown_marking") {
  const replay = parseReplayXml(xml);
  const playerId = neighbor === "occupied" ? 10 : 37;
  const location = { x: neighbor === "occupied" ? 7 : 8, y: 3 };
  // Hold the player's position fixed at both frames in this controlled variant.
  for (const after of [208, 214]) {
    const board = replay.boardCheckpoints!.find((cp) => cp.afterSourceIndex === after)!.board!;
    const player = board.teams.flatMap((team) => team.players).find((p) => p.id === playerId)!;
    player.cell = { ...location };
  }
  return replay;
}

type Player = {
  Id: string[];
  Cell: { X: string[]; Y: string[] }[];
  Data?: { Id: string[]; InnateSkills: unknown[]; AcquiredSkills: string[] }[];
  Effects?: string[];
};
type Board = {
  ListTeams: {
    TeamState: { ListPitchPlayers: { PlayerState: Player[] }[] }[];
  }[];
};
type Roll = {
  RollType: string[];
  Status: string[];
  Outcome: string[];
  Dice: { Die: { Value: string[] }[] }[];
};

// Keep demo6's independently projected ordinary move and Sure Hands
// transaction. Supply controlled current traits and move one opposing marker
// in the exposed variant. Stop at the replacement so a later board cannot
// leak into the estimate and the same prefix supports all six outcomes.
export function settledPickupXml(
  exposed: boolean,
  face = 1,
  omitEffects = false
) {
  return lonerDriveXml(
    "pickup_terminal_failure",
    "tests/fixtures/evidence/bb3-pickup-successors.json",
    (rows) => {
      const rollIndex = rows.findIndex(
        (row) => row.replayStep === 306 && row.steps
      );
      const row = rows[rollIndex]!;
      rows.splice(rollIndex + 1);
      const { BoardState } = rows.find(
        (entry) => entry.replayStep === 305 && entry.projection?.BoardState
      )!.projection!;
      const teams = (BoardState as Board).ListTeams[0]!.TeamState;
      for (const player of teams.flatMap(
        (team) => team.ListPitchPlayers[0]!.PlayerState
      )) {
        const id = player.Id[0];
        player.Data = [
          {
            Id: player.Id,
            InnateSkills: id === "1" ? [{ InnateSkillsItem: ["61"] }] : [""],
            AcquiredSkills: [""]
          }
        ];
        if (!(omitEffects && id === "41")) player.Effects = [""];
        if (exposed && id === "41") player.Cell = [{ X: ["3"], Y: ["7"] }];
      }
      const last = row.steps!.findIndex((entry) =>
        entry.messages.some(
          (m) =>
            (m.ResultRoll as Roll | undefined)?.Status[0] === "2" &&
            (m.ResultRoll as Roll).RollType[0] === "4"
        )
      );
      const messages = row.steps![last]!.messages;
      const replacement = messages.findIndex(
        (m) => (m.ResultRoll as Roll | undefined)?.Status[0] === "2"
      );
      const roll = messages[replacement]!.ResultRoll as Roll;
      messages.splice(replacement + 1);
      row.steps!.splice(last + 1);
      roll.Dice[0]!.Die[0]!.Value = [String(face)];
      roll.Outcome = [face >= 3 ? "1" : "0"];
    }
  );
}
