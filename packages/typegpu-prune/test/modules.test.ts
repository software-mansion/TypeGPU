import { describe, expect, it } from 'vitest';
import { buildFixture, isTypegpuSource } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu, type LogEntry } from './utils/mockGpu.ts';

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

/**
 * Buffers, textures and samplers created, and every write, compared by content. TypeGPU and the
 * pruned runtime create them lazily, not necessarily in the same order, so the order is ignored.
 */
function resources(log: LogEntry[]) {
  return log
    .filter((entry) =>
      /^(buffer|buffer\.initialData|queue\.writeBuffer|texture|texture\.destroy|sampler)$/.test(
        entry.kind,
      ),
    )
    .map(({ kind, desc }) => {
      const { label: _label, ...rest } = (desc ?? {}) as Record<string, unknown>;
      return JSON.stringify([kind, rest]);
    })
    .toSorted();
}

interface Known {
  /** The pruned bundle still has TypeGPU in it, see the call */
  keepsTypegpu?: boolean;
  /** The pruned bundle throws or records different work, see the call */
  failsAtRuntime?: boolean;
}

/**
 * Builds a module fixture with and without precompiling, runs both on the mocked GPU, and checks
 * that the pruned one has no TypeGPU in it and records the same work.
 */
function describeModule(fixture: string, known: Known = {}) {
  describe(`${fixture} precompiled and instantiated at runtime`, async () => {
    const dev = await buildFixture(`modules/${fixture}.ts`, { precompile: false });
    const pruned = await buildFixture(`modules/${fixture}.ts`, { precompile: true });
    // A bundle runs once, when first imported
    const devLog = await runApp(dev.path);
    const { log: prunedLog, error } = await runApp(pruned.path).then(
      (log) => ({ log, error: undefined }),
      (error: unknown) => ({ log: [] as LogEntry[], error }),
    );

    it('has TypeGPU in the dev bundle, so that the check below checks something', () => {
      expect(dev.sources.filter(isTypegpuSource)).not.toStrictEqual([]);
    });

    (known.keepsTypegpu ? it.fails : it)('drops TypeGPU from the bundle', () => {
      expect(pruned.sources.filter(isTypegpuSource)).toStrictEqual([]);
      expect(pruned.code).not.toContain('typegpu/src');
    });

    const runs = known.failsAtRuntime ? it.fails : it;

    runs('records the same work as in TypeGPU', () => {
      expect(error).toBeUndefined();
      const work = describeGpuWork(prunedLog);
      expect(work.filter((call) => call.startsWith('dispatchWorkgroups')).length).toBeGreaterThan(
        0,
      );
      expect(work).toStrictEqual(describeGpuWork(devLog));
    });

    runs('creates and writes the same resources as in TypeGPU', () => {
      expect(error).toBeUndefined();
      expect(resources(prunedLog)).toStrictEqual(resources(devLog));
    });
  });
}

// esbuild keeps every member of a namespace re-exported with `export * as` once it is imported
// by name (`import { bitonicSort } from '@typegpu/algorithm'`), so `define()` and the TypeGPU
// objects it builds stay in the bundle. Rolldown drops them, keeping only `instantiate.ts` and
// its helpers. Subpath exports (`import * as bitonicSort from '@typegpu/algorithm/bitonic'`), as
// `@typegpu/radiance-cascades/holographic` has, would be tree-shaken by esbuild too
const namespaced: Known = { keepsTypegpu: true };

describeModule('bitonicSort', namespaced);
describeModule('radixSort', namespaced);
describeModule('prefixScan', namespaced);
// `perlin2d.cache.instantiate` and `perlin3d.cache.instantiate` take the size as a `d.v2u` and
// `d.v3u` and read it through swizzles (`io.size.xy`), which can't be made without TypeGPU at
// runtime. A vector precompiled in the definition has no swizzles either. Handed an object with
// those swizzles, the module records the same work, so a plain size (e.g. `{ width, height }`,
// as `jumpFlood` takes) would fix it
describeModule('perlinCache', { ...namespaced, failsAtRuntime: true });
describeModule('jumpFlood', namespaced);
describeModule('radianceCascades');
describeModule('holographic');
