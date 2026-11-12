"""Independent injury emissions and pre-existing paired UI observations.
Stdlib only; no application mappings, scoring or runtime eligibility functions.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('bounce', 'scripts/extract-bounce-catch-evidence.py')
bounce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounce)
inv = bounce.inventory

def injury(message):
    if message.tag == 'ResultInjuryRoll':
        return message
    if message.tag in {'QuestionKORecovery', 'QuestionApothecaryCasualtyUsage'}:
        roll = message.find('RollInfos')
        if roll is not None and roll.findtext('RollType') == '11':
            return roll

rows = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    for number, outer in enumerate(root.findall('ReplayStep'), 1):
        for child_index, child in enumerate(outer):
            if child.tag != 'EventExecuteSequence':
                continue
            for step_index, result in enumerate(child.iter('StepResult')):
                step = inv.decode_message(result.findtext('./Step/MessageData'))
                for message_index, item in enumerate(result.iter('StringMessage')):
                    message = inv.decode_message(item.findtext('MessageData'))
                    roll = injury(message)
                    if roll is not None:
                        rows.append({'sourceFile': path.name, 'sha256': digest, 'replayStep': number, 'childIndex': child_index,
                                     'stepIndex': step_index, 'messageIndex': message_index, 'tag': message.tag,
                                     'step': {step.tag: bounce.projection(step)}, 'roll': bounce.projection(roll)})

selected = [('001', 'UI-015'), ('004', 'UI-035'), ('013', 'UI-044'), ('018', 'UI-089'),
            ('demo-009', 'UI-086'), ('025', 'UI-095'), ('002', 'UI-025'), ('001', 'UI-009')]
cases = []
for source, identifier in selected:
    name = f'bb3-ui-{source}.json' if source.startswith('demo') else f'bb3-ui-playback-{source}.json'
    data = json.loads((Path('tests/fixtures/evidence') / name).read_text())
    case = next(c for c in data['cases'] if c['id'] == identifier)
    observations = [e for e in case['ui']['events'] if e['label'] in {'Injury', 'Stunty Injury'}]
    for raw in case['rawRecords']:
        step = next(iter(raw['step'].values()))
        for index, message in enumerate(raw['messages']):
            tag = next(iter(message))
            if tag not in {'ResultInjuryRoll', 'QuestionKORecovery', 'QuestionApothecaryCasualtyUsage'}:
                continue
            roll = message[tag] if tag == 'ResultInjuryRoll' else message[tag].get('RollInfos', [None])[0]
            if not roll or roll.get('RollType') != ['11']:
                continue
            faces = [int(d['Value'][0]) for d in roll['Dice'][0]['Die']]
            subject = int(step['PlayerId'][0])
            paired = [e for e in observations if e.get('dice') == faces and
                      e.get('playerId', e.get('subjectPlayerId', subject)) == subject]
            assert len(paired) == 1, (identifier, raw['sequence'], raw['stepIndex'], index)
            cases.append({'id': f"{identifier}-{raw['sequence']}-{raw['stepIndex']}-{index}", 'sourceFixture': name,
                          'sourceSha256': data['source']['sha256'], 'uiCase': identifier, 'sequence': raw['sequence'],
                          'stepIndex': raw['stepIndex'], 'messageIndex': index, 'subjectId': subject,
                          'recordedName': paired[0]['result'], 'acceptedScope': tag == 'ResultInjuryRoll' or tag == 'QuestionKORecovery',
                          'row': raw})
output = {'purpose': 'Independent raw emissions and prior UI labels. No new annotation or probability table. Fragment tests use an explicitly synthetic owner roster; original full-source acceptance is separate. Pending Apothecary Outcome1/Badly Hurt is a namespace counterexample, not an accepted direct mapping.',
          'replayVersion': '1-4-0-0', 'rawEmissions': rows, 'cases': cases}
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tests/fixtures/evidence/bb3-injury-observations.json')
args = parser.parse_args()
compact = lambda x: json.dumps(x, separators=(',', ':'))
text = '{\n"purpose":' + compact(output['purpose']) + ',\n"replayVersion":"1-4-0-0",\n"rawEmissions":[\n'
text += ',\n'.join(compact(r) for r in rows) + '\n],\n"cases":[\n'
text += ',\n'.join(compact(c) for c in cases) + '\n]\n}\n'
Path(args.output).write_text(text)
print({'rawEmissions': len(rows), 'pairedCases': len(cases)})
