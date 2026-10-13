import type { ColorAttachment } from '../commandEncoder/attachments.ts';
import type { ConnectedTarget } from './connectTargetsToShader.ts';
import type { AnyFragmentColorAttachment } from './renderPipeline.ts';

function isColorAttachment(value: unknown): value is ColorAttachment {
  return !!(value as ColorAttachment)?.view;
}

export function connectAttachmentToShader(
  connectedTargets: (ConnectedTarget | null)[] | undefined,
  attachment: AnyFragmentColorAttachment,
): (ColorAttachment | null)[] {
  if (!connectedTargets) {
    return [];
  }
  return connectedTargets.map((target) => {
    if (!target) {
      return null;
    }

    if (target.key === undefined) {
      if (!isColorAttachment(attachment)) {
        throw new Error('Expected a single color attachment, not a record.');
      }
      return attachment;
    }

    const matching = (attachment as Record<string, ColorAttachment>)[target.key];

    if (!matching) {
      throw new Error(
        `A color attachment by the name of '${target.key}' was not provided to the shader.`,
      );
    }

    return matching;
  });
}
