"""Independent retained-original Rush source facts and exact component envelope.
No application parser/scorer imports; numeric/empty public-source data only.
"""
import argparse
import hashlib
import importlib.util
import json
from fractions import Fraction
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
source=Path('demo-replays/demo2.bbr');root=inv.parse_xml(inv.decode_replay(source));outer=root.findall('ReplayStep')

def decoded(number):
    return [(inv.decode_message(r.findtext('./Step/MessageData')),
             [inv.decode_message(m.findtext('MessageData')) for m in r.iter('StringMessage')])
            for r in outer[number-1].find('EventExecuteSequence').iter('StepResult')]
def cell(node):
    return {k.lower():int(node.findtext(k)) for k in ['X','Y']}
def project(node):
    value=inv.numeric_projection(node)
    if isinstance(value,dict):
        for tag in dict.fromkeys(c.tag for c in node):
            children=node.findall(tag)
            if tag in {'Modifiers','Rolls','Pushbacks','CharacModifiers','AdditionalSkills','Assists','StModifiers'} and not len(children[0]) and not (children[0].text or '').strip():
                value[tag]=['']
            elif len(children[0]):value[tag]=[project(c) for c in children]
    return value

def board(node):
    result=project(node)
    result={k:v for k,v in result.items() if k in {'IsStable','CurrentPhase','ActiveTeam','ActivePlayer','ActiveGamer','Period','Ball','ListTeams'}}
    for team in result['ListTeams'][0]['TeamState']:
        for k in list(team):
            if k not in {'Data','GameTurn','ListPitchPlayers','Side','RerollNumber'}:del team[k]
        team['Data']=[{k:v for k,v in team.get('Data',[{}])[0].items() if k=='TeamId'}]
        for p in team['ListPitchPlayers'][0]['PlayerState']:
            for k in list(p):
                if k not in {'Id','CanAct','Cell','Status','Situation','MovePoint','TackleZone','Effects'}:del p[k]
    return result

declaration,decl_msgs=decoded(335)[0]
assert declaration.findtext('PlayerId')=='46' and declaration.findtext('StepType')=='0'
assert decl_msgs[0].tag=='ResultUseAction' and decl_msgs[0].findtext('Action')=='1'
plain=[]
for step,messages in decoded(335)[1:]:
    assert step.findtext('PlayerId')=='46' and step.findtext('StepType')=='1'
    assert [m.tag for m in messages]==['ResultDoMove','ResultMoveOutcome'] and not len(messages[0])
    assert messages[1].findtext('Moved')=='1' and messages[1].findtext('./Rolls/RollSummary') is None
    plain.append(dict(fromCell=cell(step.find('CellFrom')),to=cell(step.find('CellTo'))))
assert len(plain)==5 and all(plain[n]['to']==plain[n+1]['fromCell'] for n in range(4))
first,first_msgs=decoded(336)[0];question_step,question_msgs=decoded(336)[1]
assert [m.tag for m in first_msgs]==['ResultRoll','ResultDoMove','ResultMoveOutcome']
success=first_msgs[0];assert success.findtext('RollType')=='1' and success.findtext('Status')=='1' and success.findtext('NewRoll')=='1'
assert success.findtext('Outcome')=='1' and int(success.findtext('./Dice/Die/Value'))>=2
question=question_msgs[0];info=question.find('RollInfos')
assert question.tag=='QuestionTeamRerollUsage' and question.findtext('GamerId')=='1' and question.findtext('CanUseTeamReroll')=='1'
assert info.findtext('RollType')=='1' and info.findtext('Outcome')=='0' and info.findtext('NewRoll')=='1'
assert info.findtext('./Dice/Die/Value')=='1'
final_step,final_msgs=decoded(337)[0];decision,kept,do_move,outcome=final_msgs
assert decision.tag=='ResultTeamRerollUsage' and decision.findtext('Used')=='0' and decision.findtext('GamerId')=='1'
assert kept.tag=='ResultRoll' and kept.findtext('Status')=='1' and kept.findtext('NewRoll')=='0' and kept.findtext('Outcome')=='0'
for r in [success,info,kept]:
    assert r.findtext('Requirement')==r.findtext('Difficulty')=='2'
    assert len(r.findall('./Dice/Die'))==1 and r.findtext('./Dice/Die/DieType')=='0'
    assert r.find('Modifiers') is None or not len(r.find('Modifiers'))
