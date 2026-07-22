import { alignmentOf } from '../../data/alignmentOf.ts';
import { memoryLayoutOf } from '../../data/offsetUtils.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { isWgslArray, isWgslStruct, type BaseData } from '../../data/wgslTypes.ts';
import { invariant } from '../../errors.ts';
import { getName } from '../../internal.ts';
import { roundUp } from '../../mathUtils.ts';
import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import { logger } from '../../tgpuLogger.ts';

/**
 * Warns if layout exceeds supported buffer count limits.
 */
export function warnIfOverflow(layouts: TgpuBindGroupLayout[], limits: GPUSupportedLimits) {
  const entries = Object.values(layouts)
    .flatMap((layout) => Object.values(layout.entries))
    .filter((entry) => entry !== null);

  const uniform = entries.filter((entry) => 'uniform' in entry).length;
  const storage = entries.filter((entry) => 'storage' in entry).length;

  if (uniform > limits.maxUniformBuffersPerShaderStage) {
    logger.warn(
      'webgpu-limits-exceeded',
      `Total number of uniform buffers (${uniform}) exceeds maxUniformBuffersPerShaderStage (${limits.maxUniformBuffersPerShaderStage}). Consider:
1. Grouping some of the uniforms into one using 'd.struct',
2. Increasing the limit when requesting a device or creating a root.`,
    );
  }

  if (storage > limits.maxStorageBuffersPerShaderStage) {
    logger.warn(
      'webgpu-limits-exceeded',
      `Total number of storage buffers (${storage}) exceeds maxStorageBuffersPerShaderStage (${limits.maxStorageBuffersPerShaderStage}).`,
    );
  }
}

function requiredAlignOf(schema: BaseData) {
  if (isWgslStruct(schema) || isWgslArray(schema)) {
    return roundUp(alignmentOf(schema), 16);
  }
  return alignmentOf(schema);
}

/**
 * See https://www.w3.org/TR/WGSL/#address-space-layout-constraints
 */
export function warnIfNotUniformAligned(schema: BaseData) {
  if (isWgslArray(schema)) {
    warnIfNotUniformAligned(schema.elementType);

    const stride = roundUp(sizeOf(schema.elementType), alignmentOf(schema.elementType));
    if (stride % 16) {
      logger.warn(
        'uniform-schema-misaligned',
        `\
Schema '${getName(schema.elementType) ?? '<unnamed>'}' is used in an array in an uniform buffer, and its stride (${stride}) is not a multiple of 16.
This is not portable (see https://www.w3.org/TR/WGSL/#address-space-layout-constraints), and will break on some devices.
To address this, wrap the element in 'd.align(16, ...)'.`,
      );
    }
  }
  if (isWgslStruct(schema)) {
    Object.values(schema.propTypes).forEach(warnIfNotUniformAligned);

    Object.entries(schema.propTypes).forEach(([key, value]) => {
      const offset = memoryLayoutOf(schema, (schema) => schema[key]).offset;
      const requiredAlignment = requiredAlignOf(value);

      if (offset % requiredAlignment) {
        logger.warn(
          'uniform-schema-misaligned',
          `\
Schema '${getName(schema) ?? '<unnamed>'}' is used in an uniform buffer, and its property '${key}' does not meet required alignment (offset is ${offset}, required alignment is ${requiredAlignment}).
This is not portable (see https://www.w3.org/TR/WGSL/#address-space-layout-constraints), and will break on some devices.
To address this, wrap the property '${key}' in 'd.align(${requiredAlignment}, ...)'.`,
        );
      }
    });

    const keys = Object.keys(schema.propTypes);
    for (let i = 0; i < keys.length - 1; i++) {
      const thisKey = keys[i];
      const nextKey = keys[i + 1];
      invariant(thisKey && nextKey);

      const thisValue = schema.propTypes[thisKey];
      invariant(thisValue);

      if (!isWgslStruct(thisValue)) {
        continue;
      }

      const minimumDifference = roundUp(16, sizeOf(thisValue));
      const thisKeyOffset = memoryLayoutOf(schema, (schema) => schema[thisKey]).offset;
      const nextKeyOffset = memoryLayoutOf(schema, (schema) => schema[nextKey]).offset;
      const difference = nextKeyOffset - thisKeyOffset;

      if (minimumDifference > difference) {
        logger.warn(
          'uniform-schema-misaligned',
          `\
Schema '${getName(schema) ?? '<unnamed>'}' is used in an uniform buffer, and the difference between memory offsets of '${thisKey}' and '${nextKey}' props (${difference}) is less than recommended (${minimumDifference}).
This is not portable (see https://www.w3.org/TR/WGSL/#address-space-layout-constraints), and will break on some devices.
To address this, wrap the '${thisKey}' prop in 'd.size(${minimumDifference}, ...)'.`,
        );
      }
    }
  }
}
