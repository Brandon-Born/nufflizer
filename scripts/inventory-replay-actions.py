"""Inventory raw replay facts without importing the application's disputed maps.

Usage: python scripts/inventory-replay-actions.py replays --output replays/.analysis/inventory.json
Output uses content hashes and numeric projections, never filenames or coach/player names.
Counts describe source emissions, not deduplicated rolls or verified game semantics.
"""

import argparse
import base64
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zlib


MAX_INPUT = 4_000_000
MAX_XML = 15 * 1024 * 1024
MAX_MESSAGE = 512 * 1024


def parse_xml(data):
    if re.search(rb"<!\s*(DOCTYPE|ENTITY)", data, re.I):
        raise ValueError("DTD/entity declarations are unsupported")
    return ET.fromstring(data)


def decode_replay(path, max_xml=MAX_XML):
    if path.stat().st_size > MAX_INPUT:
        raise ValueError("input exceeds inventory limit")
    data = path.read_bytes()
    if data.lstrip().startswith(b"<"):
        return data
    packed = base64.b64decode(re.sub(rb"\s", b"", data), validate=True)
    for mode in (zlib.MAX_WBITS, -zlib.MAX_WBITS, zlib.MAX_WBITS | 16):
        try:
            decoder = zlib.decompressobj(mode)
            xml = decoder.decompress(packed, max_xml + 1)
        except zlib.error:
            continue
        if len(xml) > max_xml or decoder.unconsumed_tail:
            raise ValueError("decoded XML exceeds inventory limit")
        if decoder.eof and xml.lstrip().startswith(b"<"):
            return xml
    raise ValueError("unsupported replay encoding")


def decode_message(text):
    data = re.sub(rb"\s", b"", (text or "").encode())
    for _ in range(2):
        if len(data) > MAX_MESSAGE * 2:
            raise ValueError("embedded message exceeds inventory limit")
        data = base64.b64decode(data, validate=True)
    if len(data) > MAX_MESSAGE:
        raise ValueError("decoded message exceeds inventory limit")
    return parse_xml(data)


def numeric_projection(node):
    """Retain numeric facts/structure while omitting arbitrary text and attributes."""
    if not len(node):
        value = (node.text or "").strip()
        return value if re.fullmatch(r"-?\d+(?:\.\d+)?", value) else None
    out = {}
    for child in node:
        value = numeric_projection(child)
        if value is not None:
            out.setdefault(child.tag, []).append(value)
    return out


