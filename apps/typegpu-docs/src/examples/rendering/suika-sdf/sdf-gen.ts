import { LEVEL_COUNT } from './constants.ts';

export const SPRITE_SIZE = 384;
const MAX_DIST = SPRITE_SIZE / 2;

async function loadImage(path: string): Promise<ImageBitmap> {
  const response = await fetch(path);
  return createImageBitmap(await response.blob());
}

function drawFruitSlice(
  level: number,
  ctx: OffscreenCanvasRenderingContext2D,
  source: ImageBitmap,
  dstX: number,
  dstY: number,
) {
  ctx.drawImage(
    source,
    level * SPRITE_SIZE,
    0,
    SPRITE_SIZE,
    SPRITE_SIZE,
    dstX,
    dstY,
    SPRITE_SIZE,
    SPRITE_SIZE,
  );
}

function computeJfaSdf(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const size = width * height;
  const maxDim = Math.max(width, height);

  const inside = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    inside[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  }

  const seedX = new Float32Array(size).fill(-1);
  const seedY = new Float32Array(size).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = inside[idx];
      if (
        (x > 0 && inside[idx - 1] !== val) ||
        (x < width - 1 && inside[idx + 1] !== val) ||
        (y > 0 && inside[idx - width] !== val) ||
        (y < height - 1 && inside[idx + width] !== val)
      ) {
        seedX[idx] = x;
        seedY[idx] = y;
      }
    }
  }

  // JFA passes
  for (
    let offset = Math.floor(maxDim / 2);
    offset >= 1;
    offset = Math.floor(offset / 2)
  ) {
    const readX = seedX.slice();
    const readY = seedY.slice();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        let bestDist = seedX[idx] >= 0
          ? Math.hypot(x - seedX[idx], y - seedY[idx])
          : Infinity;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const sx = x + dx * offset;
            const sy = y + dy * offset;
            if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
              continue;
            }

            const sIdx = sy * width + sx;
            if (readX[sIdx] < 0) {
              continue;
            }

            const dist = Math.hypot(x - readX[sIdx], y - readY[sIdx]);
            if (dist < bestDist) {
              bestDist = dist;
              seedX[idx] = readX[sIdx];
              seedY[idx] = readY[sIdx];
            }
          }
        }
      }
    }
  }

  const sdf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const dist = seedX[i] >= 0
      ? Math.hypot(x - seedX[i], y - seedY[i])
      : maxDim;
    sdf[i] = inside[i] ? -dist : dist;
  }

  return sdf;
}

export async function createAtlases(): Promise<{
  spriteAtlas: ImageBitmap[];
  sdfAtlas: ImageBitmap[];
  /** Boundary points per level, normalized to [-1, 1] relative to sprite center. */
  contours: Float32Array[];
}> {
  const fruits = await loadImage('./assets/suika-sdf/fruits.png');

  const tmpCanvas = new OffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
  const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
  if (!tmpCtx) {
    throw new Error('Failed to create canvas context');
  }

  const spriteAtlas: ImageBitmap[] = [];
  const sdfAtlas: ImageBitmap[] = [];
  const contours: Float32Array[] = [];
  const halfSize = SPRITE_SIZE / 2;

  for (let level = 0; level < LEVEL_COUNT; level++) {
    tmpCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    drawFruitSlice(level, tmpCtx, fruits, 0, 0);
    spriteAtlas.push(await createImageBitmap(tmpCanvas));

    const imgData = tmpCtx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    const alpha = imgData.data;

    const pts: number[] = [];
    for (let y = 0; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const idx = y * SPRITE_SIZE + x;
        if (alpha[idx * 4 + 3] <= 128) {
          continue;
        }
        const isBoundary = (x > 0 && alpha[(idx - 1) * 4 + 3] <= 128) ||
          (x < SPRITE_SIZE - 1 && alpha[(idx + 1) * 4 + 3] <= 128) ||
          (y > 0 && alpha[(idx - SPRITE_SIZE) * 4 + 3] <= 128) ||
          (y < SPRITE_SIZE - 1 && alpha[(idx + SPRITE_SIZE) * 4 + 3] <= 128);
        if (isBoundary) {
          pts.push((x - halfSize) / halfSize, -(y - halfSize) / halfSize);
        }
      }
    }
    contours.push(new Float32Array(pts));

    const sdf = computeJfaSdf(imgData.data, SPRITE_SIZE, SPRITE_SIZE);
    const levelSdfData = new ImageData(SPRITE_SIZE, SPRITE_SIZE);
    for (let j = 0; j < SPRITE_SIZE * SPRITE_SIZE; j++) {
      const byte = Math.round(
        Math.max(0, Math.min(1, (sdf[j] / MAX_DIST + 1) * 0.5)) * 255,
      );
      const idx = j * 4;
      levelSdfData.data[idx] = byte;
      levelSdfData.data[idx + 1] = byte;
      levelSdfData.data[idx + 2] = byte;
      levelSdfData.data[idx + 3] = 255;
    }
    sdfAtlas.push(await createImageBitmap(levelSdfData));
  }

  return { spriteAtlas, sdfAtlas, contours };
}
