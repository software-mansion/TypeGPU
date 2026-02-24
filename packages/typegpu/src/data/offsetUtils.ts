import { roundUp } from '../mathUtils.ts';
import { alignmentOf } from './alignmentOf.ts';
import {
  type OffsetInfo as PropOffsetInfo,
  offsetsForProps,
} from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import { isContiguous } from './isContiguous.ts';
import { getLongestContiguousPrefix } from './getLongestContiguousPrefix.ts';
import type {
  AnyWgslData,
  BaseData,
  VecData,
  WgslArray,
  WgslStruct,
} from './wgslTypes.ts';
import { isVec, isWgslArray, isWgslStruct } from './wgslTypes.ts';
import { undecorate } from './dataTypes.ts';
import type { Infer } from '../shared/repr.ts';

const OFFSET_MARKER = Symbol('indirectOffset');
const CONTIGUOUS_MARKER = Symbol('indirectContiguous');

interface OffsetProxy {
  [OFFSET_MARKER]: number;
  [CONTIGUOUS_MARKER]: number;
}

function isOffsetProxy(value: unknown): value is OffsetProxy {
  return (
    typeof value === 'object' &&
    value !== null &&
    OFFSET_MARKER in value &&
    CONTIGUOUS_MARKER in value
  );
}

function scalarNode(offset: number, contiguous: number): OffsetProxy {
  return { [OFFSET_MARKER]: offset, [CONTIGUOUS_MARKER]: contiguous };
}

function getMarker(target: OffsetProxy, prop: PropertyKey): number | undefined {
  if (prop === OFFSET_MARKER) {
    return target[OFFSET_MARKER];
  }
  if (prop === CONTIGUOUS_MARKER) {
    return target[CONTIGUOUS_MARKER];
  }
  return undefined;
}

function makeProxy(
  schema: AnyWgslData,
  baseOffset: number,
  contiguous = sizeOf(schema),
): unknown {
  const unwrapped = undecorate(schema);

  const vecComponentCount = isVec(unwrapped)
    ? unwrapped.componentCount
    : undefined;

  if (vecComponentCount !== undefined) {
    const componentSize = sizeOf((unwrapped as VecData).primitive);
    return makeVecProxy(
      scalarNode(baseOffset, contiguous),
      componentSize,
      vecComponentCount,
    );
  }

  if (isWgslStruct(unwrapped)) {
    return makeStructProxy(unwrapped, scalarNode(baseOffset, contiguous));
  }

  if (isWgslArray(unwrapped)) {
    return makeArrayProxy(unwrapped, scalarNode(baseOffset, contiguous));
  }

  return scalarNode(baseOffset, contiguous);
}

export function createOffsetProxy<T extends BaseData>(
  schema: T,
  baseOffset = 0,
): unknown {
  return makeProxy(schema as AnyWgslData, baseOffset, sizeOf(schema));
}

function makeVecProxy(
  target: OffsetProxy,
  componentSize: number,
  componentCount: 2 | 3 | 4,
): unknown {
  const baseOffset = target[OFFSET_MARKER];

  return new Proxy(target, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      const idx = prop === 'x' || prop === '0'
        ? 0
        : prop === 'y' || prop === '1'
        ? 1
        : prop === 'z' || prop === '2'
        ? 2
        : prop === 'w' || prop === '3'
        ? 3
        : -1;

      if (idx < 0 || idx >= componentCount) {
        return undefined;
      }

      const byteOffset = idx * componentSize;
      const contiguous = Math.max(0, t[CONTIGUOUS_MARKER] - byteOffset);

      return scalarNode(baseOffset + byteOffset, contiguous);
    },
  });
}

function makeArrayProxy(array: WgslArray, target: OffsetProxy): unknown {
  const elementType = array.elementType as AnyWgslData;
  const elementSize = sizeOf(elementType);
  const stride = roundUp(elementSize, alignmentOf(elementType));
  const hasPadding = stride > elementSize;

  return new Proxy(target, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (prop === 'length') {
        return array.elementCount;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      const index = Number(prop);
      if (
        !Number.isInteger(index) ||
        index < 0 || index >= array.elementCount
      ) {
        return undefined;
      }

      const elementOffset = index * stride;
      const remainingFromHere = !isContiguous(elementType)
        ? elementSize + getLongestContiguousPrefix(elementType) // it is too much, but we correct it later
        : Math.max(
          0,
          t[CONTIGUOUS_MARKER] - elementOffset,
        );

      const childContiguous = hasPadding
        ? Math.min(remainingFromHere, elementSize)
        : remainingFromHere;

      return makeProxy(
        elementType,
        t[OFFSET_MARKER] + elementOffset,
        childContiguous,
      );
    },
  });
}

type StructFieldMeta = {
  offset: number;
  runEnd: number;
};

