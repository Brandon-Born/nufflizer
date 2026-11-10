"""Independent PE probes for the offline enum extractor; no game image needed."""

import importlib.util
import struct
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "bb3_enums", Path(__file__).resolve().parents[2] / "scripts/extract-bb3-enums.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def image():
    data = bytearray(2048)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    struct.pack_into("<HH", data, 0x84, 0x8664, 1)
    struct.pack_into("<H", data, 0x94, 240)
    struct.pack_into("<H", data, 0x98, 0x20B)
    struct.pack_into("<Q", data, 0xB0, 0x140000000)
    section = 0x98 + 240
    data[section:section + 8] = b".rdata\0\0"
    struct.pack_into("<IIII", data, section + 8, 1536, 0x1000, 1536, 512)
    for offset, member in [(768, b"Alpha"), (832, b"Beta")]:
        name = b"EBB3BoardDataProbe::" + member + b"\0"
        data[offset:offset + len(name)] = name
    struct.pack_into("<Qq", data, 512, 0x140001100, 99)
    struct.pack_into("<Qq", data, 528, 0x140001140, 7)
    return data


class ExtractEnums(unittest.TestCase):
    def test_values_come_from_pairs_not_name_order(self):
        result = MODULE.extract(image())
        entries = result["enums"][0]["entries"]
        self.assertEqual([(e["member"], e["value"]) for e in entries], [("Alpha", 99), ("Beta", 7)])
        self.assertEqual(entries[1]["nameOffset"], 832)
        self.assertEqual(entries[1]["entryOffset"], 528)

    def test_truncated_and_wrong_images_reject(self):
        for data in [b"MZ", b"x" * 2048, image()[:600]]:
            with self.subTest(size=len(data)), self.assertRaises(ValueError):
                MODULE.extract(data)

    def test_unpaired_name_rejects(self):
        data = image()
        struct.pack_into("<Q", data, 528, 0)
        with self.assertRaisesRegex(ValueError, "unpaired"):
            MODULE.extract(data)

    def test_ambiguous_reference_rejects(self):
        data = image()
        struct.pack_into("<Qq", data, 544, 0x140001100, 12)
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            MODULE.extract(data)

    def test_noncontiguous_pairs_reject(self):
        data = image()
        data[544:560] = data[528:544]
        data[528:544] = b"\0" * 16
        with self.assertRaisesRegex(ValueError, "noncontiguous"):
            MODULE.extract(data)

    def test_duplicate_values_reject(self):
        data = image()
        struct.pack_into("<q", data, 536, 99)
        with self.assertRaisesRegex(ValueError, "duplicate enum values"):
            MODULE.extract(data)


if __name__ == "__main__":
    unittest.main()
