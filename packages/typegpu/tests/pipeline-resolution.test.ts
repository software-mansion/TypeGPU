import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('resolve', () => {
  const Boid = d.struct({
    position: d.vec2f,
    color: d.vec4f,
  });

  const computeFn = tgpu['~unstable'].computeFn({
    workgroupSize: [1, 1, 1],
    in: { gid: d.builtin.globalInvocationId },
  })(() => {
    const myBoid = Boid({
      position: d.vec2f(0, 0),
      color: d.vec4f(1, 0, 0, 1),
    });
  });

  const vertexFn = tgpu['~unstable'].vertexFn({
    out: { pos: d.builtin.position, color: d.vec4f },
  })(() => {
    const myBoid = Boid();
    return { pos: d.vec4f(myBoid.position, 0, 1), color: myBoid.color };
  });

  const fragmentFn = tgpu['~unstable'].fragmentFn({
    in: { color: d.vec4f },
    out: d.vec4f,
  })((input) => {
    return input.color;
  });

  it('can resolve a render pipeline', ({ root }) => {
    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline();

    expect(tgpu.resolve({ externals: { pipeline } })).toMatchInlineSnapshot(`
      "struct Boid_1 {
        position: vec2f,
        color: vec4f,
      }

      struct vertexFn_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
      }

      @vertex fn vertexFn_0() -> vertexFn_Output_2 {
        var myBoid = Boid_1();
        return vertexFn_Output_2(vec4f(myBoid.position, 0, 1), myBoid.color);
      }

      struct fragmentFn_Input_4 {
        @location(0) color: vec4f,
      }

      @fragment fn fragmentFn_3(input: fragmentFn_Input_4) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });

  it('can resolve a compute pipeline', ({ root }) => {
    const pipeline = root
      .withCompute(computeFn)
      .createPipeline();

    expect(tgpu.resolve({ externals: { pipeline } })).toMatchInlineSnapshot(`
      "struct Boid_1 {
        position: vec2f,
        color: vec4f,
      }

      struct computeFn_Input_2 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn computeFn_0(_arg_0: computeFn_Input_2) {
        var myBoid = Boid_1(vec2f(), vec4f(1, 0, 0, 1));
      }"
    `);
  });

  it('can resolve a guarded compute pipeline', ({ root }) => {
    const pipelineGuard = root.createGuardedComputePipeline((x, y, z) => {
      'use gpu';
      const myBoid = Boid({
        position: d.vec2f(0, 0),
        color: d.vec4f(x, y, z, 1),
      });
    });

    expect(tgpu.resolve({ externals: { pipeline: pipelineGuard.pipeline } }))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

        struct Boid_3 {
          position: vec2f,
          color: vec4f,
        }

        fn wrappedCallback_2(x: u32, y: u32, z: u32) {
          var myBoid = Boid_3(vec2f(), vec4f(f32(x), f32(y), f32(z), 1));
        }

        struct mainCompute_Input_4 {
          @builtin(global_invocation_id) id: vec3u,
        }

        @compute @workgroup_size(8, 8, 4) fn mainCompute_0(in: mainCompute_Input_4)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }"
      `);
  });

  it('throws when resolving multiple pipelines', ({ root }) => {
    const renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline();

    const computePipeline = root
      .withCompute(computeFn)
      .createPipeline();

    expect(() =>
      tgpu.resolve({ externals: { renderPipeline, computePipeline } })
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Found 2 pipelines but can only resolve one at a time.]`,
    );
  });
});
