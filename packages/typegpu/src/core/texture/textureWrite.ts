import type { TextureProps } from './textureProps.ts';

export type TextureWriteFit = 'stretch' | 'clip';

export type TextureWriteOptions = {
  mipLevel?: GPUIntegerCoordinate;
  origin?: readonly [x: number, y: number, z?: number];
  size?: readonly [width: number, height: number];
  sourceOrigin?: readonly [x: number, y: number];
  sourceSize?: readonly [width: number, height: number];
  fit?: TextureWriteFit;
  filter?: GPUFilterMode;
  flipY?: boolean;
  premultipliedAlpha?: boolean;
  colorSpace?: PredefinedColorSpace;
};

export type TextureBlobWriteOptions = Omit<TextureWriteOptions, 'sourceOrigin' | 'sourceSize'>;

export type TextureChannel = 'r' | 'g' | 'b' | 'a';

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

/** An image write resolved against a texture, with `fit` already applied */
export type ImageWrite = {
  source: GPUCopyExternalImageSource;
  sourceOrigin: { x: number; y: number };
  sourceSize: [width: number, height: number];
  origin: { x: number; y: number; z: number };
  size: [width: number, height: number];
  mipLevel: number;
  options: TextureWriteOptions;
  channel?: { from: TextureChannel; to: TextureChannel };
};

type TextureShape = Pick<TextureProps, 'size' | 'dimension'>;

export function origin3d([x = 0, y = 0, z = 0]: readonly (number | undefined)[] = []): {
  x: number;
  y: number;
  z: number;
} {
  return { x, y, z };
}

export function mipLevelSize(
  { size, dimension }: TextureShape,
  mipLevel: number,
): [number, number, number] {
  const scale = (value = 1) => Math.max(1, value >> mipLevel);
  return [scale(size[0]), scale(size[1]), dimension === '3d' ? scale(size[2]) : (size[2] ?? 1)];
}

/** The size of the written region: `size`, or the rest of the mip level past `origin` */
export function writeRegionSize(
  texture: TextureShape,
  options: TextureWriteOptions,
): [number, number] {
  const [mipWidth, mipHeight] = mipLevelSize(texture, options.mipLevel ?? 0);
  const [x = 0, y = 0] = options.origin ?? [];
  const [width = mipWidth - x, height = mipHeight - y] = options.size ?? [];
  return [width, height];
}

function imageSize(source: GPUCopyExternalImageSource): [number, number] {
  const { videoWidth, videoHeight } = source as HTMLVideoElement;
  if (videoWidth && videoHeight) {
    return [videoWidth, videoHeight];
  }

  const { naturalWidth, naturalHeight } = source as HTMLImageElement;
  if (naturalWidth && naturalHeight) {
    return [naturalWidth, naturalHeight];
  }

  const { codedWidth, codedHeight } = source as VideoFrame;
  if (codedWidth && codedHeight) {
    return [codedWidth, codedHeight];
  }

  const { width, height } = source as ImageBitmap;
  if (width && height) {
    return [width, height];
  }

  throw new Error('Cannot determine dimensions of the provided image source.');
}

export function sameSize(a: readonly number[], b: readonly number[]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function resolveImageWrite(
  texture: TextureShape,
  source: GPUCopyExternalImageSource,
  options: TextureWriteOptions,
  layer = options.origin?.[2] ?? 0,
): ImageWrite {
  const [x = 0, y = 0] = options.origin ?? [];
  const [sourceX = 0, sourceY = 0] = options.sourceOrigin ?? [];
  const [imageWidth, imageHeight] = imageSize(source);
  const [sourceWidth = imageWidth - sourceX, sourceHeight = imageHeight - sourceY] =
    options.sourceSize ?? [];
  let sourceSize: [number, number] = [sourceWidth, sourceHeight];
  let size = writeRegionSize(texture, options);

  if (options.fit === 'clip') {
    sourceSize = size = [Math.min(sourceSize[0], size[0]), Math.min(sourceSize[1], size[1])];
  } else if (options.fit !== 'stretch' && !sameSize(sourceSize, size)) {
    throw new Error(
      `Texture write source size ${sourceSize.join('x')} does not match target size ${size.join('x')}. Pass fit: 'stretch' to scale the source or fit: 'clip' to copy the overlapping region.`,
    );
  }

  return {
    source,
    sourceOrigin: { x: sourceX, y: sourceY },
    sourceSize,
    origin: { x, y, z: layer },
    size,
    mipLevel: options.mipLevel ?? 0,
    options,
  };
}
