import { describe, expect } from 'vitest';
import { $internal } from '../../src/shared/symbols.ts';
import { it } from 'typegpu-testing-utility';

describe('TgpuQuerySet', () => {
  it('should create buffers lazily when accessed', ({ root, device }) => {
    const querySet = root.createQuerySet('occlusion', 2);

    expect(device.mock.createBuffer).not.toHaveBeenCalled();

    const readBuffer = querySet[$internal].readBuffer;
    const resolveBuffer = querySet[$internal].resolveBuffer;

    expect(device.mock.createBuffer).toHaveBeenCalledWith({
      size: 2 * BigUint64Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    expect(device.mock.createBuffer).toHaveBeenCalledWith({
      size: 2 * BigUint64Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });

    expect(readBuffer).toBeDefined();
    expect(resolveBuffer).toBeDefined();
  });

  it('should destroy internal buffers when destroyed', ({ root }) => {
    const querySet = root.createQuerySet('occlusion', 2);

    const readBuffer = querySet[$internal].readBuffer;
    const resolveBuffer = querySet[$internal].resolveBuffer;

    querySet.destroy();

    expect(readBuffer.destroy).toHaveBeenCalled();
    expect(resolveBuffer.destroy).toHaveBeenCalled();
  });

  it('should calculate buffer sizes correctly for different counts', ({ root, device }) => {
    const smallQuerySet = root.createQuerySet('timestamp', 1);
    const largeQuerySet = root.createQuerySet('occlusion', 100);

    smallQuerySet[$internal].readBuffer;
    largeQuerySet[$internal].readBuffer;

    expect(device.mock.createBuffer).toHaveBeenCalledWith({
      size: 1 * BigUint64Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    expect(device.mock.createBuffer).toHaveBeenCalledWith({
      size: 100 * BigUint64Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  });

  it('should only create internal buffers once', ({ root, device }) => {
    const querySet = root.createQuerySet('occlusion', 3);

    querySet[$internal].readBuffer;
    querySet[$internal].readBuffer;
    querySet[$internal].resolveBuffer;
    querySet[$internal].resolveBuffer;

    expect(device.mock.createBuffer).toHaveBeenCalledTimes(2);
  });
});
