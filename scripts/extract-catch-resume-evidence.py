"""Raw question/readiness/timer/wait prefixes, selected before any result face.

No application parser, enum, scoring or admission policy is imported. The
following continuation is retained as evidence, not used to select the prefix.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("inventory", "scripts/inventory-replay-actions.py")
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

def n(node, key):
    try:
        return int(node.findtext(key))
    except (ValueError, TypeError, AttributeError):
        return None

def project(node):
    if node is None:
        return None
    if not len(node):
        value = inv.numeric_projection(node)
        return value if value is not None else ""
    result = {}
    for child in node:
        # Numeric facts and exact empty field shape; omit private text.
        if len(child) or not (child.text or "").strip() or inv.numeric_projection(child) is not None:
            result.setdefault(child.tag, []).append(project(child))
    return result

def board(node):
    selected = {k: v for k, v in project(node).items() if k in {
        "IsStable", "CurrentPhase", "ActiveTeam", "ActiveGamer", "ActivePlayer", "Period", "TurnsPerPeriod", "Ball", "ListTeams", "LastWeatherRoll", "LastKickOffEventRoll"
    }}
    for t in selected.get("ListTeams", [{}])[0].get("TeamState", []):
        for k in list(t):
            if k not in {"Data", "GameTurn", "Side", "RerollNumber", "ListPitchPlayers"}:
                del t[k]
        if "Data" in t:
            t["Data"] = [{k: v for k, v in t["Data"][0].items() if k == "TeamId"}]
        for p in t.get("ListPitchPlayers", [{}])[0].get("PlayerState", []):
            for k in list(p):
                if k not in {"Id", "Cell", "CanAct", "TackleZone", "Status", "Situation", "MovePoint"}:
                    del p[k]
    return selected

files = []
for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inv.parse_xml(inv.decode_replay(path))
    outers = root.findall("ReplayStep")
    boards = [(rn,ci,c) for rn,o in enumerate(outers,1) for ci,c in enumerate(o) if c.tag == "BoardState"]
    cases = []
    for rn, outer in enumerate(outers, 1):
        if rn + 1 >= len(outers):
            continue
        wait = outers[rn]
        if [c.tag for c in wait] != ["Clock", "EventGamersAreReady", "EventStartActiveTimer", "BoardState"]:
            continue
        for ci, child in enumerate(outer):
            if child.tag != "EventExecuteSequence" or ci + 1 >= len(outer) or outer[ci + 1].tag != "BoardState":
                continue
            steps = list(child.iter("StepResult"))
            for si, entry in enumerate(steps):
                step = inv.decode_message(entry.findtext("./Step/MessageData"))
                messages = list(entry.iter("StringMessage"))
                if not messages or si != len(steps) - 1:
                    continue
                question = inv.decode_message(messages[-1].findtext("MessageData"))
                roll = question.find("RollInfos")
                if question.tag != "QuestionTeamRerollUsage" or n(roll, "RollType") not in {1, 2, 4, 7}:
                    continue
                # Selection ends here, before reading a choice or final face.
                previous = [b for b in boards if (b[0],b[1]) < (rn,ci)]
                before_rn,before_ci,before_board = previous[-1] if previous else (0,None,root.find("./NotificationGameJoined/InitialBoardState"))
                prefix = []
                for prn in range(max(1,before_rn),rn+1):
                    for pci,pchild in enumerate(outers[prn-1]):
                        if (prn == before_rn and pci <= before_ci) or (prn == rn and pci > ci) or pchild.tag == "Clock":
                            continue
                        ploc = dict(replayStep=prn,childIndex=pci)
                        if pchild.tag != "EventExecuteSequence":
                            prefix.append(dict(tag=pchild.tag,locator=ploc,payload=project(pchild)))
                            continue
                        for psi,pentry in enumerate(pchild.iter("StepResult")):
                            pstep = inv.decode_message(pentry.findtext("./Step/MessageData"))
                            prefix.append(dict(tag=pstep.tag,locator=dict(ploc,stepIndex=psi),payload=project(pstep)))
                            if prn == rn and pci == ci and psi == si:
                                break
                            for pmi,pmsg in enumerate(pentry.iter("StringMessage")):
                                pbody = inv.decode_message(pmsg.findtext("MessageData"))
                                prefix.append(dict(tag=pbody.tag,locator=dict(ploc,stepIndex=psi,messageIndex=pmi),payload=project(pbody)))
                continuation = []
                following = outers[rn + 1]
                for next_ci, next_child in enumerate(following):
                    if next_child.tag == "Clock":
                        continue
                    if next_child.tag != "EventExecuteSequence":
                        continuation.append(dict(tag=next_child.tag, locator=dict(replayStep=rn + 2, childIndex=next_ci), payload=project(next_child)))
                        break
                    for next_si, next_entry in enumerate(next_child.iter("StepResult")):
                        next_step = inv.decode_message(next_entry.findtext("./Step/MessageData"))
                        loc = dict(replayStep=rn + 2, childIndex=next_ci, stepIndex=next_si)
                        continuation.append(dict(tag=next_step.tag, locator=loc, payload=project(next_step)))
                        for mi, msg in enumerate(next_entry.iter("StringMessage")):
                            body = inv.decode_message(msg.findtext("MessageData"))
                            continuation.append(dict(tag=body.tag, locator=dict(loc, messageIndex=mi), payload=project(body)))
                            if body.tag == "ResultRoll":
                                break
                        if any(x["tag"] == "ResultRoll" for x in continuation):
                            break
                    break
                cases.append(dict(questionLocator=dict(replayStep=rn, childIndex=ci, stepIndex=si, messageIndex=len(messages)-1),
                    step=project(step), question=project(question), initialRoll=project(roll),
                    before=dict(locator=dict(replayStep=before_rn if before_rn else None,childIndex=before_ci),board=board(before_board)),prefix=prefix,
                    menu=dict(locator=dict(replayStep=rn, childIndex=ci+1), board=board(outer[ci+1])),
                    controls=[dict(tag=c.tag, locator=dict(replayStep=rn+1, childIndex=j), payload=project(c)) for j,c in enumerate(wait) if c.tag.startswith("Event")],
                    resumed=dict(locator=dict(replayStep=rn+1, childIndex=3), board=board(wait[3])), continuation=continuation))
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), cases=cases))
result = dict(scope="Every public numeric question immediately followed by an observed empty-ready/start-timer wait frame. Prefix selection does not depend on the following choice, replacement, success, fallout or application admission. Boards retain raw numeric namespaces, cells and omitted fields; eligibility and legal playable state are not inferred.", files=files)
text = json.dumps(result, separators=(",", ":"), indent=2) + "\n"
p = argparse.ArgumentParser()
p.add_argument("--check", action="store_true")
a = p.parse_args()
target = Path("tests/fixtures/evidence/bb3-catch-resume.json")
if a.check:
    assert target.read_text() == text, "Catch resume evidence differs; regenerate and review"
else:
    target.write_text(text)
print(dict(files=len(files), prefixes=sum(len(f["cases"]) for f in files)))
