import { isBuiltin } from '../../data/attributes.ts';
import { type BaseData, isWgslStruct } from '../../data/wgslTypes.ts';
import type { AnyFragmentColorAttachment, ColorAttachment } from './renderPipeline.ts';

function isColorAttachment(value: unknown): value is ColorAttachment {
  return !!(value as ColorAttachment)?.view;
}

export function connectAttachmentToShader(
  fragmentOut: BaseData,
  attachment: AnyFragmentColorAttachment,
): ColorAttachment[] {
  if (isBuiltin(fragmentOut)) {
    return [];
  }

  if (isWgslStruct(fragmentOut)) {
    const result: ColorAttachment[] = [];
    for (const key of Object.keys(fragmentOut.propTypes)) {
      const outputValue = fragmentOut.propTypes[key];

      if (isBuiltin(outputValue)) {
        continue;
      }

      const matching = (attachment as Record<string, ColorAttachment>)[key];

      if (!matching) {
        throw new Error(
          `A color attachment by the name of '${key}' was not provided to the shader.`,
        );
      }

      result.push(matching);
    }
    return result;
  }

  if (!isColorAttachment(attachment)) {
    throw new Error('Expected a single color attachment, not a record.');
  }

  return [attachment];
}
