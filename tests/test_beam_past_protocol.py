import importlib.util
import json
import shutil
from copy import deepcopy
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "beam_past_protocol", Path(__file__).resolve().parents[1] / "scripts/beam-past-protocol.py")
protocol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protocol)


class ModelError(Exception):
    def __init__(self, message, *, retryable, status=None):
        super().__init__(message)
        self.retryable = retryable
        self.status = status


class Response:
    def __init__(self, status, data=None):
        self.status_code = status
        self.is_error = status >= 400
        self.data = data

    def json(self):
        if self.data is None:
            raise ValueError("HTML is not JSON")
        return self.data


class TransportPolicy(unittest.TestCase):
    def test_external_run_manifest_survives_relocation_and_checks_input_changes(self):
        with TemporaryDirectory() as directory:
            temporary = Path(directory)
            root = temporary / "external"
            contents = {
                "memory-input.json": b"input", "100k.parquet": b"parquet",
                "dataset-cache/100k.json": b"questions", "dataset-cache/100k.revision": b"revision",
                "tokenizer/node_modules/tiktoken/package.json": b"package",
                "tokenizer/node_modules/tiktoken/tiktoken.cjs": b"entry",
                "tokenizer/node_modules/tiktoken/tiktoken_bg.cjs": b"bindings",
                "tokenizer/node_modules/tiktoken/tiktoken_bg.wasm": b"wasm",
            }
            for name, data in contents.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            files = protocol.source_file_hashes(root)
            self.assertEqual({k: v for k, v in files.items() if k.startswith("run/")},
                             {f"run/{k}": protocol.sha(v) for k, v in contents.items()})
            lock = {**protocol.protocol_settings(), "files": files, "upstreamFiles": {}}
            (root / "protocol-lock.json").write_text(json.dumps(lock))
            moved = temporary / "restored"
            shutil.copytree(root, moved)
            link = temporary / "linked"
            link.symlink_to(moved, target_is_directory=True)
            self.assertEqual(protocol.check_lock(link.resolve(), {}), lock)
            (moved / "memory-input.json").write_text("changed input")
            with self.assertRaises(AssertionError):
                protocol.check_lock(moved, {})

    def test_recall_manifest_cannot_omit_a_corrupted_conversation_file(self):
        identities = [str(i) for i in range(1, 21)]
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "recall").mkdir()
            files = {}
            for identity in identities:
                name = f"recall/recall-{identity}.json"
                (root / name).write_bytes(b"[]")
                files[name] = protocol.sha(b"[]")
            protocol.check_recall_files(root, files, identities)
            (root / "recall/recall-20.json").write_text("corrupted")
            with self.assertRaises(AssertionError):
                protocol.check_recall_files(root, files, identities)
            del files["recall/recall-20.json"]
            with self.assertRaises(AssertionError):
                protocol.check_recall_files(root, files, identities)

    def test_lock_rejects_metadata_that_disagrees_with_executed_policy(self):
        files, upstream = {"required-runtime.js": "digest"}, {"loader.py": "digest"}
        original = {**protocol.protocol_settings(), "files": files, "upstreamFiles": upstream}
        with TemporaryDirectory() as directory, patch.object(protocol, "source_file_hashes", return_value=files):
            root = Path(directory)
            (root / "protocol-lock.json").write_text(json.dumps(original))
            self.assertEqual(protocol.check_lock(root, upstream)["recall"]["maxTokens"], 8000)
            changed = deepcopy(original)
            changed["recall"]["maxTokens"] = 4000
            (root / "protocol-lock.json").write_text(json.dumps(changed))
            with self.assertRaises(AssertionError):
                protocol.check_lock(root, upstream)

    def test_lock_cannot_drop_a_required_file_from_its_manifest(self):
        files, upstream = {"required-runtime.js": "digest"}, {"loader.py": "digest"}
        changed = {**protocol.protocol_settings(), "files": {}, "upstreamFiles": upstream}
        with TemporaryDirectory() as directory, patch.object(protocol, "source_file_hashes", return_value=files):
            root = Path(directory)
            (root / "protocol-lock.json").write_text(json.dumps(changed))
            with self.assertRaises(AssertionError):
                protocol.check_lock(root, upstream)

    def test_existing_protocol_is_rejected_before_inputs_are_rewritten(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "protocol-lock.json").write_text("original lock")
            (root / "memory-input.json").write_text("original input")
            with self.assertRaises(AssertionError):
                protocol.prepare(root, None, {})
            self.assertEqual((root / "protocol-lock.json").read_text(), "original lock")
            self.assertEqual((root / "memory-input.json").read_text(), "original input")

    def test_non_json_account_refusals_keep_stop_status(self):
        for status in [401, 402, 403]:
            with self.subTest(status=status), self.assertRaises(ModelError) as caught:
                protocol.model_reply(Response(status), ModelError)
            self.assertEqual(caught.exception.status, status)
            self.assertFalse(caught.exception.retryable)

    def test_non_json_transient_responses_keep_retry_status(self):
        for status in [429, 500, 503]:
            with self.subTest(status=status), self.assertRaises(ModelError) as caught:
                protocol.model_reply(Response(status), ModelError)
            self.assertEqual(caught.exception.status, status)
            self.assertTrue(caught.exception.retryable)

    def test_successful_response_preserves_payload_and_unreadable_json_failure(self):
        payload = {"choices": [{"message": {"content": "OK"}}], "usage": {"prompt_tokens": 10}}
        self.assertIs(protocol.model_reply(Response(200, payload), ModelError), payload)
        with self.assertRaises(ValueError):
            protocol.model_reply(Response(200), ModelError)


if __name__ == "__main__":
    unittest.main()
