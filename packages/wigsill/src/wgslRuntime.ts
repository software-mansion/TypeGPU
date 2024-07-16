import type { WGSLMemoryTrait } from './types';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WGSLRuntime {
  private _entryToBufferMap = new WeakMap<WGSLMemoryTrait, GPUBuffer>();

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
