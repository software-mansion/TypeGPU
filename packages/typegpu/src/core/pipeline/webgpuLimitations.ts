import { alignmentOf } from '../../data/alignmentOf.ts';
import { memoryLayoutOf } from '../../data/offsetUtils.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { strideOf } from '../../data/schemaMemoryLayout.ts';
import { isWgslArray, isWgslStruct, type BaseData } from '../../data/wgslTypes.ts';
import { invariant } from '../../errors.ts';
import { roundUp } from '../../mathUtils.ts';
import { getName } from '../../shared/meta.ts';
import { visibilityOf, type TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import { logger } from '../../tgpuLogger.ts';
import type { ShaderStage } from '../../types.ts';

export const ALL_STAGES: ShaderStage[] = ['compute', 'vertex', 'fragment'];

/**
 * Warns if the layouts give any shader stage more buffers than it supports.
 */
export function warnIfOverflow(layouts: TgpuBindGroupLayout[], limits: GPUSupportedLimits) {
  const entries = Object.values(layouts)
    .flatMap((layout) => Object.values(layout.entries))
    .filter((entry) => entry !== null);

  const busiestStage = (kind: 'uniform' | 'storage') =>
    ALL_STAGES.map((stage) => ({
      stage,
      count: entries.filter((entry) => kind in entry && visibilityOf(entry).includes(stage)).length,
    })).reduce((busiest, next) => (next.count > busiest.count ? next : busiest));

  const uniform = busiestStage('uniform');
  const storage = busiestStage('storage');

  if (uniform.count > limits.maxUniformBuffersPerShaderStage) {
    logger.warn(
      'webgpu-limits-exceeded',
      `Number of uniform buffers visible to the ${uniform.stage} stage (${uniform.count}) exceeds maxUniformBuffersPerShaderStage (${limits.maxUniformBuffersPerShaderStage}). Consider:
1. Grouping some of the uniforms into one using 'd.struct',
2. Increasing the limit when requesting a device or creating a root.`,
    );
  }

  if (storage.count > limits.maxStorageBuffersPerShaderStage) {
    logger.warn(
      'webgpu-limits-exceeded',
      `Number of storage buffers visible to the ${storage.stage} stage (${storage.count}) exceeds maxStorageBuffersPerShaderStage (${limits.maxStorageBuffersPerShaderStage}).`,
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
  if (!logger.isEnabled('uniform-schema-misaligned')) {
    // Silenced by default in production, and computing memory layouts isn't free
    return;
  }

  checkUniformAlignment(schema);
}

function checkUniformAlignment(schema: BaseData) {
  if (isWgslArray(schema)) {
    checkUniformAlignment(schema.elementType);

    const stride = strideOf(schema);
    if (stride % 16 !== 0) {
      logger.warn(
        'uniform-schema-misaligned',
        `\
Schema '${getName(schema.elementType) ?? '<unnamed>'}' is used in an array in a uniform buffer, and its stride (${stride}) is not a multiple of 16.
This is not portable (see https://www.w3.org/TR/WGSL/#address-space-layout-constraints), and will break on some devices.
To address this, put the element schema in a struct and wrap the prop in 'd.align(16, ...)', or use a different schema like 'vec4f'.`,
      );
    }
  }
  if (isWgslStruct(schema)) {
    Object.values(schema.propTypes).forEach(checkUniformAlignment);

    Object.entries(schema.propTypes).forEach(([key, value]) => {
      const offset = memoryLayoutOf(schema, (schema) => schema[key]).offset;
      const requiredAlignment = requiredAlignOf(value);

      if (offset % requiredAlignment) {
        logger.warn(
          'uniform-schema-misaligned',
          `\
Schema '${getName(schema) ?? '<unnamed>'}' is used in a uniform buffer, and its property '${key}' does not meet required alignment (offset is ${offset}, required alignment is ${requiredAlignment}).
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

      const minimumDifference = roundUp(sizeOf(thisValue), 16);
      const thisKeyOffset = memoryLayoutOf(schema, (schema) => schema[thisKey]).offset;
      const nextKeyOffset = memoryLayoutOf(schema, (schema) => schema[nextKey]).offset;
      const difference = nextKeyOffset - thisKeyOffset;

      if (minimumDifference > difference) {
        logger.warn(
          'uniform-schema-misaligned',
          `\
Schema '${getName(schema) ?? '<unnamed>'}' is used in a uniform buffer, and the difference between memory offsets of '${thisKey}' and '${nextKey}' props (${difference}) is less than recommended (${minimumDifference}).
This is not portable (see https://www.w3.org/TR/WGSL/#address-space-layout-constraints), and will break on some devices.
To address this, wrap the '${thisKey}' prop in 'd.size(${minimumDifference}, ...)'.`,
        );
      }
    }
  }
}
