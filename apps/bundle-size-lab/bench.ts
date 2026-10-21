// oxlint-disable typescript/no-explicit-any, eslint/no-unused-expressions, unicorn/consistent-function-scoping -- measurement scripts working with untyped AST/metadata payloads
/**
 * Cold-start benchmark of metadata formats.
 *
 * For every example, all of its 'use gpu' metadata (taken from the real baseline bundle) is emitted
 * as a standalone script in each format. Each measurement runs in a fresh Node process
 * (so nothing is JIT-warm or cached, like a page load) and records:
 * - compile: `new vm.Script(src)`
 * - run: evaluating the script, which registers every function's metadata
 * - read: normalizing every function's metadata (what `getFunctionMetadata` does) and reading
 *   all of its externals, like WGSL generation would
 * - heap retained after registering, and after normalizing
 *
 * Usage: node --expose-gc bench.ts [runs]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { FORMATS, extract, type Meta } from './formats.ts';
import { READERS } from './decoders.ts';

const here = import.meta.dirname;

// --- Child: one cold measurement ------------------------------------------------------------

if (process.argv[2] === 'child') {
  const [, , , file, format] = process.argv;
  const src = readFileSync(file, 'utf8');
  const read = READERS[format];
  const gc = globalThis.gc as () => void;

  const fns: object[] = [];
  class RecordingWeakMap extends WeakMap<object, unknown> {
    override set(key: object, value: unknown) {
      fns.push(key);
      return super.set(key, value);
    }
  }
  const meta = new RecordingWeakMap();
  (globalThis as any).__TYPEGPU_META__ = meta;

  gc();
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const script = new vm.Script(src, { filename: `bench-${Math.random()}.js` });
  const t1 = performance.now();
  script.runInThisContext();
  const t2 = performance.now();
  gc();
  const heap1 = process.memoryUsage().heapUsed;

  const normalized = [];
  const t3 = performance.now();
  for (const fn of fns) {
    const n = read(meta.get(fn));
    meta.delete(fn); // typegpu drops the raw metadata once normalized
    for (const key in n.externals) n.externals[key];
    normalized.push(n);
  }
  const t4 = performance.now();
  gc();
  const heap2 = process.memoryUsage().heapUsed;

  console.log(
    JSON.stringify({
      compile: t1 - t0,
      run: t2 - t1,
      read: t4 - t3,
      heapRegistered: heap1 - heap0,
      heapNormalized: heap2 - heap0,
      count: normalized.length,
    }),
  );
  process.exit(0);
}

// --- Parent ---------------------------------------------------------------------------------

const RUNS = Number(process.argv[2] ?? 15);
const EXAMPLES = [
  'image-processing/monocular-light-injection',
  'image-processing/selfie-segmentation',
  'rendering/os-awards',
  'rendering/jelly-slider',
];
const BUILD = process.env.BUILD ?? 'baseline';
const DIST = process.env.DIST ?? 'dist';
const formats = FORMATS.filter((f) => READERS[f.label]);

const NOT_FREE = new Set([
  'globalThis',
  'undefined',
  'Math',
  'WeakMap',
  'arguments',
  'Symbol',
  'Number',
]);

/** Declares every identifier the snippets reference as a do-anything proxy */
function freeVarsPrelude(body: string): string {
  const names = new Set<string>();
  const visit = (node: any, parent: any, key: string) => {
    if (!node || typeof node.type !== 'string') return;
    if (
      node.type === 'Identifier' &&
      !(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) &&
      !(parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed)
    ) {
      names.add(node.name);
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc') continue;
      const child = node[k];
      if (Array.isArray(child)) child.forEach((c) => visit(c, node, k));
      else if (child && typeof child === 'object') visit(child, node, k);
    }
  };
  visit(parse(body, { sourceType: 'script' }).program, null, '');
  const vars = [...names].filter((n) => !NOT_FREE.has(n) && !n.startsWith('__tsover'));
  return `var __P=new Proxy(function(){},{get:()=>__P,apply:()=>__P});var ${vars.map((v) => `${v}=__P`).join(',')};\n`;
}

