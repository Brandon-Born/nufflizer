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
    groups = {}
    for child in node:
        groups.setdefault(child.tag, []).append(child)
    for tag, children in groups.items():
        # A repeated leaf Die field is one group, just like Dice/Die.
        if tag == 'Die':
            dice = children if all(c.find('Die') is None for c in children) else list(children[0].findall('Die'))
            yield list(path + (tag,)), roll_type, [[number(d.findtext('Value')), number(d.findtext('DieType'))] for d in dice]
            continue
        for index, child in enumerate(children):
            here = path + (tag,) + ((index,) if len(children) > 1 else ())
            if tag == 'Dice':
                yield list(here), roll_type, [[number(d.findtext('Value')), number(d.findtext('DieType'))] for d in child.findall('Die')]
                for other in child:
                    if other.tag != 'Die':
                        yield from fields(other, here + (other.tag,), roll_type)
            else:
                yield from fields(child, here, roll_type)

files = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = raw.parse_xml(raw.decode_replay(path))
    rows = []
    snapshots = []
    snapshot_links = []
    latest = {}
    empty_last_fields = 0
    for replay_step, outer in enumerate(root.findall('ReplayStep'), 1):
        for child_index, child in enumerate(outer):
            messages = [(child, None, None)]
            if child.tag == 'BoardState':
                empty_last_fields += sum(child.find(k) is not None and not list(fields(child.find(k))) for k in ('LastWeatherRoll', 'LastKickOffEventRoll'))
            if child.tag == 'EventExecuteSequence':
                messages = []
                for step_index, result in enumerate(child.iter('StepResult')):
                    messages.append((raw.decode_message(result.findtext('./Step/MessageData')), step_index, None))
                    messages.extend((raw.decode_message(item.findtext('MessageData')), step_index, message_index)
                                    for message_index, item in enumerate(result.iter('StringMessage')))
            for message, step_index, message_index in messages:
                for field_path, roll_type, dice in fields(message):
                    row = [replay_step, child_index, step_index, message_index, message.tag, field_path, roll_type, dice]
                    if child.tag == 'BoardState':
                        snapshots.append(row)
                        target = latest.get(field_path[0]) if len(field_path) == 2 and field_path[1] == 'Die' else None
                        snapshot_links.append([row, target[:6] if target is not None and dice == target[7] else None])
                    else:
                        rows.append(row)
                        if message.tag in ('EventWeatherRoll', 'EventKickOffTable') and field_path == ['Dice']:
                            latest['LastWeatherRoll' if message.tag == 'EventWeatherRoll' else 'LastKickOffEventRoll'] = row
    final_board = root.find('./EndGame/BoardState')
    if final_board is not None:
        for field_path, roll_type, dice in fields(final_board):
            row = [None, None, None, None, 'BoardState', field_path, roll_type, dice]
            snapshots.append(row)
            target = latest.get(field_path[0]) if len(field_path) == 2 and field_path[1] == 'Die' else None
            snapshot_links.append([row, target[:6] if target is not None and dice == target[7] else None])
    cosmetic = root.findall('./NotificationGameJoined/GameInfos/GamersInfos/GamerInfos/Roster/Customization/Dice') + root.findall('./Rosters/TeamRoster/Customization/Dice')
    assert all(not len(node) for node in cosmetic)
    encoded = sorted(compact(row) for row in rows)
    nested = [r for r in rows if r[2] is None and len(r[5]) > 1]
    files.append({'file': path.name, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                  'recordCount': len(rows), 'recordsSha256': hashlib.sha256('\n'.join(encoded).encode()).hexdigest(),
                  'paths': dict(sorted(Counter(compact([r[4], r[5]]) for r in rows).items())), 'nested': nested, 'snapshotFieldCount': len(snapshots), 'snapshotPaths': dict(Counter(compact([r[4], r[5][0]]) for r in snapshots)), 'snapshotRecordsSha256': hashlib.sha256('\n'.join(sorted(compact(r) for r in snapshots)).encode()).hexdigest(), 'snapshotLinksSha256': hashlib.sha256('\n'.join(sorted(compact(r) for r in snapshot_links)).encode()).hexdigest(), 'snapshotMatchedCount': sum(link[1] is not None for link in snapshot_links), 'emptyLastFieldCount': empty_last_fields, 'nonrandomConfigurationCount': len(cosmetic)})
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tests/fixtures/evidence/bb3-dice-census.json')
args = parser.parse_args()
Path(args.output).write_text(json.dumps({'scope': 'Public event-payload Dice/leaf Die census, including copies and placeholders. Repeated BoardState last-roll fields are audited separately and are not new random emissions. No probability, beneficiary or outcome-value claim; snapshot dice are independently hashed and linked to the latest matching named emission, including empty pre-kickoff fields outside the dice count.', 'files': files}, indent=2) + '\n')
print({'files': len(files), 'records': sum(f['recordCount'] for f in files), 'nested': sum(len(f['nested']) for f in files)})