function makeStructProxy(struct: WgslStruct, target: OffsetProxy): unknown {
  const offsets = offsetsForProps(struct);
  const propTypes = struct.propTypes as Record<string, AnyWgslData>;
  const propNames = Object.keys(propTypes);

  const meta = new Map<string, StructFieldMeta>();

  let runStart = 0;
  for (let i = 0; i < propNames.length; i++) {
    const name = propNames[i];
    if (!name) {
      continue;
    }
    const type = propTypes[name];
    if (!type) {
      continue;
    }

    const info = offsets[name] as PropOffsetInfo;
    const padding = info.padding ?? 0;

    const typeContiguous = isContiguous(type);
    const isRunEnd = i === propNames.length - 1 || padding > 0 ||
      !typeContiguous;
    if (!isRunEnd) {
      continue;
    }

    const runEnd = info.offset +
      (typeContiguous ? info.size : getLongestContiguousPrefix(type));
    for (let j = runStart; j <= i; j++) {
      const runName = propNames[j];
      if (!runName) {
        continue;
      }
      const runInfo = offsets[runName] as PropOffsetInfo;
      meta.set(runName, { offset: runInfo.offset, runEnd });
    }
    runStart = i + 1;
  }

  return new Proxy(target, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      const m = meta.get(prop);
      if (!m) {
        return undefined;
      }

      const remainingFromHere = Math.max(
        0,
        t[CONTIGUOUS_MARKER] - m.offset,
      );
      const localLimit = Math.max(0, m.runEnd - m.offset);
      const propSchema = propTypes[prop];
      if (!propSchema) {
        return undefined;
      }

      return makeProxy(
        propSchema,
        t[OFFSET_MARKER] + m.offset,
        sizeOf(struct) === m.runEnd ? remainingFromHere : localLimit,
      );
    },
  });
}

function getRootContiguous(schema: AnyWgslData): number {
  const unwrapped = undecorate(schema);

  if (isWgslStruct(unwrapped)) {
    const offsets = offsetsForProps(unwrapped);
    const propTypes = unwrapped.propTypes as Record<string, AnyWgslData>;
    const propNames = Object.keys(propTypes);

    for (let i = 0; i < propNames.length; i++) {
      const name = propNames[i];
      if (!name) {
        continue;
      }
      const info = offsets[name] as PropOffsetInfo;
      const padding = info.padding ?? 0;

      const runEnd = info.offset + info.size;
      const isRunEnd = i === propNames.length - 1 || padding > 0;
      if (isRunEnd) {
        return runEnd;
      }
    }

    return 0;
  }

  if (isWgslArray(unwrapped)) {
    const elementType = unwrapped.elementType as AnyWgslData;
    const elementSize = sizeOf(elementType);
    const stride = roundUp(elementSize, alignmentOf(elementType));
    const totalSize = sizeOf(schema);
    if (!Number.isFinite(totalSize)) {
      return elementSize;
    }
    return stride > elementSize ? elementSize : totalSize;
  }

  return sizeOf(schema);
}

/**
 * Interface containing information about the offset and the available contiguous after a selected primitive.
 */
export interface PrimitiveOffsetInfo {
  /** The byte offset of the primitive within the buffer. */
  offset: number;
  /** The number of contiguous bytes available from the offset. */
  contiguous: number;
}

/**
 * A function that retrieves offset and information for a specific primitive within a data schema.
 * Example usage:
 * ```ts
 * const Boid = d.struct({
 *  position: d.vec3f,
 *  velocity: d.vec3f,
 * });
 * const memLayout = d.memoryLayoutOf(Boid, (b) => b.velocity.y);
 * console.log(memLayout.offset); // Byte offset of velocity.y within Boid (here 20 bytes)
 * console.log(memLayout.contiguous); // Contiguous bytes available from that offset (here 8 bytes)
 * ```
 *
 * @param schema - The data schema to analyze.
 * @param accessor - Optional function that accesses a specific primitive within the schema. If omitted, uses the root offset (0).
 * @returns An object containing the offset and contiguous byte information.
 */
export function memoryLayoutOf<T extends BaseData>(
  schema: T,
  accessor?: (proxy: Infer<T>) => number,
): PrimitiveOffsetInfo {
  if (!accessor) {
    return {
      offset: 0,
      contiguous: getRootContiguous(schema as AnyWgslData),
    };
  }

  const proxy = createOffsetProxy(schema);
  const result = accessor(proxy as Infer<T>);

  if (isOffsetProxy(result)) {
    return {
      offset: result[OFFSET_MARKER],
      contiguous: result[CONTIGUOUS_MARKER],
    };
  }

  throw new Error(
    'Invalid accessor result. Expected an offset proxy with markers.',
  );
}
