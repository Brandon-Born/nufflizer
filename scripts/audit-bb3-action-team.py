"""Audit ResultUseAction.TeamId against initial roster indices, without app maps.

Counts are raw emissions. Initial membership does not model recruitment or later
identity changes. Replay UI evidence is required separately for semantic labels.
"""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import runpy


def audit(directory, max_decoded_mib=15):
    if type(max_decoded_mib) is not int or not 15 <= max_decoded_mib <= 32:
        raise ValueError("offline decoded cap must be an integer from 15 to 32 MiB")
    raw = runpy.run_path(str(Path(__file__).with_name("inventory-replay-actions.py")))
    sources = []
    totals = Counter()

    def rows(counts):
        return [{"teamId": team, "initialRosterIndex": side, "emissions": count}
                for (team, side), count in sorted(
                    counts.items(), key=lambda item: (str(item[0][0]), str(item[0][1])))]

    for path in directory.glob("*.bbr"):
        if path.stat().st_size > raw["MAX_INPUT"]:
            raise ValueError("replay exceeds research input cap")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        root = raw["parse_xml"](raw["decode_replay"](path, max_decoded_mib * 1024 * 1024))
        owners = defaultdict(set)
        for side, roster in enumerate(root.findall("./Rosters/TeamRoster")):
            for player in roster.findall("./Players/PlayerData"):
                actor = player.findtext("Id")
                if actor is not None:
                    owners[actor].add(side)
        counts = Counter()
        examples = {}
        for sequence, event in enumerate(root.iter("EventExecuteSequence"), 1):
            for step_index, result in enumerate(event.iter("StepResult")):
                step = raw["decode_message"](result.findtext("./Step/MessageData"))
                actor = step.findtext("PlayerId")
                side = next(iter(owners[actor])) if len(owners[actor]) == 1 else None
                for message_index, encoded in enumerate(result.iter("StringMessage")):
                    message = raw["decode_message"](encoded.findtext("MessageData"))
                    if message.tag != "ResultUseAction":
                        continue
                    team = message.findtext("TeamId")
                    key = (team, side)
                    counts[key] += 1
                    totals[key] += 1
                    examples.setdefault(key, {
                        "sequence": sequence, "stepIndex": step_index,
                        "messageIndex": message_index, "playerId": actor,
                        "teamId": team, "initialRosterIndex": side,
                        "action": message.findtext("Action"),
                    })
        sources.append({"sha256": digest, "replayVersion": root.findtext("ReplayVersion"),
                        "counts": rows(counts), "examples": sorted(
                            examples.values(), key=lambda item: (
                                item["sequence"], item["stepIndex"], item["messageIndex"]))})
    return {
        "schemaVersion": 1,
        "scope": "Direct ResultUseAction emissions and unambiguous initial-roster indices only; no field meaning, dynamic ownership or independent-attempt count inferred.",
        "sourceCount": len(sources), "totals": rows(totals),
        "sources": sorted(sources, key=lambda item: item["sha256"]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--max-decoded-mib", type=int, choices=range(15, 33), default=15)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--output", type=Path)
    group.add_argument("--verify", type=Path)
    args = parser.parse_args()
    result = audit(args.directory, args.max_decoded_mib)
    if args.verify:
        if json.loads(args.verify.read_text(encoding="utf-8")) != result:
            raise ValueError("action-team audit differs from source corpus")
    else:
        args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceCount": result["sourceCount"], "totals": result["totals"]}))


if __name__ == "__main__":
    main()
