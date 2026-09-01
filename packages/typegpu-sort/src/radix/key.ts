import { d, std } from 'typegpu';
import type { RadixKeyType } from './schemas.ts';
import type { RadixSorterOptions } from './types.ts';

export type KeyOptions = Pick<RadixSorterOptions, 'key' | 'direction' | 'range' | 'keyBits'>;

function sortableI32(v: number): number {
  'use gpu';
  return std.bitcast(d.i32, d.u32)(v) ^ 0x80000000;
}

function sortableF32(v: number): number {
  'use gpu';
  const bits = std.select(std.bitcast(d.f32, d.u32)(v), 0, v === 0);
  return bits ^ std.select(d.u32(0x80000000), 0xffffffff, bits >= 0x80000000);
}

const toSortable = { u32: undefined, i32: sortableI32, f32: sortableF32 } as const;

function bitLength(n: number): number {
  return n === 0 ? 1 : 32 - Math.clz32(n);
}

function makeRangeMap(keyType: RadixKeyType, [min, max]: [number, number], keyBits: number) {
  if (keyType.type === 'f32') {
    const scale = (2 ** keyBits - 1) / (max - min);
    const largestKey = 2 ** keyBits - 2 ** Math.max(keyBits - 24, 0);
    return function quantized(v: number): number {
      'use gpu';
      return d.u32(std.min((std.clamp(v, min, max) - min) * scale, largestKey));
    };
  }
  const offset = min >>> 0;
  return function offsetKey(v: number): number {
    'use gpu';
    return d.u32(std.clamp(v, min, max)) - offset;
  };
}

export function normalizeKey(keyType: RadixKeyType, options: KeyOptions) {
  const { key, range, direction } = options;
  const isInteger = keyType.type !== 'f32';
  const keyBits = options.keyBits ?? (range && isInteger ? bitLength(range[1] - range[0]) : 32);

  if (!Number.isInteger(keyBits) || keyBits < 1 || keyBits > 32) {
    throw new Error(`keyBits must be an integer between 1 and 32, got ${keyBits}.`);
  }
  if (range && range[0] > range[1]) {
    throw new Error(`range must be ordered, got [${range[0]}, ${range[1]}].`);
  }
  if (key && range) {
    throw new Error('`key` replaces the built-in key map, so it cannot be combined with `range`.');
  }
  if (!key && !range && keyBits < 32 && keyType.type !== 'u32') {
    throw new Error(`keyBits below 32 on ${keyType.type} keys requires \`range\`.`);
  }

  const mapped = key ?? (range ? makeRangeMap(keyType, range, keyBits) : toSortable[keyType.type]);
  const descending = direction === 'descending';

  const sortKey = (v: number): number => {
    'use gpu';
    const sortable = mapped ? mapped(v) : v;
    return descending ? ~sortable : sortable;
  };

  return { keyBits, sortKey };
}

/**
 * The monotone map from a raw key to the `u32` a radix sorter with these options sorts by,
 * for reuse in comparators and custom kernels
 */
export function sortKey(keyType: RadixKeyType, options: KeyOptions = {}) {
  return normalizeKey(keyType, options).sortKey;
}
