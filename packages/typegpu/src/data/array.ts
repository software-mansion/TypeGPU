import { comptime, type TgpuComptime } from '../core/function/comptime.ts';
import { $internal } from '../shared/symbols.ts';
import { schemaCallWrapper } from './schemaCallWrapper.ts';
import { sizeOf } from './sizeOf.ts';
import type { AnyWgslData, Decorated, Location, WgslArray } from './wgslTypes.ts';
import { isDecorated, isLocationAttrib } from './wgslTypes.ts';

// ----------
// Public API
// ----------

type ForbiddenDecoratedArrayElement<T> =
  T extends Decorated<infer _, infer Attribs>
    ? Attribs[number] extends Location
      ? never
      : T
    : never;

interface WgslArrayConstructor {
  /**
   * @deprecated Error: Arrays cannot hold decorated types other than @location.
   * Wrap align/size in a struct instead, e.g. d.arrayOf(d.struct({ value: d.align(16, d.u32) }), n).
   */
  <TElement extends AnyWgslData>(
    elementType: ForbiddenDecoratedArrayElement<TElement>,
    elementCount?: number,
  ): 'Error: Arrays cannot hold decorated types other than @location. Wrap it in a struct instead, e.g. d.arrayOf(d.struct({ value: d.align(16, d.u32) }), n).';

  <TElement extends AnyWgslData>(
    elementType: TElement,
  ): (elementCount: number) => WgslArray<TElement>;

  <TElement extends AnyWgslData>(elementType: TElement, elementCount: number): WgslArray<TElement>;
}

/**
 * Creates an array schema that can be used to construct gpu buffers.
 * Describes arrays with fixed-size length, storing elements of the same type.
 *
 * The only decoration allowed on element types is `d.location`. Decorators like
 * `d.align` and `d.size` cannot be applied directly — wrap them in a struct instead,
 * e.g. `d.arrayOf(d.struct({ value: d.align(16, d.u32) }), n)`.
 *
 * @example
 * const LENGTH = 3;
 * const array = d.arrayOf(d.u32, LENGTH);
 *
 * If `elementCount` is not specified, a partially applied function is returned.
 * @example
 * const array = d.arrayOf(d.vec3f);
 * //    ^? (n: number) => WgslArray<d.Vec3f>
 *
 * @param elementType The type of elements in the array.
 * @param elementCount The number of elements in the array.
 * @throws If `elementType` is decorated with anything other than `d.location`.
 */
export const arrayOf: TgpuComptime<WgslArrayConstructor> = comptime(((
  elementType: AnyWgslData,
  elementCount?: number,
) => {
  if (isDecorated(elementType) && !elementType.attribs.every(isLocationAttrib)) {
    throw new Error(
      'Arrays cannot hold decorated types other than @location. Wrap it in a struct instead, e.g. d.arrayOf(d.struct({ value: d.align(16, d.u32) }), n).',
    );
  }

  if (elementCount === undefined) {
    return comptime((count: number) => cpu_arrayOf(elementType, count));
  }
  return cpu_arrayOf(elementType, elementCount);
}) as unknown as WgslArrayConstructor).$name('arrayOf');

// --------------
// Implementation
// --------------

function cpu_arrayOf<TElement extends AnyWgslData>(
  elementType: TElement,
  elementCount: number,
): WgslArray<TElement> {
  // In the schema call, create and return a deep copy
  // by wrapping all the values in `elementType` schema calls.
  const arraySchema = (elements?: TElement[]) => {
    if (elements && elements.length !== elementCount) {
      throw new Error(
        `Array schema of ${elementCount} elements of type ${elementType.type} called with ${elements.length} argument(s).`,
      );
    }

    return Array.from({ length: elementCount }, (_, i) =>
      schemaCallWrapper(elementType, elements?.[i]),
    );
  };
  Object.setPrototypeOf(arraySchema, WgslArrayImpl);

  if (Number.isNaN(sizeOf(elementType))) {
    throw new Error('Cannot nest runtime sized arrays.');
  }
  arraySchema.elementType = elementType;

  if (!Number.isInteger(elementCount) || elementCount < 0) {
    throw new Error(`Cannot create array schema with invalid element count: ${elementCount}.`);
  }
  arraySchema.elementCount = elementCount;

  return arraySchema as unknown as WgslArray<TElement>;
}

const WgslArrayImpl = {
  [$internal]: true,
  type: 'array',

  toString(this: WgslArray): string {
    return `arrayOf(${String(this.elementType)}, ${this.elementCount})`;
  },
};
