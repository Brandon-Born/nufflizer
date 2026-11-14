"""Independent numeric casualty fields and existing paired playback witnesses.

No application mappings, admission, normalization or scoring imports. Copied
OriginalRoll outcomes are retained as counterexamples, never new observations.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

def roll_roots(message):
    if message.tag == 'ResultCasualtyRoll':
        yield 'direct', message
    elif message.tag == 'QuestionApothecaryCasualtyUsage':
        r = message.find('RollInfos')
        if r is not None and r.findtext('RollType') == '12':
            yield 'apothecary_original', r
    elif message.tag == 'QuestionApothecaryCasualtyChoice':
        for field, kind in [('NewRoll', 'apothecary_replacement'), ('OriginalRoll', 'copied_original')]:
            r = message.find(field)
            if r is not None and r.findtext('RollType') == '12':
                yield kind, r

rows = []
hashes = {}
initial_rosters = {}
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    assert root.findtext('ReplayVersion') == '1-4-0-0'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    hashes[path.name] = digest
    initial_rosters[path.name] = [dict(rosterIndex=i, explicitTeamId=t.findtext('./Data/TeamId'), playerIds=[int(p.findtext('Id')) for p in t.findall('./ListPitchPlayers/PlayerState')]) for i,t in enumerate(root.findall('./NotificationGameJoined/InitialBoardState/ListTeams/TeamState'))]
    assert len(initial_rosters[path.name]) == 2
    for rn, outer in enumerate(root.findall('ReplayStep'), 1):
        for ci, child in enumerate(outer):
            if child.tag != 'EventExecuteSequence':
                continue
            for si, step in enumerate(child.iter('StepResult')):
                header = inv.decode_message(step.findtext('./Step/MessageData'))
                for mi, item in enumerate(step.iter('StringMessage')):
                    message = inv.decode_message(item.findtext('MessageData'))
                    for kind, roll in roll_roots(message):
                        rows.append(dict(sourceFile=path.name, sha256=digest,
                            locator=dict(replayStep=rn, childIndex=ci, stepIndex=si, messageIndex=mi),
                            tag=message.tag, recordKind=kind, subjectId=int(header.findtext('PlayerId')),
                            header={header.tag: inv.numeric_projection(header)},
                            message={message.tag: inv.numeric_projection(message)},
                            roll=inv.numeric_projection(roll), modifiersPresent=roll.find('Modifiers') is not None,
                            modifiersEmpty=roll.find('Modifiers') is not None and len(roll.find('Modifiers')) == 0))

paired = []
for path in sorted(Path('tests/fixtures/evidence').glob('bb3-ui-*.json')):
    data = json.loads(path.read_text())
    for case in data.get('cases', []):
        observations = [e for e in case.get('ui', {}).get('events', []) if 'casual' in e.get('label', '').lower()]
        if not observations:
            continue
        matches = []
        for obs in observations:
            raw_matches = []
            for ri, raw in enumerate(case['rawRecords']):
                for mi, message in enumerate(raw['messages']):
                    tag = next(iter(message))
                    p = message[tag]
                    roots = [('direct', p)] if tag == 'ResultCasualtyRoll' else [
                        ('apothecary_original', r) for r in p.get('RollInfos', [])
                    ] if tag == 'QuestionApothecaryCasualtyUsage' else [
                        (kind, r) for field, kind in [('NewRoll', 'apothecary_replacement'), ('OriginalRoll', 'copied_original')]
                        for r in p.get(field, [])
                    ] if tag == 'QuestionApothecaryCasualtyChoice' else []
                    for kind, roll in roots:
                        if roll.get('RollType') != ['12']:
                            continue
                        faces = [int(d['Value'][0]) for d in roll['Dice'][0]['Die']]
                        if faces != obs['dice']:
                            continue
                        subject = int(next(iter(raw['step'].values()))['PlayerId'][0])
                        raw_matches.append(dict(recordIndex=ri, messageIndex=mi, tag=tag, recordKind=kind,
                            subjectId=subject, sequence=raw['sequence'], stepIndex=raw['stepIndex'], roll=roll))
            assert raw_matches, (path.name, case['id'], obs)
            matches.append(dict(ui=obs, matches=raw_matches))
        paired.append(dict(sourceFixture=path.name, fixtureSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            sourceSha256=data['source']['sha256'], caseId=case['id'], observations=matches))

enum_path = Path('tests/fixtures/evidence/bb3-installed-enums.json')
enums = json.loads(enum_path.read_text())
expected = dict(NoCasualty=0, BadlyHurt=1, SeriouslyHurt=2, SeriousInjury=3, LastingInjury=4,
    SmashedKnee=5, HeadInjury=6, BrokenArm=7, NeckInjury=8, DislocatedShoulder=9, Dead=10)
for namespace in ['EBB3BoardDataCasualtyOutcome', 'EBB3NetGameplayCasualty']:
    actual = next(e for e in enums['enums'] if e['name'] == namespace)
    assert {e['member']: e['value'] for e in actual['entries']} == expected
output = dict(scope='Raw fields and prior playback labels only. Role-specific recorded outcomes do not certify probability, modifier legality, selected treatment, new dice from copied summaries, final availability or current-match value.',
    replayVersion='1-4-0-0', sourceHashes=hashes, initialRosters=initial_rosters,
    enumSource=dict(file=str(enum_path), sha256=hashlib.sha256(enum_path.read_bytes()).hexdigest(),
        executableSha256=enums['source']['sha256'], members=expected),
    rawEmissions=rows, paired=paired)
# Compact individual witnesses so source data remains reviewable per row.
parts = ['{', '"scope":'+json.dumps(output['scope'])+',', '"replayVersion":"1-4-0-0",',
    '"sourceHashes":'+json.dumps(hashes,sort_keys=True)+',', '"initialRosters":'+json.dumps(initial_rosters,sort_keys=True)+',', '"enumSource":'+json.dumps(output['enumSource'],sort_keys=True)+',']
for key in ['rawEmissions', 'paired']:
    parts.append(json.dumps(key)+':[')
    parts.append(',\n'.join(json.dumps(r,separators=(',',':'),sort_keys=True) for r in output[key]))
    parts.append(']'+(',' if key == 'rawEmissions' else ''))
parts.append('}')
text = '\n'.join(parts)+'\n'
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tests/fixtures/evidence/bb3-casualty-observations.json')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
target = Path(args.output)
if args.check:
    assert target.read_text() == text, 'Casualty source evidence differs; inspect raw inputs and original hashes.'
else:
    target.write_text(text)
print(json.dumps(dict(rawRoots=len(rows), copies=sum(r['recordKind']=='copied_original' for r in rows), pairedCases=len(paired), pairedObservations=sum(len(p['observations']) for p in paired))))
