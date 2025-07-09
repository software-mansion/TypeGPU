# WGSL Tool Makefile

BINARY_NAME := wgsl_analysis
RELEASE_DIR := target/release

.PHONY: all build release clean test install help

# Default target
all: release

# Build targets
build:
	cargo build

release:
	cargo build --release

# Test target
test: release
	./scripts/test_runner.sh

# Install target
install: release
	./scripts/install.sh

# Clean target
clean:
	cargo clean
	rm -f *.wgsl *.glsl *.hlsl *.metal *.spv

# Run examples
example-wgsl: release
	./$(RELEASE_DIR)/$(BINARY_NAME) examples/simple.wgsl

example-glsl: release
	./$(RELEASE_DIR)/$(BINARY_NAME) examples/simple.wgsl --format glsl

example-hlsl: release
	./$(RELEASE_DIR)/$(BINARY_NAME) examples/simple.wgsl --format hlsl

example-metal: release
	./$(RELEASE_DIR)/$(BINARY_NAME) examples/simple.wgsl --format metal



example-spirv: release
	./$(RELEASE_DIR)/$(BINARY_NAME) examples/simple.wgsl --format spirv

example-multi: release
	./$(RELEASE_DIR)/$(BINARY_NAME) examples/multi_stage.wgsl --format glsl

# Help target
help:
	@echo "WGSL Tool - Available targets:"
	@echo ""
	@echo "  build       - Build debug version"
	@echo "  release     - Build release version"
	@echo "  test        - Run tests"
	@echo "  install     - Install to system"
	@echo "  clean       - Clean build artifacts"
	@echo ""
	@echo "  example-wgsl   - Convert example to WGSL"
	@echo "  example-glsl   - Convert example to GLSL"
	@echo "  example-hlsl   - Convert example to HLSL"
	@echo "  example-metal  - Convert example to Metal"
	@echo "  example-spirv  - Convert example to SPIR-V"
	@echo "  example-multi  - Convert multi-stage example to GLSL"
	@echo ""
	@echo "Usage:"
	@echo "  make release"
	@echo "  make example-glsl"
	@echo "  make test"
