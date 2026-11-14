#!/usr/bin/env python3
# Copyright (c) 2026 LEANEA GmbH and others.
#
# This program and the accompanying materials are made available under the
# terms of the Apache License, Version 2.0 which is available at
# https://www.apache.org/licenses/LICENSE-2.0.
#
# SPDX-License-Identifier: Apache-2.0
#
# Synthetic offline regression fixtures for the pinned secret scanner.

import argparse
import hashlib
import json
import re
import string
import subprocess
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = "docs/release/artifacts.json"
FORMER_EXCLUSIONS = [
    "control.json",
    "package-lock.json",
    "vendor/vue-provenance.json",
    "contracts/envoy-release.json",
    INVENTORY,
    "docs/release/source-sha256.txt",
    "docs/specifications/manifest.json",
    "test/support/qr-reference.json",
    "reference/participant-data-repository/go.sum",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gitleaks", required=True)
    args = parser.parse_args()
    binary = Path(args.gitleaks).resolve()
    config = ROOT / ".github/gitleaks.toml"
    policy = tomllib.loads(config.read_text())

    if policy.get("extend") or policy.get("allowlist", {}).get("paths"):
        raise SystemExit("Global path exclusions must not be reintroduced.")

    generic = next(
        rule for rule in policy["rules"] if rule["id"] == "generic-api-key"
    )
    allowance = next(
        entry for entry in generic.get("allowlists", [])
        if entry.get("description")
        == "Verified SHA-256 file entries in the release inventory"
    )
    if allowance.get("condition") != "AND":
        raise SystemExit("Checksum exemptions must require both path and line.")

    known = None
    for line in (ROOT / INVENTORY).read_text().splitlines():
        match = re.fullmatch(
            r'\s*("(?:[^"\\]|\\.)+")\s*:\s*"([0-9a-fA-F]{64})"\s*,?\s*',
            line,
        )
        if match and any(re.search(pattern, line) for pattern in allowance["regexes"]):
            known = (json.loads(match.group(1)), match.group(2))
            break
    if known is None:
        raise SystemExit("No checksum fixture matches the documented exemption.")

    # Deliberately synthetic, deterministic, and never used for authentication.
    alphabet = string.ascii_letters + string.digits
    digest = hashlib.sha512(b"pci-secret-scanner-regression-fixture").digest()
    token = "ghp_" + "".join(alphabet[value % len(alphabet)] for value in digest[:36])
    credential_url = (
        f"https://x-access-token:{token}"
        "@registry.example.invalid/review-fixture.tgz"
    )
    key, checksum = known
    cases = [
        (f"registry-{index}", filename, {"resolved": credential_url}, "github-pat")
        for index, filename in enumerate(FORMER_EXCLUSIONS)
    ]
    cases.extend([
        ("checksum", INVENTORY, {"files": {key: checksum}}, None),
        ("checksum-wrong-file", "control.json",
         {"files": {key: checksum}}, "generic-api-key"),
        ("credential-wrong-field", INVENTORY,
         {"api_key": hashlib.sha256(b"synthetic-credential-fixture").hexdigest()},
         "generic-api-key"),
        ("credential-in-checksum-field", INVENTORY,
         {"files": {key: token}}, "github-pat"),
        ("synthetic-ci-password", "ci.json",
         {"POSTGRES_PASSWORD": "ephemeral-ci-only"}, None),
    ])

    with tempfile.TemporaryDirectory(prefix="pci-gitleaks-regression-") as temporary:
        parent = Path(temporary)
        for name, filename, payload, expected_rule in cases:
            fixture = parent / name
            target = fixture / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(payload, indent=2) + "\n")
            report = parent / f"{name}.json"
            result = subprocess.run(
                [
                    str(binary), "detect",
                    "--source", str(fixture),
                    "--config", str(config),
                    "--no-git", "--redact",
                    "--report-format", "json",
                    "--report-path", str(report),
                ],
                text=True,
                capture_output=True,
            )
            findings = json.loads(report.read_text()) if report.exists() else None
            expected_exit = 1 if expected_rule else 0
            valid = (
                result.returncode == expected_exit
                and findings is not None
                and (
                    any(row.get("RuleID") == expected_rule for row in findings)
                    if expected_rule else not findings
                )
            )
            if not valid:
                print(result.stdout + result.stderr)
                raise SystemExit(f"FAIL: {name}")
            print(f"PASS: {name}")

    print(json.dumps({
        "suite": "gitleaks-regressions",
        "status": "PASS",
        "tests": len(cases),
        "externalServices": "NOT_USED",
    }))


if __name__ == "__main__":
    main()
