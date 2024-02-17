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

export default WGSLRuntime;
