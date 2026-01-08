import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const typegpuStdPath = join(__dirname, '../packages/typegpu/src/std');

const TYPEGPU_FUNCTIONS = new Set<string>();

function collectExportedFunctions(dirPath: string): void {
  const files = readdirSync(dirPath, { withFileTypes: true });
  for (const file of files) {
    const fullPath = join(dirPath, file.name);
    if (file.isDirectory()) {
      collectExportedFunctions(fullPath);
    } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
      const content = readFileSync(fullPath, 'utf-8');
      const exportMatches = content.matchAll(
        /export\s+(?:const|function)\s+(\w+)/g,
      );
      for (const match of exportMatches) {
        const name = match[1];
        if (name) {
          TYPEGPU_FUNCTIONS.add(name);
        }
      }
    }
  }
}

collectExportedFunctions(typegpuStdPath);

const response = await fetch(
  'https://raw.githubusercontent.com/iwoplaza/wgsl-spec/refs/heads/main/spec/functions.json',
);
const jsonData = await response.json();
const ALL_SPEC_FUNCTIONS = new Set(Object.keys(jsonData));

// EXCLUDED_FUNCTIONS contains WGSL builtin function names that are excluded from the "missing functions" comparison.
// These functions are either not applicable, deprecated, or have special handling in TypeGPU.
const EXCLUDED_FUNCTIONS = new Set([
  'array',
  'textureGather',
  'textureGatherCompare',
  'textureNumLayers',
  'textureNumSamples',
  'textureSampleCompareLevel',
  'textureSampleGrad',
  'atomicExchange',
  'atomicCompareExchangeWeak',
  'subgroupInverseBallot',
  'subgroupBallotBitExtract',
  'subgroupBallotBitCount',
  'subgroupBallotFindLSB',
  'subgroupBallotFindMSB',
]);

function normalizeToSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function isFunctionInSpec(typegpuFn: string): boolean {
  const normalized = normalizeToSnakeCase(typegpuFn);
  return (
    ALL_SPEC_FUNCTIONS.has(normalized) || ALL_SPEC_FUNCTIONS.has(typegpuFn)
  );
}

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

const functionsInTypegpuButNotInSpec = [...TYPEGPU_FUNCTIONS].filter((fn) => {
  return !isFunctionInSpec(fn);
});

const missingFunctions = [...ALL_SPEC_FUNCTIONS].filter((fn) => {
  return isFunctionMissingFromTypegpu(fn);
});

console.log('--- Functions in TypeGPU but not in WGSL spec ---');
if (functionsInTypegpuButNotInSpec.length === 0) {
  console.log('(none)');
} else {
  for (const fn of functionsInTypegpuButNotInSpec) {
    console.log(`  - ${fn}`);
  }
}

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
