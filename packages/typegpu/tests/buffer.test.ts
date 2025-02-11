import { describe, expect } from 'vitest';
import * as d from '../src/data';
import type { TypedArray } from '../src/shared/utilityTypes';
import { it } from './utils/extendedIt';

function toUint8Array(...arrays: Array<TypedArray>): Uint8Array {
  let totalByteLength = 0;
  for (const arr of arrays) {
    totalByteLength += arr.byteLength;
  }

  const merged = new Uint8Array(totalByteLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength),
      offset,
    );
    offset += arr.byteLength;
  }

  return merged;
}

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

    expect(device.mock.queue.writeBuffer.mock.calls).toEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
    ]);

    buffer.writePartial({ b: 4 });

    expect(device.mock.queue.writeBuffer.mock.calls).toEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 4, toUint8Array(new Uint32Array([4])), 0, 4],
    ]);

    buffer.writePartial({ a: 5, b: 6 }); // should merge the writes

    expect(device.mock.queue.writeBuffer.mock.calls).toEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 4, toUint8Array(new Uint32Array([4])), 0, 4],
      [rawBuffer, 0, toUint8Array(new Uint32Array([5, 6])), 0, 8],
    ]);
  });

  it('should allow for partial writes with complex data', ({
    root,
    device,
  }) => {
    const buffer = root.createBuffer(
      d.struct({
        a: d.u32,
        b: d.struct({ c: d.vec2f }),
        d: d.arrayOf(d.u32, 3),
      }),
    );

    buffer.writePartial({ a: 3 });

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
    ]);

    buffer.writePartial({ b: { c: d.vec2f(1, 2) } });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 8, toUint8Array(new Float32Array([1, 2])), 0, 8],
    ]);

    buffer.writePartial({
      d: [
        { idx: 0, value: 1 },
        { idx: 2, value: 3 },
      ],
    });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 8, toUint8Array(new Float32Array([1, 2])), 0, 8],
      [rawBuffer, 16, toUint8Array(new Uint32Array([1])), 0, 4],
      [rawBuffer, 24, toUint8Array(new Uint32Array([3])), 0, 4],
    ]);

    buffer.writePartial({
      b: { c: d.vec2f(3, 4) },
      d: [
        { idx: 0, value: 2 },
        { idx: 1, value: 3 },
      ],
    }); // should merge the writes

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 8, toUint8Array(new Float32Array([1, 2])), 0, 8],
      [rawBuffer, 16, toUint8Array(new Uint32Array([1])), 0, 4],
      [rawBuffer, 24, toUint8Array(new Uint32Array([3])), 0, 4],
      [
        rawBuffer,
        8,
        toUint8Array(new Float32Array([3, 4]), new Uint32Array([2, 3])),
        0,
        16,
      ],
    ]);
  });

  it('should allow for partial writes with loose data', ({ root, device }) => {
    const buffer = root.createBuffer(
      d.unstruct({
        a: d.disarrayOf(d.unorm16x2, 4),
        b: d.snorm8x2,
        c: d.unstruct({ d: d.u32 }),
      }),
    );

    buffer.writePartial({ a: [{ idx: 2, value: d.vec2f(0.5, 0.5) }] });

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 8, new Uint8Array([-1, 127, -1, 127]), 0, 4],
    ]);

    buffer.writePartial({ b: d.vec2f(-0.5, 0.5) });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 8, new Uint8Array([-1, 127, -1, 127]), 0, 4],
      [rawBuffer, 16, new Uint8Array([64, -65]), 0, 2],
    ]);

    buffer.writePartial({ c: { d: 3 } });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 8, new Uint8Array([-1, 127, -1, 127]), 0, 4],
      [rawBuffer, 16, new Uint8Array([64, -65]), 0, 2],
      [rawBuffer, 18, new Uint8Array([3, 0, 0, 0]), 0, 4],
    ]);
  });

  it('should be able to copy from a buffer identical on the byte level', ({
    root,
  }) => {
    const buffer = root.createBuffer(d.u32);
    const copy = root.createBuffer(d.atomic(d.u32));

    buffer.copyFrom(copy);

    const buffer2 = root.createBuffer(
      d.struct({
        one: d.location(0, d.f32), // does nothing outside an IO struct
        two: d.atomic(d.u32),
        three: d.arrayOf(d.u32, 3),
      }),
    );
    const copy2 = root.createBuffer(
      d.struct({
        one: d.f32,
        two: d.u32,
        three: d.arrayOf(d.atomic(d.u32), 3),
      }),
    );

    buffer2.copyFrom(copy2);

    const buffer3 = root.createBuffer(
      d.struct({
        one: d.size(16, d.f32),
        two: d.atomic(d.u32),
      }),
    );

    const copy3 = root.createBuffer(
      d.struct({
        one: d.f32,
        two: d.u32,
      }),
    );

    const copy31 = root.createBuffer(
      d.struct({
        one: d.location(0, d.f32),
        two: d.u32,
      }),
    );

    const copy32 = root.createBuffer(
      d.struct({
        one: d.size(12, d.f32),
        two: d.u32,
      }),
    );

    // @ts-expect-error
    buffer3.copyFrom(copy3);
    // @ts-expect-error
    buffer3.copyFrom(copy31);
    // @ts-expect-error
    buffer3.copyFrom(copy32);
  });
});
