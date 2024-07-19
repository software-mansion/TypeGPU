import type { WgslBindable } from './types';

export class MissingBindingError extends Error {
  constructor(public readonly bindable: WgslBindable<unknown>) {
    super(`Missing binding for ${bindable.debugLabel ?? '<unnamed>'}`);

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
