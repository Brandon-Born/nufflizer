"""Independent census of both outer and encoded mental-effect notifications.

Select all four tag forms before any effect/provider/admission filtering. Only
numeric and empty fields are retained; no application modules are imported.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
tags = {'EventAddPlayerEffect', 'EventEndPlayerEffect', 'ResultAddPlayerEffect', 'ResultEndPlayerEffect'}


def raw(node):
    if node is None:
        return None
    if not len(node):
        value = (node.text or '').strip()
        if not value:
            return ''
        if value.lstrip('-').isdigit():
            return int(value)
        if re.fullmatch(r'-?\d+\.\d+', value):
            number = float(value)
            return number if math.isfinite(number) else None
        return None
    result = {}
    for child in node:
        value = raw(child)
        if child.tag in result:
            old = result[child.tag]
            result[child.tag] = old + [value] if isinstance(old, list) else [old, value]
        else:
            result[child.tag] = value
    return result


files = []
counts = collections.Counter()
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    rows = []
    for rn, frame in enumerate(root.findall('ReplayStep'), 1):
        for ci, child in enumerate(frame):
            if child.tag == 'EventExecuteSequence':
                records = [(inv.decode_message(m.findtext('MessageData')), si, mi,
                            inv.decode_message(step.findtext('./Step/MessageData')))
                           for si, step in enumerate(child.iter('StepResult'))
                           for mi, m in enumerate(step.iter('StringMessage'))]
            else:
                records = [(child, None, None, None)]
            for message, si, mi, header in records:
                if message.tag not in tags:
                    continue
                counts[message.tag] += 1
                rows.append(dict(tag=message.tag,
                                 locator=dict(replayStep=rn, childIndex=ci, stepIndex=si, messageIndex=mi),
                                 headerTag=None if header is None else header.tag,
                                 header=raw(header), payload=raw(message)))
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), notifications=rows))

paired = Path('tests/fixtures/evidence/bb3-ui-playback-001.json')
case = next(c for c in json.loads(paired.read_text())['cases'] if c['id'] == 'UI-007')
witness = dict(fixture=paired.name, sha256=hashlib.sha256(paired.read_bytes()).hexdigest(),
               caseId=case['id'], observationMethod=case['observationMethod'], ui=case['ui'],
               records=[r for r in case['rawRecords'] if any(any(t in m for t in tags) for m in r['messages'])])
result = dict(scope='All four notification tags, selected independently of effect identity, provider, shape, holder, later dice or application admission. Header and payload namespaces are separate. No effective-skill, physical-state, legal-activation or scoring claim.',
              files=files, counts=dict(sorted(counts.items())), pairedWitness=witness)
target = Path('tests/fixtures/evidence/bb3-mental-notifications.json')
rendered = json.dumps(result, separators=(',', ':')) + '\n'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if args.check:
    assert target.read_text() == rendered, 'Mental notification evidence differs; inspect raw sources and shapes.'
else:
    target.write_text(rendered)
print(json.dumps(dict(files=len(files), counts=result['counts'], notifications=sum(counts.values()), witnesses=1)))
