"""Extract public-source fresh pickup/bounce/catch reactions and their prior board observations.
Run from the repository root. Uses stdlib decoding, never application mappings.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


def projection(node):
    value = inventory.numeric_projection(node)
    if isinstance(value, dict):
        seen = set()
        for child in node:
            if child.tag in seen:
                continue
            seen.add(child.tag)
            if child.tag in {'CharacModifiers', 'AdditionalSkills', 'Modifiers', 'Pushbacks'} and not len(child) and not (child.text or '').strip():
                value[child.tag] = ['']
            elif len(child):
                value[child.tag] = [projection(x) for x in node.findall(child.tag)]
    return value


def board(node):
    result = projection(node)
    result = {k: v for k, v in result.items() if k in {
        'IsStable', 'CurrentPhase', 'ActiveTeam', 'ActivePlayer', 'ActiveGamer', 'Period', 'Ball', 'ListTeams'
    }}
    for team in result.get('ListTeams', [{}])[0].get('TeamState', []):
        for key in list(team):
            if key not in {'Data', 'GameTurn', 'ListPitchPlayers', 'Side'}:
                del team[key]
        if 'Data' in team:
            team['Data'] = [{k: v for k, v in team['Data'][0].items() if k == 'TeamId'}]
        for player in team.get('ListPitchPlayers', [{}])[0].get('PlayerState', []):
            for key in list(player):
                if key not in {'Id', 'CanAct', 'Cell', 'Status', 'Situation', 'MovePoint', 'TackleZone', 'Effects'}:
                    del player[key]
    return result


cases = []
selections = [
    ('demo3.bbr', 'pickup_bounce_catch', [530, 531, 532]),
    ('demo11.bbr', 'standup_pickup_bounce_catch', [244, 245, 246]),
]
for filename, identifier, selected in selections:
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
                    rows.append({'stepIndex': step_index, 'step': {step.tag: projection(step)},
                                 'messages': [{x.tag: projection(x)} for x in messages]})
                records.append({'replayStep': number, 'childIndex': child_index, 'sequence': sequence, 'steps': rows})
            elif number in selected:
                value = board(child) if child.tag == 'BoardState' else projection(child)
                records.append({'replayStep': number, 'childIndex': child_index, 'projection': {child.tag: value if value is not None else {}}})
    cases.append({'id': identifier, 'sourceFile': filename, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'records': records})

output = {'purpose': 'Numeric and known-empty observations only. Original locators retained; test ReplaySteps/sequences are renumbered while direct child order is preserved. Public-source extracts are not new UI annotations or proof of full policies.',
          'replayVersion': '1-4-0-0', 'cases': cases}
Path('tests/fixtures/evidence/bb3-bounce-catch-reactions.json').write_text(json.dumps(output, indent=2) + '\n')
print([(case['id'], len(case['records'])) for case in cases])
