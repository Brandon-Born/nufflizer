"""Raw push decisions and independently enumerated ordinary root geometry.

Stdlib XML decoder only. No application import, admission or scores. Raw menus
are observed choices, not random outcomes or evidence of a pre-roll policy.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)

def number(v):
    try:return int(v)
    except (ValueError,TypeError):return None

def cell(p):
    if p is None:return None
    return [number(p.findtext('X')),number(p.findtext('Y'))]

def empty(p):
    return None if p is None else not len(p) and not (p.text or '').strip()

def frame(p,locator):
    return dict(locator=locator,phase=number(p.findtext('CurrentPhase')),
        useSmallPitch=number(p.findtext('UseSmallPitch')),
        endZones=[dict(bottomLeft=cell(z.find('BottomLeft')),topRight=cell(z.find('TopRight'))) for z in p.findall('./PitchZones/PitchZone') if z.findtext('ZoneType')=='1'],
        boardEffectsEmpty=empty(p.find('Effects')),
        teams=[dict(teamId=number(t.findtext('./Data/TeamId')),effectsEmpty=empty(t.find('Effects')),prayersEmpty=empty(t.find('ActivePrayers')),transformationsEmpty=empty(t.find('TransformedPlayers')),
            players=[dict(id=p.findtext('Id'),cell=cell(p.find('Cell')),tackleZone=number(p.findtext('TackleZone')),status=number(p.findtext('Status')),effectsEmpty=empty(p.find('Effects')),
                data=None if p.find('Data') is None else dict(id=number(p.findtext('./Data/Id')),teamId=number(p.findtext('./Data/TeamId')),playerTypeId=number(p.findtext('./Data/IdPlayerTypes')),
                    innate=None if p.find('./Data/InnateSkills') is None else [number(s.text) for s in p.findall('./Data/InnateSkills/InnateSkillsItem')],
                    acquired=None if p.find('./Data/AcquiredSkills') is None else [number(s.text) for s in p.findall('./Data/AcquiredSkills/AcquiredSkillsItem')])) for p in t.findall('./ListPitchPlayers/PlayerState')]) for t in p.findall('./ListTeams/TeamState')])

def geometry(actor,subject,players):
    # Different derivation from the runtime compass lookup: the three unit
    # directions whose dot product with the incoming direction is positive.
    if not actor or not subject or None in actor+subject:return None
    dx,dy=subject[0]-actor[0],subject[1]-actor[1]
    if max(abs(dx),abs(dy))!=1:return None
    cells=[p['cell'] for t in players for p in t['players']]
    if any(c is None or None in c for c in cells):return None
    on=lambda c:0<=c[0]<=25 and 0<=c[1]<=14
    occupied={tuple(c) for c in cells if on(c)}
    candidates=[[subject[0]+x,subject[1]+y] for x in [-1,0,1] for y in [-1,0,1] if (x or y) and x*dx+y*dy>0]
    assert len(candidates)==3
    unoccupied=[c for c in candidates if on(c) and tuple(c) not in occupied]
    crowd=[c for c in candidates if not on(c)]
    return dict(directions=sorted(candidates),destinations=sorted(unoccupied or crowd or candidates),kind='empty' if unoccupied else 'crowd' if crowd else 'chain')

files=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=inv.parse_xml(inv.decode_replay(path));initial=root.find('./NotificationGameJoined/InitialBoardState')
    prior=frame(initial,dict(replayStep=None,childIndex=None));frames=[prior];cases=[]
    for rn,row in enumerate(root.findall('ReplayStep'),1):
        for ci,child in enumerate(row):
            locator=dict(replayStep=rn,childIndex=ci)
            if child.tag=='BoardState':
                prior=frame(child,locator);frames.append(prior);continue
            if child.tag!='EventExecuteSequence':continue
            for si,result in enumerate(child.iter('StepResult')):
                step=inv.decode_message(result.findtext('./Step/MessageData'));messages=[inv.decode_message(m.findtext('MessageData')) for m in result.iter('StringMessage')]
                for mi,message in enumerate(messages):
                    if message.tag!='QuestionPushBack':continue
                    actor=cell(step.find('CellFrom'));subject=cell(message.find('CellFrom'))
                    cases.append(dict(locator=dict(**locator,stepIndex=si,messageIndex=mi),checkpoint=prior['locator'],step={step.tag:inv.numeric_projection(step)},
                        question=inv.numeric_projection(message),offered=[cell(c) for c in message.findall('./CellTo/Cell')],reference=geometry(actor,subject,prior['teams']),
                        later=[dict(messageIndex=j,tag=m.tag,payload=inv.numeric_projection(m)) for j,m in enumerate(messages) if j>mi and m.tag in ['ResultPushBack','QuestionPushBack','ResultFollowUp','ResultBlockOutcome']]))
    required={json.dumps(c['checkpoint'],sort_keys=True) for c in cases}
    frames=[f for f in frames if f is frames[0] or json.dumps(f['locator'],sort_keys=True) in required or any(p['data'] is not None for t in f['teams'] for p in t['players'])]
    files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),frames=frames,cases=cases))

out={'scope':'Independent raw post-die push menus, current roster/trait observations and ordinary root geometry. No coach probabilities, full skill policy, prior-die leverage or tactical value is inferred.','files':files}
compact=lambda v:json.dumps(v,separators=(',',':'))
lines=['{','"scope":'+compact(out['scope'])+',','"files":[']
for n,f in enumerate(files):
    lines.extend(['{','"file":'+compact(f['file'])+',','"sha256":'+compact(f['sha256'])+',','"frames":['])
    lines.extend(compact(x)+(',' if i<len(f['frames'])-1 else '') for i,x in enumerate(f['frames']))
    lines.extend(['],','"cases":['])
    lines.extend(compact(x)+(',' if i<len(f['cases'])-1 else '') for i,x in enumerate(f['cases']))
    lines.extend([']','}'+(',' if n<len(files)-1 else '')])
rendered='\n'.join(lines+[']','}'])+'\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();target=Path('tests/fixtures/evidence/bb3-push-decisions.json')
if args.check:assert target.read_text()==rendered,'Raw push evidence changed; inspect the source before updating.'
else:target.write_text(rendered)
print([(f['file'],len(f['cases'])) for f in files])
