"""Independent BB2020 casualty/secondary tables and existing raw source joins.

Only stdlib, frozen numeric receipts and literal primary-rule ranges. No runtime
probability, admission or presentation imports. Counts describe a conditional
draw with the recorded fixed modifiers, not legal eligibility or coach policy.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

source = Path('tests/fixtures/evidence/bb3-casualty-observations.json')
facts = json.loads(source.read_text())
enums = Path('tests/fixtures/evidence/bb3-installed-enums.json')
assert hashlib.sha256(enums.read_bytes()).hexdigest() == facts['enumSource']['sha256']
for file, digest in facts['sourceHashes'].items():
    assert hashlib.sha256(Path('demo-replays', file).read_bytes()).hexdigest() == digest

categories = ['badly_hurt', 'seriously_hurt', 'serious_injury', 'lasting_injury', 'dead']
# BB2020 printed61/PDF62. Lasting-injury D6: Head1–2, Knee3,
# Arm4, Neck5, Shoulder6. Printed84/PDF85 Decay and p61 NI add+1.
ranges = [(1, 6), (7, 9), (10, 12), (13, 14), (15, 100)]
secondary = ['head_injury', 'head_injury', 'smashed_knee', 'broken_arm', 'neck_injury', 'dislocated_shoulder']
tables = []
for shift in range(3):
    faces = [next(categories[i] for i, (lo, hi) in enumerate(ranges) if lo <= d + shift <= hi) for d in range(1, 17)]
    counts = Counter(faces)
    joint = Counter(name if name != 'lasting_injury' else s for name in faces for s in secondary)
    assert sum(joint.values()) == 96
    tables.append(dict(modifierTotal=shift, faces=faces,
        counts=[counts[k] for k in categories], jointCounts=dict(sorted(joint.items()))))
output = dict(rules=dict(edition='bb2020', pdfSha256='8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3', printedPages=[61,62,84]),
    scope='Conditional fixed recorded-modifier casualty draw. No eligibility, selection policy, recovery, final availability or league/current-match value is inferred.',
    sourceReceipt=dict(file=str(source), sha256=hashlib.sha256(source.read_bytes()).hexdigest()),
    categories=categories, secondaryFaces=secondary, tables=tables)
text = json.dumps(output, sort_keys=True, indent=2) + '\n'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
target = Path('tests/fixtures/evidence/bb3-casualty-tables.json')
if args.check:
    assert target.read_text() == text
else:
    target.write_text(text)
print(json.dumps(dict(tables=len(tables), rawRoots=len(facts['rawEmissions']), sourceHashes=len(facts['sourceHashes']))))
