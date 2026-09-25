import type { TgpuRoot } from 'typegpu';

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load texture: ${url}`);
  }
  return await createImageBitmap(await response.blob());
}

export async function loadTexture(root: TgpuRoot, url: string) {
  const bitmap = await loadBitmap(url);

  const texture = root
    .createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      dimension: '2d',
    })
    .$usage('sampled', 'render');

  texture.write(bitmap);

  return texture;
}

export async function loadTextureArray(root: TgpuRoot, urls: string[], size: number) {
  const bitmaps = await Promise.all(urls.map(loadBitmap));

  const texture = root
    .createTexture({
      size: [size, size, bitmaps.length],
      format: 'rgba8unorm',
      dimension: '2d',
    })
    .$usage('sampled', 'render');

  texture.write(bitmaps);

  const aspects = bitmaps.map((b) => b.width / b.height);

  return { texture, aspects };
}
