#!/usr/bin/env bash
set -euo pipefail

# Bump open files (per-process) for this shell and its children
ulimit -n 1048576 2>/dev/null || echo "Warning: could not raise ulimit -n; current=$(ulimit -n)"
echo "ulimit -n = $(ulimit -n)"

DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$DIR/client.js" "$@"

