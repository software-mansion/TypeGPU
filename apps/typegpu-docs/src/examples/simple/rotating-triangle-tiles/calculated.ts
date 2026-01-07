import { SCALE, USER_SCALE } from './consts.ts';

const zeroXOffset = Math.sqrt(3) * SCALE * USER_SCALE - 1;
console.log({ offsetX: zeroXOffset });

const zeroYOffset = 1 * (1 - USER_SCALE);

export { zeroXOffset, zeroYOffset };
