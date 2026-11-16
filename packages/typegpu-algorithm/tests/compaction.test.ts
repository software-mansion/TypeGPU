import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import {
  createPartition,
  createRunLengthEncode,
  createSelect,
  createUnique,
  runLengthEncode,
  select,
  unique,
} from '../src/index.ts';
import { makeCompactionSchemas, makeScatterKernel } from '../src/compact/kernels.ts';
import { countDispatches } from './utils.ts';

const isOdd = (v: number) => {
  'use gpu';
  return v % 2 === 1;
};

const Particle = d.struct({ id: d.u32, position: d.vec3f });

describe('stream compaction', () => {
  it('records flags, the scan of the flags and a scatter', ({ root }) => {
    const plan = (size: number) => {
      const input = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
      const out = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
      const lengths = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
      return {
        select: createSelect(root, input, { predicate: isOdd, out }),
        partition: createPartition(root, input, { predicate: isOdd, out }),
        unique: createUnique(root, input, { out }),
        runLengthEncode: createRunLengthEncode(root, input, { out: { values: out, lengths } }),
      };
    };

    const counts = (size: number) => Object.values(plan(size)).map((p) => countDispatches(root, p));

    // 2047 flags and a trailing zero fit one scan block.
    expect(counts(2047)).toStrictEqual([3, 3, 3, 4]);
    // 100 001 flags take a two-level scan: two scans and one apply.
    expect(counts(100_000)).toStrictEqual([5, 5, 5, 6]);
  });

  it('compiles vector and struct elements without warnings', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const vectors = root.createBuffer(d.arrayOf(d.vec2u, 100)).$usage('storage');
    const vectorsOut = root.createBuffer(d.arrayOf(d.vec2u, 100)).$usage('storage');
    select(root, vectors, {
      predicate: (v) => {
        'use gpu';
        return v.x > v.y;
      },
      out: vectorsOut,
    });
    unique(root, vectors, { out: vectorsOut });

    const particles = root.createBuffer(d.arrayOf(Particle, 100)).$usage('storage');
    const particlesOut = root.createBuffer(d.arrayOf(Particle, 100)).$usage('storage');
    const lengths = root.createBuffer(d.arrayOf(d.u32, 100)).$usage('storage');
    runLengthEncode(root, particles, {
      equal: (a, b) => {
        'use gpu';
        return a.id === b.id;
      },
      out: { values: particlesOut, lengths },
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('bounds the scatter by the element count, not the bound buffer', () => {
    const schemas = makeCompactionSchemas(d.u32);
    expect(tgpu.resolve([makeScatterKernel(schemas, 1000, 'partition')])).toMatchInlineSnapshot(`
      "fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      fn elementIndex(lid: vec3u, wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
      }

      @group(0) @binding(1) var<storage, read_write> offsets: array<u32>;

      @group(0) @binding(3) var<storage, read_write> count: u32;

      @group(0) @binding(2) var<storage, read_write> out: array<u32>;

      @group(0) @binding(0) var<storage, read> input: array<u32>;

      @compute @workgroup_size(256) fn item(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let i = elementIndex(lid, wid, numWorkgroups);
        if ((i >= 1000u)) {
          return;
        }
        let offset = offsets[i];
        let total = offsets[1000i];
        if ((i == 0u)) {
          count = total;
        }
        if ((offsets[(i + 1u)] != offset)) {
          out[offset] = input[i];
        }
        else {
          out[((total + i) - offset)] = input[i];
        }
      }"
    `);
  });

  it('allocates no new GPU resources on repeated runs of a plan', ({ root, device }) => {
    const input = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const lengths = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const plan = createRunLengthEncode(root, input, { out: { values: out, lengths } });

    plan.run();
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;
    const bindGroupsAfterFirst = device.mock.createBindGroup.mock.calls.length;

    plan.run();
    plan.run();

    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirst);
  });

  it('one-shot helpers keep only the count alive', ({ root, device }) => {
    const input = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    void [input.buffer, out.buffer];
    const buffersBefore = device.mock.createBuffer.mock.results.length;

    const count = select(root, input, { predicate: isOdd, out });

    const created = device.mock.createBuffer.mock.results.slice(buffersBefore);
    const alive = created.filter((r) => r.value.destroy.mock.calls.length === 0);
    expect(alive.map((r) => r.value)).toStrictEqual([count.buffer]);

    const own = root.createBuffer(d.u32).$usage('storage');
    expect(select(root, input, { predicate: isOdd, out, countBuffer: own })).toBe(own);
  });

  it('a plan destroys a count buffer it created, but not a given one', ({ root }) => {
    const input = root.createBuffer(d.arrayOf(d.u32, 16)).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.u32, 16)).$usage('storage');
    const own = root.createBuffer(d.u32).$usage('storage');

    const created = createUnique(root, input, { out });
    const createdCount = created.countBuffer.buffer;
    created.destroy();
    expect(vi.mocked(createdCount.destroy)).toHaveBeenCalled();

    const given = createUnique(root, input, { out, countBuffer: own });
    given.destroy();
    expect(vi.mocked(own.buffer.destroy)).not.toHaveBeenCalled();
  });

  it('rejects buffers that do not fit', ({ root }) => {
    const input = root.createBuffer(d.arrayOf(d.u32, 16)).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.u32, 16)).$usage('storage');
    const small = root.createBuffer(d.arrayOf(d.u32, 15)).$usage('storage');
    const empty = root.createBuffer(d.arrayOf(d.u32, 0)).$usage('storage');
    const particles = root.createBuffer(d.arrayOf(Particle, 16)).$usage('storage');
    const particlesOut = root.createBuffer(d.arrayOf(Particle, 16)).$usage('storage');

    expect(() => createSelect(root, input, { predicate: isOdd, out: small })).toThrow();
    expect(() => createSelect(root, empty, { predicate: isOdd, out })).toThrow();
    expect(() => createSelect(root, input, { predicate: isOdd, out: input })).toThrow();
    expect(() =>
      createRunLengthEncode(root, input, { out: { values: out, lengths: small } }),
    ).toThrow();
    expect(() =>
      createRunLengthEncode(root, input, { out: { values: out, lengths: out } }),
    ).toThrow();
    expect(() => createUnique(root, particles, { out: particlesOut })).toThrow(/equal/);
  });

  it('rejects an out buffer whose struct has a different layout', ({ root }) => {
    const A = d.struct({ id: d.u32, v: d.vec3f });
    const B = d.struct({ x: d.f32 });
    const C = d.struct({ id: d.u32, w: d.vec3f });
    const input = root.createBuffer(d.arrayOf(A, 16)).$usage('storage');
    const keepAll = (_: d.Infer<typeof A>) => {
      'use gpu';
      return true;
    };
    for (const schema of [B, C]) {
      const out = root.createBuffer(d.arrayOf(schema, 16)).$usage('storage');
      expect(() => createSelect(root, input, { predicate: keepAll, out: out as never })).toThrow(
        /same element type/,
      );
    }
    const same = root
      .createBuffer(d.arrayOf(d.struct({ id: d.u32, v: d.vec3f }), 16))
      .$usage('storage');
    expect(() => createSelect(root, input, { predicate: keepAll, out: same })).not.toThrow();
  });
});
