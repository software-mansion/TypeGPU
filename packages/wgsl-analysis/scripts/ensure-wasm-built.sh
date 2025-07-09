#!/bin/bash
set -e

# This script ensures the WASM build output exists.
# If not, it triggers the build.

# Path to a file that should exist after a successful build
OUT_FILE="pkg/wgsl_tool.js"

# Move to the script's directory (so it works from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ ! -f "$OUT_FILE" ]; then
  echo "WASM output not found, building..."
  ./scripts/build-wasm.sh
else
  echo "WASM output found, skipping build."
fi
