"""Reproduce numeric checkpoints and messages around mental-effect lifetimes.
Run from the repository root. No application parser or semantic mapping is used.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


def numeric_projection(node):
    value = inventory.numeric_projection(node)
    if isinstance(value, dict):
        # This known empty field survives in full replay XML but not the
        # historical numeric-only projection. Preserve its observed shape.
        for child in node:
            if child.tag in {'CharacModifiers', 'AdditionalSkills'} and len(child) == 0 and not (child.text or '').strip():
                value[child.tag] = ['']
            elif len(child):
                children = node.findall(child.tag)
                value[child.tag] = [numeric_projection(entry) for entry in children]
    return value


def board_projection(node):
    board = numeric_projection(node)
    board = {k: v for k, v in board.items() if k in {
        'IsStable', 'CurrentPhase', 'ActiveTeam', 'ActivePlayer', 'Period', 'Ball', 'ListTeams'
    }}
    for team in board.get('ListTeams', [{}])[0].get('TeamState', []):
        for key in list(team):
            if key not in {'Data', 'GameTurn', 'ListPitchPlayers', 'Side'}:
                del team[key]
        if 'Data' in team:
            team['Data'] = [{k: v for k, v in team['Data'][0].items() if k == 'TeamId'}]
        for player in team.get('ListPitchPlayers', [{}])[0].get('PlayerState', []):
            for key in list(player):
                if key not in {'Id', 'CanAct', 'Cell', 'Status', 'Situation', 'MovePoint', 'TackleZone', 'Effects'}:
                    del player[key]
    return board


cases = []
for filename, identifier, selected in [
    ('demo1.bbr', 'opponent_turn', [100, 101, 102, 103, 104]),
    ('demo1.bbr', 'next_activation_pass', [135, 136, 137]),
    ('demo-goblins1.bbr', 'next_activation_fail', [282, 283, 284]),
    ('demo10.bbr', 'bone_head_snapshot', [232, 233, 234]),
    ('demo4.bbr', 'failed_loner_kept', [414, 415, 416, 417]),
]:
    source = Path('demo-replays') / filename
    root = inventory.parse_xml(inventory.decode_replay(source))
    records = []
    sequence = 0
    for number, outer in enumerate(root.findall('ReplayStep'), 1):
        for child_index, child in enumerate(outer):
            if child.tag == 'EventExecuteSequence':
                sequence += 1
                if number not in selected:
                    continue
                rows = []
                for step_index, result in enumerate(child.iter('StepResult')):
                    step = inventory.decode_message(result.findtext('./Step/MessageData'))
                    messages = [inventory.decode_message(x.findtext('MessageData')) for x in result.iter('StringMessage')]
                    rows.append({'stepIndex': step_index, 'step': {step.tag: numeric_projection(step)},
                                 'messages': [{x.tag: numeric_projection(x)} for x in messages]})
                records.append({'replayStep': number, 'childIndex': child_index, 'sequence': sequence, 'steps': rows})
            elif number in selected and child.tag == 'BoardState':
                records.append({'replayStep': number, 'childIndex': child_index, 'projection': {child.tag: board_projection(child)}})
    cases.append({'id': identifier, 'sourceFile': filename, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'records': records})

output = {'purpose': 'Numeric source observations only. Source locators retained; fragment locators are renumbered. These selected intervals do not prove a universal duration, omission default, restoration rule, or complete skill policy.',
          'replayVersion': '1-4-0-0', 'cases': cases}
Path('tests/fixtures/evidence/bb3-mental-effect-lifetimes.json').write_text(json.dumps(output, indent=2) + '\n')
print([(case['id'], len(case['records'])) for case in cases])
