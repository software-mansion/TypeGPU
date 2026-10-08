import { roundUp } from '../mathUtils.ts';
import { alignmentOf } from './alignmentOf.ts';
import { type OffsetInfo as PropOffsetInfo, offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import { isContiguous } from './isContiguous.ts';
import { getLongestContiguousPrefix } from './getLongestContiguousPrefix.ts';
import type {
  AnyWgslData,
  BaseData,
  MatData,
  VecData,
  WgslArray,
  WgslStruct,
} from './wgslTypes.ts';
import { isMat, isVec, isWgslArray, isWgslStruct } from './wgslTypes.ts';
import { undecorate } from './dataTypes.ts';
import type { Infer } from '../shared/repr.ts';
import { vec2f, vec3f, vec4f } from './vector.ts';

/**
 * The absolute byte offset of the node, counted from the start of the root schema.
 */
const OFFSET_MARKER = Symbol('indirectOffset');

/**
 * The number of contiguous data bytes starting at the node's offset.
 * The run is not limited to the node itself: it continues into the data that follows,
 * until the first padding byte or the end of the root schema.
 * NaN means the run reaches a runtime-sized schema which is not contiguous.
 *
 * @remarks The parent computes this value as if the node had no padding inside.
 * Non-contiguous nodes have to correct it (e.g. cap it at their own padding) before using it.
 */
const CONTIGUOUS_MARKER = Symbol('indirectContiguous');

interface OffsetProxy {
  [OFFSET_MARKER]: number;
  [CONTIGUOUS_MARKER]: number;
}

function minContiguous(a: number, b: number): number {
  return Number.isNaN(a) ? b : Math.min(a, b);
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

function makeProxy(schema: AnyWgslData, baseOffset: number, contiguous: number): unknown {
  const unwrapped = undecorate(schema);

  if (isVec(unwrapped)) {
    return makeVecProxy(unwrapped, scalarNode(baseOffset, contiguous));
  }

  if (isMat(unwrapped)) {
    return makeMatProxy(unwrapped, scalarNode(baseOffset, contiguous));
  }

  if (isWgslStruct(unwrapped)) {
    return makeStructProxy(unwrapped, scalarNode(baseOffset, contiguous));
  }

  if (isWgslArray(unwrapped)) {
    return makeArrayProxy(unwrapped, scalarNode(baseOffset, contiguous));
  }

  return scalarNode(baseOffset, contiguous);
}

export function createOffsetProxy<T extends BaseData>(schema: T, baseOffset = 0): unknown {
  return makeProxy(schema as AnyWgslData, baseOffset, sizeOf(undecorate(schema)));
}

const vecPropToIndex = {
  x: 0,
  y: 1,
  z: 2,
  w: 3,

  r: 0,
  g: 1,
  b: 2,
  a: 3,

  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
} as Record<string, number>;

function makeVecProxy(vec: VecData, parent: OffsetProxy): unknown {
  const baseOffset = parent[OFFSET_MARKER];

  const componentCount = vec.componentCount;
  const componentSize = sizeOf(vec.primitive);

  return new Proxy(parent, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      const index = vecPropToIndex[prop] ?? -1;

      if (index < 0 || index >= componentCount) {
        return undefined;
      }

      const byteOffset = index * componentSize;
      const contiguous = Math.max(0, t[CONTIGUOUS_MARKER] - byteOffset);

      return scalarNode(baseOffset + byteOffset, contiguous);
    },
  });
}

function makeMatProxy(mat: MatData, parent: OffsetProxy): unknown {
  const [columnCount, columnSchema] =
    mat.type === 'mat2x2f' ? [2, vec2f] : mat.type === 'mat3x3f' ? [3, vec3f] : [4, vec4f];
  const elementSize = 4;
  const columnSize = columnCount * elementSize;
  const columnStride = columnCount === 2 ? 8 : 16;
  const hasPadding = columnCount === 3;

  const remainingFromParent = parent[CONTIGUOUS_MARKER];
  const ownProxy = !hasPadding
    ? parent
    : scalarNode(parent[OFFSET_MARKER], minContiguous(remainingFromParent, columnSize));

  const columns = new Proxy(ownProxy, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      const idx = Number(prop);
      if (!Number.isInteger(idx) || idx < 0 || idx >= columnCount) {
        return undefined;
      }

      const columnOffset = idx * columnStride;
      const contiguous = hasPadding ? columnSize : Math.max(0, remainingFromParent - columnOffset);

      return makeVecProxy(
        columnSchema,
        scalarNode(parent[OFFSET_MARKER] + columnOffset, contiguous),
      );
    },
  });

  return new Proxy(ownProxy, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      if (prop === 'columns') {
        return columns;
      }

      const index = Number(prop);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index * elementSize >= columnCount * columnStride
      ) {
        return undefined;
      }

      const byteOffset = elementSize * index;
      if (byteOffset % columnStride === columnSize) {
        return undefined;
      }

      const remaining = Math.max(0, remainingFromParent - byteOffset);
      const columnEnd = Math.floor(byteOffset / columnStride) * columnStride + columnSize;
      const localRemaining = columnEnd - byteOffset;

      return scalarNode(t[OFFSET_MARKER] + byteOffset, hasPadding ? localRemaining : remaining);
    },
  });
}

