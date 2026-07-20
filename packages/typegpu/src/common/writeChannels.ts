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

export type TextureChannelSource =
  | GPUCopyExternalImageSource
  | { source: GPUCopyExternalImageSource; from?: TextureChannel };

export type TextureChannels = Partial<Record<TextureChannel, TextureChannelSource>>;

const TEXTURE_CHANNELS = ['r', 'g', 'b', 'a'] as const satisfies readonly TextureChannel[];

function isTextureChannel(value: string): value is TextureChannel {
  return (TEXTURE_CHANNELS as readonly string[]).includes(value);
}

function hasSource(
  value: TextureChannelSource,
): value is { source: GPUCopyExternalImageSource; from?: TextureChannel } {
  return typeof value === 'object' && value !== null && 'source' in value;
}

/** Packs image sources into individual channels of `texture` in a single render pass */
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

    const { source, from = to } = hasSource(entry) ? entry : { source: entry };

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
