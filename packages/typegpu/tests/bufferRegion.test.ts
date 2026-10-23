import { describe, expect, expectTypeOf } from 'vitest';
import { d, tgpu } from 'typegpu';
import type { StorageFlag, TgpuBufferRegion, UniformFlag, VertexFlag } from 'typegpu';
import { it } from 'typegpu-testing-utility';

const Boid = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const Scene = d.struct({
  time: d.f32,
  boids: d.arrayOf(Boid, 100),
});

describe('buffer.region', () => {
  it('covers the element an accessor reaches', ({ root }) => {
    const buffer = root.createBuffer(Scene).$usage('storage');

    const regions = [
      buffer.region(Boid, (scene) => scene.boids[2]),
      buffer.region(d.vec2f, (scene) => scene.boids[2]?.velocity),
      // a structurally equal schema
      buffer.region(d.struct({ position: d.vec2f, velocity: d.vec2f }), (scene) => scene.boids[1]),
      // a prefix of an array
      buffer.region(d.arrayOf(Boid, 10), (scene) => scene.boids),
      // a run of the array elements starting at an element
      buffer.region(d.arrayOf(Boid, 10), (scene) => scene.boids[90]),
    ];

    expect(regions.map((region) => [region.offset, region.size])).toStrictEqual([
      [40, 16],
      [48, 8],
      [24, 16],
      [8, 160],
      [1448, 160],
    ]);
  });

  it('rejects schemas that do not fit the element', ({ root }) => {
    const buffer = root.createBuffer(Scene).$usage('storage');

    expect(() =>
      buffer.region(d.vec4f, (scene) => scene.boids[1]),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a region of type 'vec4f' over an element of type 'struct:Boid'. To reinterpret the memory, pass { offsetBytes: 24 } instead of an accessor.]`,
    );
    expect(() =>
      buffer.region(d.arrayOf(Boid, 11), (scene) => scene.boids[90]),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a region of type 'arrayOf(struct:Boid, 11)' over an element of type 'struct:Boid' (10 elements of its array start at it). To reinterpret the memory, pass { offsetBytes: 1448 } instead of an accessor.]`,
    );
  });

  it('starts at a byte offset, the only way into loose schemas', ({ root }) => {
    const words = root.createBuffer(d.arrayOf(d.u32, 64)).$usage('storage').$name('words');
    const colors = root.createBuffer(d.disarrayOf(d.unorm8x4, 4)).$name('colors');

    const boids = words.region(d.arrayOf(Boid, 2), { offsetBytes: 128 });
    expect([boids.offset, boids.size]).toStrictEqual([128, 32]);

    expect(() =>
      words.region(d.arrayOf(Boid, 2), { offsetBytes: 240 }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A region of type 'arrayOf(struct:Boid, 2)' (32 bytes) at offset 240 does not fit in buffer 'words' (256 bytes).]`,
    );
    expect(() => colors.region(d.u32, (colors) => colors[1])).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot navigate the loose schema of buffer 'colors' with an accessor. Pass { offsetBytes } instead.]`,
    );
  });

  it('takes its usage flags from the buffer', ({ root }) => {
    const storage = root.createBuffer(Scene).$usage('storage');
    const uniform = root.createBuffer(Scene).$usage('uniform', 'vertex');

    const storageRegion = storage.region(Boid, (scene) => scene.boids[0]);
    const uniformRegion = uniform.region(Boid, (scene) => scene.boids[0]);

    expectTypeOf(storageRegion).toEqualTypeOf<TgpuBufferRegion<typeof Boid> & StorageFlag>();
    expectTypeOf(uniformRegion).toEqualTypeOf<
      TgpuBufferRegion<typeof Boid> & UniformFlag & VertexFlag
    >();
    // @ts-expect-error: the buffer is not usable as a uniform
    expect(() => storageRegion.as('uniform')).toThrow();
  });
});

