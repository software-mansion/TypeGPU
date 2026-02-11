import { isBuiltin } from '../../data/attributes.ts';
import { isData } from '../../data/dataTypes.ts';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn.ts';
import type {
  AnyFragmentColorAttachment,
  ColorAttachment,
} from './renderPipeline.ts';

function isColorAttachment(
  value: unknown | ColorAttachment,
): value is ColorAttachment {
  return typeof (value as ColorAttachment)?.loadOp === 'string';
}

export function connectAttachmentToShader(
  shaderOutputLayout: TgpuFragmentFn.Out | undefined,
  attachment: AnyFragmentColorAttachment,
): ColorAttachment[] {
  // For shell-less entry functions, we determine the layout based on solely the attachment
  if (!shaderOutputLayout) {
    if (typeof attachment.loadOp === 'string') {
      return [attachment as ColorAttachment];
    }

    return Object.values(attachment) as ColorAttachment[];
  }

  if (isData(shaderOutputLayout)) {
    if (isBuiltin(shaderOutputLayout)) {
      return [];
    }
    if (!isColorAttachment(attachment)) {
      throw new Error('Expected a single color attachment, not a record.');
    }

    return [attachment];
  }

  const result: ColorAttachment[] = [];
  for (const key of Object.keys(shaderOutputLayout)) {
    const outputValue = (shaderOutputLayout as Record<string, unknown>)[key];

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
