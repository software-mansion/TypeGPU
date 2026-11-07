import { describe, expect, it } from 'vitest';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

describe('compute pipelines with a pass or encoder', async () => {
  const dev = await buildFixture('sharedPass/index.ts', { precompile: false });
  const pruned = await buildFixture('sharedPass/index.ts', { precompile: true });

  it('records into the given pass and encoder, as in TypeGPU', async () => {
    const devWork = describeGpuWork(await runApp(dev.path));
    const prunedWork = describeGpuWork(await runApp(pruned.path));

    expect(devWork.filter((call) => call.startsWith('beginComputePass'))).toHaveLength(2);
    expect(devWork.filter((call) => call.startsWith('dispatchWorkgroups'))).toHaveLength(3);
    expect(prunedWork).toStrictEqual(devWork);
  });
});
