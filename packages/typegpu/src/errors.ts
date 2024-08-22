import type { WgslResolvable, WgslSlot } from './types';

/**
 * An error that happens during resolution of WGSL code.
 * Contains a trace of all ancestor resolvables in
 * which this error originated.
 *
 * @category Errors
 */
export class ResolutionError extends Error {
  constructor(
    public readonly cause: unknown,
    public readonly trace: WgslResolvable[],
  ) {
    let entries = trace.map((ancestor) => `- ${ancestor.debugRepr}`);

    // Showing only the root and leaf nodes.
    if (entries.length > 20) {
      entries = [...entries.slice(0, 11), '...', ...entries.slice(-10)];
    }

    super(`Resolution of the following tree failed: \n${entries.join('\n')}`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResolutionError.prototype);
  }

  appendToTrace(ancestor: WgslResolvable): ResolutionError {
    const newTrace = [ancestor, ...this.trace];

    return new ResolutionError(this.cause, newTrace);
  }
}

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
  constructor(public readonly item: { debugRepr: string }) {
    super(
      `Use wgsl\`...\` when interpolating wgsl item: ${item.debugRepr}. For console logging use the debugRepr property`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResolvableToStringError.prototype);
  }
}
