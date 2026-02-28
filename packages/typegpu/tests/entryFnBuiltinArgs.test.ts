import { describe, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, { type TgpuComputeFn, type TgpuFragmentFn, type TgpuVertexFn } from '../src/index.js';
import { attest } from '@ark/attest';

describe('entry functions accepting only the allowed subset of builtins', () => {
  it('works for vertex functions', () => {
    tgpu.vertexFn({
      in: { pos: d.builtin.instanceIndex },
      out: {
        uv: d.vec4f,
      },
    });

    // @ts-expect-error
    tgpu.vertexFn({
      in: { pos: d.builtin.sampleIndex },
      out: {
        uv: d.vec4f,
      },
    });

    // @ts-expect-error
    tgpu.vertexFn({
      in: { pos: d.builtin.position },
      out: {
        uv: d.vec4f,
      },
    });

    tgpu.vertexFn({
      out: {
        uv: d.vec4f,
        pos: d.builtin.position,
      },
    });

    tgpu.vertexFn({
      out: {
        uv: d.vec4f,
        // @ts-expect-error
        pos: d.builtin.vertexIndex,
      },
    });
  });

  it('works for fragment functions', () => {
    tgpu.fragmentFn({
      in: { pos: d.builtin.position },
      out: d.vec4f,
    });

    tgpu.fragmentFn({
      out: {
        index: d.builtin.sampleMask,
      },
    });

    // @ts-expect-error
    tgpu.fragmentFn({
      in: { pos: d.builtin.vertexIndex },
      out: d.vec4f,
    });

    tgpu.fragmentFn({
      // @ts-expect-error
      out: { index: d.builtin.sampleIndex },
    });
  });

  it('works for compute functions', () => {
    tgpu.computeFn({
      in: { pos: d.builtin.localInvocationId },
      workgroupSize: [1],
    });

    // @ts-expect-error
    tgpu.computeFn({
      in: { pos: d.builtin.position },
      workgroupSize: [1],
    });
  });
});

describe('entry functions being always assignable to the type with default generic type', () => {
  it('works for vertex functions', () => {
    function test(fn: TgpuVertexFn) {}

    const fn = tgpu.vertexFn({
      in: { pos: d.builtin.instanceIndex },
      out: {
        uv: d.vec4f,
      },
    })``;

    test(fn);
  });

  it('works for fragment functions', () => {
    function test(fn: TgpuFragmentFn) {}

    const fn = tgpu.fragmentFn({
      in: { pos: d.builtin.position },
      out: d.vec4f,
    })``;

    test(fn);
  });

  it('works for compute functions', () => {
    function test(fn: TgpuComputeFn) {}

    const fn = tgpu.computeFn({
      in: { pos: d.builtin.localInvocationId },
      workgroupSize: [1],
    })``;

    test(fn);
  });
});

describe('@location and @interpolate type stripping (irrelevant when verifying entry functions)', () => {
  it('works for vertex functions', () => {
    const vertexMain = tgpu.vertexFn({
      out: { bar: d.location(0, d.vec3f) },
    })(() => ({
      bar: d.vec3f(),
    }));

    attest(vertexMain).type.toString.snap('TgpuVertexFn<{}, { bar: Vec3f }>');
  });

  it('works for fragment functions', () => {
    const fragmentMain = tgpu.fragmentFn({
      in: { bar: d.vec3f },
      out: d.vec4f,
    })(() => d.vec4f());

    attest(fragmentMain).type.toString.snap('TgpuFragmentFn<{ bar: Vec3f }, Vec4f>');
  });
});
