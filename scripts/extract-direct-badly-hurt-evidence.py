"""Direct injury code3 witnesses; stdlib only, no application mappings.

The frozen executable enum names the value. Independent raw decoding binds
it to ResultInjuryRoll in replay1-4-0-0, with Stunty total9 corroboration.
The existing treatment-question code1/UI label is a namespace counterexample.
This does not certify current traits, a modifier policy or final availability.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
enum_path = Path('tests/fixtures/evidence/bb3-installed-enums.json')
enum_data = json.loads(enum_path.read_text())
namespace = next(e for e in enum_data['enums'] if e['name'] == 'EBB3NetGameplayInjuryOutcome')
assert [(e['member'], e['value']) for e in namespace['entries']] == [
    ('Stunned', 0), ('Reserve', 1), ('Ko', 2), ('BadlyHurt', 3), ('Casualty', 4)]

rows = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    assert root.findtext('ReplayVersion') == '1-4-0-0'
    initial = root.find('./NotificationGameJoined/InitialBoardState')
    if initial is None:
        continue
    seeds = {}
    for team in initial.findall('./ListTeams/TeamState'):
        for player in team.findall('./ListPitchPlayers/PlayerState'):
            data = player.find('Data')
            if data is not None:
                seeds[player.findtext('Id')] = {
                    'innateSkills': None if data.find('InnateSkills') is None else [int(s.text) for s in data.findall('./InnateSkills/InnateSkillsItem')],
                    'acquiredSkills': None if data.find('AcquiredSkills') is None else [int(s.text) for s in data.findall('./AcquiredSkills/AcquiredSkillsItem')]}
    for rn, outer in enumerate(root.findall('ReplayStep'), 1):
        for ci, child in enumerate(outer):
            if child.tag != 'EventExecuteSequence':
                continue
            for si, step in enumerate(child.iter('StepResult')):
                header = inv.decode_message(step.findtext('./Step/MessageData'))
                for mi, raw in enumerate(step.iter('StringMessage')):
                    roll = inv.decode_message(raw.findtext('MessageData'))
                    if roll.tag != 'ResultInjuryRoll' or roll.findtext('Outcome') != '3':
                        continue
                    assert header.tag == 'DamageStep' and roll.findtext('RollType') == '11'
                    subject = header.findtext('PlayerId')
                    seed = seeds[subject]
                    assert seed['innateSkills'] is not None and seed['acquiredSkills'] is not None
                    assert 59 in seed['innateSkills'] + seed['acquiredSkills']
                    faces = [int(d.findtext('Value')) for d in roll.findall('./Dice/Die')]
                    modifiers = roll.find('Modifiers')
                    assert modifiers is not None  # Present-empty differs from missing.
                    values = [int(m.findtext('Value')) for m in modifiers.findall('Modifier')]
                    assert sum(faces) + sum(values) == 9
                    rows.append(dict(sourceFile=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                                     locator=dict(replayStep=rn, childIndex=ci, stepIndex=si, messageIndex=mi),
                                     subjectId=subject, initialSeed=seed, dice=faces,
                                     modifiersPresent=True, modifierValues=values,
                                     header=inv.numeric_projection(header), roll=inv.numeric_projection(roll)))
assert len(rows) == 8
ui_path = Path('tests/fixtures/evidence/bb3-ui-playback-001.json')
ui = json.loads(ui_path.read_text())
counterexample = next(c for c in ui['cases'] if c['id'] == 'UI-009')
assert any(e.get('label') == 'Stunty Injury' and e.get('result') == 'Badly Hurt'
           for e in counterexample['ui']['events'])
question = next(m['QuestionApothecaryCasualtyUsage'] for r in counterexample['rawRecords']
                for m in r['messages'] if 'QuestionApothecaryCasualtyUsage' in m)
assert question['RollInfos'][0]['Outcome'] == ['1']
result = dict(scope='Direct ResultInjuryRoll/11 code3 observation only. Initial Stunty seeds and total9 corroborate the enum; they do not establish current traits, scoring eligibility, treatment or availability.',
              replayVersion='1-4-0-0',
              enumSource=dict(file=str(enum_path), sha256=hashlib.sha256(enum_path.read_bytes()).hexdigest(),
                              executableSha256=enum_data['source']['sha256'], namespace=namespace),
              treatmentCounterexample=dict(file=str(ui_path), sha256=hashlib.sha256(ui_path.read_bytes()).hexdigest(),
                                           case='UI-009', tag='QuestionApothecaryCasualtyUsage', roll=question['RollInfos'][0],
                                           label='Badly Hurt', directMappingAllowed=False),
              rows=rows)
rendered = json.dumps(result, indent=2) + '\n'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
output = Path('tests/fixtures/evidence/bb3-direct-badly-hurt.json')
if args.check:
    assert output.read_text() == rendered, 'Direct injury evidence changed; review original sources.'
else:
    output.write_text(rendered)
print(json.dumps(dict(directRecords=len(rows), modified=sum(bool(r['modifierValues']) for r in rows),
                      treatmentNamespaceCounterexamples=1)))
