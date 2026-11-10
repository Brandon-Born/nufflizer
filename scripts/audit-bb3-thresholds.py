"""Compare arithmetic hypotheses with direct single-D6 ResultRoll records.

This inventories raw evidence, without importing application maps or accepting a
game rule. Questions, top-level events, nonbinary outcomes and other dice types
are deliberately outside this audit's scope. Emissions are not deduplicated.
"""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import runpy


def audit(directories, max_decoded_mib=15):
    if type(max_decoded_mib) is not int or not 15 <= max_decoded_mib <= 32:
        raise ValueError("offline decoded cap must be an integer from 15 to 32 MiB")
    raw = runpy.run_path(str(Path(__file__).with_name("inventory-replay-actions.py")))
    groups = defaultdict(Counter)
    examples = []
    sources = []
    seen = set()
    for directory in directories:
        for path in directory.glob("*.bbr"):
            if path.stat().st_size > raw["MAX_INPUT"]:
                raise ValueError("replay exceeds research input cap")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            root = raw["parse_xml"](raw["decode_replay"](
                path, max_decoded_mib * 1024 * 1024))
            sources.append({"sha256": digest, "replayVersion": root.findtext("ReplayVersion")})
            for sequence, event in enumerate(root.iter("EventExecuteSequence"), 1):
                for step_index, step in enumerate(event.iter("StepResult")):
                    for message_index, encoded in enumerate(step.iter("StringMessage")):
                        message = raw["decode_message"](encoded.findtext("MessageData"))
                        if message.tag != "ResultRoll":
                            continue
                        dice = message.findall("./Dice/Die")
                        requirement = message.findtext("Requirement")
                        outcome = message.findtext("Outcome")
                        roll_type = message.findtext("RollType")
                        if (len(dice) != 1 or dice[0].findtext("DieType") != "0"
                                or requirement is None or outcome not in ("0", "1")
                                or roll_type is None):
                            continue
                        modifiers = [item.findtext("Value")
                                     for item in message.findall("./Modifiers/Modifier")]
                        if any(value is None for value in modifiers):
                            continue
                        die = int(dice[0].findtext("Value"))
                        requirement = int(requirement)
                        modifier_total = sum(int(value) for value in modifiers)
                        outcome = int(outcome)
                        roll_type = int(roll_type)
                        difficulty_text = message.findtext("Difficulty")
                        difficulty = int(difficulty_text) if difficulty_text is not None else None
                        naive = int(die + modifier_total >= requirement)
                        threshold = int(die >= difficulty) if difficulty is not None else None
                        group = groups[roll_type]
                        group["emissions"] += 1
                        group["modifiedSumDisagreements"] += int(naive != outcome)
                        if difficulty is not None:
                            group["withDifficulty"] += 1
                            group["difficultyModelDisagreements"] += int(threshold != outcome)
                            group["clampedThresholdDisagreements"] += int(
                                difficulty != max(2, min(6, requirement - modifier_total)))
                            group[f"difficulty{difficulty}"] += 1
                        if naive != outcome:
                            examples.append({
                                "sha256": digest, "sequence": sequence,
                                "stepIndex": step_index, "messageIndex": message_index,
                                "rollType": roll_type, "die": die,
                                "requirement": requirement, "modifierTotal": modifier_total,
                                "difficulty": difficulty, "outcome": outcome,
                                "modifiedSumModel": naive, "difficultyModel": threshold,
                                "projection": {message.tag: raw["numeric_projection"](message)},
                            })
    ordered_groups = [{"rollType": key, **dict(sorted(value.items()))}
                      for key, value in sorted(groups.items())]
    return {
        "schemaVersion": 1,
        "scope": "Direct ResultRoll, one explicit DieType0 die, explicit Requirement and Outcome0/1; complete direct modifier values only. Raw emissions, not independent attempts. No questions, nested rolls, top-level events, neutral outcomes or other dice types included.",
        "limits": [
            "Agreement with an arithmetic hypothesis is not independent rule acceptance.",
            "Recorded Difficulty may encode a rule or bounds that must not be generalized from this sample.",
            "Same-result questions and kept summaries are not deduplicated by this audit.",
            "Exception locators are raw review targets, not new UI annotations.",
        ],
        "sourceCount": len(sources),
        "sources": sorted(sources, key=lambda item: item["sha256"]),
        "eligibleEmissions": sum(value["emissions"] for value in groups.values()),
        "byRollType": ordered_groups,
        "modifiedSumDisagreements": sorted(examples, key=lambda item: (
            item["sha256"], item["sequence"], item["stepIndex"], item["messageIndex"])),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directories", type=Path, nargs="+")
    parser.add_argument("--max-decoded-mib", type=int, choices=range(15, 33), default=15)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--output", type=Path)
    group.add_argument("--verify", type=Path)
    args = parser.parse_args()
    result = audit(args.directories, args.max_decoded_mib)
    if args.verify:
        if json.loads(args.verify.read_text(encoding="utf-8")) != result:
            raise ValueError("threshold audit differs from source corpus")
    else:
        args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sources": result["sourceCount"],
                      "eligibleEmissions": result["eligibleEmissions"],
                      "rollFamilies": len(result["byRollType"]),
                      "modifiedSumDisagreements": len(result["modifiedSumDisagreements"])}))


if __name__ == "__main__":
    main()
