import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tgpu, { d, std, type TgpuComptime } from 'typegpu';

interface ProcGenConfig {
  mainBranching: number;
  branching: number;
  maxDepth: number;
  recurseProb: number;
  seed: number;
  samples?: number;
}

// default config
const SAMPLES = 10;
const config: ProcGenConfig & { samples: number } = {
  mainBranching: 2,
  branching: 2,
  maxDepth: 3,
  recurseProb: 0.77,
  seed: 0.1882 * 2 ** 32,
  samples: SAMPLES,
};

// simple stateful PRNG
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
function splitmix32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x9e3779b9) | 0;
    let t = seed ^ (seed >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

let rand = splitmix32(config.seed);

const state = tgpu.lazy(() => ({
  stackDepth: 0,
}));

const instructions: TgpuComptime<() => () => void>[] = [];
const LEAF_COUNT = 4;

// TODO: replace it with number, when unroll supports that
const getArrayForUnroll = tgpu.comptime((n: number) => Array.from({ length: n }));
let branchingUnrollArray = getArrayForUnroll(config.branching);

const choice = tgpu.comptime((): number => {
  if (state.$.stackDepth == config.maxDepth - 1 || rand() > config.recurseProb) {
    state.$.stackDepth++;
    return Math.floor(rand() * LEAF_COUNT);
  }

  state.$.stackDepth++;
  return LEAF_COUNT + Math.floor(rand() * (instructions.length - LEAF_COUNT));
});

const popDepth = tgpu.comptime(() => {
  state.$.stackDepth--;
});

const timeAccessor = tgpu.accessor(d.f32, 0);
const colorAccessor = tgpu.accessor(d.vec3f, d.vec3f(1, 0.5, 0.2));

const phaseSlot = tgpu.slot(d.vec2f(0.0, 1.57));
const tintSlot = tgpu.slot(d.vec3f(0.2, 0.8, 0.4));

const dataLayout = tgpu.bindGroupLayout({
  offset: { uniform: d.vec2f },
  scale: { uniform: d.f32 },
});

const Cell = d.struct({
  col: d.vec3f,
});

const cellsLayout = tgpu.bindGroupLayout({
  grid: { storage: d.arrayOf(d.arrayOf(Cell, 7), 7) },
});

const baseFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      let v = d.vec2f(0.5, 0.5);
      v += 0.1;

      popDepth();
    })
    .$name('baseFn');
});

const blendFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      const base = d.vec3f(0.2, 0.4, 0.8);
      const target = colorAccessor.$;
      const t = std.fract(timeAccessor.$);
      const blended = std.mix(base, target, t);
      const _luma = std.dot(blended, d.vec3f(0.299, 0.587, 0.114));

      popDepth();
    })
    .$name('blendFn');
});

const thresholdFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      const tint = tintSlot.$;
      const v = tint.xy;
      const len = std.length(v);
      const edge = std.smoothstep(0.2, 0.8, len);
      const _result = d.vec3f(tint.x * edge, tint.y * edge, tint.z);

      popDepth();
    })
    .$name('thresholdFn');
});

const filterFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      const xy = d.vec2u(7, 8);

      let _result = d.vec3f();
      for (const dy of tgpu.unroll([-1, 0, 1])) {
        for (const dx of tgpu.unroll([-1, 0, 1])) {
          // oxlint-disable-next-line typescript-eslint(no-non-null-assertion)
          _result += cellsLayout.$.grid[xy.x + dx]![xy.y + dy]!.col;
        }
      }

      popDepth();
    })
    .$name('filterFn');
});

const waveFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      let v = d.vec2f(0.3, 0.7);
      v = d.vec2f(std.sin(v.x * Math.PI), std.cos(v.y * Math.PI));
      const _energy = std.dot(v, v);

      for (const _i of tgpu.unroll(branchingUnrollArray)) {
        // @ts-expect-error trust me
        instructions[choice()]()();
      }

      popDepth();
    })
    .$name('waveFn');
});

const accFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      const offset = dataLayout.$.offset;
      const scale = dataLayout.$.scale;
      let acc = d.vec2f();
      acc = d.vec2f(acc.x + offset.x * scale, acc.y + offset.y * scale);

      for (const _i of tgpu.unroll(branchingUnrollArray)) {
        // @ts-expect-error trust me
        instructions[choice()]()();
      }

      popDepth();
    })
    .$name('accFn');
});

const rotateFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      const phase = phaseSlot.$;
      const angle = phase.x + timeAccessor.$ * phase.y;
      let v = d.vec2f(1, 0);
      const c = std.cos(angle);
      const s = std.sin(angle);
      v = d.vec2f(v.x * c - v.y * s, v.x * s + v.y * c);

      for (const _i of tgpu.unroll(branchingUnrollArray)) {
        // @ts-expect-error trust me
        instructions[choice()]()();
      }

      popDepth();
    })
    .$name('rotateFn');
});

const spiralFn = tgpu.comptime(() => {
  return tgpu
    .fn(() => {
      'use gpu';

      const t = timeAccessor.$;
      const center = dataLayout.$.offset;
      const radius = 0.5 * std.sin(t * 2.0);
      const angle = t * Math.PI;
      const pos = d.vec2f(center.x + radius * std.cos(angle), center.y + radius * std.sin(angle));
      const _dist = std.length(pos);

      for (const _i of tgpu.unroll(branchingUnrollArray)) {
        // @ts-expect-error trust me
        instructions[choice()]()();
      }

      popDepth();
    })
    .$name('spiralFn');
});

// leaves first, then recursive
instructions.push(baseFn, blendFn, thresholdFn, filterFn, waveFn, accFn, rotateFn, spiralFn);

const main = () => {
  'use gpu';

  for (const _i of tgpu.unroll(getArrayForUnroll(config.mainBranching))) {
    // @ts-expect-error trust me
    instructions[choice()]()();
  }
};

export interface BenchmarkResult {
  maxDepth: number;
  timeMs: number;
  wgslLength: number;
}

function benchmarkResolve(): BenchmarkResult {
  const start = performance.now();
  const wgsl = tgpu.resolve([main]);
  const timeMs = performance.now() - start;
  return { maxDepth: config.maxDepth, timeMs, wgslLength: wgsl.length };
}

const outDir = resolve(import.meta.dirname ?? '.', '.');

function runBenchmark(input: ProcGenConfig, output: BenchmarkResult[]) {
  Object.assign(config, { samples: input.samples ?? SAMPLES }, input);
  branchingUnrollArray = getArrayForUnroll(config.branching);

  for (let i = 0; i < config.samples; i++) {
    rand = splitmix32(config.seed);
    const result = benchmarkResolve();
    output.push(result);
    console.log(
      `iteration=${i}  maxDepth=${config.maxDepth}  time=${result.timeMs.toFixed(
        2,
      )}ms  wgsl=${result.wgslLength} chars`,
    );
  }
}

function warmupJIT() {
  runBenchmark(
    {
      mainBranching: 1,
      branching: 1,
      maxDepth: 1,
      recurseProb: 0,
      seed: 0.1882 * 2 ** 32,
    },
    [],
  );
}

warmupJIT();

const results: BenchmarkResult[] = [];
const DEPTHS = Array.from({ length: 8 }, (_, i) => i + 1);

// resolution time vs max depth (full tree)
for (const depth of DEPTHS) {
  runBenchmark(
    {
      mainBranching: 2,
      branching: 2,
      maxDepth: depth,
      recurseProb: 1,
      seed: depth * 2 ** 24,
    },
    results,
  );
}
writeFileSync(resolve(outDir, 'results-max-depth.json'), JSON.stringify(results, null, 2));
results.length = 0;

// resolution time vs linear recursion (path)
for (const depth of DEPTHS) {
  runBenchmark(
    {
      mainBranching: 1,
      branching: 1,
      maxDepth: depth,
      recurseProb: 1,
      seed: depth * 2 ** 24,
    },
    results,
  );
}
writeFileSync(resolve(outDir, 'results-linear-recursion.json'), JSON.stringify(results, null, 2));
results.length = 0;

// resolution time vs random
for (const depth of DEPTHS) {
  runBenchmark(
    {
      mainBranching: 3,
      branching: 3,
      maxDepth: depth,
      recurseProb: 0.5,
      seed: depth * 2 ** 24,
    },
    results,
  );
}
writeFileSync(resolve(outDir, 'results-random.json'), JSON.stringify(results, null, 2));
results.length = 0;
