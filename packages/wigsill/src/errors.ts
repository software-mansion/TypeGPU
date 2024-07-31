import type { WgslResolvable, WgslSlot } from './types';

/**
 * @category Errors
 */
export class MissingSlotValueError extends Error {
  constructor(public readonly slot: WgslSlot<unknown>) {
    super(`Missing value for ${slot.label}`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingSlotValueError.prototype);
  }
}

/**
 * @category Errors
 */
export class RecursiveDataTypeError extends Error {
  constructor() {
    super('Recursive types are not supported in WGSL');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, RecursiveDataTypeError.prototype);
  }
}

export class ResolvableToStringError extends Error {
  constructor(public readonly item: WgslResolvable) {
    super(
      `Use wgsl\`...\` when interpolating wgsl item: ${item.debugRepr}. For console logging use the debugRepr property`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResolvableToStringError.prototype);
  }
}
