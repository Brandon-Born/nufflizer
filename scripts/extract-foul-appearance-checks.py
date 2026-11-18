"""Join raw public Foul Appearance dice to their step and opposing skill use."""

from fractions import Fraction
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "inventory", Path(__file__).with_name("inventory-replay-actions.py")
)
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


def observe(board, roster):
    for side, team in enumerate(board.findall("./ListTeams/TeamState")):
        team_id = team.findtext("./Data/TeamId") or str(side)
        for player in team.findall("./ListPitchPlayers/PlayerState"):
            roster[player.findtext("Id")] = team_id


for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inventory.parse_xml(inventory.decode_replay(path))
    roster = {}
    observe(root.find(".//InitialBoardState"), roster)
    rows = []
    for replay_step, frame in enumerate(root.findall("ReplayStep"), 1):
        for child_index, child in enumerate(frame):
            if child.tag == "BoardState":
                observe(child, roster)
            if child.tag != "EventExecuteSequence":
                continue
            prior = {}
            for step_index, step in enumerate(child.iter("StepResult")):
                head = inventory.decode_message(step.findtext("./Step/MessageData"))
                messages = [
                    inventory.decode_message(part.findtext("MessageData"))
                    for part in step.iter("StringMessage")
                ]
                for message_index, roll in enumerate(messages):
                    if roll.tag != "ResultRoll" or roll.findtext("RollType") != "37":
                        continue
                    actor, defender = [head.findtext(key) for key in ("PlayerId", "TargetId")]
                    use = messages[message_index - 1]
                    trigger = messages[message_index - 2]
                    assert use.tag == "ResultSkillUsage" and use.findtext("Skill") == "10"
                    assert use.findtext("PlayerId") == defender and roster[actor] != roster[defender]
                    requirement, face = map(int, [roll.findtext("Difficulty"), roll.findtext("Dice/Die/Value")])
                    passed = face >= requirement
                    assert int(roll.findtext("Outcome")) == passed
                    chance = Fraction(sum(d >= requirement for d in range(1, 7)), 6)
                    delta = int(passed) - chance
                    previous = None
                    if trigger.tag == "ResultSkillUsage":
                        assert trigger.findtext("Skill") == "36" and trigger.findtext("PlayerId") == actor
                        outcome_index, outcome = prior["ResultBlockOutcome"]
                        assert outcome.findtext("Follow") == "1" and outcome.findtext("Outcome") == "4"
                        assert outcome.findtext("AttackerId") == actor and outcome.findtext("DefenderId") == defender
                        previous = [replay_step, child_index, step_index - 1, outcome_index]
                    else:
                        assert trigger.tag == "ResultUseAction" and trigger.findtext("Action") in ("2", "3")
                    rows.append({
                        "locator": [replay_step, child_index, step_index, message_index],
                        "actor": actor, "actorTeam": roster[actor],
                        "defender": defender, "defenderTeam": roster[defender],
                        "face": face, "target": requirement, "passed": passed,
                        "delta": [delta.numerator, delta.denominator],
                        "action": int(trigger.findtext("Action")) if previous is None else None,
                        "previous": previous,
                    })
                prior = {msg.tag: (i, msg) for i, msg in enumerate(messages)}
    print(json.dumps({"file": path.name, "rows": rows}))
