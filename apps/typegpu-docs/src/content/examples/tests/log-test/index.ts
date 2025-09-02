import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

// #region Example controls and cleanup

export const controls = {
  'Single log': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(321));
      })(),
  },
  'Two logs': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(98));
        console.log(d.u32(76));
      })(),
  },
  'Two threads': {
    onButtonClick: () =>
      prepareDispatch(root, (x) => {
        'kernel';
        console.log(x);
      })(2),
  },
  'Multiple arguments': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(1), d.vec3u(2, 3, 4), d.u32(5), d.u32(6));
      })(),
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
