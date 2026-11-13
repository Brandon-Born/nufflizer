"""Independent raw roster/role witnesses and exact dice arithmetic.

No application imports or supported/scored outputs. Select every core dice
record whose actor/defender is absent/ambiguous in the initial rosters or has
contradictory current membership. Runtime policy admission is tested separately.
Opaque buyer identifiers are classified without retaining their contents.
"""
import argparse
import hashlib
import importlib.util
import itertools
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)

def integer(value):
    try: return int(value)
    except (TypeError,ValueError): return None

def team_ids(board):
    return [integer(t.findtext('./Data/TeamId')) for t in board.findall('./ListTeams/TeamState')]

def memberships(board, player):
    return [dict(rosterIndex=i,dataPlayerId=integer(p.findtext('./Data/Id')),
                 dataTeamId=integer(p.findtext('./Data/TeamId')),playerTypeId=integer(p.findtext('./Data/IdPlayerTypes')))
            for i,t in enumerate(board.findall('./ListTeams/TeamState'))
            for p in t.findall('./ListPitchPlayers/PlayerState') if p.findtext('Id')==player]

def owner(board,player,known):
    ids=team_ids(board)
    if len(ids)!=2 or len(known)!=2 or all(t is None for t in ids) or any(t is not None and t not in known for t in ids): return None
    resolved=[t if t is not None else next((k for k in known if k!=ids[1-i]),None) for i,t in enumerate(ids)]
    found=memberships(board,player)
    if len(found)!=1 or len(set(resolved))!=2: return None
    p=found[0];team=resolved[p['rosterIndex']]
    if p['dataPlayerId'] not in [None,integer(player)] or p['dataTeamId'] not in [None,team]: return None
    return str(team)

def arithmetic(tag,p,before):
    dice=p.findall('./Dice/Die');values=[integer(d.findtext('Value')) for d in dice]
    types=[integer(d.findtext('DieType')) for d in dice]
    roll=integer(p.findtext('RollType'));target=integer(p.findtext('Difficulty'))
    if tag=='QuestionBlockDice' and roll==3 and 1<=len(values)<=3 and all(t==2 for t in types):
        indices=[integer(n.text) for n in p.findall('./RolledDiceIndexes/RolledDiceIndexesItem')]
        if not indices or len(set(indices))!=len(indices) or any(n is None or n<0 or n>=len(values) for n in indices):return None
        choose=integer(p.findtext('AttackerChoice'))
        if choose not in [0,1]:return None
        pick=max if choose else min
        good=0
        for faces in itertools.product([0,1,2,2,3,4],repeat=len(indices)):
            pool=values.copy()
            for i,v in zip(indices,faces):pool[i]=v
            good+=pick(pool)>=3
        return dict(numerator=good,denominator=6**len(indices),actualSuccess=pick(values)>=3,policy='block_pool')
    if tag=='EventRoll' and roll==13 and len(values)==1 and target in [3,4]:
        return dict(numerator=7-target,denominator=6,actualSuccess=values[0]>=target,policy='single_attempt')
    if tag!='ResultRoll' or any(t!=0 for t in types):return None
    if roll==10 and len(values)==2 and target is not None:
        return dict(numerator=sum(a+b<target for a in range(1,7) for b in range(1,7)),denominator=36,
                    actualSuccess=sum(values)<target,policy='single_attempt')
    if roll in [1,2,4,7] and len(values)==1 and target is not None and 2<=target<=6:
        good=7-target;den=6;policy='single_attempt'
        # The one complete same-step optional-skill policy, independently
        # identified by original failure -> explicit use -> replacement.
        skill={2:7,4:61,7:6}.get(roll)
        if p.findtext('Status')=='2' and len(before)==2 and before[0].tag=='ResultRoll' and before[1].tag=='ResultSkillUsage' and skill is not None:
            original,use=before
            if (original.findtext('RollType')==str(roll) and original.findtext('Difficulty')==str(target) and
                original.findtext('Status')=='1' and original.findtext('NewRoll')=='1' and original.findtext('Outcome')=='0' and
                use.findtext('Skill')==str(skill) and use.findtext('Used')=='1'):
                good=36-(6-good)**2;den=36;policy='two_attempt'
        return dict(numerator=good,denominator=den,actualSuccess=values[0]>=target,policy=policy)
    return None

def roster(board,locator):
    return dict(locator=locator,teamIds=team_ids(board),players=[
        [i,p.findtext('Id'),integer(p.findtext('./Data/Id')),integer(p.findtext('./Data/TeamId')),integer(p.findtext('./Data/IdPlayerTypes'))]
        for i,t in enumerate(board.findall('./ListTeams/TeamState'))
        for p in t.findall('./ListPitchPlayers/PlayerState')])

