import type { StorageFlag } from '../../extension.ts';
import type { StorageTextureTexelFormat } from './textureFormats.ts';
import type { TextureProps } from './textureProps.ts';

export interface Sampled {
  usableAsSampled: true;
}

export interface Render {
  usableAsRender: true;
}

export type LiteralToExtensionMap = {
  storage: StorageFlag; // <- shared between buffers and textures
  sampled: Sampled;
  render: Render;
};

export type TextureExtensionLiteral = keyof LiteralToExtensionMap;

export type AllowedUsages<TProps extends TextureProps> =
  | 'sampled'
  | 'render'
  | (TProps['format'] extends StorageTextureTexelFormat ? 'storage' : never);

export function isUsableAsSampled<T>(value: T): value is T & Sampled {
  return !!(value as unknown as Sampled)?.usableAsSampled;
}

export function isUsableAsRender<T>(value: T): value is T & Render {
  return !!(value as unknown as Render)?.usableAsRender;
}

/**
 * @category Errors
 */
export class NotSampledError extends Error {
  constructor(value: { readonly label?: string | undefined }) {
    super(
      `Resource '${value.label ?? '<unnamed>'}' cannot be bound as 'sampled'. Use .$usage('sampled') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotSampledError.prototype);
  }
}

/**
 * @category Errors
 */
export class NotRenderError extends Error {
  constructor(value: { readonly label?: string | undefined }) {
    super(
      `Resource '${value.label ?? '<unnamed>'}' cannot be bound as 'render'. Use .$usage('render') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotRenderError.prototype);
  }
}
