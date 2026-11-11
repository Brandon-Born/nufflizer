"""Reproduce numeric public-demo activation aftermath extracts.

Run from the repository root: python3 scripts/extract-activation-evidence.py
Original source locators are retained; arbitrary text is excluded.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("inventory", "scripts/inventory-replay-actions.py")
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


def board_projection(node):
    # No application parsing, attribution, mapping or state reconstruction.
    board = inventory.numeric_projection(node)
    board = {k: v for k, v in board.items() if k in {
        "IsStable", "CurrentPhase", "ActiveTeam", "ActivePlayer", "Period",
        "TurnsPerPeriod", "Ball", "ListTeams"
    }}
    for team in board.get("ListTeams", [{}])[0].get("TeamState", []):
        for key in list(team):
            if key not in {"Data", "GameTurn", "ListPitchPlayers", "Side"}:
                del team[key]
        if "Data" in team:
            team["Data"] = [{k: v for k, v in team["Data"][0].items() if k == "TeamId"}]
        for player in team.get("ListPitchPlayers", [{}])[0].get("PlayerState", []):
            for key in list(player):
                if key not in {"Id", "CanAct", "Cell", "Status", "Situation", "MovePoint", "TackleZone"}:
                    del player[key]
    return board


cases = []
selections = [
    ("demo10.bbr", "bone_head_fresh", [231, 232, 233]),
    ("demo1.bbr", "really_stupid_kept", [92, 93, 94, 95]),
    ("demo-goblins1.bbr", "failed_loner_unsupported", [264, 265, 266, 267]),
    ("demo1.bbr", "ordinary_move", [91, 92, 93]),
]
for filename, kind, replay_steps in selections:
    source = Path("demo-replays") / filename
    root = inventory.parse_xml(inventory.decode_replay(source))
    sequence = 0
    records = []
    for number, outer in enumerate(root.findall("ReplayStep"), 1):
        for child_index, child in enumerate(outer):
            if child.tag == "EventExecuteSequence":
                sequence += 1
                if number not in replay_steps:
                    continue
                rows = []
                for step_index, result in enumerate(child.iter("StepResult")):
                    step = inventory.decode_message(result.findtext("./Step/MessageData"))
                    messages = [inventory.decode_message(x.findtext("MessageData")) for x in result.iter("StringMessage")]
                    rows.append({
                        "stepIndex": step_index,
                        "step": {step.tag: inventory.numeric_projection(step)},
                        "messages": [{x.tag: inventory.numeric_projection(x)} for x in messages],
                    })
                records.append({"replayStep": number, "childIndex": child_index, "sequence": sequence, "steps": rows})
            elif number in replay_steps and child.tag == "BoardState":
                records.append({"replayStep": number, "childIndex": child_index, "projection": {child.tag: board_projection(child)}})
    cases.append({"id": kind, "sourceFile": filename, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "records": records})

output = {
    "purpose": "Independent numeric source extracts for activation aftermath; copied by Python stdlib decoding, without application semantics. Names and arbitrary text omitted. Fragment locators are renumbered by the test helper. No full duration or scoring policy acceptance is claimed.",
    "replayVersion": "1-4-0-0",
    "cases": cases,
}
Path("tests/fixtures/evidence/bb3-activation-aftermath.json").write_text(json.dumps(output, indent=2) + "\n")
print([(case["id"], len(case["records"])) for case in cases])
