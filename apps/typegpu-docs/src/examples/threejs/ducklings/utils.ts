import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { waterMaxHeight } from './consts';


// initial height values - simplex noise
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