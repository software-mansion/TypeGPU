import type { TgpuTexture } from '../core/texture/texture.ts';
import { writeImages } from '../core/texture/textureUtils.ts';
import {
  type ImageWrite,
  resolveImageWrite,
  type TextureChannel,
  type TextureWriteOptions,
} from '../core/texture/textureWrite.ts';
import type { RenderFlag } from '../core/texture/usageExtension.ts';
import { $internal, $soul } from '../shared/symbols.ts';

export type TextureChannelSource = {
  source: GPUCopyExternalImageSource;
  from: TextureChannel;
};

export type TextureChannels = {
  [Channel in TextureChannel]?: TextureChannelSource | undefined;
};

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
  options: TextureWriteOptions = {},
): void {
  const writes: ImageWrite[] = [];

  for (const to of ['r', 'g', 'b', 'a'] as const) {
    const entry = channels[to];
    if (entry) {
      writes.push({
        ...resolveImageWrite(texture.props, entry.source, options),
        channel: { from: entry.from, to },
      });
    }
  }

  writeImages(texture[$soul].device, texture[$internal].materialize(), writes);
}

export namespace writeChannels {
  export type Channels = TextureChannels;
  export type Source = TextureChannelSource;
}
