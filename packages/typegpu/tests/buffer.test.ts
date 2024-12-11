import { beforeEach, describe, expect, it } from 'vitest';
import * as d from '../src/data';
import { mockBuffer, mockRoot } from './utils/mockRoot';

describe('TgpuBuffer', () => {
  const { getRoot } = mockRoot();

  beforeEach(() => {
    mockBuffer.mapState = 'unmapped';
  });

  it('should properly write to buffer', () => {
    const root = getRoot();
    const buffer = root.createBuffer(d.u32);

    buffer.write(3);

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();

    expect(root.device.queue.writeBuffer).toBeCalledWith(
      rawBuffer,
      0,
      new ArrayBuffer(4),
      0,
      4,
    );
  });

  it('should properly write to complex buffer', () => {
    const root = getRoot();

    const s1 = d.struct({ a: d.u32, b: d.u32, c: d.vec3i });
    const s2 = d.struct({ a: d.u32, b: s1, c: d.vec4u });

    const dataBuffer = root.createBuffer(s2).$usage('uniform');

    root.unwrap(dataBuffer);
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 64,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });

    dataBuffer.write({
      a: 3,
      b: { a: 4, b: 5, c: d.vec3i(6, 7, 8) },
      c: d.vec4u(9, 10, 11, 12),
    });

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();

    expect(root.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(64),
      0,
      64,
    );
  });

  it('should write to a mapped buffer', () => {
    const root = getRoot();
    mockBuffer.mapState = 'mapped';
    const buffer = root.createBuffer(
      d.arrayOf(d.u32, 3),
      mockBuffer as unknown as GPUBuffer,
    );
    buffer.write([1, 2, 3]);

    expect(mockBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockBuffer.unmap).not.toHaveBeenCalled();
  });

  it('should not destroy passed in external buffer', () => {
    const root = getRoot();
    const buffer = root.createBuffer(d.f32, mockBuffer as unknown as GPUBuffer);
    buffer.destroy();

    expect(mockBuffer.destroy).not.toHaveBeenCalled();
  });

  it('should destroy inner buffer if it was responsible for creating it', () => {
    const root = getRoot();
    const buffer = root.createBuffer(d.f32);
    root.unwrap(buffer); // Triggering the creation of a buffer
    buffer.destroy();

    expect(mockBuffer.destroy).toHaveBeenCalled();
    expect(() => root.unwrap(buffer)).toThrow();
  });
});
