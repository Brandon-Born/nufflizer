"""Every direct injury message and its raw sequence/current participants.

No application admission or scores select cases. Existing complete trait seeds
and independent rule tables are hash-bound, not rewritten by this extraction.
"""
import argparse
import gzip
import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path

spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)


def raw(node):
    if node is None:
        return None
    if not len(node):
        value=(node.text or '').strip()
        if not value:
            return ''
        if value.lstrip('-').isdigit():
            return int(value)
        if re.fullmatch(r'-?\d+\.\d+',value):
            value=float(value)
            return value if math.isfinite(value) else None
        return None
    result={}
    for c in node:
        value=raw(c)
        if c.tag in result:
            old=result[c.tag]
            result[c.tag]=old+[value] if isinstance(old,list) else [old,value]
        else:
            result[c.tag]=value
    return result


def participants(board,ids):
    return [dict(rosterIndex=i,teamId=raw(t.find('Data/TeamId')),
                 effects=raw(t.find('Effects')),prayers=raw(t.find('ActivePrayers')),
                 transformations=raw(t.find('TransformedPlayers')),
                 player={k:raw(p.find(k)) for k in ['Id','Cell','Status','Situation','CanAct','TackleZone','Effects']} | {
                     'Data':None if p.find('Data') is None else {k:raw(p.find('Data/'+k)) for k in ['Id','TeamId','IdPlayerTypes','InnateSkills','AcquiredSkills']}})
            for i,t in enumerate(board.findall('./ListTeams/TeamState'))
            for p in t.findall('./ListPitchPlayers/PlayerState') if p.findtext('Id') in ids]


files=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=inv.parse_xml(inv.decode_replay(path))
    current=root.find('./NotificationGameJoined/InitialBoardState')
    checkpoint=dict(replayStep=None,childIndex=None)
    records=[]
    sequences=[]
    for rn,frame in enumerate(root.findall('ReplayStep'),1):
        for ci,child in enumerate(frame):
            if child.tag=='BoardState':
                current,checkpoint=child,dict(replayStep=rn,childIndex=ci)
                continue
            if child.tag!='EventExecuteSequence':
                continue
            steps=[]
            for si,entry in enumerate(child.iter('StepResult')):
                header=inv.decode_message(entry.findtext('./Step/MessageData'))
                messages=[inv.decode_message(m.findtext('MessageData')) for m in entry.iter('StringMessage')]
                steps.append(dict(stepIndex=si,tag=header.tag,header=raw(header),messages=[dict(tag=m.tag,payload=raw(m)) for m in messages]))
                for mi,message in enumerate(messages):
                    if message.tag!='ResultInjuryRoll':
                        continue
                    wanted={p.findtext('Id') for p in current.findall('./ListTeams/TeamState/ListPitchPlayers/PlayerState')}
                    records.append(dict(locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),
                                        checkpoint=checkpoint,boardEffects=raw(current.find('Effects')),
                                        phase=raw(current.find('CurrentPhase')),
                                        participants=participants(current,wanted)))
            sequences.append(dict(locator=dict(replayStep=rn,childIndex=ci),steps=steps))
    files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),records=records,sequences=sequences))
refs={name:hashlib.sha256(Path('tests/fixtures/evidence',name).read_bytes()).hexdigest() for name in ['bb3-trait-transitions.json','bb3-injury-tables.json','bb3-categorical-injuries.json']}
result=dict(scope='All ResultInjuryRoll messages before admission, plus their literal raw sequence prefix and last snapshot participants. No application traits, probabilities, scoring or output-derived source selection. Raw skill seeds, namespace facts and injury rule arithmetic are separately hash-bound.',references=refs,files=files)
target=Path('tests/fixtures/evidence/bb3-intrinsic-injuries.json.gz')
rendered=json.dumps(result,separators=(',',':'))+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
if args.check:
    assert gzip.decompress(target.read_bytes()).decode()==rendered,'Raw injury continuity witnesses differ.'
else:
    target.write_bytes(gzip.compress(rendered.encode(),mtime=0))
print(json.dumps(dict(files=len(files),injuries=sum(len(f['records']) for f in files))))
