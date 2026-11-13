"""Raw damage prefixes and independent rational injury-tier comparisons.

No application admission, probability, ownership or scoring imports. Source
selections are the separately reviewed conditional-table witnesses, including
negative cases. This artifact is not an admission oracle or a full board.
"""
import argparse, hashlib, importlib.util, json
from fractions import Fraction
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
table_facts=json.loads(Path('tests/fixtures/evidence/bb3-injury-tables.json').read_text())
math=[]
for table in table_facts['tables']:
    tiers=[table['counts'][0],table['counts'][1],sum(table['counts'][2:])]
    rows=[]
    for total, tier4 in enumerate(table['totalOutcomes'],2):
        tier=min(tier4,2)
        less=Fraction(sum(tiers[:tier]),36);more=Fraction(sum(tiers[tier+1:]),36)
        delta=more-less
        rows.append(dict(total=total,tableOutcome=tier4,less=str(less),same=str(Fraction(tiers[tier],36)),more=str(more),delta=str(delta),weighted=str(delta*Fraction(3,2))))
    assert sum(Fraction(n)*Fraction(row['delta']) for n,row in zip([1,2,3,4,5,6,5,4,3,2,1],rows))==0
    math.append(dict(stunty=table['stunty'],thickSkull=table['thickSkull'],rows=rows))
cases=[];roots={}
def val(n):return None if n is None or n.text is None else int(n.text)
def skills(data,tag):
    n=data.find(tag) if data is not None else None
    return None if n is None else [int(x.text) for x in n]
def data(p):
    n=p.find('Data')
    return None if n is None else dict(playerId=val(n.find('Id')),playerTypeId=val(n.find('IdPlayerTypes')),innateSkills=skills(n,'InnateSkills'),acquiredSkills=skills(n,'AcquiredSkills'))
for selected in table_facts['cases']:
    filename=selected['sourceFile'];path=Path('demo-replays')/filename
    if filename not in roots:roots[filename]=inv.parse_xml(inv.decode_replay(path))
    root=roots[filename];loc=selected['locator'];rn,ci,si,mi=[loc[k] for k in ['replayStep','childIndex','stepIndex','messageIndex']]
    prefixes=[];participants={int(selected['subjectId'])}
    # A block offer and its resolution can straddle adjacent source sequences.
    # Keep their full locators: matching a step index alone is insufficient.
    for pn,row in enumerate(root.findall('ReplayStep'),1):
        if pn<max(1,rn-4):continue
        if pn>rn:break
        for pc,sequence in enumerate(row):
            if (pn,pc)>(rn,ci):break
            if sequence.tag!='EventExecuteSequence':continue
            for i,s in enumerate(sequence.iter('StepResult')):
                if (pn,pc,i)>(rn,ci,si):break
                decoded=inv.decode_message(s.findtext('./Step/MessageData'))
                if decoded.tag=='PlayerStep' and decoded.find('PlayerId') is not None:participants.add(int(decoded.findtext('PlayerId')))
                messages=[]
                for j,m in enumerate(s.iter('StringMessage')):
                    if (pn,pc,i,j)>(rn,ci,si,mi):break
                    value=inv.decode_message(m.findtext('MessageData'))
                    messages.append(dict(messageIndex=j,tag=value.tag,payload=inv.numeric_projection(value)))
                prefixes.append(dict(replayStep=pn,childIndex=pc,stepIndex=i,tag=decoded.tag,payload=inv.numeric_projection(decoded),messages=messages))
    observations=[]
    boards=[(None,None,root.find('./NotificationGameJoined/InitialBoardState'))]
    for row,frame in enumerate(root.findall('ReplayStep'),1):
        for child,n in enumerate(frame):
            if (row,child)>=(rn,ci):break
            if n.tag=='BoardState':boards.append((row,child,n))
        if row>=rn:break
    for row,child,board in boards:
        for ri,team in enumerate(board.findall('./ListTeams/TeamState')):
            for p in team.findall('./ListPitchPlayers/PlayerState'):
                if val(p.find('Id')) not in participants:continue
                observations.append(dict(replayStep=row,childIndex=child,rosterIndex=ri,teamId=val(team.find('Data/TeamId')),playerId=val(p.find('Id')),data=data(p)))
    cases.append(dict(file=filename,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),locator=loc,subjectId=selected['subjectId'],prefixes=prefixes,observations=observations))
result=dict(scope='Raw numeric damage prefixes and selected participant Data observations; not full boards, source admission, modifier eligibility, treatment or final availability.',math=math,cases=cases)
compact=lambda value:json.dumps(value,separators=(',',':'))
lines=['{','"scope":'+compact(result['scope'])+',','"math":[']
lines += [compact(t)+(',' if i<len(math)-1 else '') for i,t in enumerate(math)]
lines += ['],','"cases":[']
for i,c in enumerate(cases):
    lines += ['{','"file":'+compact(c['file'])+',','"sha256":'+compact(c['sha256'])+',','"locator":'+compact(c['locator'])+',','"subjectId":'+compact(c['subjectId'])+',','"prefixes":[']
    lines += [compact(p)+(',' if j<len(c['prefixes'])-1 else '') for j,p in enumerate(c['prefixes'])]
    lines += ['],','"observations":[']
    lines += [compact(o)+(',' if j<len(c['observations'])-1 else '') for j,o in enumerate(c['observations'])]
    lines += [']','}'+(',' if i<len(cases)-1 else '')]
rendered='\n'.join(lines+[']','}'])+'\n';target=Path('tests/fixtures/evidence/bb3-categorical-injuries.json')
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:assert target.read_text()==rendered,'Categorical injury source/reference changed; review before replacing.'
else:target.write_text(rendered)
print(dict(cases=len(cases),tables=len(math),prefixSteps=sum(len(c['prefixes']) for c in cases)))
