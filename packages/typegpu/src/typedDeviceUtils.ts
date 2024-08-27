import { BufferReader, type Parsed } from 'typed-binary';
import { typedBuffer } from '.';
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

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(
    bufferUnwrapped(buffer),
    0,
    stagingBuffer,
    0,
    buffer.size,
  );

  device.queue.submit([commandEncoder.finish()]);

  if (isBufferTyped(buffer)) {
    return typedBuffer(stagingBuffer, buffer.typeInfo);
  }

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
  await bufferUnwrapped(buffer).mapAsync(GPUMapMode.READ);

  if (isBufferTyped(buffer)) {
    const data = buffer.typeInfo.read(
      new BufferReader(typedBufferUnwrapped(buffer).getMappedRange()),
    ) as Parsed<T>;
    buffer.unmap();
    return data;
  }

  const data = buffer.getMappedRange().slice(0);
  buffer.unmap();
  return data;
}

export function typedBufferUnwrapped<T extends AnyWgslData>(
  buffer: GPUBufferTyped<T>,
): GPUBuffer {
  if ('_internalBuffer' in buffer) {
    return buffer._internalBuffer as GPUBuffer;
  }
  throw new Error('Buffer is not a typed buffer');
}

export function isBufferTyped<T extends AnyWgslData>(
  buffer: GPUBuffer | GPUBufferTyped<T>,
): buffer is GPUBufferTyped<T> {
  return '_internalBuffer' in buffer;
}

export function bufferUnwrapped<T extends AnyWgslData>(
  buffer: GPUBuffer | GPUBufferTyped<T>,
): GPUBuffer {
  return isBufferTyped(buffer) ? typedBufferUnwrapped(buffer) : buffer;
}
