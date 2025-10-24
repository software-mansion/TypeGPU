import type { SampledFlag, TgpuRoot, TgpuTexture } from 'typegpu';

const PERCENTAGE_WIDTH = 256 * 2;
const PERCENTAGE_HEIGHT = 128 * 2;
const PERCENTAGE_COUNT = 101; // 0% to 100%

export class NumberProvider {
  digitTextureAtlas:
    & TgpuTexture<{
      size: [
        typeof PERCENTAGE_WIDTH,
        typeof PERCENTAGE_HEIGHT,
        typeof PERCENTAGE_COUNT,
      ];
      format: 'rgba8unorm';
    }>
    & SampledFlag;

  constructor(root: TgpuRoot) {
    this.digitTextureAtlas = root['~unstable'].createTexture({
      size: [PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT, PERCENTAGE_COUNT],
      format: 'rgba8unorm',
    }).$usage('sampled', 'render');

    this.#fillAtlas();
  }

  #fillAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = PERCENTAGE_WIDTH;
    canvas.height = PERCENTAGE_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    ctx.font =
      '160px "SF Mono", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';

    const percentageImages = [];

    for (let i = 0; i <= 100; i++) {
      ctx.clearRect(0, 0, PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT);

      const text = `${i}%`;
      const x = PERCENTAGE_WIDTH - 20;
      const y = PERCENTAGE_HEIGHT / 2;

      ctx.fillText(text, x, y);

      percentageImages.push(
        ctx.getImageData(0, 0, PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT),
      );
    }

    this.digitTextureAtlas.write(percentageImages);
  }
}
