import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

// #region Example controls and cleanup

export const controls = {
  'One argument': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(321));
      })(),
  },
  'Multiple arguments': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(1), d.vec3u(2, 3, 4), d.u32(5), d.u32(6));
      })(),
  },
  'String literals': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(2), 'plus', d.u32(3), 'equals', d.u32(5));
      })(),
  },
  'Two logs': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log('First log.');
        console.log('Second log.');
      })(),
  },
  'Two threads': {
    onButtonClick: () =>
      prepareDispatch(root, (x) => {
        'kernel';
        console.log('Log from thread', x);
      })(2),
  },
  '100 dispatches': {
    onButtonClick: async () => {
      const indexUniform = root.createUniform(d.u32);
      const dispatch = prepareDispatch(root, () => {
        'kernel';
        console.log('Log from dispatch', indexUniform.$);
      });
      for (var i = 0; i < 100; i++) {
        indexUniform.write(i);
        dispatch();
        console.log(`[CPU] dispatched ${i}`);
      }
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
