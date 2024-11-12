import type { Storage } from '../../extension';
import type { StorageTextureTexelFormat } from './textureFormats';
import type { TextureProps } from './textureProps';

export interface Sampled {
  usableAsSampled: true;
}

export interface Render {
  usableAsRender: true;
}

export type LiteralToExtensionMap = {
  storage: Storage; // <- shared between buffers and textures
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
