"""Independently inventory numeric question/choice/result chains across a carrier
checkpoint. Numeric XML facts only; no application enums, parsers or scoring.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)

cases = []
for source in sorted(Path('demo-replays').glob('*.bbr')):
    root = inventory.parse_xml(inventory.decode_replay(source))
    pending = None
    for number, outer in enumerate(root.findall('ReplayStep'), 1):
        for child_index, child in enumerate(outer):
            locator = {'replayStep': number, 'childIndex': child_index}
            if child.tag == 'BoardState':
                carrier = child.findtext('./Ball/Carrier')
                if pending is not None and carrier is not None:
                    pending['waiting'] = {'locator': locator, 'carrier': int(carrier)}
                continue
            if child.tag != 'EventExecuteSequence':
                # Clock is observation only. All other emissions are barriers.
                if child.tag != 'Clock':
                    pending = None
                continue
            for step_index, result in enumerate(child.iter('StepResult')):
                step = inventory.decode_message(result.findtext('./Step/MessageData'))
                if pending is not None and step.tag != 'PlayerStep':
                    pending = None
                for message_index, encoded in enumerate(result.iter('StringMessage')):
                    message = inventory.decode_message(encoded.findtext('MessageData'))
                    loc = {**locator, 'stepIndex': step_index, 'messageIndex': message_index}
                    if message.tag == 'QuestionTeamRerollUsage':
                        pending = {'questionLocator': loc, 'originalStep': inventory.numeric_projection(step),
                                   'question': inventory.numeric_projection(message)}
                    elif pending is not None and message.tag == 'ResultTeamRerollUsage':
                        pending['choice'] = inventory.numeric_projection(message)
                        pending['choiceLocator'] = loc
                    elif pending is not None and message.tag == 'ResultRoll':
                        if 'waiting' in pending and 'choice' in pending:
                            cases.append({'sourceFile': source.name,
                                          'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                                          **pending, 'terminalStep': inventory.numeric_projection(step),
                                          'resultLocator': loc, 'result': inventory.numeric_projection(message)})
                        pending = None
                    else:
                        pending = None

output = {'purpose': 'Independent raw numeric chains across carrier checkpoints. Candidates are observations, not accepted policies; application tests match only independently admitted direct numeric chains.',
          'cases': cases}
Path('tests/fixtures/evidence/bb3-checkpoint-rerolls.json').write_text(json.dumps(output, indent=2) + '\n')
print(len(cases))
