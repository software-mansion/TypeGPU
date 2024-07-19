import type { WgslSlot } from './types';

export class MissingBindingError extends Error {
  constructor(public readonly slot: WgslSlot<unknown>) {
    super(`Missing binding for '${slot.label ?? '<unnamed>'}'`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindingError.prototype);
  }
}

export class RecursiveDataTypeError extends Error {
  constructor() {
    super('Recursive types are not supported in WGSL');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, RecursiveDataTypeError.prototype);
  }
}