describe('buffer region IO', () => {
  it("writes and patches only its bytes, through the buffer's CPU copy", ({ root, device }) => {
    const buffer = root.createBuffer(Scene).$usage('storage');
    const rawBuffer = root.unwrap(buffer);
    const third = buffer.region(Boid, (scene) => scene.boids[2]);

    third.write({ position: d.vec2f(1, 2), velocity: d.vec2f(3, 4) });
    third.patch({ velocity: d.vec2f(5, 6) });

    expect(device.mock.queue.writeBuffer.mock.calls).toStrictEqual([
      [rawBuffer, 40, buffer.arrayBuffer, 40, 16],
      [rawBuffer, 48, new Uint8Array(new Float32Array([5, 6]).buffer)],
    ]);
    expect([...new Float32Array(buffer.arrayBuffer, 40, 4)]).toStrictEqual([1, 2, 5, 6]);
  });

  it('rejects writes that do not start and end at a multiple of 4 bytes', ({ root }) => {
    const buffer = root.createBuffer(d.arrayOf(d.f16, 5)).$usage('storage').$name('halves');

    expect(() =>
      buffer.region(d.f16, (halves) => halves[1]).write(1),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot write to bytes 2-4 of buffer 'halves'. WebGPU requires writes to start and end at a multiple of 4 bytes. Align the range to 4 bytes, write the whole buffer, or use 4-byte elements (e.g. d.u32 instead of d.u16).]`,
    );
    // a region that ends the buffer covers its trailing padding
    expect(() => buffer.region(d.f16, (halves) => halves[4]).write(1)).not.toThrow();
  });

  it('clears, copies and reads only its bytes', async ({ root, commandEncoder }) => {
    const source = root.createBuffer(Scene).$usage('storage');
    const target = root.createBuffer(d.arrayOf(Boid, 8)).$usage('storage').$name('boids');
    const encoder = root['~unstable'].createCommandEncoder();
    const third = target.region(Boid, (boids) => boids[3]);

    third.clear(encoder);
    third.copyFrom(
      source.region(Boid, (scene) => scene.boids[2]),
      encoder,
    );
    await third.read();

    expect(commandEncoder.mock.clearBuffer).toHaveBeenCalledWith(root.unwrap(target), 48, 16);
    expect(commandEncoder.mock.copyBufferToBuffer.mock.calls).toStrictEqual([
      [root.unwrap(source), 40, root.unwrap(target), 48, 16],
      [root.unwrap(target), 48, expect.anything(), 0, 16],
    ]);
    expect(() =>
      third.copyFrom(target.region(Boid, (boids) => boids[0])),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot copy between two regions of buffer 'boids'. WebGPU does not allow a buffer to be both the source and the destination of a copy; copy through a second buffer or a compute shader instead.]`,
    );
  });
});

