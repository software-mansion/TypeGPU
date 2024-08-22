import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './types';

declare global {
  interface GPUDeviceTyped extends GPUDevice {
    readonly queue: GPUQueueTyped;
    createBufferTyped: <T extends AnyWgslData>(
      descriptor: Omit<GPUBufferDescriptor, 'size'> & { type: T },
      init?: Parsed<T>,
    ) => GPUBufferTyped<T>;
    readBufferAsync: <T extends AnyWgslData>(
      buffer: GPUBufferTyped<T>,
    ) => Promise<Parsed<T>>;
  }
  interface GPUBufferTyped<T extends AnyWgslData> extends GPUBuffer {
    readonly typeInfo: T;
  }
  interface GPUQueueTyped extends GPUQueue {
    writeBufferTyped: <T extends AnyWgslData>(
      buffer: GPUBufferTyped<T>,
      data: Parsed<T>,
    ) => void;
  }
}

export function typedDevice(device: GPUDevice): GPUDeviceTyped {
  const typed = device as GPUDeviceTyped;
  Object.defineProperty(typed, 'queue', {
    value: device.queue as GPUQueueTyped,
  });

  typed.queue.writeBufferTyped = (buffer, data) => {
    console.log(buffer);
    if (buffer.mapState === 'mapped') {
      const writer = new BufferWriter(buffer.getMappedRange());
      buffer.typeInfo.write(writer, data);
      buffer.unmap();
      return;
    }
    const size = roundUp(buffer.typeInfo.size, buffer.typeInfo.byteAlignment);
    const arrayBuffer = new ArrayBuffer(size);
    buffer.typeInfo.write(new BufferWriter(arrayBuffer), data);
    device.queue.writeBuffer(buffer, 0, arrayBuffer);
  };

  typed.readBufferAsync = async (buffer) => {
    const size = roundUp(buffer.typeInfo.size, buffer.typeInfo.byteAlignment);
    if (buffer.usage & GPUBufferUsage.MAP_READ) {
      const arrayBuffer = await buffer.mapAsync(GPUMapMode.READ);
      const data = buffer.typeInfo.read(
        new BufferReader(buffer.getMappedRange()),
      ) as Parsed<typeof buffer.typeInfo>;
      buffer.unmap();
      return data;
    }

    const stagingBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, size);
    device.queue.submit([commandEncoder.finish()]);
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const data = buffer.typeInfo.read(
      new BufferReader(stagingBuffer.getMappedRange()),
    ) as Parsed<typeof buffer.typeInfo>;
    stagingBuffer.unmap();
    stagingBuffer.destroy();
    return data;
  };
  typed.createBufferTyped = (descriptor, init) => {
    const buffer = device.createBuffer({
      size: descriptor.type.byteAlignment,
      usage: descriptor.usage,
      mappedAtCreation: descriptor.mappedAtCreation ?? false,
    }) as GPUBufferTyped<typeof descriptor.type>;
    Object.defineProperty(buffer, 'typeInfo', {
      value: descriptor.type,
    });
    if (init) {
      typed.queue.writeBufferTyped(buffer, init);
    }
    return buffer;
  };

  return typed;
}

const roundUp = (value: number, modulo: number) => {
  const bitMask = modulo - 1;
  const invBitMask = ~bitMask;
  return (value & bitMask) === 0 ? value : (value & invBitMask) + modulo;
};
