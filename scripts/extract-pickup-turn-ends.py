"""Read direct pickup, bounce, turn-end, and board facts from public BBRs."""

import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "inventory", Path(__file__).with_name("inventory-replay-actions.py")
)
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)

DIRECTIONS = ((-1, 1), (0, 1), (1, 1), (-1, 0), (1, 0), (-1, -1), (0, -1), (1, -1))
CONTROLS = (
    "EventActiveGamerChanged",
    "EventPauseActiveTimer",
    "EventActiveTimerChanged",
    "EventRulesEngineStandBy",
    "BoardState",
)


def scalar(node, key):
    value = node.findtext(key)
    return None if value is None else int(value)


def cell(node, key):
    return {"x": scalar(node, f"{key}/X"), "y": scalar(node, f"{key}/Y")}


def steps(sequence):
    for step in sequence.iter("StepResult"):
        yield (
            inventory.decode_message(step.findtext("./Step/MessageData")),
            [inventory.decode_message(m.findtext("MessageData")) for m in step.iter("StringMessage")],
        )


def observations(root):
    for frame_id, frame in enumerate(root.findall("ReplayStep"), 1):
        for child_id, child in enumerate(frame):
            if child.tag != "EventEndTurn" or child_id == 0 or child.findtext("Reason") != "2":
                continue
            previous = frame[child_id - 1]
            if previous.tag != "EventExecuteSequence":
                continue
            execution = list(steps(previous))
            if len(execution) < 2:
                continue
            header, pickup_messages = execution[-2]
            bounce, direction_messages = execution[-1]
            if not pickup_messages or len(direction_messages) != 1:
                continue
            pickup = pickup_messages[-1]
            direction = direction_messages[0]
            if (
                header.tag != "PlayerStep" or header.findtext("StepType") != "1"
                or pickup.tag != "ResultRoll" or pickup.findtext("RollType") != "4"
                or pickup.findtext("Outcome") != "0"
                or bounce.tag != "BallStep" or bounce.findtext("BallId") != "0"
                or direction.tag != "ResultRoll" or direction.findtext("RollType") != "25"
            ):
                continue
            start = cell(bounce, "CellFrom")
            landing = cell(bounce, "CellTo")
            assert start == cell(header, "CellTo")
            assert direction.findtext("Dice/Die/DieType") == "1"
            dx, dy = DIRECTIONS[scalar(direction, "Dice/Die/Value") - 1]
            assert landing == {"x": start["x"] + dx, "y": start["y"] + dy}
            controls = list(frame)[child_id + 1 : child_id + 6]
            snapshot = None
            if tuple(node.tag for node in controls) == CONTROLS:
                board = controls[-1]
                if (board.findtext("IsStable") == "1" and cell(board, "Ball/Cell") == landing
                    and board.findtext("Ball/Carrier") is None and board.findtext("Ball/IsHeld") != "1"):
                    snapshot = {
                        "locator": [frame_id, child_id + 5],
                        "isHeld": None if board.findtext("Ball/IsHeld") is None else False,
                        "gamer": scalar(board, "ActiveGamer"),
                    }
            yield {
                "pickup": [frame_id, child_id - 1, len(execution) - 2, len(pickup_messages) - 1],
                "bounce": [frame_id, child_id - 1, len(execution) - 1, 0],
                "end": [frame_id, child_id],
                "gamer": scalar(child, "NextPlayingGamer"),
                "snapshot": snapshot,
                "landing": landing,
            }


for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inventory.parse_xml(inventory.decode_replay(path))
    print(json.dumps({"file": path.name, "rows": list(observations(root))}))
