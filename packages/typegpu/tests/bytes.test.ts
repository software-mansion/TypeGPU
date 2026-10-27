import { describe, expect, expectTypeOf, vi } from 'vitest';
import { d, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('d.bytes', () => {
  it('resolves to the WGSL buffer type and requires buffer_view', ({ root }) => {
    const packet = root.createMutable(d.bytes(256));
    const page = root.createUniform(d.bytes(64));
    const scratch = tgpu.workgroupVar(d.bytes(1024));
    const layout = tgpu.bindGroupLayout({ mesh: { storage: d.bytes } });

    const fill = tgpu.fn([d.ptrStorage(d.bytes(), 'read-write')])(() => {});

    const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
      const mesh = layout.$.mesh;
      const local = scratch.$;
      fill(d.ref(packet.$));

      if (false) {
        expectTypeOf(mesh).toEqualTypeOf<d.bytes>();
        expectTypeOf(page.$).toEqualTypeOf<d.bytes>();
      }
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "requires buffer_view;

      @group(1) @binding(0) var<storage, read> mesh_1: buffer;

      var<workgroup> scratch: buffer<1024>;

      fn fill(_arg_0: ptr<storage, buffer, read_write>) {}

      @group(0) @binding(0) var<storage, read_write> packet: buffer<256>;

      @compute @workgroup_size(1) fn main() {
        let mesh = (&mesh_1);
        let local = (&scratch);
        fill((&packet));
      }"
    `);
  });

  it('throws when the environment does not support buffer_view', ({ root, navigator }) => {
    navigator.gpu.wgslLanguageFeatures.delete('buffer_view');
    const scratch = tgpu.workgroupVar(d.bytes(1024));
    const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
      const local = scratch.$;
    });

    expect(() => root.createComputePipeline({ compute: main }).dispatchWorkgroups(1))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - computePipelineCore
        - computeFn:main
        - d.ref(scratch.$)
        - var:scratch.$
        - var:scratch
        - bytes(1024): d.bytes(1024) cannot be used, because the 'buffer_view' WGSL language extension is not supported in this environment. Check support with root.enabledWgslLanguageFeatures and fall back to typed schemas (d.struct, d.arrayOf) when unavailable.]
      `);
  });

  it('allows buffers only as whole storage, uniform and workgroup variables', () => {
    const local = tgpu.privateVar(d.bytes(16));
    const layout = tgpu.bindGroupLayout({ page: { uniform: d.bytes() } });
    const readLocal = tgpu.fn([])(() => {
      const bytes = local.$;
    });
    const readPage = tgpu.fn([])(() => {
      const bytes = layout.$.page;
    });

    expect(() => tgpu.resolve([readLocal])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:readLocal
      - d.ref(local.$)
      - var:local.$
      - var:local: d.bytes(16) cannot be used in the 'private' address space, only in storage, uniform and workgroup variables.]
    `);
    expect(() => tgpu.resolve([readPage])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:readPage
      - d.ref(layout.$.page)
      - uniform:page.$
      - uniform:page: d.bytes needs a size in the 'uniform' address space, only storage allows runtime-sized buffers. Give it a size, e.g. d.bytes(256).]
    `);
    expect(() => d.struct({ data: d.bytes(16) })).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot use d.bytes(16) as struct property 'data', buffers can only be whole variables.]`,
    );
    expect(() => d.arrayOf(d.bytes(16), 4)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create an array of d.bytes(16), buffers can only be whole variables.]`,
    );
    expect(() => d.bytes(6)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a buffer schema of 6 bytes, the size has to be a multiple of 4.]`,
    );
  });

  it('needs a size outside storage bind group layouts', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ mesh: { storage: d.bytes } });
    root.createBindGroup(layout, { mesh: root.createBuffer(d.bytes(512)).$usage('storage') });

    if (false) {
      // @ts-expect-error
      root.createBuffer(d.bytes());
      // @ts-expect-error
      root.createUniform(d.bytes());
      // @ts-expect-error
      tgpu.workgroupVar(d.bytes());
    }
  });

  it('takes buffers of any schema in bind group layouts', ({ root }) => {
    const layout = tgpu.bindGroupLayout({
      mesh: { storage: d.bytes },
      counts: { storage: d.bytes, access: 'mutable' },
      params: { uniform: d.bytes(16) },
    });

    root.createBindGroup(layout, {
      mesh: root.createBuffer(d.arrayOf(d.vec2f, 64)).$usage('storage'),
      counts: root.createMutable(d.arrayOf(d.u32, 4)),
      params: root.createUniform(d.vec4f),
    });
  });

  it('writes and reads raw bytes', async ({ root, device }) => {
    const packet = root.createBuffer(d.bytes(16), new Uint32Array([1, 2, 3]));
    const initial = vi.mocked(root.unwrap(packet).getMappedRange).mock.results[0]?.value;
    expect([...new Uint32Array(initial)]).toStrictEqual([1, 2, 3, 0]);

    const page = root.createBuffer(d.bytes(16));
    page.write(new Uint16Array([7, 8]), { startOffset: 4 });
    const [, gpuOffset, data, dataOffset, size] = vi.mocked(device.queue.writeBuffer).mock
      .calls[0]!;
    expect([gpuOffset, dataOffset, size]).toStrictEqual([4, 4, 4]);
    expect([...new Uint16Array(data as ArrayBuffer, 4, 2)]).toStrictEqual([7, 8]);

    const read = await page.read();
    expectTypeOf(read).toEqualTypeOf<ArrayBuffer>();
    expect(read.byteLength).toBe(16);
  });

  it('measures and compares as raw bytes', () => {
    expect(d.sizeOf(d.bytes(64))).toBe(64);
    expect(d.sizeOf(d.bytes())).toBeNaN();
    expect(d.alignmentOf(d.bytes(64))).toBe(4);
    expect(d.schemasEqualStructurally(d.bytes(64), d.bytes(64))).toBe(true);
    expect(d.schemasEqualStructurally(d.bytes(64), d.bytes(32))).toBe(false);
  });
});
