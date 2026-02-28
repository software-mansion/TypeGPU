import { attest } from '@ark/attest';
import { describe, expect, expectTypeOf } from 'vitest';
import * as d from '../src/data/index.ts';
import type { ValidateBufferSchema, ValidUsagesFor } from '../src/index.js';
import { getName } from '../src/shared/meta.ts';
import type { IsValidBufferSchema, IsValidUniformSchema } from '../src/shared/repr.ts';
import type { TypedArray } from '../src/shared/utilityTypes.ts';
import { it } from './utils/extendedIt.ts';

function toUint8Array(...arrays: Array<TypedArray>): Uint8Array {
  let totalByteLength = 0;
  for (const arr of arrays) {
    totalByteLength += arr.byteLength;
  }

  const merged = new Uint8Array(totalByteLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), offset);
    offset += arr.byteLength;
  }

  return merged;
}

describe('TgpuBuffer', () => {
  it('should be namable', ({ root }) => {
    const buffer = root.createBuffer(d.u32).$name('myBuffer');

    const rawBuffer = root.unwrap(buffer);

    expect(getName(buffer)).toBe('myBuffer');
    expect(rawBuffer).toBeDefined();
    expect(rawBuffer.label).toBe('myBuffer');
  });

  it('should properly clear a buffer', ({ root, commandEncoder }) => {
    const buffer = root.createBuffer(d.u32);

    buffer.clear();

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();

    expect(commandEncoder.mock.clearBuffer).toHaveBeenCalledExactlyOnceWith(rawBuffer);
  });

  it('should clear a mapped buffer', ({ root }) => {
    const mappedBuffer = root.device.createBuffer({
      size: 12,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    const buffer = root.createBuffer(d.arrayOf(d.u32, 3), mappedBuffer);
    buffer.clear();

    expect(mappedBuffer.getMappedRange).toHaveBeenCalled();
    expect(mappedBuffer.unmap).not.toHaveBeenCalled();
  });

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
      label: 'dataBuffer',
      mappedAtCreation: false,
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    dataBuffer.write({
      a: 3,
      b: { a: 4, b: 5, c: d.vec3i(6, 7, 8) },
      c: d.vec4u(9, 10, 11, 12),
    });

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();

    expect(root.device.queue.writeBuffer).toBeCalledWith(mockBuffer, 0, new ArrayBuffer(64), 0, 64);
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

    expect(device.mock.createBuffer.mock.calls).toStrictEqual([
      // First call (raw buffer)
      [
        {
          label: 'buffer',
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

    const stagingBuffer = device.mock.createBuffer.mock.results[1]?.value as GPUBuffer;

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

  it('should destroy inner buffer if it was responsible for creating it', ({ root }) => {
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
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
    ]);

    buffer.writePartial({ b: 4 });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 4, toUint8Array(new Uint32Array([4])), 0, 4],
    ]);

    buffer.writePartial({ a: 5, b: 6 }); // should merge the writes

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, toUint8Array(new Uint32Array([3])), 0, 4],
      [rawBuffer, 4, toUint8Array(new Uint32Array([4])), 0, 4],
      [rawBuffer, 0, toUint8Array(new Uint32Array([5, 6])), 0, 8],
    ]);
  });

  it('should allow for partial writes with complex data', ({ root, device }) => {
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
      [rawBuffer, 8, toUint8Array(new Float32Array([3, 4]), new Uint32Array([2, 3])), 0, 16],
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
      [rawBuffer, 8, new Uint8Array([255, 127, 255, 127]), 0, 4],
    ]);

    buffer.writePartial({ b: d.vec2f(-0.5, 0.5) });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 8, new Uint8Array([255, 127, 255, 127]), 0, 4],
      [rawBuffer, 16, new Uint8Array([193, 64]), 0, 2],
    ]);

    buffer.writePartial({ c: { d: 3 } });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 8, new Uint8Array([255, 127, 255, 127]), 0, 4],
      [rawBuffer, 16, new Uint8Array([193, 64]), 0, 2],
      [rawBuffer, 18, new Uint8Array([3, 0, 0, 0]), 0, 4],
    ]);
  });

  it('should be able to copy from a buffer identical on the byte level', ({ root }) => {
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

  it('should be able to write to a buffer with atomic data', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.atomic(d.u32), 3));
    const NestedSchema = d.struct({
      a: d.struct({
        aa: d.arrayOf(d.atomic(d.u32), 3),
        ab: d.atomic(d.u32),
      }),
      b: d.atomic(d.u32),
    });
    const nestedBuffer = root.createBuffer(NestedSchema);

    buffer.write([1, 2, 3]);
    nestedBuffer.write({
      a: { aa: [4, 5, 6], ab: 7 },
      b: 8,
    });

    const rawBuffer = root.unwrap(buffer);
    expect(rawBuffer).toBeDefined();
    const rawNestedBuffer = root.unwrap(nestedBuffer);
    expect(rawNestedBuffer).toBeDefined();

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 0, new Uint32Array([1, 2, 3]).buffer, 0, 12],
      [rawNestedBuffer, 0, new Uint32Array([4, 5, 6, 7, 8]).buffer, 0, 20],
    ]);
  });

  it('should be able to write to a buffer with decorated data', ({ root, device }) => {
    const DecoratedSchema = d.struct({
      a: d.size(12, d.f32),
      b: d.align(16, d.u32),
      c: d.arrayOf(d.u32, 3),
    });

    const decoratedBuffer = root.createBuffer(DecoratedSchema);

    decoratedBuffer.write({
      a: 1.0,
      b: 2,
      c: [3, 4, 5],
    });

    const rawDecoratedBuffer = root.unwrap(decoratedBuffer);
    expect(rawDecoratedBuffer).toBeDefined();

    const expectedBuffer = new ArrayBuffer(32);
    const floatView = new Float32Array(expectedBuffer, 0, 1);
    floatView[0] = 1.0;
    const uint32View1 = new Uint32Array(expectedBuffer, 16, 1);
    uint32View1[0] = 2;
    const uint32View2 = new Uint32Array(expectedBuffer, 20, 3);
    uint32View2[0] = 3;
    uint32View2[1] = 4;
    uint32View2[2] = 5;
    const expectedData = new Uint8Array(expectedBuffer);

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawDecoratedBuffer, 0, expectedData.buffer, 0, 32],
    ]);
  });

  it('should throw an error on the type level when using a schema containing boolean', ({
    root,
  }) => {
    const boolSchema = d.struct({
      a: d.u32,
      b: d.bool,
    });

    // @ts-expect-error: boolean is not allowed in buffer schemas
    attest(root.createBuffer(boolSchema)).type.errors.snap(
      "Argument of type 'WgslStruct<{ a: U32; b: Bool; }>' is not assignable to parameter of type '\"(Error) in struct property 'b' — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    const nestedBoolSchema = d.struct({
      a: d.u32,
      b: d.struct({
        c: d.f32,
        d: d.struct({
          e: d.bool,
        }),
      }),
    });

    // @ts-expect-error: boolean is not allowed in buffer schemas
    attest(root.createBuffer(nestedBoolSchema)).type.errors.snap(
      "Argument of type 'WgslStruct<{ a: U32; b: WgslStruct<{ c: F32; d: WgslStruct<{ e: Bool; }>; }>; }>' is not assignable to parameter of type '\"(Error) in struct property 'b' — in struct property 'd' — in struct property 'e' — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );
  });

  it('should throw an error on the type level when using a u16 schema outside of an array', ({
    root,
  }) => {
    const fine = d.arrayOf(d.u16, 32);
    root.createBuffer(fine);

    const notFine = d.struct({
      a: d.u16,
      b: d.u32,
    });

    // @ts-expect-error
    attest(root.createBuffer(notFine)).type.errors.snap(
      "Argument of type 'WgslStruct<{ a: U16; b: U32; }>' is not assignable to parameter of type '\"(Error) in struct property 'a' — U16 is only usable inside arrays for index buffers, use U32 or I32 instead\"'.",
    );

    const alsoNotFine = d.struct({
      a: d.u32,
      b: d.arrayOf(d.u16, 32),
      c: d.f32,
    });

    // @ts-expect-error
    attest(root.createBuffer(alsoNotFine)).type.errors.snap(
      "Argument of type 'WgslStruct<{ a: U32; b: WgslArray<U16>; c: F32; }>' is not assignable to parameter of type '\"(Error) in struct property 'b' — in array element — U16 is only usable inside arrays for index buffers, use U32 or I32 instead\"'.",
    );
  });

  it('should only allow index usage for valid u16 schemas', ({ root }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u16, 32));

    expectTypeOf<Parameters<typeof buffer.$usage>>().toEqualTypeOf<
      ['index' | 'indirect', ...('index' | 'indirect')[]]
    >();
  });

  it('should allow an array of u32 to be used as an index buffer as well as any other usage', ({
    root,
  }) => {
    const validSchema = d.arrayOf(d.u32, 32);
    const buffer = root.createBuffer(validSchema);

    expectTypeOf<Parameters<typeof buffer.$usage>>().toEqualTypeOf<
      [
        'index' | 'storage' | 'uniform' | 'vertex' | 'indirect',
        ...('index' | 'storage' | 'uniform' | 'vertex' | 'indirect')[],
      ]
    >();
  });

  it('should ignore decorated types when determining validity usage', ({ root }) => {
    const validSchema = d.size(1024, d.arrayOf(d.align(16, d.u32), 32));

    const buffer = root.createBuffer(validSchema);

    expectTypeOf<Parameters<typeof buffer.$usage>>().toEqualTypeOf<
      [
        'index' | 'storage' | 'uniform' | 'vertex' | 'indirect',
        ...('index' | 'storage' | 'uniform' | 'vertex' | 'indirect')[],
      ]
    >();
  });
});

