"""Raw original-die questions, selected without any later result or app policy."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("inventory", "scripts/inventory-replay-actions.py")
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

def number(node, key):
    try:
        return int(node.findtext(key))
    except (TypeError, ValueError, AttributeError):
        return None

def project(node):
    value = inv.numeric_projection(node)
    if isinstance(value, dict):
        for child in node:
            if child.tag in ["Modifiers", "Pushbacks", "Rolls"] and not len(child) and not (child.text or "").strip():
                value[child.tag] = [""]
    return value

def observation(board, locator, player):
    teams = board.findall("./ListTeams/TeamState")
    ids = [number(t.find("Data"), "TeamId") for t in teams]
    members = [dict(rosterIndex=i, dataPlayerId=number(p.find("Data"), "Id"),
                    dataTeamId=number(p.find("Data"), "TeamId"))
               for i, t in enumerate(teams)
               for p in t.findall("./ListPitchPlayers/PlayerState") if p.findtext("Id") == str(player)]
    return dict(locator=locator, teamIds=ids, members=members)

files = []
for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inv.parse_xml(inv.decode_replay(path))
    initial = root.find("./NotificationGameJoined/InitialBoardState")
    boards = [(initial, dict(replayStep=None, childIndex=None))]
    cases = []
    for rn, outer in enumerate(root.findall("ReplayStep"), 1):
        for ci, child in enumerate(outer):
            if child.tag == "BoardState":
                boards.append((child, dict(replayStep=rn, childIndex=ci)))
                continue
            if child.tag != "EventExecuteSequence":
                continue
            for si, entry in enumerate(child.iter("StepResult")):
                step = inv.decode_message(entry.findtext("./Step/MessageData"))
                before = []
                for mi, message in enumerate(entry.iter("StringMessage")):
                    body = inv.decode_message(message.findtext("MessageData"))
                    roll = body.find("RollInfos")
                    if body.tag == "QuestionTeamRerollUsage" and number(roll, "RollType") in [1, 2, 4, 7]:
                        player = number(step, "PlayerId")
                        observations = [observation(b, l, player) for b, l in boards]
                        last_member = next((o for o in reversed(observations) if o["members"]), None)
                        cases.append(dict(locator=dict(replayStep=rn, childIndex=ci, stepIndex=si, messageIndex=mi),
                                          stepTag=step.tag, step=project(step), question=project(body), initialRoll=project(roll),
                                          earlierSameStep=[dict(tag=p.tag, payload=project(p)) for p in before],
                                          before=observations[-1], lastMember=last_member))
                    before.append(body)
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), cases=cases))

result = dict(scope="All raw numeric QuestionTeamRerollUsage originals; no future choice/result/fallout or application admission selects this inventory. Prior roster observations preserve raw namespaces and omissions, not complete eligibility or continuity.", files=files)
compact = lambda v: json.dumps(v, separators=(",", ":"))
text = '{\n"scope":' + compact(result["scope"]) + ',\n"files":[\n' + ',\n'.join(compact(f) for f in files) + '\n]\n}\n'
target = Path("tests/fixtures/evidence/bb3-numeric-question-originals.json")
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
if args.check:
    assert target.read_text() == text, "Numeric original evidence differs; regenerate and review"
else:
    target.write_text(text)
print(dict(files=len(files), originals=sum(len(f["cases"]) for f in files)))
