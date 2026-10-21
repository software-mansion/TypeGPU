/**
 * Measures how long it takes to load and evaluate whole production bundles, e.g. to compare
 * builds of two branches (DIST_A vs DIST_B, as produced by `measure.ts`).
 *
 * Each run is a fresh Node process that imports the bundle. Without WebGPU, the apps stop at
 * `tgpu.init()`, which comes after all module-level code (including registering metadata of
 * every 'use gpu' function) has run. Runs of A and B are interleaved.
 *
 * Usage: DIST_A=dist-pr2 DIST_B=dist-pr3 node evaluate.ts [runs]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;

if (process.argv[2] === 'child') {
  // Vite's modulepreload polyfill touches `document`
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ relList: { supports: () => true } }),
  };
  const file = process.argv[3];
  const start = performance.now();
  try {
    await import(pathToFileURL(file).href);
  } catch {
    // Expected: no WebGPU
  }
  console.log(performance.now() - start);
  process.exit(0);
}

const RUNS = Number(process.argv[2] ?? 31);
const A = process.env.DIST_A ?? 'dist-pr2';
const B = process.env.DIST_B ?? 'dist-pr3';
const BUILD = process.env.BUILD ?? 'baseline';
const EXAMPLES = [
  'image-processing/monocular-light-injection',
  'image-processing/selfie-segmentation',
  'rendering/os-awards',
  'rendering/jelly-slider',
];

const bundleOf = (dist: string, example: string) => {
  const assets = join(here, dist, BUILD, example, 'assets');
  return join(assets, readdirSync(assets).find((f) => f.endsWith('.js')) as string);
};
const run = (file: string) =>
  Number(
    execFileSync(process.execPath, [import.meta.filename, 'child', file], { encoding: 'utf8' }),
  );
const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];

const results: Record<string, { a: number; b: number }> = {};
for (const example of EXAMPLES) {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    a.push(run(bundleOf(A, example)));
    b.push(run(bundleOf(B, example)));
  }
  results[example] = { a: median(a), b: median(b) };
  const { a: ma, b: mb } = results[example];
  console.log(
    `${example}: ${A} ${ma.toFixed(2)} ms, ${B} ${mb.toFixed(2)} ms (${(((mb - ma) / ma) * 100).toFixed(1)}%)`,
  );
}
writeFileSync(join(here, `evaluate-${A}-vs-${B}-${BUILD}.json`), JSON.stringify(results, null, 2));
