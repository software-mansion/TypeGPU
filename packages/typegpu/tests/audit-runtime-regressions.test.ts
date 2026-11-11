import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, std, type TgpuRoot } from 'typegpu';

function trianglePipeline(root: TgpuRoot) {
  const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
    'use gpu';
    return { pos: d.vec4f(0, 0, 0, 1) };
  });
  const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
    'use gpu';
    return d.vec4f(1);
  });
  const target = root.createTexture({ size: [1, 1], format: 'rgba8unorm' }).$usage('render');
  return root
    .createRenderPipeline({ vertex, fragment, targets: { format: 'rgba8unorm' } })
    .withColorAttachment({ view: target, loadOp: 'clear', storeOp: 'store' });
}

// These tests inspect CPU state and calls to the shared WebGPU mock, not GPU execution.
describe('audit runtime regressions', () => {
  it('B01 uploads only the supplied TypedArray subarray', ({ root, device }) => {
    const texture = root.createTexture({ size: [1, 1], format: 'rgba8unorm' });
    const backing = new Uint8Array([91, 92, 93, 94, 1, 2, 3, 4]);
    texture.write(backing.subarray(4));

    const [, data, layout] = vi.mocked(device.queue.writeTexture).mock.calls[0]!;
    const actualBytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset + (layout.offset ?? 0), 4)
      : new Uint8Array(data, layout.offset ?? 0, 4);
    expect([...actualBytes]).toEqual([1, 2, 3, 4]);
  });

  it('B02 writes every 2D array layer at a nonzero mip level', ({ root, device }) => {
    const texture = root.createTexture({
      size: [4, 4, 4],
      format: 'rgba8unorm',
      mipLevelCount: 3,
    });
    texture.write(new Uint8Array(2 * 2 * 4 * 4), 1);
    expect(device.mock.queue.writeTexture.mock.calls[0]![3]).toEqual([2, 2, 4]);
  });

  it('B02 clears every 2D array layer at a nonzero mip level', ({ root, device }) => {
    const texture = root.createTexture({
      size: [4, 4, 4],
      format: 'rgba8unorm',
      mipLevelCount: 3,
    });
    texture.clear(1);
    expect(device.mock.queue.writeTexture.mock.calls[0]![3]).toEqual([2, 2, 4]);
  });

  it('B03 restores guarded dispatch bounds after a differently sized variant', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ value: { uniform: d.u32 } });
    const group = root.createBindGroup(layout, {
      value: root.createBuffer(d.u32).$usage('uniform'),
    });
    const pipeline = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });
    const variant = pipeline.with(group);
    using write = vi.spyOn(pipeline.sizeUniform, 'write');

    pipeline.dispatchThreads(100);
    variant.dispatchThreads(10);
    pipeline.dispatchThreads(100);

    expect(write).toHaveBeenLastCalledWith(d.vec3u(100, 1, 1));
  });

  it('B04 aligns an initialized odd-length u16 index buffer for mapping', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u16, 3), [0, 1, 2]).$usage('index');
    root.unwrap(buffer);
    const descriptor = device.mock.createBuffer.mock.calls[0]![0];
    // mappedAtCreation requires a multiple of four bytes, even for uint16 indices.
    expect(descriptor.size).toBeGreaterThanOrEqual(6);
    if (descriptor.mappedAtCreation) {
      expect(descriptor.size % 4).toBe(0);
    }
  });

  it('B04 uploads odd-length u16 indices with a four-byte-aligned write size', ({
    root,
    device,
  }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u16, 3)).$usage('index');
    buffer.write([0, 1, 2]);
    const [, , data, offset = 0, size] = vi.mocked(device.queue.writeBuffer).mock.calls[0]!;
    const elementSize =
      ArrayBuffer.isView(data) && 'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const byteCount =
      size === undefined ? data.byteLength - offset * elementSize : size * elementSize;
    expect(byteCount).toBeGreaterThanOrEqual(6);
    expect(byteCount % 4).toBe(0);
  });

  it('B05 destroys root-owned resources while retaining a borrowed device', ({ device }) => {
    const root = tgpu.initFromDevice({ device });
    const buffer = root.createBuffer(d.u32);
    const texture = root.createTexture({ size: [2, 2], format: 'rgba8unorm' });
    const rawBuffer = root.unwrap(buffer);
    const rawTexture = root.unwrap(texture);

    root.destroy();

    expect(device.destroy).not.toHaveBeenCalled();
    expect.soft(rawBuffer.destroy).toHaveBeenCalledTimes(1);
    expect.soft(rawTexture.destroy).toHaveBeenCalledTimes(1);
  });

  it('B06 places a fragment target at its explicitly declared output location', ({
    root,
    device,
  }) => {
    const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
      'use gpu';
      return { pos: d.vec4f(0, 0, 0, 1) };
    });
    const fragment = tgpu.fragmentFn({ out: { color: d.location(1, d.vec4f) } })(() => {
      'use gpu';
      return { color: d.vec4f(1, 0, 0, 1) };
    });
    root.unwrap(
      root.createRenderPipeline({
        vertex,
        fragment,
        targets: { color: { format: 'rgba8unorm' } },
      }),
    );

    const descriptor = vi.mocked(device.createRenderPipeline).mock.calls[0]![0];
    expect([...descriptor.fragment!.targets]).toEqual([null, { format: 'rgba8unorm' }]);
  });

  it('B07 uploads a 4x4 BC1 texture as one eight-byte compression block', ({ root, device }) => {
    device.mock.features.add('texture-compression-bc');
    const texture = root
      .createTexture({ size: [4, 4], format: 'bc1-rgba-unorm' })
      .$usage('sampled');
    texture.write(new Uint8Array(8));
    const [, , layout, extent] = vi.mocked(device.queue.writeTexture).mock.calls[0]!;
    expect(layout.bytesPerRow).toBe(8);
    expect(extent).toEqual([4, 4, 1]);
  });

  it('B08 defaults a storage binding view to exactly one mip level', ({ root }) => {
    const texture = root
      .createTexture({
        size: [4, 4],
        format: 'rgba8unorm',
        mipLevelCount: 3,
      })
      .$usage('storage');
    const raw = root.unwrap(texture);
    const layout = tgpu.bindGroupLayout({
      image: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
    });
    root.unwrap(root.createBindGroup(layout, { image: texture }));
    const descriptor = vi.mocked(raw.createView).mock.calls[0]![0] ?? {};
    const effectiveMipCount =
      descriptor.mipLevelCount ?? raw.mipLevelCount - (descriptor.baseMipLevel ?? 0);
    expect(effectiveMipCount).toBe(1);
  });

  it('B09 binds an r32float default view without requiring float32-filterable', ({
    root,
    device,
  }) => {
    expect(device.features.has('float32-filterable')).toBe(false);
    const texture = root.createTexture({ size: [2, 2], format: 'r32float' }).$usage('sampled');
    const view = texture.createView();
    const output = root.createMutable(d.vec4f);
    const compute = tgpu.computeFn({ workgroupSize: [1] })(() => {
      'use gpu';
      output.$ = std.textureLoad(view.$, d.vec2i(0), 0);
    });
    root.unwrap(root.createComputePipeline({ compute }));
    const textureBinding = device.mock.createBindGroupLayout.mock.calls
      .flatMap(([descriptor]) => [...descriptor.entries])
      .find((entry) => entry.texture);
    expect(textureBinding?.texture?.sampleType).toBe('unfilterable-float');
  });

  it('B51 converts the typed index buffer offset and size from elements to bytes', ({
    root,
    renderPassEncoder,
  }) => {
    const indices = root.createBuffer(d.arrayOf(d.u32, 9)).$usage('index');
    trianglePipeline(root).withIndexBuffer(indices, 3, 3).drawIndexed(3);
    expect(renderPassEncoder.mock.setIndexBuffer).toHaveBeenCalledWith(
      root.unwrap(indices),
      'uint32',
      12,
      12,
    );
  });

  it('B52 recognizes the format of a location-decorated u32 index schema', ({
    root,
    renderPassEncoder,
  }) => {
    const indices = root.createBuffer(d.arrayOf(d.location(0, d.u32), 3)).$usage('index');
    trianglePipeline(root).withIndexBuffer(indices).drawIndexed(3);
    expect(renderPassEncoder.mock.setIndexBuffer).toHaveBeenCalledWith(
      root.unwrap(indices),
      'uint32',
      undefined,
      undefined,
    );
  });

  it('B53 preserves the sign bit when initializing a scalar f32 buffer with -0', ({
    root,
    device,
  }) => {
    // Retain each mapping so the test observes initialized bytes, not a fresh mock ArrayBuffer.
    const bytes = new Map<GPUBuffer, ArrayBuffer>();
    const createBuffer = device.mock.createBuffer.getMockImplementation()!;
    device.mock.createBuffer.mockImplementation((descriptor) => {
      const raw = createBuffer(descriptor);
      const backing = new ArrayBuffer(descriptor.size);
      raw.getMappedRange.mockImplementation(() => backing);
      bytes.set(raw as unknown as GPUBuffer, backing);
      return raw;
    });
    device.mock.queue.writeBuffer.mockImplementation(
      (
        buffer: GPUBuffer,
        offset: number,
        data: GPUAllowSharedBufferSource,
        dataOffset = 0,
        size?: number,
      ) => {
        const elementSize =
          ArrayBuffer.isView(data) && 'BYTES_PER_ELEMENT' in data
            ? Number(data.BYTES_PER_ELEMENT)
            : 1;
        const byteCount =
          size === undefined ? data.byteLength - dataOffset * elementSize : size * elementSize;
        const source = ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset + dataOffset * elementSize, byteCount)
          : new Uint8Array(data, dataOffset * elementSize, byteCount);
        new Uint8Array(bytes.get(buffer)!).set(source, offset);
      },
    );

    const negativeZero = root.createBuffer(d.f32, -0);
    const backing = bytes.get(root.unwrap(negativeZero))!;
    expect(new Uint32Array(backing)[0]).toBe(0x80000000);
  });

  it('B54 unwraps nested vertex attributes with explicit leaf locations', ({ root }) => {
    const layout = tgpu.vertexLayout((count) =>
      d.arrayOf(
        d.struct({
          nested: d.struct({ position: d.location(0, d.vec2f) }),
          color: d.location(1, d.vec4f),
        }),
        count,
      ),
    );
    expect(root.unwrap(layout)).toEqual({
      arrayStride: 32,
      stepMode: 'vertex',
      attributes: [
        { format: 'float32x2', offset: 0, shaderLocation: 0 },
        { format: 'float32x4', offset: 16, shaderLocation: 1 },
      ],
    });
  });

  it('B55 dispatches with a bind group explicitly assigned to index two', ({
    root,
    computePassEncoder,
  }) => {
    const layout = tgpu.bindGroupLayout({ value: { storage: d.u32, access: 'mutable' } }).$idx(2);
    const group = root.createBindGroup(layout, {
      value: root.createBuffer(d.u32).$usage('storage'),
    });
    const compute = tgpu.computeFn({ workgroupSize: [1] })(() => {
      'use gpu';
      layout.$.value = 1;
    });
    root.createComputePipeline({ compute }).with(group).dispatchWorkgroups(1);
    expect(computePassEncoder.mock.setBindGroup).toHaveBeenCalledWith(2, root.unwrap(group));
    expect(computePassEncoder.mock.dispatchWorkgroups).toHaveBeenCalledTimes(1);
    expect(computePassEncoder.mock.dispatchWorkgroups.mock.calls[0]![0]).toBe(1);
  });
});
