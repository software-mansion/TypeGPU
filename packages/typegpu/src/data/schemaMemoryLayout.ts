import { roundUp } from '../mathUtils.ts';
import { alignmentOf, customAlignmentOf } from './alignmentOf.ts';
import type { Disarray, LooseTypeLiteral, Unstruct } from './dataTypes.ts';
import {
  getCustomSize,
  isDisarray,
  isLooseDecorated,
  isUnstruct,
  undecorate,
} from './dataTypes.ts';
import type {
  BaseData,
  WgslArray,
  WgslStruct,
  WgslTypeLiteral,
} from './wgslTypes.ts';
import { isDecorated, isWgslArray, isWgslStruct } from './wgslTypes.ts';

const knownSizesMap: Record<string, number> = {
  bool: 4,
  f32: 4,
  f16: 2,
  i32: 4,
  u32: 4,
  u16: 2,
  vec2f: 8,
  vec2h: 4,
  vec2i: 8,
  vec2u: 8,
  'vec2<bool>': 8,
  vec3f: 12,
  vec3h: 6,
  vec3i: 12,
  vec3u: 12,
  'vec3<bool>': 12,
  vec4f: 16,
  vec4h: 8,
  vec4i: 16,
  vec4u: 16,
  'vec4<bool>': 16,
  mat2x2f: 16,
  mat3x3f: 48,
  mat4x4f: 64,
  uint8: 1,
  uint8x2: 2,
  uint8x4: 4,
  sint8: 1,
  sint8x2: 2,
  sint8x4: 4,
  unorm8: 1,
  unorm8x2: 2,
  unorm8x4: 4,
  snorm8: 1,
  snorm8x2: 2,
  snorm8x4: 4,
  uint16: 2,
  uint16x2: 4,
  uint16x4: 8,
  sint16: 2,
  sint16x2: 4,
  sint16x4: 8,
  unorm16: 2,
  unorm16x2: 4,
  unorm16x4: 8,
  snorm16: 2,
  snorm16x2: 4,
  snorm16x4: 8,
  float16: 2,
  float16x2: 4,
  float16x4: 8,
  float32: 4,
  float32x2: 8,
  float32x3: 12,
  float32x4: 16,
  uint32: 4,
  uint32x2: 8,
  uint32x3: 12,
  uint32x4: 16,
  sint32: 4,
  sint32x2: 8,
  sint32x3: 12,
  sint32x4: 16,
  'unorm10-10-10-2': 4,
  'unorm8x4-bgra': 4,
  atomic: 4,
} satisfies Partial<Record<WgslTypeLiteral | LooseTypeLiteral, number>>;

interface SchemaMemoryLayout {
  isContiguous: boolean;
  size: number;
  longestContiguousPrefix: number;
}

function computeMLOfStruct(struct: WgslStruct): SchemaMemoryLayout {
  let size = 0;
  let longestContiguousPrefix = 0;
  let isContiguous = true;
  let prefixEnd = false;

  for (const property of Object.values(struct.propTypes)) {
    if (Number.isNaN(size)) {
      throw new Error('Only the last property of a struct can be unbounded');
    }

    const prevSize = size;
    size = roundUp(size, alignmentOf(property));

    const hasPadding = prevSize !== size;

    const propLayout = computeMemoryLayout(property);
    size += propLayout.size;

    if (Number.isNaN(size) && property.type !== 'array') {
      throw new Error('Cannot nest unbounded struct within another struct');
    }

    if (prefixEnd) {
      continue;
    }

    if (!hasPadding && propLayout.isContiguous) {
      longestContiguousPrefix += propLayout.size;
    } else {
      prefixEnd = true;
      isContiguous = false;
      if (!hasPadding) {
        longestContiguousPrefix += propLayout.longestContiguousPrefix;
      }
    }
  }

  const trueSize = roundUp(size, alignmentOf(struct));

  return {
    isContiguous: size === trueSize && isContiguous,
    size: trueSize,
    longestContiguousPrefix,
  };
}

