import { describe, expect, it } from 'vitest';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

const created = (log: { kind: string }[]) => ({
  async: log.filter((entry) => entry.kind === 'device.createComputePipelineAsync').length,
  all: log.filter((entry) => entry.kind === 'computePipeline').length,
});

describe('initAsync', async () => {
  const dev = await buildFixture('initAsync/index.ts', { precompile: false });
  const pruned = await buildFixture('initAsync/index.ts', { precompile: true });

  it('creates the pipeline once, without blocking, as in TypeGPU', async () => {
    const devLog = await runApp(dev.path);
    const prunedLog = await runApp(pruned.path);

    expect(created(devLog)).toStrictEqual({ async: 1, all: 1 });
    expect(created(prunedLog)).toStrictEqual({ async: 1, all: 1 });
    expect(describeGpuWork(prunedLog)).toStrictEqual(describeGpuWork(devLog));
  });
});
