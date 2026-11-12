"""Independent numeric facts for fresh-roster ordinary Move completion.
Uses stdlib XML/base64 decoding; does not import application attribution/scoring.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
selected = [
    ('demo11.bbr', 113, 114), ('demo11.bbr', 157, 158),
    ('demo11.bbr', 158, 159), ('demo11.bbr', 197, 198),
    ('demo11.bbr', 230, 231), ('demo11.bbr', 247, 248),
    ('demo11.bbr', 286, 287), ('demo11.bbr', 312, 313),
    ('demo11.bbr', 313, 314), ('demo11.bbr', 332, 333),
    ('demo6.bbr', 232, 233),
]
roots = {}
cases = []

def cell(node):
    assert node is not None
    return {axis.lower(): int(node.findtext(axis)) for axis in ['X', 'Y']}

def team(board, actor):
    owners = [t for t in board.findall('./ListTeams/TeamState')
              if any(p.findtext('Id') == actor for p in t.findall('./ListPitchPlayers/PlayerState'))]
    assert len(owners) == 1
    return owners[0]

def player(board, actor):
    return next(p for p in team(board, actor).findall('./ListPitchPlayers/PlayerState') if p.findtext('Id') == actor)

def snapshot(board, actor):
    t, p = team(board, actor), player(board, actor)
    return {name: board.findtext(name) for name in ['CurrentPhase', 'IsStable', 'ActiveTeam', 'ActiveGamer', 'Period']} | {
        'teamId': t.findtext('./Data/TeamId'), 'teamTurn': t.findtext('GameTurn'),
        'actorCell': cell(p.find('Cell')), 'CanAct': p.findtext('CanAct'),
        'Status': p.findtext('Status'), 'MovePoint': p.findtext('MovePoint')}

for filename, start, end in selected:
    source = Path('demo-replays') / filename
    if filename not in roots:
        roots[filename] = inv.parse_xml(inv.decode_replay(source))
    root = roots[filename]
    rows = root.findall('ReplayStep')
    before = [b for row in rows[:start-1] for b in row.findall('BoardState')][-1]
    current = rows[start-1]
    sequence = current.find('EventExecuteSequence')
    results = list(sequence.iter('StepResult'))
    decoded = [(inv.decode_message(r.findtext('./Step/MessageData')),
                [inv.decode_message(m.findtext('MessageData')) for m in r.iter('StringMessage')]) for r in results]
    first, messages = decoded[0]
    actor = first.findtext('PlayerId')
    assert first.tag == 'PlayerStep' and first.findtext('StepType') == '0'
    assert len(messages) == 1 and messages[0].tag == 'ResultUseAction' and messages[0].findtext('Action') == '1'
    initial = root.findall('./NotificationGameJoined/InitialBoardState/ListTeams/TeamState')
    initial_ids = [p.findtext('Id') for t in initial for p in t.findall('./ListPitchPlayers/PlayerState')]
    assert actor not in initial_ids
    location = cell(first.find('CellFrom'))
    moves = []
    for step, msgs in decoded[1:]:
        assert step.tag == 'PlayerStep' and step.findtext('PlayerId') == actor
        assert step.findtext('Skill') == '0' and step.findtext('IsEvaluation') == '0'
        assert cell(step.find('CellFrom')) == location
        if step.findtext('StepType') == '7':
            assert len(msgs) == 1 and msgs[0].tag == 'ResultNoRollSuccess' and len(msgs[0]) == 0
            assert cell(step.find('CellTo')) == location
        else:
            assert step.findtext('StepType') == '1'
            destination = cell(step.find('CellTo'))
            assert max(abs(destination[k]-location[k]) for k in location) == 1
            assert [m.tag for m in msgs] == ['ResultDoMove', 'ResultMoveOutcome']
            assert len(msgs[0]) == 0 and msgs[1].findtext('Moved') == '1'
            assert msgs[1].findtext('TentacleUsed') == '0' and msgs[1].findtext('FumbleRooskieUsed') == '0'
            assert not list(msgs[1].findall('./Rolls/RollSummary')) and not list(msgs[1].findall('./Pushbacks/ResultPushBack'))
            moves.append({'from': location, 'to': destination})
            location = destination
    assert moves
    after = current.find('BoardState')
    children = list(current)
    marker = children[children.index(after)-1]
    assert marker.tag == 'EventRulesEngineStandBy'
    assert marker.findtext('Phase') == '5'
    b, a = snapshot(before, actor), snapshot(after, actor)
    assert a['CurrentPhase'] == b['CurrentPhase'] == '5' and a['IsStable'] == b['IsStable'] == '1'
    assert a['teamId'] == b['teamId'] and a['teamTurn'] == b['teamTurn'] and a['Period'] == b['Period']
    assert a['ActiveTeam'] == b['ActiveTeam'] and a['ActiveGamer'] == b['ActiveGamer'] == marker.findtext('ActiveGamer')
    assert a['actorCell'] == location and b['actorCell'] == cell(first.find('CellFrom'))
    following = rows[end-1].find('EventExecuteSequence').find('.//StepResult')
    declaration = inv.decode_message(following.findtext('./Step/MessageData'))
    action = inv.decode_message(following.findtext('./Results/StringMessage/MessageData'))
    following_id = declaration.findtext('PlayerId')
    assert declaration.findtext('StepType') == '0' and following_id != actor
    assert action.tag == 'ResultUseAction' and int(action.findtext('Action')) in range(1, 7)
    assert team(after, following_id).findtext('./Data/TeamId') == a['teamId']
    cases.append({'sourceFile': filename, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'startStep': start, 'confirmationStep': end, 'actorId': actor, 'followingPlayerId': following_id,
                  'initialIds': initial_ids, 'before': b, 'after': a, 'ordinaryMoves': moves,
                  'standUpObserved': any(s.findtext('StepType') == '7' for s, _ in decoded),
                  'rawDeclaration': inv.numeric_projection(messages[0]), 'nextDeclaration': inv.numeric_projection(action)})

out = json.dumps({'purpose': 'Independent source facts, not game-value calibration. Initial omissions, current roster/clock, deterministic move cells and next declaration are preserved.', 'cases': cases}, indent=2) + '\n'
target = Path('tests/fixtures/evidence/bb3-current-move-completion.json')
if '--check' in sys.argv:
    assert target.read_text() == out
else:
    target.write_text(out)
print(f'{len(cases)} independent deterministic Move completion chains verified.')
