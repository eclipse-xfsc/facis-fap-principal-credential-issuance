// Build a navigable implementation catalogue; executed outcomes live in CI records.
import fs from 'node:fs';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const requirements = read('docs/requirements/requirements.json');
const technical = read('docs/requirements/technical-clauses.json');
const ci = read('docs/release/ci-evidence.json');
const cell = v => String(v ?? '').replaceAll('|', ' / ').replaceAll('\n', ' ');
const paths = v => Array.isArray(v) ? v: v.split(';').map(x => x.trim());
const row = r => ({
  id: r.id,
  title: r.title,
  priority: r.priority ?? 'See original technical clause',
  source: r.source ?? { document: r.id.startsWith('FR-') ? 'SRS.pdf': 'Supplementary audit grouping' },
  responsibility: r.development,
  implementation: paths(r.implementation),
  checks: r.checks ? paths(r.checks): [],
  verificationProcedure: r.acceptance ?? r.closure
});
const srs = requirements.items.filter(r => r.id.startsWith('FR-')).map(row);
const groups = requirements.items.filter(r => r.id.startsWith('TDR-')).map(row);
const clauses = technical.items.map(row);
const output = {
  version: read('package.json').version,
  sourceCommit: null,
  reviewedAt: null,
  historicalCi: {
    sourceCommit: ci.sourceCommit,
    reviewedAt: ci.reviewDate,
    scope: 'Result for the named commit only; not a result for the current tree'
  },
  method: ("Source and delivery references retain all normative identifiers. Executed outcomes identify their own " +
    "run, commit and test scope in the linked validation records. This catalogue does not create an " + "acceptance receipt."),
  evidence: {
    validation: 'docs/release/validation.json',
    workflows: 'docs/release/ci-evidence.json',
    specifications: 'docs/specifications/manifest.json',
    deploymentReview: 'docs/testing/live-acceptance.md'
  },
  counts: { srs: srs.length, technicalClauses: clauses.length, supplementaryGroups: groups.length },
  srs,
  technical: clauses,
  supplementaryGroups: groups
};
fs.writeFileSync('docs/release/requirement-audit.json', JSON.stringify(output, null, 2) + '\n');
let md = '# Implementation and verification catalogue\n\n';
md += ("All 101 SRS requirements, 83 individual technical clauses and eight supplementary audit groups are " +
  "retained. This catalogue links the implementation and verification procedures. The original " +
  "[specifications](../specifications/README.md) define the normative scope.\n\n");
md += ("[Executed checks](completion.md) identify the executed scope by commit and run. [Workflow " +
  "evidence](ci-evidence.json) concerns the commit it names, not the current source. The open gates are " +
  "listed in the [acceptance gates](acceptance-gates.md). No automatic acceptance conclusion is generated.\n\n");
for (const [title, items] of [['SRS', srs], ['Technical clauses', clauses], ['Supplementary groups', groups]]) {
  md += '## ' + title + '\n\n| ID | Requirement | Implementation references | Verification procedure |\n|---|---|---|---|\n';
  for (const r of items) md += '| ' + [r.id, r.title, r.implementation.join('; '), r.verificationProcedure].map(cell).join(' | ') + ' |\n';
  md += '\n';
}
md += ("[Structured catalogue](requirement-audit.json) · [SRS delivery " +
  "tracking](../requirements/traceability.md) · [Operating profiles](../known-gaps.md) · [Test " +
  "strategy](../testing/test-strategy.md)\n");
fs.writeFileSync('docs/release/requirement-audit.md', md);
console.log('[requirement-audit] ' + srs.length + ' SRS, ' + clauses.length + ' technical clauses');
