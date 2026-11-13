import { describe, expect, vi } from 'vitest';
import { d, tgpu, type TgpuRenderPipeline, type TgpuRoot } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import type { glColorTargetState as glColorTarget } from '../src/glState.ts';
import { it } from './utils/extendedTest.ts';

function createPipeline(
  root: TgpuRoot,
  descriptor: Pick<TgpuRenderPipeline.Descriptor, 'primitive' | 'multisample'> & {
    targets?: Parameters<typeof glColorTarget>[1];
  } = {},
) {
  return root.createRenderPipeline({
    ...descriptor,
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(0, 0, 0, 1) };
    },
    fragment: () => {
      'use gpu';
      return d.vec4f(1, 0, 0, 1);
    },
  });
}

const structOutputFragments = {
  color: tgpu.fragmentFn({ out: { color: d.vec4f } })(() => {
    'use gpu';
    return { color: d.vec4f(1, 0, 0, 1) };
  }),
  format: tgpu.fragmentFn({ out: { format: d.vec4f } })(() => {
    'use gpu';
    return { format: d.vec4f(1, 0, 0, 1) };
  }),
  blend: tgpu.fragmentFn({ out: { blend: d.vec4f } })(() => {
    'use gpu';
    return { blend: d.vec4f(1, 0, 0, 1) };
  }),
  writeMask: tgpu.fragmentFn({ out: { writeMask: d.vec4f } })(() => {
    'use gpu';
    return { writeMask: d.vec4f(1, 0, 0, 1) };
  }),
};

/** A pipeline whose fragment shader returns a struct of color outputs */
function createStructOutputPipeline(
  root: TgpuRoot,
  fragment: keyof typeof structOutputFragments,
  targets: Record<string, Parameters<typeof glColorTarget>[1]>,
) {
  // The fragments' outputs are a union, which doesn't fit any of the overloads
  // oxlint-disable-next-line typescript/no-explicit-any
  const descriptor: any = {
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(0, 0, 0, 1) };
    },
    fragment: structOutputFragments[fragment],
    targets,
  };
  return root.createRenderPipeline(descriptor);
}

describe('TgpuRootWebGL - primitive state', () => {
  it.for([
    ['point-list', 'POINTS'],
    ['line-list', 'LINES'],
    ['line-strip', 'LINE_STRIP'],
    ['triangle-list', 'TRIANGLES'],
    ['triangle-strip', 'TRIANGLE_STRIP'],
  ] as const)("draws '%s' as %s", ([topology, glMode], { gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root, { primitive: { topology } }).draw(4);

    expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl[glMode], 0, 4, 1);
  });

  it('gives points the 1px size they have in WebGPU', ({ gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root, { primitive: { topology: 'point-list' } });
    createPipeline(root, { primitive: { topology: 'triangle-list' } });

    const vertexSources = vi
      .mocked(gl.shaderSource)
      .mock.calls.map((call) => call[1])
      .filter((_, i) => i % 2 === 0);
    expect(vertexSources[0]).toContain('gl_PointSize = 1.0;');
    expect(vertexSources[1]).not.toContain('gl_PointSize');
  });

  it("doesn't dither, like WebGPU", ({ gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root).draw(3);

    expect(gl.disable).toHaveBeenCalledWith(gl.DITHER);
  });

  it("doesn't dither clears either", ({ gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root).draw(3);

    const ditherDisableCall = vi
      .mocked(gl.disable)
      .mock.calls.findIndex(([cap]) => cap === gl.DITHER);
    const ditherDisableOrder =
      vi.mocked(gl.disable).mock.invocationCallOrder[ditherDisableCall] ?? Number.NaN;
    const clearOrder = vi.mocked(gl.clear).mock.invocationCallOrder[0] ?? Number.NaN;
    expect(ditherDisableOrder).toBeLessThan(clearOrder);
  });

  it('culls the requested faces', ({ gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root, { primitive: { cullMode: 'back', frontFace: 'cw' } }).draw(3);

    expect(gl.enable).toHaveBeenCalledWith(gl.CULL_FACE);
    expect(gl.cullFace).toHaveBeenCalledWith(gl.BACK);
    expect(gl.frontFace).toHaveBeenCalledWith(gl.CW);
  });

  it('throws for unclipped depth', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => createPipeline(root, { primitive: { unclippedDepth: true } })).toThrow(
      "WebGL fallback does not support 'unclippedDepth'",
    );
  });
});

