import * as std from 'typegpu/std';

const TYPEGPU_FUNCTIONS = new Set<string>(Object.keys(std));

const response = await fetch(
  'https://raw.githubusercontent.com/iwoplaza/wgsl-spec/refs/heads/main/spec/functions.json',
);
const jsonData = await response.json();
const ALL_SPEC_FUNCTIONS = new Set(Object.keys(jsonData));

// EXCLUDED_FUNCTIONS contains WGSL builtin function names that are excluded from the "missing functions" comparison.
// These functions are either not applicable, deprecated, or have special handling in TypeGPU.
const EXCLUDED_FUNCTIONS = new Set([
  'bitcast', // exists as bitcastU32toF32, bitcastU32toI32, ...
  'array', // exists as d.arrayOf
  'vec2', // exists as d.vec2f, d.vec2i, ...
  'vec3', // exists as d.vec3f, d.vec3i, ...
  'vec4', // exists as d.vec4f, d.vec4i, ...
  'bool', // exists as d.bool
  'f32', // exists as d.f32
  'f16', // exists as d.f16
  'i32', // exists as d.i32
  'u32', // exists as d.u32
  'mat2x2', // exists as d.mat2x2f
  'mat3x3', // exists as d.mat3x3f
  'mat4x4', // exists as d.mat4x4f
]);

function isFunctionMissingFromTypegpu(specFn: string): boolean {
  if (EXCLUDED_FUNCTIONS.has(specFn)) {
    return false;
  }
  return !TYPEGPU_FUNCTIONS.has(specFn);
}

console.log('=== WGSL Spec Function Comparison Report ===\n');

console.log(`TypeGPU exported functions: ${TYPEGPU_FUNCTIONS.size}`);
console.log(`WGSL spec functions: ${ALL_SPEC_FUNCTIONS.size}`);
console.log(`Excluded from comparison: ${EXCLUDED_FUNCTIONS.size}\n`);

const missingFunctions = [...ALL_SPEC_FUNCTIONS].filter((fn) => {
  return isFunctionMissingFromTypegpu(fn);
});

console.log('\n--- Missing WGSL functions in TypeGPU ---');
if (missingFunctions.length === 0) {
  console.log('(none - all WGSL functions are implemented)');
} else {
  const sortedMissing = missingFunctions.sort();
  for (const fn of sortedMissing) {
    console.log(`  - ${fn}`);
  }
}

console.log('\n=== Summary ===');
console.log(`TypeGPU implements ${TYPEGPU_FUNCTIONS.size} functions`);
console.log(
  `WGSL spec has ${ALL_SPEC_FUNCTIONS.size} functions (excluding ${EXCLUDED_FUNCTIONS.size} special cases)`,
);
console.log(`Missing functions: ${missingFunctions.length}`);
