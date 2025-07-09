#!/bin/bash

# Simple build script for WebAssembly

set -e

echo "Building WGSL Analysis Tool for WebAssembly..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack not found. Install with: cargo install wasm-pack"
    exit 1
fi

# Determine the script's directory and the crate root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_ROOT="$SCRIPT_DIR/.."

# Clean previous builds
rm -rf "$CRATE_ROOT/pkg/" "$CRATE_ROOT/pkg-bundler/" "$CRATE_ROOT/pkg-nodejs/"

# Build for different targets
echo "Building for web browsers..."
wasm-pack build "$CRATE_ROOT" --target web --out-dir "$CRATE_ROOT/pkg" --features wasm

echo "Building for bundlers..."
wasm-pack build "$CRATE_ROOT" --target bundler --out-dir "$CRATE_ROOT/pkg-bundler" --features wasm

echo "Building for Node.js..."
wasm-pack build "$CRATE_ROOT" --target nodejs --out-dir "$CRATE_ROOT/pkg-nodejs" --features wasm

echo "✓ Build complete!"
echo "Test with: node examples/nodejs-example.js"
