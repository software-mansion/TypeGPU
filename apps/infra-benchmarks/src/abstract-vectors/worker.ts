import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const implementation = process.argv[2];
assert(['object', 'class', 'array', 'typegpu'].includes(implementation ?? ''));
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/packages/typegpu/package.json')) {
      return {
        format: 'module',
        source: `const p = ${readFileSync(new URL(url), 'utf8')}; export default p; export const version = p.version;`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
const sourceRoot = resolve(
  process.env.VECTOR_SOURCE_ROOT ?? new URL('../../../../', import.meta.url).pathname,
);
const d = await import(
  pathToFileURL(resolve(sourceRoot, 'packages/typegpu/src/data/index.ts')).href
);
const std = await import(
  pathToFileURL(resolve(sourceRoot, 'packages/typegpu/src/std/index.ts')).href
);
if (implementation === 'typegpu' && !d.vec3) {
  console.log(JSON.stringify({ implementation, unsupported: true, results: {} }));
  process.exit(0);
}
const samples = Number(process.env.VECTOR_SAMPLES ?? 9);
const sampleMs = Number(process.env.VECTOR_SAMPLE_MS ?? 12);
const warmupMs = Number(process.env.VECTOR_WARMUP_MS ?? 60);
assert(Number.isInteger(samples) && samples >= 3);
assert(Number.isFinite(sampleMs) && sampleMs > 0);
assert(Number.isFinite(warmupMs) && warmupMs > 0);
const batch = 256;
const results: Record<string, number[]> = {};
let checksum = 0;

// Generate dimension-specialized, straight-line functions for all contenders.
// No code generation, input allocation, or correctness checks occur while timing.
for (const n of [2, 3, 4]) {
  const fields = ['x', 'y', 'z', 'w'].slice(0, n);
  const at = (v: string, i: number) =>
    implementation === 'array' ? `${v}[${i}]` : `${v}.${fields[i]}`;
  const values = fields.join(',');
  const create =
    implementation === 'typegpu'
      ? d[`vec${n}`]
      : new Function(
          `return ${implementation === 'class' ? `class V { constructor(${values}) { ${fields.map((f) => `this.${f}=${f};`).join('')} } }` : `(${values}) => ${implementation === 'array' ? `[${values}]` : `({${values}})`}`}`,
        )();
  const ctor = (args: string[]) =>
    `${implementation === 'class' ? 'new ' : ''}create(${args.join(',')})`;
  const factory = (params: string, body: string) =>
    new Function('create', `return (${params}) => {${body}}`)(create);
  const add =
    implementation === 'typegpu'
      ? std.add
      : factory('a,b', `return ${ctor(fields.map((_, i) => `${at('a', i)}+${at('b', i)}`))};`);
  const mul =
    implementation === 'typegpu'
      ? std.mul
      : factory('a,s', `return ${ctor(fields.map((_, i) => `${at('a', i)}*s`))};`);
  const sum = fields.map((_, i) => `${at('a', i)} ** 2`).join('+');
  const ops: Record<string, string> = {
    construct: `return ${ctor(fields.map((_, i) => `i+${i + 0.25}`))};`,
    copy:
      implementation === 'typegpu'
        ? 'return create(a);'
        : `return ${ctor(fields.map((_, i) => at('a', i)))};`,
    add: 'return add(a,b);',
    scale: 'return mul(a,1.25);',
    chain: 'return add(mul(a,1.25),b);',
    normalize:
      implementation === 'typegpu'
        ? 'return std.normalize(a);'
        : `const len=Math.sqrt(${sum}); return ${ctor(fields.map((_, i) => `${at('a', i)}/len`))};`,
    dot:
      implementation === 'typegpu'
        ? 'return std.dot(a,b);'
        : `return ${fields.map((_, i) => `${at('a', i)}*${at('b', i)}`).join('+')};`,
    length: implementation === 'typegpu' ? 'return std.length(a);' : `return Math.sqrt(${sum});`,
    sin:
      implementation === 'typegpu'
        ? 'return std.sin(a);'
        : `return ${ctor(fields.map((_, i) => `Math.sin(${at('a', i)})`))};`,
    swizzle:
      implementation === 'typegpu'
        ? `return a.${fields.toReversed().join('')};`
        : `return ${ctor(fields.map((_, i) => at('a', n - 1 - i)))};`,
  };
  if (n === 3)
    ops.cross =
      implementation === 'typegpu'
        ? 'return std.cross(a,b);'
        : `return ${ctor([`${at('a', 1)}*${at('b', 2)}-${at('a', 2)}*${at('b', 1)}`, `${at('a', 2)}*${at('b', 0)}-${at('a', 0)}*${at('b', 2)}`, `${at('a', 0)}*${at('b', 1)}-${at('a', 1)}*${at('b', 0)}`])};`;
  const make = (xs: number[]) => (implementation === 'class' ? new create(...xs) : create(...xs));
  const inputs = Array.from({ length: batch }, (_, i) =>
    make(fields.map((_, j) => (i + 1) * 0.125 + j + 0.25)),
  );
  const other = Array.from({ length: batch }, (_, i) =>
    make(fields.map((_, j) => (i + 3) * 0.0625 - j - 0.75)),
  );
  const read = (v: Record<string, number> | number[], i: number) =>
    implementation === 'array'
      ? ((v as number[])[i] as number)
      : ((v as Record<string, number>)[fields[i] as string] as number);
  const retained: unknown[] = Array.from({ length: batch });
  for (const [name, body] of Object.entries(ops)) {
    const fn = new Function('create', 'std', 'add', 'mul', `return (a,b,i) => {${body}}`)(
      create,
      std,
      add,
      mul,
    );
    // Independent scalar reference checks every component for varied, non-integer inputs.
    for (let i = 0; i < batch; i++) {
      const a = fields.map((_, j) => read(inputs[i], j));
      const b = fields.map((_, j) => read(other[i], j));
      const len = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
      const reference: Record<string, number | number[]> = {
        construct: fields.map((_, j) => i + j + 0.25),
        copy: a,
        add: a.map((x, j) => x + (b[j] as number)),
        scale: a.map((x) => x * 1.25),
        chain: a.map((x, j) => x * 1.25 + (b[j] as number)),
        normalize: a.map((x) => x / len),
        dot: a.reduce((s, x, j) => s + x * (b[j] as number), 0),
        length: len,
        sin: a.map(Math.sin),
        swizzle: a.toReversed(),
        cross: [
          (a[1] as number) * (b[2] as number) - (a[2] as number) * (b[1] as number),
          (a[2] as number) * (b[0] as number) - (a[0] as number) * (b[2] as number),
          (a[0] as number) * (b[1] as number) - (a[1] as number) * (b[0] as number),
        ],
      };
      const value = fn(inputs[i], other[i], i);
      assert.deepEqual(
        typeof value === 'number' ? value : fields.map((_, j) => read(value, j)),
        reference[name],
        `${implementation}/${n}/${name}`,
      );
      assert.deepEqual(
        fields.map((_, j) => read(inputs[i], j)),
        a,
      );
      assert.deepEqual(
        fields.map((_, j) => read(other[i], j)),
        b,
      );
      if (typeof value !== 'number') {
        assert.notEqual(value, inputs[i]);
        assert.notEqual(value, fn(inputs[i], other[i], i));
      }
    }
    const run = () => {
      for (let i = 0; i < batch; i++) retained[i] = fn(inputs[i], other[i], i);
    };
    const until = performance.now() + warmupMs;
    do {
      run();
    } while (performance.now() < until);
    globalThis.gc?.();
    const timings = [];
    for (let sample = 0; sample < samples; sample++) {
      let count = 0;
      const start = performance.now();
      let elapsed;
      do {
        run();
        count++;
        elapsed = performance.now() - start;
      } while (elapsed < sampleMs);
      timings.push((elapsed * 1e6) / (count * batch));
      for (const value of retained)
        checksum += typeof value === 'number' ? value : read(value as number[], 0);
    }
    results[`vec${n}/${name}`] = timings;
  }
}
assert(Number.isFinite(checksum));
console.log(JSON.stringify({ implementation, results, checksum }));
