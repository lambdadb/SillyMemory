"""Set up and run the pinned BEAM protocol from a fresh clone."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
spec = importlib.util.spec_from_file_location("beam_protocol", REPO / "scripts/beam-past-protocol.py")
protocol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protocol)


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def setup(root, config, split):
    root.mkdir(parents=True, exist_ok=True)
    upstream = root / "upstream/past"
    if not upstream.exists():
        upstream.parent.mkdir(exist_ok=True)
        subprocess.run(["git", "clone", "--no-checkout", config["upstream"]["repository"], str(upstream)], check=True)
        subprocess.run(["git", "-C", str(upstream), "checkout", "--detach", protocol.PAST_REVISION], check=True)
    assert subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip() == protocol.PAST_REVISION
    for file in config["cohorts"][split]["files"]:
        target = root / file["name"]
        if not target.exists():
            temporary = target.with_suffix(".download")
            try:
                with urllib.request.urlopen(file["url"], timeout=120) as response, temporary.open("xb") as output:
                    shutil.copyfileobj(response, output, length=1024 * 1024)
                assert digest(temporary) == file["sha256"], f"Dataset checksum mismatch: {file['name']}"
                temporary.rename(target)
            finally:
                temporary.unlink(missing_ok=True)
        assert digest(target) == file["sha256"], f"Dataset checksum mismatch: {file['name']}"
    tokenizer = root / "tokenizer"
    tokenizer.mkdir(exist_ok=True)
    for name in ["package.json", "package-lock.json"]:
        source, target = HERE / "tokenizer" / name, tokenizer / name
        if target.exists():
            assert target.read_bytes() == source.read_bytes(), "Tokenizer lock differs"
        else:
            shutil.copyfile(source, target)
    subprocess.run(["npm", "ci", "--prefix", str(tokenizer), "--no-audit", "--no-fund"], check=True)
    print(f"Ready: {split}, {root}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["setup", "prepare", "recall", "score", "verify"])
    parser.add_argument("--split", required=True, choices=protocol.SPLITS)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--env-file", type=Path)
    args = parser.parse_args()
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
    command = [sys.executable, str(REPO / "scripts/beam-past-protocol.py"), args.phase,
               "--split", args.split, "--root", str(root)]
    if args.phase in ["recall", "score"]:
        assert args.env_file, "Pass --env-file explicitly for paid phases"
        command += ["--env-file", str(args.env_file.resolve())]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
