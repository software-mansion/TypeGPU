import { describe, expect, vi } from 'vitest';
import tgpu, { d } from 'typegpu';
import { initWithGL } from '../src/index.ts';
import { it } from './utils/extendedTest.ts';

// ----------
// Tests
// ----------

describe('TgpuRootWebGL - basic construction', () => {
  it('can be constructed with a WebGL2 context and offscreen canvas', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(root).toBeDefined();
  });
});

describe('TgpuRootWebGL - unsupported operations throw', () => {
  it('throws WebGLFallbackUnsupportedError for createMutable', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.createMutable(d.f32)).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'createMutable'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });

  it('throws WebGLFallbackUnsupportedError for createReadonly', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.createReadonly(d.f32)).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'createReadonly'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });

  it('throws WebGLFallbackUnsupportedError for createQuerySet', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.createQuerySet('timestamp', 1)).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'createQuerySet'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });

  it('throws for device access', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.device).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'device'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });
});

describe('TgpuRootWebGL - createUniform', () => {
  it('creates a WebGL UBO-backed uniform', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.vec4f);
    expect(uniform).toBeDefined();
    expect(uniform.resourceType).toBe('uniform');
    expect(gl.createBuffer).toHaveBeenCalled();
  });

  it('creates a uniform with an initial value', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.f32, 42);
    expect(uniform).toBeDefined();
    // Should have called bufferData to set initial value
    expect(gl.bufferData).toHaveBeenCalled();
  });

  it('allows writing to the uniform', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.f32);
    uniform.write(1.0);

    expect(gl.bindBuffer).toHaveBeenCalled();
    expect(gl.bufferData).toHaveBeenCalled();
  });
});

describe('TgpuRootWebGL - configureContext', () => {
  it('returns a WebGLRenderContext with the provided canvas', ({ gl }) => {
    const root = initWithGL({ gl });

    const targetCanvas = {
      width: 800,
      height: 600,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;

    const ctx = root.configureContext({ canvas: targetCanvas, alphaMode: 'premultiplied' });
    expect(ctx).toBeDefined();
    expect(ctx.canvas).toBe(targetCanvas);
    // oxlint-disable-next-line typescript-eslint(no-explicit-any)
    expect((ctx as any).alphaMode).toBe('premultiplied');
  });
});

describe('TgpuRootWebGL - createRenderPipeline', () => {
  it('compiles GLSL shaders from TypeGPU vertex/fragment functions', ({ gl }) => {
    const root = initWithGL({ gl });

    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    }) /* wgsl */ `{ return Out(vec4f(0.0, 0.0, 0.0, 1.0)); }`;

    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(1.0, 0.0, 0.0, 1.0); }`;

    const pipeline = root.createRenderPipeline({ vertex: vertFn, fragment: fragFn });
    expect(pipeline).toBeDefined();

    // Should have created and compiled shaders
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.compileShader).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);
  });

  it('supports withColorAttachment and draw', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });

    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    }) /* wgsl */ `{ return Out(vec4f(0.0, 0.0, 0.0, 1.0)); }`;

    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(1.0, 0.0, 0.0, 1.0); }`;

    const canvas = createHTMLCanvas({});
    const ctx = root.configureContext({ canvas });
    const pipeline = root.createRenderPipeline({ vertex: vertFn, fragment: fragFn });

    pipeline.withColorAttachment({ view: ctx }).draw(3);

    expect(gl.useProgram).toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
  });

  it('draw uses firstVertex parameter', ({ gl }) => {
    const root = initWithGL({ gl });

    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    }) /* wgsl */ `{ return Out(vec4f(0.0, 0.0, 0.0, 1.0)); }`;

    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(1.0, 0.0, 0.0, 1.0); }`;

    const pipeline = root.createRenderPipeline({ vertex: vertFn, fragment: fragFn });
    pipeline.draw(6, 1, 3);

    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 3, 6);
  });
});

describe('TgpuRootWebGL - destroy', () => {
  it('destroys uniforms and buffers on destroy()', ({ gl }) => {
    const root = initWithGL({ gl });

    const foo1 = root.createUniform(d.f32);
    const foo2 = root.createUniform(d.vec4f);

    root.destroy();

    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
  });
});
