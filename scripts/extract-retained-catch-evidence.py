"""Project the original retained Catch chain independently of application scoring.

Reuses the numeric-only stdlib extractor. Names/account metadata are omitted;
known empty fields and missing phase/controller/holder observations are retained.
"""
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('bounce', 'scripts/extract-bounce-catch-evidence.py')
bounce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounce)
cases = bounce.extract_cases([('demo1.bbr', 'kept_catch_first_bounce', [82, 83, 84, 85])])
output = {
    'purpose': 'Independent numeric source projection, not a new playback annotation or full policy proof. Test rows/sequences are renumbered; original locators and source SHA retained. Synthetic initial roster scaffold in fragment tests is not original membership evidence.',
    'replayVersion': '1-4-0-0',
    'expectation': {
        'pickup': {'replayStep': 84, 'childIndex': 1, 'stepIndex': 0, 'messageIndex': 1, 'rollType': 4, 'newRoll': 0, 'die': 3, 'difficulty': 4, 'outcome': 0},
        'firstBounce': {'replayStep': 84, 'stepIndex': 1, 'dieType': 1, 'die': 2, 'from': [4, 4], 'to': [4, 5]},
        'catchQuestion': {'replayStep': 84, 'stepIndex': 2, 'playerId': 1, 'newRoll': 1, 'requirement': 3, 'difficulty': 5, 'die': 3, 'outcome': 0, 'modifiers': [-1, -1]},
        'decline': {'replayStep': 85, 'stepIndex': 0, 'gamerId': 0, 'used': 0},
        'keptCatch': {'replayStep': 85, 'stepIndex': 0, 'messageIndex': 1, 'rollType': 7, 'newRoll': 0, 'die': 3, 'difficulty': 5, 'outcome': 0},
        'nextBounce': {'replayStep': 85, 'stepIndex': 1, 'dieType': 1, 'die': 4, 'from': [4, 5], 'to': [3, 5]},
        'fixedPolicy': 'Decline on failure; before original die. Success own-possession value 2, unknown failure continuation anywhere in [0,2]. No resource/choice price or new summary die.',
        'sixFaces': {'successes': [5, 6], 'failures': [1, 2, 3, 4], 'failedContribution': [-2/3, 0]}
    },
    'cases': cases
}
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tests/fixtures/evidence/bb3-retained-catch-reaction.json')
args = parser.parse_args()
Path(args.output).write_text(json.dumps(output, indent=2) + '\n')
print([(c['id'], len(c['records'])) for c in cases])
