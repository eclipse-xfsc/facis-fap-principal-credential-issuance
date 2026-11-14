#!/usr/bin/env python3
# Copyright (c) 2026 LEANEA GmbH and others.
#
# SPDX-License-Identifier: Apache-2.0
#
# Prepare the pinned official BDD source with the tracked Requests patch.

import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = "https://github.com/eclipse-xfsc/bdd-executor"
COMMIT = "478909cdd735bbab8bb63ce955183713d6bb387b"
REQUIREMENT = f"git+{UPSTREAM}@{COMMIT}"
PATCH = ROOT / "security/patches/bdd-executor-requests.patch"


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()

    if output.exists():
        raise SystemExit("STOP: Output already exists; preserve it.")
    if not PATCH.is_file():
        raise SystemExit("STOP: Tracked BDD patch is missing.")

    requirements = (ROOT / "test/bdd/requirements.txt").read_text()
    lines = requirements.splitlines(keepends=True)
    matches = [
        i for i, line in enumerate(lines)
        if line.strip() == REQUIREMENT
    ]
    if len(matches) != 1:
        raise SystemExit("STOP: Official BDD source pin differs.")

    output.parent.mkdir(parents=True, exist_ok=True)
    workspace = Path(tempfile.mkdtemp(
        prefix="bdd-official-", dir=output.parent
    ))
    source = workspace / "source"

    run("git", "clone", "--quiet", "--no-checkout",
        UPSTREAM + ".git", str(source))
    run("git", "-C", str(source), "checkout", "--quiet",
        "--detach", COMMIT)

    if run("git", "-C", str(source), "rev-parse", "HEAD") != COMMIT:
        raise SystemExit("STOP: Official checkout SHA mismatch.")

    expected = {}
    for name in ("setup.cfg", "requirements-dev.txt"):
        original = (source / name).read_bytes()
        content = original.splitlines(keepends=True)
        pins = [
            i for i, line in enumerate(content)
            if line.strip() == b"requests==2.31.0"
        ]
        if len(pins) != 1:
            raise SystemExit(f"STOP: Unexpected upstream pin in {name}.")
        index = pins[0]
        content[index] = content[index].replace(
            b"requests==2.31.0", b"requests==2.33.0", 1
        )
        expected[name] = b"".join(content)

    run("git", "-C", str(source), "apply", "--unidiff-zero", "--check", str(PATCH))
    run("git", "-C", str(source), "apply", "--unidiff-zero", str(PATCH))

    changed = set(run(
        "git", "-C", str(source), "diff", "--name-only"
    ).splitlines())
    if changed != set(expected):
        raise SystemExit("STOP: Patch changed unexpected files.")

    for name, content in expected.items():
        if (source / name).read_bytes() != content:
            raise SystemExit(f"STOP: Unexpected patched content in {name}.")

    run("git", "-C", str(source), "diff", "--check")

    lines[matches[0]] = (
        f"eu-xfsc-bdd @ {source.as_uri()}\n"
    )
    output.write_text("".join(lines))

    provenance = {
        "upstream": UPSTREAM,
        "commit": COMMIT,
        "patch": str(PATCH.relative_to(ROOT)),
        "patchSha256": hashlib.sha256(PATCH.read_bytes()).hexdigest(),
        "changedFiles": sorted(changed),
        "requests": "2.33.0",
        "preparedSource": str(source),
        "sourceReview": "Required separately from the package audit",
    }
    output.with_suffix(".provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n"
    )
    print("PASS: Official source SHA and exact two-line patch verified.")
    print("Prepared requirements:", output)


if __name__ == "__main__":
    main()
