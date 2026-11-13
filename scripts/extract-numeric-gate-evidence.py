"""Independent numeric-question prefixes through the next base result.

Selection uses the question family and a gate's raw type, never its face,
outcome, scoring admission or subsequent movement/damage/turnover.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("inventory", "scripts/inventory-replay-actions.py")
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

def number(node, key):
    try:
        return int(node.findtext(key))
    except (ValueError, TypeError, AttributeError):
        return None

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
    rows = []
    for rn, outer in enumerate(root.findall("ReplayStep"), 1):
        for ci, child in enumerate(outer):
            if child.tag == "Clock":
                continue
            loc = dict(replayStep=rn, childIndex=ci)
            if child.tag != "EventExecuteSequence":
                # Board payloads contain names; only preserve this boundary.
                rows.append(dict(tag=child.tag, locator=loc))
                continue
            for si, entry in enumerate(child.iter("StepResult")):
                step = inv.decode_message(entry.findtext("./Step/MessageData"))
                sloc = dict(loc, stepIndex=si)
                rows.append(dict(tag=step.tag, locator=sloc, payload=project(step)))
                for mi, message in enumerate(entry.iter("StringMessage")):
                    node = inv.decode_message(message.findtext("MessageData"))
                    rows.append(dict(tag=node.tag, locator=dict(sloc, messageIndex=mi), payload=project(node)))
    cases = []
    for i, row in enumerate(rows):
        if row["tag"] != "QuestionTeamRerollUsage":
            continue
        p = row["payload"]
        roll = p.get("RollInfos", [{}])[0]
        family = roll.get("RollType", [None])[0]
        if family not in ("1", "2", "4", "7"):
            continue
        prefix = [rows[i - 1], row]
        gate_found = False
        for following in rows[i + 1:i + 25]:
            if following["tag"] in ("QuestionTeamRerollUsage", "EventEndTurn", "EventNewGamePhase"):
                break
            prefix.append(following)
            if following["tag"] == "ResultRoll":
                kind = following["payload"].get("RollType", [None])[0]
                if kind in ("15", "71"):
                    gate_found = True
                if kind == family:
                    break
        if gate_found:
            cases.append(dict(questionLocator=row["locator"], prefix=prefix))
    files.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), cases=cases))
result = dict(scope="All public numeric questions with a recorded Loner/Pro gate before the next base-family result; faces/outcomes do not select the prefix. Numeric-only raw fields and exact omitted/empty shape. No application parser or mapping imported.", files=files)
text = json.dumps(result, indent=2, separators=(",", ":")) + "\n"
p = argparse.ArgumentParser()
p.add_argument("--check", action="store_true")
a = p.parse_args()
target = Path("tests/fixtures/evidence/bb3-numeric-gates.json")
if a.check:
    assert target.read_text() == text, "Numeric-gate evidence differs; regenerate and review"
else:
    target.write_text(text)
print(dict(files=len(files), prefixes=sum(len(f["cases"]) for f in files)))
