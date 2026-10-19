#!/usr/bin/env python3
"""Check published static artifacts without exposing matched identifier values."""
from pathlib import Path
import re
from check_public_metadata import violations


def verify(root):
    root = Path(root)
    if not (root / 'index.html').is_file() or not (root / 'assets/app.js').is_file():
        raise ValueError('Missing frontend entrypoint')
    paths = [p for p in root.rglob('*') if p.is_file()]
    for path in paths:
        if path.suffix == '.map' or violations(path.name):
            raise ValueError('Source map or prohibited asset filename')
        if path.suffix not in ('.js', '.css', '.html', '.txt'):
            continue
        text = path.read_text()
        kinds = violations(text)
        if kinds:
            raise ValueError('Published text violates metadata policy: ' + path.name + ': ' + ', '.join(sorted(kinds)))
        if 'sourceMappingURL=' in text or 'data:font/' in text:
            raise ValueError('Unexpected source map or inline font in published artifact')
    html = (root / 'index.html').read_text()
    if re.search(r'(?:src|href)=["\']https?://', html):
        raise ValueError('HTML loads an external runtime asset')
    for notice in ('Epilogue-OFL.txt', 'Plus-Jakarta-Sans-OFL.txt', 'Phosphor-MIT.txt', 'React-MIT.txt'):
        if not (root / 'notices' / notice).is_file():
            raise ValueError('Missing redistributed font/library notice')
    print('PASS: frontend assets, notices, stable filenames and public metadata policy')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, nargs='?', default=Path('frontend/dist'))
    verify(parser.parse_args().directory)
