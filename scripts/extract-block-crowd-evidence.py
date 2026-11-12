"""Independent numeric crowd-push facts and ordered replay fragments.

Stdlib decoder only; no application mappings, scorers or value functions. The
UI-095 labels are a prior separate manual observation, not new annotations.
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

def off_pitch(node):
    x, y = node.findtext('X'), node.findtext('Y')
    return x is not None and y is not None and (int(x) < 0 or int(x) > 25 or int(y) < 0 or int(y) > 14)

candidates = []
for source in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(source))
    rows = root.findall('ReplayStep')
    for row_number, row in enumerate(rows, 1):
        for child_index, seq in enumerate(row):
            if seq.tag != 'EventExecuteSequence':
                continue
            for step_index, result in enumerate(seq.iter('StepResult')):
                for message_index, message in enumerate(result.iter('StringMessage')):
                    node = inv.decode_message(message.findtext('MessageData'))
                    if node.tag == 'ResultPushBack' and node.find('CellTo') is not None and off_pitch(node.find('CellTo')):
                        candidates.append({'sourceFile': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                                           'replayStep': row_number, 'childIndex': child_index, 'stepIndex': step_index,
                                           'messageIndex': message_index, 'push': bounce.projection(node)})

selected = [
    ('demo10.bbr', 'crowd_demo10', [348, 349, 350, 351]),
    ('demo11.bbr', 'crowd_demo11', [436, 437, 438, 439]),
    ('demo5.bbr', 'crowd_demo5', [95, 96, 97, 98]),
    ('demo8.bbr', 'crowd_demo8', [372, 373, 374, 375]),
]
cases = bounce.extract_cases(selected)
evidence = json.loads(Path('tests/fixtures/evidence/bb3-ui-playback-025.json').read_text())
ui = next(c for c in evidence['cases'] if c['id'] == 'UI-095')
records = []
# Existing raw sequences286/287/288 are the corresponding ReplaySteps410/411/412.
# Empty unrecorded direct children remain test Clock scaffolding, never facts.
for sequence in [286, 287, 288]:
    steps = [r for r in ui['rawRecords'] if r['sequence'] == sequence]
    records.append({'replayStep': sequence + 124, 'childIndex': 1, 'sequence': sequence,
                    'steps': [{k: r[k] for k in ['stepIndex', 'step', 'messages']} for r in steps]})
for event in ui['eventRecords']:
    records.append({'replayStep': event['replayStep'], 'childIndex': event['eventIndex'], 'projection': event['projection']})
cases.append({'id': 'crowd_UI095', 'sourceFile': 'saved-source025', 'sha256': evidence['source']['sha256'],
              'annotation': 'UI-095: defender40 crosses sideline, Injury[1,4] Stunned without AV. Two removal stages; final off-pitch cell despite CanAct1/TackleZone1. Bench label/return rules not observed.',
              'records': sorted(records, key=lambda r: (r['replayStep'], r['childIndex']))})
output = {'purpose': 'Independent source facts, not legal push/choice distributions, general removal semantics, injury tables or tactical calibration. All locators/source hashes retained. Fragment tests renumber rows/sequences and use synthetic initial ownership and Clock scaffolds; original full-demo acceptance is separate.',
          'replayVersion': '1-4-0-0', 'rawOffPitchPushes': candidates, 'cases': cases}
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tests/fixtures/evidence/bb3-block-crowd.json')
args = parser.parse_args()
compact = lambda value: json.dumps(value, separators=(',', ':'))
text = '{\n"purpose":' + compact(output['purpose']) + ',\n"replayVersion":"1-4-0-0",\n"rawOffPitchPushes":[\n'
text += ',\n'.join(compact(c) for c in candidates) + '\n],\n"cases":[\n'
text += ',\n'.join(compact(c) for c in cases) + '\n]\n}\n'
Path(args.output).write_text(text)
print({'rawOffPitchPushes': len(candidates), 'fragmentCases': len(cases)})
