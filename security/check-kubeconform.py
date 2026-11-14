#!/usr/bin/env python3
# Copyright (c) 2026 LEANEA GmbH and others.
#
# This program and the accompanying materials are made available under the
# terms of the Apache License, Version 2.0 which is available at
# https://www.apache.org/licenses/LICENSE-2.0.
#
# SPDX-License-Identifier: Apache-2.0

import argparse
import copy
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kubeconform", required=True)
    args = parser.parse_args()
    env = os.environ.copy()
    env["PCI_KUBECONFORM"] = str(Path(args.kubeconform).resolve())

    valid = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "schema-regression"},
        "spec": {
            "replicas": 1,
            "selector": {"matchLabels": {"app": "schema-regression"}},
            "template": {
                "metadata": {"labels": {"app": "schema-regression"}},
                "spec": {
                    "containers": [{
                        "name": "fixture",
                        "image": "example.invalid/schema-regression:test",
                    }],
                },
            },
        },
    }

    typo = copy.deepcopy(valid)
    typo["kind"] = "Deploymnt"

    unknown_version = copy.deepcopy(valid)
    unknown_version["apiVersion"] = "apps/v9999"

    invalid = copy.deepcopy(valid)
    del invalid["spec"]["selector"]

    cases = [
        ("valid-deployment", valid, 0, "valid"),
        ("unknown-kind", typo, 1, "errors"),
        ("unknown-api-version", unknown_version, 1, "errors"),
        ("missing-required-field", invalid, 1, "invalid"),
    ]

    with tempfile.TemporaryDirectory(prefix="pci-schema-regression-") as temporary:
        for name, document, expected_exit, expected_category in cases:
            manifest = Path(temporary) / f"{name}.yaml"
            manifest.write_text(json.dumps(document))
            result = subprocess.run(
                ["bash", str(ROOT / "security/validate-manifests.sh"), str(manifest)],
                env=env,
                text=True,
                capture_output=True,
            )
            try:
                report = json.loads(result.stdout)
            except json.JSONDecodeError:
                print(result.stdout + result.stderr)
                raise SystemExit(f"FAIL: {name}: validator did not return JSON")

            summary = report.get("summary", {})
            expected_summary = dict.fromkeys(("valid", "invalid", "errors", "skipped"), 0)
            expected_summary[expected_category] = 1

            if (
                result.returncode != expected_exit
                or any(summary.get(key) != value for key, value in expected_summary.items())
            ):
                print(result.stdout + result.stderr)
                raise SystemExit(f"FAIL: {name}")
            print(f"PASS: {name}: {json.dumps(summary, sort_keys=True)}")

    print(json.dumps({
        "suite": "manifest-schema-regressions",
        "status": "PASS",
        "tests": len(cases),
        "clusterAccess": "NOT_USED",
    }))


if __name__ == "__main__":
    main()
