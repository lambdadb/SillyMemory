"""Set up and run the pinned BEAM protocol from a fresh clone."""
import argparse
from contextlib import contextmanager
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("beam_protocol", HERE / "protocol.py")
protocol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protocol)
DOWNLOAD_TIMEOUT_SECONDS = 900


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


@contextmanager
def download_deadline(seconds):
    def expired(_signum, _frame):
        raise TimeoutError("Dataset download exceeded its total time limit")
    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def download(root, file):
    assert type(file["bytes"]) is int and 0 < file["bytes"] <= 300_000_000
    target = root / file["name"]
    if not target.exists():
        with tempfile.TemporaryDirectory(prefix=".download-", dir=root) as directory:
            temporary = Path(directory) / "payload"
            with download_deadline(DOWNLOAD_TIMEOUT_SECONDS), urllib.request.urlopen(file["url"], timeout=120) as response, temporary.open("xb") as output:
                received = 0
                while chunk := response.read(1024 * 1024):
                    received += len(chunk)
                    assert received <= file["bytes"], f"Dataset exceeds locked byte count: {file['name']}"
                    output.write(chunk)
            assert received == file["bytes"], f"Dataset size mismatch: {file['name']}"
            assert digest(temporary) == file["sha256"], f"Dataset checksum mismatch: {file['name']}"
            temporary.rename(target)
    assert target.stat().st_size == file["bytes"], f"Dataset size mismatch: {file['name']}"
    assert digest(target) == file["sha256"], f"Dataset checksum mismatch: {file['name']}"


def setup(root, config, split):
    root.mkdir(parents=True, exist_ok=True)
    upstream = root / "upstream/past"
    if not upstream.exists():
        upstream.parent.mkdir(exist_ok=True)
        subprocess.run(["git", "clone", "--no-checkout", config["upstream"]["repository"], str(upstream)], check=True)
        subprocess.run(["git", "-C", str(upstream), "checkout", "--detach", protocol.PAST_REVISION], check=True)
    assert subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip() == protocol.PAST_REVISION
    for file in config["cohorts"][split]["files"]:
        download(root, file)
    tokenizer = root / "tokenizer"
    tokenizer.mkdir(exist_ok=True)
    for name in ["package.json", "package-lock.json"]:
        source, target = HERE.parent / "tokenizer" / name, tokenizer / name
        if target.exists():
            assert target.read_bytes() == source.read_bytes(), "Tokenizer lock differs"
        else:
            shutil.copyfile(source, target)
    subprocess.run(["npm", "ci", "--prefix", str(tokenizer), "--no-audit", "--no-fund"], check=True)
    print(f"Ready: {split}, {root}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["setup", "prepare", "recall", "score", "verify", "cleanup"])
    parser.add_argument("--split", required=True, choices=protocol.SPLITS)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--env-file", type=Path)
    args = parser.parse_args()
    if args.phase == "cleanup":
        assert args.env_file, "Pass --env-file explicitly for cleanup"
        subprocess.run(["node", str(HERE / "adapter.mjs"), "--cleanup", str(args.root.resolve() / "memory"),
                        str(args.env_file.resolve())], check=True)
        return
    config = json.loads((HERE / "config.json").read_text())
    assert config["upstream"]["revision"] == protocol.PAST_REVISION
    assert config["generation"]["model"] == protocol.MODEL
    for split, cohort in config["cohorts"].items():
        assert {file["name"]: file["sha256"] for file in cohort["files"]} == protocol.parquet_files(split)
        assert cohort["questions"] == protocol.SPLITS[split]["questions"]
    root = args.root.resolve()
    if args.phase == "setup":
        setup(root, config, args.split)
        return
    command = [sys.executable, str(HERE / "protocol.py"), args.phase,
               "--split", args.split, "--root", str(root)]
    if args.phase in ["recall", "score"]:
        assert args.env_file, "Pass --env-file explicitly for paid phases"
        command += ["--env-file", str(args.env_file.resolve())]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
