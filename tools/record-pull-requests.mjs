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
// Fills the GitHub facts of docs/release/pull-requests.json from the pull
// requests themselves: number, URL, author, issues closed, size as GitHub
// counts it, the review record and the merge. Nothing is filled from a plan:
// a pull request that is not merged, or has no approving review by someone
// other than its author, keeps reviewRecord or mergedAt null.
//
// Usage: node tools/record-pull-requests.mjs --map <map.json>
//          [--repo eclipse-xfsc/facis-fap-principal-credential-issuance]
//          [--file docs/release/pull-requests.json] [--check]
//   map.json: { "R1-1": 12, "R1-2": 13, ... }  (item id -> pull request number)
//   --check   prints the result and exits 1 if the file would change
//
// Reads GitHub through the gh command line client (gh api), which must be
// authenticated; no token is read or written by this script.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const DEFAULT_REPO = 'eclipse-xfsc/facis-fap-principal-credential-issuance';
const DEFAULT_FILE = 'docs/release/pull-requests.json';
// "Review started (date, time, time zone): 2026-11-11 09:10 CET" -> value
export function templateField(body, label) {
  const line = String(body || '').split(/\r?\n/).find((l) => l.trim().startsWith(label));
  if (!line) return null;
  const value = line.slice(line.indexOf(':') + 1).trim();
  return value && !/^<.*>$/.test(value) ? value: null;
}
export function closedIssues(body) {
  // GitHub closing keywords followed directly by the references ("Closes issues: #1, #2",
  // "Fixes #3 and #4"); "not closed by this pull request: #30" does not match.
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?:\s+issues?)?:?\s+((?:#\d+(?:\s*,\s*|\s+and\s+|\s*))+)/gi;
  const found = [];
  for (const m of String(body || '').matchAll(pattern)) {
    for (const ref of m[1].matchAll(/#(\d+)/g)) found.push(Number(ref[1]));
  }
  return [...new Set(found)].sort((a, b) => a - b);
}
export function reviewRecord(pr, reviews) {
  const author = pr.user && pr.user.login;
  const others = reviews.filter((r) => r.user && r.user.login !== author && r.submitted_at);
  const approvals = others.filter((r) => r.state === 'APPROVED');
  if (approvals.length === 0) return null;
  const last = approvals[approvals.length - 1];
  return {
    reviewer: last.user.login,
    firstReviewSubmittedAt: others[0].submitted_at,
    approvedAt: last.submitted_at,
    reviewsByOthers: others.length,
    reviewStartedStated: templateField(pr.body, 'Review started'),
    reviewCompletedStated: templateField(pr.body, 'Review completed'),
  };
}
export function recordItem(item, pr, reviews) {
  return {
    ...item,
    pullRequest: { number: pr.number, url: pr.html_url, author: pr.user && pr.user.login },
    issues: closedIssues(pr.body),
    sizeOnGitHub: { added: pr.additions, removed: pr.deletions, files: pr.changed_files },
    reviewRecord: reviewRecord(pr, reviews),
    mergedAt: pr.merged_at || null,
    mergedBy: (pr.merged_at && pr.merged_by && pr.merged_by.login) || null,
    status: pr.merged_at ? 'merged': pr.state === 'open' ? 'open on GitHub': 'closed without merge',
  };
}
export function recordAll(document, map, fetchPull) {
  const items = document.items.map((item) => {
    const number = map[item.id];
    if (number === undefined) return item;
    const { pr, reviews } = fetchPull(number);
    return recordItem(item, pr, reviews);
  });
  return { ...document, items };
}
function ghJson(path) {
  return JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8' })).flat();
}
function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1]: fallback;
}
function main() {
  const mapFile = argument('--map');
  if (!mapFile) throw new Error('--map <map.json> is required');
  const repo = argument('--repo', DEFAULT_REPO);
  const file = argument('--file', DEFAULT_FILE);
  const map = JSON.parse(readFileSync(mapFile, 'utf8'));
  const before = readFileSync(file, 'utf8');
  const fetchPull = (n) => ({
    pr: ghJson(`repos/${repo}/pulls/${n}`)[0],
    reviews: ghJson(`repos/${repo}/pulls/${n}/reviews`),
  });
  const after = JSON.stringify(recordAll(JSON.parse(before), map, fetchPull), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    process.stdout.write(after);
    process.exit(after === before ? 0: 1);
  }
  writeFileSync(file, after);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
