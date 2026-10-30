import type { TgpuBuffer } from './core/buffer/buffer.ts';
import type { TgpuSlot } from './core/slot/slotTypes.ts';
import type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout.ts';
import type { BaseData } from './data/wgslTypes.ts';
import { getName, hasTinyestMetadata } from './shared/meta.ts';
import { DEV, INCLUDE_SOURCE, TEST } from './shared/env.ts';
import type { TgpuBindGroupLayout } from './tgpuBindGroupLayout.ts';
import type * as tinyest from 'tinyest';
import { stringifyNode } from './shared/tseynit.ts';
import type { ErrorSource } from './types.ts';
import { $internal } from './shared/symbols.ts';
import type { TgpuFn } from 'typegpu';
import type { TgpuVertexFn } from 'typegpu';
import type { TgpuFragmentFn } from 'typegpu';
import type { TgpuComputeFn } from 'typegpu';
import type { ShelllessImpl } from './core/function/shelllessImpl.ts';
import type { AutoFragmentFn, AutoVertexFn } from './core/function/autoIO.ts';

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
  if (!DEV && !TEST) {
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

function getFnSource(item: unknown): ErrorSource | undefined {
  const typed = item as
    | TgpuFn
    | TgpuVertexFn
    | TgpuFragmentFn
    | TgpuComputeFn
    | ShelllessImpl
    | AutoVertexFn
    | AutoFragmentFn
    | undefined;
  return typed?.[$internal]?.fnCore?.source;
}

function stringifySource(source: ErrorSource): string {
  return `${source.file}:${source.location[0]}:${source.location[1]}`;
}

function constructMessage(cause: unknown, trace: unknown[], source?: ErrorSource) {
  const causeString =
    cause && typeof cause === 'object' && 'message' in cause ? cause.message : cause;

  const entries = trace.length > 20 ? [...trace.slice(0, 11), '...', ...trace.slice(-10)] : trace;
  const traceString = entries
    .map((ancestor, idx) => {
      const base = `- ${hasTinyestMetadata(ancestor) ? `fn*:${getName(ancestor)}` : ancestor}`;
      if (idx < trace.length - 1) {
        const maybeSource = getFnSource(ancestor);
        return `${base}${INCLUDE_SOURCE && maybeSource !== undefined ? ` (defined at ${stringifySource(maybeSource)})` : ''}`;
      } else {
        return `${base}${INCLUDE_SOURCE && source !== undefined ? ` (at ${stringifySource(source)}):\n` : ': '}`;
      }
    })
    .join('\n');

  return `Resolution of the following tree failed:\n${traceString}${causeString}`;
}

/**
 * An error that happens during resolution of WGSL code.
 * Contains a trace of all ancestor resolvables in
 * which this error originated.
 *
 * @category Errors
 */
export class ResolutionError extends Error {
  readonly cause: unknown;
  readonly trace: unknown[];
  readonly location: ErrorSource | undefined;

  constructor(cause: unknown, trace: unknown[], source?: ErrorSource) {
    super(constructMessage(cause, trace, source));

    this.cause = cause;
    this.trace = trace;
    this.location = source;

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResolutionError.prototype);
  }

  appendToTrace(ancestor: unknown): ResolutionError {
    const newTrace = [ancestor, ...this.trace];

    return new ResolutionError(this.cause, newTrace, this.location);
  }
}

/**
 * An error that happens during execution of TypeGPU functions.
 * Contains a trace of all TypeGPU functions called along the way.
 *
 * @category Errors
 */
export class ExecutionError extends Error {
  readonly cause: unknown;
  readonly trace: unknown[];

  constructor(cause: unknown, trace: unknown[]) {
    let entries = trace.map((ancestor) => `- ${ancestor}`);

    // Showing only the root and leaf nodes.
    if (entries.length > 20) {
      entries = [...entries.slice(0, 11), '...', ...entries.slice(-10)];
    }

    super(
      `Execution of the following tree failed:\n${entries.join('\n')}: ${
        cause && typeof cause === 'object' && 'message' in cause ? cause.message : cause
      }`,
    );

    this.cause = cause;
    this.trace = trace;

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ExecutionError.prototype);
  }

  appendToTrace(ancestor: unknown): ExecutionError {
    const newTrace = [ancestor, ...this.trace];

    return new ExecutionError(this.cause, newTrace);
  }
}

/**
 * @category Errors
 */
export class MissingSlotValueError extends Error {
  readonly slot: TgpuSlot<unknown>;

  constructor(slot: TgpuSlot<unknown>) {
    super(`Missing value for '${slot}'`);
    this.slot = slot;

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingSlotValueError.prototype);
  }
}

/**
 * @category Errors
 */
export class NotUniformError extends Error {
  constructor(value: TgpuBuffer<BaseData>) {
    super(
      `Buffer '${
        getName(value) ?? '<unnamed>'
      }' is not bindable as a uniform. Use .$usage('uniform') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotUniformError.prototype);
  }
}

export class MissingBindGroupsError extends Error {
  constructor(layouts: Iterable<TgpuBindGroupLayout>) {
    super(
      `Missing bind groups for layouts: '${[...layouts]
        .map((layout) => getName(layout) ?? '<unnamed>')
        .join(', ')}'. Please provide it using pipeline.with(bindGroup).(...)`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindGroupsError.prototype);
  }
}

export class MissingVertexBuffersError extends Error {
  constructor(layouts: Iterable<TgpuVertexLayout>) {
    super(
      `Missing vertex buffers for layouts: '${[...layouts]
        .map((layout) => getName(layout) ?? '<unnamed>')
        .join(', ')}'. Please provide it using pipeline.with(layout, buffer).(...)`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingVertexBuffersError.prototype);
  }
}

export class MissingImmediatesError extends Error {
  constructor(name: string | undefined) {
    super(
      `Missing value for immediate variable '${
        name ?? '<unnamed>'
      }'. Please provide it using pipeline.with(immediate, value), pass.setImmediates(immediate, value), or give the variable a default value`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingImmediatesError.prototype);
  }
}

export class IllegalVarAccessError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, IllegalVarAccessError.prototype);
  }
}

export class IllegalBufferAccessError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, IllegalBufferAccessError.prototype);
  }
}

export class WgslTypeError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, WgslTypeError.prototype);
  }
}

export class WgslForbiddenStatementError extends Error {
  constructor(node: tinyest.AnyNode) {
    super(
      `Expression statements like '${stringifyNode(node)};' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, WgslForbiddenStatementError.prototype);
  }
}

export class SignatureNotSupportedError extends Error {
  constructor(actual: BaseData[], candidates: BaseData[]) {
    super(
      `Unsupported data types: ${actual
        .map((a) => a.type)
        .join(', ')}. Supported types are: ${candidates.map((r) => r.type).join(', ')}.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, SignatureNotSupportedError.prototype);
  }
}

export class FiniteMathAssumptionError extends Error {
  constructor(value: number, type: BaseData) {
    super(
      `Cannot convert value '${value}' to type ${type.type} because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)`,
    );

    Object.setPrototypeOf(this, FiniteMathAssumptionError.prototype);
  }
}
