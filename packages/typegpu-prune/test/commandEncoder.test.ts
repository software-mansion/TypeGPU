import { describe, expect, it } from 'vitest';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

describe('root.createCommandEncoder()', async () => {
  const dev = await buildFixture('commandEncoder/index.ts', { precompile: false });
  const pruned = await buildFixture('commandEncoder/index.ts', { precompile: true });

  it('batches passes into one submission, as in TypeGPU', async () => {
    const devLog = await runApp(dev.path);
    const prunedLog = await runApp(pruned.path);
    const submits = (log: { kind: string }[]) =>
      log.filter((entry) => entry.kind === 'queue.submit').length;

    expect(submits(devLog)).toBe(1);
    expect(submits(prunedLog)).toBe(1);
    expect(describeGpuWork(prunedLog)).toStrictEqual(describeGpuWork(devLog));
  });
});
