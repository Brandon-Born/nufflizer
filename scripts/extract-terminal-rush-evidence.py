"""Independent raw Rush successor/availability facts, not full tactical calibration.
Uses stdlib XML/base64 and exact fractions; imports no application pipeline.
"""
import argparse
import hashlib
import importlib.util
import json
from fractions import Fraction
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
OUT = Path('tests/fixtures/evidence/bb3-terminal-rush-moves.json')
completion = json.loads(Path('tests/fixtures/evidence/bb3-deterministic-move-completion.json').read_text())
selections = [
    ('demo2.bbr', 'team_rush_second_move', 91, 92, '41', 90),
    ('demo2.bbr', 'team_rush_third_move', 137, 138, None, None),
    ('demo7.bbr', 'team_rush_away_move', 100, 101, None, None),
    ('demo9.bbr', 'team_rush_diagonal_move', 117, 118, '40', 116),
]
roots = {}
def root(file):
    if file not in roots:
        roots[file] = inv.parse_xml(inv.decode_replay(Path('demo-replays')/file))
    return roots[file]
def sha(file):
    return hashlib.sha256((Path('demo-replays')/file).read_bytes()).hexdigest()
def cell(node):
    return {k.lower(): int(node.findtext(k)) for k in ['X', 'Y']}
def rows(node):
    return [(inv.decode_message(r.findtext('./Step/MessageData')),
             [inv.decode_message(m.findtext('MessageData')) for m in r.iter('StringMessage')])
            for r in node.find('EventExecuteSequence').iter('StepResult')]
def projection(node):
    return {node.tag: inv.numeric_projection(node)}

cases = []
for file, identifier, qstep, fstep, spent, completed_step in selections:
    doc = root(file)
    steps = doc.findall('ReplayStep')
    before = steps[qstep-2].findall('BoardState')[-1]
    waiting = steps[qstep-1].findall('BoardState')[-1]
    first, first_msgs = rows(steps[qstep-1])[0]
    step, messages = rows(steps[qstep-1])[-1]
    question = messages[-1]
    final_step, final_msgs = rows(steps[fstep-1])[0]
    choice, final, move, outcome = final_msgs
    actor = step.findtext('PlayerId')
    assert first.findtext('StepType') == '0' and first_msgs[0].tag == 'ResultUseAction'
    assert first_msgs[0].findtext('Action') == '1' and first.findtext('PlayerId') == actor
    assert step.findtext('StepType') == final_step.findtext('StepType') == '1'
    assert final_step.findtext('PlayerId') == actor
    assert cell(step.find('CellFrom')) == cell(final_step.find('CellFrom'))
    destination = cell(step.find('CellTo'))
    assert destination == cell(final_step.find('CellTo'))
    info = question.find('RollInfos')
    assert question.tag == 'QuestionTeamRerollUsage' and question.findtext('CanUseTeamReroll') == '1'
    assert info.findtext('RollType') == final.findtext('RollType') == '1'
    assert info.findtext('Requirement') == final.findtext('Requirement') == '2'
    assert info.findtext('Difficulty') == final.findtext('Difficulty') == '2'
    assert info.findtext('Outcome') == '0' and info.findtext('Status') == '1'
    assert info.findtext('./Dice/Die/Value') == '1'
    assert choice.tag == 'ResultTeamRerollUsage' and choice.findtext('Used') == '1'
    assert choice.findtext('GamerId') == question.findtext('GamerId') == '1'
    assert final.tag == 'ResultRoll' and final.findtext('Status') == '2' and final.findtext('NewRoll') == '1'
    assert int(final.findtext('./Dice/Die/Value')) >= 2 and final.findtext('Outcome') == '1'
    for die in [info, final]:
        assert len(die.findall('./Dice/Die')) == 1 and die.findtext('./Dice/Die/DieType') == '0'
        assert die.find('Modifiers') is None or len(die.find('Modifiers')) == 0
    assert len(outcome.findall('./Rolls/RollSummary')) == 1
    assert move.tag == 'ResultDoMove' and len(move) == 0
    assert outcome.tag == 'ResultMoveOutcome' and outcome.findtext('Moved') == '1'
    assert outcome.findtext('./Rolls/RollSummary/RollType') == '1'
    assert outcome.findtext('./Rolls/RollSummary/Outcome') == '1'
    assert before.findtext('IsStable') == '1' and before.findtext('CurrentPhase') == '5'
    teams = before.findall('./ListTeams/TeamState')
    own = next(t for t in teams if t.findtext('./Data/TeamId') == '1')
    players = own.findall('./ListPitchPlayers/PlayerState')
    assert sum(p.findtext('Id') == actor for t in teams for p in t.findall('./ListPitchPlayers/PlayerState')) == 1
    assert before.findtext('./Ball/IsHeld') == '1' and before.findtext('./Ball/Carrier') != actor
    assert [projection(before.find('Ball'))] == [projection(waiting.find('Ball'))]
    spent_proof = None
    if spent:
        spent_proof = next(c for c in completion['cases'] if c['sourceFile'] == file and
                           c['startStep'] == completed_step and c['confirmationStep'] == qstep and
                           c['actorId'] == spent and c['followingPlayerId'] == actor)
        assert spent_proof['after']['teamTurn'] == own.findtext('GameTurn')
    positions = [cell(p.find('Cell')) if p.findtext('Id') != actor else destination
                 for t in teams for p in t.findall('./ListPitchPlayers/PlayerState')
                 if cell(p.find('Cell')) != {'x': -1, 'y': -1}]
    assert len({(p['x'],p['y']) for p in positions}) == len(positions)
    occupied = {(p['x'],p['y']) for p in positions}
    candidates = []
    raw_players = []
    for p in players:
        identifier_p = p.findtext('Id')
        at = cell(p.find('Cell'))
        raw_players.append({'id': identifier_p, 'cell': at, **{k:p.findtext(k) for k in ['CanAct','Status','Situation','MovePoint']}})
        if identifier_p in {actor,spent} or at == {'x':-1,'y':-1}:
            continue
        if p.findtext('CanAct') == '0' or p.findtext('Status') not in [None,'0'] or p.findtext('Situation') not in [None,'0'] or p.findtext('MovePoint') == '0':
            continue
        if not any(0 <= at['x']+dx <= 25 and 0 <= at['y']+dy <= 14 and
                   (at['x']+dx,at['y']+dy) not in occupied
                   for dx in [-1,0,1] for dy in [-1,0,1] if dx or dy):
            continue
        # These source frames cannot certify a current complete eligibility policy.
        assert p.find('Data') is None or any(p.find(k) is None for k in ['CanAct','Status','Situation','MovePoint'])
        candidates.append(identifier_p)
    cases.append(dict(id=identifier,sourceFile=file,sha256=sha(file),questionStep=qstep,finalStep=fstep,
                      actorId=actor,teamId='1',teamTurn=own.findtext('GameTurn'),
                      fromCell=cell(step.find('CellFrom')),destination=destination,
                      originalDie=1,replacementDie=int(final.findtext('./Dice/Die/Value')),
                      rawDeclaration=projection(first_msgs[0]),question=projection(question),choice=projection(choice),
                      final=projection(final),outcome=projection(outcome),rawPlayers=raw_players,
                      completed=spent_proof,possiblePlayerIds=candidates,minimumMoves=0,maximumMoves=len(candidates),
                      lower='0',upper=str(Fraction(len(candidates),6))))
