import { describe, expect, vi } from 'vitest';
import { d, tgpu, type TgpuRoot } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position, uv: d.vec2f } })(() => {
  'use gpu';
  return { pos: d.vec4f(0, 0, 0, 1), uv: d.vec2f() };
});

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: { albedo: d.vec4f, normal: d.location(2, d.vec4f), extra: d.vec4f },
})((input) => {
  'use gpu';
  return { albedo: d.vec4f(input.uv, 0, 1), normal: d.vec4f(0, 0, 1, 1), extra: d.vec4f(1) };
});

function createTargets(root: TgpuRoot) {
  const create = () =>
    root
      .createTexture({ size: [16, 16], format: 'rgba8unorm' })
      .$usage('render')
      .createView('render');
  return { albedo: create(), normal: create(), extra: create() };
}

describe('TgpuRootWebGL - multiple render targets', () => {
  it('declares fragment outputs at their locations', ({ gl }) => {
    const root = initWithGL({ gl });
    root.createRenderPipeline({ vertex, fragment, targets: {} });

    const fragmentSource = vi.mocked(gl.shaderSource).mock.calls[1]?.[1];
    expect(fragmentSource).toContain('layout(location=0) out vec4 vary_albedo;');
    expect(fragmentSource).toContain('layout(location=2) out vec4 vary_normal;');
    expect(fragmentSource).toContain('layout(location=1) out vec4 vary_extra;');
  });

  it('renders into every color attachment, matched by name', ({ gl }) => {
    const root = initWithGL({ gl });
    const targets = createTargets(root);
    const textures = vi.mocked(gl.createTexture).mock.results.map((result) => result.value);

    root
      .createRenderPipeline({ vertex, fragment, targets: {} })
      .withColorAttachment({
        albedo: { view: targets.albedo, clearValue: [1, 0, 0, 1] },
        normal: { view: targets.normal, loadOp: 'load' },
        extra: { view: targets.extra },
      })
      .draw(3);

    for (const [location, texture] of [
      [0, textures[0]],
      [2, textures[1]],
      [1, textures[2]],
    ] as const) {
      expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + location,
        gl.TEXTURE_2D,
        texture,
        0,
      );
    }
    expect(gl.drawBuffers).toHaveBeenCalledWith([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
      gl.COLOR_ATTACHMENT2,
    ]);
    // Each attachment has its own load op and clear value
    expect(gl.clearBufferfv).toHaveBeenCalledTimes(2);
    expect(gl.clearBufferfv).toHaveBeenCalledWith(gl.COLOR, 0, [1, 0, 0, 1]);
    expect(gl.clearBufferfv).toHaveBeenCalledWith(gl.COLOR, 1, [0, 0, 0, 0]);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 16, 16);
  });

  it('leaves gaps between locations without a draw buffer', ({ gl }) => {
    const root = initWithGL({ gl });
    const target = () =>
      root
        .createTexture({ size: [4, 4], format: 'rgba8unorm' })
        .$usage('render')
        .createView('render');

    root
      .createRenderPipeline({
        vertex,
        fragment: tgpu.fragmentFn({
          out: { a: d.vec4f, b: d.location(3, d.vec4f) },
        })(() => {
          'use gpu';
          return { a: d.vec4f(1), b: d.vec4f(0) };
        }),
        targets: {},
      })
      .withColorAttachment({ a: { view: target() }, b: { view: target() } })
      .draw(3);

    expect(gl.drawBuffers).toHaveBeenCalledWith([
      gl.COLOR_ATTACHMENT0,
      gl.NONE,
      gl.NONE,
      gl.COLOR_ATTACHMENT0 + 3,
    ]);
  });

  it('throws when an attachment is missing', ({ gl }) => {
    const root = initWithGL({ gl });
    const targets = createTargets(root);
    const pipeline = root
      .createRenderPipeline({ vertex, fragment, targets: {} })
      .withColorAttachment({
        albedo: { view: targets.albedo },
        extra: { view: targets.extra },
      } as never); // deliberately leaving one out

    expect(() => pipeline.draw(3)).toThrow(
      "A color attachment by the name of 'normal' was not provided to the shader.",
    );
  });

  it('throws when there are no attachments at all', ({ gl }) => {
    const root = initWithGL({ gl });
    const pipeline = root.createRenderPipeline({ vertex, fragment, targets: {} });

    expect(() => pipeline.draw(3)).toThrow(
      "A color attachment by the name of 'albedo' was not provided to the shader.",
    );
  });

  it('throws for outputs above the draw buffer limit of the device', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      root.createRenderPipeline({
        vertex,
        fragment: tgpu.fragmentFn({ out: { a: d.vec4f, b: d.location(8, d.vec4f) } })(() => {
          'use gpu';
          return { a: d.vec4f(1), b: d.vec4f(0) };
        }),
        targets: {},
      }),
    ).toThrow("'b' is at location 8, the maximum on this device is 7");
  });

  it('cannot render into a canvas and a texture at once', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const targets = createTargets(root);
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    expect(() =>
      root
        .createRenderPipeline({ vertex, fragment, targets: {} })
        .withColorAttachment({
          albedo: { view: context },
          normal: { view: targets.normal },
          extra: { view: targets.extra },
        })
        .draw(3),
    ).toThrow(
      "WebGL fallback does not support 'rendering into a canvas and other color attachments at once'",
    );
  });

  describe('per-target blending', () => {
    const targets = {
      albedo: {},
      normal: { blend: { color: { dstFactor: 'one' }, alpha: {} } },
      extra: { writeMask: 0x1 },
    } as const;

    it('needs OES_draw_buffers_indexed', ({ gl }) => {
      const root = initWithGL({ gl });

      expect(() => root.createRenderPipeline({ vertex, fragment, targets })).toThrow(
        /requires the OES_draw_buffers_indexed extension/,
      );
    });

    it('uses OES_draw_buffers_indexed when available', ({ gl }) => {
      const extension = {
        enableiOES: vi.fn(),
        disableiOES: vi.fn(),
        blendEquationSeparateiOES: vi.fn(),
        blendFuncSeparateiOES: vi.fn(),
        colorMaskiOES: vi.fn(),
      };
      vi.mocked(gl.getExtension as (name: string) => unknown).mockImplementation((name) =>
        name === 'OES_draw_buffers_indexed' ? extension : null,
      );
      const root = initWithGL({ gl });
      const views = createTargets(root);

      root
        .createRenderPipeline({ vertex, fragment, targets })
        .withColorAttachment({
          albedo: { view: views.albedo },
          normal: { view: views.normal },
          extra: { view: views.extra },
        })
        .draw(3);

      expect(extension.disableiOES).toHaveBeenCalledWith(gl.BLEND, 0);
      expect(extension.enableiOES).toHaveBeenCalledWith(gl.BLEND, 2);
      expect(extension.blendFuncSeparateiOES).toHaveBeenCalledWith(
        2,
        gl.ONE,
        gl.ONE,
        gl.ONE,
        gl.ZERO,
      );
      expect(extension.colorMaskiOES).toHaveBeenCalledWith(1, true, false, false, false);
      expect(extension.colorMaskiOES).toHaveBeenCalledWith(0, true, true, true, true);
    });
  });
});
