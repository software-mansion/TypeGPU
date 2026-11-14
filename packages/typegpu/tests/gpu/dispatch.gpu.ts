import { d, std, type TgpuRoot } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';

// `dispatchThreads` rounds the number of workgroups up and guards the rest in the shader, so
// every requested thread has to run exactly once and no extra thread may run. Each case counts
// the visits per cell with an atomic counter, in a buffer larger than the requested range.
// The guarded workgroup size depends on the number of dimensions: 1 thread for no arguments,
// 256 for 1D, 16x16 for 2D and 8x8x4 for 3D.

const SLACK = 4096;

/** Index of the first cell visited a wrong number of times, or -1 if all are right. */
const firstWrongCell = (visits: number[], expectedOnes: number) =>
  visits.findIndex((count, index) => count !== (index < expectedOnes ? 1 : 0));

function createCounters(root: TgpuRoot, cells: number) {
  return root.createMutable(d.arrayOf(d.atomic(d.u32), cells + SLACK));
}

describe('dispatchThreads on a real device', () => {
  // around the 1D workgroup size of 256, and well beyond a single workgroup
  const sizes1d = [1, 2, 63, 255, 256, 257, 511, 512, 513, 1000, 65_536, 100_000];

  for (const size of sizes1d) {
    gpuIt(`1D, ${size} threads`, async ({ root }) => {
      const visits = createCounters(root, size);

      root
        .createGuardedComputePipeline((x) => {
          'use gpu';
          std.atomicAdd(visits.$[x]!, 1);
        })
        .dispatchThreads(size);

      expect(
        firstWrongCell(await visits.read(), size),
        `cell visited a wrong number of times (size ${size})`,
      ).toBe(-1);
    });
  }

  gpuIt('0D, a single thread', async ({ root }) => {
    const visits = createCounters(root, 1);

    root
      .createGuardedComputePipeline(() => {
        'use gpu';
        std.atomicAdd(visits.$[0]!, 1);
      })
      .dispatchThreads();

    expect(firstWrongCell(await visits.read(), 1)).toBe(-1);
  });

  // around the 2D workgroup size of 16x16, including non-square and degenerate shapes
  const sizes2d = [
    [1, 1],
    [15, 15],
    [16, 16],
    [17, 17],
    [17, 3],
    [3, 33],
    [100, 100],
    [255, 1],
    [1, 255],
  ] as const;

  for (const [width, height] of sizes2d) {
    gpuIt(`2D, ${width}x${height} threads`, async ({ root }) => {
      const visits = createCounters(root, width * height);

      root
        .createGuardedComputePipeline((x, y) => {
          'use gpu';
          std.atomicAdd(visits.$[y * width + x]!, 1);
        })
        .dispatchThreads(width, height);

      expect(firstWrongCell(await visits.read(), width * height), `size ${width}x${height}`).toBe(
        -1,
      );
    });
  }

  // around the 3D workgroup size of 8x8x4
  const sizes3d = [
    [1, 1, 1],
    [7, 7, 3],
    [8, 8, 4],
    [9, 9, 5],
    [3, 4, 5],
    [20, 2, 9],
  ] as const;

  for (const [width, height, depth] of sizes3d) {
    gpuIt(`3D, ${width}x${height}x${depth} threads`, async ({ root }) => {
      const visits = createCounters(root, width * height * depth);

      root
        .createGuardedComputePipeline((x, y, z) => {
          'use gpu';
          std.atomicAdd(visits.$[(z * height + y) * width + x]!, 1);
        })
        .dispatchThreads(width, height, depth);

      expect(
        firstWrongCell(await visits.read(), width * height * depth),
        `size ${width}x${height}x${depth}`,
      ).toBe(-1);
    });
  }

  gpuIt('follows a changing size when the same pipeline is dispatched again', async ({ root }) => {
    const visits = createCounters(root, 1000);
    const pipeline = root.createGuardedComputePipeline((x) => {
      'use gpu';
      std.atomicAdd(visits.$[x]!, 1);
    });

    // visits accumulate, so the expected count of cell i is the number of dispatches covering it
    const sizes = [100, 10, 300, 300, 1];
    const expected = Array.from({ length: 1000 + SLACK }, () => 0);
    for (const size of sizes) {
      pipeline.dispatchThreads(size);
      for (let i = 0; i < size; i++) {
        expected[i] = (expected[i] as number) + 1;
      }
    }

    expect(await visits.read()).toStrictEqual(expected);
  });
});
