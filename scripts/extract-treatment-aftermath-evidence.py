"""Independent applied-treatment notifications and first following raw boards.
No application admission, identity, state, mapping, probability or scorer imports.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def number(e,key):
    text=e.findtext(key) if e is not None else None
    return None if text is None else int(text)
def board(b,locator,subject):
    if b is None:return None
    teams=[];players=[]
    for slot,t in enumerate(b.findall('./ListTeams/TeamState')):
        ps=t.findall('./ListPitchPlayers/PlayerState')
        teams.append(dict(rosterIndex=slot,explicitTeamId=number(t,'Data/TeamId'),playerIds=[number(p,'Id') for p in ps]))
        for p in ps:
            if number(p,'Id')==subject:
                players.append(dict(rosterIndex=slot,projection=inv.numeric_projection(p),fields={k:number(p,k) for k in ['Cell/X','Cell/Y','Status','Situation','CanAct','TackleZone','Data/Id','Data/TeamId','Data/IdPlayerTypes']}))
    return dict(locator=locator,phase=number(b,'CurrentPhase'),stable=number(b,'IsStable'),activeGamer=number(b,'ActiveGamer'),teams=teams,subjects=players)
rows=[];hashes={};initials={}
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=inv.parse_xml(inv.decode_replay(path));assert root.findtext('ReplayVersion')=='1-4-0-0'
    digest=hashlib.sha256(path.read_bytes()).hexdigest();hashes[path.name]=digest
    initial=root.find('./NotificationGameJoined/InitialBoardState')
    initials[path.name]=[dict(rosterIndex=i,explicitTeamId=number(t,'Data/TeamId'),playerIds=[number(p,'Id') for p in t.findall('./ListPitchPlayers/PlayerState')]) for i,t in enumerate(initial.findall('./ListTeams/TeamState'))]
    prior=(initial,dict(replayStep=None,childIndex=None))
    for rn,outer in enumerate(root.findall('ReplayStep'),1):
        children=list(outer)
        for ci,child in enumerate(children):
            if child.tag=='BoardState':prior=(child,dict(replayStep=rn,childIndex=ci));continue
            if child.tag!='EventExecuteSequence':continue
            steps=list(child.iter('StepResult'))
            for si,s in enumerate(steps):
                header=inv.decode_message(s.findtext('./Step/MessageData'))
                messages=[inv.decode_message(m.findtext('MessageData')) for m in s.iter('StringMessage')]
                for mi,m in enumerate(messages):
                    if m.tag!='ResultApothecary':continue
                    subject=number(header,'PlayerId')
                    following=next(((j,c) for j,c in enumerate(children) if j>ci and c.tag=='BoardState'),None)
                    rows.append(dict(sourceFile=path.name,sha256=digest,locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),subjectId=subject,
                        header={header.tag:inv.numeric_projection(header)},result=inv.numeric_projection(m),messages=[{x.tag:inv.numeric_projection(x)} for x in messages],
                        tailSteps=[dict(header={(h:=inv.decode_message(t.findtext('./Step/MessageData'))).tag:inv.numeric_projection(h)},messages=[{(q:=inv.decode_message(v.findtext('MessageData'))).tag:inv.numeric_projection(q)} for v in t.iter('StringMessage')]) for t in steps[si+1:]],
                        before=board(*prior,subject),after=None if following is None else board(following[1],dict(replayStep=rn,childIndex=following[0]),subject),
                        controls=[] if following is None else [dict(childIndex=j,tag=c.tag,payload=inv.numeric_projection(c)) for j,c in enumerate(children) if ci<j<following[0]]))
paired=[]
for path in sorted(Path('tests/fixtures/evidence').glob('bb3-ui-playback-*.json')):
    data=json.loads(path.read_text())
    for case in data['cases']:
        results=[dict(recordIndex=ri,messageIndex=mi,header=r['step'],message=m['ResultApothecary']) for ri,r in enumerate(case['rawRecords']) for mi,m in enumerate(r['messages']) if 'ResultApothecary' in m]
        if results:
            paired.append(dict(sourceFixture=path.name,fixtureSha256=hashlib.sha256(path.read_bytes()).hexdigest(),sourceSha256=data['source']['sha256'],caseId=case['id'],ui=case['ui'],rawRecords=case['rawRecords'],results=results))
enum_path=Path('tests/fixtures/evidence/bb3-installed-enums.json');enums=json.loads(enum_path.read_text())
names=['EBB3BoardDataPlayerSituation','EBB3BoardDataPlayerStatus','EBB3NetGameplayCasualty','EBB3NetGameplayInjuryOutcome']
selected={name:{m['member']:m['value'] for m in next(e for e in enums['enums'] if e['name']==name)['entries']} for name in names}
assert selected['EBB3BoardDataPlayerSituation']['Reserve']==1 and selected['EBB3BoardDataPlayerSituation']['Injured']==4
assert selected['EBB3NetGameplayInjuryOutcome']['Reserve']==1 and selected['EBB3NetGameplayCasualty']['BadlyHurt']==1
output=dict(scope='All raw ResultApothecary notifications, numeric source/roster/first-board facts and prior UI witnesses. No selection/eligibility/admission oracle, omitted defaults, useful availability, new random outcome or luck value is inferred.',replayVersion='1-4-0-0',sourceHashes=hashes,initialRosters=initials,enumSource=dict(file=str(enum_path),sha256=hashlib.sha256(enum_path.read_bytes()).hexdigest(),executableSha256=enums['source']['sha256'],members=selected),rawResults=rows,paired=paired)
text='{\n'+',\n'.join(json.dumps(k)+':'+('[\n'+',\n'.join(json.dumps(x,separators=(',',':')) for x in v)+'\n]' if k in ['rawResults','paired'] else json.dumps(v,separators=(',',':'))) for k,v in output.items())+'\n}\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--output',default='tests/fixtures/evidence/bb3-treatment-aftermath.json');args=p.parse_args();target=Path(args.output)
if args.check:assert target.read_text()==text,'Treatment source evidence differs; inspect raw bytes and source/namespace facts.'
else:target.write_text(text)
print(json.dumps(dict(rawResults=len(rows),pairedCases=len(paired),initialInjury=sum(r['result']['IsInjury']==['1'] for r in rows),reserves=sum(r['after']['subjects'][0]['fields']['Situation']==1 for r in rows),injuredBox=sum(r['after']['subjects'][0]['fields']['Situation']==4 for r in rows))))
