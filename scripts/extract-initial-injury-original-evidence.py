"""Independent initial-injury question roots, source state and literal rule rows.
No application admission/normalization/probability helper imports.
"""
import argparse,hashlib,importlib.util,json
from fractions import Fraction
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py');inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def n(e,path):
 t=e.findtext(path) if e is not None else None
 return None if t is None else int(t)
def player_state(board,locator,subject):
 matches=[]
 if board is not None:
  for ri,t in enumerate(board.findall('./ListTeams/TeamState')):
   for p in t.findall('./ListPitchPlayers/PlayerState'):
    if n(p,'Id')==subject:matches.append(dict(rosterIndex=ri,teamId=n(t,'Data/TeamId'),player=inv.numeric_projection(p),dataPresent=p.find('Data') is not None,innatePresent=p.find('Data/InnateSkills') is not None,acquiredPresent=p.find('Data/AcquiredSkills') is not None))
 return dict(locator=locator,phase=n(board,'CurrentPhase'),matches=matches)
rows=[];hashes={}
for file in sorted(Path('demo-replays').glob('*.bbr')):
 root=inv.parse_xml(inv.decode_replay(file));assert root.findtext('ReplayVersion')=='1-4-0-0';digest=hashlib.sha256(file.read_bytes()).hexdigest();hashes[file.name]=digest
 initial=root.find('./NotificationGameJoined/InitialBoardState');prior=(initial,dict(replayStep=None,childIndex=None))
 for rn,outer in enumerate(root.findall('ReplayStep'),1):
  for ci,child in enumerate(outer):
   if child.tag=='BoardState':prior=(child,dict(replayStep=rn,childIndex=ci));continue
   if child.tag!='EventExecuteSequence':continue
   steps=list(child.iter('StepResult'))
   for si,s in enumerate(steps):
    header=inv.decode_message(s.findtext('./Step/MessageData'));messages=[inv.decode_message(m.findtext('MessageData')) for m in s.iter('StringMessage')]
    for mi,m in enumerate(messages):
     if m.tag not in ['QuestionKORecovery','QuestionApothecaryCasualtyUsage']:continue
     roll=m.find('RollInfos')
     if roll is None or roll.findtext('RollType')!='11':continue
     subject=n(header,'PlayerId');previous=steps[si-1] if si else None
     rows.append(dict(sourceFile=file.name,sha256=digest,locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),tag=m.tag,subjectId=subject,
      header={header.tag:inv.numeric_projection(header)},message={m.tag:inv.numeric_projection(m)},roll=inv.numeric_projection(roll),modifiersPresent=roll.find('Modifiers') is not None,modifiersEmpty=roll.find('Modifiers') is not None and len(roll.find('Modifiers'))==0,
      prefix=[dict(tag=x.tag,payload=inv.numeric_projection(x)) for x in messages[:mi]],
      previousStep=None if previous is None else dict(header={inv.decode_message(previous.findtext('./Step/MessageData')).tag:inv.numeric_projection(inv.decode_message(previous.findtext('./Step/MessageData')))},messages=[{(x:=inv.decode_message(v.findtext('MessageData'))).tag:inv.numeric_projection(x)} for v in previous.iter('StringMessage')]),
      initialSubject=player_state(initial,dict(replayStep=None,childIndex=None),subject),before=player_state(*prior,subject)))
paired=[]
for file,identifier in [('bb3-ui-playback-001.json','UI-009'),('bb3-ui-playback-002.json','UI-025')]:
 p=Path('tests/fixtures/evidence',file);data=json.loads(p.read_text());case=next(c for c in data['cases'] if c['id']==identifier)
 matches=[]
 for ri,record in enumerate(case['rawRecords']):
  for mi,m in enumerate(record['messages']):
   tag=next(iter(m));body=m[tag]
   if tag not in ['QuestionKORecovery','QuestionApothecaryCasualtyUsage']:continue
   roll=body.get('RollInfos',[None])[0]
   if not roll or roll.get('RollType')!=['11']:continue
   faces=[int(d['Value'][0]) for d in roll['Dice'][0]['Die']]
   ui=[u for u in case['ui']['events'] if u.get('label') in ['Injury','Stunty Injury'] and u.get('dice')==faces]
   assert len(ui)==1
   matches.append(dict(recordIndex=ri,messageIndex=mi,tag=tag,roll=roll,header=record['step'],message=m,ui=ui[0]))
 assert matches
 paired.append(dict(sourceFixture=file,fixtureSha256=hashlib.sha256(p.read_bytes()).hexdigest(),sourceSha256=data['source']['sha256'],caseId=identifier,matches=matches))
profiles=[]
for name,skills,table in [('ordinary',[],[0,0,0,0,0,0,2,2,4,4,4]),('ordinary_thick',[63],[0,0,0,0,0,0,0,2,4,4,4]),('stunty',[59],[0,0,0,0,0,2,2,3,4,4,4]),('stunty_thick',[59,63],[0,0,0,0,0,0,2,3,4,4,4])]:
 counts=[sum(w for c,w in zip(table,[1,2,3,4,5,6,5,4,3,2,1]) if c==o) for o in [0,2,3,4]];tiers=[counts[0],counts[1],counts[2]+counts[3]]
 values={str(o):str(Fraction(sum(tiers[t+1:])-sum(tiers[:t]),24)) for o,t in [(0,0),(2,1),(3,2),(4,2)]}
 profiles.append(dict(name=name,skills=skills,rows=table,counts=counts,weightedByOutcome=values,weightedMean=str(sum(Fraction(values[str(c)])*w for c,w in zip(table,[1,2,3,4,5,6,5,4,3,2,1]))/36)))
enum_path=Path('tests/fixtures/evidence/bb3-installed-enums.json');enums=json.loads(enum_path.read_text());inj=next(e for e in enums['enums'] if e['name']=='EBB3NetGameplayInjuryOutcome');members={e['member']:e['value'] for e in inj['entries']};assert members==dict(Stunned=0,Reserve=1,Ko=2,BadlyHurt=3,Casualty=4)
result=dict(scope='All raw initial-injury question roots and prior UI/state facts. Literal BB2020 rows/Fraction references are conditional fixed-table arithmetic, NOT actual current-trait admission certificates. Prompt1 is not a direct BadlyHurt lookup. No later treatment or availability inference.',sourceHashes=hashes,enumSource=dict(file=str(enum_path),sha256=hashlib.sha256(enum_path.read_bytes()).hexdigest(),executableSha256=enums['source']['sha256'],members=members),rule=dict(pdfSha256='8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3',printedPage=60,pdfPage=61,weight='3/2',profiles=profiles),originals=rows,paired=paired)
text='{\n'+',\n'.join(json.dumps(k)+':'+(('[\n'+',\n'.join(json.dumps(x,separators=(',',':')) for x in v)+'\n]') if k in ['originals','paired'] else json.dumps(v,separators=(',',':'))) for k,v in result.items())+'\n}\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--output',default='tests/fixtures/evidence/bb3-initial-injury-originals.json');args=p.parse_args();target=Path(args.output)
if args.check:assert target.read_text()==text,'Initial-original evidence differs; inspect original source/hash/namespace facts.'
else:target.write_text(text)
print(json.dumps(dict(originals=len(rows),ko=sum(r['tag']=='QuestionKORecovery' for r in rows),staff=sum(r['tag']=='QuestionApothecaryCasualtyUsage' for r in rows),paired=len(paired),profiles=len(profiles))))
