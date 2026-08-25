import type AttributeNode from 'three/src/nodes/core/AttributeNode.js';
import { attribute as attributeImpl } from 'three/tsl';
import { d } from 'typegpu';
import { wgslTypeToGlslType } from './common.ts';
import { fromTSL, type TSLAccessor } from './typegpu-node.ts';

/**
 * Shorthand for `t3.fromTSL(attribute(...), ...)`.
 *
 * @example
 * ```ts
 * const position = t3.attribute('position', d.vec3f);
 * // Equivalent to:
 * // const position = t3.fromTSL(
 * //   attribute('position', 'vec3'),
 * //   d.vec3f,
 * // );
 * ```
 */
export function attribute<TDataType extends d.AnyWgslData>(
  name: string,
  dataType: TDataType,
): TSLAccessor<TDataType, AttributeNode> {
  const glslType = wgslTypeToGlslType[dataType.type as keyof typeof wgslTypeToGlslType];

  return fromTSL(attributeImpl(name, glslType), dataType);
}
