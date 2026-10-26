#!/usr/bin/env python3
"""Reject persisted object identifiers and credentials without printing their values."""

import argparse
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


def violations(text):
    return {label for label, pattern in PATTERNS.items() if pattern.search(text)}


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
        for label in sorted(violations(text)):
            print("FAIL: " + str(path) + ": " + label + " detected (value hidden)", file=sys.stderr)
            failed = True
    if failed:
        return 1
    print("PASS: no prohibited identifier/credential literals in checked text files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
