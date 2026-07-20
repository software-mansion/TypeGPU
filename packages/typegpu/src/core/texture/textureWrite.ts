export type TextureWriteOptions = {
  mipLevel?: GPUIntegerCoordinate;
  origin?: readonly [x: number, y: number, z?: number];
  size?: readonly [width: number, height: number];
  sourceOrigin?: readonly [x: number, y: number];
  sourceSize?: readonly [width: number, height: number];
  resize?: boolean;
  filter?: GPUFilterMode;
  flipY?: boolean;
  premultipliedAlpha?: boolean;
  colorSpace?: PredefinedColorSpace;
};

export type TextureImageWrite = TextureWriteOptions & {
  source: GPUCopyExternalImageSource;
};

export type TextureBlobWrite = Omit<TextureWriteOptions, 'sourceOrigin' | 'sourceSize'> & {
  source: Blob;
};

export type TextureChannel = 'r' | 'g' | 'b' | 'a';

export type TextureResizeOptions = Pick<
  TextureWriteOptions,
  'resize' | 'filter' | 'flipY' | 'premultipliedAlpha' | 'colorSpace'
>;

export type TextureRawWriteOptions = {
  mipLevel?: GPUIntegerCoordinate;
  origin?: readonly [x: number, y: number, z?: number];
  size?: readonly [width: number, height: number, depthOrArrayLayers?: number];
};

export type TextureCopyOptions = {
  sourceMipLevel?: GPUIntegerCoordinate;
  mipLevel?: GPUIntegerCoordinate;
  sourceOrigin?: readonly [x: number, y: number, z?: number];
  origin?: readonly [x: number, y: number, z?: number];
  size?: readonly [width: number, height: number, depthOrArrayLayers?: number];
};

export type TextureImageWriteLayout = {
  source: GPUCopyExternalImageSource;
  sourceOrigin: { x: number; y: number };
  sourceSize: { width: number; height: number };
  targetOrigin: { x: number; y: number; z: number };
  targetSize: { width: number; height: number; depthOrArrayLayers: number };
  mipLevel: number;
  filter?: GPUFilterMode;
  flipY?: boolean;
  premultipliedAlpha?: boolean;
  colorSpace?: PredefinedColorSpace;
};

export type TextureChannelWriteLayout = TextureImageWriteLayout & {
  from: TextureChannel;
  to: TextureChannel;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasSource(value: unknown): value is { source: unknown } {
  return isRecord(value) && 'source' in value;
}

export function isTextureImageWrite(value: unknown): value is TextureImageWrite {
  return hasSource(value);
}

export function textureLayerSize(size: readonly number[]): readonly [number, number] {
  return [size[0] ?? 1, size[1] ?? 1];
}

export function mipLevelSize(
  size: readonly number[],
  mipLevel: number,
  dimension: GPUTextureDimension,
): [number, number, number] {
  const scale = (value: number) => Math.max(1, value >> mipLevel);
  return [
    scale(size[0] ?? 1),
    scale(size[1] ?? 1),
    dimension === '3d' ? scale(size[2] ?? 1) : (size[2] ?? 1),
  ];
}

export function imageWriteForLayer(
  source: GPUCopyExternalImageSource,
  textureSize: readonly number[],
  layer: number,
  options: TextureResizeOptions,
): TextureImageWrite {
  return {
    source,
    size: textureLayerSize(textureSize),
    origin: [0, 0, layer],
    ...options,
  };
}

export function getImageSourceDimensions(source: GPUCopyExternalImageSource): {
  width: number;
  height: number;
} {
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    throw new Error('Blob sources are only supported in texture.writeAsync(...).');
  }

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
  const sourceOrigin = { x: write.sourceOrigin?.[0] ?? 0, y: write.sourceOrigin?.[1] ?? 0 };
  const sourceDimensions = getImageSourceDimensions(write.source);
  const sourceSize = {
    width: write.sourceSize?.[0] ?? sourceDimensions.width - sourceOrigin.x,
    height: write.sourceSize?.[1] ?? sourceDimensions.height - sourceOrigin.y,
  };
  const targetSize = {
    width: write.size?.[0] ?? sourceSize.width,
    height: write.size?.[1] ?? sourceSize.height,
    depthOrArrayLayers: 1,
  };

  return {
    source: write.source,
    sourceOrigin,
    sourceSize,
    targetOrigin: {
      x: write.origin?.[0] ?? 0,
      y: write.origin?.[1] ?? 0,
      z: write.origin?.[2] ?? 0,
    },
    targetSize,
    mipLevel: write.mipLevel ?? 0,
    ...(write.filter !== undefined && { filter: write.filter }),
    ...(write.flipY !== undefined && { flipY: write.flipY }),
    ...(write.premultipliedAlpha !== undefined && {
      premultipliedAlpha: write.premultipliedAlpha,
    }),
    ...(write.colorSpace !== undefined && { colorSpace: write.colorSpace }),
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

export async function createBitmapForBlobWrite(write: TextureBlobWrite): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Texture writeAsync requires createImageBitmap to be available.');
  }

  const bitmapOptions =
    write.resize && write.size
      ? {
          resizeWidth: write.size[0],
          resizeHeight: write.size[1],
          resizeQuality: (write.filter === 'nearest' ? 'pixelated' : 'high') as ResizeQuality,
        }
      : undefined;

  return createImageBitmap(write.source, bitmapOptions);
}
