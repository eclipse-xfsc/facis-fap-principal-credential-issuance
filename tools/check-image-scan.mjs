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
// Compares two Trivy JSON reports: the base image and the image built from
// it. Fails on HIGH or CRITICAL findings that are not already present in the
// base image, unless security/image-scan-exceptions.json lists the finding
// (vulnerability id + package) with its reason and issue. Findings of the
// mandated base image are reported, not failed: LEANEA cannot fix them and
// reports them to the principal in writing.
// Usage: node tools/check-image-scan.mjs --base base.json --image image.json [--exceptions FILE]
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const SEVERITIES = ['HIGH', 'CRITICAL'];
export function findings(report) {
  const items = [];
  for (const result of report.Results || []) for (const v of result.Vulnerabilities || []) {
    if (!SEVERITIES.includes(v.Severity)) continue;
    items.push({
      id: v.VulnerabilityID,
      pkg: v.PkgName,
      version: v.InstalledVersion,
      severity: v.Severity,
      target: result.Target,
      fixed: v.FixedVersion || null
    });
  }
  return items;
}
const key = f => `${f.id}|${f.pkg}|${f.version}`;
export function compare(base, image, exceptions = []) {
  const inherited = new Set(findings(base).map(key));
  const excepted = new Map(exceptions.map(e => [`${e.id}|${e.pkg}`, e]));
  const added = [],
  acceptedExceptions = [],
  baseFindings = [];
  for (const f of findings(image)) {
    if (inherited.has(key(f))) {
      baseFindings.push(f);
      continue;
    }
    const exception = excepted.get(`${f.id}|${f.pkg}`);
    if (exception) acceptedExceptions.push({ ...f, reason: exception.reason, issue: exception.issue });
    else added.push(f);
  }
  const stale = exceptions.filter(e => !findings(image).some(f => f.id === e.id && f.pkg === e.pkg)).map(e =>
    `${e.id} ${e.pkg}: exception for a finding the image no longer has`);
  return {
    status: added.length || stale.length ? 'FAIL': 'PASS',
    added,
    acceptedExceptions,
    baseFindings,
    stale
  };
}
if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split('/').pop())) {
  if (!args.base || !args.image) throw new Error('Usage: check-image-scan.mjs --base FILE --image FILE [--exceptions FILE]');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const exceptions = args.exceptions && fs.existsSync(args.exceptions) ? read(args.exceptions).exceptions ||
  []: [];
  const result = compare(read(args.base), read(args.image), exceptions);
  console.log(JSON.stringify({
    status: result.status,
    addedHighOrCritical: result.added.length,
    inheritedFromBase: result.baseFindings.length,
    exceptions: result.acceptedExceptions.length,
    stale: result.stale
  }, null, 2));
  for (const f of result.added) console.error(
    `ADDED ${f.severity} ${f.id} ${f.pkg} ${f.version} (${f.target})${f.fixed ? ' fixed in ' + f.fixed: ''}`);
  for (const f of result.baseFindings) console.error(`BASE  ${f.severity} ${f.id} ${f.pkg} ${f.version} (${f.target})`);
  process.exit(result.status === 'PASS' ? 0: 1);
}
