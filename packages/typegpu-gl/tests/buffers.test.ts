import { describe, expect, vi } from 'vitest';
import { d } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import type { WebGLBufferImpl } from '../src/webglBuffer.ts';
import { it } from './utils/extendedTest.ts';

/** Uploads the buffer the way a draw call does */
function sync(buffer: unknown) {
  return (buffer as WebGLBufferImpl<d.AnyData>).sync();
}

describe('TgpuRootWebGL - createBuffer', () => {
  it('keeps the data on the CPU until a draw needs it', async ({ gl }) => {
    const root = initWithGL({ gl });

    const buffer = root.createBuffer(d.arrayOf(d.vec2f, 2), [d.vec2f(1, 2), d.vec2f(3, 4)]);

    expect(await buffer.read()).toStrictEqual([d.vec2f(1, 2), d.vec2f(3, 4)]);
    expect(gl.createBuffer).not.toHaveBeenCalled();
  });

  it('passes itself to an initializer', async ({ gl }) => {
    const root = initWithGL({ gl });

    const buffer = root.createBuffer(d.u32, (b) => b.write(7));

    expect(await buffer.read()).toBe(7);
  });

  it('allocates once, then uploads only what changed', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4]).$usage('vertex');

    const raw = sync(buffer);
    expect(gl.bufferData).toHaveBeenCalledOnce();
    expect(gl.bufferData).toHaveBeenCalledWith(
      gl.ARRAY_BUFFER,
      new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer),
      gl.STATIC_DRAW,
    );

    // Nothing changed, nothing to upload
    expect(sync(buffer)).toBe(raw);
    expect(gl.bufferData).toHaveBeenCalledOnce();

    // Written after its first use, so it gets a more fitting usage hint
    buffer.write([5], { startOffset: 4 });
    sync(buffer);
    expect(gl.bufferData).toHaveBeenCalledTimes(2);
    expect(gl.bufferData).toHaveBeenLastCalledWith(
      gl.ARRAY_BUFFER,
      new Uint8Array(new Float32Array([1, 5, 3, 4]).buffer),
      gl.DYNAMIC_DRAW,
    );

    buffer.write([6, 7], { startOffset: 8 });
    sync(buffer);
    expect(gl.bufferSubData).toHaveBeenCalledWith(
      gl.ARRAY_BUFFER,
      8,
      new Uint8Array(new Float32Array([6, 7]).buffer),
    );
    expect(gl.createBuffer).toHaveBeenCalledOnce();
  });

  it('merges the ranges written between uploads', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.arrayOf(d.f32, 8)).$usage('vertex');
    sync(buffer);
    buffer.write([1]);
    sync(buffer);

    buffer.write([2], { startOffset: 4 });
    buffer.write([3], { startOffset: 20 });
    sync(buffer);

    expect(gl.bufferSubData).toHaveBeenCalledOnce();
    expect(gl.bufferSubData).toHaveBeenCalledWith(
      gl.ARRAY_BUFFER,
      4,
      new Uint8Array(new Float32Array([2, 0, 0, 0, 3]).buffer),
    );
  });

  it('binds index buffers to ELEMENT_ARRAY_BUFFER', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.arrayOf(d.u16, 3), [0, 1, 2]).$usage('index');

    const raw = sync(buffer);

    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ELEMENT_ARRAY_BUFFER, raw);
  });

  it('copies and clears on the CPU', async ({ gl }) => {
    const root = initWithGL({ gl });
    const source = root.createBuffer(d.arrayOf(d.u32, 3), [1, 2, 3]);
    const target = root.createBuffer(d.arrayOf(d.u32, 3));

    target.copyFrom(source);
    expect(await target.read()).toStrictEqual([1, 2, 3]);

    target.clear();
    expect(await target.read()).toStrictEqual([0, 0, 0]);
  });

  it('frees its GL buffer when destroyed', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('vertex');
    const raw = sync(buffer);

    buffer.destroy();

    expect(gl.deleteBuffer).toHaveBeenCalledWith(raw);
    expect(buffer.destroyed).toBe(true);
    expect(() => sync(buffer)).toThrow('This buffer has been destroyed');
  });

  it('applies usage flags like usages, and ignores the rest', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3));

    buffer.$addFlags(0x20 /* VERTEX */ | 0x1 /* MAP_READ */ | 0x8 /* COPY_DST */);

    expect(buffer.usableAsVertex).toBe(true);
    expect(buffer.usableAsIndex).toBe(false);
  });

  it('throws for what WebGL 2 cannot do', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4));

    expect(() => buffer.$usage('vertex', 'index')).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'buffers with both 'vertex' and 'index' usage' (WebGL 2 does not allow binding a buffer as both vertex and index data, so create a separate buffer for each). Use WebGPU for full TypeGPU functionality.]`,
    );
    expect(() => root.createBuffer(d.u32).$usage('storage')).toThrow(
      "WebGL fallback does not support ''storage' buffer usage'",
    );
    expect(() => root.createBuffer(d.u32).$usage('indirect')).toThrow(
      "WebGL fallback does not support ''indirect' buffer usage'",
    );
    expect(() => buffer.buffer).toThrow("WebGL fallback does not support 'buffer.buffer'");
    expect(() => buffer.writePartial([])).toThrow(/use buffer.patch\(\) instead/);
  });
});

describe('TgpuRootWebGL - uniform buffers', () => {
  it('uses the same uniform path as root.createUniform', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.vec4f, d.vec4f(1, 2, 3, 4)).$usage('uniform');
    const color = buffer.as('uniform');

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(color.$);
      },
    });
    pipeline.draw(3);

    expect(color.buffer).toBe(buffer);
    expect(buffer.as('uniform')).toBe(color);
    expect(gl.uniform4fv).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'color' }),
      new Float32Array([1, 2, 3, 4]),
    );
    // Uniforms are uploaded with gl.uniform*(), without GL buffers
    expect(gl.createBuffer).not.toHaveBeenCalled();
  });

  it('exposes the underlying buffer of uniforms, like the WebGPU root', async ({ gl }) => {
    const root = initWithGL({ gl });
    const uniform = root.createUniform(d.f32, (buffer) => buffer.write(2));

    uniform.buffer.write(3);

    expect(await uniform.read()).toBe(3);
  });

  it('cannot be used as storage', ({ gl }) => {
    const root = initWithGL({ gl });
    const buffer = root.createBuffer(d.f32).$usage('uniform');

    expect(() => (buffer as { as(usage: string): unknown }).as('readonly')).toThrow(
      "WebGL fallback does not support 'buffer.as('readonly')'",
    );
  });
});
