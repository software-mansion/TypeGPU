import type { TgpuBuffer } from './core/buffer/buffer';
import type { AnyTgpuData, TgpuResolvable, TgpuSlot } from './types';

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
    public readonly trace: TgpuResolvable[],
  ) {
    let entries = trace.map((ancestor) => `- ${ancestor}`);

    // Showing only the root and leaf nodes.
    if (entries.length > 20) {
      entries = [...entries.slice(0, 11), '...', ...entries.slice(-10)];
    }

    super(`Resolution of the following tree failed: \n${entries.join('\n')}`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResolutionError.prototype);
  }

  appendToTrace(ancestor: TgpuResolvable): ResolutionError {
    const newTrace = [ancestor, ...this.trace];

    return new ResolutionError(this.cause, newTrace);
  }
}

/**
 * @category Errors
 */
export class MissingSlotValueError extends Error {
  constructor(public readonly slot: TgpuSlot<unknown>) {
    super(`Missing value for '${slot}'`);

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

/**
 * @category Errors
 */
export class NotUniformError extends Error {
  constructor(value: TgpuBuffer<AnyTgpuData>) {
    super(
      `Buffer '${value.label ?? '<unnamed>'}' is not bindable as a uniform. Use .$usage(tgu.Uniform) to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotUniformError.prototype);
  }
}

/**
 * @category Errors
 */
export class NotStorageError extends Error {
  constructor(value: TgpuBuffer<AnyTgpuData>) {
    super(
      `Buffer '${value.label ?? '<unnamed>'}' is not bindable as storage. Use .$usage(tgu.Storage) to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotStorageError.prototype);
  }
}

export class MissingLinksError extends Error {
  constructor(fnLabel: string | undefined, externalNames: string[]) {
    super(
      `The function '${fnLabel ?? '<unnamed>'}' is missing links to the following external values: ${externalNames}.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingLinksError.prototype);
  }
}
