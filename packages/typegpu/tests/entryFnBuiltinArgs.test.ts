import { describe, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('entry functions accepting only the allowed subset of builtins', () => {
  it('works for vertex functions', () => {
    tgpu['~unstable'].vertexFn({
      in: { pos: d.builtin.instanceIndex },
      out: {
        uv: d.vec4f,
      },
    });

    // @ts-expect-error
    tgpu['~unstable'].vertexFn({
      in: { pos: d.builtin.sampleIndex },
      out: {
        uv: d.vec4f,
      },
    });

    // @ts-expect-error
    tgpu['~unstable'].vertexFn({
      in: { pos: d.builtin.position },
      out: {
        uv: d.vec4f,
      },
    });

    tgpu['~unstable'].vertexFn({
      out: {
        uv: d.vec4f,
        pos: d.builtin.position,
      },
    });

    tgpu['~unstable'].vertexFn({
      out: {
        uv: d.vec4f,
        // @ts-expect-error
        pos: d.builtin.vertexIndex,
      },
    });
  });

  it('works for fragment functions', () => {
    tgpu['~unstable'].fragmentFn({
      in: { pos: d.builtin.position },
      out: d.vec4f,
    });

    tgpu['~unstable'].fragmentFn({
      out: {
        index: d.builtin.sampleMask,
      },
    });

    // @ts-expect-error
    tgpu['~unstable'].fragmentFn({
      in: { pos: d.builtin.vertexIndex },
      out: d.vec4f,
    });

    tgpu['~unstable'].fragmentFn({
      // @ts-expect-error
      out: { index: d.builtin.sampleIndex },
    });
  });

  it('works for compute functions', () => {
    tgpu['~unstable'].computeFn({
      in: { pos: d.builtin.localInvocationId },
      workgroupSize: [1],
    });

    // @ts-expect-error
    tgpu['~unstable'].computeFn({
      in: { pos: d.builtin.position },
      workgroupSize: [1],
    });
  });
});