describe('IsValidUniformSchema', () => {
  it('treats booleans as invalid', () => {
    expectTypeOf<IsValidUniformSchema<d.Bool>>().toEqualTypeOf<false>();
  });

  it('treats numeric schemas as valid', () => {
    expectTypeOf<IsValidUniformSchema<d.U32>>().toEqualTypeOf<true>();
  });

  it('it treats union schemas as valid (even if they contain booleans)', () => {
    expectTypeOf<IsValidUniformSchema<d.U32 | d.Bool>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidUniformSchema<d.U32 | d.WgslArray<d.Bool>>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidUniformSchema<d.WgslArray<d.Bool | d.U32>>>().toEqualTypeOf<true>();
  });
});

describe('IsValidBufferSchema', () => {
  it('treats booleans as invalid', () => {
    expectTypeOf<IsValidBufferSchema<d.Bool>>().toEqualTypeOf<false>();
  });

  it('treats schemas holding booleans as invalid', () => {
    expectTypeOf<IsValidBufferSchema<d.WgslArray<d.Bool>>>().toEqualTypeOf<false>();
    expectTypeOf<IsValidBufferSchema<d.WgslStruct<{ a: d.Bool }>>>().toEqualTypeOf<false>();
  });

  it('treats other schemas as valid', () => {
    expectTypeOf<IsValidBufferSchema<d.U32>>().toEqualTypeOf<true>();
  });

  it('it treats arrays of valid schemas as valid', () => {
    expectTypeOf<IsValidBufferSchema<d.WgslArray<d.U32>>>().toEqualTypeOf<true>();
  });

  it('it treats union schemas as valid (even if they contain booleans)', () => {
    expectTypeOf<IsValidBufferSchema<d.U32 | d.Bool>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidBufferSchema<d.U32 | d.WgslArray<d.Bool>>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidBufferSchema<d.WgslArray<d.Bool | d.U32>>>().toEqualTypeOf<true>();
  });
});

