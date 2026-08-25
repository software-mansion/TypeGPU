import type { SampledFlag, TgpuRoot, TgpuTexture } from 'typegpu';

const PERCENTAGE_WIDTH = 256 * 2;
const PERCENTAGE_HEIGHT = 256 * 2;
const PERCENTAGE_COUNT = 101; // 0% to 100%

export class NumberProvider {
  digitTextureAtlas: TgpuTexture<{
    size: [typeof PERCENTAGE_WIDTH, typeof PERCENTAGE_HEIGHT, typeof PERCENTAGE_COUNT];
    format: 'rgba8unorm';
  }> &
    SampledFlag;

  constructor(root: TgpuRoot) {
    this.digitTextureAtlas = root
      .createTexture({
        size: [PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT, PERCENTAGE_COUNT],
        format: 'rgba8unorm',
      })
      .$usage('sampled', 'render');
  }

  async fillAtlas() {
    const img = new Image();
    img.src = '/TypeGPU/assets/jelly-slider/logomark.png';
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = PERCENTAGE_WIDTH;
    canvas.height = PERCENTAGE_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    const scale = Math.min(PERCENTAGE_WIDTH / img.width, PERCENTAGE_HEIGHT / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (PERCENTAGE_WIDTH - w) / 2, (PERCENTAGE_HEIGHT - h) / 2, w, h);

    const bitmap = await createImageBitmap(canvas);
    const images = Array.from({ length: PERCENTAGE_COUNT }, () => bitmap);

    this.digitTextureAtlas.write(images);
  }
}