assert kept.findtext('./Dice/Die/Value')=='1'
from_cell=cell(first.find('CellFrom'));via=cell(first.find('CellTo'));destination=cell(question_step.find('CellTo'))
assert from_cell==plain[-1]['to']=={'x':16,'y':9} and via=={'x':15,'y':9} and destination=={'x':14,'y':9}
assert cell(question_step.find('CellFrom'))==cell(final_step.find('CellFrom'))==via
assert cell(final_step.find('CellTo'))==destination
before=outer[334].findall('BoardState')[-1];waiting=outer[335].findall('BoardState')[-1]
assert before.findtext('IsStable')=='1' and before.findtext('CurrentPhase')==waiting.findtext('CurrentPhase')=='5'
assert before.findtext('ActiveTeam')==waiting.findtext('ActiveTeam')=='1'
assert project(before.find('Ball'))==project(waiting.find('Ball')) and before.findtext('./Ball/IsHeld')=='1'
assert before.findtext('./Ball/Carrier')!='46'
completed=json.loads(Path('tests/fixtures/evidence/bb3-deterministic-move-completion.json').read_text())
spent=next(c for c in completed['cases'] if c['sourceFile']=='demo2.bbr' and c['startStep']==334 and c['confirmationStep']==335 and c['actorId']=='43' and c['followingPlayerId']=='46')
teams=before.findall('./ListTeams/TeamState');own=next(t for t in teams if t.findtext('./Data/TeamId')=='1')
assert own.findtext('GameTurn')==spent['after']['teamTurn']=='9'
positions=[destination if p.findtext('Id')=='46' else cell(p.find('Cell')) for t in teams for p in t.findall('./ListPitchPlayers/PlayerState') if cell(p.find('Cell'))!={'x':-1,'y':-1}]
occupied={(p['x'],p['y']) for p in positions};assert len(occupied)==len(positions)
possible=[]
for p in own.findall('./ListPitchPlayers/PlayerState'):
    at=cell(p.find('Cell'));identifier=p.findtext('Id')
    if identifier in ['46','43'] or at=={'x':-1,'y':-1} or p.findtext('CanAct')=='0' or p.findtext('Status') not in [None,'0'] or p.findtext('Situation') not in [None,'0'] or p.findtext('MovePoint')=='0':continue
    if not any(0<=at['x']+dx<=25 and 0<=at['y']+dy<=14 and (at['x']+dx,at['y']+dy) not in occupied for dx in [-1,0,1] for dy in [-1,0,1] if dx or dy):continue
    assert p.find('Data') is None or any(p.find(k) is None for k in ['CanAct','Status','Situation','MovePoint'])
    possible.append(identifier)
damage,messages=decoded(337)[1]
assert damage.tag=='DamageStep' and damage.findtext('Source')=='9' and damage.findtext('Applied')=='1'
assert damage.findtext('PlayerId')==damage.findtext('TargetId')=='46'
assert cell(damage.find('CellFrom'))==cell(damage.find('CellTo'))==via
assert [m.tag for m in messages]==['ResultRoll','ResultInjuryRoll','ResultPlayerRemoval']
assert outer[336].findtext('./EventEndTurn/Reason')=='2'
records=[];sequence=0
for number,node in enumerate(outer,1):
    for child_index,child in enumerate(node):
        if child.tag=='EventExecuteSequence':
            sequence+=1
            if number not in range(333,338):continue
            steps=[]
            for step_index,r in enumerate(child.iter('StepResult')):
                s=inv.decode_message(r.findtext('./Step/MessageData'));ms=[inv.decode_message(m.findtext('MessageData')) for m in r.iter('StringMessage')]
                steps.append(dict(stepIndex=step_index,step={s.tag:project(s)},messages=[{m.tag:project(m)} for m in ms]))
            records.append(dict(replayStep=number,childIndex=child_index,sequence=sequence,steps=steps))
        elif number in range(333,338):records.append(dict(replayStep=number,childIndex=child_index,projection={child.tag:board(child) if child.tag=='BoardState' else project(child) or {}}))
case=dict(id='retained_original_second_rush_failure',sourceFile='demo2.bbr',sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
          actorId='46',teamId='1',originalStep=336,finalStep=337,fromCell=from_cell,via=via,destination=destination,
          prefixMoves=plain,spent=spent,possiblePlayerIds=possible,maximumMoves=len(possible),minimumMoves=0,
          lower=str(-Fraction(5,6)*len(possible)),upper='0',originalDie=1,keptDie=1,priorSuccessDie=int(success.findtext('./Dice/Die/Value')),
          damage={damage.tag:project(damage)},damageMessages=[{m.tag:project(m)} for m in messages],records=records)
output=dict(replayVersion='1-4-0-0',purpose='Actual retained-original decline policy and physical prefix only. Numeric source fragments need a labeled owner scaffold; they are not full-match calibration or failed committed replacement evidence.',cases=[case])
rendered=json.dumps(output,indent=2)+'\n';path=Path('tests/fixtures/evidence/bb3-kept-rush-moves.json')
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
if args.check:assert path.read_text()==rendered,'Source facts differ; review before updating.'
else:path.write_text(rendered)
print(dict(possiblePlayerIds=possible,lower=case['lower'],upper=case['upper']))
