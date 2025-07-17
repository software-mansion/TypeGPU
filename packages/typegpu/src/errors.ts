import type { TgpuBuffer } from './core/buffer/buffer.ts';
import type { TgpuSlot } from './core/slot/slotTypes.ts';
import type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout.ts';
import type { AnyData, Disarray } from './data/dataTypes.ts';
import type { WgslArray } from './data/wgslTypes.ts';
import { getName } from './shared/meta.ts';
import { DEV } from './shared/env.ts';
import type { TgpuBindGroupLayout } from './tgpuBindGroupLayout.ts';
import { ErrorCode } from './errorCodes.ts';

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
  if (!DEV) {
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
    public readonly trace: unknown[],
  ) {
    let entries = trace.map((ancestor) => `- ${ancestor}`);

    // Showing only the root and leaf nodes.
    if (entries.length > 20) {
      entries = [...entries.slice(0, 11), '...', ...entries.slice(-10)];
    }

    super(
      `Resolution of the following tree failed: \n${entries.join('\n')}: ${
        cause && typeof cause === 'object' && 'message' in cause
          ? cause.message
          : cause
      }`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResolutionError.prototype);
  }

  appendToTrace(ancestor: unknown): ResolutionError {
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
      `Buffer '${
        getName(value) ?? '<unnamed>'
      }' is not bindable as a uniform. Use .$usage('uniform') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotUniformError.prototype);
  }
}

export class MissingLinksError extends Error {
  constructor(fnLabel: string | undefined, externalNames: string[]) {
    super(
      `The function '${
        fnLabel ?? '<unnamed>'
      }' is missing links to the following external values: ${externalNames}.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingLinksError.prototype);
  }
}

export class MissingBindGroupsError extends Error {
  constructor(layouts: Iterable<TgpuBindGroupLayout>) {
    super(
      `Missing bind groups for layouts: '${
        [...layouts].map((layout) => getName(layout) ?? '<unnamed>').join(', ')
      }'. Please provide it using pipeline.with(layout, bindGroup).(...)`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindGroupsError.prototype);
  }
}

export class MissingVertexBuffersError extends Error {
  constructor(layouts: Iterable<TgpuVertexLayout<WgslArray | Disarray>>) {
    super(
      `Missing vertex buffers for layouts: '${
        [...layouts].map((layout) => getName(layout) ?? '<unnamed>').join(', ')
      }'. Please provide it using pipeline.with(layout, buffer).(...)`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingVertexBuffersError.prototype);
  }
}

export class ErrorWithCode extends Error {
  constructor(msg: string, code: ErrorCode) {
    // TODO: Add stable doc links
    super(`${msg} (https://docs.swmansion.com/TypeGPU/err?q=${code})`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ErrorWithCode.prototype);
  }
}

export class IllegalBufferAccessError extends ErrorWithCode {
  constructor(msg: string) {
    super(msg, ErrorCode.illegalBufferAccess);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, IllegalBufferAccessError.prototype);
  }
}
