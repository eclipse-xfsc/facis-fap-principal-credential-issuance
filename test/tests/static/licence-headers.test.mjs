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
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('every authored source file carries the project licence header', () => {
  const output = execFileSync(process.execPath, ['tools/add-licence-headers.mjs', '--check'], { encoding: 'utf8' });
  const summary = JSON.parse(output.trim().split('\n').at(- 1));
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.missing, 0);
  assert.ok(summary.files > 200, 'scope covers the authored sources');
});
