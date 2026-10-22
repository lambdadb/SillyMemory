"""Reproduce the fixed LongMemEval-S profile using SillyMemory's Node adapter."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SOURCE_FILES = [
    "benchmark/longmemeval/run.py", "benchmark/longmemeval/adapter.mjs",
    "benchmark/longmemeval/protocol.mjs", "benchmark/longmemeval/storage.mjs",
    "benchmark/longmemeval/judge-rules.json", "benchmark/tokenizer/package.json",
    "benchmark/tokenizer/package-lock.json", "scripts/benchmark-audit.mjs",
    "scripts/benchmark-development-input.mjs", "scripts/benchmark-host-input.mjs",
    "benchmark/shared/memory-budget.mjs", "src/client.js", "src/memory.js", "src/context.js",
    "src/time.js", "src/chunking.js", "src/commit.js", "vendor/lambdadb.js",
]


def encode(value):
    # Match JSON.stringify for the string/integer request and lock fields.
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def sha(value):
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8"))


def same_json(actual, expected):
    # JSON numbers share a type in JavaScript; booleans must remain distinct.
    if type(actual) in (int, float) and type(expected) in (int, float):
        return actual == expected
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(same_json(actual[key], value) for key, value in expected.items())
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(same_json(a, b) for a, b in zip(actual, expected))
    return actual == expected


def write_json(file, value, exclusive=False):
    with file.open("x" if exclusive else "w", encoding="utf-8") as stream:
        stream.write(encode(value))


def atomic(file, value, clean=lambda text: text):
    temporary = file.with_name(file.name + ".tmp")
    temporary.write_text(clean(encode(value)), encoding="utf-8")
    temporary.replace(file)


def adapter(action, root, **kwargs):
    command = ["node", str(HERE / "adapter.mjs")]
    payload = encode({"action": action, "root": str(root), **kwargs})
    # Let the adapter finish owned-resource cleanup after an interrupt.
    with subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8") as child:
        previous = {}
        try:
            if action in {"recall", "cleanup"}:
                for sig in (signal.SIGINT, signal.SIGTERM):
                    previous[sig] = signal.signal(sig, lambda signum, _frame: child.send_signal(signum))
            output, _ = child.communicate(payload)
            if child.returncode:
                raise RuntimeError(f"Memory adapter failed ({action}, exit {child.returncode})")
            return json.loads(output)
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)


def setup(root, config):
    dataset = config["dataset"]
    assert Path(dataset["localName"]).name == dataset["localName"]
    assert type(dataset["bytes"]) is int and 0 < dataset["bytes"] <= 300_000_000
    url = urlparse(dataset["url"])
    assert url.scheme == "https" and url.netloc == "huggingface.co"
    parts = url.path.split("/")
    assert len(parts) >= 7 and parts[1] == "datasets" and parts[4] == "resolve"
    assert len(parts[5]) == 40 and all(c in "0123456789abcdef" for c in parts[5])
    target = root / dataset["localName"]
    if not target.exists():
        with tempfile.TemporaryDirectory(prefix=".download-", dir=root) as directory:
            temporary = Path(directory) / "payload"
            with provider_deadline(900), urllib.request.urlopen(dataset["url"], timeout=120) as response, temporary.open("xb") as output:
                received = 0
                while chunk := response.read(1024 * 1024):
                    received += len(chunk)
                    assert received <= dataset["bytes"], "Dataset exceeds locked byte count"
                    output.write(chunk)
            assert received == dataset["bytes"], "Dataset size mismatch"
            assert digest(temporary) == dataset["sha256"], "Dataset checksum mismatch"
            temporary.rename(target)
    assert target.stat().st_size == dataset["bytes"], "Existing cache size mismatch"
    assert digest(target) == dataset["sha256"], "Dataset checksum mismatch"
    tokenizer = root / "tokenizer"
    tokenizer.mkdir(exist_ok=True)
    for name in ("package.json", "package-lock.json"):
        source, target = HERE.parent / "tokenizer" / name, tokenizer / name
        if target.exists():
            assert target.read_bytes() == source.read_bytes(), "Tokenizer lock differs"
        else:
            shutil.copyfile(source, target)
    subprocess.run(["npm", "ci", "--prefix", str(tokenizer), "--no-audit", "--no-fund"], check=True)
    print("Dataset and tokenizer ready; run prepare next.")


def source_hashes(root):
    files = {file: digest(REPO / file) for file in SOURCE_FILES}
    tokenizer = root / "tokenizer"
    for name in ("package.json", "package-lock.json"):
        assert (tokenizer / name).read_bytes() == (HERE.parent / "tokenizer" / name).read_bytes(), "Tokenizer lock differs"
    package = tokenizer / "node_modules/tiktoken"
    assert read_json(package / "package.json")["version"] == "1.0.22"
    for name in ("tiktoken.cjs", "tiktoken_bg.cjs", "tiktoken_bg.wasm"):
        files[f"tokenizer/{name}"] = digest(package / name)
    return files


def rule_for(row, rules):
    return rules[row["question_type"] + (":abstention" if row["question_id"].endswith("_abs") else "")]


def judge_request(row, response, rule, config):
    assert isinstance(response, str) and response.strip()
    return {"model": config["judge"]["model"],
            "state": {"Question": row["question"], rule["referenceField"]: row["answer"], "Model Response": response},
            "questions": {"correct": {"type": "noul", "instructions": rule["instructions"]}}}


def tokens(value):
    assert type(value) in (int, float) and 0 <= value <= 2**53 - 1 and int(value) == value
    return int(value)


def milliseconds(value):
    assert type(value) in (int, float) and math.isfinite(value) and value >= 0
    return value


def verdict(result, config):
    assert result["model"] == config["judge"]["model"]
    assert list(result["answers"]) == ["correct"]
    answer = result["answers"]["correct"]
    assert answer["type"] == "noul"
    probability = answer["noul"]
    assert type(probability) in (int, float) and math.isfinite(probability) and 0 <= probability <= 1
    tokens(result["usage"]["input_tokens"])
    return {"probability": probability, "correct": probability >= config["judge"]["threshold"]}


def summarize_resources(answers, judgments, database, operations, indexed_documents, memory_milliseconds):
    def total_time(receipts):
        total = 0
        for receipt in receipts:
            total += milliseconds(receipt["milliseconds"])
        return total

    def models(receipts, input_field, output_field):
        return {"calls": len(receipts),
                "inputTokens": sum(tokens(r["response"]["usage"][input_field]) for r in receipts),
                "outputTokens": None if any(output_field not in r["response"]["usage"] for r in receipts)
                else sum(tokens(r["response"]["usage"][output_field]) for r in receipts),
                "responseHeaderMilliseconds": total_time(receipts)}
    assert len(database) == operations
    memory_time = None if any(r.get("error") and "milliseconds" not in r for r in database) else total_time(database)
    return {"generation": models(answers, "prompt_tokens", "completion_tokens"),
            "judging": models(judgments, "input_tokens", "output_tokens"),
            "memory": {"indexedDocuments": tokens(indexed_documents), "databaseOperations": tokens(operations),
                       "httpResponseMilliseconds": memory_time,
                       "ingestRetrievePackMilliseconds": milliseconds(memory_milliseconds)},
            "billedCostUsd": None}


@contextmanager
def provider_deadline(seconds):
    # Bound the entire request, including a body that keeps arriving slowly.
    def expired(_signum, _frame):
        raise TimeoutError("Provider request exceeded its total time limit")
    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def record_response(file, response, metadata, clean=lambda text: text):
    saved = {**metadata, "status": response.status, "rawResponse": response.read().decode("utf-8", errors="replace")}
    atomic(file, saved, clean)
    assert response.status == 200, f"Provider HTTP {response.status}; receipt retained"
    saved["response"] = json.loads(saved["rawResponse"])
    atomic(file, saved, clean)
    return saved["response"]


def database_receipts(root, operations):
    receipts = []
    for number in range(1, operations + 1):
        response = root / "memory" / f"http-{number}.json"
        failure = root / "memory" / f"http-{number}-error.json"
        assert response.exists() != failure.exists(), "Missing or ambiguous database receipt"
        receipt = read_json(response if response.exists() else failure)
        assert response.exists() or receipt.get("error"), "Invalid database error receipt"
        receipts.append(receipt)
    return receipts


class Receipts:
    def __init__(self, root, phase, binding, config, credentials):
        self.root, self.phase, self.binding, self.config = root, phase, binding, config
        self.credentials = credentials
        self.deadline = None
        self.attempts = {"answer": 0, "judge": 0}
        self.secrets = [value for key, value in credentials.items()
                        if any(word in key.upper() for word in ("KEY", "TOKEN", "SECRET", "PASSWORD")) and len(value) >= 8]

    def clean(self, text):
        for secret in self.secrets:
            text = text.replace(secret, "[redacted]")
        return text

    def remaining_time(self):
        if self.deadline is None:
            file = self.root / "score-clock.json"
            if not file.exists():
                assert not any(self.root.glob("answer/*.json*")) and not any(self.root.glob("judge/*.json*")), "Missing score clock for prior model attempts"
                write_json(file, {"binding": self.binding, "startedAt": time.time()}, exclusive=True)
            clock = read_json(file)
            assert clock["binding"] == self.binding, "Score clock belongs to another run"
            started = clock["startedAt"]
            assert type(started) in (int, float) and math.isfinite(started) and 0 < started <= time.time()
            remaining = started + self.config["limits"]["wallHours"] * 3600 - time.time()
            self.deadline = time.monotonic() + remaining
        return self.deadline - time.monotonic()

    def get(self, kind, id, body):
        folder = self.root / kind
        folder.mkdir(exist_ok=True)
        file = folder / f"{id}.json"
        request = encode(body)
        request_hash = sha(request)
        if file.exists():
            saved = read_json(file)
            assert saved["requestSha256"] == request_hash and saved["binding"] == self.binding
            assert saved["status"] == 200
            response = json.loads(saved["rawResponse"])
            if "response" in saved:
                assert same_json(saved["response"], response), "Parsed response differs from raw receipt"
            else:
                saved["response"] = response
                atomic(file, saved, self.clean)
            return response
        assert self.phase == "score", f"Missing {kind} receipt: {id}"
        assert self.remaining_time() > 0 and self.attempts[kind] < self.config["limits"][kind + "Calls"], "Run limit reached"
        write_json(file.with_suffix(".json.pending"), {"requestSha256": request_hash, "binding": self.binding,
                   "startedAt": datetime.now(timezone.utc).isoformat()}, exclusive=True)
        self.attempts[kind] += 1
        url = self.credentials["LLM_BASE_URL"] + "/chat/completions" if kind == "answer" else self.config["judge"]["endpoint"]
        key = self.credentials["LLM_API_KEY"] if kind == "answer" else self.credentials["TYPESAFE_API_KEY"]
        req = urllib.request.Request(url, data=request.encode("utf-8"), headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
        started = time.monotonic()
        timeout = min(240 if kind == "answer" else 120, self.remaining_time())
        assert timeout > 0, "Run limit reached"
        with provider_deadline(timeout):
            try:
                response = urllib.request.urlopen(req, timeout=timeout)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return record_response(file, response, {"requestSha256": request_hash, "binding": self.binding,
                                       "milliseconds": (time.monotonic() - started) * 1000}, self.clean)


def score(root, phase, lock, binding, config, rows, rules, credentials):
    state = read_json(root / "memory/state.json")
    assert state["binding"] == binding and state["status"] == "completed"
    assert state["completed"] == lock["ids"] and len(state["owned"]) == len(lock["ids"])
    assert all(e["deleted"] and e["absent404"] and e["owner"] == lock["owner"] for e in state["owned"])
    # Reconstruct and verify every source-bound request before any generation.
    packed = adapter("requests", root, lock=lock, binding=binding)
    if phase == "score":
        assert credentials.get("LLM_API_KEY", "").strip() and credentials.get("TYPESAFE_API_KEY", "").strip(), "Missing generation or judge key"
        assert credentials.get("LLM_BASE_URL") == "https://api.openai.com/v1"
    receipts = Receipts(root, phase, binding, config, credentials)
    scores = []
    for id in lock["ids"]:
        row = rows[id]
        answer = receipts.get("answer", id, packed["requests"][id])
        assert answer["model"] == config["generator"]["model"] and answer["choices"][0]["finish_reason"] == "stop"
        text = answer["choices"][0]["message"]["content"]
        assert isinstance(text, str) and text.strip()
        tokens(answer["usage"]["prompt_tokens"])
        tokens(answer["usage"]["completion_tokens"])
        judgment = receipts.get("judge", id, judge_request(row, text, rule_for(row, rules), config))
        scores.append({"id": id, "type": row["question_type"], **verdict(judgment, config)})
    operations = tokens(state["operations"])
    assert operations <= config["limits"]["memoryOperations"]
    answers = [read_json(root / "answer" / f"{id}.json") for id in lock["ids"]]
    judgments = [read_json(root / "judge" / f"{id}.json") for id in lock["ids"]]
    database = database_receipts(root, operations)
    correct = sum(row["correct"] for row in scores)
    summary = {"questions": len(scores), "fullCohort": len(scores) == config["questions"], "correct": correct,
               "accuracy": correct / len(scores), "generator": config["generator"], "judge": config["judge"], "binding": binding,
               "resources": summarize_resources(answers, judgments, database, operations, packed["indexedDocuments"], packed["memoryMilliseconds"])}
    if phase == "verify":
        assert same_json(read_json(root / "scores.json"), scores), "Per-question scores differ"
        assert same_json(read_json(root / "summary.json"), summary), "Summary differs"
    else:
        write_json(root / "scores.json", scores)
        write_json(root / "summary.json", summary)
    print(json.dumps(summary, indent=2))


def run(args):
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    running = root / ".running"
    running.mkdir()
    try:
        config = read_json(HERE / "config.json")
        assert digest(HERE / "judge-rules.json") == config["rulesSha256"]
        rules = read_json(HERE / "judge-rules.json")
        if args.phase == "setup":
            setup(root, config)
            return
        lock = None if args.phase == "prepare" else read_json(root / "lock.json")
        binding = sha(encode(lock)) if lock else None
        # Cleanup deliberately bypasses dataset/source checks for interrupted runs.
        if args.phase == "cleanup":
            adapter("cleanup", root, lock=lock, binding=binding, envFile=str(args.env_file.resolve()))
            return
        files = source_hashes(root)
        dataset = root / config["dataset"]["localName"]
        assert digest(dataset) == config["dataset"]["sha256"], "Dataset checksum mismatch"
        rows = {row["question_id"]: row for row in read_json(dataset)}
        assert len(rows) == config["questions"]
        for row in rows.values():
            rule_for(row, rules)
        if args.phase == "prepare":
            limit = args.limit if args.limit is not None else config["questions"]
            assert 1 <= limit <= config["questions"]
            owner, ids = sha(secrets.token_bytes(32)), sorted(rows)[:limit]
            lock = {"configSha256": digest(HERE / "config.json"), "datasetSha256": config["dataset"]["sha256"],
                    "files": files, "owner": owner, "ids": ids,
                    "inputs": adapter("prepare", root, ids=ids, owner=owner)}
            write_json(root / "lock.json", lock, exclusive=True)
            print(f"Prepared {len(ids)}/{config['questions']} questions.")
            return
        assert lock["configSha256"] == digest(HERE / "config.json") and lock["datasetSha256"] == config["dataset"]["sha256"]
        assert lock["files"] == files, "Runner or tokenizer changed; use a new run directory"
        assert 0 < len(lock["ids"]) <= config["questions"] and lock["ids"] == sorted(rows)[:len(lock["ids"])]
        if args.phase == "recall":
            adapter("recall", root, lock=lock, binding=binding, envFile=str(args.env_file.resolve()))
        else:
            credentials = adapter("environment", root, envFile=str(args.env_file.resolve())) if args.phase == "score" else {}
            score(root, args.phase, lock, binding, config, rows, rules, credentials)
    finally:
        running.rmdir()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["setup", "prepare", "recall", "score", "verify", "cleanup"])
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if args.limit is not None and args.phase != "prepare":
        parser.error("--limit is only accepted during prepare")
    if args.phase in {"recall", "score", "cleanup"} and args.env_file is None:
        parser.error("Pass --env-file explicitly for paid phases or cleanup")
    run(args)


if __name__ == "__main__":
    main()
