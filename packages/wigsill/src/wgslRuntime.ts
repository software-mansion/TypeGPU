import type { WGSLMemoryTrait } from './types';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WGSLRuntime {
  private _entryToBufferMap = new WeakMap<WGSLMemoryTrait, GPUBuffer>();
  private _readBuffer: GPUBuffer | null = null;

  constructor(public readonly device: GPUDevice) {}

  dispose() {
    // TODO: Clean up all buffers
  }

  bufferFor(memory: WGSLMemoryTrait) {
    let buffer = this._entryToBufferMap.get(memory);

    if (!buffer) {
      // creating buffer
      console.log('creating buffer for', memory);
      buffer = this.device.createBuffer({
        usage: memory.flags,
        size: memory.size,
      });

      if (!buffer) {
        throw new Error(`Failed to create buffer for ${memory}`);
      }
      this._entryToBufferMap.set(memory, buffer);
    }

    return buffer;
  }

  async valueFor(memory: WGSLMemoryTrait): Promise<ArrayBuffer | null> {
    if (!this._readBuffer) {
      this._readBuffer = this.device.createBuffer({
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        size: memory.size,
      });
    }

    if (this._readBuffer.size < memory.size) {
      this._readBuffer = this.device.createBuffer({
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        size: memory.size,
      });
    }

    const buffer = this.bufferFor(memory);
    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      buffer,
      0,
      this._readBuffer,
      0,
      memory.size,
    );
    this.device.queue.submit([commandEncoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();
    await this._readBuffer.mapAsync(GPUMapMode.READ, 0, memory.size);
    const value = this._readBuffer.getMappedRange().slice(0);
    this._readBuffer.unmap();
    return value;
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
    return new WGSLRuntime(device);
  }

  if (options instanceof GPUDevice) {
    return new WGSLRuntime(options);
  }

  adapter = await navigator.gpu.requestAdapter(options.adapter);
  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }
  device = await adapter.requestDevice(options.device);
  return new WGSLRuntime(device);
}

export default WGSLRuntime;
