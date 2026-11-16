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
import {
  itemsPerThread,
  makeCompactionSchemas,
  makeScatterKernel,
} from '../src/compact/kernels.ts';
import { countDispatches } from './utils.ts';

const isOdd = (v: number) => {
  'use gpu';
  return v % 2 === 1;
};

const Particle = d.struct({ id: d.u32, position: d.vec3f });

describe('stream compaction', () => {
  it('records tile counts, the scan of the tile counts and a scatter', ({ root }) => {
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

    // u32 tiles hold 2048 elements: 49 tile counts and a trailing zero fit one scan block.
    expect(counts(100_000)).toStrictEqual([3, 3, 3, 4]);
    // 2442 tile counts and a trailing zero take a two-level scan: two scans and one apply.
    expect(counts(2442 * 2048)).toStrictEqual([5, 5, 5, 6]);
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
    expect(tgpu.resolve([makeScatterKernel(schemas, 1000, itemsPerThread(d.u32), 'partition')]))
      .toMatchInlineSnapshot(`
      "fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(2) var<storage, read_write> masks: array<u32>;

      var<workgroup> threadCounts: array<u32, 256>;

      fn exclusiveTileSum(localIdx: u32, value: u32) -> u32 {
        threadCounts[localIdx] = value;
        for (var span = 1u; (span < 256u); span <<= 1u) {
          workgroupBarrier();
          var add = 0u;
          if ((localIdx >= span)) {
            add = threadCounts[(localIdx - span)];
          }
          workgroupBarrier();
          threadCounts[localIdx] = (threadCounts[localIdx] + add);
        }
        return (threadCounts[localIdx] - value);
      }

      @group(0) @binding(1) var<storage, read_write> offsets: array<u32>;

      @group(0) @binding(4) var<storage, read_write> count: u32;

      @group(0) @binding(3) var<storage, read_write> out: array<u32>;

      @group(0) @binding(0) var<storage, read> input: array<u32>;

      @compute @workgroup_size(256) fn item(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let tileId = flatWorkgroupIndex(wid, numWorkgroups);
        if ((tileId >= 1u)) {
          return;
        }
        let localIdx = lid.x;
        let thread = ((tileId * 256u) + localIdx);
        let first = (thread * 8u);
        let mask = masks[thread];
        let before = exclusiveTileSum(localIdx, countOneBits(mask));
        let total = offsets[1i];
        if (((tileId == 0u) && (localIdx == 0u))) {
          count = total;
        }
        var offset = (offsets[tileId] + before);
        for (var k = 0u; (k < 8u); k++) {
          let i = (first + k);
          if ((i < 1000u)) {
            if ((((mask >> k) & 1u) == 1u)) {
              out[offset] = input[i];
              offset += 1u;
            }
            else {
              out[((total + i) - offset)] = input[i];
            }
          }
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
