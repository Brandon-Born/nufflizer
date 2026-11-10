"""Verify annotated numeric extracts against a local replay, without application maps.

Usage: python scripts/verify-replay-evidence.py replays tests/fixtures/evidence/bb3-ui-playback-001.json
This verifies source identity and extraction, not the manually observed game labels.
"""

import argparse
import hashlib
import json
from pathlib import Path
import runpy


def verify(directory, evidence_path, max_decoded_mib=15):
    # Research-only override for the separately inventoried oversized source.
    # Keep the ordinary 15 MiB cap and never accept an unbounded override.
    if type(max_decoded_mib) is not int or not 15 <= max_decoded_mib <= 32:
        raise ValueError("offline decoded cap must be an integer from 15 to 32 MiB")
    raw = runpy.run_path(str(Path(__file__).with_name("inventory-replay-actions.py")))
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    digest = evidence["source"]["sha256"]
    candidates = []
    for path in directory.rglob("*"):
        if path.is_file() and path.suffix.lower() in (".bbr", ".xml"):
            if path.stat().st_size <= raw["MAX_INPUT"]:
                if hashlib.sha256(path.read_bytes()).hexdigest() == digest:
                    candidates.append(path)
    if not candidates:
        raise ValueError("source SHA-256 not found in local corpus")
    root = raw["parse_xml"](raw["decode_replay"](candidates[0], max_decoded_mib * 1024 * 1024))
    if root.findtext("ReplayVersion") != evidence["source"]["replayVersion"]:
        raise ValueError("replay version mismatch")
    wanted = {}
    wanted_events = {}
    seen_ids = set()
    for case in evidence["cases"]:
        if case["id"] in seen_ids:
            raise ValueError("duplicate observation ID")
        seen_ids.add(case["id"])
        for record in case["rawRecords"]:
            key = (record["sequence"], record["stepIndex"])
            if key[0] < 1 or key[1] < 0:
                raise ValueError("invalid source locator")
            if key in wanted and wanted[key] != record:
                raise ValueError("conflicting extracts at one locator")
            wanted[key] = record
        for record in case.get("eventRecords", []):
            key = (record["replayStep"], record["eventIndex"])
            if key[0] < 1 or key[1] < 0:
                raise ValueError("invalid top-level event locator")
            if key in wanted_events and wanted_events[key] != record:
                raise ValueError("conflicting top-level event extracts")
            wanted_events[key] = record
    found = set()
    for sequence, event in enumerate(root.iter("EventExecuteSequence"), 1):
        for step_index, result in enumerate(event.iter("StepResult")):
            key = (sequence, step_index)
            if key not in wanted:
                continue
            encoded = result.findtext("./Step/MessageData")
            step = raw["decode_message"](encoded)
            messages = [raw["decode_message"](x.findtext("MessageData"))
                        for x in result.iter("StringMessage")]
            actual = {
                "sequence": sequence,
                "stepIndex": step_index,
                "step": {step.tag: raw["numeric_projection"](step)},
                "messages": [{m.tag: raw["numeric_projection"](m)} for m in messages],
            }
            if actual != wanted[key]:
                raise ValueError(f"numeric extract mismatch at {sequence}/{step_index}")
            found.add(key)
    if found != set(wanted):
        raise ValueError("one or more source locators were not found")
    found_events = set()
    for replay_step, outer in enumerate(root.findall("ReplayStep"), 1):
        for event_index, event in enumerate(outer):
            key = (replay_step, event_index)
            if key not in wanted_events:
                continue
            actual = {"replayStep": replay_step, "eventIndex": event_index,
                      "projection": {event.tag: raw["numeric_projection"](event)}}
            if actual != wanted_events[key]:
                raise ValueError(f"top-level numeric extract mismatch at {replay_step}/{event_index}")
            found_events.add(key)
    if found_events != set(wanted_events):
        raise ValueError("one or more top-level event locators were not found")
    return {"sourceSha256": digest, "observations": len(seen_ids),
            "verifiedRawRecords": len(found),
            "verifiedEventRecords": len(found_events),
            "scope": "Source identity/extraction only; GUI labels remain manual evidence."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--max-decoded-mib", type=int, choices=range(15, 33), default=15,
                        help="Bounded offline research cap; does not change application limits")
    args = parser.parse_args()
    print(json.dumps(verify(args.directory, args.evidence, args.max_decoded_mib)))
