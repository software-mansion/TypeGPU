let IDX = 256;
const HEX: string[] = [];
let BUFFER: number[];
while (IDX--) HEX[IDX] = (IDX + 256).toString(16).substring(1);

/**
 * Source: https://github.com/lukeed/uuid/blob/master/src/index.js
 */
export function v4() {
  let i = 0;
  let num: number;
  let out = '';

  if (!BUFFER || ((IDX + 16) > 256)) {
    i = 256;
    BUFFER = Array(i);
    while (i--) BUFFER[i] = 256 * Math.random() | 0;
    i = IDX = 0;
  }

  for (; i < 16; i++) {
    num = BUFFER[IDX + i] as number;
    if (i === 6) out += HEX[num & 15 | 64];
    else if (i === 8) out += HEX[num & 63 | 128];
    else out += HEX[num];

    if (i & 1 && i > 1 && i < 11) out += '-';
  }

  IDX++;
  return out;
}
