import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { render } from './report.ts';
const repeats = Number(process.env.VECTOR_REPEATS ?? 3);
if (!Number.isInteger(repeats) || repeats < 1) throw new Error('Invalid VECTOR_REPEATS');
const implementations = ['object', 'class', 'array', 'typegpu'];
const runs = [];
for (let round = 0; round < repeats; round++) {
  const order = [...implementations.slice(round % 4), ...implementations.slice(0, round % 4)];
  for (const implementation of order) {
    console.error(`Round ${round + 1}/${repeats}: ${implementation}`);
    const child = spawnSync(
      process.execPath,
      ['--expose-gc', new URL('./worker.ts', import.meta.url).pathname, implementation],
      { encoding: 'utf8', env: process.env },
    );
    if (child.status !== 0) throw new Error(child.stderr || String(child.error));
    runs.push(JSON.parse(child.stdout));
  }
}
const report = {
  runtime: process.version,
  v8: process.versions.v8,
  cpu: cpus()[0]?.model,
  platform: process.platform,
  arch: process.arch,
  date: new Date().toISOString(),
  repeats,
  settings: {
    samples: process.env.VECTOR_SAMPLES ?? 9,
    sampleMs: process.env.VECTOR_SAMPLE_MS ?? 12,
    warmupMs: process.env.VECTOR_WARMUP_MS ?? 60,
  },
  runs,
};
writeFileSync(
  process.env.VECTOR_OUTPUT ?? 'abstract-vector-results.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(render(report));
