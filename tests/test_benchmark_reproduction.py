import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("beam_reproduction", REPO / "benchmark/beam/run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ReproductionTests(unittest.TestCase):
    def test_all_four_dataset_pins_match_the_execution_protocol(self):
        config = json.loads((REPO / "benchmark/beam/config.json").read_text())
        self.assertEqual(set(config["cohorts"]), {"100k", "500k", "1m", "10m"})
        self.assertEqual(config["upstream"]["revision"], runner.protocol.PAST_REVISION)
        for split, cohort in config["cohorts"].items():
            self.assertEqual({f["name"]: f["sha256"] for f in cohort["files"]}, runner.protocol.parquet_files(split))
            self.assertEqual(cohort["questions"], runner.protocol.SPLITS[split]["questions"])
            self.assertEqual(cohort["datasetRevision"], runner.protocol.SPLITS[split].get("datasetRevision", runner.protocol.DATA_REVISION))
            for file in cohort["files"]:
                self.assertIn("/resolve/" + cohort["datasetRevision"] + "/data/", file["url"])

    def test_setup_rejects_corrupt_existing_data_before_installation(self):
        config = json.loads((REPO / "benchmark/beam/config.json").read_text())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "upstream/past").mkdir(parents=True)
            (root / "100k.parquet").write_bytes(b"corrupt")
            with patch.object(runner.subprocess, "check_output", return_value=runner.protocol.PAST_REVISION), patch.object(runner.subprocess, "run") as command:
                with self.assertRaisesRegex(AssertionError, "Dataset checksum mismatch"):
                    runner.setup(root, config, "100k")
                command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
