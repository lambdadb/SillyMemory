"""Bounded BEAM length comparison using Past's pinned loader, prompts and scoring.

Third-party code stays in the ignored source bundle, with its original notices.
Only the memory backend and the explicitly approved direct OpenAI transport differ.
"""
import argparse
import asyncio
import contextvars
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

PAST_REVISION = "1faac1e70fa50d92d966904358be98bb1beca0c8"
DATA_REVISION = "3205395e897e7318c7b094ef4e6047b9b82dbb03"
PARQUET_SHA256 = "c0519be25907005ba873c927c50877471d550873039d96c041554d0075a78ace"
SPLITS = {
    "100k": {"parquetSha256": PARQUET_SHA256, "conversations": 20, "questions": 400, "memoryOperations": 10000},
    "500k": {"parquetSha256": "af05921c979355038e1761b7cde3d2dd713200dd3071b278de0200f6c7f30122",
             "conversations": 35, "questions": 700, "memoryOperations": 20000},
    "1m": {"parquetSha256": "41b5acbbb55a586b1305514ef9d9fb03365d9b3331b598a1c2dd7603d93ef533",
           "conversations": 35, "questions": 700, "memoryOperations": 20000},
    "10m": {"datasetRevision": "9b2096193fe74e2837e4713e483351e19817773c",
            "parquetShards": {
                "10m-00000-of-00002.parquet": "31d96fd47ec56221d202e68792f26c00e49467dd4b36ee105c36ebd19ef78ad5",
                "10m-00001-of-00002.parquet": "a4f13fe25af51d57405ae41008689c31d1421377f3efde56a024b441deb2ee65",
            }, "conversations": 10, "questions": 200, "memoryOperations": 50000},
}
MODEL = "gpt-5.6-luna"
REPO = Path(__file__).resolve().parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value, *, compact=False, clean=lambda text: text):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(clean(json.dumps(value, ensure_ascii=False, indent=None if compact else 2,
                                          separators=(",", ":") if compact else None) + "\n"))
    temporary.replace(path)


def load_upstream(root):
    checkout = root / "upstream/past"
    revision = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
    assert revision == PAST_REVISION, "Unexpected Past source revision"
    files = {}
    for path in sorted((checkout / "beam").glob("*.py")):
        original = subprocess.check_output(["git", "-C", str(checkout), "show", f"HEAD:beam/{path.name}"])
        assert path.read_bytes() == original, f"Modified upstream module: {path.name}"
        files[f"beam/{path.name}"] = sha(original)
    os.environ["BEAM_OPEN_CACHE"] = str(root / "dataset-cache")
    sys.path.insert(0, str(checkout / "beam"))
    import dataset
    return dataset, files


def micros(moment):
    delta = moment - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds


def model_reply(response, error_type):
    # Account refusals must stop the run even when a gateway returns HTML.
    # Preserve upstream status classification before attempting JSON decoding.
    if response.is_error:
        raise error_type(f"OpenAI returned HTTP {response.status_code}",
                         retryable=response.status_code == 429 or response.status_code >= 500,
                         status=response.status_code)
    data = response.json()
    if not isinstance(data, dict):
        raise error_type("OpenAI returned a non-object response", retryable=True)
    if data.get("error"):
        raise error_type("OpenAI returned an error object", retryable=False)
    if not isinstance(data.get("choices"), list) or not data["choices"]:
        raise error_type("OpenAI returned no choices", retryable=False)
    return data


def protocol_settings(split="100k"):
    cohort = SPLITS[split]
    parquet_lock = ({"parquetShards": cohort["parquetShards"]} if "parquetShards" in cohort
                    else {"parquetSha256": cohort["parquetSha256"]})
    return {"pastRevision": PAST_REVISION, "datasetRevision": cohort.get("datasetRevision", DATA_REVISION),
            "split": split, **parquet_lock,
            "scope": f"{cohort['conversations']} conversations / {cohort['questions']} questions; one answer per question, no tuning or repeats",
            "model": MODEL, "reasoningEffort": "none", "transport": "direct OpenAI Chat Completions",
            "recall": {"limit": 100, "maxTokens": 8000,
                       "evidenceAccounting": "sum ceil((content code points + source-excerpt code points)/4) per result; metadata excluded",
                       "serializedTokenDiagnostic": "cl100k_base / tiktoken JS 1.0.22"},
            "bounds": {"wallHours": 8, "modelAttempts": 10000, "modeledModelUSD": 25,
                       "memoryOperations": cohort["memoryOperations"], "memoryCleanupReserve": 51},
            "question": "How does SillyMemory score as history length grows under Past's annotation-assisted public evaluation protocol?",
            "decision": "Report the frozen full-cohort comparison; no runtime/default promotion or optimization in this run.",
            "differences": ["SillyMemory source chunks, storage, retrieval and context serialization",
                            "OpenAI direct transport instead of OpenRouter; equivalent native request parameters",
                            "Batch dates retain their source precision; no synthetic send-time labels"]}


