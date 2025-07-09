# WGSL Tool

This is a simple tool to convert WGSL shaders into other formats. You can use it from the command line or in JavaScript (Node.js or browser).

## How to Use

### Command Line

```bash
cargo run --features cli -- shader.wgsl --format glsl
```

```bash
cargo run --features cli -- shader.wgsl --format hlsl --output shader.hlsl
```

Formats you can use: wgsl, glsl, hlsl, metal, spirv, spirv-asm

### In JavaScript

**Node.js:**
```javascript
const { compileShader, init } = require('./pkg-nodejs/wgsl_tool.js');
init();

const wgsl = '@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0, 0.0, 0.0, 1.0); }';
const glsl = compileShader(wgsl, 'glsl');
console.log(glsl);
```

**Browser:**
```javascript
import init, { compileShader } from './pkg/wgsl_tool.js';
await init();
const result = compileShader(wgslCode, 'glsl');
```

## Building

For the CLI:
```bash
cargo build --release --features cli
```

For WebAssembly:
```bash
cargo install wasm-pack
./scripts/build-wasm.sh
```

## Output Formats

- WGSL
- GLSL
- HLSL
- Metal
- SPIR-V (binary or assembly)

SPIR-V can be output as:
- `spirv`: binary file (`.spv`), or base64 string in JS
- `spirv-asm`: readable text (`.spvasm`)

## Examples

- `examples/web-example.html` — browser demo
- `examples/nodejs-example.js` — Node.js demo

## API

- `compileShader(wgsl_code: string, format: string) -> string`
- `getSupportedFormats() -> string[]`
- `init()`

## Testing

```bash
cargo test --features cli
cargo test --features wasm
./scripts/test-all.sh
python3 scripts/serve.py
# Then open http://localhost:{port}/examples/web-example.html
```