/** Reference AST for correctness checks (numbers inline where the format inlines them) */
function reference(m: Meta, label: string) {
  const numbers = [
    'current (v2)',
    'v2, impl not parenthesized',
    'A: shared helper',
    'B: A + slim fields',
  ].includes(label)
    ? 'text'
    : label.startsWith("D'")
      ? 'payload'
      : 'bare';
  const toNumber = (text: string) =>
    /^0[xb]/i.test(text) ? Number(text) : Number.parseFloat(text);
  const norm = (n: unknown): unknown => {
    if (!Array.isArray(n)) {
      return n && typeof n === 'object'
        ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, norm(v)]))
        : n;
    }
    if (numbers !== 'text' && n[0] === 5 && typeof n[1] === 'string') {
      return numbers === 'bare' ? toNumber(n[1]) : [5, toNumber(n[1])];
    }
    if (n[0] === 107) return n[1];
    return n.map(norm);
  };
  return { params: m.params, body: norm(m.body) };
}

const outDir = join(here, 'dist-bench');
mkdirSync(outDir, { recursive: true });
const results: Record<string, Record<string, Record<string, number>>> = {};

for (const example of EXAMPLES) {
  const assets = join(here, DIST, BUILD, example, 'assets');
  const code = readFileSync(
    join(assets, readdirSync(assets).find((f) => f.endsWith('.js')) as string),
    'utf8',
  );
  const metas = extract(code);
  const files: Record<string, string> = {};

  for (const format of formats) {
    const body = `${format.helper ?? ''}\n${metas.map((m) => format.encode(m)).join(';\n')};`;
    const src = freeVarsPrelude(body) + body;
    const file = join(outDir, `${example.replace('/', '--')}--${format.label.split(':')[0]}.js`);
    writeFileSync(file, src);
    files[format.label] = file;

    // Correctness: every format must decode to the same AST
    const fns: object[] = [];
    const map = new (class extends WeakMap<object, unknown> {
      override set(k: object, v: unknown) {
        fns.push(k);
        return super.set(k, v);
      }
    })();
    (globalThis as any).__TYPEGPU_META__ = map;
    vm.runInThisContext(src);
    fns.forEach((fn, i) => {
      const n = READERS[format.label](map.get(fn));
      const expected = reference(metas[i], format.label);
      const actual = reference(
        { ...metas[i], params: n.params, body: n.body } as Meta,
        'current (v2)',
      );
      const same =
        JSON.stringify(actual) ===
          JSON.stringify({ params: expected.params, body: expected.body }) &&
        n.name === metas[i].name &&
        Object.keys(n.externals).join() === metas[i].externals.map(([k]) => k).join();
      if (!same) {
        throw new Error(`${format.label} decoded ${example} fn #${i} differently`);
      }
    });
  }

  // Interleave formats across runs, so drift affects all of them equally
  const samples: Record<string, Record<string, number>[]> = {};
  for (let run = 0; run < RUNS; run++) {
    for (const format of formats) {
      const out = execFileSync(
        process.execPath,
        ['--expose-gc', import.meta.filename, 'child', files[format.label], format.label],
        { encoding: 'utf8' },
      );
      (samples[format.label] ??= []).push(JSON.parse(out));
    }
  }

  const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];
  results[example] = {};
  console.log(`\n${example} (${metas.length} fns, ${RUNS} cold runs, median)`);
  console.log(
    `${'format'.padEnd(26)}${['compile', 'run', 'read', 'total ms', 'heap reg.', 'heap norm.'].map((h) => h.padStart(11)).join('')}`,
  );
  for (const format of formats) {
    const s = samples[format.label];
    const r = Object.fromEntries(
      ['compile', 'run', 'read', 'heapRegistered', 'heapNormalized'].map((k) => [
        k,
        median(s.map((x) => x[k])),
      ]),
    );
    r.total = median(s.map((x) => x.compile + x.run + x.read));
    results[example][format.label] = r;
    console.log(
      `${format.label.padEnd(26)}${[r.compile, r.run, r.read, r.total].map((v) => v.toFixed(2).padStart(11)).join('')}${[r.heapRegistered, r.heapNormalized].map((v) => `${(v / 1024).toFixed(0)} KiB`.padStart(11)).join('')}`,
    );
  }
}

writeFileSync(join(here, `bench-results-${DIST}-${BUILD}.json`), JSON.stringify(results, null, 2));
