#!/usr/bin/env python3
"""Read BB3 BoardData/NetGameplay enum pairs from an installed PE64 image.

Research only. Reads a file, never a running process. Does not load or execute
the image. Names alone do not establish probabilities or replay field ownership.
"""

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

MAX_IMAGE_BYTES = 256 * 1024 * 1024
ENUM_NAME = re.compile(
    rb"EBB3(?:BoardData|NetGameplay)[A-Za-z0-9_]{1,100}::[A-Za-z_][A-Za-z0-9_]{0,127}\x00"
)


def extract(data):
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def unpack(fmt, offset):
        size = struct.calcsize(fmt)
        require(0 <= offset <= len(data) - size, "truncated PE field")
        return struct.unpack_from(fmt, data, offset)

    require(64 <= len(data) <= MAX_IMAGE_BYTES, "image size outside research cap")
    require(data[:2] == b"MZ", "missing DOS signature")
    pe = unpack("<I", 0x3C)[0]
    require(data[pe:pe + 4] == b"PE\0\0", "missing PE signature")
    machine, count = unpack("<HH", pe + 4)
    require(machine == 0x8664 and 1 <= count <= 96, "expected bounded x64 PE")
    optional_size = unpack("<H", pe + 20)[0]
    optional = pe + 24
    require(optional_size >= 32, "truncated optional header")
    require(unpack("<H", optional)[0] == 0x20B, "expected PE32+ image")
    base = unpack("<Q", optional + 24)[0]
    sections = []
    for index in range(count):
        offset = optional + optional_size + 40 * index
        require(offset + 40 <= len(data), "truncated section table")
        label = data[offset:offset + 8].split(b"\0")[0]
        _, rva, size, start = unpack("<IIII", offset + 8)
        require(start <= len(data) and size <= len(data) - start, "section outside image")
        sections.append((label, start, start + size, rva))
    rdata = [section for section in sections if section[0] == b".rdata"]
    require(len(rdata) == 1, "expected one .rdata section")

    names = {}
    groups = {}
    for match in ENUM_NAME.finditer(data):
        require(len(names) < 20000, "too many candidate enum names")
        start = match.start()
        owners = [s for s in sections if s[1] <= start and match.end() <= s[2]]
        require(len(owners) == 1, "enum name outside unique section")
        _, lo, _, rva = owners[0]
        full = match.group()[:-1].decode("ascii")
        group, member = full.split("::")
        require(member not in groups.setdefault(group, {}), "duplicate qualified enum name")
        address = base + rva + start - lo
        names[address] = (group, member, start)
        groups[group][member] = None
    require(names, "no gameplay enum names found")

    _, lo, hi, _ = rdata[0]
    require(lo % 8 == 0, "unaligned .rdata section")
    for offset in range(lo, hi - 15, 8):
        pointer, value = unpack("<Qq", offset)
        if pointer not in names or not -1 <= value <= 65535:
            continue
        group, member, name_offset = names[pointer]
        require(groups[group][member] is None, "ambiguous enum pointer/value candidate")
        groups[group][member] = {
            "member": member,
            "value": value,
            "nameOffset": name_offset,
            "entryOffset": offset,
        }

    tables = []
    for name in sorted(groups):
        require(all(x is not None for x in groups[name].values()), "unpaired enum name: " + name)
        entries = sorted(groups[name].values(), key=lambda x: x["entryOffset"])
        require(
            all(b["entryOffset"] == a["entryOffset"] + 16 for a, b in zip(entries, entries[1:])),
            "noncontiguous enum candidate array: " + name,
        )
        require(len({x["value"] for x in entries}) == len(entries), "duplicate enum values: " + name)
        tables.append({"name": name, "entries": entries})
    return {
        "schemaVersion": 1,
        "purpose": "Installed-build enum evidence; not a complete replay/rule contract.",
        "source": {"sha256": hashlib.sha256(data).hexdigest(), "sizeBytes": len(data), "format": "PE32+ x64"},
        "method": {
            "imageBase": base,
            "namePattern": "EBB3BoardData and EBB3NetGameplay namespaces only",
            "entryShape": "8-byte image VA to exact ASCII name, then signed 8-byte numeric value",
            "checks": "Every matching name paired once; each enum array contiguous at stride16; unique members and values.",
        },
        "limits": [
            "Local installed executable only; no running-process memory read, modification or execution.",
            "Numeric values are read from entries, never inferred from declaration order.",
            "Snapshot is bound to this executable hash; replay serialization versions are separate evidence.",
            "Field-to-enum namespace linkage and version compatibility require replay/UI corroboration.",
            "Names do not prove dice distributions, modifiers, reroll rules, state defaults or beneficiaries.",
        ],
        "enums": tables,
    }


def read_image(path):
    with path.open("rb") as stream:
        data = stream.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("image exceeds research cap")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--verify", type=Path, help="Require exact equality with a saved snapshot")
    args = parser.parse_args()
    try:
        result = extract(read_image(args.image))
        if args.verify:
            expected = json.loads(args.verify.read_text(encoding="utf-8"))
            if result != expected:
                raise ValueError("installed enum snapshot mismatch")
        if args.output:
            args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"sha256": result["source"]["sha256"], "enums": len(result["enums"]),
                          "entries": sum(len(e["entries"]) for e in result["enums"]),
                          "verified": args.verify is not None}))
    except (ValueError, OSError, struct.error) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
