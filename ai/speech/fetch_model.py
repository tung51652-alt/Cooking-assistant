"""Fetch and verify the GGML model against the upstream LFS metadata."""
from hashlib import sha256
import json
from pathlib import Path
from urllib.request import urlopen


HUB = 'https://huggingface.co'
REPOSITORY = 'ggerganov/whisper.cpp'
MODEL = 'ggml-base-q5_1.bin'


def main():
    with urlopen(f'{HUB}/api/models/{REPOSITORY}', timeout=30) as response:
        revision = json.load(response)['sha']
    with urlopen(f'{HUB}/api/models/{REPOSITORY}/tree/{revision}', timeout=30) as response:
        metadata = next(item['lfs'] for item in json.load(response) if item['path'] == MODEL)
    digest = sha256()
    size = 0
    with urlopen(f'{HUB}/{REPOSITORY}/resolve/{revision}/{MODEL}', timeout=60) as response:
        with Path(MODEL).open('wb') as destination:
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > metadata['size']:
                    raise ValueError('Whisper model exceeds the published size')
                digest.update(chunk)
                destination.write(chunk)
    if size != metadata['size'] or digest.hexdigest() != metadata['oid']:
        raise ValueError('Whisper model failed integrity verification')


if __name__ == '__main__':
    main()
