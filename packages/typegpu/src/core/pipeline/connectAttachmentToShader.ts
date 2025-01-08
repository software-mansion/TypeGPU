import { isData } from '../../data/dataTypes';
import type { Vec4f } from '../../data/wgslTypes';
import type { IOLayout } from '../function/fnTypes';
import type {
  AnyFragmentColorAttachment,
  ColorAttachment,
} from './renderPipeline';

function isColorAttachment(
  value: unknown | ColorAttachment,
): value is ColorAttachment {
  return typeof (value as ColorAttachment)?.loadOp === 'string';
}

export function connectAttachmentToShader(
  shaderOutputLayout: IOLayout<Vec4f>,
  attachment: AnyFragmentColorAttachment,
): ColorAttachment[] {
  if (isData(shaderOutputLayout)) {
    if (!isColorAttachment(attachment)) {
      throw new Error('Expected a single color attachment, not a record.');
    }

    return [attachment];
  }

  const result: ColorAttachment[] = [];
  for (const key of Object.keys(shaderOutputLayout)) {
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
