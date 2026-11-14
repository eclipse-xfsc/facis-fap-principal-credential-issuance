#!/usr/bin/env bash
# Copyright (c) 2026 LEANEA GmbH and others.
#
# This program and the accompanying materials are made available under the
# terms of the Apache License, Version 2.0 which is available at
# https://www.apache.org/licenses/LICENSE-2.0.
#
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

if (($# == 0)); then
  echo "Supply at least one manifest file or directory." >&2
  exit 2
fi

for PCI_INPUT in "$@"; do
  if [[ ! -f "$PCI_INPUT" && ! -d "$PCI_INPUT" ]]; then
    echo "Manifest input does not exist: $PCI_INPUT" >&2
    exit 2
  fi
done

PCI_VALIDATOR="${PCI_KUBECONFORM:-./kubeconform}"

exec "$PCI_VALIDATOR" \
  -strict \
  -summary \
  -output json \
  -kubernetes-version 1.34.0 \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  "$@"
