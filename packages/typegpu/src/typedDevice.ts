import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './types';

declare global {
  interface ProxyConstructor {
    new <TSource extends object, TTarget extends TSource>(
      target: TSource,
      handler: ProxyHandler<TTarget>,
    ): TTarget;
  }
  interface GPUDeviceTyped extends Omit<GPUDevice, 'createBuffer'> {
    readonly queue: GPUQueueTyped;
    createBuffer<T extends AnyWgslData>(
      descriptor:
        | GPUBufferDescriptor
        | (Omit<GPUBufferDescriptor, 'size'> & { type: T }),
      init?: Parsed<T>,
    ): GPUBufferTyped<T>;
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

function typedQueue(queue: GPUQueue): GPUQueueTyped {
  const queueProxy: ProxyHandler<GPUQueueTyped> = {
    get(target, prop, receiver) {
      if (prop === 'writeBufferTyped') {
        return (
          buffer: GPUBufferTyped<AnyWgslData>,
          data: Parsed<AnyWgslData>,
        ) => {
          if (buffer.mapState === 'mapped') {
            const writer = new BufferWriter(buffer.getMappedRange());
            buffer.typeInfo.write(writer, data);
            buffer.unmap();
            return;
          }
          const size = roundUp(
            buffer.typeInfo.size,
            buffer.typeInfo.byteAlignment,
          );
          const arrayBuffer = new ArrayBuffer(size);
          buffer.typeInfo.write(new BufferWriter(arrayBuffer), data);
          queue.writeBuffer(buffer, 0, arrayBuffer);
        };
      }

      const baseValue = Reflect.get(target, prop, receiver);

      if (typeof baseValue === 'function') {
        return (...args: unknown[]) => {
          return baseValue.apply(queue, args);
        };
      }

      return baseValue;
    },
  };
  return new Proxy<GPUQueue, GPUQueueTyped>(queue, queueProxy);
}

export function typedDevice(device: GPUDevice): GPUDeviceTyped {
  const deviceProxy: ProxyHandler<GPUDeviceTyped> = {
    get(target, prop, receiver) {
      if (prop === 'queue') {
        return typedQueue(device.queue);
      }
      if (prop === 'createBuffer') {
        return <T extends AnyWgslData>(
          descriptor:
            | GPUBufferDescriptor
            | (Omit<GPUBufferDescriptor, 'size'> & { type: T }),
          init?: Parsed<T>,
        ) => {
          if ('type' in descriptor) {
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
          }
          const buffer = device.createBuffer(
            descriptor,
          ) as GPUBufferTyped<AnyWgslData>;
          Object.defineProperty(buffer, 'typeInfo', {
            value: null,
          });
          return buffer;
        };
      }
      if (prop === 'readBufferAsync') {
        return async <T extends AnyWgslData>(buffer: GPUBufferTyped<T>) => {
          const size = roundUp(
            buffer.typeInfo.size,
            buffer.typeInfo.byteAlignment,
          );
          if (buffer.usage & GPUBufferUsage.MAP_READ) {
            await buffer.mapAsync(GPUMapMode.READ);
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
      }

      const baseValue = Reflect.get(target, prop, receiver);
      if (typeof baseValue === 'function') {
        return (...args: unknown[]) => {
          return baseValue.apply(device, args);
        };
      }

      return baseValue;
    },
  };

  const typed = new Proxy<GPUDevice, GPUDeviceTyped>(device, deviceProxy);
  return typed;
}

const roundUp = (value: number, modulo: number) => {
  const bitMask = modulo - 1;
  const invBitMask = ~bitMask;
  return (value & bitMask) === 0 ? value : (value & invBitMask) + modulo;
};
