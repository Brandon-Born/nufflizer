"""Extract public-source team-rerolled movement transitions and their prior board observations.
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
            if child.tag in {'CharacModifiers', 'AdditionalSkills', 'Modifiers', 'Pushbacks', 'StModifiers', 'Assists', 'BrawlerDiceIndexes', 'ProDiceIndexes', 'StarSpecialRuleDiceIndexes'} and not len(child) and not (child.text or '').strip():
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
            if key not in {'Data', 'GameTurn', 'ListPitchPlayers', 'Side', 'RerollNumber'}:
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
    ('demo2.bbr', 'team_rush_second_move', [90, 91, 92, 93]),
    ('demo2.bbr', 'team_rush_third_move', [136, 137, 138, 139]),
    ('demo7.bbr', 'team_rush_unknown_ball_after_dodge', [598, 599, 600, 601]),
    ('demo7.bbr', 'team_rush_away_move', [99, 100, 101, 102]),
    ('demo9.bbr', 'team_rush_diagonal_move', [116, 117, 118, 119]),
    ('demo2.bbr', 'team_rush_move', [321, 322, 323, 324]),
    ('demo5.bbr', 'team_rush_carrier', [41, 42, 43, 44, 45]),
    ('demo5.bbr', 'team_rush_touchdown', [115, 116, 117, 118, 119]),
    ('demo11.bbr', 'team_rush_carrier_unknown_side', [463, 464, 465, 466]),
    ('demo1.bbr', 'team_dodge_move', [589, 590, 591, 592]),
    ('demo11.bbr', 'team_dodge_missing_period', [192, 193, 194, 195]),
    ('demo3.bbr', 'team_dodge_second_move', [519, 520, 521, 522]),
    ('demo4.bbr', 'team_dodge_diagonal_move', [115, 116, 117, 118]),
    ('demo3.bbr', 'team_dodge_zone_move', [271, 272, 273, 274]),
    ('demo3.bbr', 'team_dodge_zone_pickup', [399, 400, 401, 402]),
    ('demo11.bbr', 'team_dodge_zone_failure', [202, 203, 204, 205]),
    ('demo2.bbr', 'team_dodge_zone_combined_excluded', [95, 96, 97, 98]),
    ('demo1.bbr', 'team_dodge_skill_modifier_excluded', [132, 133, 134, 135]),
    ('demo11.bbr', 'team_dodge_late_move', [448, 449, 450, 451]),
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
Path('tests/fixtures/evidence/bb3-team-reroll-movement.json').write_text(json.dumps(output, indent=2) + '\n')
print([(case['id'], len(case['records'])) for case in cases])
