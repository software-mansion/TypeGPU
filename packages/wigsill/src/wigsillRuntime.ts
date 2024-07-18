import type { WgslAllocatable } from './types';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WigsillRuntime {
  private _entryToBufferMap = new WeakMap<WgslAllocatable, GPUBuffer>();
  private _readBuffer: GPUBuffer | null = null;
  private _taskQueue = new TaskQueue();

  constructor(public readonly device: GPUDevice) {}

  dispose() {
    // TODO: Clean up all buffers
  }

  bufferFor(memory: WgslAllocatable) {
    let buffer = this._entryToBufferMap.get(memory);

    if (!buffer) {
      console.log('Creating buffer for', memory);
      buffer = this.device.createBuffer({
        usage: memory.flags,
        size: memory.dataType.size,
      });

      if (!buffer) {
        throw new Error(`Failed to create buffer for ${memory}`);
      }
      this._entryToBufferMap.set(memory, buffer);
    }

    return buffer;
  }

  async valueFor(memory: WgslAllocatable): Promise<ArrayBuffer | null> {
    return this._taskQueue.enqueue(async () => {
      if (!this._readBuffer) {
        this._readBuffer = this.device.createBuffer({
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          size: memory.dataType.size,
        });
      }

      if (this._readBuffer.size < memory.dataType.size) {
        this._readBuffer = this.device.createBuffer({
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          size: memory.dataType.size,
        });
      }

      const buffer = this.bufferFor(memory);
      const commandEncoder = this.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        buffer,
        0,
        this._readBuffer,
        0,
        memory.dataType.size,
      );
      this.device.queue.submit([commandEncoder.finish()]);
      await this.device.queue.onSubmittedWorkDone();
      await this._readBuffer.mapAsync(GPUMapMode.READ, 0, memory.dataType.size);
      const value = this._readBuffer.getMappedRange().slice(0);
      this._readBuffer.unmap();
      return value;
    });
  }
}

class TaskQueue<T> {
  private _queue: (() => Promise<void>)[] = [];
  private _pending = false;

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this._queue.push(async () => {
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        }
      });
      this._processQueue();
    });
  }

  private async _processQueue() {
    if (this._pending) {
      return;
    }
    this._pending = true;
    while (this._queue.length > 0) {
      const task = this._queue.shift();
      if (task) {
        await task();
      }
    }
    this._pending = false;
  }
}

export async function createRuntime(
  options?:
    | {
        adapter: GPURequestAdapterOptions | undefined;
        device: GPUDeviceDescriptor | undefined;
      }
    | GPUDevice,
) {
  let adapter: GPUAdapter | null = null;
  let device: GPUDevice | null = null;

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  if (!options) {
    adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Could not find a compatible GPU');
    }
    device = await adapter.requestDevice();
    return new WigsillRuntime(device);
  }

  if (options instanceof GPUDevice) {
    return new WigsillRuntime(options);
  }

  adapter = await navigator.gpu.requestAdapter(options.adapter);
  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }
  device = await adapter.requestDevice(options.device);
  return new WigsillRuntime(device);
}

export default WigsillRuntime;
