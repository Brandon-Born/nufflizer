"""All public team-reroll choices, independently of app admission or dice.

Only numeric/empty fields are retained. A nearest preceding raw question is
an inventory locator, not by itself a proven action or resource link.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("inventory", "scripts/inventory-replay-actions.py")
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)


def project(node):
    if not len(node):
        value = inv.numeric_projection(node)
        return value if value is not None else ""
    result = {}
    for child in node:
        if len(child) or not (child.text or "").strip() or inv.numeric_projection(child) is not None:
            result.setdefault(child.tag, []).append(project(child))
    return result


files = []
for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inv.parse_xml(inv.decode_replay(path))
    pending = None
    intervening = []
    controls = []
    decisions = []
    for rn, outer in enumerate(root.findall("ReplayStep"), 1):
        for ci, child in enumerate(outer):
            if child.tag != "EventExecuteSequence":
                if pending is not None:
                    intervening.append(child.tag)
                    if child.tag not in ("BoardState", "Clock"):
                        controls.append(dict(replayStep=rn, childIndex=ci,
                                             projection={child.tag: project(child)}))
                continue
            for si, entry in enumerate(child.iter("StepResult")):
                step = inv.decode_message(entry.findtext("./Step/MessageData"))
                if pending is not None:
                    intervening.append(step.tag)
                for mi, message in enumerate(entry.iter("StringMessage")):
                    node = inv.decode_message(message.findtext("MessageData"))
                    row = dict(locator=dict(replayStep=rn, childIndex=ci, stepIndex=si, messageIndex=mi),
                               step={step.tag: project(step)}, payload={node.tag: project(node)})
                    if node.tag in ("QuestionTeamRerollUsage", "QuestionBlockDice"):
                        pending = row
                        intervening = []
                        controls = []
                    elif node.tag == "ResultTeamRerollUsage":
                        decisions.append(dict(choice=row, precedingQuestion=pending, interveningTags=intervening,
                                              interveningControls=controls))
                        pending = None
                        intervening = []
                        controls = []
                    elif pending is not None:
                        intervening.append(node.tag)
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), decisions=decisions))
result = dict(scope="Every raw ResultTeamRerollUsage in twelve public sources. Choices are not selected by Used, family, probability, later results, counters or app support. Preceding questions are raw inventory locators, not independent proof of a legal policy. Numeric/empty source shape is preserved.", files=files)
value = json.dumps(result, indent=2, separators=(",", ":")) + "\n"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
target = Path("tests/fixtures/evidence/bb3-reroll-resources.json")
if args.check:
    assert target.read_text() == value, "Raw reroll resource evidence differs; regenerate and review"
else:
    target.write_text(value)
print(dict(files=len(files), decisions=sum(len(f["decisions"]) for f in files)))
