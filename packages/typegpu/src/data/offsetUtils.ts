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
import { isDisarray, isUnstruct, undecorate } from './dataTypes.ts';
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
 * NaN means the run reaches a contiguous runtime-sized array, so its end is unknown.
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

function throwIfLoose(schema: BaseData): void {
  if (isUnstruct(schema) || isDisarray(schema)) {
    throw new Error(
      `memoryLayoutOf: loose schemas are not supported (encountered '${schema.type}').`,
    );
  }
}

function makeProxy(schema: AnyWgslData, baseOffset: number, contiguous: number): unknown {
  const unwrapped = undecorate(schema);

  throwIfLoose(unwrapped);

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
  const elementLCP = getLongestContiguousPrefix(elementType);

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
  localRemaining: number;
  runReachesEnd: boolean;
};

function makeStructProxy(struct: WgslStruct, parent: OffsetProxy): unknown {
  const offsets = offsetsForProps(struct);
  const propTypes = struct.propTypes as Record<string, AnyWgslData>;
  const props = Object.entries(propTypes);
  const structSize = sizeOf(struct);

  const remainingFromParent = parent[CONTIGUOUS_MARKER];
  const ownProxy = isContiguous(struct)
    ? parent
    : scalarNode(
        parent[OFFSET_MARKER],
        minContiguous(remainingFromParent, getLongestContiguousPrefix(struct)),
      );

  const meta = new Map<string, StructFieldMeta>();

  let nextPropLocalRemainingData = 0;
  let nextPropRunReachesEnd = false;
  for (let i = props.length - 1; i >= 0; i--) {
    const [name, type] = props[i] as [string, AnyWgslData];
    const info = offsets[name] as PropOffsetInfo;
    const dataSize = sizeOf(undecorate(type));

    const noGapAfter = (info.padding ?? 0) === 0 && sizeOf(type) === dataSize;

    let dataAfter = 0;
    let runReachesEnd = false;
    if (noGapAfter) {
      if (i === props.length - 1) {
        runReachesEnd = true;
      } else {
        const [, nextType] = props[i + 1] as [string, AnyWgslData];
        if (isContiguous(nextType)) {
          dataAfter = sizeOf(nextType) + nextPropLocalRemainingData;
          runReachesEnd = nextPropRunReachesEnd;
        } else {
          dataAfter = getLongestContiguousPrefix(nextType);
        }
      }
    }

    meta.set(name, {
      offset: info.offset,
      localRemaining: dataSize + dataAfter,
      runReachesEnd,
    });
    nextPropLocalRemainingData = dataAfter;
    nextPropRunReachesEnd = runReachesEnd;
  }

  return new Proxy(ownProxy, {
    get(t, prop) {
      const marker = getMarker(t, prop);
      if (marker !== undefined) {
        return marker;
      }

      if (typeof prop !== 'string') {
        return undefined;
      }

      const m = meta.get(prop);
      const propSchema = propTypes[prop];
      if (!m || !propSchema) {
        return undefined;
      }

      const childContiguous = m.runReachesEnd
        ? m.localRemaining + Math.max(0, remainingFromParent - structSize)
        : m.localRemaining;

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
  throwIfLoose(undecorate(schema));

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
