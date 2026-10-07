import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { variants, type Variant } from './variants.ts';

interface Run {
  variant: Variant;
  results: Record<string, number[]>;
  bytesPerVector: number;
  bytesPerAbstractVector: number;
  checksum: number;
}
const repeats = Number(process.env.VECTOR_REPEATS ?? 3);
if (!Number.isInteger(repeats) || repeats < 1)
  throw new Error('VECTOR_REPEATS must be a positive integer');
const selected = (process.env.VECTOR_VARIANTS?.split(',') ?? Object.keys(variants)) as Variant[];
if (!selected.includes('baseline')) selected.unshift('baseline');
for (const name of selected) if (!(name in variants)) throw new Error(`Unknown variant: ${name}`);
const runs: Run[] = [];
for (let repeat = 0; repeat < repeats; repeat++) {
  // Rotate ordering between fresh processes to reduce fixed-order thermal bias.
  const order = [
    ...selected.slice(repeat % selected.length),
    ...selected.slice(0, repeat % selected.length),
  ];
  for (const variant of order) {
    console.error(`Round ${repeat + 1}/${repeats}: ${variant}`);
    const child = spawnSync(
      process.execPath,
      ['--expose-gc', new URL('./worker.ts', import.meta.url).pathname, variant],
      { encoding: 'utf8', env: process.env },
    );
    if (child.status !== 0) throw new Error(child.stderr || String(child.error));
    runs.push(JSON.parse(child.stdout) as Run);
  }
}
function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}
const report = {
  runtime: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch,
  cpu: cpus()[0]?.model,
  date: new Date().toISOString(),
  repeats,
  runs,
};
const output = process.env.VECTOR_OUTPUT ?? 'vector-results.json';
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
const names = Object.keys((runs[0] as Run).results);
const rows = names.map((workload) => {
  const timings = Object.fromEntries(
    selected.map((variant) => {
      const medians = runs
        .filter((r) => r.variant === variant && r.results[workload])
        .map((r) => median(r.results[workload] as number[]));
      return [variant, medians.length ? median(medians) : undefined];
    }),
  );
  const baseline = timings.baseline as number;
  return Object.fromEntries([
    ['workload', workload],
    ['baseline ns/op', baseline.toFixed(1)],
    ...selected
      .filter((v) => v !== 'baseline')
      .map((v) => [
        v,
        timings[v] === undefined ? 'N/A' : `${(baseline / (timings[v] as number)).toFixed(2)}x`,
      ]),
  ]);
});
console.table(rows);
console.table(
  selected.map((variant) => ({
    variant,
    'retained bytes/vec3f (approx)': median(
      runs.filter((r) => r.variant === variant).map((r) => r.bytesPerVector),
    ).toFixed(1),
    'retained bytes/vec3 (approx)': median(
      runs.filter((r) => r.variant === variant).map((r) => r.bytesPerAbstractVector),
    ).toFixed(1),
  })),
);
console.log(
  `Ratios > 1 mean faster; median of process medians. Raw samples and environment: ${output}`,
);
