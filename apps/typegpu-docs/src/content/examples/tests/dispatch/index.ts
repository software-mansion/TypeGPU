import { dispatch2d } from '@typegpu/dispatch';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

async function runTests() {
  const mutable = root.createMutable(d.arrayOf(d.arrayOf(d.vec2u, 4), 2));
  dispatch2d(root, [2, 4], (x, y) => {
    'kernel';
    mutable.$[x][y] = d.vec2u(x, y);
  });
  const filled = await mutable.read();
  console.log(filled);
}

// #region Example controls and cleanup

export const controls = {
  'Run tests': {
    async onButtonClick() {
      runTests();
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
