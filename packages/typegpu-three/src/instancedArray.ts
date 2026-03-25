import { instancedArray as instancedArrayImpl } from 'three/tsl';
import type { StorageBufferNode, TypedArray } from 'three/webgpu';
import { d } from 'typegpu';
import { wgslTypeToGlslType } from './common.ts';
import { fromTSL, type TSLAccessor } from './typegpu-node.ts';

/**
 * Shorthand for `t3.fromTSL(instancedArray(...), ...)`
 *
 * @example
 * ```ts
 * const velocityBuffer = t3.instancedArray(count, d.vec3f);
 * // Equivalent to:
 * // const velocityBuffer = t3.fromTSL(
 * //   instancedArray(count, 'vec3'),
 * //   d.arrayOf(d.vec3f),
 * // );
 * ```
 */
export function instancedArray<TDataType extends d.AnyWgslData>(
  count: number | TypedArray,
  elementType: TDataType,
): TSLAccessor<d.WgslArray<TDataType>, StorageBufferNode> {
  const glslType = wgslTypeToGlslType[elementType.type as keyof typeof wgslTypeToGlslType];

  return fromTSL(instancedArrayImpl(count, glslType), d.arrayOf(elementType));
}
