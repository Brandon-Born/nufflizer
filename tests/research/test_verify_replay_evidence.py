"""Independent probes for the research verifier's explicit offline size override."""

import base64
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
import zlib


VERIFY = runpy.run_path(str(Path(__file__).resolve().parents[2] /
                           "scripts/verify-replay-evidence.py"))["verify"]


class VerifyEvidence(unittest.TestCase):
    def source(self, directory, xml, events=None):
        packed = base64.b64encode(zlib.compress(xml))
        (directory / "source.bbr").write_bytes(packed)
        evidence = {
            "source": {"sha256": hashlib.sha256(packed).hexdigest(),
                       "replayVersion": "1-4-0-0"},
            "cases": [{"id": "probe", "rawRecords": [], "eventRecords": events or []}],
        }
        path = directory / "evidence.json"
        path.write_text(json.dumps(evidence), encoding="utf-8")
        return path

    def test_large_source_requires_explicit_bounded_override(self):
        xml = (b"<Replay><ReplayVersion>1-4-0-0</ReplayVersion>" +
               b" " * (15 * 1024 * 1024) + b"</Replay>")
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            evidence = self.source(directory, xml)
            with self.assertRaisesRegex(ValueError, "decoded XML exceeds"):
                VERIFY(directory, evidence)
            self.assertEqual(VERIFY(directory, evidence, 32)["observations"], 1)

    def test_override_rejects_unbounded_or_invalid_values_before_reading(self):
        for value in (0, 14, 33, 1024, 15.5, True, None):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "offline decoded cap"):
                VERIFY(Path("missing"), Path("missing"), value)

    def test_board_state_projection_is_checked_exactly(self):
        xml = (b"<Replay><ReplayVersion>1-4-0-0</ReplayVersion><ReplayStep>"
               b"<BoardState><Period>2</Period></BoardState></ReplayStep></Replay>")
        events = [{"replayStep": 1, "eventIndex": 0,
                   "projection": {"BoardState": {"Period": ["2"]}}}]
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            evidence = self.source(directory, xml, events)
            self.assertEqual(VERIFY(directory, evidence)["verifiedEventRecords"], 1)
            events[0]["projection"]["BoardState"]["Period"] = ["1"]
            data = json.loads(evidence.read_text())
            data["cases"][0]["eventRecords"] = events
            evidence.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "top-level numeric extract mismatch"):
                VERIFY(directory, evidence, 32)


if __name__ == "__main__":
    unittest.main()
