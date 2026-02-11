const SPRITE_SIZE = 384;
const FRUIT_COUNT = 10;
const MAX_DIST = SPRITE_SIZE / 2;

async function loadImage(path: string): Promise<ImageBitmap> {
  const response = await fetch(path);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function drawFruitSlice(
  level: number,
  ctx: CanvasRenderingContext2D,
  sourceA: ImageBitmap,
  sourceB: ImageBitmap,
  dstX: number,
  dstY: number,
) {
  const source = level < 8 ? sourceA : sourceB;
  const localIndex = level < 8 ? level : level - 8;
  ctx.drawImage(
    source,
    localIndex * SPRITE_SIZE,
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

  // Alpha mask: 1 = inside shape
  const inside = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    inside[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  }

  // Initialize seeds at boundary pixels (4-connected)
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

  // JFA iterations
  let offset = Math.floor(Math.max(width, height) / 2);
  while (offset >= 1) {
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
            if (dx === 0 && dy === 0) continue;
            const sx = x + dx * offset;
            const sy = y + dy * offset;
            if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

            const sIdx = sy * width + sx;
            if (readX[sIdx] < 0) continue;

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

    offset = Math.floor(offset / 2);
  }

  // Signed distance: negative inside, positive outside
  const sdf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const dist = seedX[i] >= 0 ? Math.hypot(x - seedX[i], y - seedY[i]) : width;
    sdf[i] = inside[i] ? -dist : dist;
  }

  return sdf;
}

export async function createAtlases(): Promise<{
  spriteAtlas: ImageBitmap;
  sdfAtlas: ImageBitmap;
  /** Boundary points per level, normalized to [-1, 1] relative to sprite center. */
  contours: Float32Array[];
}> {
  const [fruits1, fruits2] = await Promise.all([
    loadImage('./assets/suika-sdf/fruits.png'),
    loadImage('./assets/suika-sdf/fruits2.png'),
  ]);

  // Build sprite atlas (vertical stack, 384 × 3840)
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = SPRITE_SIZE;
  spriteCanvas.height = SPRITE_SIZE * FRUIT_COUNT;
  const spriteCtx = spriteCanvas.getContext('2d')!;

  for (let i = 0; i < FRUIT_COUNT; i++) {
    drawFruitSlice(i, spriteCtx, fruits1, fruits2, 0, i * SPRITE_SIZE);
  }

  // Extract each sprite and compute SDF
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = SPRITE_SIZE;
  tmpCanvas.height = SPRITE_SIZE;
  const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true })!;

  const sdfImageData = new ImageData(SPRITE_SIZE, SPRITE_SIZE * FRUIT_COUNT);
  const pixels = sdfImageData.data;
  const contours: Float32Array[] = [];
  const center = SPRITE_SIZE / 2;

  for (let level = 0; level < FRUIT_COUNT; level++) {
    tmpCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    drawFruitSlice(level, tmpCtx, fruits1, fruits2, 0, 0);

    const imgData = tmpCtx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Extract boundary points (opaque pixels with a transparent neighbor)
    const alpha = imgData.data;
    const pts: number[] = [];
    for (let y = 0; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const idx = y * SPRITE_SIZE + x;
        if (alpha[idx * 4 + 3] <= 128) continue;
        const hasTransparentNeighbor =
          (x > 0 && alpha[(idx - 1) * 4 + 3] <= 128) ||
          (x < SPRITE_SIZE - 1 && alpha[(idx + 1) * 4 + 3] <= 128) ||
          (y > 0 && alpha[(idx - SPRITE_SIZE) * 4 + 3] <= 128) ||
          (y < SPRITE_SIZE - 1 && alpha[(idx + SPRITE_SIZE) * 4 + 3] <= 128);
        if (hasTransparentNeighbor) {
          pts.push((x - center) / center, -(y - center) / center);
        }
      }
    }
    contours.push(new Float32Array(pts));

    const sdf = computeJfaSdf(imgData.data, SPRITE_SIZE, SPRITE_SIZE);

    spriteCtx.putImageData(imgData, 0, level * SPRITE_SIZE);

    const baseIdx = level * SPRITE_SIZE * SPRITE_SIZE;
    for (let j = 0; j < SPRITE_SIZE * SPRITE_SIZE; j++) {
      const normalized = Math.max(
        0,
        Math.min(1, (sdf[j] / MAX_DIST + 1) * 0.5),
      );
      const byte = Math.round(normalized * 255);
      const idx = (baseIdx + j) * 4;
      pixels[idx] = byte;
      pixels[idx + 1] = byte;
      pixels[idx + 2] = byte;
      pixels[idx + 3] = 255;
    }
  }

  const [spriteAtlas, sdfAtlas] = await Promise.all([
    createImageBitmap(spriteCanvas),
    createImageBitmap(sdfImageData),
  ]);

  return { spriteAtlas, sdfAtlas, contours };
}
