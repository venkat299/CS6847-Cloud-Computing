#!/usr/bin/env bash
set -euo pipefail

# Bump open files (per-process) for this shell and its children
ulimit -n 1048576 2>/dev/null || echo "Warning: could not raise ulimit -n; current=$(ulimit -n)"
echo "ulimit -n = $(ulimit -n)"

# Default to production and multi-worker cluster for better CPU utilization
export NODE_ENV="${NODE_ENV:-production}"

# Choose workers: use CLUSTER_WORKERS if set; otherwise, default to CPU count
if [[ -z "${CLUSTER_WORKERS:-}" ]]; then
  CLUSTER_WORKERS=$(node -e 'try{console.log(require("os").cpus().length||1)}catch(e){console.log(1)}')
  export CLUSTER_WORKERS
fi
echo "Starting server with CLUSTER_WORKERS=${CLUSTER_WORKERS}"

cd "$(dirname "$0")/.."/source_code
npm start

