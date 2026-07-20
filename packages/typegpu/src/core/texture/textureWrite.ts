type TextureSourceSize = readonly [number, number] | Pick<GPUExtent3DDict, 'width' | 'height'>;

export type TextureWriteOptions = {
  mipLevel?: GPUIntegerCoordinate;
  origin?: GPUOrigin3D;
  size?: GPUExtent3D;
  sourceOrigin?: GPUOrigin2D;
  sourceSize?: TextureSourceSize;
  resize?: boolean;
  filter?: GPUFilterMode;
  flipY?: boolean;
};

export type TextureImageWrite = TextureWriteOptions & {
  source: GPUCopyExternalImageSource;
};

export type TextureBlobWrite = Omit<TextureWriteOptions, 'sourceOrigin' | 'sourceSize'> & {
  source: Blob;
};

export type TextureChannel = 'r' | 'g' | 'b' | 'a';

type TextureChannelWriteSource =
  | GPUCopyExternalImageSource
  | { source: GPUCopyExternalImageSource; from?: TextureChannel };

export type TextureChannelWrite = TextureWriteOptions & {
  channels: Partial<Record<TextureChannel, TextureChannelWriteSource>>;
};

export type TextureResizeOptions = Pick<TextureWriteOptions, 'resize' | 'filter'>;

export type TextureImageWriteLayout = {
  source: GPUCopyExternalImageSource;
  sourceOrigin: { x: number; y: number };
  sourceSize: { width: number; height: number };
  targetOrigin: { x: number; y: number; z: number };
  targetSize: { width: number; height: number; depthOrArrayLayers: number };
  mipLevel: number;
  filter?: GPUFilterMode;
  flipY?: boolean;
};

export type TextureChannelWriteLayout = TextureImageWriteLayout & {
  from: TextureChannel;
  to: TextureChannel;
};

export type TextureChannelWriteEntry = {
  from: TextureChannel;
  to: TextureChannel;
  write: TextureImageWrite;
};

