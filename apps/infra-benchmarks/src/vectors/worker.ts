import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { transform, variants, type Variant } from './variants.ts';

const variant = process.argv[2] as Variant;
assert(variant in variants);
registerHooks({
  load(url, context, nextLoad) {
    // Library source normally runs through a bundler, which accepts JSON imports.
    if (url.endsWith('/packages/typegpu/package.json')) {
      const json = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        source: `const pkg = ${json}; export default pkg; export const version = pkg.version;`,
        shortCircuit: true,
      };
    }
    if (
      url.endsWith('/data/vectorImpl.ts') ||
      url.endsWith('/data/vector.ts') ||
      url.endsWith('/core/function/createCallableSchema.ts')
    ) {
      const source = transform(readFileSync(new URL(url), 'utf8'), url, variant);
      return { format: 'module', source: stripTypeScriptTypes(source), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

// Dynamic imports are essential: install transforms before loading TypeGPU.
const d = await import('../../../../packages/typegpu/src/data/vector.ts');
const abstract = await import('../../../../packages/typegpu/src/data/abstractVector.ts');
const impl = await import('../../../../packages/typegpu/src/data/vectorImpl.ts');
const std = await import('../../../../packages/typegpu/src/std/index.ts');
const { $internal } = await import('../../../../packages/typegpu/src/shared/symbols.ts');
const flags: readonly string[] = variants[variant];
const hasSwizzles = !flags.includes('no-swizzles');
const coerces = !flags.includes('no-init-coercion');

// Fail before timing if an experiment is not doing what its label claims.
assert.equal('xy' in d.vec3f(), hasSwizzles);
assert.equal(Array.isArray(d.vec3f()), !flags.includes('no-array'));
assert.equal(d.vec3i(1.75).x, coerces ? 1 : 1.75);
assert.equal(d.vec3f(1).x, 1);
assert.equal(d.vec3f().z, 0);
assert.equal(d.vec3f(2).z, 2);
assert.equal(d.vec3f(d.vec2f(1, 2), 3).z, 3);
// @ts-expect-error Deliberately exercise runtime validation of invalid arity.
assert.throws(() => d.vec3f(1, 2));
assert.equal(std.dot(d.vec3f(1, 2, 3), d.vec3f(4, 5, 6)), 32);
assert.equal(std.add(d.vec3f(1, 2, 3), d.vec3f(4, 5, 6)).z, 9);
const probe = new impl.Vec3fImpl(1, 2, 3);
assert.equal(
  Reflect.get(probe, $internal) === Reflect.get(probe, $internal),
  flags.includes('cached-metadata'),
);
assert.equal(Object.hasOwn(probe, 'payload0'), flags.includes('extra-payload'));
if (hasSwizzles) {
  assert.equal(d.vec4f(1, 2, 3, 4).wzyx.x, 4);
}

const batch = 256;
type Vec = ReturnType<typeof d.vec3f>;
// Every allocating iteration escapes into a retained ring. Read it after timing,
// so the compiler cannot erase unused allocations. Ring allocation is not timed.
const retained: unknown[] = Array.from({ length: batch });
let checksum = 0;
const a = d.vec3f(1, 2, 3);
const b = d.vec3f(4, 5, 6);
const pair = d.vec2f(2, 3);
const quad = d.vec4f(1, 2, 3, 4);
const inputs = Array.from({ length: batch }, (_, i) => d.vec3f(i, i + 1, i + 2));
const cases: Record<string, () => void> = {};
function allocating(name: string, create: (i: number) => unknown) {
  cases[name] = () => {
    for (let i = 0; i < batch; i++) retained[i] = create(i);
  };
}
allocating('public/vec2f', (i) => d.vec2f(i, i + 1));
allocating('public/vec3f', (i) => d.vec3f(i, i + 1, i + 2));
allocating('public/vec4f', (i) => d.vec4f(i, i + 1, i + 2, i + 3));
allocating('abstract/vec2', (i) => abstract.vec2(i, i + 1));
allocating('abstract/vec3', (i) => abstract.vec3(i, i + 1, i + 2));
allocating('abstract/vec4', (i) => abstract.vec4(i, i + 1, i + 2, i + 3));
allocating('direct/vec3f', (i) => new impl.Vec3fImpl(i, i + 1, i + 2));
allocating('public/zero', () => d.vec3f());
allocating('public/splat', (i) => d.vec3f(i));
allocating('public/copy', () => d.vec3f(a));
allocating('public/composed', (i) => d.vec3f(i, pair));
allocating('public/vec3i-fractional', (i) => d.vec3i(i + 0.75, -i - 0.25, i + 0.5));
allocating('public/vec3u-fractional', (i) => d.vec3u(i + 0.75, -i - 0.25, i + 0.5));
allocating('public/vec3h-fractional', (i) => d.vec3h(i + 0.1, i + 0.2, i + 0.3));
allocating('public/mixed', (i) =>
  i % 3 === 0
    ? d.vec2u(i, i + 1)
    : i % 3 === 1
      ? d.vec3f(i, i + 1, i + 2)
      : d.vec4i(i, i + 1, i + 2, i + 3),
);
allocating('std/add', () => std.add(a, b));
allocating('std/normalize', () => std.normalize(b));
allocating('std/mul-add-chain', () => std.add(std.mul(a, 2), b));
allocating('manual/add', () => d.vec3f(a.x + b.x, a.y + b.y, a.z + b.z));
allocating('manual/reverse4', () => d.vec4f(quad.w, quad.z, quad.y, quad.x));
if (hasSwizzles) {
  allocating('swizzle/reverse4', () => quad.wzyx);
  allocating('swizzle/compose', () => d.vec4f(quad.xy, quad.zw));
}
cases['read/named'] = () => {
  let sum = 0;
  for (const v of inputs) sum += v.x + v.y + v.z;
  checksum = sum;
};
cases['read/indexed'] = () => {
  let sum = 0;
  for (const v of inputs) sum += v[0] + v[1] + v[2];
  checksum = sum;
};
cases['std/dot'] = () => {
  let sum = 0;
  for (const v of inputs) sum += std.dot(v, b);
  checksum = sum;
};
cases['write/named'] = () => {
  for (let i = 0; i < batch; i++) {
    const v = inputs[i] as Vec;
    v.x = i;
    v.y = i + 1;
    v.z = i + 2;
  }
  checksum = (inputs[batch - 1] as Vec).z;
};
cases['write/indexed'] = () => {
  for (let i = 0; i < batch; i++) {
    const v = inputs[i] as Vec;
    v[0] = i;
    v[1] = i + 1;
    v[2] = i + 2;
  }
  checksum = (inputs[batch - 1] as Vec).z;
};

const sampleCount = Number(process.env.VECTOR_SAMPLES ?? 15);
const sampleMs = Number(process.env.VECTOR_SAMPLE_MS ?? 15);
const warmupMs = Number(process.env.VECTOR_WARMUP_MS ?? 75);
assert(Number.isInteger(sampleCount) && sampleCount >= 3);
assert(sampleMs > 0 && warmupMs > 0);
const results: Record<string, number[]> = {};
for (const [name, run] of Object.entries(cases)) {
  const until = performance.now() + warmupMs;
  do {
    run();
  } while (performance.now() < until);
  globalThis.gc?.();
  const samples: number[] = [];
  for (let sample = 0; sample < sampleCount; sample++) {
    let count = 0;
    const start = performance.now();
    let elapsed: number;
    do {
      run();
      count++;
      elapsed = performance.now() - start;
    } while (elapsed < sampleMs);
    samples.push((elapsed * 1e6) / (count * batch));
  }
  // Consume all retained results outside the timed region.
  for (const value of retained) checksum += (value as Vec).x;
  assert(Number.isFinite(checksum));
  results[name] = samples;
}

// Approximate retained heap cost: includes the common reference-array overhead.
// GC runs outside timing. This is not peak allocation or temporary-object traffic.
globalThis.gc?.();
const before = process.memoryUsage().heapUsed;
const heapVectors = Array.from({ length: 100_000 }, (_, i) => d.vec3f(i, i + 1, i + 2));
globalThis.gc?.();
const bytesPerVector = (process.memoryUsage().heapUsed - before) / heapVectors.length;
checksum += (heapVectors[heapVectors.length - 1] as Vec).x;
globalThis.gc?.();
const beforeAbstract = process.memoryUsage().heapUsed;
const abstractVectors = Array.from({ length: 100_000 }, (_, i) => abstract.vec3(i, i + 1, i + 2));
globalThis.gc?.();
const bytesPerAbstractVector =
  (process.memoryUsage().heapUsed - beforeAbstract) / abstractVectors.length;
checksum += abstractVectors[abstractVectors.length - 1]?.x ?? 0;
console.log(
  JSON.stringify({
    variant,
    results,
    bytesPerVector,
    bytesPerAbstractVector,
    checksum,
    ownKeys: Reflect.ownKeys(probe).map(String),
    sampleCount,
    sampleMs,
    warmupMs,
    batch,
  }),
);