function makeArrayProxy(array: WgslArray, parent: OffsetProxy): unknown {
  const elementType = array.elementType as AnyWgslData;
  const elementSize = sizeOf(elementType);
  const stride = roundUp(elementSize, alignmentOf(elementType));
  const hasPadding = stride > elementSize;

  const remainingFromParent = parent[CONTIGUOUS_MARKER];
  const ownProxy = isContiguous(array)
    ? parent
    : scalarNode(
        parent[OFFSET_MARKER],
        minContiguous(remainingFromParent, getLongestContiguousPrefix(array)),
      );

  return new Proxy(ownProxy, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      if (prop === 'length') {
        return array.elementCount;
      }

      const index = Number(prop);
      if (!Number.isInteger(index) || index < 0 || index >= array.elementCount) {
        return undefined;
      }

      const elementOffset = index * stride;
      const elementLCP = getLongestContiguousPrefix(elementType);
      const remaining = Math.max(0, remainingFromParent - elementOffset);
      let childContiguous: number;

      if (hasPadding) {
        childContiguous = minContiguous(remaining, elementSize);
      } else if (!isContiguous(elementType) && index < array.elementCount - 1) {
        childContiguous = elementSize + elementLCP;
      } else {
        childContiguous = remaining;
      }

      return makeProxy(elementType, t[OFFSET_MARKER] + elementOffset, childContiguous);
    },
  });
}

type StructFieldMeta = {
  offset: number;
  runEnd: number;
  runContinueAfterFieldData: number;
};

function makeStructProxy(struct: WgslStruct, target: OffsetProxy): unknown {
  const offsets = offsetsForProps(struct);
  const propTypes = struct.propTypes as Record<string, AnyWgslData>;
  const props = Object.entries(propTypes);

  const meta = new Map<string, StructFieldMeta>();

  let runStart = 0;
  for (let i = 0; i < props.length; i++) {
    const [name, type] = props[i] as [string, AnyWgslData];

    const info = offsets[name] as PropOffsetInfo;
    const padding = info.padding ?? 0;

    const typeContiguous = isContiguous(type);

    const isRunEnd = i === props.length - 1 || padding > 0 || !typeContiguous;
    if (!isRunEnd) {
      continue;
    }

    const runEnd = info.offset + (typeContiguous ? info.size : getLongestContiguousPrefix(type));
    for (let j = runStart; j <= i; j++) {
      const runName = (props[j] as [string, AnyWgslData])[0];
      const runInfo = offsets[runName] as PropOffsetInfo;
      meta.set(runName, { offset: runInfo.offset, runEnd, runContinueAfterFieldData: NaN });
    }
    runStart = i + 1;
  }

  let prevRunContinueAfterFieldData = 0;
  for (let i = props.length - 1; i >= 0; i--) {
    const [name, type] = props[i] as [string, AnyWgslData];
    let currentRunContinueAfterFieldData = 0;

    if (
      i < props.length - 1 &&
      ((offsets[name] as PropOffsetInfo).padding ?? 0) === 0 &&
      sizeOf(type) === sizeOf(undecorate(type))
    ) {
      const [, nextType] = props[i + 1] as [string, AnyWgslData];
      currentRunContinueAfterFieldData = isContiguous(nextType)
        ? sizeOf(nextType) + prevRunContinueAfterFieldData
        : getLongestContiguousPrefix(nextType);
    }

    (meta.get(name) as StructFieldMeta).runContinueAfterFieldData =
      currentRunContinueAfterFieldData;
    prevRunContinueAfterFieldData = currentRunContinueAfterFieldData;
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

      const remainingFromHere = Math.max(0, t[CONTIGUOUS_MARKER] - m.offset);
      const localLimit = Math.max(0, m.runEnd - m.offset);
      const propSchema = propTypes[prop];
      if (!propSchema) {
        return undefined;
      }

      const childContiguous = isContiguous(propSchema)
        ? sizeOf(struct) === m.runEnd
          ? remainingFromHere
          : localLimit
        : sizeOf(undecorate(propSchema)) + m.runContinueAfterFieldData;

      return makeProxy(propSchema, t[OFFSET_MARKER] + m.offset, childContiguous);
    },
  });
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
 * @param accessor - Optional function that accesses a specific element within the schema. If omitted, uses the root offset (0).
 * @returns An object containing the offset and contiguous byte information.
 */
export function memoryLayoutOf<T extends BaseData>(
  schema: T,
  accessor?: (proxy: Infer<T>) => unknown,
): PrimitiveOffsetInfo {
  if (!accessor) {
    return {
      offset: 0,
      contiguous: getLongestContiguousPrefix(schema),
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
    'memoryLayoutOf: accessor did not return a schema element. Make sure the accessor navigates to a field or element of the schema (e.g. `(s) => s.position.x`).',
  );
}
