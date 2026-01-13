import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { waterMaxHeight, WIDTH } from './consts.ts';

const simplex = new SimplexNoise();

export function noise(x: number, y: number): number {
  // yeah dude more magic numbers
  let multR = waterMaxHeight;
  let mult = 0.025;
  let r = 0;
  for (let i = 0; i < 15; i++) {
    r += multR * simplex.noise(x * mult, y * mult);
    multR *= 0.53 + 0.025 * i;
    mult *= 1.25;
  }
  return r;
}

export function initializeHeightArrays(): {
  heightArray: Float32Array;
  prevHeightArray: Float32Array;
} {
  const heightArray = new Float32Array(WIDTH * WIDTH);
  const prevHeightArray = new Float32Array(WIDTH * WIDTH);

  let p = 0;
  for (let j = 0; j < WIDTH; j++) {
    for (let i = 0; i < WIDTH; i++) {
      const x = (i * 128) / WIDTH;
      const y = (j * 128) / WIDTH;
      const height = noise(x, y);
      heightArray[p] = height;
      prevHeightArray[p] = height;
      p++;
    }
  }

  return { heightArray, prevHeightArray };
}
