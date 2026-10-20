import { expect, vi } from 'vitest';
import type * as TypeGpu from 'typegpu';
import type { d } from 'typegpu';

type TypeGpuModule = typeof TypeGpu;

// Captured once, so that restoring can never put back a proxy installed by another call.
const RealFunction = globalThis.Function;

const TYPEGPU_GLOBAL_PREFIX = '__TYPEGPU_';

function snapshotTypegpuGlobals(): Map<string, unknown> {
  const saved = new Map<string, unknown>();
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (key.startsWith(TYPEGPU_GLOBAL_PREFIX)) {
      saved.set(key, (globalThis as Record<string, unknown>)[key]);
    }
  }
  return saved;
}

function restoreTypegpuGlobals(saved: Map<string, unknown>): void {
  const globals = globalThis as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (key.startsWith(TYPEGPU_GLOBAL_PREFIX) && !saved.has(key)) {
      delete globals[key];
    }
  }
  for (const [key, value] of saved) {
    globals[key] = value;
  }
}

/**
 * Replaces the global `Function` constructor with a proxy that counts constructions
 * and (optionally) throws, like an environment with a CSP that disallows eval.
 */
function interceptFunctionConstructor(block: boolean): {
  count: () => number;
  restore: () => void;
} {
  let count = 0;
  globalThis.Function = new Proxy(RealFunction, {
    construct(target, args, newTarget) {
      count++;
      if (block) {
        throw new EvalError('Code generation from strings disallowed (simulated)');
      }
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) {
      count++;
      if (block) {
        throw new EvalError('Code generation from strings disallowed (simulated)');
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
  return {
    count: () => count,
    restore: () => {
      globalThis.Function = RealFunction;
    },
  };
}

export type BothWritersCase<T extends d.AnyData> = {
  schema: T;
  value: d.InferInput<T>;
  /** Size of the buffer to write into. Defaults to `sizeOf(schema)`. */
  byteLength?: number;
};

export type BothWritersResult<T extends d.AnyData> = {
  /** The encoded bytes, identical for the compiled and the fallback writer. */
  bytes: ArrayBuffer;
  /** The value that was encoded. */
  value: d.InferInput<T>;
  /** The bytes read back with `readFromArrayBuffer`, by the same TypeGPU instance that created `value`. */
  decoded: d.Infer<T>;
  /**
   * The TypeGPU instance that created `value` and `decoded`. Use it to create expected values,
   * since objects from the statically imported `typegpu` are of different types.
   */
  typegpu: TypeGpuModule;
};

// The logger prints `console.warn('⚠️ [<type>] ', ...)`
const isFallbackWarning = (args: unknown[]) => String(args[0]).includes('[fallback]');

/**
 * Collects `[fallback]` warnings instead of printing them. Other warnings are passed to
 * whatever `console.warn` was before (possibly a spy of the calling test), and `restore`
 * puts that exact function back.
 */
function captureFallbackWarnings(): { warnings: unknown[][]; restore: () => void } {
  const previous = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    if (isFallbackWarning(args)) {
      warnings.push(args);
    } else {
      previous.apply(console, args);
    }
  };
  return {
    warnings,
    restore: () => {
      console.warn = previous;
    },
  };
}

async function encodeWithOnePath<T extends d.AnyData>(
  build: (typegpu: TypeGpuModule) => BothWritersCase<T>,
  path: 'compiled' | 'fallback',
): Promise<BothWritersResult<T>> {
  const savedGlobals = snapshotTypegpuGlobals();
  const fallbackWarningsCapture = captureFallbackWarnings();

  try {
    // A fresh TypeGPU instance. `EVAL_ALLOWED_IN_ENV` is decided when the instance is
    // loaded, so the fallback instance is loaded while `new Function` is blocked.
    // Removing the version marker lets the instance load without the "duplicate TypeGPU
    // version" warning, which is expected here; `savedGlobals` is restored in `finally`.
    delete (globalThis as Record<string, unknown>).__TYPEGPU_VERSION__;
    vi.resetModules();
    const loadGuard = interceptFunctionConstructor(path === 'fallback');
    let typegpu: TypeGpuModule;
    try {
      typegpu = await import('typegpu');
    } finally {
      loadGuard.restore();
    }
    const blockedAtLoad = loadGuard.count();

    // The schema and the value must come from the same instance as the writer.
    const { schema, value, byteLength } = build(typegpu);
    const bytes = new ArrayBuffer(byteLength ?? typegpu.d.sizeOf(schema));

    const writeGuard = interceptFunctionConstructor(false);
    try {
      typegpu.writeToArrayBuffer(bytes, schema, value);
    } finally {
      writeGuard.restore();
    }
    const functionCallsDuringWrite = writeGuard.count();
    const fallbackWarnings = fallbackWarningsCapture.warnings.length;

    if (path === 'compiled') {
      // The writer is generated with `new Function` and no warning says it was abandoned.
      expect(functionCallsDuringWrite, 'compiled writer was not generated').toBeGreaterThan(0);
      expect(fallbackWarnings, 'compiled writer reported a fallback').toBe(0);
    } else {
      expect(blockedAtLoad, 'eval was never probed while blocked').toBeGreaterThan(0);
      expect(functionCallsDuringWrite, 'fallback run generated code').toBe(0);
      expect(fallbackWarnings, 'fallback run did not report the fallback').toBe(1);
    }

    const decoded = typegpu.readFromArrayBuffer(bytes, schema) as d.Infer<T>;
    return { bytes, value, decoded, typegpu };
  } finally {
    fallbackWarningsCapture.restore();
    restoreTypegpuGlobals(savedGlobals);
  }
}

// Tail of the chain of calls, see `writeWithBothWriters`.
let queue: Promise<void> = Promise.resolve();

/**
 * Encodes a value with `writeToArrayBuffer` twice, with the compiled writer and with the
 * fallback writer (used when eval is not allowed), fails if they produce different bytes,
 * and returns the result of one of them.
 *
 * Each path runs against its own freshly loaded TypeGPU instance, and the schema and value
 * can only be created inside `build`, from the instance passed to it. Objects created with
 * the statically imported `typegpu` do not work with the fresh instances. `build` is called once
 * per path, so it should not have side effects.
 *
 * Only for values that are written by the schema (not raw `ArrayBuffer` / typed array input,
 * which bypass the writers). Reading has no compiled implementation, so `decoded` is
 * the same for both paths.
 *
 * @example
 * const { bytes } = await writeWithBothWriters(({ d }) => ({
 *   schema: d.arrayOf(d.u32, 2),
 *   value: [1, 2],
 * }));
 * expect([...new Uint32Array(bytes)]).toStrictEqual([1, 2]);
 */
export function writeWithBothWriters<T extends d.AnyData>(
  build: (typegpu: TypeGpuModule) => BothWritersCase<T>,
): Promise<BothWritersResult<T>> {
  // The module registry and the globals are shared state, so calls never overlap.
  const result = queue.then(async () => {
    const compiled = await encodeWithOnePath(build, 'compiled');
    const fallback = await encodeWithOnePath(build, 'fallback');

    expect(
      new Uint8Array(fallback.bytes),
      'fallback bytes differ from compiled bytes',
    ).toStrictEqual(new Uint8Array(compiled.bytes));
    return compiled;
  });
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
