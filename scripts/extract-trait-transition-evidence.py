"""Independent numeric-only witnesses for scoped intrinsic-trait continuity.

Raw initial lists, current participant observations, and exact transition payloads
are evidence, not an automatic admission/skill/availability policy. No app imports.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)


def raw(node):
    if node is None:
        return None
    if not len(node):
        text = (node.text or '').strip()
        if not text:
            return ''
        return int(text) if text.lstrip('-').isdigit() else None
    result = {}
    for child in node:
        value = raw(child)
        if child.tag in result:
            if not isinstance(result[child.tag], list):
                result[child.tag] = [result[child.tag]]
            result[child.tag].append(value)
        else:
            result[child.tag] = value
    return result


def player(p):
    return {key: raw(p.find(key)) for key in ['Id', 'Data', 'Effects', 'TackleZone', 'Status', 'Cell'] if key != 'Data'} | {
        'Data': None if p.find('Data') is None else {
            key: raw(p.find('Data/' + key)) for key in ['Id', 'TeamId', 'IdPlayerTypes', 'InnateSkills', 'AcquiredSkills']
        }
    }


def participants(board, ids):
    return [dict(rosterIndex=i, teamId=raw(t.find('Data/TeamId')),
                 effects=raw(t.find('Effects')), transformations=raw(t.find('TransformedPlayers')),
                 prayers=raw(t.find('ActivePrayers')), player=player(p))
            for i, t in enumerate(board.findall('./ListTeams/TeamState'))
            for p in t.findall('./ListPitchPlayers/PlayerState') if p.findtext('Id') in ids]


files = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    initial = root.find('./NotificationGameJoined/InitialBoardState')
    ids = [p.findtext('Id') for p in initial.findall('./ListTeams/TeamState/ListPitchPlayers/PlayerState')]
    pools, transitions, refreshes = [], [], []
    current, checkpoint = initial, dict(replayStep=None, childIndex=None)
    for rn, outer in enumerate(root.findall('ReplayStep'), 1):
        for ci, child in enumerate(outer):
            base = dict(replayStep=rn, childIndex=ci)
            if child.tag == 'BoardState':
                current, checkpoint = child, base
                if any(p.find('Data') is not None for p in child.findall('./ListTeams/TeamState/ListPitchPlayers/PlayerState')):
                    refreshes.append(dict(locator=base, players=participants(child, [p.findtext('Id') for p in child.findall('./ListTeams/TeamState/ListPitchPlayers/PlayerState')])))
                continue
            if child.tag == 'EventExecuteSequence':
                records = [(inv.decode_message(m.findtext('MessageData')), si, mi,
                            inv.decode_message(step.findtext('./Step/MessageData')))
                           for si, step in enumerate(child.iter('StepResult'))
                           for mi, m in enumerate(step.iter('StringMessage'))]
            else:
                records = [(child, None, None, None)]
            for message, si, mi, step in records:
                loc = dict(**base, stepIndex=si, messageIndex=mi)
                if message.tag == 'QuestionBlockDice':
                    chosen = [step.findtext('PlayerId'), step.findtext('TargetId')]
                    pools.append(dict(locator=loc, checkpoint=checkpoint, actor=chosen[0], target=chosen[1],
                                      participants=participants(current, chosen)))
                key = message.tag
                if key == 'ResultSkillUsage':
                    if message.findtext('Skill') not in ['10', '31', '35', '36', '51', '56']:
                        continue
                elif key not in ['EventFaceUpStunnedPlayers', 'ResultGainSpp', 'EventAddPlayerEffect', 'EventEndPlayerEffect']:
                    continue
                transitions.append(dict(locator=loc, tag=key, payload=raw(message)))
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                      seeds=participants(initial, ids), refreshes=refreshes, transitions=transitions, pools=pools))

out = dict(scope='Raw numeric/presence facts only; no admission, effective trait restoration, legal activation, dice/context score or whole-match claim.', files=files)
# One numeric witness per line keeps the audit diff reviewable.
compact = lambda value: json.dumps(value, separators=(',', ':'))
lines = ['{', '"scope":' + compact(out['scope']) + ',', '"files":[']
for i, file in enumerate(files):
    lines += ['{', '"file":' + compact(file['file']) + ',', '"sha256":' + compact(file['sha256']) + ',']
    for j, key in enumerate(['seeds', 'refreshes', 'transitions', 'pools']):
        lines.append('"' + key + '":[')
        lines += [compact(value) + (',' if n < len(file[key])-1 else '') for n, value in enumerate(file[key])]
        lines.append(']' + (',' if j < 3 else ''))
    lines.append('}' + (',' if i < len(files)-1 else ''))
rendered = '\n'.join(lines + [']', '}']) + '\n'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
target = Path('tests/fixtures/evidence/bb3-trait-transitions.json')
if args.check:
    assert target.read_text() == rendered, 'Trait source evidence changed; inspect before replacing.'
else:
    target.write_text(rendered)
print([(f['file'], len(f['transitions']), len(f['pools'])) for f in files])
