import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';

describe('TgpuQuerySet', () => {
  it('should be namable', ({ root }) => {
    const querySet = root.createQuerySet('occlusion', 8);

    querySet.querySet;
    querySet.$name('myQuerySet');

    expect(querySet.querySet).toBeDefined();
    expect(querySet.querySet.label).toBe('myQuerySet');
  });

  it('should create a query set with correct type and count', ({ root, device }) => {
    const querySet = root.createQuerySet('timestamp', 4);

    const rawQuerySet = querySet.querySet;

    expect(querySet.type).toBe('timestamp');
    expect(querySet.count).toBe(4);
    expect(querySet.resourceType).toBe('query-set');
    expect(rawQuerySet).toBeDefined();

    expect(device.mock.createQuerySet).toHaveBeenCalledWith({
      type: 'timestamp',
      count: 4,
    });
  });

  it('should resolve query set correctly', ({ root, device, commandEncoder }) => {
    const querySet = root.createQuerySet('timestamp', 3);

    querySet.resolve();

    expect(device.mock.createCommandEncoder).toHaveBeenCalled();
    expect(commandEncoder.resolveQuerySet).toHaveBeenCalledWith(
      querySet.querySet,
      0,
      3,
      expect.any(Object),
      0,
    );
    expect(commandEncoder.finish).toHaveBeenCalled();
    expect(device.queue.submit).toHaveBeenCalled();
  });

  it('should read from query set after resolution', async ({ root, device, commandEncoder }) => {
    const querySet = root.createQuerySet('timestamp', 2);

    querySet.resolve();

    const testData = new BigUint64Array([123n, 456n]);
    const readPromise = querySet.read();
    const readBuffer = device.mock.createBuffer.mock.results.at(-1)?.value as GPUBuffer;
    readBuffer.getMappedRange = vi.fn(() => testData.buffer);

    const data = await readPromise;

    expect(commandEncoder.copyBufferToBuffer).toHaveBeenCalledWith(
      expect.any(Object),
      0,
      readBuffer,
      0,
      2 * BigUint64Array.BYTES_PER_ELEMENT,
    );
    expect(device.queue.submit).toHaveBeenCalled();
    expect(readBuffer.mapAsync).toHaveBeenCalledWith(GPUMapMode.READ);
    expect(readBuffer.getMappedRange).toHaveBeenCalled();
    expect(readBuffer.unmap).toHaveBeenCalled();

    expect(data).toEqual([123n, 456n]);
  });

  it('should throw when reading before resolving', async ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);

    await expect(querySet.read()).rejects.toThrow('QuerySet must be resolved before reading.');
  });

  it('should throw when using destroyed query set', ({ root }) => {
    const querySet = root.createQuerySet('occlusion', 2);
    querySet.destroy();

    expect(() => querySet.querySet).toThrow('QuerySet has been destroyed.');
    expect(() => querySet.resolve()).toThrow('This QuerySet has been destroyed.');
  });

  it('should track availability state', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 1);

    expect(querySet.available).toBe(true);
    expect(querySet.destroyed).toBe(false);
  });

  it('should throw when resolving unavailable query set', async ({ root }) => {
    const querySet = root.createQuerySet('occlusion', 1);
    querySet.resolve();

    const readResult = querySet.read();
    expect(() => querySet.resolve()).toThrow('This QuerySet is busy resolving or reading.');
    await readResult;
  });

  it('should work with external query set', ({ root, device }) => {
    const externalQuerySet = device.createQuerySet({
      type: 'timestamp',
      count: 5,
    });

    const querySet = root.createQuerySet('timestamp', 5, externalQuerySet);

    expect(querySet.querySet).toBe(externalQuerySet);
    expect(device.mock.createQuerySet).toHaveBeenCalledTimes(1); // Only the external one
  });

  it('should not destroy external query set', ({ root, device }) => {
    const externalQuerySet = device.createQuerySet({
      type: 'occlusion',
      count: 3,
    });

    const querySet = root.createQuerySet('occlusion', 3, externalQuerySet);
    querySet.destroy();

    expect(externalQuerySet.destroy).not.toHaveBeenCalled();
  });

  it('should destroy internal query set when destroyed', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);
    const rawQuerySet = querySet.querySet;
    querySet.destroy();

    expect(rawQuerySet.destroy).toHaveBeenCalled();
    expect(querySet.destroyed).toBe(true);
  });

  it('should handle multiple destroy calls gracefully', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 1);
    const rawQuerySet = querySet.querySet;

    querySet.destroy();
    querySet.destroy();

    expect(rawQuerySet.destroy).toHaveBeenCalledTimes(1);
    expect(querySet.destroyed).toBe(true);
  });

  it('should handle different query types', ({ root, device }) => {
    const occlusionQuerySet = root.createQuerySet('occlusion', 4);
    const timestampQuerySet = root.createQuerySet('timestamp', 2);

    expect(occlusionQuerySet.type).toBe('occlusion');
    expect(timestampQuerySet.type).toBe('timestamp');

    occlusionQuerySet.querySet;
    timestampQuerySet.querySet;

    expect(device.mock.createQuerySet).toHaveBeenCalledWith({
      type: 'occlusion',
      count: 4,
    });

    expect(device.mock.createQuerySet).toHaveBeenCalledWith({
      type: 'timestamp',
      count: 2,
    });
  });

  it('should handle resolve operations correctly', ({ root, device, commandEncoder }) => {
    const querySet = root.createQuerySet('timestamp', 5);

    querySet.resolve();
    querySet.resolve();

    expect(device.mock.createCommandEncoder).toHaveBeenCalledTimes(2);
    expect(commandEncoder.resolveQuerySet).toHaveBeenCalledTimes(2);
    expect(commandEncoder.finish).toHaveBeenCalledTimes(2);
    expect(device.queue.submit).toHaveBeenCalledTimes(2);
  });
});
