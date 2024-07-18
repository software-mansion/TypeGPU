import type { WgslAllocatable, WgslSlot } from './types';

export class MissingBindingError extends Error {
  constructor(public readonly bindable: WgslSlot<unknown>) {
    super(`Missing binding for ${bindable.debugLabel ?? '<unnamed>'}`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindingError.prototype);
  }
}

/**
 * @deprecated To be removed along with memory arenas.
 */
export class MemoryArenaConflictError extends Error {
  constructor(memoryEntry: WgslAllocatable) {
    super(
      `Multiple arenas contain the same entry: ${memoryEntry.debugLabel ?? '<unnamed>'}`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MemoryArenaConflictError.prototype);
  }
}

/**
 * @deprecated To be removed along with memory arenas.
 */
export class NotAllocatedMemoryError extends Error {
  constructor(memoryEntry: WgslAllocatable) {
    super(
      `An unallocated memory entry was used: ${memoryEntry.debugLabel ?? '<unnamed>'}. Every memory entry has to be in exactly one arena used during program building.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotAllocatedMemoryError.prototype);
  }
}

export class RecursiveDataTypeError extends Error {
  constructor() {
    super('Recursive types are not supported in WGSL');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, RecursiveDataTypeError.prototype);
  }
}
