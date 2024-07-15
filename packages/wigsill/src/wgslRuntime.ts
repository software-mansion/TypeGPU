import { MemoryArena } from './memoryArena';
import type { MemoryLocation, WGSLMemoryTrait } from './types';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WGSLRuntime {
  private _arenaToBufferMap = new WeakMap<MemoryArena, GPUBuffer>();
  private _entryToArenaMap = new WeakMap<WGSLMemoryTrait, MemoryArena>();

  constructor(public readonly device: GPUDevice) {}

  dispose() {
    // TODO: Clean up all buffers
  }

  registerArena(arena: MemoryArena) {
    for (const entry of arena.memoryEntries) {
      this._entryToArenaMap.set(entry, arena);
    }
  }

  bufferFor(arena: MemoryArena) {
    let buffer = this._arenaToBufferMap.get(arena);

    if (!buffer) {
      // creating buffer
      buffer = this.device.createBuffer({
        usage: arena.usage,
        size: arena.size,
      });

      this._arenaToBufferMap.set(arena, buffer);
    }

    return buffer;
  }

  locateMemory(memoryEntry: WGSLMemoryTrait): MemoryLocation | null {
    const arena = this._entryToArenaMap.get(memoryEntry);

    if (!arena) {
      return null;
    }

    const gpuBuffer = this._arenaToBufferMap.get(arena);
    const offset = arena.offsetFor(memoryEntry);

    if (!gpuBuffer || offset === null) {
      throw new Error(`Invalid state`);
    }

    return { gpuBuffer, offset };
  }
}

export async function createRuntime(
  options?:
    | {
        adapter: GPURequestAdapterOptions | undefined;
        device: GPUDeviceDescriptor | undefined;
      }
    | GPUAdapter
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

  if (options instanceof GPUAdapter) {
    adapter = options;
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
