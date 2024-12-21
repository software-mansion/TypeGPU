import type { TgpuBuffer } from './core/buffer/buffer';
import type { TgpuDerived, TgpuSlot } from './core/slot/slotTypes';
import type { AnyData } from './data/dataTypes';
import type { AnyWgslData } from './data/wgslTypes';
import type { TgpuResolvable } from './types';

const prefix = 'Invariant failed';

/**
 * Inspired by: https://github.com/alexreardon/tiny-invariant/blob/master/src/tiny-invariant.ts
 */
export function invariant(
  condition: unknown,
  message?: string | (() => string),
): asserts condition {
  if (condition) {
    // Condition passed
    return;
  }

  // In production we strip the message but still throw
  if (process.env.NODE_ENV === 'production') {
    throw new Error(prefix);
  }

  // When not in production we allow the message to pass through
  // *This block will be removed in production builds*

  const provided = typeof message === 'function' ? message() : message;

  // Options:
  // 1. message provided: `${prefix}: ${provided}`
  // 2. message not provided: prefix
  const value = provided ? `${prefix}: ${provided}` : prefix;
  throw new Error(value);
}

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
    public readonly trace: (
      | TgpuResolvable
      | TgpuSlot<unknown>
      | TgpuDerived<unknown>
      | AnyWgslData
    )[],
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

  appendToTrace(
    ancestor:
      | TgpuResolvable
      | TgpuSlot<unknown>
      | TgpuDerived<unknown>
      | AnyWgslData,
  ): ResolutionError {
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
export class NotUniformError extends Error {
  constructor(value: TgpuBuffer<AnyData>) {
    super(
      `Buffer '${value.label ?? '<unnamed>'}' is not bindable as a uniform. Use .$usage('uniform') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotUniformError.prototype);
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

export class MissingBindGroupError extends Error {
  constructor(layoutLabel: string | undefined) {
    super(
      `Bind group was not provided for '${layoutLabel ?? '<unnamed>'}' layout.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindGroupError.prototype);
  }
}
