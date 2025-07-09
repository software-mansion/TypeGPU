#!/bin/bash

set -e

echo "Testing WGSL Analysis Tool..."
echo "============================="

echo "Testing CLI..."
cargo build --features cli --quiet

echo "Testing basic compilation..."
cargo run --features cli --quiet -- examples/triangle.wgsl --format glsl > /dev/null
echo "✓ CLI works"

# Test WebAssembly if wasm-pack is available
if command -v wasm-pack &> /dev/null; then
    echo "Testing WebAssembly build..."
    wasm-pack build --target nodejs --out-dir pkg-nodejs --features wasm --quiet
    echo "✓ WebAssembly build works"

    # Test Node.js integration if available
    if command -v node &> /dev/null; then
        echo "Testing Node.js integration..."
        node examples/nodejs-example.js > /dev/null 2>&1
        echo "✓ Node.js integration works"
    fi
else
    echo "⚠ Skipping WebAssembly tests (wasm-pack not found)"
fi

echo ""
echo "All tests passed! 🎉"
