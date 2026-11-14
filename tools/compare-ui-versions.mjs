// Copyright (c) 2026 LEANEA GmbH and others.
// SPDX-License-Identifier: Apache-2.0
// Compare exact SemVer versions; ranges are rejected and build metadata is ignored.

import { pathToFileURL } from 'node:url';

function parseVersion(value) {
  if (typeof value !== 'string' || /\s/.test(value)) {
    throw new Error('Expected an exact SemVer version');
  }
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) throw new Error(`Invalid exact SemVer version: ${value}`);
  const prerelease = match[4] ? match[4].split('.') : [];
  for (const identifier of prerelease) {
    if (/^[0-9]+$/.test(identifier) && identifier.length > 1 && identifier[0] === '0') {
      throw new Error('Numeric prerelease identifiers cannot have leading zeros');
    }
  }
  return {
    core: match.slice(1, 4).map(part => BigInt(part)),
    prerelease,
  };
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] < right.core[i]) return -1;
    if (left.core[i] > right.core[i]) return 1;
  }
  const x = left.prerelease;
  const y = right.prerelease;
  if (!x.length && !y.length) return 0;
  if (!x.length) return 1;
  if (!y.length) return -1;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (i === x.length) return -1;
    if (i === y.length) return 1;
    if (x[i] === y[i]) continue;
    const xn = /^[0-9]+$/.test(x[i]);
    const yn = /^[0-9]+$/.test(y[i]);
    if (xn && yn) return BigInt(x[i]) < BigInt(y[i]) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

export function isNewerVersion(pinned, latest) {
  return compareVersions(latest, pinned) > 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2) throw new Error('Usage: compare-ui-versions.mjs PINNED LATEST');
    console.log(String(isNewerVersion(args[0], args[1])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
