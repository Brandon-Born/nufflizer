"""Select every raw block question before support, faces or availability.

Only numeric/structural source facts are retained. A conditional arithmetic
reference uses the last complete observed lists, never a future observation.
That reference does not certify current traits, legal skills or continuity.
"""
import argparse
import copy
import hashlib
import importlib.util
import itertools
import json
from fractions import Fraction
from pathlib import Path

spec = importlib.util.spec_from_file_location("inventory", "scripts/inventory-replay-actions.py")
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

def number(node, path):
    value = node.findtext(path) if node is not None else None
    return int(value) if value is not None and value.strip().lstrip("-").isdigit() else None

def empty(node):
    return None if node is None else not len(node) and not (node.text or "").strip() and not node.attrib

def skills(data, name):
    node = data.find(name) if data is not None else None
    if node is None:
        return None
    if any(c.tag != name + "Item" for c in node):
        return None
    return [number(c, ".") for c in node]

def data_view(data):
    return None if data is None else dict(playerId=number(data,"Id"), teamId=number(data,"TeamId"), playerType=number(data,"IdPlayerTypes"), innate=skills(data,"InnateSkills"), acquired=skills(data,"AcquiredSkills"))

def complete(data, pid):
    return data and pid is not None and pid >= 0 and data["playerId"] == pid and data["playerType"] is not None and all(data[k] is not None and len(set(data[k])) == len(data[k]) and all(v is not None and v >= 0 for v in data[k]) for k in ["innate", "acquired"])

def reference(question, actor, defender):
    if not actor or not defender or not actor["seed"] or not defender["seed"]:
        return None
    a = set(actor["seed"]["data"]["innate"] + actor["seed"]["data"]["acquired"])
    d = set(defender["seed"]["data"]["innate"] + defender["seed"]["data"]["acquired"])
    # Block/Dodge/Tackle/Wrestle affect this immediate component. Mighty Blow
    # and Regeneration concern later damage/recovery, outside this utility.
    # Additional documented skills concern other actions, pre-pool gates,
    # fixed pool size or later damage. This reference is still a conditional
    # arithmetic hypothesis, not an applicability/continuity certificate.
    if not (a | d) <= {6,7,10,13,15,19,26,27,30,38,44,47,50,52,57,59,61,63,68,75,81,86,100,101,102,1008}:
        return None
    faces, indexes = question["faces"], question["freshIndexes"]
    if not 1 <= len(faces) <= 3 or question["dieTypes"] != [2]*len(faces) or any(f not in range(5) for f in faces) or not indexes or any(i is None or i not in range(len(faces)) for i in indexes) or len(set(indexes)) != len(indexes) or question["attackerChoice"] not in [0,1]:
        return None
    def face_value(f):
        if f == 0: return -1
        if f == 1:
            v = int(30 not in d) - int(30 not in a)
            return 0 if (v < 0 and 68 in a) or (v > 0 and 68 in d) else v
        if f == 2: return 0
        return 0 if f == 3 and 7 in d and 57 not in a else 1
    def value(pool):
        return (max if question["attackerChoice"] else min)(face_value(f) for f in pool)
    total = 0
    for draws in itertools.product([0,1,2,2,3,4], repeat=len(indexes)):
        pool = faces.copy()
        for i,v in zip(indexes,draws): pool[i] = v
        total += value(pool)
    mean = Fraction(total,6**len(indexes))
    delta = value(faces) - mean
    return dict(scope="last_complete_lists_hypothesis", observed=value(faces), mean=str(mean), delta=str(delta), weighted=str(delta*Fraction(3,4)))

files = []
for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inv.parse_xml(inv.decode_replay(path))
    seeds, current, rows = {}, None, []
    def observe(board, locator):
        global current
        players = []
        for ri, team in enumerate(board.findall("./ListTeams/TeamState")):
            for p in team.findall("./ListPitchPlayers/PlayerState"):
                pid = number(p,"Id")
                data = data_view(p.find("Data"))
                if complete(data,pid): seeds[pid] = dict(locator=locator.copy(), rosterIndex=ri, data=copy.deepcopy(data))
                players.append(dict(playerId=pid,rosterIndex=ri,explicitTeamId=number(team,"./Data/TeamId"),cell=[number(p,"./Cell/X"),number(p,"./Cell/Y")],status=number(p,"Status"),tackleZone=number(p,"TackleZone"),effectsEmpty=empty(p.find("Effects")),teamEffectsEmpty=empty(team.find("Effects")),transformationsEmpty=empty(team.find("TransformedPlayers")),prayersEmpty=empty(team.find("ActivePrayers")),data=data))
        current = dict(locator=locator.copy(),phase=number(board,"CurrentPhase"),effectsEmpty=empty(board.find("Effects")),players=players)
    initial = root.find(".//InitialBoardState")
    if initial is not None: observe(initial,dict(kind="initial",replayStep=None,childIndex=None))
    for rn, outer in enumerate(root.findall("ReplayStep"),1):
        for ci, child in enumerate(outer):
            if child.tag == "BoardState": observe(child,dict(kind="board",replayStep=rn,childIndex=ci))
            if child.tag != "EventExecuteSequence": continue
            for si, step in enumerate(child.iter("StepResult")):
                header = inv.decode_message(step.findtext("./Step/MessageData"))
                for mi, message in enumerate(step.iter("StringMessage")):
                    q = inv.decode_message(message.findtext("MessageData"))
                    if q.tag != "QuestionBlockDice": continue
                    raw = dict(faces=[number(d,"Value") for d in q.findall("./Dice/Die")],dieTypes=[number(d,"DieType") for d in q.findall("./Dice/Die")],outcomes=[number(d,".") for d in q.findall("./DiceOutcomes/DiceOutcomesItem")],freshIndexes=[number(d,".") for d in q.findall("./RolledDiceIndexes/RolledDiceIndexesItem")],attackerChoice=number(q,"AttackerChoice"),gamerId=number(q,"GamerId"),canChoose=number(q,"CanChoseDie"),teamAvailable=number(q,"CanUseTeamReroll"),rollType=number(q,"RollType"),rollStatus=number(q,"RollStatus"))
                    def role(pid):
                        matches = [p for p in current["players"] if p["playerId"] == pid] if current else []
                        return dict(**copy.deepcopy(matches[0]),seed=copy.deepcopy(seeds.get(pid))) if len(matches)==1 else None
                    actor, defender = role(number(header,"PlayerId")),role(number(header,"TargetId"))
                    rows.append(dict(locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),header=dict(tag=header.tag,actor=number(header,"PlayerId"),target=number(header,"TargetId"),stepType=number(header,"StepType"),skill=number(header,"Skill"),evaluation=number(header,"IsEvaluation")),question=raw,current=None if current is None else {k:copy.deepcopy(v) for k,v in current.items() if k!="players"},actor=actor,defender=defender,reference=reference(raw,actor,defender)))
    files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),questions=rows))

result = dict(scope=__doc__.strip(),files=files)
rendered = json.dumps(result,separators=(",",":"))+"\n"
target = Path("tests/fixtures/evidence/bb3-block-scoring.json")
p = argparse.ArgumentParser();p.add_argument("--check",action="store_true");args = p.parse_args()
if args.check: assert target.read_text()==rendered,"Raw block evidence changed; regenerate and review"
else: target.write_text(rendered)
print(dict(files=len(files),questions=sum(len(f["questions"]) for f in files),bytes=len(rendered)))
