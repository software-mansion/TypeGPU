import tgpu, { type TgpuComputeFn } from 'typegpu';
import * as d from 'typegpu/data';

const BUFFER_SIZE = 2048;

const benchmarkLayout = tgpu.bindGroupLayout({
  buffer: { storage: d.arrayOf(d.u32, BUFFER_SIZE), access: 'mutable' },
});

// Compute functions
const basicInlined = tgpu['~unstable'].computeFn({
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

const basic = tgpu['~unstable'].computeFn({
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

const complexInlined = tgpu['~unstable'].computeFn({
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

const complex = tgpu['~unstable'].computeFn({
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

const processElement = tgpu.fn([d.u32, d.u32], d.u32)((value, index) => {
  return add(multiply(value, 2), index);
});

const conditionalProcess = tgpu.fn([d.u32, d.u32], d.u32)(
  (value, threshold) => {
    if (value > threshold) {
      return multiply(value, 3);
    }
    return add(value, 1);
  },
);

const branchingOperations = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})`{
  let bufferValue = targetBuffer[in.gid.x];
  var result = bufferValue;

  for (var i = 0u; i < 10u; i++) {
    result = processElement(result, i);

    if (result > 100u) {
      result = conditionalProcess(result, 50u);
    } else {
      result = add(result, multiply(i, 2));
    }

    for (var j = 0u; j < 5u; j++) {
      if (j % 2u == 0u) {
        result = multiply(result, 2);
      } else {
        result = add(result, j);
      }
    }
  }

  targetBuffer[in.gid.x] = result;
}`.$uses({
  targetBuffer: benchmarkLayout.bound.buffer,
  add,
  multiply,
  processElement,
  conditionalProcess,
});

const branchingOperationsInlined = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})`{
  let bufferValue = targetBuffer[in.gid.x];
  var result = bufferValue;

  for (var i = 0u; i < 10u; i++) {
    result = (result * 2) + i;

    if (result > 100u) {
      if (result > 50u) {
        result = result * 3;
      } else {
        result = result + 1;
      }
    } else {
      result = result + (i * 2);
    }

    for (var j = 0u; j < 5u; j++) {
      if (j % 2u == 0u) {
        result = result * 2;
      } else {
        result = result + j;
      }
    }
  }

  targetBuffer[in.gid.x] = result;
}`.$uses({
  targetBuffer: benchmarkLayout.bound.buffer,
});

const benchmarkPairs = {
  'Basic Operations': {
    'Function Calls': {
      name: 'With Function Calls',
      entrypoint: basic,
    },
    'Inlined': {
      name: 'Inlined Operations',
      entrypoint: basicInlined,
    },
  },
  'Complex Operations': {
    'Function Calls': {
      name: 'With Function Calls',
      entrypoint: complex,
    },
    'Inlined': {
      name: 'Inlined Operations',
      entrypoint: complexInlined,
    },
  },
  'Branching Operations': {
    'Function Calls': {
      name: 'With Function Calls',
      entrypoint: branchingOperations,
    },
    'Inlined': {
      name: 'Inlined Operations',
      entrypoint: branchingOperationsInlined,
    },
  },
};

async function createBenchmarkSetup(
  entrypoint: TgpuComputeFn,
  initialData?: number[],
) {
  const root = await tgpu.init({
    device: {
      requiredFeatures: ['timestamp-query'],
    },
  });

  const targetBuffer = root.createBuffer(d.arrayOf(d.u32, BUFFER_SIZE)).$usage(
    'storage',
  );
  if (initialData) {
    targetBuffer.write(initialData);
  }

  const bindGroup = root.createBindGroup(benchmarkLayout, {
    buffer: targetBuffer,
  });
  const pipeline = root['~unstable'].withCompute(entrypoint).createPipeline()
    .with(benchmarkLayout, bindGroup);

  const querySet = root.createQuerySet('timestamp', 2);

  return { root, pipeline, querySet };
}

async function runSingleMeasurement(
  setup: Awaited<ReturnType<typeof createBenchmarkSetup>>,
  iterations = 1_000,
) {
  const { root, pipeline, querySet } = setup;

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
  return Number(end - start);
}

type BenchmarkOptions = {
  iterations?: number;
  times?: number;
  warmup?: boolean;
  timeLimitMs?: number;
};

type PipelineConfig = { name: string; entrypoint: TgpuComputeFn };

async function runInterleavedBenchmarkPair(
  pairName: string,
  pipelineConfigs: Record<string, PipelineConfig>,
  options?: BenchmarkOptions,
) {
  const {
    iterations = 1_000,
    times = 100_000,
    warmup = true,
    timeLimitMs = 10_000,
  } = options || {};

  console.log(`\nSetting up benchmark pair: ${pairName}`);

  const initialData = Array.from(
    { length: BUFFER_SIZE },
    () => Math.floor(Math.random() * 101),
  );

  const setups = {} as Record<
    string,
    Awaited<ReturnType<typeof createBenchmarkSetup>>
  >;
  const results = {} as Record<
    string,
    { measurements: number[]; runningAverage: number; runs: number }
  >;

  for (const [key, config] of Object.entries(pipelineConfigs)) {
    console.groupCollapsed(`Pipeline Details: ${config.name}`);
    console.log(tgpu.resolve({ externals: { pipeline: config.entrypoint } }));
    console.groupEnd();

    setups[key] = await createBenchmarkSetup(config.entrypoint, initialData);
    results[key] = { measurements: [], runningAverage: 0, runs: 0 };

    if (warmup) {
      for (let i = 0; i < Math.floor(times / 10); i++) {
        await runSingleMeasurement(setups[key], iterations);
      }
    }
  }

  const startTime = performance.now();
  const pipelineKeys = Object.keys(pipelineConfigs);

  let totalRuns = 0;
  for (
    let i = 0;
    i < times && (performance.now() - startTime) < timeLimitMs;
    i++
  ) {
    for (const key of pipelineKeys) {
      if ((performance.now() - startTime) >= timeLimitMs) break;

      const measurement = await runSingleMeasurement(setups[key], iterations);
      results[key].measurements.push(measurement);
      results[key].runs++;

      results[key].runningAverage = results[key].runningAverage +
        (measurement - results[key].runningAverage) / results[key].runs;

      totalRuns++;
    }
  }

  for (const setup of Object.values(setups)) {
    setup.root.destroy();
  }

  const finalResults = {} as Record<string, {
    name: string;
    averageTimeNs: number;
    averageTimeMs: number;
    runs: number;
    minTimeMs: number;
    maxTimeMs: number;
    stdDevMs: number;
  }>;

  for (const [key, result] of Object.entries(results)) {
    const avgNs = result.runningAverage;
    const avgMs = avgNs / 1_000_000;
    const measurementsMs = result.measurements.map((m) => m / 1_000_000);
    const minMs = Math.min(...measurementsMs);
    const maxMs = Math.max(...measurementsMs);
    const variance = measurementsMs.reduce((acc, val) =>
      acc + (val - avgMs) ** 2, 0) / measurementsMs.length;
    const stdDevMs = Math.sqrt(variance);

    finalResults[key] = {
      name: pipelineConfigs[key].name,
      averageTimeNs: avgNs,
      averageTimeMs: avgMs,
      runs: result.runs,
      minTimeMs: minMs,
      maxTimeMs: maxMs,
      stdDevMs: stdDevMs,
    };
  }

  return { pairName, results: finalResults, totalRuns };
}

async function runAllBenchmarkPairs(options?: BenchmarkOptions) {
  console.log(
    `Running ${Object.keys(benchmarkPairs).length} benchmark pairs...`,
  );

  const allResults = [];

  for (const [pairName, pipelineConfigs] of Object.entries(benchmarkPairs)) {
    const pairResult = await runInterleavedBenchmarkPair(
      pairName,
      pipelineConfigs,
      options,
    );
    allResults.push(pairResult);
  }

  return allResults;
}

function displayResults(
  allResults: Awaited<ReturnType<typeof runAllBenchmarkPairs>>,
) {
  console.log('\n=== Benchmark Results ===');

  for (const { pairName, results, totalRuns } of allResults) {
    console.log(`\n${pairName} (${totalRuns} total measurements)`);
    console.log('-'.repeat(60));

    const tableData = Object.fromEntries(
      Object.entries(results).map(([key, result]) => [
        result.name,
        {
          'Avg Time (ms)': result.averageTimeMs.toFixed(3),
          'Min (ms)': result.minTimeMs.toFixed(3),
          'Max (ms)': result.maxTimeMs.toFixed(3),
          'Std Dev (ms)': result.stdDevMs.toFixed(3),
          'Runs': result.runs,
        },
      ]),
    );

    console.table(tableData);

    const resultEntries = Object.entries(results);
    if (resultEntries.length === 2) {
      const [first, second] = resultEntries;
      const [, firstResult] = first;
      const [, secondResult] = second;

      const ratio = firstResult.averageTimeMs / secondResult.averageTimeMs;
      const faster = ratio > 1 ? secondResult.name : firstResult.name;
      const slower = ratio > 1 ? firstResult.name : secondResult.name;
      const speedup = Math.abs(ratio - 1) * 100;

      console.log(`${faster} is ${speedup.toFixed(1)}% faster than ${slower}`);
    }
  }
}

const allResults = await runAllBenchmarkPairs({
  iterations: 1000,
  times: 1000,
  warmup: true,
  timeLimitMs: 10_000,
});

displayResults(allResults);

export function onCleanup() {
}
