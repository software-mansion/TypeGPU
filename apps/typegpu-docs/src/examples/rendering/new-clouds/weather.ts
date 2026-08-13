import { type TgpuRoot } from 'typegpu';

const WEATHER_TEXTURE_SIZE = 512;

export function precomputeWeatherTexture(root: TgpuRoot) {
  const texture = root
    .createTexture({
      size: [WEATHER_TEXTURE_SIZE, WEATHER_TEXTURE_SIZE],
      format: 'rgba8unorm',
    })
    .$usage('sampled');

  const pixels = new Uint8Array(WEATHER_TEXTURE_SIZE * WEATHER_TEXTURE_SIZE * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255;
    pixels[i + 1] = 0;
    pixels[i + 2] = 255;
    pixels[i + 3] = 255;
  }

  texture.write(pixels);
  return texture;
}
