#!/usr/bin/env python3
"""Independent arithmetic oracle over the already published partial components.

These literals specify existing model inputs, NOT new BB3 rule/value calibration.
Fraction addition imports no parser, scorer or runtime aggregation code. Source
hashes bind regression membership to the public files; earlier source-specific
fixtures remain responsible for each component's causal admission.
"""
import argparse
import hashlib
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'tests/fixtures/evidence/context-component-arithmetic.json'
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
 ('demo6.bbr','0','ball_handling','19-98',2151,'230-1','-4/3','0'),
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
]

def bucket(rows):
    return dict(componentCount=len(rows), pointCount=0, boundedCount=len(rows),
                bounds=dict(lower=str(sum((Fraction(r['lower']) for r in rows), Fraction())),
                            upper=str(sum((Fraction(r['upper']) for r in rows), Fraction()))) if rows else None)

def build():
    cases = []
    for file, team, category, event, source, action, lower, upper in INPUTS:
        seq, step = action.split('-')
        cases.append(dict(file=file, teamId=team, type=category,
                          eventId=event+'-ResultRoll', sourceId=f'source-{source}',
                          actionId=f'sequence-{seq}-step-{step}', lower=lower, upper=upper))
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
        print('23 component inputs / 12 source hashes / 24 team subtotals match exact rational arithmetic.')
    else:
        OUTPUT.write_text(rendered)
        print(OUTPUT.relative_to(ROOT))
