import { describe, expect } from 'vitest';
import * as d from '../src/data';
import { it } from './utils/extendedIt';

describe('TgpuBuffer', () => {
  it('should properly write to buffer', ({ root, device }) => {
    const buffer = root.createBuffer(d.u32);

    buffer.write(3);

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, new Uint32Array([3]).buffer, 0, 4],
    ]);
  });

  it('should properly write to complex buffer', ({ root }) => {
    const s1 = d.struct({ a: d.u32, b: d.u32, c: d.vec3i });
    const s2 = d.struct({ a: d.u32, b: s1, c: d.vec4u });

    const dataBuffer = root.createBuffer(s2).$usage('uniform');

    root.unwrap(dataBuffer);
    expect(root.device.createBuffer).toBeCalledWith({
      label: '<unnamed>',
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

  it('should write to a mapped buffer', ({ root }) => {
    const mappedBuffer = root.device.createBuffer({
      size: 12,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    const buffer = root.createBuffer(d.arrayOf(d.u32, 3), mappedBuffer);
    buffer.write([1, 2, 3]);

    expect(mappedBuffer.getMappedRange).toHaveBeenCalled();
    expect(mappedBuffer.unmap).not.toHaveBeenCalled();
  });

  it('should map a mappable buffer before reading', async ({ root }) => {
    const rawBuffer = root.device.createBuffer({
      size: 12,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3), rawBuffer);
    const data = await buffer.read();

    expect(root.device.createBuffer).toHaveBeenCalledOnce(); // No staging buffer was created
    expect(rawBuffer.mapAsync).toHaveBeenCalled();
    expect(data).toBeDefined();
  });

  it('should read from a mapped buffer', async ({ root }) => {
    const mappedBuffer = root.device.createBuffer({
      size: 12,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    await mappedBuffer.mapAsync(GPUMapMode.READ);

    const buffer = root.createBuffer(d.arrayOf(d.u32, 3), mappedBuffer);
    const data = await buffer.read();

    expect(root.device.createBuffer).toHaveBeenCalledOnce(); // only creating the mapped buffer
    expect(data).toBeDefined();
    expect(mappedBuffer.getMappedRange).toHaveBeenCalled();
    expect(mappedBuffer.unmap).not.toHaveBeenCalled();
  });

  it('should read from a mappable buffer', async ({ root }) => {
    const rawBuffer = root.device.createBuffer({
      size: 12,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3), rawBuffer);
    const data = await buffer.read();

    expect(root.device.createBuffer).toHaveBeenCalledOnce(); // No staging buffer was created
    expect(data).toBeDefined();
    expect(rawBuffer.getMappedRange).toHaveBeenCalled();
    expect(rawBuffer.unmap).toHaveBeenCalled();
  });

  it('should read from a buffer', async ({ root, device, commandEncoder }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3));
    const data = await buffer.read();

    expect(device.mock.createBuffer.mock.calls).toEqual([
      // First call (raw buffer)
      [
        {
          label: '<unnamed>',
          mappedAtCreation: false,
          size: 12,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        },
      ],
      // Second call (staging buffer)
      [
        {
          size: 12,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        },
      ],
    ]);

    const stagingBuffer = device.mock.createBuffer.mock.results[1]
      ?.value as GPUBuffer;

    expect(commandEncoder.copyBufferToBuffer).toHaveBeenCalledWith(
      buffer.buffer,
      0,
      stagingBuffer,
      0,
      12,
    );
    expect(device.queue.submit).toHaveBeenCalled();
    expect(stagingBuffer.mapAsync).toHaveBeenCalled();
    expect(stagingBuffer.getMappedRange).toHaveBeenCalled();
    expect(stagingBuffer.unmap).toHaveBeenCalled();
    expect(stagingBuffer.destroy).toHaveBeenCalled();

    expect(data).toBeDefined();
  });

  it('should not destroy passed in external buffer', ({ root }) => {
    const rawBuffer = root.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST,
    });

    const buffer = root.createBuffer(d.f32, rawBuffer);
    buffer.destroy();

    expect(rawBuffer.destroy).not.toHaveBeenCalled();
  });

  it('should destroy inner buffer if it was responsible for creating it', ({
    root,
  }) => {
    const buffer = root.createBuffer(d.f32);
    const rawBuffer = root.unwrap(buffer); // Triggering the creation of a buffer
    buffer.destroy();

    expect(rawBuffer.destroy).toHaveBeenCalled();
    expect(() => root.unwrap(buffer)).toThrow();
  });

  it('should restrict the usage to Vertex given loose data', ({ root }) => {
    expect(() => {
      const buffer = root
        .createBuffer(d.unstruct({ a: d.unorm16x2, b: d.snorm8x2 }))
        // @ts-expect-error
        .$usage('storage');
    }).toThrow();
  });

  it('should allow for partial writes', ({ root, device }) => {
    const buffer = root.createBuffer(d.struct({ a: d.u32, b: d.u32 }));

    buffer.writePartial({ a: 3 });

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, new Uint32Array([3]).buffer, 0, 4],
    ]);

    buffer.writePartial({ b: 4 });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, new Uint32Array([3]).buffer, 0, 4],
      [rawBuffer, 4, new Uint32Array([4]).buffer, 0, 4],
    ]);
  });
});
