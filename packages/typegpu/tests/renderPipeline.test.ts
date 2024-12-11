import { describe, expect } from 'vitest';
import * as d from '../src/data';
import tgpu, { builtin } from '../src/experimental';
import { it } from './utils/extendedIt';

describe('Inter-Stage Variables', () => {
  describe('Empty vertex output', () => {
    const emptyVert = tgpu.vertexFn({}, {}).does('');
    const emptyVertWithBuiltin = tgpu
      .vertexFn({}, { pos: builtin.vertexIndex })
      .does('');

    it('allows fragment functions to use a subset of the vertex output', ({
      root,
    }) => {
      const emptyFragment = tgpu.fragmentFn({}, {}).does('');
      const emptyFragmentWithBuiltin = tgpu
        .fragmentFn({ pos: builtin.position }, {})
        .does('');

      // Using none of none
      const pipeline = root
        .withVertex(emptyVert, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none of none (builtins are erased from the vertex output)
      const pipeline2 = root
        .withVertex(emptyVertWithBuiltin, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none of none (builtins are ignored in the fragment input)
      const pipeline3 = root
        .withVertex(emptyVert, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      // Using none of none (builtins are ignored in both input and output,
      // so their conflict of the `pos` key is fine)
      const pipeline4 = root
        .withVertex(emptyVertWithBuiltin, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      expect(pipeline).toBeDefined();
      expect(pipeline2).toBeDefined();
      expect(pipeline3).toBeDefined();
      expect(pipeline4).toBeDefined();
    });

    it('rejects fragment functions that use non-existent vertex output', ({
      root,
    }) => {
      const fragment = tgpu.fragmentFn({ a: d.vec3f, c: d.f32 }, {}).does('');

      root
        .withVertex(emptyVert, {})
        // @ts-expect-error: Missing from vertex output
        .withFragment(fragment, {})
        .createPipeline();
    });
  });

  describe('Non-empty vertex output', () => {
    const vert = tgpu.vertexFn({}, { a: d.vec3f, b: d.vec2f }).does('');
    const vertWithBuiltin = tgpu
      .vertexFn({}, { a: d.vec3f, b: d.vec2f, pos: builtin.position })
      .does('');

    it('allows fragment functions to use a subset of the vertex output', ({
      root,
    }) => {
      const emptyFragment = tgpu.fragmentFn({}, {}).does('');
      const emptyFragmentWithBuiltin = tgpu
        .fragmentFn({ pos: builtin.frontFacing }, {})
        .does('');
      const fullFragment = tgpu
        .fragmentFn({ a: d.vec3f, b: d.vec2f }, d.vec4f)
        .does('');

      // Using none
      const pipeline = root
        .withVertex(vert, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none (builtins are erased from the vertex output)
      const pipeline2 = root
        .withVertex(vertWithBuiltin, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none (builtins are ignored in the fragment input)
      const pipeline3 = root
        .withVertex(vert, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      // Using none (builtins are ignored in both input and output,
      // so their conflict of the `pos` key is fine)
      const pipeline4 = root
        .withVertex(vertWithBuiltin, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      // Using all
      const pipeline5 = root
        .withVertex(vert, {})
        .withFragment(fullFragment, { format: 'rgba8unorm' })
        .createPipeline();

      expect(pipeline).toBeDefined();
      expect(pipeline2).toBeDefined();
      expect(pipeline3).toBeDefined();
      expect(pipeline4).toBeDefined();
      expect(pipeline5).toBeDefined();
    });

    it('rejects fragment functions that use non-existent vertex output', ({
      root,
    }) => {
      const fragment = tgpu.fragmentFn({ a: d.vec3f, c: d.f32 }, {}).does('');

      // @ts-expect-error: Missing from vertex output
      root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
    });

    it('rejects fragment functions that use mismatched vertex output data types', ({
      root,
    }) => {
      const fragment = tgpu.fragmentFn({ a: d.vec3f, b: d.f32 }, {}).does('');

      // @ts-expect-error: Mismatched vertex output
      root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
    });
  });
});
