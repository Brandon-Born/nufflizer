"""Raw typed TTM headers/roles and first resource question/choice evidence only."""
import argparse,hashlib,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py');inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def val(e,k):
 t=e.findtext(k) if e is not None else None
 return int(t) if t is not None else None
def board(b,where,ids):
 return dict(locator=where,phase=val(b,'CurrentPhase'),activeGamer=val(b,'ActiveGamer'),period=val(b,'Period'),teams=[dict(slot=i,teamId=val(t,'Data/TeamId'),turn=val(t,'GameTurn'),players=[dict(id=val(p,'Id'),dataId=val(p,'Data/Id'),dataTeamId=val(p,'Data/TeamId'),type=val(p,'Data/IdPlayerTypes'),x=val(p,'Cell/X'),y=val(p,'Cell/Y'),status=val(p,'Status'),situation=val(p,'Situation'),canAct=val(p,'CanAct')) for p in t.findall('./ListPitchPlayers/PlayerState') if val(p,'Id') in ids]) for i,t in enumerate(b.findall('./ListTeams/TeamState'))])
rows=[];landings=[];hashes={}
for path in sorted(Path('demo-replays').glob('*.bbr')):
 root=inv.parse_xml(inv.decode_replay(path));hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest();prior=root.find('./NotificationGameJoined/InitialBoardState');where=dict(replayStep=None,childIndex=None)
 for rn,frame in enumerate(root.findall('ReplayStep'),1):
  for ci,node in enumerate(frame):
   if node.tag=='BoardState':prior=node;where=dict(replayStep=rn,childIndex=ci);continue
   if node.tag!='EventExecuteSequence':continue
   for si,step in enumerate(node.iter('StepResult')):
    h=inv.decode_message(step.findtext('./Step/MessageData'))
    if h.tag=='PlayerStep' and val(h,'StepType')==14:landings.append(dict(file=path.name,sha256=hashes[path.name],locator=dict(replayStep=rn,childIndex=ci,stepIndex=si),header=inv.numeric_projection(h),messages=[dict(messageIndex=i,tag=(m:=inv.decode_message(v.findtext('MessageData'))).tag,payload=inv.numeric_projection(m)) for i,v in enumerate(step.iter('StringMessage'))]))
    if h.tag!='ThrowTeamMateStep':continue
    ids=[val(h,'ThrowerId'),val(h,'ThrownMateId')]
    messages=[inv.decode_message(m.findtext('MessageData')) for m in step.iter('StringMessage')]
    rows.append(dict(file=path.name,sha256=hashes[path.name],locator=dict(replayStep=rn,childIndex=ci,stepIndex=si),header=inv.numeric_projection(h),messages=[dict(messageIndex=i,tag=m.tag,payload=inv.numeric_projection(m)) for i,m in enumerate(messages)],before=board(prior,where,ids)))
p=Path('tests/fixtures/evidence/bb3-ui-playback-004.json');ui=json.loads(p.read_text());case=next(c for c in ui['cases'] if c['id']=='UI-034')
lp=Path('tests/fixtures/evidence/bb3-ui-playback-007.json');lu=json.loads(lp.read_text());lc=next(c for c in lu['cases'] if c['id']=='UI-041')
result=dict(scope='Raw typed thrower/thrown-member IDs, numeric messages and preceding nullable state. No probability, legal action/resource eligibility, stage linkage or application admission is inferred.',sourceHashes=hashes,headers=rows,landingHeaders=landings,pairedUI034=dict(fixtureSha256=hashlib.sha256(p.read_bytes()).hexdigest(),sourceSha256=ui['source']['sha256'],case=case),pairedLandingUI041=dict(fixtureSha256=hashlib.sha256(lp.read_bytes()).hexdigest(),sourceSha256=lu['source']['sha256'],case=lc))
text=json.dumps(result,indent=2)+'\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();target=Path('tests/fixtures/evidence/bb3-throw-team-mate-roles.json')
if args.check:assert target.read_text()==text,'Typed TTM source evidence differs; inspect raw roles, source hashes and UI witness.'
else:target.write_text(text)
print(json.dumps(dict(headers=len(rows),landings=len(landings),resourceMessages=sum(m['tag'] in ['QuestionTeamRerollUsage','ResultTeamRerollUsage'] for r in rows for m in r['messages']),pairedCase=case['id'])))
