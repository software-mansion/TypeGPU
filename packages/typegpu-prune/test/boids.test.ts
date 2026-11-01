import { describe, expect, it } from 'vitest';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

async function runApp(path: string) {
  // The same "random" positions in both runs
  let seed = 1;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const log = installMockGpu({ frames: 2 });
  await import(path);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return log;
}

describe('boids example', async () => {
  const dev = await buildFixture('boids/index.ts', { precompile: false, minify: true });
  const pruned = await buildFixture('boids/index.ts', { precompile: true, minify: true });

  it('leaves TypeGPU out of the pruned bundle', () => {
    expect(dev.code).toContain('Resolution of the following tree failed');
    expect(pruned.code).not.toContain('Resolution of the following tree failed');
    expect(pruned.code.length).toBeLessThan(dev.code.length / 10);
  });

  it('does the same GPU work in both builds', async () => {
    const devWork = describeGpuWork(await runApp(dev.path));
    const prunedWork = describeGpuWork(await runApp(pruned.path));

    expect(devWork.length).toBeGreaterThan(10);
    expect(prunedWork).toStrictEqual(devWork);
  });
});