describe('binding buffer regions', () => {
  const Frame = d.struct({
    time: d.f32,
    boids: d.align(256, d.arrayOf(Boid, 10)),
  });

  it('binds only its bytes in bind groups and as a fixed resource', ({ root, device }) => {
    const buffer = root.createBuffer(Frame).$usage('storage');
    const boids = buffer.region(d.arrayOf(Boid, 10), (frame) => frame.boids).$name('boids');
    const mutableBoids = boids.as('mutable');
    const layout = tgpu.bindGroupLayout({
      boids: { storage: d.arrayOf(Boid, 10) },
      mutableBoids: { storage: d.arrayOf(Boid, 10), access: 'mutable' },
    });

    root.unwrap(root.createBindGroup(layout, { boids, mutableBoids }));
    // @ts-expect-error: the layout expects an array of boids
    () => root.createBindGroup(layout, { boids: buffer.region(Boid, { offsetBytes: 256 }) });

    const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
      'use gpu';
      mutableBoids.$[0]!.velocity *= 0.5;
    });
    const pipeline = root.createComputePipeline({ compute: main });
    pipeline.dispatchWorkgroups(1);

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct Boid {
        position: vec2f,
        velocity: vec2f,
      }

      @group(0) @binding(0) var<storage, read_write> boids: array<Boid, 10>;

      @compute @workgroup_size(1) fn main() {
        boids[0i].velocity *= 0.5;
      }"
    `);
    const region = { buffer: root.unwrap(buffer), offset: 256, size: 160 };
    expect(device.mock.createBindGroup.mock.calls.map(([desc]) => desc.entries)).toStrictEqual([
      [
        { binding: 0, resource: region },
        { binding: 1, resource: region },
      ],
      [{ binding: 0, resource: region }],
    ]);
  });

  it("binds only at offsets the device's alignment allows", ({ root, device }) => {
    const buffer = root.createBuffer(Scene).$usage('uniform').$name('scene');
    const third = buffer.region(Boid, (scene) => scene.boids[2]).$name('third');
    const layout = tgpu.bindGroupLayout({ boid: { uniform: Boid } });

    expect(() =>
      root.unwrap(root.createBindGroup(layout, { boid: third })),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot bind region 'third' of buffer 'scene' as a uniform buffer: its offset (40 bytes) is not a multiple of minUniformBufferOffsetAlignment (256 bytes on this device). Place the region at a multiple of 256 bytes (e.g. wrap its struct member in d.align(256, ...)), or bind the whole buffer and read the region through it.]`,
    );

    Object.assign(device.mock.limits, { minUniformBufferOffsetAlignment: 8 });
    root.unwrap(root.createBindGroup(layout, { boid: third }));
    expect(device.mock.createBindGroup.mock.lastCall?.[0].entries).toStrictEqual([
      { binding: 0, resource: { buffer: root.unwrap(buffer), offset: 40, size: 16 } },
    ]);
  });

  it('unwraps to a GPUBufferBinding', ({ root }) => {
    const buffer = root.createBuffer(Scene).$usage('storage');
    const third = buffer.region(Boid, (scene) => scene.boids[2]).$name('third');

    expect(root.unwrap(third)).toStrictEqual({ buffer: root.unwrap(buffer), offset: 40, size: 16 });
    expect(() => root.unwrap(third.as('readonly'))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot unwrap the readonly binding of region 'third' into a GPUBuffer. Unwrap the region to get its GPUBufferBinding.]`,
    );
  });
});

describe('buffer regions as vertex, index and indirect buffers', () => {
  it('draws from regions of one buffer', ({ root, renderPassEncoder }) => {
    const pool = root.createBuffer(d.arrayOf(d.u32, 128)).$usage('vertex', 'index', 'indirect');
    const rawPool = root.unwrap(pool);
    const positions = pool.region(d.arrayOf(d.vec3f, 4), { offsetBytes: 64 });
    const indices = pool.region(d.arrayOf(d.u16, 6), { offsetBytes: 256 });
    const args = pool.region(d.arrayOf(d.u32, 5), { offsetBytes: 384 });
    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec3f));

    const pipeline = root
      .createRenderPipeline({
        attribs: { position: vertexLayout.attrib },
        vertex: ({ position }) => {
          'use gpu';
          return { $position: d.vec4f(position, 1) };
        },
        fragment: () => {
          'use gpu';
          return d.vec4f(1);
        },
        targets: { format: 'rgba8unorm' },
      })
      .withColorAttachment({ view: {} as GPUTextureView })
      .with(vertexLayout, positions)
      // offsets count from the start of the region
      .withIndexBuffer(indices, 1, 3);

    pipeline.drawIndexedIndirect(args);

    expect(renderPassEncoder.mock.setVertexBuffer).toHaveBeenCalledWith(0, rawPool, 64, 64);
    expect(renderPassEncoder.mock.setIndexBuffer).toHaveBeenCalledWith(rawPool, 'uint16', 258, 6);
    expect(renderPassEncoder.mock.drawIndexedIndirect).toHaveBeenCalledWith(rawPool, 384);
  });

  it('dispatches with arguments read from a region', ({ root, computePassEncoder }) => {
    const Args = d.struct({ count: d.u32, dispatch: d.vec3u });
    const buffer = root.createBuffer(d.arrayOf(Args, 4)).$usage('indirect');
    const third = buffer.region(Args, (args) => args[2]);
    const pipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });

    pipeline.dispatchWorkgroupsIndirect(
      third,
      d.memoryLayoutOf(Args, (args) => args.dispatch),
    );

    expect(computePassEncoder.mock.dispatchWorkgroupsIndirect).toHaveBeenCalledWith(
      root.unwrap(buffer),
      80,
    );
    expect(() => pipeline.dispatchWorkgroupsIndirect(third, 24)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Buffer too small for dispatchWorkgroupsIndirect. Required: 12 bytes at offset 24, but buffer is only 32 bytes.]`,
    );
  });
});
