import { describe, expect, expectTypeOf } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('buffer views', () => {
  it('packs differently typed data at runtime offsets', () => {
    const Header = d.struct({ indexCount: d.u32, vertexCount: d.u32 });
    const layout = tgpu.bindGroupLayout({
      mesh: { storage: d.bytes },
      sum: { storage: d.f32, access: 'mutable' },
    });

    const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
      const header = std.bufferView(Header, layout.$.mesh, 0);
      const indicesSize = header.indexCount * 4;
      const indices = std.bufferArrayView(d.arrayOf(d.u32), layout.$.mesh, 8, indicesSize);
      const vertices = std.bufferView(d.arrayOf(d.vec2f), layout.$.mesh, 8 + indicesSize);

      for (const index of indices) {
        layout.$.sum += vertices[index]!.x;
      }
      layout.$.sum /= d.f32(std.bufferLength(layout.$.mesh));

      if (false) {
        expectTypeOf(header).toEqualTypeOf<d.ref<{ indexCount: number; vertexCount: number }>>();
        expectTypeOf(indices).toEqualTypeOf<d.ref<number[]>>();
        expectTypeOf(vertices).toEqualTypeOf<d.ref<d.v2f[]>>();
        expectTypeOf(std.bufferLength(layout.$.mesh)).toEqualTypeOf<number>();
      }
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "requires buffer_view;

      struct Header {
        indexCount: u32,
        vertexCount: u32,
      }

      @group(0) @binding(0) var<storage, read> mesh: buffer;

      @group(0) @binding(1) var<storage, read_write> sum: f32;

      @compute @workgroup_size(1) fn main() {
        let header = bufferView<Header>(&mesh, 0u);
        let indicesSize = ((*header).indexCount * 4u);
        let indices = bufferArrayView<array<u32>>(&mesh, 8u, indicesSize);
        let vertices = bufferView<array<vec2f>>(&mesh, (8u + indicesSize));
        for (var i = 0u; i < arrayLength(indices); i += 1u) {
          let index = (*indices)[i];
          sum += (*vertices)[index].x;
        }
        sum /= f32(bufferLength(&mesh));
      }"
    `);
  });

  it('reads ragged records', ({ root }) => {
    const records = root.createReadonly(d.bytes(4096));
    const totals = root.createMutable(d.arrayOf(d.f32, 64));

    const main = tgpu.computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(({ gid }) => {
      let offset = d.u32(0);
      for (let i = d.u32(0); i < gid.x; i++) {
        offset += 4 + std.bufferView(d.u32, records.$, offset).$ * 4;
      }
      const count = std.bufferView(d.u32, records.$, offset).$;
      const values = std.bufferArrayView(d.arrayOf(d.f32), records.$, offset + 4, count * 4);
      let total = d.f32(0);
      for (const value of values) {
        total += value;
      }
      totals.$[gid.x] = total;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "requires buffer_view;

      @group(0) @binding(0) var<storage, read> records: buffer<4096>;

      @group(0) @binding(1) var<storage, read_write> totals: array<f32, 64>;

      @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) gid: vec3u) {
        var offset = 0u;
        for (var i = 0u; (i < gid.x); i++) {
          offset += (4u + ((*bufferView<u32>(&records, offset)) * 4u));
        }
        let count = (*bufferView<u32>(&records, offset));
        let values = bufferArrayView<array<f32>>(&records, (offset + 4u), (count * 4u));
        var total = 0f;
        for (var i = 0u; i < arrayLength(values); i += 1u) {
          let value = (*values)[i];
          total += value;
        }
        totals[gid.x] = total;
      }"
    `);
  });

  it('reinterprets bytes as another type', ({ root }) => {
    const packet = root.createMutable(d.bytes(16));

    const negate = tgpu.fn([])(() => {
      const bits = std.bufferView(d.u32, packet.$, 0);
      bits.$ ^= 0x80000000;
      std.bufferView(d.f32, packet.$, 4).$ = -std.bufferView(d.f32, packet.$, 4).$;
    });

    expect(tgpu.resolve([negate])).toMatchInlineSnapshot(`
      "requires buffer_view;

      @group(0) @binding(0) var<storage, read_write> packet: buffer<16>;

      fn negate() {
        let bits = bufferView<u32>(&packet, 0u);
        (*bits) ^= 2147483648u;
        (*bufferView<f32>(&packet, 4u)) = -((*bufferView<f32>(&packet, 4u)));
      }"
    `);
  });

  it('reuses workgroup memory across phases', () => {
    const scratch = tgpu.workgroupVar(d.bytes(1024));

    const main = tgpu.computeFn({
      workgroupSize: [128],
      in: { lid: d.builtin.localInvocationIndex },
    })(({ lid }) => {
      const floats = std.bufferView(d.arrayOf(d.f32, 256), scratch.$, 0);
      floats[lid] = d.f32(lid);
      std.workgroupBarrier();

      const pairs = std.bufferView(d.arrayOf(d.vec2u, 128), scratch.$, 0);
      pairs[lid] = d.vec2u(lid);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "requires buffer_view;

      var<workgroup> scratch: buffer<1024>;

      @compute @workgroup_size(128) fn main(@builtin(local_invocation_index) lid: u32) {
        let floats = bufferView<array<f32, 256>>(&scratch, 0u);
        (*floats)[lid] = f32(lid);
        workgroupBarrier();
        let pairs = bufferView<array<vec2u, 128>>(&scratch, 0u);
        (*pairs)[lid] = vec2u(lid);
      }"
    `);
  });

  it('views uniform buffers and pointer parameters', ({ root }) => {
    const Light = d.struct({ position: d.vec3f, range: d.f32 });
    const lights = root.createUniform(d.bytes(512));
    const counters = root.createMutable(d.bytes(64));

    const bump = tgpu.fn([d.ptrStorage(d.bytes(), 'read-write'), d.u32])((buffer, index) => {
      std.bufferView(d.u32, buffer, index * 4).$ += 1;
    });

    const main = tgpu.fn(
      [d.u32],
      d.f32,
    )((index) => {
      bump(d.ref(counters.$), index);
      return std.bufferView(Light, lights.$, index * 32).range;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "requires buffer_view;

      fn bump(buffer: ptr<storage, buffer, read_write>, index: u32) {
        (*bufferView<u32>(&(*buffer), (index * 4u))) += 1u;
      }

      @group(0) @binding(0) var<storage, read_write> counters: buffer<64>;

      struct Light {
        position: vec3f,
        range: f32,
      }

      @group(0) @binding(1) var<uniform> lights: buffer<512>;

      fn main(index: u32) -> f32 {
        bump((&counters), index);
        return (*bufferView<Light>(&lights, (index * 32u))).range;
      }"
    `);
  });

  it('rejects views that the shader cannot hold', ({ root }) => {
    const packet = root.createMutable(d.bytes(16));
    const Counter = d.struct({ count: d.atomic(d.u32) });
    const resolveFn = (body: () => void) => () => tgpu.resolve([tgpu.fn([])(body)]);

    expect(
      resolveFn(() => {
        'use gpu';
        // @ts-expect-error: buffer views cannot hold atomics
        std.bufferView(Counter, packet.$, 0);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferView: std.bufferView cannot view 'Counter', because WGSL buffer views cannot hold atomics.]
    `);
    expect(
      resolveFn(() => {
        'use gpu';
        // @ts-expect-error: booleans are not host-shareable
        std.bufferView(d.vec2b, packet.$, 0);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferView: std.bufferView cannot view 'vec2<bool>', because 'vec2<bool>' is not host-shareable.]
    `);
    expect(
      resolveFn(() => {
        'use gpu';
        // @ts-expect-error: std.bufferArrayView needs a runtime-sized schema
        std.bufferArrayView(d.arrayOf(d.u32, 4), packet.$, 0, 16);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferArrayView: std.bufferArrayView needs a runtime-sized schema, such as d.arrayOf(d.u32). Use std.bufferView for 'arrayOf(u32, 4)'.]
    `);
    expect(
      resolveFn(() => {
        'use gpu';
        // @ts-expect-error: only d.bytes buffers can be viewed
        std.bufferView(d.u32, d.u32(1), 0);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferView: std.bufferView expects a d.bytes buffer, got 'u32'. Declare the buffer with d.bytes(n).]
    `);
  });

  it('rejects misaligned and out-of-bounds constant offsets', ({ root }) => {
    const packet = root.createMutable(d.bytes(64));
    const resolveFn = (body: () => void) => () => tgpu.resolve([tgpu.fn([])(body)]);

    expect(
      resolveFn(() => {
        'use gpu';
        std.bufferView(d.vec4f, packet.$, 8);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferView: std.bufferView cannot view 'vec4f' at byte 8, because the offset is not a multiple of its alignment (16).]
    `);
    expect(
      resolveFn(() => {
        'use gpu';
        std.bufferView(d.mat2x2f, packet.$, 56);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferView: std.bufferView cannot view 'mat2x2f' at byte 56 of d.bytes(64), because the view needs 16 bytes and only 8 are left.]
    `);
    expect(
      resolveFn(() => {
        'use gpu';
        std.bufferArrayView(d.arrayOf(d.u32), packet.$, 32, 40);
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:bufferArrayView: std.bufferArrayView cannot view 'array<u32>' at byte 32 of d.bytes(64), because the view needs 40 bytes and only 32 are left.]
    `);
  });

  it('keeps views of read-only buffers read-only', ({ root }) => {
    const packet = root.createReadonly(d.bytes(16));
    const page = root.createUniform(d.bytes(16));
    const resolveFn = (body: () => void) => () => tgpu.resolve([tgpu.fn([])(body)]);

    expect(
      resolveFn(() => {
        'use gpu';
        std.bufferView(d.u32, packet.$, 0).$ = 1;
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>: 'std.bufferView(d.u32, packet.$, 0).$ = 1' is invalid, because readonly buffers cannot be mutated.]
    `);
    expect(
      resolveFn(() => {
        'use gpu';
        std.bufferView(d.vec4f, page.$, 0).x = 1;
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>: 'std.bufferView(d.vec4f, page.$, 0).x = 1' is invalid, because uniform buffers cannot be mutated.]
    `);
  });
});