def parquet_files(split):
    cohort = SPLITS[split]
    return cohort.get("parquetShards", {f"{split}.parquet": cohort.get("parquetSha256")})


def read_parquet_rows(root, split):
    import pyarrow.parquet as parquet
    rows = []
    # Verify every shard before parsing any of them; retain pinned shard order.
    for name, digest in parquet_files(split).items():
        assert sha((root / name).read_bytes()) == digest, f"Parquet checksum differs: {name}"
    for name in parquet_files(split):
        rows.extend(parquet.read_table(root / name).to_pylist())
    return rows


def source_file_hashes(root, split="100k"):
    files = {str(path.relative_to(REPO)): sha(path.read_bytes()) for path in [
        Path(__file__), REPO / "benchmark/beam/run.py", REPO / "benchmark/beam/adapter.mjs",
        REPO / "benchmark/shared/memory-budget.mjs", REPO / "src/client.js",
        REPO / "src/chunking.js", REPO / "vendor/lambdadb.js",
    ]}
    # Run-local identities must survive an external --root or bundle relocation.
    run_files = ["memory-input.json", *parquet_files(split), f"dataset-cache/{split}.json", f"dataset-cache/{split}.revision"]
    run_files += [f"tokenizer/node_modules/tiktoken/{name}" for name in
                  ["package.json", "tiktoken.cjs", "tiktoken_bg.cjs", "tiktoken_bg.wasm"]]
    files.update({f"run/{name}": sha((root / name).read_bytes()) for name in run_files})
    return files


def prepare(root, dataset, upstream_files, split="100k"):
    assert not (root / "protocol-lock.json").exists(), "Do not overwrite an existing frozen run"
    cohort = SPLITS[split]
    rows = read_parquet_rows(root, split)
    conversations = [dataset.build_conversation(row) for row in rows]
    assert len(conversations) == cohort["conversations"] and sum(len(c.questions) for c in conversations) == cohort["questions"]
    cache = root / "dataset-cache"
    cache.mkdir(exist_ok=True)
    save(cache / f"{split}.json", rows)
    revision = cohort.get("datasetRevision", DATA_REVISION)
    (cache / f"{split}.revision").write_text(revision)
    # The backend gets source input and literal questions, never categories,
    # rubrics, reference answers, or evaluation source annotations.
    memory_input = {"split": split, "conversations": [{
        "id": c.id, "title": c.title, "userIdentity": c.user_identity, "userTraits": c.user_traits,
        "messages": [{"sourceId": m.message_id, "ordinal": m.ordinal, "content": m.content,
                      "author": {"role": m.role, "name": m.author}, "timestamp": dataset.utc_iso(m.timestamp),
                      "timeMicros": micros(m.timestamp), "turnId": m.turn_id} for m in c.messages],
        "questions": [{"id": q.id, "text": q.text, "asOf": q.as_of,
                       "asOfMicros": micros(datetime.fromisoformat(q.as_of))} for q in c.questions],
    } for c in conversations]}
    input_path = root / "memory-input.json"
    # The pretty 10M input exceeds V8's single-string limit. Compact only the
    # JSON envelope; preserve every source string and the complete cohort.
    save(input_path, memory_input, compact=split == "10m")
    lock = {**protocol_settings(split), "upstreamFiles": upstream_files, "files": source_file_hashes(root, split)}
    save(root / "protocol-lock.json", lock)
    import verify
    problems = verify.verify_run(root / f"upstream/past/beam/results/{split}")
    assert not problems, problems
    published = json.loads((root / f"upstream/past/beam/results/{split}/summary.json").read_text())
    assert published["datasetRevision"] == revision
    assert published["conversations"] == cohort["conversations"] and published["questions"] == cohort["questions"]
    save(root / "preflight.json", {"passed": True, "publishedScoreRecomputed": published["microAverage"],
                                   "split": split, "conversations": len(conversations), "questions": cohort["questions"]})
    print(f"PREPARED: pinned full {split.upper()} cohort, public score arithmetic verified")


def environment(path):
    # Use Node's existing .env parser without copying credentials into the bundle.
    source = "import{readFileSync}from'node:fs';import{parseEnv}from'node:util';process.stdout.write(JSON.stringify(parseEnv(readFileSync(process.argv[1],'utf8'))))"
    values = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source, str(path)]))
    return {**values, **os.environ}


