"""Independent retained-original Dodge source facts; numeric data only.
No application parser/scorer imports. Completion facts are separately verified by
extract-deterministic-move-completion.py, never inferred from future resets.
"""
import argparse
import hashlib
import importlib.util
import json
from fractions import Fraction
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
# Preserve explicit empty numeric lists in playback projections.
def project(node):
    value=inv.numeric_projection(node)
    if isinstance(value,dict):
        for tag in dict.fromkeys(c.tag for c in node):
            children=node.findall(tag)
            if tag in {'Modifiers','Rolls','Pushbacks','CharacModifiers','AdditionalSkills','Assists','StModifiers'} and not len(children[0]) and not (children[0].text or '').strip():value[tag]=['']
            elif len(children[0]):value[tag]=[project(c) for c in children]
    return value

def board(node):
    result={k:v for k,v in project(node).items() if k in {'IsStable','CurrentPhase','ActiveTeam','ActivePlayer','ActiveGamer','Period','Ball','ListTeams'}}
    for team in result['ListTeams'][0]['TeamState']:
        for k in list(team):
            if k not in {'Data','GameTurn','ListPitchPlayers','Side','RerollNumber'}:del team[k]
        team['Data']=[{k:v for k,v in team.get('Data',[{}])[0].items() if k=='TeamId'}]
        for p in team['ListPitchPlayers'][0]['PlayerState']:
            for k in list(p):
                if k not in {'Id','CanAct','Cell','Status','Situation','MovePoint','TackleZone','Effects'}:del p[k]
    return result

