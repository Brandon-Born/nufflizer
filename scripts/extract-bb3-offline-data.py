"""Read selected installed JSON facts without importing or executing game modules.

This is research tooling. Exact extraction and name/code agreement do not prove
replay-version compatibility, dice distributions, or runtime behavior.
"""

import argparse
import hashlib
import json
from pathlib import Path
import zipfile


TABLES = (
    "bb3_rules_skill",
    "bb3_rules_casualty",
    "bb3_rules_casualty_effects",
    "bb3_rules_characteristic",
    "bb3_rules_skill_granting",
    "bb3_rules_skill_preventing",
)
MEMBERS = ("version.json", "Datas/BB3Rules.json")
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_MEMBER = 2 * 1024 * 1024


def extract(path):
    if path.stat().st_size > MAX_ARCHIVE:
        raise ValueError("archive exceeds research input cap")
    data = path.read_bytes()
    members = {}
    decoded = {}
    with zipfile.ZipFile(path) as archive:
        for name in MEMBERS:
            matches = [info for info in archive.infolist() if info.filename == name]
            if len(matches) != 1:
                raise ValueError("required JSON member missing or duplicated")
            if matches[0].file_size > MAX_MEMBER:
                raise ValueError("JSON member exceeds research cap")
            content = archive.read(matches[0])
            members[name] = {
                "sha256": hashlib.sha256(content).hexdigest(),
                "bytes": len(content),
            }
            decoded[name] = json.loads(content)
    rules = decoded["Datas/BB3Rules.json"]
    tables = {}
    for name in TABLES:
        rows = rules[name]
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            raise ValueError("invalid rule-table shape")
        tables[name] = rows
    return {
        "schemaVersion": 1,
        "purpose": "Installed static JSON facts; research evidence, not accepted replay behavior.",
        "source": {
            "archive": "bb3rulesengine.zip",
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
            "members": members,
            "declaredPackageVersions": decoded["version.json"],
        },
        "limits": [
            "No game modules imported or executed; only two JSON members read.",
            "Package version numbers are not replay serialization or installed build versions.",
            "Skill granting/preventing tables do not establish in-action skill cancellation rules.",
            "Casualty effects do not supply die-to-outcome probabilities or recovery policies.",
            "No account, coach, match or player-instance data is read.",
        ],
        "tables": tables,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--output", type=Path)
    group.add_argument("--verify", type=Path)
    args = parser.parse_args()
    snapshot = extract(args.archive)
    if args.verify:
        if json.loads(args.verify.read_text(encoding="utf-8")) != snapshot:
            raise ValueError("installed JSON extraction differs from snapshot")
    else:
        args.output.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sha256": snapshot["source"]["sha256"],
                      "tableRows": {name: len(rows) for name, rows in snapshot["tables"].items()},
                      "scope": "Exact static-data extraction only."}))


if __name__ == "__main__":
    main()
