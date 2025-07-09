const { compileShader, getSupportedFormats, init } = require(
  "../pkg-nodejs/wgsl_tool.js",
);

// Initialize the WebAssembly module
init();

// Example WGSL shader
const wgslCode = `
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 0.0,  1.0)
    );
    return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`;

// Basic usage
function basic_example() {
  console.log("=== Basic Example ===");
  console.log("Supported formats:", getSupportedFormats());

  try {
    const glsl = compileShader(wgslCode, "glsl");
    console.log("GLSL Output:\n", glsl);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Compile from command line arguments
function compile_from_args() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: node nodejs-example.js <input-file> <output-format>");
    console.log("Formats:", getSupportedFormats().join(", "));
    return;
  }

  const [inputFile, outputFormat] = args;
  const fs = require("fs");

  try {
    const wgslContent = fs.readFileSync(inputFile, "utf8");
    const result = compileShader(wgslContent, outputFormat);

    const ext = outputFormat === "spirv" ? "spv" : outputFormat;
    const outputFile = inputFile.replace(/\.[^/.]+$/, `.${ext}`);

    if (outputFormat === "spirv") {
      fs.writeFileSync(outputFile, Buffer.from(result, "base64"));
    } else {
      fs.writeFileSync(outputFile, result);
    }

    console.log(`✓ Compiled '${inputFile}' to '${outputFile}'`);
  } catch (error) {
    console.error("✗ Error:", error.message);
    process.exit(1);
  }
}

// Run example
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    compile_from_args();
  } else {
    basic_example();
  }
}
