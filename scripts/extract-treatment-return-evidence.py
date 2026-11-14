"""Independent raw treatment-reserves milestones/full prefix fingerprints. No application ownership, state, admission or scoring imports."""
import argparse,hashlib,importlib.util,json,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py');inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
keys=['PlayerId','TargetId','AttackerId','DefenderId','Skill','Effect','Used','IsEvaluation','StepType','Source','GamerId','RollType','RollStatus','Status','Action','TeamId','MercenaryId','MercenaryType','HolderType','Reason','FinishingTurnType','NewActiveGamer','NextPlayingGamer','Phase','ActiveGamer']
def integer(v):
 if v is None or not re.fullmatch(r'-?\d+',v):return None
 n=int(v);return n if abs(n)<=9007199254740991 else None
def val(n,path):return integer(n.findtext(path)) if n is not None else None
def loc(r,c,s=None,m=None):
 d=dict(replayStep=r,childIndex=c)
 if s is not None:d['stepIndex']=s
 if m is not None:d['messageIndex']=m
 return d
def rank(l):return tuple(l.get(k,-1) if l.get(k) is not None else -1 for k in ['replayStep','childIndex','stepIndex','messageIndex'])
def fingerprint(node,where):return dict(locator=where,tag=node.tag,fields=sorted({c.tag for c in node}),integers={k:n for k in keys if (n:=val(node,k)) is not None})
def observation(board,where,subject):
 teams=[];members=[]
 for ri,t in enumerate(board.findall('./ListTeams/TeamState')):
  players=t.findall('./ListPitchPlayers/PlayerState');teams.append(dict(rosterIndex=ri,teamId=val(t,'Data/TeamId'),playerIds=[val(p,'Id') for p in players]))
  for p in players:
   if val(p,'Id')==subject:members.append(dict(rosterIndex=ri,id=val(p,'Id'),dataId=val(p,'Data/Id'),dataTeamId=val(p,'Data/TeamId'),playerTypeId=val(p,'Data/IdPlayerTypes'),cell=dict(x=val(p,'Cell/X'),y=val(p,'Cell/Y')),statusCode=val(p,'Status'),situationCode=val(p,'Situation'),canAct=val(p,'CanAct'),tackleZone=val(p,'TackleZone')))
 return dict(locator=where,phase=val(board,'CurrentPhase'),stable=val(board,'IsStable'),activeGamerId=val(board,'ActiveGamer'),periodCode=val(board,'Period'),teamTurns=[val(t,'GameTurn') for t in board.findall('./ListTeams/TeamState')],teams=teams,members=members)
def pitch(snapshot):
 return any(m['cell']['x'] is not None and m['cell']['y'] is not None and 0<=m['cell']['x']<=25 and 0<=m['cell']['y']<=14 for m in snapshot['members'])
def digest(rows):return hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
raw=json.loads(Path('tests/fixtures/evidence/bb3-treatment-aftermath.json').read_text());cases=[];roots={}
for seed in raw['rawResults']:
 if seed['after'] is None or seed['after']['subjects'][0]['fields']['Situation']!=1:continue
 file=seed['sourceFile'];path=Path('demo-replays')/file;assert hashlib.sha256(path.read_bytes()).hexdigest()==seed['sha256']
 if file not in roots:roots[file]=inv.parse_xml(inv.decode_replay(path))
 root=roots[file];subject=seed['subjectId'];records=[];boards=[];details={}
 for rn,row in enumerate(root.findall('ReplayStep'),1):
  for ci,node in enumerate(row):
   where=loc(rn,ci)
   if node.tag=='BoardState':boards.append(observation(node,where,subject));continue
   if node.tag=='EventExecuteSequence':
    for si,step in enumerate(node.iter('StepResult')):
     body=inv.decode_message(step.findtext('./Step/MessageData'));where=loc(rn,ci,si)
     records.append(fingerprint(body,where));details[rank(where)]=(body,None)
     for mi,msg in enumerate(step.iter('StringMessage')):
      body2=inv.decode_message(msg.findtext('MessageData'));where=loc(rn,ci,si,mi)
      records.append(fingerprint(body2,where));details[rank(where)]=(body2,body)
   elif node.tag.startswith(('Event','Question','Result')):records.append(fingerprint(node,where));details[rank(where)]=(node,None)
 start=seed['after']['locator'];later=[b for b in boards if rank(b['locator'])>rank(start)]
 setup=next((b for b in later if pitch(b)),None)
 playing=next((b for b in later if setup and rank(b['locator'])>rank(setup['locator']) and b['phase']==5),None)
 declared=None
 if playing:
  for r in records:
   if rank(r['locator'])<=rank(playing['locator']) or r['tag']!='ResultUseAction':continue
   msg,step=details[rank(r['locator'])]
   if val(step,'PlayerId')==subject:
    before=next(b for b in reversed(boards) if rank(b['locator'])<rank(r['locator']))
    declared=dict(locator=r['locator'],step=inv.numeric_projection(step),message=inv.numeric_projection(msg),before=before);break
 end=declared['locator'] if declared else None
 prefix=[r for r in records if rank(r['locator'])>rank(start) and (end is None or rank(r['locator'])<=rank(end))]
 snapshots=[b for b in later if end is None or rank(b['locator'])<rank(end)]
 staff=[dict(locator=r['locator'],payload=inv.numeric_projection(details[rank(r['locator'])][0])) for r in prefix if r['tag']=='ResultStaffUsage']
 cases.append(dict(file=file,sha256=seed['sha256'],treatmentLocator=seed['locator'],reserveLocator=start,subjectId=subject,reserve=next(b for b in boards if rank(b['locator'])==rank(start)),setup=setup,playing=playing,declaration=declared,staffUsage=staff,eventFingerprint=dict(count=len(prefix),sha256=digest(prefix)),boardFingerprint=dict(count=len(snapshots),sha256=digest(snapshots))))
result=dict(scope='Independent raw milestones, source hashes, complete structured-event prefix field/identity fingerprints and selected-player/full-roster boards. Not application admission, identity continuity, legal setup, useful availability or causal value.',cases=cases)
text=json.dumps(result,indent=2)+'\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();target=Path('tests/fixtures/evidence/bb3-treatment-returns.json')
if args.check:assert target.read_text()==text,'Treatment return source evidence differs; inspect raw bytes and full ordered prefixes.'
else:target.write_text(text)
print(json.dumps(dict(cases=len(cases),rawSetup=sum(c['setup'] is not None for c in cases),rawPlaying=sum(c['playing'] is not None for c in cases),rawDeclarations=sum(c['declaration'] is not None for c in cases),events=sum(c['eventFingerprint']['count'] for c in cases),boards=sum(c['boardFingerprint']['count'] for c in cases))))