def check_lock(root, upstream_files, split="100k"):
    lock = json.loads((root / "protocol-lock.json").read_text())
    expected = {**protocol_settings(split), "upstreamFiles": upstream_files, "files": source_file_hashes(root, split)}
    assert lock == expected, "Frozen protocol settings or required source files changed"
    return lock


def check_recall_files(root, files, conversation_ids):
    expected = {f"recall/recall-{identity}.json" for identity in conversation_ids}
    assert set(files) == expected, "Recall manifest must cover exactly the pinned conversations"
    for name in expected:
        assert sha((root / name).read_bytes()) == files[name], f"Recall file changed: {name}"


def load_verified_recalls(root, files):
    recalls = {}
    for name, expected in files.items():
        data = (root / name).read_bytes()
        assert sha(data) == expected, f"Recall differs from reconstructed source: {name}"
        recalls.update({row["questionId"]: row for row in json.loads(data)})
    return recalls


def validated_recalls(root, conversation_ids):
    memory_state = json.loads((root / "memory/memory-state.json").read_text())
    assert memory_state["status"] == "completed" and set(memory_state["completed"]) == set(conversation_ids) and len(memory_state["completed"]) == len(conversation_ids)
    assert memory_state["inputSha256"] == sha((root / "memory-input.json").read_bytes())
    assert all(item.get("absent404") for item in memory_state["owned"])
    recall_lock = json.loads((root / "recall/lock.json").read_text())
    assert recall_lock["inputSha256"] == memory_state["inputSha256"]
    assert recall_lock["memoryStateSha256"] == sha((root / "memory/memory-state.json").read_bytes())
    assert recall_lock["packingSourceSha256"] == sha((REPO / "benchmark/beam/adapter.mjs").read_bytes())
    check_recall_files(root, recall_lock["files"], conversation_ids)
    # A mutable recall file and its digest must not authorize changed evidence.
    # Rebuild from saved retrieval receipts and source before any model side effect.
    verified = subprocess.run(["node", str(REPO / "benchmark/beam/adapter.mjs"), str(root / "memory-input.json"),
                               str(root / "memory"), "unused", str(root / "tokenizer/package.json"),
                               "--verify-recall"], check=True, capture_output=True, text=True)
    canonical = json.loads(verified.stdout)
    assert canonical == recall_lock, "Recall manifest differs from reconstructed source"
    # Hash and parse the same bytes against the independently reconstructed map.
    return load_verified_recalls(root, canonical["files"])


def verify_saved_run(root, dataset, split="100k"):
    rows, _ = dataset.load_rows(split)
    recalls = validated_recalls(root, [dataset.build_conversation(row).id for row in rows])
    import verify
    problems = verify.verify_run(root / "scored")
    assert not problems, problems
    for row in (json.loads(line) for line in (root / "scored/results.jsonl").read_text().splitlines() if line.strip()):
        if not row.get("error"):
            assert row["recall"] == recalls[row["questionId"]]["context"], "Scored context differs from reconstructed source"


