import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';
import { describe, expect, vi } from 'vitest';
import { registerTypegpuReactSerializables } from '../../src/react-native/serialization/register-serializables.ts';

const { registerCustomSerializable } = vi.hoisted(() => ({
  registerCustomSerializable: vi.fn(),
}));

vi.mock('react-native-webgpu', () => ({ installWebGPU: vi.fn() }));
vi.mock('../../src/react-native/worklets-integration.ts', () => ({
  getWorkletsModule: () => ({ registerCustomSerializable }),
}));

type Serializer = {
  determine(value: object): boolean;
  pack(value: object): object;
  unpack(value: object): object;
};

function getSerializer(): Serializer {
  registerTypegpuReactSerializables();

  const serializer = vi.mocked(registerCustomSerializable).mock.calls[0]?.[0] as
    | Serializer
    | undefined;
  if (!serializer) {
    throw new Error('TypeGPU serializer was not registered.');
  }
  return serializer;
}

describe('react-native serializable registration', () => {
  it('round-trips buffers end to end', ({ root }) => {
    const serializer = getSerializer();
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');
    const rawBuffer = root.unwrap(buffer);

    expect(serializer.determine(buffer)).toBe(true);

    const restored = serializer.unpack(serializer.pack(buffer)) as typeof buffer;
    expect(restored.usableAsStorage).toBe(true);
    expect(restored.root.device).toBe(root.device);
    expect(restored.root.unwrap(restored)).toBe(rawBuffer);
  });

  it('round-trips roots by device identity', ({ root }) => {
    const serializer = getSerializer();

    expect(serializer.determine(root)).toBe(true);

    const restored = serializer.unpack(serializer.pack(root)) as typeof root;
    expect(restored.resourceType).toBe('root');
    expect(restored.device).toBe(root.device);
    expect(serializer.unpack(serializer.pack(root))).toBe(restored);
  });

  it('fails loudly for non-transferable TypeGPU objects', ({ root }) => {
    const serializer = getSerializer();
    const view = root
      .createTexture({ size: [2, 2], format: 'rgba8unorm' })
      .$usage('sampled')
      .createView();

    expect(serializer.determine(view)).toBe(true);
    expect(() => serializer.pack(view)).toThrowErrorMatchingInlineSnapshot(
      `[Error: [typegpu-react] TypeGPU object 'texture-view' cannot be transferred to a worklet. Definitions (functions, comptime, derived) are runtime-local: import them from a module covered by importForwarding, or build pipelines on the RN thread and transfer the result.]`,
    );
  });

  it('rejects plain-function performance callbacks', ({ root }) => {
    const serializer = getSerializer();
    const pipeline = root
      .createComputePipeline({
        compute: tgpu.computeFn({ workgroupSize: [1] })(() => {
          'use gpu';
        }),
      })
      .withTimestampWrites({ querySet: root.createQuerySet('timestamp', 2) })
      .withPerformanceCallback(vi.fn());

    expect(() => serializer.pack(pipeline)).toThrowErrorMatchingInlineSnapshot(
      `[Error: [typegpu-react] Cannot transfer 'compute-pipeline': its 'performanceCallback' is a plain function. Only worklets can cross runtimes - mark it with 'worklet'. If it is a schema or TypeGPU definition, it cannot be transferred yet.]`,
    );
  });
});
