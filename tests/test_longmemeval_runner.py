"""Small synthetic regressions for the Python LongMemEval workflow."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import signal
import time
import unittest
import urllib.error
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("longmemeval_reproduction", REPO / "benchmark/longmemeval/run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
CONFIG = runner.read_json(REPO / "benchmark/longmemeval/config.json")


class Response(io.BytesIO):
    def __init__(self, raw, status=200):
        super().__init__(raw)
        self.status = status


class LongMemEvalTests(unittest.TestCase):
    def test_setup_rejects_oversize_download_and_corrupt_cache(self):
        config = {"dataset": {"localName": "data.json", "bytes": 2, "sha256": runner.sha(b"[]"),
                  "url": "https://huggingface.co/datasets/test/public/resolve/" + "a" * 40 + "/data.json"}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(runner.urllib.request, "urlopen", return_value=Response(b"oversize")), patch.object(runner.subprocess, "run") as install:
                with self.assertRaisesRegex(AssertionError, "locked byte count"):
                    runner.setup(root, config)
                self.assertEqual(list(root.iterdir()), [])
                install.assert_not_called()
            (root / "data.json").write_bytes(b"{}")
            with patch.object(runner.urllib.request, "urlopen") as network, patch.object(runner.subprocess, "run") as install:
                with self.assertRaisesRegex(AssertionError, "checksum"):
                    runner.setup(root, config)
                network.assert_not_called()
                install.assert_not_called()

    def test_judge_reference_abstention_and_fixed_threshold(self):
        row = {"question_id": "example_abs", "question_type": "single-session-user", "question": "Where?", "answer": "cedar"}
        rules = {"single-session-user:abstention": {"referenceField": "Rubric", "instructions": "Use the rubric."}}
        self.assertEqual(runner.judge_request(row, "cedar", runner.rule_for(row, rules), CONFIG), {
            "model": "jev-1.13.0", "state": {"Question": "Where?", "Rubric": "cedar", "Model Response": "cedar"},
            "questions": {"correct": {"type": "noul", "instructions": "Use the rubric."}},
        })
        result = {"model": "jev-1.13.0", "answers": {"correct": {"type": "noul", "noul": 0.5}}, "usage": {"input_tokens": 10}}
        self.assertTrue(runner.verdict(result, CONFIG)["correct"])
        result["answers"]["correct"]["noul"] = 0.499
        self.assertFalse(runner.verdict(result, CONFIG)["correct"])
        self.assertEqual(runner.tokens(10.0), 10)
        with self.assertRaises(AssertionError):
            runner.tokens(True)
        for bad in (True, float("nan"), -0.1, 1.1):
            result["answers"]["correct"]["noul"] = bad
            with self.assertRaises(AssertionError):
                runner.verdict(result, CONFIG)

    def test_resource_totals_and_unknown_usage(self):
        answers = [{"milliseconds": 10, "response": {"usage": {"prompt_tokens": 20, "completion_tokens": 3}}},
                   {"milliseconds": 12, "response": {"usage": {"prompt_tokens": 30, "completion_tokens": 4}}}]
        judges = [{"milliseconds": 2, "response": {"usage": {"input_tokens": 15, "output_tokens": 1}}}]
        database = [{"milliseconds": 5}, {"milliseconds": 8}]
        self.assertEqual(runner.summarize_resources(answers, judges, database, 2, 6, 16), {
            "generation": {"calls": 2, "inputTokens": 50, "outputTokens": 7, "responseHeaderMilliseconds": 22},
            "judging": {"calls": 1, "inputTokens": 15, "outputTokens": 1, "responseHeaderMilliseconds": 2},
            "memory": {"indexedDocuments": 6, "databaseOperations": 2, "httpResponseMilliseconds": 13, "ingestRetrievePackMilliseconds": 16},
            "billedCostUsd": None,
        })
        del judges[0]["response"]["usage"]["output_tokens"]
        self.assertIsNone(runner.summarize_resources(answers, judges, database, 2, 6, 16)["judging"]["outputTokens"])
        answers[0]["response"]["usage"]["prompt_tokens"] = -1
        with self.assertRaises(AssertionError):
            runner.summarize_resources(answers, judges, database, 2, 6, 16)

    def test_raw_provider_failures_are_redacted_and_never_retried(self):
        for status, raw in ((502, b"<html>synthetic-secret</html>"), (401, b""), (200, b"malformed")):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                receipts = runner.Receipts(root, "score", "binding", CONFIG, {
                    "LLM_BASE_URL": "https://api.openai.com/v1", "LLM_API_KEY": "synthetic-secret"})
                error = urllib.error.HTTPError("https://api.openai.com/v1/chat/completions", status, "error", {}, Response(raw)) if status != 200 else None
                transport = patch.object(runner.urllib.request, "urlopen", side_effect=error) if status != 200 else patch.object(runner.urllib.request, "urlopen", return_value=Response(raw))
                with transport as request:
                    with self.assertRaises((AssertionError, json.JSONDecodeError)):
                        receipts.get("answer", "example", {"messages": []})
                    saved = runner.read_json(root / "answer/example.json")
                    self.assertEqual(saved["status"], status)
                    self.assertEqual(saved["rawResponse"], raw.decode().replace("synthetic-secret", "[redacted]"))
                    with self.assertRaises((AssertionError, json.JSONDecodeError)):
                        receipts.get("answer", "example", {"messages": []})
                    self.assertEqual(request.call_count, 1)

    def test_total_provider_deadline_restores_signal_handler(self):
        previous = signal.getsignal(signal.SIGALRM)
        with self.assertRaisesRegex(TimeoutError, "total time limit"):
            with runner.provider_deadline(0.01):
                time.sleep(0.1)
        self.assertEqual(signal.getsignal(signal.SIGALRM), previous)
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0.0, 0.0))

    def test_completed_calls_resume_but_pending_and_limits_block_new_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipts = runner.Receipts(root, "score", "binding", CONFIG, {
                "LLM_BASE_URL": "https://api.openai.com/v1", "LLM_API_KEY": "synthetic-secret"})
            body = {"model": "example", "messages": [{"role": "user", "content": "compass 🧭\nnext"}]}
            with patch.object(runner.urllib.request, "urlopen", return_value=Response(b'{"ok":true}')) as request:
                self.assertEqual(receipts.get("answer", "done", body), {"ok": True})
                self.assertEqual(receipts.get("answer", "done", body), {"ok": True})
                interrupted = runner.read_json(root / "answer/done.json")
                del interrupted["response"]
                runner.write_json(root / "answer/done.json", interrupted)
                receipts.phase = "verify"
                self.assertEqual(receipts.get("answer", "done", body), {"ok": True})
                self.assertEqual(runner.read_json(root / "answer/done.json")["response"], {"ok": True})
                receipts.phase = "score"
                sent = request.call_args.args[0]
                self.assertEqual(sent.data, runner.encode(body).encode())
                self.assertEqual(sent.get_header("Authorization"), "Bearer synthetic-secret")
                runner.write_json(root / "answer/pending.json.pending", {}, exclusive=True)
                with self.assertRaises(FileExistsError):
                    receipts.get("answer", "pending", body)
                receipts.attempts["answer"] = CONFIG["limits"]["answerCalls"]
                with self.assertRaisesRegex(AssertionError, "Run limit"):
                    receipts.get("answer", "limit", body)
                self.assertEqual(request.call_count, 1)
            saved = runner.read_json(root / "answer/done.json")
            saved["response"]["ok"] = False
            runner.write_json(root / "answer/done.json", saved)
            with self.assertRaisesRegex(AssertionError, "differs from raw receipt"):
                receipts.get("answer", "done", body)
            saved["binding"] = "another-run"
            runner.write_json(root / "answer/done.json", saved)
            with self.assertRaises(AssertionError):
                receipts.get("answer", "done", body)

    def test_verify_checks_each_score_before_accepting_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for folder in ("memory", "answer", "judge"):
                (root / folder).mkdir()
            lock = {"ids": ["example"], "owner": "owner"}
            runner.write_json(root / "memory/state.json", {"binding": "binding", "status": "completed", "completed": ["example"],
                "owned": [{"deleted": True, "absent404": True, "owner": "owner"}], "operations": 0})
            row = {"question_id": "example", "question_type": "single-session-user", "question": "Where?", "answer": "cedar"}
            rules = {"single-session-user": {"referenceField": "Answer", "instructions": "Match."}}
            answer = {"model": CONFIG["generator"]["model"], "choices": [{"finish_reason": "stop", "message": {"content": "cedar"}}],
                      "usage": {"prompt_tokens": 2, "completion_tokens": 1}}
            judgment = {"model": CONFIG["judge"]["model"], "answers": {"correct": {"type": "noul", "noul": 0.5}}, "usage": {"input_tokens": 3}}
            bodies = {"answer": {"messages": []}, "judge": runner.judge_request(row, "cedar", rules["single-session-user"], CONFIG)}
            for kind, response in (("answer", answer), ("judge", judgment)):
                runner.write_json(root / kind / "example.json", {"binding": "binding", "requestSha256": runner.sha(runner.encode(bodies[kind])),
                    "status": 200, "response": response, "rawResponse": runner.encode(response), "milliseconds": 1})
            packed = {"requests": {"example": bodies["answer"]}, "indexedDocuments": 2, "memoryMilliseconds": 3}
            credentials = {"LLM_BASE_URL": "https://api.openai.com/v1", "LLM_API_KEY": "synthetic-key", "TYPESAFE_API_KEY": "synthetic-key"}
            with patch.object(runner, "adapter", return_value=packed), patch.object(runner.urllib.request, "urlopen", side_effect=AssertionError("Network forbidden")), patch("sys.stdout", new_callable=io.StringIO):
                args = (lock, "binding", CONFIG, {"example": row}, rules, credentials)
                runner.score(root, "score", *args)
                runner.score(root, "verify", *args)
                saved = runner.read_json(root / "scores.json")
                for incorrect in (False, 1):
                    saved[0]["correct"] = incorrect
                    runner.write_json(root / "scores.json", saved)
                    with self.assertRaisesRegex(AssertionError, "Per-question"):
                        runner.score(root, "verify", *args)


if __name__ == "__main__":
    unittest.main()
