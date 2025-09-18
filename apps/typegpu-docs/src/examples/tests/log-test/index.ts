import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init({
  unstable_logOptions: {
    logCountLimit: 32,
    logSizeLimit: 32,
  },
});

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
  'Different types': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.bool(true));
        console.log(d.u32(3_000_000_000));
        console.log(d.vec2u(1, 2));
        console.log(d.vec3u(1, 2, 3));
        console.log(d.vec4u(1, 2, 3, 4));
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
      for (let i = 0; i < 100; i++) {
        indexUniform.write(i);
        dispatch();
        console.log(`dispatched ${i}`);
      }
    },
  },
  'Varying size logs': {
    onButtonClick: async () => {
      const logCountUniform = root.createUniform(d.u32);
      const dispatch = prepareDispatch(root, () => {
        'kernel';
        for (let i = d.u32(); i < logCountUniform.$; i++) {
          console.log('Log index', d.u32(i) + 1, 'out of', logCountUniform.$);
        }
      });
      logCountUniform.write(3);
      dispatch();
      logCountUniform.write(1);
      dispatch();
    },
  },
  'Render pipeline': {
    onButtonClick: () => {
      const mainVertex = tgpu['~unstable'].vertexFn({
        in: { vertexIndex: d.builtin.vertexIndex },
        out: { pos: d.builtin.position },
      })((input) => {
        const positions = [
          d.vec2f(0, 0.5),
          d.vec2f(-0.5, -0.5),
          d.vec2f(0.5, -0.5),
        ];

        return { pos: d.vec4f(positions[input.vertexIndex], 0, 1) };
      });

      const mainFragment = tgpu['~unstable'].fragmentFn({
        in: { pos: d.builtin.position },
        out: d.vec4f,
      })(({ pos }) => {
        console.log('X:', d.u32(pos.x), 'Y:', d.u32(pos.y));
        return d.vec4f(0.769, 0.392, 1.0, 1);
      });

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const context = canvas.getContext('webgpu') as GPUCanvasContext;

      context.configure({
        device: root.device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });

      const pipeline = root['~unstable']
        .withVertex(mainVertex, {})
        .withFragment(mainFragment, { format: presentationFormat })
        .createPipeline();

      pipeline
        .withColorAttachment({
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        })
        .draw(3);
    },
  },
  'Too many logs': {
    onButtonClick: () =>
      prepareDispatch(root, (x) => {
        'kernel';
        console.log('Log 1 from thread', x);
        console.log('Log 2 from thread', x);
        console.log('Log 3 from thread', x);
      })(16),
  },
  'Too much data': {
    onButtonClick: () => {
      const dispatch = prepareDispatch(root, () => {
        'kernel';
        console.log(d.vec3u(), d.vec3u(), d.vec3u());
      });
      try {
        dispatch();
      } catch (err) {
        console.log(err);
      }
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
