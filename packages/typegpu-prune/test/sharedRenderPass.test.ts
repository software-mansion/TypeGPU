import { describe, expect, it } from 'vitest';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

describe('render pipelines with an encoder or pass', async () => {
  const dev = await buildFixture('sharedRenderPass/index.ts', { precompile: false });
  const pruned = await buildFixture('sharedRenderPass/index.ts', { precompile: true });

  it('records into the given encoder and pass, as in TypeGPU', async () => {
    const devLog = await runApp(dev.path);
    const prunedLog = await runApp(pruned.path);
    const submits = (log: { kind: string }[]) =>
      log.filter((entry) => entry.kind === 'queue.submit').length;

    expect(submits(devLog)).toBe(1);
    expect(submits(prunedLog)).toBe(1);
    expect(describeGpuWork(devLog).filter((call) => call.startsWith('draw'))).toHaveLength(2);
    expect(describeGpuWork(prunedLog)).toStrictEqual(describeGpuWork(devLog));
  });
});
