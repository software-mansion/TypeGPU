import { describe, expect, it } from 'vitest';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

describe('a module instantiated on the pruned root', async () => {
  const dev = await buildFixture('module/index.ts', { precompile: false });
  const pruned = await buildFixture('module/index.ts', { precompile: true });
  // A bundle runs once, when first imported
  const devLog = await runApp(dev.path);
  const prunedLog = await runApp(pruned.path);

  it('drops TypeGPU from the bundle', () => {
    expect(pruned.code).not.toContain('typegpu/src');
  });

  it('records the same work as in TypeGPU', () => {
    const work = describeGpuWork(prunedLog);

    expect(work.filter((call) => call.startsWith('dispatchWorkgroups'))).toHaveLength(4);
    expect(work.filter((call) => call.startsWith('draw'))).toHaveLength(4);
    expect(work).toStrictEqual(describeGpuWork(devLog));
  });

  it('creates textures and views as TypeGPU does', () => {
    const textures = (log: { kind: string; desc: unknown }[]) =>
      log
        .filter((entry) => entry.kind.startsWith('texture'))
        .map(({ kind, desc }) => {
          const { label: _label, ...rest } = (desc ?? {}) as Record<string, unknown>;
          return [kind, rest];
        });

    expect(textures(prunedLog)).toStrictEqual(textures(devLog));
    expect(textures(prunedLog).filter(([kind]) => kind === 'texture.destroy')).toHaveLength(2);
  });

  it('writes runtime-sized arrays as TypeGPU does', () => {
    const writes = (log: { kind: string; desc: unknown }[]) =>
      log
        .filter(
          (entry) => entry.kind === 'queue.writeBuffer' || entry.kind === 'buffer.initialData',
        )
        .map(({ desc }) => desc);

    expect(writes(prunedLog)).toHaveLength(3);
    // Every value made it through the codecs, none written as NaN
    expect(JSON.stringify(writes(prunedLog))).not.toContain('192,127');
    expect(writes(prunedLog)).toStrictEqual(writes(devLog));
  });
});
