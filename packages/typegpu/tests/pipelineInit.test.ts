import { describe, expect } from 'vitest';
import tgpu from '../src/index.js';
import { it } from 'typegpu-testing-utility';

describe('pipeline initialization', () => {
  describe('compute pipeline', () => {
    const computeFn = tgpu.computeFn({ workgroupSize: [1, 1, 1] })(() => {});
    describe('initSync', () => {
      it('resolves and creates a pipeline', ({ root, device }) => {
        const pipeline = root.createComputePipeline({ compute: computeFn });

        pipeline.initSync();

        expect(device.mock.createComputePipeline).toHaveBeenCalled();
        expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
          "@compute @workgroup_size(1, 1, 1) fn computeFn() {

          }"
        `);
      });
    });

    describe('initAsync', () => {
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

        // oxlint-disable-next-line typescript-eslint/no-floating-promises -- it's a test
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

  describe('guarded compute pipeline', () => {
    describe('initSync', () => {
      it('resolves and creates a pipeline', ({ root, device }) => {
        const pipeline = root.createGuardedComputePipeline(() => {
          'use gpu';
        });

        pipeline.initSync();

        expect(device.mock.createComputePipeline).toHaveBeenCalled();
        expect(tgpu.resolve([pipeline.pipeline])).toMatchInlineSnapshot(`
          "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

          fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {

          }

          @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
            if (any(id >= sizeUniform)) {
              return;
            }
            wrappedCallback(id.x, id.y, id.z);
          }"
        `);
      });
    });

    describe('initAsync', () => {
      it('resolves and creates a pipeline', async ({ root, device }) => {
        const pipeline = root.createGuardedComputePipeline(() => {
          'use gpu';
        });

        await pipeline.initAsync();

        expect(device.mock.createComputePipelineAsync).toHaveBeenCalled();
        expect(() => root.unwrap(pipeline.pipeline)).not.toThrow(); // this means that memo already exists
        expect(tgpu.resolve([pipeline.pipeline])).toMatchInlineSnapshot(`
          "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

          fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {

          }

          @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
            if (any(id >= sizeUniform)) {
              return;
            }
            wrappedCallback(id.x, id.y, id.z);
          }"
        `);
        expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
      });

      it('throws when attempting to unwrap when not resolved', async ({ root, device }) => {
        const pipeline = root.createGuardedComputePipeline(() => {
          'use gpu';
        });

        // oxlint-disable-next-line typescript-eslint/no-floating-promises -- it's a test
        pipeline.initAsync();

        expect(() => root.unwrap(pipeline.pipeline)).toThrowErrorMatchingInlineSnapshot(
          `[Error: 'pipeline.initAsync()' was called and is not yet resolved.]`,
        );
      });

      it('returns the promise again if not resolved', async ({ root, device }) => {
        const pipeline = root.createGuardedComputePipeline(() => {
          'use gpu';
        });

        const p1 = pipeline.initAsync();
        const p2 = pipeline.initAsync();

        expect(p1).toBe(p2);
      });

      it('returns a resolved promise if pipeline was already created', async ({ root, device }) => {
        const pipeline = root.createGuardedComputePipeline(() => {
          'use gpu';
        });

        root.unwrap(pipeline.pipeline); // resolves & compiles the pipeline
        await pipeline.initAsync(); // should not enqueue device operations

        expect(device.mock.createComputePipeline).toHaveBeenCalled();
        expect(device.mock.createComputePipelineAsync).not.toHaveBeenCalled();
      });
    });
  });
});
