import type InputNode from 'three/src/nodes/core/InputNode.js';
import { uniform as uniformImpl, uniformArray as uniformArrayImpl } from 'three/tsl';
import type { Color, Node, TSL, UniformArrayNode, UniformNode } from 'three/webgpu';
import * as d from 'typegpu/data';
import { wgslTypeToGlslType } from './common.ts';
import { fromTSL, type TSLAccessor } from './typegpu-node.ts';

/**
 * Shorthand for `t3.fromTSL(uniform(...), ...)`
 *
 * @example
 * ```ts
 * const attractorsLength = t3.uniform(attractorsPositions.array.length, d.u32);
 * // Equivalent to:
 * // const attractorsLength = t3.fromTSL(
 * //   uniform(attractorsPositions.array.length, 'uint'),
 * //   d.u32,
 * // );
 * ```
 */
export function uniform<TValue, TDataType extends d.AnyWgslData>(
  value: TValue | InputNode<TValue>,
  dataType: TDataType,
): TSLAccessor<TDataType, UniformNode<TValue>> {
  let glslType: string | undefined =
    wgslTypeToGlslType[dataType.type as keyof typeof wgslTypeToGlslType];

  if ((value as TSL.NodeObject<Node>).isNode || (value as Color).isColor) {
    // The type sometimes interferes with the node's inherent type
    glslType = undefined;
  }

  return fromTSL(uniformImpl(value, glslType), dataType);
}

export function uniformArray<TDataType extends d.AnyWgslData>(
  values: unknown[],
  elementType: TDataType,
): TSLAccessor<d.WgslArray<TDataType>, UniformArrayNode> {
  return fromTSL(uniformArrayImpl(values), d.arrayOf(elementType));
}
