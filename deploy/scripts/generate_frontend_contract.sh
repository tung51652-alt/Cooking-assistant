#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
if [ -n "${API_SCHEMA_URL:-}" ]; then
  contract_source="$API_SCHEMA_URL"
else
  contract_tmp=$(mktemp -d)
  trap 'rm -rf "$contract_tmp"' EXIT HUP INT TERM
  docker compose exec -T recipes python -c \
    "from urllib.request import urlopen; import sys; sys.stdout.buffer.write(urlopen('http://backend:8080/v3/api-docs', timeout=5).read())" \
    > "$contract_tmp/openapi.json"
  contract_source="$contract_tmp/openapi.json"
fi
npx --yes openapi-typescript@7.13.0 "$contract_source" --default-non-nullable false -o frontend/src/generated/api.d.ts
python3 deploy/scripts/check_public_metadata.py --file frontend/src/generated/api.d.ts
