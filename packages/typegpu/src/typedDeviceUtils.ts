import { BufferReader, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './types';

export function getBufferMappable(
  device: GPUDevice,
  buffer: GPUBuffer,
): GPUBuffer;
export function getBufferMappable<T extends AnyWgslData>(
  device: GPUDevice,
  buffer: GPUBufferTyped<T>,
): GPUBufferTyped<T>;
export function getBufferMappable<T extends AnyWgslData>(
  device: GPUDevice,
  buffer: GPUBufferTyped<T> | GPUBuffer,
) {
  const stagingBuffer = device.createBuffer({
    size: buffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  if ('typeInfo' in buffer) {
    Object.defineProperty(stagingBuffer, 'typeInfo', {
      value: buffer.typeInfo,
    });
  }
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, buffer.size);
  device.queue.submit([commandEncoder.finish()]);
  return stagingBuffer;
}

export async function readMappableBuffer<T extends AnyWgslData>(
  buffer: GPUBufferTyped<T>,
): Promise<Parsed<T>>;
export async function readMappableBuffer(
  buffer: GPUBuffer,
): Promise<ArrayBuffer>;
export async function readMappableBuffer<T extends AnyWgslData>(
  buffer: GPUBufferTyped<T> | GPUBuffer,
): Promise<Parsed<T> | ArrayBuffer> {
  await buffer.mapAsync(GPUMapMode.READ);
  if ('typeInfo' in buffer) {
    const data = buffer.typeInfo.read(
      new BufferReader(buffer.getMappedRange()),
    ) as Parsed<T>;
    buffer.unmap();
    return data;
  }
  const data = buffer.getMappedRange().slice(0);
  buffer.unmap();
  return data;
}
