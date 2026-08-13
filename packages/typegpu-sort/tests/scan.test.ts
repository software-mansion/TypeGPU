import { tgpu, d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createPrefixScanComputer, prefixScan } from '../src/index.ts';
import { makeScanSchemas } from '../src/scan/schemas.ts';
import { getResolvedWgsl } from './utils.ts';

describe('prefix scan', () => {
  it('emits no warnings for any element type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const dataType of [d.u32, d.i32, d.f32] as const) {
      const buffer = root.createBuffer(d.arrayOf(dataType, 4096)).$usage('storage');
      prefixScan(root, { inputBuffer: buffer, operation: std.add, identityElement: 0 });
    }

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('types the workgroup memory and layouts after the element type', () => {
    const { workgroupMemory, scanLayout, applySumsLayout } = makeScanSchemas(d.i32);
    expect(tgpu.resolve([workgroupMemory, scanLayout, applySumsLayout])).toMatchInlineSnapshot(`
      "var<workgroup> workgroupMemory: array<i32, 256>;

      @group(0) @binding(0) var<storage, read_write> input: array<i32>;

      @group(0) @binding(1) var<storage, read_write> sums: array<i32>;

      @group(1) @binding(0) var<storage, read_write> input_1: array<i32>;

      @group(1) @binding(1) var<storage, read> sums_1: array<i32>;"
    `);
  });

  it('reuses scratch buffers and bind groups across repeated scans', ({ root, device }) => {
    const computer = createPrefixScanComputer(root, {
      operation: std.add,
      identityElement: 0,
      dataType: d.u32,
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    computer.scan(buffer);
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;
    const bindGroupsAfterFirst = device.mock.createBindGroup.mock.calls.length;
    const modulesAfterFirst = device.mock.createShaderModule.mock.calls.length;

    computer.scan(buffer);
    computer.scan(buffer);

    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirst);
    expect(device.mock.createShaderModule.mock.calls.length).toBe(modulesAfterFirst);
  });

  it('should produce valid code for a reduction', ({ root, device }) => {
    const computer = createPrefixScanComputer(root, {
      operation: std.add,
      identityElement: 0,
      dataType: d.u32,
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    computer.reduce(buffer);

    expect(getResolvedWgsl(device)).toMatchInlineSnapshot(`
      "fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(0) var<storage, read_write> input: array<u32>;

      var<workgroup> workgroupMemory: array<u32, 256>;

      fn upsweep(localIdx: u32) {
        var offset = 1u;
        for (var span = 128u; (span > 0u); span >>= 1u) {
          workgroupBarrier();
          if ((localIdx < span)) {
            let ai = ((offset * ((2u * localIdx) + 1u)) - 1u);
            let bi = ((offset * ((2u * localIdx) + 2u)) - 1u);
            workgroupMemory[bi] = (workgroupMemory[ai] + workgroupMemory[bi]);
          }
          offset <<= 1u;
        }
      }

      @group(0) @binding(1) var<storage, read_write> sums: array<u32>;

      @compute @workgroup_size(256) fn item(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
        let localIdx = lid.x;
        let baseIdx = (((workgroupId * 256u) + localIdx) * 8u);
        var partialSums = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        var prev = 0u;
        var lastIdx = 0u;
        // unrolled iteration #0
        if (((baseIdx + 0u) < arrayLength(&input))) {
          partialSums[0i] = (prev + input[(baseIdx + 0u)]);
          prev = partialSums[0i];
          lastIdx = 0u;
        }
        // unrolled iteration #1
        if (((baseIdx + 1u) < arrayLength(&input))) {
          partialSums[1i] = (prev + input[(baseIdx + 1u)]);
          prev = partialSums[1i];
          lastIdx = 1u;
        }
        // unrolled iteration #2
        if (((baseIdx + 2u) < arrayLength(&input))) {
          partialSums[2i] = (prev + input[(baseIdx + 2u)]);
          prev = partialSums[2i];
          lastIdx = 2u;
        }
        // unrolled iteration #3
        if (((baseIdx + 3u) < arrayLength(&input))) {
          partialSums[3i] = (prev + input[(baseIdx + 3u)]);
          prev = partialSums[3i];
          lastIdx = 3u;
        }
        // unrolled iteration #4
        if (((baseIdx + 4u) < arrayLength(&input))) {
          partialSums[4i] = (prev + input[(baseIdx + 4u)]);
          prev = partialSums[4i];
          lastIdx = 4u;
        }
        // unrolled iteration #5
        if (((baseIdx + 5u) < arrayLength(&input))) {
          partialSums[5i] = (prev + input[(baseIdx + 5u)]);
          prev = partialSums[5i];
          lastIdx = 5u;
        }
        // unrolled iteration #6
        if (((baseIdx + 6u) < arrayLength(&input))) {
          partialSums[6i] = (prev + input[(baseIdx + 6u)]);
          prev = partialSums[6i];
          lastIdx = 6u;
        }
        // unrolled iteration #7
        if (((baseIdx + 7u) < arrayLength(&input))) {
          partialSums[7i] = (prev + input[(baseIdx + 7u)]);
          prev = partialSums[7i];
          lastIdx = 7u;
        }
        // ---
        workgroupMemory[localIdx] = partialSums[lastIdx];
        upsweep(localIdx);
        if (((localIdx == 0u) && (workgroupId < arrayLength(&sums)))) {
          sums[workgroupId] = workgroupMemory[255i];
        }
      }"
    `);
    expect(device.mock.createComputePipeline.mock.calls.length).toMatchInlineSnapshot(`1`);
  });

  it('rejects empty and mismatched buffers', ({ root }) => {
    const computer = createPrefixScanComputer(root, {
      operation: std.add,
      identityElement: 0,
    });
    const empty = root.createBuffer(d.arrayOf(d.f32, 0)).$usage('storage');
    expect(() => computer.prepare(empty)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot scan an empty buffer.]`,
    );

    const input = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const output = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');
    expect(() =>
      prefixScan(root, {
        inputBuffer: input,
        outputBuffer: output,
        operation: std.add,
        identityElement: 0,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: The input and output scan buffers must have the same type and length.]`,
    );
  });
});