files=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=inv.parse_xml(inv.decode_replay(path));initial=root.find('./NotificationGameJoined/InitialBoardState')
    known=sorted(t for t in team_ids(initial) if t is not None)
    assert len(set(known))==2
    initial_members={p.findtext('Id') for p in initial.findall('./ListTeams/TeamState/ListPitchPlayers/PlayerState')}
    last_board=initial;last_locator=dict(replayStep=None,childIndex=None)
    cases=[];mutations=[];rosters=[roster(initial,last_locator)]
    mutated_ids={c.findtext('MercenaryId') for row in root.findall('ReplayStep') for c in row if c.tag in ['EventBuyMercenary','EventRemoveMercenary']}
    for rn,row in enumerate(root.findall('ReplayStep'),1):
        for ci,child in enumerate(row):
            locator=dict(replayStep=rn,childIndex=ci)
            if child.tag=='BoardState':
                last_board=child;last_locator=locator;rosters.append(roster(child,locator));continue
            if child.tag in ['EventBuyMercenary','EventRemoveMercenary']:
                buyer=child.findtext('GamerId')
                mutations.append(dict(locator=locator,operation='purchase' if child.tag=='EventBuyMercenary' else 'removal_record',
                                      playerId=child.findtext('MercenaryId'),playerTypeId=integer(child.findtext('MercenaryType')),
                                      buyerIdKind='small_numeric' if buyer in ['0','1'] else 'missing' if buyer is None else 'uninterpreted',
                                      **({'gamerId':int(buyer)} if buyer in ['0','1'] else {})))
            records=[]
            if child.tag=='EventExecuteSequence':
                for si,result in enumerate(child.iter('StepResult')):
                    step=inv.decode_message(result.findtext('./Step/MessageData'))
                    messages=[inv.decode_message(m.findtext('MessageData')) for m in result.iter('StringMessage')]
                    for mi,p in enumerate(messages):records.append((step,p,messages[:mi],dict(**locator,stepIndex=si,messageIndex=mi)))
            elif child.tag=='EventRoll': records.append((None,child,[],locator))
            for step,p,before,where in records:
                if p.tag not in ['ResultRoll','QuestionBlockDice','ResultInjuryRoll','ResultCasualtyRoll','EventRoll']:continue
                actor=p.findtext('PlayerId') or (step.findtext('PlayerId') if step is not None else None)
                defender=step.findtext('TargetId') if step is not None and p.tag=='QuestionBlockDice' else None
                if not actor:continue
                ids=[actor]+([defender] if defender and defender!='-1' else [])
                absent=any(i not in initial_members for i in ids)
                changed=any(owner(initial,i,known)!=owner(last_board,i,known) for i in ids)
                if not absent and not changed and not any(i in mutated_ids for i in ids):continue
                cases.append(dict(locator=where,sourceTag=p.tag,playerId=actor,
                                  role='subject' if (step is not None and step.tag=='DamageStep') or (p.tag=='EventRoll' and p.findtext('RollType')=='13') else 'actor',
                                  **({'defenderId':defender} if defender else {}),
                                  before=dict(locator=last_locator,teamIds=team_ids(last_board),phase=integer(last_board.findtext('CurrentPhase')),activeTeam=integer(last_board.findtext('ActiveTeam')),
                                              participants=[dict(playerId=i,members=memberships(last_board,i),teamId=owner(last_board,i,known)) for i in ids]),
                                  step={step.tag:inv.numeric_projection(step)} if step is not None else None,
                                  roll=inv.numeric_projection(p),messagesBefore=[{m.tag:inv.numeric_projection(m)} for m in before],
                                  reference=arithmetic(p.tag,p,before)))
    files.append(dict(sourceFile=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),knownTeamIds=known,
                      initialPlayerIds=sorted(initial_members,key=int),rosters=rosters,mutations=mutations,cases=cases))

output=dict(scope='Raw current ownership/identity namespace and controller witnesses; exact arithmetic for already contracted recorded dice policies, not general skill/state/tactical support.',files=files)
compact=lambda v:json.dumps(v,separators=(',',':'))
lines=['{','  "scope":'+compact(output['scope'])+',','  "files":[']
for n,f in enumerate(files):
    lines.append('    {')
    for k,v in f.items():
        if k not in ['cases','rosters']:lines.append('      '+json.dumps(k)+':'+compact(v)+',')
    lines.append('      "rosters":[')
    lines.extend('        '+compact(c)+(',' if i<len(f['rosters'])-1 else '') for i,c in enumerate(f['rosters']))
    lines.append('      ],')
    lines.append('      "cases":[')
    lines.extend('        '+compact(c)+(',' if i<len(f['cases'])-1 else '') for i,c in enumerate(f['cases']))
    lines.extend(['      ]','    }'+(',' if n<len(files)-1 else '')])
rendered='\n'.join(lines+['  ]','}'])+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
path=Path('tests/fixtures/evidence/bb3-current-ownership.json')
if args.check:assert path.read_text()==rendered,'Raw ownership witnesses changed; review before updating.'
else:path.write_text(rendered)
print([(f['sourceFile'],len(f['cases']),len(f['mutations'])) for f in files])