# A separate genuine non-carrier ordinary Rush retained failure demonstrates
# the recorded self-damage/turnover shape. It is a DECLINED original, not a
# fabricated failed replacement or an additional admission of the new policy.
doc=root('demo2.bbr');steps=doc.findall('ReplayStep');failed_step, msgs=rows(steps[336])[0]
assert failed_step.findtext('StepType') == '1'
assert msgs[0].tag == 'ResultTeamRerollUsage' and msgs[0].findtext('Used') == '0'
assert msgs[1].findtext('RollType') == '1' and msgs[1].findtext('NewRoll') == '0' and msgs[1].findtext('Outcome') == '0'
damage,damage_msgs=rows(steps[336])[1]
assert damage.tag == 'DamageStep' and damage.findtext('Source') == '9' and damage.findtext('Applied') == '1'
assert steps[336].findtext('./EventEndTurn/Reason') == '2'
failure_board=steps[335].findall('BoardState')[-1]
assert failure_board.findtext('./Ball/IsHeld') == '1'
assert failure_board.findtext('./Ball/Carrier') != failed_step.findtext('PlayerId')
negative=dict(ballBefore=projection(failure_board.find('Ball')),sourceFile='demo2.bbr',sha256=sha('demo2.bbr'),replayStep=337,
              scope='Genuine retained original after decline; not a failed committed replacement.',
              step=projection(failed_step),messages=[projection(x) for x in msgs],damage=projection(damage),
              damageMessages=[projection(x) for x in damage_msgs],turnEnd=projection(steps[336].find('EventEndTurn')))
output=dict(replayVersion='1-4-0-0',scope='Raw facts and bounded other-player ordinary-move component, not complete tactical value or eligibility.',
            cases=cases,retainedFailure=negative)
rendered=json.dumps(output,indent=2)+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
if args.check:
    assert OUT.read_text()==rendered,'Raw Rush evidence differs; review before updating.'
else:
    OUT.write_text(rendered)
print([(c['id'],c['maximumMoves'],c['upper']) for c in cases])