describe('TgpuRootWebGL - color target state', () => {
  it('blends with the color and alpha components of the target', ({ gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root, {
      targets: {
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
        },
      },
    }).draw(3);

    expect(gl.enable).toHaveBeenCalledWith(gl.BLEND);
    expect(gl.blendEquationSeparate).toHaveBeenCalledWith(gl.FUNC_ADD, gl.MAX);
    expect(gl.blendFuncSeparate).toHaveBeenCalledWith(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE,
    );
    // Only settable per render pass in WebGPU, so it keeps its default
    expect(gl.blendColor).toHaveBeenCalledWith(0, 0, 0, 0);
  });

  it('treats a target with only undefined properties as a single target', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      createPipeline(root, {
        // Allowed in JS, but not with `exactOptionalPropertyTypes`
        targets: { blend: undefined, writeMask: undefined } as unknown as Parameters<
          typeof glColorTarget
        >[1],
      }).draw(3),
    ).not.toThrow();
    expect(gl.colorMask).toHaveBeenLastCalledWith(true, true, true, true);
  });

  it('applies the write mask, but still clears every channel', ({ gl }) => {
    const root = initWithGL({ gl });

    createPipeline(root, { targets: { writeMask: 0x1 | 0x8 } }).draw(3);

    const colorMaskCalls = vi.mocked(gl.colorMask).mock.invocationCallOrder;
    const clearCall = vi.mocked(gl.clear).mock.invocationCallOrder[0] ?? Number.NaN;
    expect(gl.colorMask).toHaveBeenNthCalledWith(1, true, true, true, true);
    expect(colorMaskCalls[0] ?? Number.NaN).toBeLessThan(clearCall);
    expect(gl.colorMask).toHaveBeenLastCalledWith(true, false, false, true);
    expect(colorMaskCalls.at(-1) ?? Number.NaN).toBeGreaterThan(clearCall);
  });

  it('throws for dual-source blending', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      createPipeline(root, {
        targets: {
          blend: {
            // Not every version of @webgpu/types knows about dual-source blending
            color: { srcFactor: 'src1' as GPUBlendFactor, dstFactor: 'zero' },
            alpha: {},
          },
        },
      }),
    ).toThrow("WebGL fallback does not support 'blend factor src1'");
  });

  it('reads the targets as a record when the fragment outputs a struct', ({
    gl,
    createHTMLCanvas,
  }) => {
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    createStructOutputPipeline(root, 'color', { color: { writeMask: 0x2 } })
      .withColorAttachment({ color: { view: context } })
      .draw(3);

    expect(gl.colorMask).toHaveBeenLastCalledWith(false, true, false, false);
  });

  it.for(['format', 'blend', 'writeMask'] as const)(
    "doesn't mistake a record for a target when the output is named '%s'",
    (name, { gl, createHTMLCanvas }) => {
      const root = initWithGL({ gl });
      const context = root.configureContext({ canvas: createHTMLCanvas({}) });

      createStructOutputPipeline(root, name, {
        [name]: {
          writeMask: 0x4,
          blend: { color: { dstFactor: 'one' }, alpha: { dstFactor: 'one' } },
        },
      })
        .withColorAttachment({ [name]: { view: context } })
        .draw(3);

      expect(gl.colorMask).toHaveBeenLastCalledWith(false, false, true, false);
      expect(gl.enable).toHaveBeenCalledWith(gl.BLEND);
    },
  );

  it('throws for multisampled pipelines', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => createPipeline(root, { multisample: { count: 4 } })).toThrow(
      "WebGL fallback does not support 'multisampled pipelines'",
    );
  });
});

describe('TgpuRootWebGL - state between pipelines', () => {
  it("resets the state set by previous pipelines' draws", ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const first = createPipeline(root, {
      primitive: { cullMode: 'front', frontFace: 'cw' },
      targets: {
        writeMask: 0,
        blend: { color: { dstFactor: 'one' }, alpha: { dstFactor: 'one' } },
      },
    });
    const second = createPipeline(root);

    first.draw(3);
    vi.clearAllMocks();
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });
    second.withColorAttachment({ view: context, loadOp: 'load' }).draw(3);

    expect(gl.disable).toHaveBeenCalledWith(gl.CULL_FACE);
    expect(gl.frontFace).toHaveBeenCalledWith(gl.CCW);
    expect(gl.disable).toHaveBeenCalledWith(gl.BLEND);
    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(gl.colorMask).toHaveBeenCalledWith(true, true, true, true);
  });
});
