import type { TgpuRoot } from 'typegpu';
import { define } from './define.ts';
import { instantiateScan } from './instantiate.ts';
import type { ScanElementType } from './schemas.ts';
import type { BinaryOp, PrefixScanDefinition, ScanBuffer } from './types.ts';

const definitionCache = new WeakMap<
  TgpuRoot,
  WeakMap<BinaryOp['operation'], Map<string, PrefixScanDefinition>>
>();

function cachedDefinition<TElement extends ScanElementType>(
  root: TgpuRoot,
  elementType: TElement,
  binaryOp: BinaryOp,
  reduceOnly: boolean,
): PrefixScanDefinition<TElement> {
  let byOperation = definitionCache.get(root);
  if (!byOperation) {
    byOperation = new WeakMap();
    definitionCache.set(root, byOperation);
  }
  let byVariant = byOperation.get(binaryOp.operation);
  if (!byVariant) {
    byVariant = new Map();
    byOperation.set(binaryOp.operation, byVariant);
  }
  const key = `${elementType.type}_${binaryOp.identityElement}_${reduceOnly}`;
  let definition = byVariant.get(key);
  if (!definition) {
    definition = define(root, { ...binaryOp, elementType, reduceOnly });
    byVariant.set(key, definition);
  }
  return definition as PrefixScanDefinition<TElement>;
}

function runOnce<TElement extends ScanElementType>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp,
  reduceOnly: boolean,
): ScanBuffer<TElement> {
  const definition = cachedDefinition(root, buffer.dataType.elementType, binaryOp, reduceOnly);
  const instance = instantiateScan(root, definition, { buffer }, false);

  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  instance.step(pass);
  pass.end();
  root.device.queue.submit([encoder.finish()]);

  instance.destroy();
  return instance.resultBuffer;
}

/**
 * Performs an exclusive prefix scan of `buffer` in place, **submits** the work and returns
 * the buffer. Definitions are cached per `root`, `operation`, `identityElement` and element
 * type. For repeated scans, or to record into your own pass, use `defineAndInstantiate`.
 */
export function scan<TElement extends ScanElementType>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp,
): ScanBuffer<TElement> {
  return runOnce(root, buffer, binaryOp, false);
}

/**
 * Reduces `buffer` with the given associative operation, **submits** the work and returns a
 * single-element buffer with the aggregate. The input is left untouched and the caller owns
 * the returned buffer.
 */
export function reduce<TElement extends ScanElementType>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp,
): ScanBuffer<TElement> {
  return runOnce(root, buffer, binaryOp, true);
}
