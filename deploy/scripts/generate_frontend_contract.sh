#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
npx --yes openapi-typescript@7.13.0 "${API_SCHEMA_URL:-http://127.0.0.1:8080/v3/api-docs}" -o frontend/src/generated/api.d.ts
python3 deploy/scripts/check_public_metadata.py --file frontend/src/generated/api.d.ts
