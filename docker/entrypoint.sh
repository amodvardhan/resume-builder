#!/bin/sh
set -e
exec uvicorn src.backend.main:app \
  --host "${UVICORN_HOST:-0.0.0.0}" \
  --port "${UVICORN_PORT:-8000}"