describe('ValidateBufferSchema', () => {
  it('is strict for exact types', () => {
    expectTypeOf<ValidateBufferSchema<d.U32>>().toEqualTypeOf<d.U32>();
    expectTypeOf<
      ValidateBufferSchema<d.Bool>
    >().toEqualTypeOf<'(Error) Bool is not host-shareable, use U32 or I32 instead'>();
  });

  // Could be not host-shareable, but we let it go to not be annoying
  it('is lenient for union types', () => {
    expectTypeOf<ValidateBufferSchema<d.U32 | d.Bool>>().toEqualTypeOf<d.U32 | d.Bool>();

    expectTypeOf<ValidateBufferSchema<d.AnyData>>().toEqualTypeOf<d.AnyData>();
  });

  it('can be used to wrap `createBuffer` in a generic function (schema and usages customizable)', ({
    root,
  }) => {
    function createMyBuffer<T extends d.AnyData>(
      schema: ValidateBufferSchema<T>,
      usages: [ValidUsagesFor<T>, ...ValidUsagesFor<T>[]],
    ) {
      const buffer = root.createBuffer(schema).$usage(...usages);
      return buffer;
    }

    // Invalid
    // @ts-expect-error: Cannot create buffers with bools in them
    () => createMyBuffer(d.bool, ['']);
    // @ts-expect-error: Cannot create uniform buffers with vertex formats in them
    () => createMyBuffer(d.unorm8x4, ['uniform']);

    // Valid
    createMyBuffer(d.f32, ['uniform']);
    createMyBuffer(d.unorm8x4, ['vertex']);
  });
});
