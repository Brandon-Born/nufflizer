#!/usr/bin/env python3
"""Independent arithmetic oracle over the already published partial components.

These inputs specify existing partial-model components. The rain Pickup input
checks raw XML geometry and its replacement die. Fraction addition imports no
application parser, scorer or runtime aggregation code. Source hashes bind
regression membership to the public files.
"""
import argparse
import hashlib
import importlib.util
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'tests/fixtures/evidence/context-component-arithmetic.json'


def rain_pickup_point():
    """Read the rain replacement and eight landing squares from raw XML."""
    spec = importlib.util.spec_from_file_location('inventory', ROOT / 'scripts/inventory-replay-actions.py')
    inventory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inventory)
    replay = inventory.parse_xml(inventory.decode_replay(ROOT / 'demo-replays/demo5.bbr'))
    frames = replay.findall('ReplayStep')

    def position(node):
        return tuple(int(node.findtext(f'Cell/{axis}')) for axis in ('X', 'Y'))

    def roster(board):
        assert board.tag == 'BoardState' and board.findtext('CurrentPhase') == '5'
        return [{int(p.findtext('Id')): p for p in team.findall('./ListPitchPlayers/PlayerState')}
                for team in board.findall('./ListTeams/TeamState')]

    before, waiting = frames[350][4], frames[351][2]
    first, last = roster(before), roster(waiting)
    origin = position(waiting.find('Ball'))
    assert origin == position(before.find('Ball')) == position(last[1][40]) == (20, 3)
    landings = {(origin[0] + dx, origin[1] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                if (dx, dy) != (0, 0)}
    removed = {2: ('4', '4'), 7: ('4', '4'), 39: ('2', '3'), 42: ('4', '5')}
    for side, (prior, current) in enumerate(zip(first, last, strict=True)):
        assert prior.keys() == current.keys()
        for player_id, player in current.items():
            cell = position(player)
            assert cell not in landings
            if player_id != 40:
                assert cell == position(prior[player_id])
            if player_id in removed:
                assert cell == (-1, -1) and all(
                    (record.findtext('Situation'), record.findtext('Status')) == removed[player_id]
                    and record.findtext('Effects') == '' for record in (prior[player_id], player))
            else:
                assert 0 <= cell[0] <= 25 and 0 <= cell[1] <= 14
                if side == 0:
                    assert all(max(abs(x - cell[0]), abs(y - cell[1])) > 1 for x, y in landings)
    step = next(frames[352][1].iter('StepResult'))
    choice, roll = [inventory.decode_message(m.findtext('MessageData')) for m in step.iter('StringMessage')]
    assert choice.tag == 'ResultTeamRerollUsage' and choice.findtext('Used') == '1'
    assert roll.tag == 'ResultRoll' and roll.findtext('RollType') == '4' and roll.findtext('Outcome') == '0'
    assert [roll.findtext(k) for k in ('Difficulty', 'Dice/Die/Value', 'Modifiers/Modifier/ModifierType')] == ['4', '2', '15']
    chance = Fraction(sum(face >= 4 for face in range(1, 7)), 6)
    return -chance * 2

# file, team, category, event stem, raw source, recorded action, lower, upper
INPUTS = [
 ('demo-goblins1.bbr','1','dodge','7-208',682,'64-1','1/3','10/3'),
 ('demo-goblins1.bbr','1','dodge','43-18',4369,'410-2','1/3','2/3'),
 ('demo-goblins1.bbr','1','dodge','43-70',4421,'415-2','0','1'),
 ('demo1.bbr','0','ball_handling','5-259',548,'62-0','-2/3','0'),
 ('demo1.bbr','1','dodge','33-72',4721,'475-0','0','4/3'),
 ('demo11.bbr','1','dodge','12-17',1429,'137-2','0','2'),
 ('demo11.bbr','1','dodge','12-25',1437,'138-0','0','2'),
 ('demo11.bbr','0','ball_handling','15-113',1930,'186-4','0','1'),
 ('demo11.bbr','1','dodge','16-28',1960,'189-0','-2','0'),
 ('demo11.bbr','1','dodge','35-75',3659,'326-0','-8/3','0'),
 ('demo3.bbr','1','ball_handling','42-51',4557,'415-3','0','5/3'),
 ('demo4.bbr','1','dodge','8-114',824,'91-1','-16/3','-2/3'),
 ('demo6.bbr','0','ball_handling','6-140',620,'63-2','0','7/8'),
 ('demo6.bbr','1','dodge','30-126',3069,'318-1','-16/3','0'),
 ('demo7.bbr','1','dodge','23-42',2237,'188-1','1/6','4/3'),
 ('demo7.bbr','1','dodge','32-65',3098,'256-2','0','1/2'),
 ('demo7.bbr','1','dodge','38-38',3967,'321-1','1/6','5/6'),
 ('demo7.bbr','1','dodge','45-66',4765,'385-1','1/6','5/6'),
 # Rush inputs are separately qualified by extract-terminal-rush-evidence.py.
 ('demo2.bbr','1','movement_risk','8-84',702,'62-0','0','5/6'),
 ('demo2.bbr','1','movement_risk','10-119',1091,'105-0','0','1'),
 ('demo7.bbr','1','movement_risk','6-186',677,'65-0','0','3/2'),
 ('demo9.bbr','1','movement_risk','9-102',858,'91-0','0','4/3'),
 # Retained original fixed-decline policy, independently source-qualified.
 ('demo2.bbr','1','movement_risk','27-181',2704,'257-0','-15/2','0'),
 # Original Dodge failures under the recorded fixed decline policy.
 ('demo2.bbr','1','dodge','35-74',3775,'337-0','-16/3','0'),
 ('demo3.bbr','1','dodge','16-117',1742,'166-0','-4/3','0'),
 ('demo8.bbr','1','dodge','15-68',1243,'123-0','-20/3','0'),
 # 3+ kept Pickups: one occupied of eight, then two occupied plus one marked.
 ('demo2.bbr','0','ball_handling','5-157',255,'25-0','-17/12','0'),
 ('demo11.bbr','1','ball_handling','31-43',3198,'276-0','-19/12','0'),
 # Committed 3+ team Pickup replacements. All eight squares are empty and unmarked.
 ('demo4.bbr','1','ball_handling','38-89',4192,'430-0','-4/3','0'),
 # Successful first-roll final-turn touchdowns. The missed-die continuation is unknown.
 # Demo1 takes the lead with one regulation turn left for the opponent. Demo5 still trails.
 ('demo1.bbr','0','movement_risk','38-62',5271,'523-7','0',str(Fraction(1, 6) * (4 + Fraction(8, 2)))),
 ('demo5.bbr','1','movement_risk','43-59',3997,'436-8','0',str(Fraction(1, 6) * 4)),
]

# The committed 2+ Rush would tie 0–1. Turns 12 and 11 leave 4 + 5 turns.
POINTS = [
    # Last first-half attempt to take the lead. The 8–8 clock leaves 8 + 8 turns.
    ('demo1.bbr','0','movement_risk','19-194',2901,'311-0',
     Fraction(-5, 6) * (4 + Fraction(8, 1 + 8 + 8))),
    ('demo2.bbr','1','movement_risk','33-112',3528,'315-0',
     Fraction(-5, 6) * (4 + Fraction(8, 1 + 4 + 5))),
    # Early 2+ replacement takes the lead. Turns 3 and 2 leave 13 + 14.
    ('demo5.bbr','0','movement_risk','8-41',799,'86-0',
     Fraction(1, 6) * (4 + Fraction(8, 1 + 13 + 14))),
    # Failed 4+ rain replacement, eight empty and unmarked first landings.
    ('demo5.bbr','1','ball_handling','29-31',2409,'272-0', rain_pickup_point()),
    # Demo6 step 306/1/1: two failed 3+ dice with Sure Hands and eight unmarked landings.
    ('demo6.bbr','0','ball_handling','19-98',2151,'230-1', -Fraction(2, 3) * 2),
    # Successful 3+ replacement, eight empty and unmarked first landings.
    ('demo8.bbr','0','ball_handling','4-127',217,'24-0', Fraction(1, 3) * 2),
]

def bucket(rows):
    points = sum(row.get('point', False) for row in rows)
    return dict(componentCount=len(rows), pointCount=points, boundedCount=len(rows) - points,
                bounds=dict(lower=str(sum((Fraction(r['lower']) for r in rows), Fraction())),
                            upper=str(sum((Fraction(r['upper']) for r in rows), Fraction()))) if rows else None)

def build():
    cases = []
    for file, team, category, event, source, action, lower, upper in INPUTS:
        seq, step = action.split('-')
        cases.append(dict(file=file, teamId=team, type=category,
                          eventId=event+'-ResultRoll', sourceId=f'source-{source}',
                          actionId=f'sequence-{seq}-step-{step}', lower=lower, upper=upper))
    for file, team, category, event, source, action, value in POINTS:
        seq, step = action.split('-')
        cases.append(dict(file=file, teamId=team, type=category,
                          eventId=event+'-ResultRoll', sourceId=f'source-{source}',
                          actionId=f'sequence-{seq}-step-{step}', lower=str(value), upper=str(value), point=True))
    cases.sort(key=lambda row: (row['file'], int(row['sourceId'].split('-')[1])))
    files = []
    for path in sorted((ROOT/'demo-replays').glob('*.bbr')):
        rows = [r for r in cases if r['file'] == path.name]
        teams = []
        for team in ['0', '1']:
            owned = [r for r in rows if r['teamId'] == team]
            teams.append(dict(teamId=team, **bucket(owned),
                              byCategory=[dict(type=category, **bucket([r for r in owned if r['type'] == category]),
                                               eventIds=[r['eventId'] for r in owned if r['type'] == category])
                                          for category in sorted(set(r['type'] for r in owned))],
                              byAction=[dict(actionId=r['actionId'], **bucket([r]), eventIds=[r['eventId']]) for r in owned]))
        files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), teams=teams))
    return dict(scope='Exact arithmetic over existing partial model inputs; not new game semantics, full-match bounds or calibration.',
                arithmetic='Python stdlib fractions.Fraction; no runtime scorer imports.', cases=cases, files=files)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rendered = json.dumps(build(), indent=2)+'\n'
    if args.check:
        if OUTPUT.read_text() != rendered:
            raise SystemExit('Arithmetic fixture or source hashes differ; review before updating.')
        print(f'{len(INPUTS) + len(POINTS)} component inputs / 12 source hashes / 24 team subtotals match exact rational arithmetic.')
    else:
        OUTPUT.write_text(rendered)
        print(OUTPUT.relative_to(ROOT))
