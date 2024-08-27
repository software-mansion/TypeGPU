import { BufferWriter, type Parsed } from 'typed-binary';
import { roundUp } from './mathUtils';
import { TaskQueue } from './taskQueue';
import {
  bufferUnwrapped,
  getBufferMappable,
  isBufferTyped,
  readMappableBuffer,
} from './typedDeviceUtils';
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
      descriptor: Omit<GPUBufferDescriptor, 'size'> & { type: T },
      init?: Parsed<T>,
    ): GPUBufferTyped<T>;

    createBuffer(descriptor: GPUBufferDescriptor, init?: never): GPUBuffer;

    readBuffer<T extends AnyWgslData>(
      buffer: GPUBufferTyped<T>,
    ): Promise<Parsed<T>>;

    readBuffer(buffer: GPUBuffer): Promise<ArrayBuffer>;
  }

  interface GPUBufferTyped<T extends AnyWgslData> extends GPUBuffer {
    readonly typeInfo: T;
  }

  interface GPUQueueTyped extends GPUQueue {
    writeBuffer<T extends AnyWgslData>(
      buffer: GPUBufferTyped<T>,
      data: Parsed<T>,
    ): undefined;

    writeBuffer(
      buffer: GPUBuffer,
      bufferOffset: GPUSize64,
      data: BufferSource | SharedArrayBuffer,
      dataOffset?: GPUSize64,
      size?: GPUSize64,
    ): undefined;
  }
}

function typedQueue(queue: GPUQueue): GPUQueueTyped {
  const queueProxy: ProxyHandler<GPUQueueTyped> = {
    get(target, prop) {
      const baseValue = Reflect.get(target, prop);

      if (prop === 'writeBuffer') {
        return <T extends AnyWgslData>(
          buffer: GPUBufferTyped<AnyWgslData> | GPUBuffer,
          dataOrOffset: Parsed<T> | GPUSize64,
          maybeData: BufferSource | SharedArrayBuffer | undefined,
          dataOffset?: GPUSize64 | undefined,
          size?: GPUSize64 | undefined,
        ) => {
          if (maybeData !== undefined) {
            queue.writeBuffer(
              buffer,
              dataOrOffset as number,
              maybeData,
              dataOffset,
              size,
            );
            return;
          }

          const typedBuffer = buffer as GPUBufferTyped<AnyWgslData>;
          if (typedBuffer.mapState === 'mapped') {
            const writer = new BufferWriter(buffer.getMappedRange());
            typedBuffer.typeInfo.write(writer, dataOrOffset);
            typedBuffer.unmap();
            return;
          }
          const typeSize = roundUp(
            typedBuffer.typeInfo.size,
            typedBuffer.typeInfo.byteAlignment,
          );
          const arrayBuffer = new ArrayBuffer(typeSize);
          typedBuffer.typeInfo.write(
            new BufferWriter(arrayBuffer),
            dataOrOffset,
          );
          queue.writeBuffer(bufferUnwrapped(buffer), 0, arrayBuffer);
        };
      }

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

export function typedBuffer<T extends AnyWgslData>(
  buffer: GPUBuffer,
  type: T,
): GPUBufferTyped<T> {
  const bufferProxy: ProxyHandler<GPUBufferTyped<T>> = {
    get(target, prop) {
      if (prop === '_internalBuffer') {
        return buffer;
      }

      const baseValue = Reflect.get(target, prop);

      if (prop === 'typeInfo') {
        return type;
      }

      if (typeof baseValue === 'function') {
        return (...args: unknown[]) => {
          return baseValue.apply(buffer, args);
        };
      }

      return baseValue;
    },
  };

  const proxy = new Proxy<GPUBuffer, GPUBufferTyped<T>>(buffer, bufferProxy);
  Object.defineProperty(proxy, '_internalBuffer', {
    value: buffer,
  });
  return proxy;
}

export function typedDevice(device: GPUDevice): GPUDeviceTyped {
  const taskQueue = new TaskQueue();

  const deviceProxy: ProxyHandler<GPUDeviceTyped> = {
    get(target, prop) {
      if (prop === 'queue') {
        if ('typedQueue' in target) {
          return target.typedQueue;
        }
        const queue = target.queue;
        const typedQueueInstance = typedQueue(queue);
        Object.defineProperty(target, 'typedQueue', {
          value: typedQueueInstance,
        });
        return typedQueueInstance;
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
              size: descriptor.type.size,
              usage: descriptor.usage,
              mappedAtCreation: descriptor.mappedAtCreation ?? false,
            }) as GPUBufferTyped<T>;
            const bufferProxy = typedBuffer(buffer, descriptor.type);
            if (init) {
              typed.queue.writeBuffer(bufferProxy, init);
            }
            return bufferProxy;
          }
          const buffer = device.createBuffer(descriptor);
          return buffer;
        };
      }

      if (prop === 'readBuffer') {
        return async <T extends AnyWgslData>(
          buffer: GPUBufferTyped<T> | GPUBuffer,
        ) => {
          const _readBuffer = async (buffer: GPUBufferTyped<T> | GPUBuffer) => {
            if (isBufferTyped(buffer)) {
              if (buffer.usage & GPUBufferUsage.MAP_READ) {
                return readMappableBuffer(buffer);
              }
              const mappable = getBufferMappable(device, buffer);
              const value = (await readMappableBuffer(mappable)) as Parsed<T>;
              mappable.destroy();
              return value;
            }

            if (buffer.usage & GPUBufferUsage.MAP_READ) {
              return readMappableBuffer(buffer);
            }

            const mappable = getBufferMappable(device, buffer);
            const value = await readMappableBuffer(mappable);
            mappable.destroy();
            return value;
          };

          return taskQueue.enqueue(async () => {
            return _readBuffer(buffer);
          });
        };
      }

      if (prop === 'createBindGroup') {
        return <T extends AnyWgslData>(descriptor: GPUBindGroupDescriptor) => {
          for (const entry of descriptor.entries) {
            if ('buffer' in entry.resource) {
              const buffer = entry.resource.buffer as GPUBufferTyped<T>;
              entry.resource.buffer = bufferUnwrapped(buffer);
            }
          }
          return device.createBindGroup(descriptor);
        };
      }

      const baseValue = Reflect.get(target, prop);
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
