"""Bounded 100K comparison using Past's pinned loader, prompts and scoring.

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
MODEL = "gpt-5.6-luna"
REPO = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
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


def protocol_settings():
    return {"pastRevision": PAST_REVISION, "datasetRevision": DATA_REVISION,
            "parquetSha256": PARQUET_SHA256,
            "scope": "20 conversations / 400 questions; one answer per question, no tuning or repeats",
            "model": MODEL, "reasoningEffort": "none", "transport": "direct OpenAI Chat Completions",
            "recall": {"limit": 100, "maxTokens": 8000,
                       "evidenceAccounting": "sum ceil((content code points + source-excerpt code points)/4) per result; metadata excluded",
                       "serializedTokenDiagnostic": "cl100k_base / tiktoken JS 1.0.22"},
            "bounds": {"wallHours": 8, "modelAttempts": 10000, "modeledModelUSD": 25,
                       "memoryOperations": 10000},
            "question": "How does SillyMemory score under Past's annotation-assisted public evaluation protocol?",
            "decision": "Report the frozen full-cohort comparison; no runtime/default promotion or optimization in this run.",
            "differences": ["SillyMemory source chunks, storage, retrieval and context serialization",
                            "OpenAI direct transport instead of OpenRouter; equivalent native request parameters",
                            "Batch dates retain their source precision; no synthetic send-time labels"]}


def source_file_hashes(root):
    files = {str(path.relative_to(REPO)): sha(path.read_bytes()) for path in [
        Path(__file__), REPO / "scripts/beam-past-memory.mjs", REPO / "src/client.js",
        REPO / "src/chunking.js", REPO / "vendor/lambdadb.js",
    ]}
    # Run-local identities must survive an external --root or bundle relocation.
    run_files = ["memory-input.json", "100k.parquet", "dataset-cache/100k.json", "dataset-cache/100k.revision"]
    run_files += [f"tokenizer/node_modules/tiktoken/{name}" for name in
                  ["package.json", "tiktoken.cjs", "tiktoken_bg.cjs", "tiktoken_bg.wasm"]]
    files.update({f"run/{name}": sha((root / name).read_bytes()) for name in run_files})
    return files


def prepare(root, dataset, upstream_files):
    assert not (root / "protocol-lock.json").exists(), "Do not overwrite an existing frozen run"
    import pyarrow.parquet as parquet
    assert sha((root / "100k.parquet").read_bytes()) == PARQUET_SHA256
    rows = parquet.read_table(root / "100k.parquet").to_pylist()
    conversations = [dataset.build_conversation(row) for row in rows]
    assert len(conversations) == 20 and sum(len(c.questions) for c in conversations) == 400
    cache = root / "dataset-cache"
    cache.mkdir(exist_ok=True)
    save(cache / "100k.json", rows)
    (cache / "100k.revision").write_text(DATA_REVISION)
    # The backend gets source input and literal questions, never categories,
    # rubrics, reference answers, or evaluation source annotations.
    memory_input = {"conversations": [{
        "id": c.id, "title": c.title, "userIdentity": c.user_identity, "userTraits": c.user_traits,
        "messages": [{"sourceId": m.message_id, "ordinal": m.ordinal, "content": m.content,
                      "author": {"role": m.role, "name": m.author}, "timestamp": dataset.utc_iso(m.timestamp),
                      "timeMicros": micros(m.timestamp), "turnId": m.turn_id} for m in c.messages],
        "questions": [{"id": q.id, "text": q.text, "asOf": q.as_of,
                       "asOfMicros": micros(datetime.fromisoformat(q.as_of))} for q in c.questions],
    } for c in conversations]}
    input_path = root / "memory-input.json"
    save(input_path, memory_input)
    lock = {**protocol_settings(), "upstreamFiles": upstream_files, "files": source_file_hashes(root)}
    save(root / "protocol-lock.json", lock)
    import verify
    problems = verify.verify_run(root / "upstream/past/beam/results/100k")
    assert not problems, problems
    save(root / "preflight.json", {"passed": True, "publishedScoreRecomputed": 0.9208214285714286,
                                   "conversations": len(conversations), "questions": 400})
    print("PREPARED: pinned full 100K cohort, public score arithmetic verified")


def environment(path):
    # Use Node's existing .env parser without copying credentials into the bundle.
    source = "import{readFileSync}from'node:fs';import{parseEnv}from'node:util';process.stdout.write(JSON.stringify(parseEnv(readFileSync(process.argv[1],'utf8'))))"
    values = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source, str(path)]))
    return {**values, **os.environ}


def check_lock(root, upstream_files):
    lock = json.loads((root / "protocol-lock.json").read_text())
    expected = {**protocol_settings(), "upstreamFiles": upstream_files, "files": source_file_hashes(root)}
    assert lock == expected, "Frozen protocol settings or required source files changed"
    return lock


def check_recall_files(root, files, conversation_ids):
    expected = {f"recall/recall-{identity}.json" for identity in conversation_ids}
    assert set(files) == expected, "Recall manifest must cover exactly the pinned conversations"
    for name in expected:
        assert sha((root / name).read_bytes()) == files[name], f"Recall file changed: {name}"


async def score(root, dataset, env, lock):
    import httpx
    import llm
    import run
    import scoring
    import verify
    rows, revision = dataset.load_rows("100k")
    conversations = [dataset.build_conversation(row) for row in rows]
    memory_state = json.loads((root / "memory/memory-state.json").read_text())
    assert memory_state["status"] == "completed" and len(memory_state["completed"]) == 20
    assert memory_state["inputSha256"] == sha((root / "memory-input.json").read_bytes())
    assert all(item.get("absent404") for item in memory_state["owned"])
    recall_lock = json.loads((root / "recall/lock.json").read_text())
    assert recall_lock["inputSha256"] == memory_state["inputSha256"]
    assert recall_lock["memoryStateSha256"] == sha((root / "memory/memory-state.json").read_bytes())
    assert recall_lock["packingSourceSha256"] == sha((REPO / "scripts/beam-past-memory.mjs").read_bytes())
    check_recall_files(root, recall_lock["files"], [c.id for c in conversations])
    output = root / "scored"
    output.mkdir()  # Never silently replay successful answers or partial scoring.
    calls = output / "calls"
    calls.mkdir()
    recalls = {r["questionId"]: r for c in conversations
               for r in json.loads((root / f"recall/recall-{c.id}.json").read_text())}
    question_id = contextvars.ContextVar("questionId")
    attempts = 0
    reserved_usd = 0.0
    started = time.monotonic()
    http = httpx.AsyncClient(base_url="https://api.openai.com/v1", timeout=90,
                             headers={"Authorization": f"Bearer {env['LLM_API_KEY']}"})

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
        save(calls / f"{number:05d}.json", entry)
        call_started = time.monotonic()
        try:
            response = await http.post("/chat/completions", json=native)
            entry.update(status=response.status_code, elapsedMs=(time.monotonic() - call_started) * 1000)
            data = model_reply(response, llm.ModelError)
            entry["response"] = data
            usage = data["usage"]
            # Gross upper-rate estimate, separate from actual cached-token billing.
            estimate = (usage["prompt_tokens"] * 0.5 + usage["completion_tokens"] * 1.8) / 1e6
            reserved_usd += estimate - reservation
            return data
        finally:
            entry["finishedAt"] = datetime.now(timezone.utc).isoformat()
            save(calls / f"{number:05d}.json", entry)

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
    summary = {"dataset": "BEAM", "split": "100k", "datasetRevision": revision, "conversations": 20,
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
    args = parser.parse_args()
    root = args.root.resolve()
    dataset, upstream_files = load_upstream(root)
    if args.phase == "prepare":
        prepare(root, dataset, upstream_files)
        return
    lock = check_lock(root, upstream_files)
    if args.phase == "verify":
        import verify
        problems = verify.verify_run(root / "scored")
        assert not problems, problems
        print("VERIFIED: all 400 questions and saved score arithmetic")
        return
    if args.phase == "repack":
        subprocess.run(["node", str(REPO / "scripts/beam-past-memory.mjs"), str(root / "memory-input.json"),
                        str(root / "memory"), "unused", str(root / "tokenizer/package.json"), "--repack"], check=True)
        return
    assert args.env_file, "Pass the existing credential file explicitly"
    env = environment(args.env_file)
    assert env.get("LLM_API_KEY"), "OpenAI key missing"
    if args.phase == "recall":
        subprocess.run(["node", str(REPO / "scripts/beam-past-memory.mjs"), str(root / "memory-input.json"),
                        str(root / "memory"), str(args.env_file.resolve()), str(root / "tokenizer/package.json")], check=True)
        subprocess.run(["node", str(REPO / "scripts/beam-past-memory.mjs"), str(root / "memory-input.json"),
                        str(root / "memory"), "unused", str(root / "tokenizer/package.json"), "--repack"], check=True)
    else:
        asyncio.run(score(root, dataset, env, lock))


if __name__ == "__main__":
    main()