function computeMLOfUnstruct(data: Unstruct): SchemaMemoryLayout {
  let size = 0;
  let longestContiguousPrefix = 0;
  let isContiguous = true;
  let prefixEnd = false;

  for (const property of Object.values(data.propTypes)) {
    const alignment = customAlignmentOf(property);
    const prevSize = size;
    size = roundUp(size, alignment);

    const hasPadding = prevSize !== size;
    if (hasPadding) {
      isContiguous = false;
    }

    const propLayout = computeMemoryLayout(property);
    size += propLayout.size;

    if (prefixEnd) {
      continue;
    }

    if (!hasPadding && propLayout.isContiguous) {
      longestContiguousPrefix += propLayout.size;
    } else {
      prefixEnd = true;
      isContiguous = false;
      if (!hasPadding) {
        longestContiguousPrefix += propLayout.longestContiguousPrefix;
      }
    }
  }

  return {
    isContiguous: isContiguous,
    size,
    longestContiguousPrefix,
  };
}

function computeMLOfWgslArray(data: WgslArray): SchemaMemoryLayout {
  const elementType = data.elementType;
  const elementMemoryLayout = computeMemoryLayout(elementType);
  const elementSize = elementMemoryLayout.size;
  const stride = roundUp(elementSize, alignmentOf(elementType));

  const hasPadding = stride > elementSize;
  const isContiguous = !hasPadding && elementMemoryLayout.isContiguous;

  const size = data.elementCount === 0
    ? Number.NaN
    : data.elementCount * stride;

  let longestContiguousPrefix: number;
  if (isContiguous) {
    longestContiguousPrefix = size;
  } else {
    longestContiguousPrefix = elementMemoryLayout.longestContiguousPrefix;
  }

  return { size, isContiguous, longestContiguousPrefix };
}

function computeMLOfDisarray(data: Disarray): SchemaMemoryLayout {
  const elementType = data.elementType;
  const elementMemoryLayout = computeMemoryLayout(elementType);
  const elementSize = elementMemoryLayout.size;
  const stride = roundUp(elementSize, customAlignmentOf(elementType));

  const hasPadding = stride > elementSize;
  const isContiguous = !hasPadding && elementMemoryLayout.isContiguous;

  const size = data.elementCount * stride;

  let longestContiguousPrefix: number;
  if (isContiguous) {
    longestContiguousPrefix = size;
  } else {
    longestContiguousPrefix = elementMemoryLayout.longestContiguousPrefix;
  }

  return { size, isContiguous, longestContiguousPrefix };
}

function computeMemoryLayout(data: BaseData): SchemaMemoryLayout {
  const knownSize = knownSizesMap[data.type];

  if (knownSize !== undefined) {
    return {
      isContiguous: data.type !== 'mat3x3f',
      size: knownSize,
      longestContiguousPrefix: data.type === 'mat3x3f' ? 12 : knownSize,
    };
  }

  if (isWgslStruct(data)) {
    return computeMLOfStruct(data);
  }

  if (isUnstruct(data)) {
    return computeMLOfUnstruct(data);
  }

  if (isWgslArray(data)) {
    return computeMLOfWgslArray(data);
  }

  if (isDisarray(data)) {
    return computeMLOfDisarray(data);
  }

  if (isDecorated(data) || isLooseDecorated(data)) {
    const size = getCustomSize(data);
    const undecoratedLayout = computeMemoryLayout(undecorate(data));

    if (size) {
      const isContiguous = size === undecoratedLayout.size &&
        undecoratedLayout.isContiguous;

      return {
        isContiguous,
        size,
        longestContiguousPrefix: undecoratedLayout.longestContiguousPrefix,
      };
    }
    return computeMemoryLayout(data.inner);
  }

  throw new Error(`Cannot determine memory layout of data: ${data}`);
}

/**
 * Since memory layout can be inferred from data types, they are not stored on them.
 * Instead, this weak map acts as an extended property of those data types.
 */
const cachedLayouts = new WeakMap<BaseData, SchemaMemoryLayout>();

export function getLayoutInfo<T extends keyof SchemaMemoryLayout>(
  schema: BaseData,
  key: T,
): SchemaMemoryLayout[T] {
  let layout = cachedLayouts.get(schema);

  if (layout === undefined) {
    layout = computeMemoryLayout(schema);
    cachedLayouts.set(schema, layout);
  }

  return layout[key];
}
