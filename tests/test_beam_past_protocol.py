import importlib.util
import asyncio
import json
import shutil
from copy import deepcopy
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

spec = importlib.util.spec_from_file_location(
    "beam_past_protocol", Path(__file__).resolve().parents[1] / "benchmark/beam/protocol.py")
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
    def test_new_lengths_keep_generation_policy_and_pin_distinct_dataset_and_shards(self):
        reference = protocol.protocol_settings()
        for split, conversations, questions, operations in [("500k", 35, 700, 20000), ("10m", 10, 200, 50000)]:
            settings = protocol.protocol_settings(split)
            for key in ["pastRevision", "model", "reasoningEffort", "transport", "recall", "differences"]:
                self.assertEqual(settings[key], reference[key])
            self.assertEqual(protocol.SPLITS[split]["conversations"], conversations)
            self.assertEqual(protocol.SPLITS[split]["questions"], questions)
            self.assertEqual(settings["bounds"]["memoryOperations"], operations)
        self.assertEqual(protocol.protocol_settings("500k")["datasetRevision"], protocol.DATA_REVISION)
        self.assertEqual(protocol.protocol_settings("10m")["datasetRevision"], "9b2096193fe74e2837e4713e483351e19817773c")
        self.assertEqual(set(protocol.parquet_files("10m")), {"10m-00000-of-00002.parquet", "10m-00001-of-00002.parquet"})
        self.assertNotIn("parquetSha256", protocol.protocol_settings("10m"))

    def test_all_shards_are_verified_before_parsing_and_pinned_order_is_preserved(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            shards = {"first.parquet": b"first bytes", "second.parquet": b"second bytes"}
            for name, data in shards.items():
                (root / name).write_bytes(data)
            fake = ModuleType("pyarrow")
            fake.parquet = ModuleType("pyarrow.parquet")
            fake.parquet.read_table = Mock(side_effect=lambda path: SimpleNamespace(to_pylist=lambda: [path.name]))
            cohort = {"parquetShards": {name: protocol.sha(data) for name, data in shards.items()}}
            with patch.dict(protocol.SPLITS, {"10m": cohort}), \
                    patch.dict(protocol.sys.modules, {"pyarrow": fake, "pyarrow.parquet": fake.parquet}):
                self.assertEqual(protocol.read_parquet_rows(root, "10m"), ["first.parquet", "second.parquet"])
                fake.parquet.read_table.reset_mock()
                (root / "second.parquet").write_bytes(b"corrupted")
                with self.assertRaisesRegex(AssertionError, "second.parquet"):
                    protocol.read_parquet_rows(root, "10m")
                fake.parquet.read_table.assert_not_called()

    def test_length_extension_keeps_quality_policy_and_rejects_cross_split_locks(self):
        small, large = protocol.protocol_settings(), protocol.protocol_settings("1m")
        for key in ["pastRevision", "datasetRevision", "model", "reasoningEffort", "transport", "recall", "differences"]:
            self.assertEqual(small[key], large[key])
        self.assertEqual(large["parquetSha256"], "41b5acbbb55a586b1305514ef9d9fb03365d9b3331b598a1c2dd7603d93ef533")
        self.assertEqual(large["bounds"]["memoryOperations"], 20000)
        self.assertEqual(large["bounds"]["memoryCleanupReserve"], 51)
        with TemporaryDirectory() as directory, patch.object(protocol, "source_file_hashes", return_value={}):
            root = Path(directory)
            (root / "protocol-lock.json").write_text(json.dumps({**large, "files": {}, "upstreamFiles": {}}))
            protocol.check_lock(root, {}, "1m")
            with self.assertRaises(AssertionError):
                protocol.check_lock(root, {}, "100k")

    def test_verify_phase_does_not_report_success_with_corrupted_retained_source(self):
        dataset = SimpleNamespace(load_rows=lambda split: ([{}], 'revision'),
                                  build_conversation=lambda row: SimpleNamespace(id='1'))
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with patch.object(protocol.sys, 'argv', ['benchmark', 'verify', '--root', directory]), \
                    patch.object(protocol, 'load_upstream', return_value=(dataset, {})), \
                    patch.object(protocol, 'check_lock', return_value={}), \
                    patch.dict(protocol.sys.modules, {'verify': SimpleNamespace(verify_run=lambda path: [])}), \
                    patch.object(protocol, 'validated_recalls', side_effect=AssertionError('Retained source is corrupted')) as checked:
                with self.assertRaisesRegex(AssertionError, 'Retained source is corrupted'):
                    protocol.main()
                checked.assert_called_once_with(root, ['1'])

    def test_consumed_recall_bytes_must_match_the_source_derived_digest(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "recall").mkdir()
            name = "recall/recall-1.json"
            original = b'[{"questionId":"q1","context":{"content":"The limit is 15."}}]'
            files = {name: protocol.sha(original)}
            (root / name).write_bytes(original)
            self.assertEqual(protocol.load_verified_recalls(root, files)["q1"]["context"]["content"], "The limit is 15.")
            changed = original.replace(b"15", b"999")
            (root / name).write_bytes(changed)
            (root / "recall/lock.json").write_text(json.dumps({"files": {name: protocol.sha(changed)}}))
            with self.assertRaises(AssertionError):
                protocol.load_verified_recalls(root, files)

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
            self.assertTrue({"benchmark/beam/run.py", "benchmark/beam/protocol.py",
                             "benchmark/beam/adapter.mjs", "benchmark/shared/memory-budget.mjs"} <= files.keys())
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

    def test_score_retains_redacted_bodies_before_status_or_json_failures(self):
        success = {"choices": [{"message": {"content": "synthetic-secret"}}],
                   "usage": {"prompt_tokens": 10, "completion_tokens": 2}}
        cases = [(401, "<html>synthetic-secret</html>", ModelError),
                 (503, "", ModelError), (200, "malformed synthetic-secret", ValueError),
                 (200, '["synthetic-secret"]', ModelError), (200, json.dumps(success), None)]
        class Finished(Exception):
            pass
        for status, raw, failure in cases:
            with self.subTest(status=status, raw=raw), TemporaryDirectory() as directory:
                root = Path(directory)
                response = SimpleNamespace(status_code=status, is_error=status >= 400, text=raw,
                                           json=lambda: json.loads(raw))
                client = SimpleNamespace(post=AsyncMock(return_value=response), aclose=AsyncMock())
                llm = SimpleNamespace(ModelError=ModelError)
                async def answer_question(*args):
                    result = await llm._post_once({"messages": []})
                    self.assertEqual(result, success)
                    raise Finished()
                conversation = SimpleNamespace(id="c", questions=[SimpleNamespace(id="q")])
                dataset = SimpleNamespace(load_rows=lambda split: ([{}], "revision"),
                                          build_conversation=lambda row: conversation)
                modules = {"httpx": SimpleNamespace(AsyncClient=Mock(return_value=client), HTTPError=type("HTTPError", (Exception,), {})), "llm": llm,
                           "run": SimpleNamespace(answer_question=answer_question),
                           "scoring": SimpleNamespace(), "verify": SimpleNamespace()}
                with patch.dict(protocol.sys.modules, modules), patch.object(protocol, "validated_recalls", return_value={}):
                    with self.assertRaises(failure or Finished):
                        asyncio.run(protocol.score(root, dataset, {"LLM_API_KEY": "synthetic-secret"}, {"split": "100k"}))
                receipts = list((root / "scored/calls").glob("*.json"))
                self.assertEqual(len(receipts), 1)
                saved_text = receipts[0].read_text()
                self.assertNotIn("synthetic-secret", saved_text)
                saved = json.loads(saved_text)
                self.assertEqual(saved["rawResponse"], raw.replace("synthetic-secret", "[redacted]"))
                self.assertEqual(saved["status"], status)
                self.assertIn("finishedAt", saved)
                if failure:
                    self.assertNotIn("response", saved)
                else:
                    self.assertEqual(saved["response"], json.loads(saved["rawResponse"]))
                client.post.assert_awaited_once()
                client.aclose.assert_awaited_once()

    def test_non_json_transient_responses_keep_retry_status(self):
        for status in [429, 500, 503]:
            with self.subTest(status=status), self.assertRaises(ModelError) as caught:
                protocol.model_reply(Response(status), ModelError)
            self.assertEqual(caught.exception.status, status)
            self.assertTrue(caught.exception.retryable)

    def test_model_replay_rejects_changed_answers_judges_and_receipts(self):
        llm = SimpleNamespace(_post_once=AsyncMock(), RETRY_DELAYS_SECONDS=(1, 2, 4), ModelError=ModelError)
        original_post = llm._post_once
        async def answer_question(memory, conversation, question, slots):
            context = await memory.recall(question.text, question.as_of, identity=conversation.user_identity)
            answer = await llm._post_once({"messages": [{"content": context["text"]}]})
            text = answer["choices"][0]["message"]["content"]
            try:
                judge = await llm._post_once({"messages": [{"content": text}]})
                label = judge["choices"][0]["message"]["content"]
            except Exception:
                label = "failed"
            return {"questionId": question.id, "answer": text, "judge": label}
        question = SimpleNamespace(id="q", text="Question", as_of="time")
        conversations = [SimpleNamespace(id="c", user_identity="user", questions=[question])]
        recalls = {"q": {"context": {"text": "Source"}}}
        modules = {"llm": llm, "run": SimpleNamespace(answer_question=answer_question),
                   "httpx": SimpleNamespace(HTTPError=type("HTTPError", (Exception,), {}))}
        with TemporaryDirectory() as directory, patch.dict(protocol.sys.modules, modules):
            root = Path(directory)
            (root / "scored/calls").mkdir(parents=True)
            result = {"questionId": "q", "answer": "Answer", "judge": "Yes"}
            entries = []
            for number, (prompt, text) in enumerate([("Source", "Answer"), ("Answer", "Yes")]):
                response = {"choices": [{"message": {"content": text}}]}
                entries.append({"number": number, "questionId": "q", "finishedAt": "time", "status": 200,
                                "request": protocol.native_request({"messages": [{"content": prompt}]}),
                                "response": response, "rawResponse": json.dumps(response)})
            def write(row=result, receipts=entries):
                (root / "scored/results.jsonl").write_text(json.dumps(row) + "\n")
                for entry in receipts:
                    protocol.save(root / f"scored/calls/{entry['number']:05d}.json", entry)
            def verify():
                asyncio.run(protocol.verify_model_receipts(root, conversations, recalls))
                self.assertIs(llm._post_once, original_post)
                self.assertEqual(llm.RETRY_DELAYS_SECONDS, (1, 2, 4))
            write()
            verify()
            for field in ("answer", "judge"):
                write({**result, field: "changed"})
                with self.assertRaisesRegex(AssertionError, "Scored row differs"):
                    verify()
            changed = deepcopy(entries)
            changed[1]["response"]["choices"][0]["message"]["content"] = "changed"
            write(receipts=changed)
            with self.assertRaisesRegex(AssertionError, "differs from raw receipt"):
                verify()
            changed = deepcopy(entries)
            changed[1]["request"]["messages"][0]["content"] = "changed"
            write({**result, "judge": "failed"}, changed)
            with self.assertRaisesRegex(BaseException, "Model request differs"):
                verify()
            self.assertIs(llm._post_once, original_post)
            self.assertEqual(llm.RETRY_DELAYS_SECONDS, (1, 2, 4))

    def test_successful_response_preserves_payload_and_unreadable_json_failure(self):
        payload = {"choices": [{"message": {"content": "OK"}}], "usage": {"prompt_tokens": 10}}
        self.assertIs(protocol.model_reply(Response(200, payload), ModelError), payload)
        with self.assertRaises(ValueError):
            protocol.model_reply(Response(200), ModelError)


if __name__ == "__main__":
    unittest.main()