def cell(node):return {k.lower():int(node.findtext(k)) for k in ['X','Y']}
def rows(outer):return [(inv.decode_message(r.findtext('./Step/MessageData')),[inv.decode_message(m.findtext('MessageData')) for m in r.iter('StringMessage')]) for r in outer.find('EventExecuteSequence').iter('StepResult')]
completion=json.loads(Path('tests/fixtures/evidence/bb3-deterministic-move-completion.json').read_text())
cases=[]
for file,qstep,fstep,expected in [('demo2.bbr',431,432,8),('demo3.bbr',212,213,2),('demo8.bbr',162,163,10)]:
    path=Path('demo-replays')/file;root=inv.parse_xml(inv.decode_replay(path));outer=root.findall('ReplayStep')
    before=outer[qstep-2].findall('BoardState')[-1];waiting=outer[qstep-1].findall('BoardState')[-1]
    declaration,decl=rows(outer[qstep-1])[0];step,ms=rows(outer[qstep-1])[-1];question=ms[-1];info=question.find('RollInfos')
    final_step,final_ms=rows(outer[fstep-1])[0];choice,kept,move,outcome=final_ms
    actor=step.findtext('PlayerId');destination=cell(step.find('CellTo'));start=cell(step.find('CellFrom'))
    assert declaration.findtext('StepType')=='0' and declaration.findtext('PlayerId')==actor and decl[0].tag=='ResultUseAction' and decl[0].findtext('Action')=='1'
    assert step.findtext('StepType')==final_step.findtext('StepType')=='1' and final_step.findtext('PlayerId')==actor
    assert cell(final_step.find('CellFrom'))==start and cell(final_step.find('CellTo'))==destination
    assert question.tag=='QuestionTeamRerollUsage' and question.findtext('CanUseTeamReroll')=='1'
    assert question.findtext('GamerId')==choice.findtext('GamerId')=='1' and choice.tag=='ResultTeamRerollUsage' and choice.findtext('Used')=='0'
    assert info.findtext('NewRoll')=='1' and kept.findtext('NewRoll')=='0' and kept.findtext('Status')=='1'
    assert kept.tag=='ResultRoll'
    for roll in [info,kept]:
        assert roll.findtext('RollType')=='2' and roll.findtext('Outcome')=='0' and roll.findtext('Requirement')==roll.findtext('Difficulty')=='3'
        assert len(roll.findall('./Dice/Die'))==1 and roll.findtext('./Dice/Die/DieType')=='0' and (roll.find('Modifiers') is None or not len(roll.find('Modifiers')))
    die=int(info.findtext('./Dice/Die/Value'));assert int(kept.findtext('./Dice/Die/Value'))==die<3
    assert before.findtext('IsStable')=='1' and before.findtext('CurrentPhase')==waiting.findtext('CurrentPhase')=='5'
    assert before.findtext('ActiveTeam')==waiting.findtext('ActiveTeam')=='1' and before.findtext('./Ball/IsHeld')=='1' and before.findtext('./Ball/Carrier')!=actor
    assert project(before.find('Ball'))==project(waiting.find('Ball'))
    teams=before.findall('./ListTeams/TeamState');own=next(t for t in teams if t.findtext('./Data/TeamId')=='1');team_turn=own.findtext('GameTurn')
    players=own.findall('./ListPitchPlayers/PlayerState');last_end=max([n for n,s in enumerate(outer[:qstep-1],1) if s.find('EventEndTurn') is not None]+[0])
    spent=[c for c in completion['cases'] if c['sourceFile']==file and last_end<c['startStep'] and c['confirmationStep']<=qstep and c['after']['teamId']=='1' and c['after']['teamTurn']==team_turn and all(b.findtext('IsStable')=='1' and b.findtext('CurrentPhase')=='5' and b.findtext('ActiveTeam')=='1' and b.findtext('ActiveGamer')=='1' and b.findtext('Period')==before.findtext('Period') and next((t.findtext('GameTurn') for t in b.findall('./ListTeams/TeamState') if t.findtext('./Data/TeamId')=='1'),None)==team_turn for n in outer[c['confirmationStep']-1:qstep-1] for b in n.findall('BoardState'))]
    spent_ids={c['actorId'] for c in spent}
    for c in spent:
        player=next(p for p in players if p.findtext('Id')==c['actorId']);assert cell(player.find('Cell'))==c['after']['actorCell']
    positions=[destination if p.findtext('Id')==actor else cell(p.find('Cell')) for t in teams for p in t.findall('./ListPitchPlayers/PlayerState') if cell(p.find('Cell'))!={'x':-1,'y':-1}]
    occupied={(c['x'],c['y']) for c in positions};assert len(occupied)==len(positions)
    potential=[]
    for p in players:
        at=cell(p.find('Cell'));pid=p.findtext('Id')
        if pid==actor or at=={'x':-1,'y':-1} or p.findtext('CanAct')=='0' or p.findtext('Status') not in [None,'0'] or p.findtext('Situation') not in [None,'0'] or p.findtext('MovePoint')=='0':continue
        if not any(0<=at['x']+dx<=25 and 0<=at['y']+dy<=14 and (at['x']+dx,at['y']+dy) not in occupied for dx in [-1,0,1] for dy in [-1,0,1] if dx or dy):continue
        assert p.find('Data') is None or any(p.find(k) is None for k in ['CanAct','Status','Situation','MovePoint'])
        potential.append(pid)
    possible=[pid for pid in potential if pid not in spent_ids];assert len(possible)==expected,(file,potential,spent_ids,possible)
    damage,damage_ms=rows(outer[fstep-1])[1]
    assert damage.tag=='DamageStep' and damage.findtext('Source')=='0' and damage.findtext('Applied')=='1' and damage.findtext('PlayerId')==damage.findtext('TargetId')==actor
    assert cell(damage.find('CellFrom'))==cell(damage.find('CellTo'))==start
    assert move.tag=='ResultDoMove' and outcome.tag=='ResultMoveOutcome' and outcome.findtext('Moved')=='1' and outcome.findtext('./Rolls/RollSummary/RollType')=='2' and outcome.findtext('./Rolls/RollSummary/Outcome')=='0'
    assert outer[fstep-1].findtext('./EventEndTurn/Reason')=='2'
    records=[];sequence=0
    for number,node in enumerate(outer,1):
        for ci,child in enumerate(node):
            if child.tag=='EventExecuteSequence':
                sequence+=1
                if number not in range(qstep-1,fstep+1):continue
                rs=[dict(stepIndex=i,step={s.tag:project(s)},messages=[{m.tag:project(m)} for m in msgs]) for i,(s,msgs) in enumerate(rows(node))]
                records.append(dict(replayStep=number,childIndex=ci,sequence=sequence,steps=rs))
            elif number in range(qstep-1,fstep+1):records.append(dict(replayStep=number,childIndex=ci,projection={child.tag:board(child) if child.tag=='BoardState' else project(child) or {}}))
    cases.append(dict(id=file[:-4]+'_kept_dodge',sourceFile=file,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),questionStep=qstep,finalStep=fstep,actorId=actor,teamId='1',teamTurn=int(team_turn),fromCell=start,destination=destination,originalDie=die,keptDie=die,threshold=3,successChance='2/3',rawPotentialPlayerIds=potential,completed=spent,possiblePlayerIds=possible,minimumMoves=0,maximumMoves=expected,lower=str(-Fraction(2,3)*expected),upper='0',declaration={decl[0].tag:project(decl[0])},question={question.tag:project(question)},choice={choice.tag:project(choice)},final={kept.tag:project(kept)},damage={damage.tag:project(damage)},records=records))
output=dict(replayVersion='1-4-0-0',scope='Retained original failures under the recorded fixed decline policy, teammate ordinary moves only. Numeric fragments require a labeled owner scaffold and omit earlier completion history; they cannot certify full-match eligibility or calibration.',cases=cases)
path=Path('tests/fixtures/evidence/bb3-kept-dodge-moves.json');rendered=json.dumps(output,indent=2)+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
if args.check:assert path.read_text()==rendered,'Source facts differ; review before updating.'
else:path.write_text(rendered)
print([(c['sourceFile'],c['possiblePlayerIds'],c['lower']) for c in cases])
