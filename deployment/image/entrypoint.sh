#!/bin/sh
# Copyright (c) 2026 LEANEA GmbH and others.
#
# This program and the accompanying materials are made available under the
# terms of the Apache License, Version 2.0 which is available at
# https://www.apache.org/licenses/LICENSE-2.0.
#
# SPDX-License-Identifier: Apache-2.0
#
# Prepared with AI-assisted tools and reviewed by the author.
# Assisted-by: AI

# Entry point of the FAP PCI application image.
# 1. Seeds the /data volume with the PCI release baked into the image when the
#    volume does not yet carry this release (deployment/image/seed-data.mjs).
# 2. Executes the entry point and command of the ORCE base image as recorded in
#    base-image.lock; arguments given to the container replace the command, as
#    Docker does for the base image itself.
# No credentials are read or written here; the seeding touches only
# /data/package.json, /data/node_modules, /data/uibuilder/ui/src, the flow file
# and /data/fap-pci/install.
set -eu
ROOT="${FAP_PCI_IMAGE_ROOT:-/opt/fap-pci}"
DATA_DIR="${FAP_PCI_DATA_DIR:-/data}"
if [ "${FAP_PCI_SKIP_SEED:-}" != "1" ]; then
  node "$ROOT/seed-data.mjs" --image-root "$ROOT" --data "$DATA_DIR"
fi
# seed-data.mjs prints the arrays of the lock file shell-quoted, one line.
if [ "$#" -gt 0 ]; then
  ENTRY="$(node "$ROOT/seed-data.mjs" --print-entrypoint --image-root "$ROOT")"
  eval "set -- $ENTRY \"\$@\""
else
  COMMAND="$(node "$ROOT/seed-data.mjs" --print-command --image-root "$ROOT")"
  eval "set -- $COMMAND"
fi
exec "$@"
