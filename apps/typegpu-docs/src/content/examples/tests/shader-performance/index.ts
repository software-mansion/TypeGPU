import tgpu, { type TgpuComputeFn } from 'typegpu';
import * as d from 'typegpu/data';

const BUFFER_SIZE = 2048;

const benchmarkLayout = tgpu.bindGroupLayout({
  buffer: { storage: d.arrayOf(d.u32, BUFFER_SIZE), access: 'mutable' },
});

// Compute functions
const basicCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})`{
  let bufferValue = targetBuffer[in.gid.x];
  var x = 1 + in.gid.x + bufferValue;
  var y = 2 + 3 + x;
  var z = y + bufferValue;
  var w = z + bufferValue;
  targetBuffer[in.gid.x] = x + y + z + w;
}`.$uses({
  targetBuffer: benchmarkLayout.bound.buffer,
});

const add = tgpu.fn([d.u32, d.u32], d.u32)((a, b) => a + b);

const functionCallCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})`{
  let bufferValue = targetBuffer[in.gid.x];
  var x = add(add(in.gid.x, 1), bufferValue);
  var y = add(add(2, 3), x);
  var z = add(y, bufferValue);
  var w = add(z, bufferValue);
  targetBuffer[in.gid.x] = add(add(add(x, y), z), w);
}`.$uses({
  targetBuffer: benchmarkLayout.bound.buffer,
  add,
});

const inlinedMathCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})`{
  let bufferValue = targetBuffer[in.gid.x];
  var a = ((((in.gid.x + bufferValue) + (bufferValue * 2)) * 3 + (in.gid.x + bufferValue) * 2 + 7) * ((bufferValue * 2) * 3 + (in.gid.x + bufferValue) + 7) + ((((in.gid.x + bufferValue) + (bufferValue * 2)) * 3 + (in.gid.x + bufferValue) * 2 + 7) * 3 + ((bufferValue * 2) * 3 + (in.gid.x + bufferValue) + 7) + 7)) * 3 + (((in.gid.x + bufferValue) + (bufferValue * 2)) * 3 + (in.gid.x + bufferValue) * 2 + 7) * ((bufferValue * 2) * 3 + (in.gid.x + bufferValue) + 7) * 2 + 7;
  var b = a + ((bufferValue * in.gid.x + bufferValue * 3 + in.gid.x + 7) * 3 + bufferValue * in.gid.x * 2 + 7);
  var c = b * ((in.gid.x + 5) * 3 + in.gid.x * 2 + 7);
  var d = c + (a * 3 + bufferValue + 7);
  targetBuffer[in.gid.x] = d;
}`.$uses({
  targetBuffer: benchmarkLayout.bound.buffer,
});

// Nested function calls (4 levels deep)
const multiply = tgpu.fn([d.u32, d.u32], d.u32)((a, b) => a * b);

const level4Fn = tgpu.fn([d.u32, d.u32], d.u32)((a, b) => {
  return add(multiply(a, 3), add(b, 7));
});

const level3Fn = tgpu.fn([d.u32, d.u32], d.u32)((a, b) => {
  return level4Fn(add(a, b), multiply(a, 2));
});

const level2Fn = tgpu.fn([d.u32, d.u32], d.u32)((a, b) => {
  return level3Fn(multiply(a, b), level4Fn(a, b));
});

const level1Fn = tgpu.fn([d.u32, d.u32], d.u32)((a, b) => {
  return level2Fn(level3Fn(a, b), level4Fn(b, a));
});

const nestedFunctionCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})`{
  let bufferValue = targetBuffer[in.gid.x];
  var a = level1Fn(add(in.gid.x, bufferValue), multiply(bufferValue, 2));
  var b = add(a, level2Fn(bufferValue, in.gid.x));
  var c = multiply(b, level3Fn(in.gid.x, 5));
  var d = add(c, level4Fn(a, bufferValue));
  targetBuffer[in.gid.x] = d;
}`.$uses({
  targetBuffer: benchmarkLayout.bound.buffer,
  add,
  multiply,
  level1Fn,
  level2Fn,
  level3Fn,
  level4Fn,
});