const TEXTURE_CHANNELS = ['r', 'g', 'b', 'a'] as const satisfies readonly TextureChannel[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasSource(value: unknown): value is { source: unknown } {
  return isRecord(value) && 'source' in value;
}

function isIterable(value: unknown): value is Iterable<number> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

function isTextureChannel(value: string): value is TextureChannel {
  return (TEXTURE_CHANNELS as readonly string[]).includes(value);
}

function isChannelWriteImage(
  value: TextureChannelWriteSource,
): value is { source: GPUCopyExternalImageSource; from?: TextureChannel } {
  return hasSource(value);
}

function origin2(value: TextureWriteOptions['sourceOrigin']): { x: number; y: number } {
  if (isIterable(value)) {
    const [x = 0, y = 0] = value;
    return { x, y };
  }

  return { x: value?.x ?? 0, y: value?.y ?? 0 };
}

function origin3(value: TextureWriteOptions['origin']): { x: number; y: number; z: number } {
  if (isIterable(value)) {
    const [x = 0, y = 0, z = 0] = value;
    return { x, y, z };
  }

  return { x: value?.x ?? 0, y: value?.y ?? 0, z: value?.z ?? 0 };
}

function size2(
  value: TextureWriteOptions['sourceSize'],
  fallback: { width: number; height: number },
): { width: number; height: number } {
  if (isIterable(value)) {
    const [width = fallback.width, height = fallback.height] = value;
    return { width, height };
  }

  return { width: value?.width ?? fallback.width, height: value?.height ?? fallback.height };
}

function size3(
  value: TextureWriteOptions['size'],
  fallback: { width: number; height: number; depthOrArrayLayers: number },
): { width: number; height: number; depthOrArrayLayers: number } {
  if (isIterable(value)) {
    const [
      width = fallback.width,
      height = fallback.height,
      depthOrArrayLayers = fallback.depthOrArrayLayers,
    ] = value;
    return {
      width,
      height,
      depthOrArrayLayers,
    };
  }

  return {
    width: value?.width ?? fallback.width,
    height: value?.height ?? fallback.height,
    depthOrArrayLayers: value?.depthOrArrayLayers ?? fallback.depthOrArrayLayers,
  };
}

export function isTextureImageWrite(value: unknown): value is TextureImageWrite {
  return hasSource(value);
}

export function isTextureChannelWrite(value: unknown): value is TextureChannelWrite {
  return isRecord(value) && 'channels' in value;
}

export function textureLayerSize(size: readonly number[]): [number, number, number] {
  return [size[0] ?? 1, size[1] ?? 1, 1];
}

export function imageWriteForLayer(
  source: GPUCopyExternalImageSource,
  textureSize: readonly number[],
  layer: number | undefined,
  options: TextureResizeOptions,
): TextureImageWrite {
  return {
    source,
    size: textureLayerSize(textureSize),
    ...(layer !== undefined && { origin: [0, 0, layer] as const }),
    ...options,
  };
}

export function getImageSourceDimensions(source: GPUCopyExternalImageSource): {
  width: number;
  height: number;
} {
  const { videoWidth, videoHeight } = source as HTMLVideoElement;
  if (videoWidth && videoHeight) {
    return { width: videoWidth, height: videoHeight };
  }

  const { naturalWidth, naturalHeight } = source as HTMLImageElement;
  if (naturalWidth && naturalHeight) {
    return { width: naturalWidth, height: naturalHeight };
  }

  const { codedWidth, codedHeight } = source as VideoFrame;
  if (codedWidth && codedHeight) {
    return { width: codedWidth, height: codedHeight };
  }

  const { width, height } = source as ImageBitmap;
  if (width && height) {
    return { width, height };
  }

  throw new Error('Cannot determine dimensions of the provided image source.');
}

export function normalizeImageWrite(write: TextureImageWrite): TextureImageWriteLayout {
  const sourceOrigin = origin2(write.sourceOrigin);
  const sourceDimensions = getImageSourceDimensions(write.source);
  const sourceSize = size2(write.sourceSize, {
    width: sourceDimensions.width - sourceOrigin.x,
    height: sourceDimensions.height - sourceOrigin.y,
  });
  const targetSize = size3(write.size, {
    width: sourceSize.width,
    height: sourceSize.height,
    depthOrArrayLayers: 1,
  });

  if (targetSize.depthOrArrayLayers !== 1) {
    throw new Error('Texture image writes can only write one layer at a time.');
  }

  return {
    source: write.source,
    sourceOrigin,
    sourceSize,
    targetOrigin: origin3(write.origin),
    targetSize,
    mipLevel: write.mipLevel ?? 0,
    ...(write.filter !== undefined && { filter: write.filter }),
    ...(write.flipY !== undefined && { flipY: write.flipY }),
  };
}

export function needsResize(write: TextureImageWriteLayout): boolean {
  return (
    write.sourceSize.width !== write.targetSize.width ||
    write.sourceSize.height !== write.targetSize.height
  );
}

export function validateResizeAllowed(
  write: TextureImageWrite,
  normalized: TextureImageWriteLayout,
): void {
  if (needsResize(normalized) && !write.resize) {
    throw new Error(
      `Texture write source size ${normalized.sourceSize.width}x${normalized.sourceSize.height} does not match target size ${normalized.targetSize.width}x${normalized.targetSize.height}. Pass resize: true to resize explicitly.`,
    );
  }
}

function channelImageWrite(
  write: TextureChannelWrite,
  source: GPUCopyExternalImageSource,
): TextureImageWrite {
  const { channels: _channels, ...options } = write;
  return { ...options, source };
}

export function expandChannelWrites(write: TextureChannelWrite): TextureChannelWriteEntry[] {
  for (const key of Object.keys(write.channels)) {
    if (!isTextureChannel(key)) {
      throw new Error(`Texture channel writes only support single channels: r, g, b, a.`);
    }
  }

  return TEXTURE_CHANNELS.flatMap((to) => {
    const entry = write.channels[to];
    if (!entry) {
      return [];
    }

    const entryWrite = isChannelWriteImage(entry) ? entry : { source: entry };
    const from = entryWrite.from ?? to;

    if (!isTextureChannel(from)) {
      throw new Error(`Invalid source channel '${from}'. Expected one of r, g, b, a.`);
    }

    return [{ from, to, write: channelImageWrite(write, entryWrite.source) }];
  });
}

export async function createBitmapForBlobWrite(write: TextureBlobWrite): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Texture writeAsync requires createImageBitmap to be available.');
  }

  const resizeTo =
    write.resize && write.size
      ? size3(write.size, { width: 1, height: 1, depthOrArrayLayers: 1 })
      : undefined;
  const bitmapOptions = resizeTo
    ? {
        resizeWidth: resizeTo.width,
        resizeHeight: resizeTo.height,
      }
    : undefined;

  return createImageBitmap(write.source, bitmapOptions);
}
