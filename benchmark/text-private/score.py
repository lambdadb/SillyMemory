"""Generate and Jev-judge answers for frozen text-private arm requests.

Reuses the LongMemEval runner's receipts, judge request and verdict functions so
every arm uses the historical protocol. Stops before a call once the modeled spend
(this run's ledger plus --prior-usd) would exceed --cap-usd.

  python3.14 score.py --arm B --requests requests-B.json --dataset FILE --out DIR \
      --env-file FILE --prior-usd 1.0 --cap-usd 100
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "longmemeval"))
import run as lme  # noqa: E402

# Frozen rate card (USD per million tokens), recorded in docs/longmemeval-public-evaluation.md.
GEN = {"input": 2.0, "cached": 0.10, "cache_write": 2.50, "output": 10.0}
JUDGE_INPUT = 0.042


def generation_usd(usage):
    details = usage.get("prompt_tokens_details") or {}
    cached, written = details.get("cached_tokens", 0), details.get("cache_write_tokens", 0)
    ordinary = usage["prompt_tokens"] - cached - written
    return (ordinary * GEN["input"] + cached * GEN["cached"] + written * GEN["cache_write"]
            + usage["completion_tokens"] * GEN["output"]) / 1e6


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("arm", "requests", "dataset", "out", "env-file"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--prior-usd", type=float, default=0.0)
    parser.add_argument("--cap-usd", type=float, default=100.0)
    parser.add_argument("--shard", default="0/1", help="i/n: score ids at sorted index %% n == i; rerun 0/1 afterwards to summarize from receipts")
    args = parser.parse_args()
    config = lme.read_json(lme.HERE / "config.json")
    assert lme.digest(lme.HERE / "judge-rules.json") == config["rulesSha256"]
    rules = lme.read_json(lme.HERE / "judge-rules.json")
    assert lme.digest(Path(args.dataset)) == config["dataset"]["sha256"]
    rows = {row["question_id"]: row for row in lme.read_json(Path(args.dataset))}
    requests = lme.read_json(Path(args.requests))
    assert sorted(requests) == sorted(rows), "Requests must cover the full cohort"
    root = Path(args.out) / f"score-{args.arm}"
    root.mkdir(parents=True, exist_ok=True)
    binding = hashlib.sha256(Path(args.requests).read_bytes()).hexdigest()
    credentials = lme.adapter("environment", root, envFile=str(Path(args.env_file).resolve()))
    assert credentials.get("LLM_BASE_URL") == "https://api.openai.com/v1"
    receipts = lme.Receipts(root, "score", binding, config, credentials)
    spent, scores, usage = 0.0, [], {"generationUsd": 0.0, "judgeUsd": 0.0, "inputTokens": 0, "outputTokens": 0,
                                     "cachedTokens": 0, "cacheWriteTokens": 0, "judgeInputTokens": 0}
    # Worst case per question: ~6k input at the cache-write rate, 4,096 output tokens, ~1k judge tokens.
    worst = (6000 * GEN["cache_write"] + 4096 * GEN["output"] + 1000 * JUDGE_INPUT) / 1e6
    shard, shards = map(int, args.shard.split("/"))
    for n, id in enumerate(sorted(rows)):
        if n % shards != shard:
            continue
        row = rows[id]
        assert args.prior_usd + spent + worst <= args.cap_usd, f"Spend cap would be exceeded at {id}"
        answer = receipts.get("answer", id, requests[id])
        assert answer["model"] == config["generator"]["model"] and answer["choices"][0]["finish_reason"] == "stop"
        text = answer["choices"][0]["message"]["content"]
        assert isinstance(text, str) and text.strip()
        u = answer["usage"]
        cost = generation_usd(u)
        details = u.get("prompt_tokens_details") or {}
        usage["generationUsd"] += cost; usage["inputTokens"] += u["prompt_tokens"]; usage["outputTokens"] += u["completion_tokens"]
        usage["cachedTokens"] += details.get("cached_tokens", 0); usage["cacheWriteTokens"] += details.get("cache_write_tokens", 0)
        judgment = receipts.get("judge", id, lme.judge_request(row, text, lme.rule_for(row, rules), config))
        jcost = judgment["usage"]["input_tokens"] * JUDGE_INPUT / 1e6
        usage["judgeUsd"] += jcost; usage["judgeInputTokens"] += judgment["usage"]["input_tokens"]
        spent += cost + jcost
        scores.append({"id": id, "type": row["question_type"], **lme.verdict(judgment, config)})
    correct = sum(s["correct"] for s in scores)
    summary = {"arm": args.arm, "questions": len(scores), "correct": correct, "accuracy": correct / len(scores),
               "requestsSha256": binding, "generator": config["generator"], "judge": config["judge"], "usage": usage,
               "modeledUsd": spent}
    if shards > 1:
        print(json.dumps({"shard": args.shard, "spentUsd": spent}))
        return
    lme.write_json(root / "scores.json", scores)
    lme.write_json(root / "summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
