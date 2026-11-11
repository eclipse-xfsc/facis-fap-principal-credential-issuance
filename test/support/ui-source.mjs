// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0
//
// Prepared with AI-assisted tools and reviewed by the author.
// Assisted-by: AI
import fs from 'node:fs';
import { stripModuleSyntax } from '../../tools/lib/module-source.mjs';
import { PCI_ISSUER_MODULES } from '../../tools/lib/bundle-inputs.mjs';
export function issuerSource() {
  return PCI_ISSUER_MODULES.map(file => stripModuleSyntax(fs.readFileSync(file, 'utf8'), file)).join('\n');
}
