import type { StorageFlag } from '../../extension.ts';
import { getName } from '../../shared/meta.ts';
import type { StorageTextureFormats } from './textureFormats.ts';
import type { TextureProps } from './textureProps.ts';

export interface SampledFlag {
  usableAsSampled: true;
}

export interface RenderFlag {
  usableAsRender: true;
}

export type LiteralToExtensionMap = {
  storage: StorageFlag; // <- shared between buffers and textures
  sampled: SampledFlag;
  render: RenderFlag;
};

export type AllowedUsages<TProps extends TextureProps> =
  | 'sampled'
  | 'render'
  | (TProps['format'] extends StorageTextureFormats ? 'storage' : never);

export function isUsableAsSampled<T>(value: T): value is T & SampledFlag {
  return !!(value as unknown as SampledFlag)?.usableAsSampled;
}

export function isUsableAsRender<T>(value: T): value is T & RenderFlag {
  return !!(value as unknown as RenderFlag)?.usableAsRender;
}

/**
 * @category Errors
 */
export class NotSampledError extends Error {
  constructor(value: object) {
    super(
      `Resource '${
        getName(value) ?? '<unnamed>'
      }' cannot be bound as 'sampled'. Use .$usage('sampled') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotSampledError.prototype);
  }
}
