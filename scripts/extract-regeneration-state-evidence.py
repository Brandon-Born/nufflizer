"""Raw Regeneration chains and first same-frame board observations.

Independent stdlib XML decoding, not application ownership/state admission.
Only numeric selected-player data and roster membership are retained.
"""
import argparse,hashlib,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def integer(node,tag):
 text=node.findtext(tag) if node is not None else None
 return None if text is None else int(text)
def snapshot(board,locator,subject):
 if board is None:return None
 teams=[];members=[]
 for ri,t in enumerate(board.findall('./ListTeams/TeamState')):
  players=t.findall('./ListPitchPlayers/PlayerState')
  teams.append(dict(rosterIndex=ri,teamId=integer(t,'Data/TeamId'),playerIds=[integer(p,'Id') for p in players]))
  for p in players:
   if integer(p,'Id')==subject:members.append(dict(rosterIndex=ri,player=inv.numeric_projection(p)))
 return dict(locator=locator,phase=integer(board,'CurrentPhase'),stable=integer(board,'IsStable'),activeGamer=integer(board,'ActiveGamer'),teams=teams,members=members)
cases=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
 root=inv.parse_xml(inv.decode_replay(path));prior=(root.find('./NotificationGameJoined/InitialBoardState'),dict(replayStep=None,childIndex=None))
 for rn,row in enumerate(root.findall('ReplayStep'),1):
  children=list(row)
  for ci,node in enumerate(children):
   if node.tag=='BoardState':prior=(node,dict(replayStep=rn,childIndex=ci));continue
   if node.tag!='EventExecuteSequence':continue
   for si,step in enumerate(node.iter('StepResult')):
    damage=inv.decode_message(step.findtext('./Step/MessageData'))
    messages=[inv.decode_message(m.findtext('MessageData')) for m in step.iter('StringMessage')]
    for mi,roll in enumerate(messages):
     if roll.tag!='ResultRoll' or roll.findtext('RollType')!='46':continue
     subject=integer(damage,'PlayerId')
     after=next(((i,n) for i,n in enumerate(children) if i>ci and n.tag=='BoardState'),None)
     cases.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),rollLocator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),
      damage=inv.numeric_projection(damage),messages=[dict(messageIndex=i,tag=m.tag,payload=inv.numeric_projection(m)) for i,m in enumerate(messages)],
      before=snapshot(*prior,subject),after=snapshot(after[1],dict(replayStep=rn,childIndex=after[0]),subject) if after else None,
      controls=[dict(childIndex=i,tag=n.tag,payload=inv.numeric_projection(n)) for i,n in enumerate(children) if after and ci<i<after[0]]))
result=dict(scope='Raw damage messages, first following same-frame board, selected player numeric fields, all roster IDs and intervening controls. Not admission, inferred defaults, activation eligibility or final match availability.',
 rule=dict(pdfSha256='8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3',printedPage=86,pdfPage=87,skillId=19,threshold=4,fairSuccessfulFaces=3,totalFaces=6),cases=cases)
compact=lambda x:json.dumps(x,separators=(',',':'))
serialized='{\n"scope":'+compact(result['scope'])+',\n"rule":'+compact(result['rule'])+',\n"cases":[\n'+',\n'.join(compact(c) for c in cases)+'\n]\n}\n'
target=Path('tests/fixtures/evidence/bb3-regeneration-states.json');p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:assert target.read_text()==serialized,'Regeneration state evidence differs; regenerate and review'
else:target.write_text(serialized)
print(dict(cases=len(cases),sameFrameSnapshots=sum(c['after'] is not None for c in cases)))
