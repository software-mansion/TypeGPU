import { describe, expect } from 'vitest';
import tgpu from '../src/index.js';
import { it } from 'typegpu-testing-utility';

describe('initAsync', () => {
  const computeFn = tgpu.computeFn({ workgroupSize: [1, 1, 1] })(() => {});

  describe('compute pipeline', () => {
    it('resolves and creates a pipeline', async ({ root, device }) => {
      const pipeline = root.createComputePipeline({ compute: computeFn });

      await pipeline.initAsync();

      expect(device.mock.createComputePipelineAsync).toHaveBeenCalled();
      expect(() => root.unwrap(pipeline)).not.toThrow(); // this means that memo already exists
      expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
        "@compute @workgroup_size(1, 1, 1) fn computeFn() {

        }"
      `);
      expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
    });

    it('throws when attempting to unwrap when not resolved', async ({ root, device }) => {
      const pipeline = root.createComputePipeline({ compute: computeFn });

      pipeline.initAsync();

      expect(() => root.unwrap(pipeline)).toThrowErrorMatchingInlineSnapshot(
        `[Error: 'pipeline.initAsync()' was called and is not yet resolved.]`,
      );
    });

    it('returns the promise again if not resolved', async ({ root, device }) => {
      const pipeline = root.createComputePipeline({ compute: computeFn });

      const p1 = pipeline.initAsync();
      const p2 = pipeline.initAsync();

      expect(p1).toBe(p2);
    });

    it('returns a resolved promise if pipeline was already created', async ({ root, device }) => {
      const pipeline = root.createComputePipeline({ compute: computeFn });

      root.unwrap(pipeline); // resolves & compiles the pipeline
      await pipeline.initAsync(); // should not enqueue device operations

      expect(device.mock.createComputePipeline).toHaveBeenCalled();
      expect(device.mock.createComputePipelineAsync).not.toHaveBeenCalled();
    });
  });
});
