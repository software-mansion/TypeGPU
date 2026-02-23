import { describe, expect } from 'vitest';
import tgpu, { d } from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('resolve', () => {
  const Boid = d.struct({
    position: d.vec2f,
    color: d.vec4f,
  });

  const computeFn = tgpu.computeFn({
    workgroupSize: [1, 1, 1],
    in: { gid: d.builtin.globalInvocationId },
  })(() => {
    const myBoid = Boid({
      position: d.vec2f(0, 0),
      color: d.vec4f(1, 0, 0, 1),
    });
  });

  const vertexFn = tgpu.vertexFn({
    out: { pos: d.builtin.position, color: d.vec4f },
  })(() => {
    const myBoid = Boid();
    return { pos: d.vec4f(myBoid.position, 0, 1), color: myBoid.color };
  });

  const fragmentFn = tgpu.fragmentFn({
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

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct Boid {
        position: vec2f,
        color: vec4f,
      }

      struct vertexFn_Output {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
      }

      @vertex fn vertexFn() -> vertexFn_Output {
        var myBoid = Boid();
        return vertexFn_Output(vec4f(myBoid.position, 0f, 1f), myBoid.color);
      }

      struct fragmentFn_Input {
        @location(0) color: vec4f,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });

  it('can resolve a compute pipeline', ({ root }) => {
    const pipeline = root
      .withCompute(computeFn)
      .createPipeline();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct Boid {
        position: vec2f,
        color: vec4f,
      }

      struct computeFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn computeFn(_arg_0: computeFn_Input) {
        var myBoid = Boid(vec2f(), vec4f(1, 0, 0, 1));
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

    expect(tgpu.resolve([pipelineGuard.pipeline]))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

        struct Boid {
          position: vec2f,
          color: vec4f,
        }

        fn wrappedCallback(x: u32, y: u32, z: u32) {
          var myBoid = Boid(vec2f(), vec4f(f32(x), f32(y), f32(z), 1f));
        }

        struct mainCompute_Input {
          @builtin(global_invocation_id) id: vec3u,
        }

        @compute @workgroup_size(8, 8, 4) fn mainCompute(in: mainCompute_Input)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback(in.id.x, in.id.y, in.id.z);
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

    expect(() => tgpu.resolve([renderPipeline, computePipeline]))
      .toThrowErrorMatchingInlineSnapshot(
        `[Error: Found 2 pipelines but can only resolve one at a time.]`,
      );
  });
});
