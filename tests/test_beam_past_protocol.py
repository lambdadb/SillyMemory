import importlib.util
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory

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