def inventory(directories, max_xml=MAX_XML):
    counters = defaultdict(Counter)
    examples = defaultdict(list)
    files = []
    seen = set()
    for directory in directories:
        for path in sorted(Path(directory).rglob("*")):
            if path.suffix.lower() not in (".bbr", ".xml") or not path.is_file():
                continue
            if path.stat().st_size > MAX_INPUT:
                raise ValueError("input exceeds inventory limit")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            try:
                xml = decode_replay(path, max_xml)
                root = parse_xml(xml)
                own = Counter()
                file_counters = defaultdict(Counter)
                file_examples = defaultdict(list)
                # Recovery and pre-drive dice can live outside encoded StepResults.
                # Keep this namespace separate from the historical step-roll counts.
                for replay_step, outer in enumerate(root.findall("ReplayStep"), 1):
                    for event_index, top_event in enumerate(outer):
                        if top_event.tag not in ("EventRoll", "EventWeatherRoll", "EventKickOffTable", "EventFanFactor"):
                            continue
                        key = f"{top_event.tag}|{top_event.findtext('RollType', '?')}"
                        file_counters["top_level_roll_events"][key] += 1
                        own[key] += 1
                        if len(file_examples[key]) < 2:
                            file_examples[key].append({
                                "sha256": digest, "replayStep": replay_step,
                                "eventIndex": event_index,
                                "projection": {top_event.tag: numeric_projection(top_event)},
                            })
                for sequence, event in enumerate(root.iter("EventExecuteSequence"), 1):
                    for step_index, result in enumerate(event.iter("StepResult")):
                        encoded = result.findtext("./Step/MessageData")
                        step = decode_message(encoded) if encoded else ET.Element("UnknownStep")
                        code = step.findtext("StepType", "missing")
                        step_key = f"{step.tag}|{code}"
                        file_counters["steps"][step_key] += 1
                        messages = [decode_message(x.findtext("MessageData")) for x in result.iter("StringMessage")]
                        tags = [x.tag for x in messages]
                        own["steps"] += 1
                        if own["steps"] > 50_000:
                            raise ValueError("step count exceeds inventory limit")
                        if step.tag == "PlayerStep" and code == "1":
                            checks = [x for x in messages if x.tag == "ResultRoll"]
                            file_counters["movement"]["with_direct_roll" if checks else "without_direct_roll"] += 1
                        for outcome in messages:
                            if outcome.tag == "ResultMoveOutcome":
                                for summary in outcome.findall("./Rolls/RollSummary"):
                                    file_counters["move_summaries"][f"{summary.findtext('RollType')}|{summary.findtext('Outcome')}"] += 1
                        for tag in tags:
                            file_counters["step_messages"][f"{step_key}|{tag}"] += 1
                        for index, message in enumerate(messages):
                            file_counters["messages"][message.tag] += 1
                            action = message.findtext("Action")
                            if action is not None:
                                file_counters["actions"][f"{message.tag}|{action}|{step_key}"] += 1
                            roll_type = message.findtext("RollType")
                            if roll_type is None:
                                continue
                            key = f"{message.tag}|{roll_type}"
                            file_counters["rolls"][key] += 1
                            file_counters["roll_steps"][f"{key}|{step_key}"] += 1
                            file_counters["outcomes"][f"{key}|{message.findtext('Outcome', '?')}"] += 1
                            for skill in messages:
                                if skill.tag == "ResultSkillUsage":
                                    file_counters["roll_skills"][f"{key}|{skill.findtext('Skill')}"] += 1
                            dice = [(d.findtext("DieType"), d.findtext("Value")) for d in message.findall("./Dice/Die") + message.findall("./Die")]
                            shape = f"{key}|dice={','.join(t or '?' for t, _ in dice)}|requirement={message.findtext('Requirement', '?')}|difficulty={message.findtext('Difficulty', '?')}"
                            file_counters["roll_shapes"][shape] += 1
                            if len(file_examples[key]) < 2:
                                file_examples[key].append({
                                    "sha256": digest, "sequence": sequence, "stepIndex": step_index,
                                    "messageIndex": index, "step": {step.tag: numeric_projection(step)},
                                    "message": {message.tag: numeric_projection(message)},
                                    "stepMessageTags": tags,
                                    "numericContext": [{m.tag: numeric_projection(m)} for m in messages],
                                })
                            own[key] += 1
                files.append({"sha256": digest, "decodedBytes": len(xml), "counts": dict(own)})
                for key, value in file_counters.items():
                    counters[key].update(value)
                for key, value in file_examples.items():
                    if len(examples[key]) < 8:
                        examples[key].extend(value)
            except (ValueError, ET.ParseError, zlib.error) as error:
                files.append({"sha256": digest, "error": type(error).__name__, "reason": str(error) if isinstance(error, ValueError) and not isinstance(error, ET.ParseError) else "invalid XML/encoding"})
    return {
        "scope": "Raw source emissions; no application mappings, deduplication, or rule claims. Sequence is one-based; step/message indices are zero-based.",
        "maxDecodedBytes": max_xml,
        "files": files,
        "counts": {key: dict(sorted(value.items())) for key, value in sorted(counters.items())},
        "examples": dict(sorted(examples.items())),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directories", nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-decoded-mib", type=int, choices=range(1, 65), default=15,
                        help="Offline inspection cap only; does not change application limits")
    args = parser.parse_args()
    report = inventory(args.directories, args.max_decoded_mib * 1024 * 1024)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(report["files"]), "errors": sum("error" in f for f in report["files"]), "steps": sum(report["counts"].get("steps", {}).values()), "rollFamilies": len(report["counts"].get("rolls", {}))}))
