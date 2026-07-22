import type { TgpuTexture } from '../core/texture/texture.ts';
import { writeTextureChannels } from '../core/texture/textureUtils.ts';
import {
  normalizeImageWrite,
  validateResizeAllowed,
  type TextureChannel,
  type TextureChannelWriteLayout,
  type TextureImageWrite,
  type TextureWriteOptions,
} from '../core/texture/textureWrite.ts';
import type { RenderFlag } from '../core/texture/usageExtension.ts';
import { $internal } from '../shared/symbols.ts';

export type TextureChannelSource = {
  source: GPUCopyExternalImageSource;
  from: TextureChannel;
};

export type TextureChannels = {
  [Channel in TextureChannel]?: TextureChannelSource | undefined;
};

const TEXTURE_CHANNELS = ['r', 'g', 'b', 'a'] as const;

function isTextureChannel(value: string): value is TextureChannel {
  return TEXTURE_CHANNELS.includes(value as TextureChannel);
}

/**
 * Writes image sources into individual channels of `texture`. Each entry
 * writes a single channel, with `from` selecting which channel of the
 * source to read. Omitted channels are left untouched.
 *
 * Requires the `'render'` usage flag on the texture.
 *
 * @example
 * ```ts
 * common.writeChannels(material, {
 *   r: { source: roughnessMap, from: 'r' },
 *   g: { source: metalnessMap, from: 'r' },
 *   a: { source: maskMap, from: 'r' },
 * });
 * ```
 */
export function writeChannels(
  texture: TgpuTexture & RenderFlag,
  channels: TextureChannels,
  options?: TextureWriteOptions,
): void {
  if (!texture.usableAsRender) {
    throw new Error(
      "writeChannels requires 'render' usage. Add it via the $usage('render') method.",
    );
  }

  for (const key of Object.keys(channels)) {
    if (!isTextureChannel(key)) {
      throw new Error('Texture channel writes only support single channels: r, g, b, a.');
    }
  }

  const writes: TextureChannelWriteLayout[] = [];

  for (const to of TEXTURE_CHANNELS) {
    const entry = channels[to];
    if (!entry) {
      continue;
    }

    const { source, from } = entry;

    if (!isTextureChannel(from)) {
      throw new Error(`Invalid source channel '${from}'. Expected one of r, g, b, a.`);
    }

    const write: TextureImageWrite = { ...options, source };
    const normalized = normalizeImageWrite(write);
    validateResizeAllowed(write, normalized);
    writes.push({ ...normalized, from, to });
  }

  writeTextureChannels(
    texture[$internal].device,
    texture[$internal].unwrap(),
    { mipLevel: options?.mipLevel ?? 0, arrayLayer: options?.origin?.[2] ?? 0 },
    writes,
  );
}

export namespace writeChannels {
  export type Channels = TextureChannels;
  export type Source = TextureChannelSource;
}
