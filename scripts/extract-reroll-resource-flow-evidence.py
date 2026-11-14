"""Independent complete raw counter/clock census; no application imports/defaults.

Select every board, team-reroll choice and end notification before support,
faces, usage or reason values.
Only numeric fields and source locators are retained; omitted fields stay null.
"""
import argparse
import bisect
import hashlib
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location("inventory","scripts/inventory-replay-actions.py")
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)

def number(node,path):
    text=node.findtext(path) if node is not None else None
    return int(text) if text is not None and text.strip().lstrip("-").isdigit() else None

def board(node,kind,replay_step=None,child_index=None):
    teams=node.findall("./ListTeams/TeamState")
    def values(path):
        return [number(teams[i],path) if i<len(teams) else None for i in range(2)]
    return dict(locator=dict(kind=kind,replayStep=replay_step,childIndex=child_index),
                rosterCount=len(teams),phaseCode=number(node,"CurrentPhase"),periodCode=number(node,"Period"),
                activeTeamIndex=number(node,"ActiveTeam"),activeGamerId=number(node,"ActiveGamer"),
                teamTurns=values("GameTurn"),explicitTeamIds=values("./Data/TeamId"),counts=values("RerollNumber"),
                playerIds=[[number(p,"Id") for p in t.findall("./ListPitchPlayers/PlayerState")] for t in teams])

files=[]
for path in sorted(Path("demo-replays").glob("*.bbr")):
    root=inv.parse_xml(inv.decode_replay(path));snapshots=[];positions=[];decisions=[];ends=[];position=0
    initial=root.find(".//InitialBoardState")
    if initial is not None:
        snapshots.append(board(initial,"initial"));positions.append(position);position+=1
    for rn,outer in enumerate(root.findall("ReplayStep"),1):
        for ci,child in enumerate(outer):
            if child.tag=="BoardState":
                snapshots.append(board(child,"board",rn,ci));positions.append(position);position+=1
            elif child.tag=="EventExecuteSequence":
                for si,step in enumerate(child.iter("StepResult")):
                    position+=1
                    for mi,message in enumerate(step.iter("StringMessage")):
                        node=inv.decode_message(message.findtext("MessageData"))
                        if node.tag=="EventEndTurn":
                            ends.append(dict(locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),reasonCode=number(node,"Reason"),position=position))
                        if node.tag=="ResultTeamRerollUsage":
                            decisions.append(dict(locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),
                                                  gamerId=number(node,"GamerId"),used=number(node,"Used"),position=position))
                        position+=1
            else:
                if child.tag=="EventEndTurn":
                    ends.append(dict(locator=dict(replayStep=rn,childIndex=ci),reasonCode=number(child,"Reason"),position=position))
                if child.tag=="ResultTeamRerollUsage":
                    decisions.append(dict(locator=dict(replayStep=rn,childIndex=ci),gamerId=number(child,"GamerId"),used=number(child,"Used"),position=position))
                position+=1
    for d in decisions+ends:
        before=bisect.bisect_left(positions,d.pop("position"))-1
        d["beforeSnapshotId"]=before if before>=0 else None
        d["afterSnapshotId"]=before+1 if before+1<len(snapshots) else None
    files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),snapshots=snapshots,decisions=decisions,endNotifications=ends))
result=dict(scope=__doc__.strip(),files=files)
value=json.dumps(result,separators=(",",":"))+"\n"
target=Path("tests/fixtures/evidence/bb3-reroll-resource-flow.json")
parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true");args=parser.parse_args()
if args.check:
    assert target.read_text()==value,"Raw resource-flow evidence changed; regenerate and review"
else:
    target.write_text(value)
print(dict(files=len(files),snapshots=sum(len(f["snapshots"]) for f in files),choices=sum(len(f["decisions"]) for f in files),bytes=len(value)))
