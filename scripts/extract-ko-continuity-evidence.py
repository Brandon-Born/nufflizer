"""All direct EventRoll sources before any recovery/trait admission filtering."""
import argparse
import collections
import hashlib
import importlib.util
import json
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)


def raw(node):
    if not len(node):
        value = (node.text or '').strip()
        return value if not value or re.fullmatch(r'-?\d+(\.\d+)?', value) else None
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
types = collections.Counter()
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    rows = []
    for rn, frame in enumerate(root.findall('ReplayStep'), 1):
        for ci, event in enumerate(frame):
            if event.tag != 'EventRoll':
                continue
            types[event.findtext('RollType')] += 1
            rows.append(dict(locator=dict(replayStep=rn, childIndex=ci), payload=raw(event)))
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), records=rows))
paired = Path('tests/fixtures/evidence/bb3-ui-playback-007.json')
case = next(c for c in json.loads(paired.read_text())['cases'] if c['id'] == 'UI-040')
witness = dict(fixture=paired.name, sha256=hashlib.sha256(paired.read_bytes()).hexdigest(), case=case)
result = dict(scope='Every direct ReplayStep/EventRoll, independent of roll type, face, outcome, later state, trait knowledge or application admission. Numeric strings and field omissions are literal, not inferred defaults. Existing paired UI-040 independently identifies the recovery shape.',
              files=files, rollTypeCounts=dict(types), witness=witness)
rendered = json.dumps(result, separators=(',', ':'))+'\n'
target = Path('tests/fixtures/evidence/bb3-ko-continuity.json')
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if args.check:
    assert target.read_text() == rendered, 'Direct recovery continuity source evidence differs.'
else:
    target.write_text(rendered)
print(json.dumps(dict(files=len(files), records=sum(types.values()), types=dict(types), witnesses=1)))
