import importlib.util
import hashlib
import io
import json
from pathlib import Path
import tempfile
import time
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
                dataset = "BEAM-10M" if split == "10m" else "BEAM"
                self.assertTrue(file["url"].startswith(f"https://huggingface.co/datasets/Mohammadta/{dataset}/resolve/"))
                self.assertTrue(file["url"].endswith(file["name"].replace(split, split.upper(), 1)
                                                   if split == "10m" else f"{split.upper()}-00000-of-00001.parquet"))
                self.assertIs(type(file["bytes"]), int)
                self.assertGreater(file["bytes"], 0)

    def test_cleanup_routes_directly_to_adapter_without_upstream_or_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            credentials = root / "synthetic.env"
            argv = ["benchmark", "cleanup", "--split", "100k", "--root", str(root),
                    "--env-file", str(credentials)]
            with patch.object(runner.sys, "argv", argv), patch.object(runner.subprocess, "run") as command:
                runner.main()
            command.assert_called_once_with(["node", str(REPO / "benchmark/beam/adapter.mjs"),
                                             "--cleanup", str(root / "memory"), str(credentials)], check=True)

    def test_setup_rejects_corrupt_existing_data_before_installation(self):
        config = json.loads((REPO / "benchmark/beam/config.json").read_text())
        config["cohorts"]["100k"]["files"][0]["bytes"] = len(b"corrupt")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "upstream/past").mkdir(parents=True)
            (root / "100k.parquet").write_bytes(b"corrupt")
            with patch.object(runner.subprocess, "check_output", return_value=runner.protocol.PAST_REVISION), patch.object(runner.subprocess, "run") as command:
                with self.assertRaisesRegex(AssertionError, "Dataset checksum mismatch"):
                    runner.setup(root, config, "100k")
                command.assert_not_called()

    def test_download_checks_size_and_digest_before_publishing_or_reusing_cache(self):
        file = {"name": "sample.parquet", "url": "https://example.test/data", "bytes": 5,
                "sha256": hashlib.sha256(b"small").hexdigest()}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(runner.urllib.request, "urlopen", return_value=io.BytesIO(b"small")) as request:
                runner.download(root, file)
                runner.download(root, file)
                request.assert_called_once()
            self.assertEqual((root / file["name"]).read_bytes(), b"small")
            (root / file["name"]).write_bytes(b"small-extra")
            with patch.object(runner.urllib.request, "urlopen") as request:
                with self.assertRaisesRegex(AssertionError, "size mismatch"):
                    runner.download(root, file)
                request.assert_not_called()
            self.assertEqual((root / file["name"]).read_bytes(), b"small-extra")

    def test_download_rejects_oversize_short_and_corrupt_bodies_without_partial_files(self):
        file = {"name": "sample.parquet", "url": "https://example.test/data", "bytes": 5,
                "sha256": hashlib.sha256(b"small").hexdigest()}
        for payload, error in [(b"small-extra", "exceeds locked byte count"),
                               (b"tiny", "size mismatch"), (b"other", "checksum mismatch")]:
            with self.subTest(error=error), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with patch.object(runner.urllib.request, "urlopen", return_value=io.BytesIO(payload)):
                    with self.assertRaisesRegex(AssertionError, error):
                        runner.download(root, file)
                self.assertEqual(list(root.iterdir()), [])

    def test_total_download_deadline_interrupts_body_reads_and_restores_signal_handler(self):
        class SlowResponse(io.BytesIO):
            def read(self, size):
                time.sleep(0.1)
                return super().read(size)
        file = {"name": "sample.parquet", "url": "https://example.test/data", "bytes": 5,
                "sha256": hashlib.sha256(b"small").hexdigest()}
        previous = runner.signal.getsignal(runner.signal.SIGALRM)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(runner, "DOWNLOAD_TIMEOUT_SECONDS", 0.01), \
                    patch.object(runner.urllib.request, "urlopen", return_value=SlowResponse(b"small")):
                with self.assertRaisesRegex(TimeoutError, "total time limit"):
                    runner.download(root, file)
            self.assertEqual(list(root.iterdir()), [])
        self.assertIs(runner.signal.getsignal(runner.signal.SIGALRM), previous)
        self.assertEqual(runner.signal.getitimer(runner.signal.ITIMER_REAL), (0.0, 0.0))


if __name__ == "__main__":
    unittest.main()
