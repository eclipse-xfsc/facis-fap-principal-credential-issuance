#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Verify a patch against reviewed file hashes or an exact Git commit.

Commit-bound mode is used when the supplied OCM assessment identifies a newer
revision but its file bytes were not available during PCI packaging. It never
falls back to older source. Runtime receipts report computed hashes honestly.
"""
import hashlib, subprocess, tempfile
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL)

def check_row(source, row, patch):
    source, patch = Path(source), Path(patch)
    data = (source / row['file']).read_bytes()
    if sha(patch.read_bytes()) != row['patchSha256']:
        raise ValueError('Patch bytes differ: ' + row['patch'])
    commit_bound = row.get('verificationMode') == 'git-commit-and-zero-fuzz-hunk'
    if commit_bound:
        if git(source, 'rev-parse', 'HEAD').decode().strip() != row['commit']:
            raise ValueError('Upstream commit mismatch: ' + row['repository'])
        original = git(source, 'show', row['commit'] + ':' + row['file'])
        if data != original:
            raise ValueError('Target source is modified: ' + row['repository'])
    else:
        if sha(data) not in (row['originalSha256'], row['patchedSha256']):
            raise ValueError('Source revision mismatch: ' + row['repository'])
        original = data
    with tempfile.TemporaryDirectory(prefix='pci-patch-check-') as directory:
        target = Path(directory) / row['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(original)
        def apply(reverse=False, dry=False):
            args = ['patch', '--batch', '--fuzz=0', '-p1', '-i', str(patch.resolve())]
            if reverse: args.append('--reverse')
            if dry: args.append('--dry-run')
            result = subprocess.run(args, cwd=directory, capture_output=True, text=True)
            if result.returncode:
                raise ValueError('Exact patch application failed; owner rebase required: ' + row['patch'])
        if not commit_bound and sha(data) == row['patchedSha256']:
            apply(reverse=True)
        original = target.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(original)).encode() + b'\0' + original).hexdigest()
        if not commit_bound and (sha(original) != row['originalSha256'] or blob != row['originalBlob']):
            raise ValueError('Original bytes differ: ' + row['patch'])
        apply(dry=True)
        apply()
        patched = target.read_bytes()
        if not commit_bound and sha(patched) != row['patchedSha256']:
            raise ValueError('Patched bytes differ: ' + row['patch'])
        return {'repository': row['repository'], 'declaredCommit': row['commit'],
                'file': row['file'], 'originalBlob': blob, 'originalSha256': sha(original),
                'patchSha256': row['patchSha256'], 'patchedSha256': sha(patched),
                'verificationMode': row.get('verificationMode', 'reviewed-file-hashes'),
                'exactByteCheck': 'PASS', 'zeroFuzzApplication': 'PASS'}
