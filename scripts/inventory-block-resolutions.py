"""Independent public BB3 block-resolution inventory; stdlib, no app mappings.

Retains numeric source records for explicit Skill57 block uses, with original
locators and file hashes. These are raw observations, not new UI annotations.
Run from the repository root; output is deterministic.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
cases = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inventory.parse_xml(inventory.decode_replay(path))
    sequence = 0
    chain = []
    participants = None
    for replay_step, outer in enumerate(root.findall('ReplayStep'), 1):
        for child_index, child in enumerate(outer):
            if child.tag != 'EventExecuteSequence':
                continue
            sequence += 1
            for step_index, result in enumerate(child.iter('StepResult')):
                step = inventory.decode_message(result.findtext('./Step/MessageData'))
                messages = [inventory.decode_message(x.findtext('MessageData')) for x in result.iter('StringMessage')]
                record = {'replayStep': replay_step, 'childIndex': child_index,
                          'sequence': sequence, 'stepIndex': step_index,
                          'step': {step.tag: inventory.numeric_projection(step)},
                          'messages': [{x.tag: inventory.numeric_projection(x)} for x in messages]}
                pair = (step.findtext('PlayerId'), step.findtext('TargetId'))
                if step.tag == 'PlayerStep' and step.findtext('StepType') == '6':
                    if any(x.tag == 'QuestionBlockDice' for x in messages) and pair != participants:
                        chain = []
                        participants = pair
                    if pair == participants:
                        chain.append(record)
                    if any(x.tag == 'ResultBlockOutcome' for x in messages):
                        skills = [m for r in chain for m in r['messages'] if 'ResultSkillUsage' in m]
                        if any(m['ResultSkillUsage'].get('Skill') == ['57'] and m['ResultSkillUsage'].get('Used') == ['1'] for m in skills):
                            cases.append({'sourceFile': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                          'attackerId': pair[0], 'defenderId': pair[1], 'records': chain})
                        chain = []
                        participants = None
                elif step.tag != 'DamageStep':
                    chain = []
                    participants = None
output = {'purpose': 'Explicit Skill57 block uses, original numeric source projections only. Raw inventory does not assert complete eligibility, probability or tactical value.',
          'replayVersion': '1-4-0-0', 'cases': cases}
Path('tests/fixtures/evidence/bb3-block-resolutions.json').write_text(json.dumps(output, indent=2) + '\n')
print([(case['sourceFile'], case['attackerId'], case['defenderId'], case['records'][-1]['sequence']) for case in cases])
