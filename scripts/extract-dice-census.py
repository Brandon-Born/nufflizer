"""Stdlib XML dice-field census, independent of application parser and scorer.

Counts field groups, not individual dice or statistically independent opportunities.
The digest covers every locator/path/type/face; illustrative nested rows are saved.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('raw', 'scripts/inventory-replay-actions.py')
raw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(raw)
compact = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)

def number(text):
    return int(text) if text is not None and text.strip().lstrip('-').isdigit() else None

def fields(node, path=(), roll_type=None):
    own = number(node.findtext('RollType'))
    roll_type = own if own is not None else roll_type
    counts = Counter(c.tag for c in node)
    offsets = Counter()
    for child in node:
        here = path + (child.tag,) + ((offsets[child.tag],) if counts[child.tag] > 1 else ())
        offsets[child.tag] += 1
        if child.tag in {'Dice', 'Die'}:
            dice = list(child.findall('Die')) if child.tag == 'Dice' or child.find('Die') is not None else [child]
            yield list(here), roll_type, [[number(d.findtext('Value')), number(d.findtext('DieType'))] for d in dice]
            # Do not count the individual Die fields again.
            for other in child:
                if other.tag != 'Die' and child.tag == 'Dice':
                    yield from fields(other, here + (other.tag,), roll_type)
        else:
            yield from fields(child, here, roll_type)

files = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = raw.parse_xml(raw.decode_replay(path))
    rows = []
    snapshots = []
    for replay_step, outer in enumerate(root.findall('ReplayStep'), 1):
        for child_index, child in enumerate(outer):
            messages = [(child, None, None)]
            if child.tag == 'EventExecuteSequence':
                messages = []
                for step_index, result in enumerate(child.iter('StepResult')):
                    messages.append((raw.decode_message(result.findtext('./Step/MessageData')), step_index, None))
                    messages.extend((raw.decode_message(item.findtext('MessageData')), step_index, message_index)
                                    for message_index, item in enumerate(result.iter('StringMessage')))
            for message, step_index, message_index in messages:
                for field_path, roll_type, dice in fields(message):
                    row = [replay_step, child_index, step_index, message_index, message.tag, field_path, roll_type, dice]
                    (snapshots if child.tag == "BoardState" else rows).append(row)
    encoded = sorted(compact(row) for row in rows)
    nested = [r for r in rows if r[2] is None and len(r[5]) > 1]
    files.append({'file': path.name, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                  'recordCount': len(rows), 'recordsSha256': hashlib.sha256('\n'.join(encoded).encode()).hexdigest(),
                  'paths': dict(sorted(Counter(compact([r[4], r[5]]) for r in rows).items())), 'nested': nested, 'snapshotFieldCount': len(snapshots), 'snapshotPaths': dict(Counter(compact([r[4], r[5][0]]) for r in snapshots))})
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tests/fixtures/evidence/bb3-dice-census.json')
args = parser.parse_args()
Path(args.output).write_text(json.dumps({'scope': 'Public event-payload Dice/leaf Die census, including copies and placeholders. Repeated BoardState last-roll fields are audited separately and are not new random emissions. No probability, beneficiary or outcome-value claim; this does not claim arbitrary snapshot-field coverage.', 'files': files}, indent=2) + '\n')
print({'files': len(files), 'records': sum(f['recordCount'] for f in files), 'nested': sum(len(f['nested']) for f in files)})
