#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$project_dir/deploy/compose.production.yml"
data_dir="$project_dir/data/kb"

mkdir -p "$data_dir"

docker compose --env-file "$project_dir/deploy/.env" -f "$compose_file" run --rm \
  -v "$data_dir:/app/data/kb" \
  knowledge python -m app.ingest --output /app/data/kb/knowledge.jsonl --wiki-detail-limit 180
