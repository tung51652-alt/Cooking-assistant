#!/usr/bin/env python3
"""Reject persisted object identifiers and credentials without printing their values."""

import argparse
import base64
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "object identifier": re.compile(r"(?i)(?<![0-9a-f])[0-9a-f]{32,}(?![0-9a-f])"),
    "short object identifier": re.compile(r"\b(?=[0-9a-fA-F]{7,12}\b)(?=[0-9a-fA-F]*[a-fA-F])(?=[0-9a-fA-F]*[0-9])[0-9a-fA-F]+\b"),
    "package integrity value": re.compile(r"sha(?:256|384|512)-[A-Za-z0-9+/=]+"),
    "credential": re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|dckr_pat_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16})"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "password verifier": re.compile(r"(?:\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}|\$argon2(?:id|i|d)\$)"),
    "credential URL": re.compile(r"https?://[^\s/:]+:[^\s/@]+@"),
}


def unique_fields(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError('Duplicate lockfile field')
    return result


def npm_integrity_values(text):
    try:
        lock = json.loads(text, object_pairs_hook=unique_fields)
    except ValueError:
        return Counter()
    if not isinstance(lock, dict) or lock.get('lockfileVersion') != 3 or not isinstance(lock.get('packages'), dict):
        return Counter()
    values = Counter()
    for name, entry in lock['packages'].items():
        if not name.startswith('node_modules/') or not isinstance(entry, dict):
            continue
        resolved, integrity = entry.get('resolved'), entry.get('integrity')
        if not isinstance(resolved, str) or not re.fullmatch(r'https://registry\.npmjs\.org/[^?\s#]+\.tgz', resolved):
            continue
        if not isinstance(integrity, str) or not PATTERNS['package integrity value'].fullmatch(integrity):
            continue
        algorithm, encoded = integrity.split('-', 1)
        try:
            digest = base64.b64decode(encoded, validate=True)
        except ValueError:
            continue
        if len(digest) == int(algorithm[3:]) // 8 and base64.b64encode(digest).decode('ascii') == encoded:
            values[integrity] += 1
    decoded = Counter(PATTERNS['package integrity value'].findall(json.dumps(lock, ensure_ascii=False)))
    return values if values == decoded else Counter()


def violations(text, path=None):
    found = {label for label, pattern in PATTERNS.items() if pattern.search(text)}
    integrity_label = 'package integrity value'
    if integrity_label in found and path is not None and path.resolve() == ROOT / 'mobile/package-lock.json':
        # Counting raw occurrences also catches copies of valid values outside the integrity fields.
        if Counter(PATTERNS[integrity_label].findall(text)) == npm_integrity_values(text):
            found.remove(integrity_label)
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", action="append", type=Path, help="Check selected external notes instead of tracked files")
    args = parser.parse_args()
    if args.file:
        paths = args.file
    else:
        tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
        paths = [ROOT / name for name in tracked if name]
    failed = False
    for path in paths:
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            continue
        except OSError:
            print("FAIL: cannot read " + str(path), file=sys.stderr)
            failed = True
            continue
        for label in sorted(violations(text, path)):
            print("FAIL: " + str(path) + ": " + label + " detected (value hidden)", file=sys.stderr)
            failed = True
    if failed:
        return 1
    print("PASS: no prohibited identifier/credential literals in checked text files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