// Pipeline configurations
const pipelines = {
  basic: {
    name: 'Basic Arithmetic',
    entrypoint: basicCompute,
  },
  functionCall: {
    name: 'Function Call',
    entrypoint: functionCallCompute,
  },
  nestedFunction: {
    name: 'Nested Function Calls',
    entrypoint: nestedFunctionCompute,
  },
  inlinedMath: {
    name: 'Inlined Nested Function Calls',
    entrypoint: inlinedMathCompute,
  },
} as const;

async function runBenchmark(
  entrypoint: TgpuComputeFn,
  name: string,
  options?: {
    iterations?: number;
    times?: number;
    warmup?: boolean;
    timeLimitMs?: number;
  },
) {
  const root = await tgpu.init({
    device: {
      requiredFeatures: ['timestamp-query'],
    },
  });
  const targetBuffer = root.createBuffer(d.arrayOf(d.u32, BUFFER_SIZE)).$usage(
    'storage',
  );
  const bindGroup = root.createBindGroup(benchmarkLayout, {
    buffer: targetBuffer,
  });
  const pipeline = root['~unstable'].withCompute(entrypoint).createPipeline()
    .with(benchmarkLayout, bindGroup);

  const {
    iterations = 1_000,
    times = 100_000,
    warmup = true,
    timeLimitMs = 10_000,
  } = options || {};

  console.groupCollapsed(`Pipeline Details: ${name}`);
  console.log(tgpu.resolve({ externals: { pipeline } }));
  console.groupEnd();

  if (warmup) {
    for (let i = 0; i < Math.floor(times / 2); i++) {
      pipeline.dispatchWorkgroups(BUFFER_SIZE);
    }
  }

  const querySet = root.createQuerySet('timestamp', 2);
  let runningAverage = 0;
  const startTime = Date.now();

  let actualTimes = 0;
  for (let i = 0; i < times && (Date.now() - startTime) < timeLimitMs; i++) {
    pipeline.withTimestampWrites({
      querySet,
      beginningOfPassWriteIndex: 0,
    }).dispatchWorkgroups(BUFFER_SIZE);

    for (let j = 1; j < iterations - 1; j++) {
      pipeline.dispatchWorkgroups(BUFFER_SIZE);
    }

    pipeline.withTimestampWrites({
      querySet,
      endOfPassWriteIndex: 1,
    }).dispatchWorkgroups(BUFFER_SIZE);

    root['~unstable'].flush();

    querySet.resolve();
    const [start, end] = await querySet.read();
    const currentTime = Number(end - start);

    actualTimes++;
    runningAverage = runningAverage +
      (currentTime - runningAverage) / actualTimes;
  }

  const avgTimeMs = runningAverage / 1_000_000;

  root.destroy();

  return {
    averageTimeNs: runningAverage,
    averageTimeMs: avgTimeMs,
    runs: actualTimes,
  };
}

async function runAllBenchmarks(options?: Parameters<typeof runBenchmark>[2]) {
  console.log(`Running ${Object.keys(pipelines).length} benchmarks...`);

  const results: Record<string, Awaited<ReturnType<typeof runBenchmark>>> = {};

  for (const [key, { name, entrypoint }] of Object.entries(pipelines)) {
    results[key] = await runBenchmark(entrypoint, name, options);
  }

  return results;
}

// Run benchmarks
const results = await runAllBenchmarks();

console.log('\nBenchmark Results:');
console.table(Object.fromEntries(
  Object.entries(results).map(([key, result]) => [
    pipelines[key as keyof typeof pipelines].name,
    {
      'Avg Time (ms)': result.averageTimeMs.toFixed(3),
      'Runs': result.runs,
      'Avg Time (ns)': result.averageTimeNs.toFixed(0),
    },
  ]),
));

export function onCleanup() {
}