async def score(root, dataset, env, lock):
    import httpx
    import llm
    import run
    import scoring
    import verify
    rows, revision = dataset.load_rows(lock["split"])
    conversations = [dataset.build_conversation(row) for row in rows]
    recalls = validated_recalls(root, [c.id for c in conversations])
    output = root / "scored"
    output.mkdir()  # Never silently replay successful answers or partial scoring.
    calls = output / "calls"
    calls.mkdir()
    question_id = contextvars.ContextVar("questionId")
    attempts = 0
    reserved_usd = 0.0
    started = time.monotonic()
    http = httpx.AsyncClient(base_url="https://api.openai.com/v1", timeout=90,
                             headers={"Authorization": f"Bearer {env['LLM_API_KEY']}"})
    secrets = [value for key, value in env.items()
               if any(word in key.upper() for word in ("KEY", "TOKEN", "SECRET", "PASSWORD")) and len(value) >= 8]

    def clean(text):
        for secret in secrets:
            text = text.replace(secret, "[redacted]")
        return text

    class BoundReached(BaseException):
        pass

    async def post_once(payload):
        nonlocal attempts, reserved_usd
        native = {key: value for key, value in payload.items() if key not in ("reasoning", "provider", "usage")}
        native.update(model=MODEL, reasoning_effort="none")
        # Reserve the documented 128K maximum output and a byte-count upper
        # proxy for input, using premium/cache-write rates without changing caps.
        reservation = (128000 * 1.8 + (len(json.dumps(native).encode()) + 1024) * 0.5) / 1e6
        if attempts >= 10000 or time.monotonic() - started > 8 * 3600 or reserved_usd + reservation > 25:
            raise BoundReached("Frozen model resource bound reached; no additional calls")
        number = attempts
        attempts += 1
        reserved_usd += reservation
        entry = {"number": number, "questionId": question_id.get(), "request": native,
                 "startedAt": datetime.now(timezone.utc).isoformat()}
        save(calls / f"{number:05d}.json", entry, clean=clean)
        call_started = time.monotonic()
        try:
            response = await http.post("/chat/completions", json=native)
            entry.update(status=response.status_code, elapsedMs=(time.monotonic() - call_started) * 1000)
            entry["rawResponse"] = clean(response.text)
            save(calls / f"{number:05d}.json", entry, clean=clean)
            data = model_reply(response, llm.ModelError)
            entry["response"] = data
            usage = data["usage"]
            # Gross upper-rate estimate, separate from actual cached-token billing.
            estimate = (usage["prompt_tokens"] * 0.5 + usage["completion_tokens"] * 1.8) / 1e6
            reserved_usd += estimate - reservation
            return data
        finally:
            entry["finishedAt"] = datetime.now(timezone.utc).isoformat()
            save(calls / f"{number:05d}.json", entry, clean=clean)

    llm._post_once = post_once
    # Keep llm's four-attempt transport retries, text/JSON parsers and upstream
    # answer_question/scoring untouched. Only the native transport is replaced.
    semaphore = asyncio.Semaphore(4)

    class Memory:
        async def recall(self, text, as_of, *, identity):
            recall = recalls[question_id.get()]
            assert recall["context"]["asOf"] == as_of
            return recall["context"]

    async def answer(conversation, question):
        token = question_id.set(question.id)
        try:
            row = await run.answer_question(Memory(), conversation, question, asyncio.Semaphore(1))
            with (output / "results.jsonl").open("a") as file:
                file.write(json.dumps(row, ensure_ascii=False) + "\n")
            return row
        finally:
            question_id.reset(token)

    async def conversation_job(conversation):
        async with semaphore:
            return await asyncio.gather(*(answer(conversation, question) for question in conversation.questions))

    try:
        scored = [row for group in await asyncio.gather(*(conversation_job(c) for c in conversations)) for row in group]
    finally:
        await http.aclose()
    summary = {"dataset": "BEAM", "split": lock["split"], "datasetRevision": revision, "conversations": len(conversations),
               **scoring.summarize(scored), "answerModel": MODEL, "judgeModel": MODEL,
               "reasoningEffort": "none", "transport": "direct OpenAI", "recall": lock["recall"],
               "protocolLockSha256": sha((root / "protocol-lock.json").read_bytes()),
               "modelAttempts": attempts, "grossUpperRateModelUSD": reserved_usd}
    save(output / "summary.json", summary)
    problems = verify.verify_run(output)
    assert not problems, problems
    print(json.dumps(summary, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["prepare", "recall", "repack", "score", "verify"])
    parser.add_argument("--root", type=Path, default=REPO / "artifacts/beam-past-100k-v1")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--split", choices=SPLITS, default="100k")
    args = parser.parse_args()
    root = args.root.resolve()
    dataset, upstream_files = load_upstream(root)
    if args.phase == "prepare":
        prepare(root, dataset, upstream_files, args.split)
        return
    lock = check_lock(root, upstream_files, args.split)
    if args.phase == "verify":
        verify_saved_run(root, dataset, args.split)
        print(f"VERIFIED: all {SPLITS[args.split]['questions']} source-derived recalls, linked answer contexts and saved score arithmetic")
        return
    if args.phase == "repack":
        subprocess.run(["node", str(REPO / "benchmark/beam/adapter.mjs"), str(root / "memory-input.json"),
                        str(root / "memory"), "unused", str(root / "tokenizer/package.json"), "--repack"], check=True)
        return
    assert args.env_file, "Pass the existing credential file explicitly"
    env = environment(args.env_file)
    assert env.get("LLM_API_KEY"), "OpenAI key missing"
    if args.phase == "recall":
        subprocess.run(["node", str(REPO / "benchmark/beam/adapter.mjs"), str(root / "memory-input.json"),
                        str(root / "memory"), str(args.env_file.resolve()), str(root / "tokenizer/package.json")], check=True)
        subprocess.run(["node", str(REPO / "benchmark/beam/adapter.mjs"), str(root / "memory-input.json"),
                        str(root / "memory"), "unused", str(root / "tokenizer/package.json"), "--repack"], check=True)
    else:
        asyncio.run(score(root, dataset, env, lock))


if __name__ == "__main__":
    main()
