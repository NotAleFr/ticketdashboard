"""Build, run, or deploy the Worker using an isolated copy of the backend."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("build", "dev", "deploy"))
    parser.add_argument("--hyperdrive-id")
    parser.add_argument("--secrets-file", type=Path)
    parser.add_argument("--port", type=int, default=8788)
    args = parser.parse_args()

    if args.hyperdrive_id and not re.fullmatch(r"[0-9a-fA-F]{32}", args.hyperdrive_id):
        parser.error("--hyperdrive-id must be the 32-character ID from Cloudflare")
    if args.mode == "deploy" and (not args.hyperdrive_id or not args.secrets_file):
        parser.error("deploy requires --hyperdrive-id and --secrets-file")
    if args.secrets_file and not args.secrets_file.is_file():
        parser.error("--secrets-file must point to an existing file")

    project = Path(__file__).resolve().parent
    config = json.loads((project / "wrangler.jsonc").read_text(encoding="utf-8"))
    if args.hyperdrive_id:
        config["hyperdrive"][0]["id"] = args.hyperdrive_id

    uvx = shutil.which("uvx")
    npx = shutil.which("npx")
    if not uvx or not npx:
        parser.error("Install uv and Node.js, then reopen the terminal")

    with TemporaryDirectory(prefix="tickets-worker-") as directory:
        stage = Path(directory)
        for filename in ("pyproject.toml", "pylock.toml"):
            shutil.copyfile(project / filename, stage / filename)
        source = stage / "src"
        source.mkdir()
        shutil.copyfile(project / "worker.py", source / "worker.py")
        shutil.copytree(project.parent / "app", source / "app",
                        ignore=shutil.ignore_patterns("__pycache__"))
        (stage / "wrangler.jsonc").write_text(json.dumps(config), encoding="utf-8")

        result = subprocess.run(
            [uvx, "--with", "uv==0.13.9", "--from", "workers-py==1.17.9", "pywrangler", "sync"],
            cwd=stage,
        )
        if result.returncode:
            return result.returncode

        command = [npx, "--yes", "wrangler@4.166.0"]
        if args.mode == "dev":
            if args.secrets_file:
                shutil.copyfile(args.secrets_file, stage / ".dev.vars")
            command.extend(["dev", "--ip", "127.0.0.1", "--port", str(args.port)])
        elif args.mode == "deploy":
            command.extend(["deploy", "--secrets-file", str(args.secrets_file.resolve())])
        else:
            command.extend(["deploy", "--dry-run"])
        return subprocess.run(command, cwd=stage).returncode


if __name__ == "__main__":
    raise SystemExit(main())
