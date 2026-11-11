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
// Generates the requirement-to-test traceability matrix
// (docs/release/requirement-test-matrix.md and .json) from
// docs/requirements/requirements.json (implementation and check references),
// docs/requirements/technical-clauses.json, docs/release/requirement-deviations.json
// (status, reason and measure of the requirements under reassessment) and the
// pull-request mapping in docs/release/pull-requests.json, which names the files
// each pull request changed. The evidence column is filled by the runs on the
// release candidate tag; until then it reads "pending".
import fs from 'node:fs';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const requirements = read('docs/requirements/requirements.json');
const technical = read('docs/requirements/technical-clauses.json');
const deviations = read('docs/release/requirement-deviations.json');
const pullRequests = fs.existsSync('docs/release/pull-requests.json') ? read('docs/release/pull-requests.json'): { items: [] };
const version = fs.readFileSync('VERSION', 'utf8').trim();
const deviationById = new Map(deviations.items.map(d => [d.id, d]));
function references(value) {
  return String(value || '').split(';').map(s => s.trim()).filter(Boolean);
}
function pullRequestsFor(files) {
  const hits = new Set();
  for (const pr of pullRequests.items.filter(p => p.implementsRequirements !== false)) for (const file of files) if ((pr.files ||
  []).some(f => file === f || file.startsWith(f.endsWith('/') ? f: f + '/'))) hits.add(pr.id);
  return [...hits].sort();
}
const isTest = f => f.startsWith('test/tests/') || f.startsWith('test/bdd/features/') || f.startsWith('test/browser/') ||
f.startsWith('test/ux-runner/') || f.startsWith('test/live/');
function scenariosFor(files) {
  return files.filter(isTest).sort();
}
const srs = requirements.items.filter(r => r.id.startsWith('FR-')).map(r => {
  const implementation = references(r.implementation),
  checks = references(r.checks);
  const deviation = deviationById.get(r.id);
  return {
    id: r.id,
    title: r.title,
    priority: r.priority || null,
    implementation,
    tests: scenariosFor(checks),
    otherChecks: checks.filter(c => !isTest(c)),
    acceptanceProcedure: r.acceptance || '',
    pullRequests: pullRequestsFor([...implementation, ...checks]),
    status: deviation ? deviation.status: r.status,
    reason: deviation?.reason || null,
    measure: deviation?.measure || null,
    evidence: deviation?.evidence || null
  };
});
const clauses = technical.items.map(c => ({
  id: c.id,
  title: c.title,
  source: `${c.source.document} p. ${c.source.page}, ${c.source.section}`,
  group: c.group,
  responsibility: c.development,
  implementation: c.implementation || [],
  closure: c.closure || '',
  pullRequests: pullRequestsFor(c.implementation || []),
  status: c.status || c.acceptanceStatus || 'NOT_REASSESSED_FOR_ACCEPTANCE'
}));
const output = {
  version,
  purpose: ('Requirement-to-test traceability for the resubmission of MS2: each SRS requirement and each technical provision ' +
    'with its tests, the pull requests that implement it and its evidence. Statuses of the requirements under reassessment ' +
    'come from requirement-deviations.json; the evidence column is filled from the runs on the release candidate tag.'),
  deviations: deviations.items,
  srs,
  technicalClauses: clauses
};
fs.writeFileSync('docs/release/requirement-test-matrix.json', JSON.stringify(output, null, 2) + '\n');
const cell = v => String(v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const list = values => values.length ? values.map(v => '`' + v + '`').join('<br>'): '—';
let md = '# Requirement-to-test traceability matrix\n\n';
md += `Version \`${version}\`. ${output.purpose}\n\n`;
md += ('Status values: `NOT_REASSESSED_FOR_ACCEPTANCE` (in scope, implementation referenced, acceptance not reassessed for the ' +
  'current source), `PARTIAL`, `GAP`, `EVIDENCE_LINKED` (see [acceptance gates](acceptance-gates.md)). "Pull requests" names ' +
  'the pull requests of the remediation that changed a referenced file; requirements whose files no pull request changed are ' +
  'implemented by the baseline commit `2fa3a8af`.\n\n');
md += '## Deviations and requirements under reassessment\n\n';
md += ('The 23 requirements whose status differed between the status matrices of 17 and 18 October 2026. The status is the ' +
  'proposed status for the current source, for confirmation by the QA sign-off; a `GAP`, or a `PARTIAL` that is not closed ' +
  'before the resubmission, needs the prior written agreement of the principal.\n\n');
md += '| ID | Requirement | Status | Reason | Measure | Closed by | Evidence |\n|---|---|---|---|---|---|---|\n';
for (const d of deviations.items) {
  const r = srs.find(x => x.id === d.id);
  md += `| ${d.id} | ${cell(r?.title)} | ${d.status} | ${cell(d.reason)} | ${cell(d.measure)} | ${cell(d.closes)} | ${cell(d.evidence || 'pending')} |\n`;
}
md += '\n## SRS requirements\n\n| ID | Requirement | Tests | Other checks | Pull requests | Status | Evidence |\n|---|---|---|---|---|---|---|\n';
for (const r of srs) md +=
  `| ${r.id} | ${cell(r.title)} | ${list(r.tests)} | ${list(r.otherChecks)} | ${r.pullRequests.length ? r.pullRequests.join(', '): 'baseline'} | ${r.status} | ${cell(r.evidence || 'pending')} |\n`;
md += '\n## Technical provisions\n\n| ID | Provision | Source | Responsibility | Implementation | Pull requests | Status |\n|---|---|---|---|---|---|---|\n';
for (const c of clauses) md +=
  `| ${c.id} | ${cell(c.title)} | ${cell(c.source)} | ${c.responsibility} | ${list(c.implementation)} | ${c.pullRequests.length ? c.pullRequests.join(', '): 'baseline'} | ${c.status} |\n`;
md += '\n[Structured matrix](requirement-test-matrix.json) · [Deviation record](requirement-deviations.json) · [Pull requests](pull-requests.json) · [Acceptance gates](acceptance-gates.md)\n';
fs.writeFileSync('docs/release/requirement-test-matrix.md', md);
console.log('[requirement-test-matrix] ' + srs.length + ' SRS, ' + clauses.length + ' clauses, ' + deviations.items.length +
  ' deviations, ' + pullRequests.items.length + ' pull requests');
