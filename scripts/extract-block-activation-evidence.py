"""Independent numeric source witnesses for completed block activations.

All applied block outcomes are retained, including candidates the application
cannot qualify. No app imports, support decisions, inherited fields or scores.
"""
import argparse, hashlib, importlib.util, json, re
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def raw(n):
    if n is None:return None
    if not len(n):
        text=(n.text or '').strip()
        return '' if not text else int(text) if re.fullmatch(r'-?\d+',text) else float(text) if re.fullmatch(r'-?\d+\.\d+',text) else None
    result={}
    for c in n:
        value=raw(c)
        if c.tag in result:
            if not isinstance(result[c.tag],list):result[c.tag]=[result[c.tag]]
            result[c.tag].append(value)
        else:result[c.tag]=value
    return result

def frame(n,locator):
    return dict(locator=locator,phase=raw(n.find('CurrentPhase')),stable=raw(n.find('IsStable')),
        period=raw(n.find('Period')),activeTeam=raw(n.find('ActiveTeam')),activeGamer=raw(n.find('ActiveGamer')),
        teams=[dict(rosterIndex=i,teamId=raw(t.find('Data/TeamId')),turn=raw(t.find('GameTurn')),
            players=[{k:raw(p.find(k)) for k in ['Id','Cell','CanAct','TackleZone','Status','Situation']} for p in t.findall('./ListPitchPlayers/PlayerState')]) for i,t in enumerate(n.findall('./ListTeams/TeamState'))])

files=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=inv.parse_xml(inv.decode_replay(path));initial=root.find('./NotificationGameJoined/InitialBoardState')
    frames=[frame(initial,dict(replayStep=None,childIndex=None))];events=[];current=0
    for rn,row in enumerate(root.findall('ReplayStep'),1):
        for ci,child in enumerate(row):
            base=dict(replayStep=rn,childIndex=ci)
            if child.tag=='BoardState':
                frames.append(frame(child,base));current=len(frames)-1;continue
            if child.tag=='EventExecuteSequence':
                for si,step in enumerate(child.iter('StepResult')):
                    decoded=inv.decode_message(step.findtext('./Step/MessageData'))
                    for mi,msg in enumerate(step.iter('StringMessage')):
                        n=inv.decode_message(msg.findtext('MessageData'))
                        events.append(dict(locator=dict(**base,stepIndex=si,messageIndex=mi),tag=n.tag,payload=raw(n),step={decoded.tag:raw(decoded)},frame=current))
            else:events.append(dict(locator=base,tag=child.tag,payload=raw(child),frame=current))
    cases=[]
    declarations=[(i,e) for i,e in enumerate(events) if e['tag']=='ResultUseAction']
    for i,applied in enumerate(events):
        if applied['tag']!='ResultBlockOutcome':continue
        prior=next(((j,e) for j,e in reversed(declarations) if j<i),None)
        following=next(((j,e) for j,e in declarations if j>i),None)
        if not prior or not following:continue
        pi,decl=prior;ni,nxt=following
        # Preserve all intervening raw tags and clock observations. No
        # statement that every candidate is a valid same-turn completion.
        cases.append(dict(declaration=decl,applied=applied,following=nxt,
            prefixTags=[e['tag'] for e in events[pi+1:i]],suffixTags=[e['tag'] for e in events[i+1:ni]],
            beforeFrame=decl['frame'],afterFrame=nxt['frame'],clockFrames=list(range(decl['frame'],nxt['frame']+1))))
    needed={i for c in cases for i in c['clockFrames']}
    participants={i:set() for i in needed}
    for c in cases:
        ids={c['applied']['payload'].get('AttackerId'),c['applied']['payload'].get('DefenderId'),c['following']['step'].get('PlayerStep',{}).get('PlayerId')}
        for i in c['clockFrames']:participants[i].update(ids)
    for i in needed:
        for team in frames[i]['teams']:team['players']=[p for p in team['players'] if p['Id'] in participants[i]]
    files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        frames=[dict(index=i,**f) for i,f in enumerate(frames) if i in needed],cases=cases,
        controls=[{k:e[k] for k in ['locator','tag','payload']} for e in events if e['tag'] in ['EventPauseActiveTimer','EventStartActiveTimer','EventGamersAreReady','EventActiveTimerChanged']]))
compact=lambda v:json.dumps(v,separators=(',',':'))
lines=['{','"scope":"Raw numeric block/declaration/clock and selected-participant projections only; not full rosters, source admission or activation/value inference.",','"files":[']
for i,f in enumerate(files):
    lines+=['{','"file":'+compact(f['file'])+',','"sha256":'+compact(f['sha256'])+',','"frames":[']
    lines += [compact(v)+(',' if j<len(f['frames'])-1 else '') for j,v in enumerate(f['frames'])]
    lines += ['],','"cases":[']
    lines += [compact(v)+(',' if j<len(f['cases'])-1 else '') for j,v in enumerate(f['cases'])]
    lines += ['],','"controls":[']
    lines += [compact(v)+(',' if j<len(f['controls'])-1 else '') for j,v in enumerate(f['controls'])]
    lines += [']','}'+(',' if i<len(files)-1 else '')]
rendered='\n'.join(lines+[']','}'])+'\n';target=Path('tests/fixtures/evidence/bb3-block-activation-ends.json')
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:assert target.read_text()==rendered,'Block source evidence changed; inspect before replacing.'
else:target.write_text(rendered)
print([(f['file'],len(f['cases'])) for f in files])
