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
// Refresh provenance after independently prepared source/documentation changes merge.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { releaseArtifacts } from './release-artifacts.mjs';
const root = process.cwd();
if (!fs.existsSync('VERSION') || !fs.existsSync('package.json')) throw new Error('Run from the PCI repository root.');
const artifacts = releaseArtifacts(root);
fs.writeFileSync('docs/release/artifacts.json', JSON.stringify(artifacts, null, 2) + '\n');
const reports = [
  'docs/release/artifacts.json',
  'docs/release/validation.json',
  'docs/release/upstream-validation.json',
  'docs/release/acceptance.json'
];
const paths = [...new Set([...Object.keys(artifacts), ...reports.filter(p => fs.existsSync(p))])].sort();
const inventory = paths.map(p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') + '  ' + p).join('\n') + '\n';
fs.writeFileSync('docs/release/source-sha256.txt', inventory);
console.log(JSON.stringify({ artifactInputs: Object.keys(artifacts).length, inventoryFiles: paths.length }));
