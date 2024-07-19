import type { WgslSlot } from './types';

export class MissingSlotValueError extends Error {
  constructor(public readonly slot: WgslSlot<unknown>) {
    super(`Missing value for '${slot}'`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingSlotValueError.prototype);
  }
}

export class RecursiveDataTypeError extends Error {
  constructor() {
    super('Recursive types are not supported in WGSL');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, RecursiveDataTypeError.prototype);
  }
}
